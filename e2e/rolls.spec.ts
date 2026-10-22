import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("a DM requests a roll and sees the player's result live", async ({ page, browser }, testInfo) => {
  test.skip(!testUsers.a.email || !testUsers.b.email, "needs test users A and B");
  test.setTimeout(150_000);
  page.on("dialog", (dialog) => dialog.accept());
  const campaignName = `[test] ${testInfo.project.name} ${Date.now()} rolls`;

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
    await player.goto(`${campaignPath}/chat`);

    // DM asks for a secret Perception check.
    await page.goto(`${campaignPath}/chat`);
    await page.getByText("🎲 Request a roll").click();
    const form = page.getByTestId("new-roll-request");
    await form.getByLabel("Check").fill("Perception");
    await form.getByLabel("Extra bonus (optional)").fill("2");
    await form.getByRole("button", { name: "Request roll" }).click();
    await expect(page.getByTestId("roll-requests")).toContainText("waiting…");

    // The player is asked, rolls, and sees their result.
    await expect(player.getByTestId("roll-request")).toContainText("Roll Perception", { timeout: 20_000 });
    await player.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(player.getByTestId("my-rolls")).toContainText("Perception:", { timeout: 15_000 });

    // The DM sees the total appear, and it wasn't posted to chat.
    await expect(page.getByTestId("roll-result")).toBeVisible({ timeout: 20_000 });
    await expect(player.getByTestId("chat-messages")).not.toContainText("Perception");
  } finally {
    await playerContext.close();
  }

  await page.goto(`${campaignPath}/settings`);
  await page.getByLabel(`Type “${campaignName}” to confirm`).fill(campaignName);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
});
