import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("live chat with whispers, and a handout just for one player", async ({ page, browser }, testInfo) => {
  test.skip(!testUsers.a.email || !testUsers.b.email, "needs test users A and B");
  test.setTimeout(150_000);
  page.on("dialog", (dialog) => dialog.accept());
  const campaignName = `[test] ${testInfo.project.name} ${Date.now()} chat`;

  await logIn(page, testUsers.a);
  await page.goto("/campaigns/new");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  const campaignPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();

  const playerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const player = await playerContext.newPage();
  try {
    await logIn(player, testUsers.b);
    await player.goto(new URL(link).pathname);
    await player.getByRole("button", { name: "Join campaign" }).click();
    await expect(player.getByRole("heading", { name: campaignName })).toBeVisible();

    // Both open chat and wait until it's live.
    await page.goto(`${campaignPath}/chat`);
    await player.goto(`${campaignPath}/chat`);
    await expect(page.getByTestId("chat-status")).toHaveText("● Live", { timeout: 20_000 });
    await expect(player.getByTestId("chat-status")).toHaveText("● Live", { timeout: 20_000 });

    // A message appears for the other person without reloading.
    await page.getByLabel("Message", { exact: true }).fill("Roll for initiative!");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(player.getByTestId("chat-messages")).toContainText("Roll for initiative!", { timeout: 15_000 });

    // The DM whispers to the player; the player whispers back.
    await page.getByTestId("chat-recipients").click();
    await page.getByRole("checkbox").first().check();
    await page.getByLabel("Message", { exact: true }).fill("You notice a hidden door.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(player.getByTestId("chat-messages")).toContainText("You notice a hidden door.", { timeout: 15_000 });
    await expect(player.getByTestId("chat-messages")).toContainText("Whisper to you");

    await player.getByTestId("chat-recipients").click();
    await player.getByRole("checkbox").first().check();
    await player.getByLabel("Message", { exact: true }).fill("I sneak through it.");
    await player.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("chat-messages")).toContainText("I sneak through it.", { timeout: 15_000 });

    // A handout with an image, shown only to this player.
    await page.goto(`${campaignPath}/handouts`);
    await page.getByText("Share a handout").click();
    const form = page.getByTestId("new-handout");
    await form.getByLabel("Handout title").fill("Torn letter");
    await form.getByLabel("Image or PDF (optional, up to 10 MB)").setInputFiles({ name: "letter.png", mimeType: "image/png", buffer: PNG });
    await form.getByLabel("Only the players I choose").check();
    await form.getByRole("checkbox").first().check();
    await form.getByRole("button", { name: "Share handout" }).click();
    await expect(page.getByTestId("handouts")).toContainText("Torn letter");

    await player.goto(`${campaignPath}/handouts`);
    await expect(player.getByTestId("handouts")).toContainText("Torn letter");
    await expect(player.getByText("Just for you")).toBeVisible();
    await expect(player.getByTestId("handout-image")).toBeVisible();

    // Clean up the handout (removes its file too).
    await page.getByRole("button", { name: "Delete handout" }).click();
    await expect(page.getByText("No handouts yet.")).toBeVisible();
  } finally {
    await playerContext.close();
  }

  await page.goto(`${campaignPath}/settings`);
  await page.getByLabel(`Type “${campaignName}” to confirm`).fill(campaignName);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
});
