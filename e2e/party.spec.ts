import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("a DM offers a sheet, a player builds a character for the campaign, and the DM views it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!testUsers.a.email || !testUsers.b.email, "needs test users A and B");
  test.setTimeout(180_000);
  page.on("dialog", (dialog) => dialog.accept());
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const templateName = `[test] ${stamp} party sheet`;
  const campaignName = `[test] ${stamp} party campaign`;
  const characterName = `[test] ${stamp} Bram`;

  // DM: publish a template, create a campaign, offer the template, invite.
  await logIn(page, testUsers.a);
  await page.goto("/templates/new");
  await page.getByLabel("Template name").fill(templateName);
  await page.getByRole("button", { name: "Create template" }).click();
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("button", { name: "Make changes" })).toBeVisible();
  const templateUrl = page.url();

  await page.goto("/campaigns/new");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  const campaignUrl = page.url();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Offer a template").selectOption({ label: `${templateName} (version 1)` });
  await page.getByRole("button", { name: "Offer template" }).click();
  await expect(page.getByTestId("offered-templates")).toContainText(templateName);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();

  // Player: join, build a character from the offered sheet, add it, add an item.
  const playerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const player = await playerContext.newPage();
  player.on("dialog", (dialog) => dialog.accept());
  try {
    await logIn(player, testUsers.b);
    await player.goto(new URL(link).pathname);
    await player.getByRole("button", { name: "Join campaign" }).click();
    await expect(player.getByRole("heading", { name: campaignName })).toBeVisible();

    await player.goto("/characters/new");
    await player.getByLabel("Character name").fill(characterName);
    await player
      .getByLabel("Sheet template")
      .selectOption({ label: `${templateName} (version 1) · offered in ${campaignName}` });
    await player.getByRole("button", { name: "Create character" }).click();
    await expect(player.getByRole("heading", { name: characterName, level: 1 })).toBeVisible();

    await player.getByLabel("Strength", { exact: true }).fill("17");
    await expect(player.getByTestId("save-status")).toHaveText("Saved");
    await player.getByLabel("Add to a campaign").selectOption({ label: campaignName });
    await player.getByRole("button", { name: "Add to campaign" }).click();
    await expect(player.getByRole("button", { name: "Remove from campaign" })).toBeVisible();

    await player.getByLabel("Item", { exact: true }).fill("Rope");
    await player.getByRole("button", { name: "Add item" }).click();
    await expect(player.getByTestId("inventory-list")).toContainText("Rope");

    // DM: the character shows in the party and opens read-only.
    await page.goto(`${campaignUrl}/party`);
    await expect(page.getByTestId("party-list")).toContainText(characterName);
    await page.getByRole("link", { name: characterName }).click();
    await expect(page.getByText("View only")).toBeVisible();
    await expect(page.getByLabel("Strength", { exact: true })).toHaveValue("17");
    await expect(page.getByLabel("Strength", { exact: true })).toBeDisabled();
    await expect(page.getByTestId("inventory-list")).toContainText("Rope");
    await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(0);

    // Clean up: the player deletes the character (still open in their browser).
    await player.getByRole("button", { name: "Delete character" }).click();
    await expect(player).toHaveURL(/\/characters$/);
  } finally {
    await playerContext.close();
  }

  // DM cleans up the campaign and template.
  await page.goto(`${campaignUrl}/settings`);
  await page.getByLabel(`Type “${campaignName}” to confirm`).fill(campaignName);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(templateUrl);
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect(page).toHaveURL(/\/templates$/);
});
