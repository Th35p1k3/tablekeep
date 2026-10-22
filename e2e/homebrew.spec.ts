import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("a player submits a spell and the DM approves it for the campaign", async ({ page, browser }, testInfo) => {
  test.skip(!testUsers.a.email || !testUsers.b.email, "needs test users A and B");
  test.setTimeout(180_000);
  page.on("dialog", (dialog) => dialog.accept());
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const campaignName = `[test] ${stamp} homebrew campaign`;
  const spellName = `[test] ${stamp} Frost lance`;

  // DM: campaign and invite.
  await logIn(page, testUsers.a);
  await page.goto("/campaigns/new");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  const campaignUrl = page.url();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();

  const playerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const player = await playerContext.newPage();
  player.on("dialog", (dialog) => dialog.accept());
  let spellUrl = "";
  try {
    // Player: join, build and publish a spell, submit it.
    await logIn(player, testUsers.b);
    await player.goto(new URL(link).pathname);
    await player.getByRole("button", { name: "Join campaign" }).click();
    await expect(player.getByRole("heading", { name: campaignName })).toBeVisible();

    await player.goto("/spells/new");
    await player.getByLabel("Spell name").fill(spellName);
    await player.getByRole("button", { name: "Create spell" }).click();
    await player.getByLabel("Description", { exact: true }).fill("A shard of ice flies at a target.");
    await player.getByRole("button", { name: "Publish version 1" }).click();
    await expect(player.getByRole("button", { name: "Make changes" })).toBeVisible();
    spellUrl = player.url();

    await player.goto(campaignUrl.replace(/^https?:\/\/[^/]+/, ""));
    await player.getByLabel("Spell or sheet template").selectOption({ label: `Spell: ${spellName} (version 1)` });
    await player.getByLabel("Note for your DM (optional)").fill("Like a cold firebolt.");
    await player.getByRole("button", { name: "Submit for approval" }).click();
    await expect(player.getByTestId("my-submissions")).toContainText("Waiting for review");

    // DM: review in the queue.
    await page.goto(`${campaignUrl}/approvals`);
    await expect(page.getByTestId("pending-submissions")).toContainText(spellName);
    await expect(page.getByTestId("pending-submissions")).toContainText("Like a cold firebolt.");
    await page.getByLabel(`Note to the player about ${spellName}`).fill("Approved, have fun.");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Nothing waiting for review.")).toBeVisible();

    // Player: sees the decision and the spell on the campaign list.
    await player.reload();
    await expect(player.getByTestId("my-submissions")).toContainText("Approved");
    await expect(player.getByTestId("campaign-spells")).toContainText(spellName);
  } finally {
    await playerContext.close();
  }

  // Clean up: campaign (removes the approval), then the player's spell.
  await page.goto(`${campaignUrl}/settings`);
  await page.getByLabel(`Type “${campaignName}” to confirm`).fill(campaignName);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);

  const cleanup = await browser.newContext({ baseURL: "http://localhost:3000" });
  const p2 = await cleanup.newPage();
  p2.on("dialog", (dialog) => dialog.accept());
  await logIn(p2, testUsers.b);
  await p2.goto(spellUrl.replace(/^https?:\/\/[^/]+/, ""));
  await p2.getByRole("button", { name: "Delete spell" }).click();
  await expect(p2).toHaveURL(/\/spells$/);
  await cleanup.close();
});
