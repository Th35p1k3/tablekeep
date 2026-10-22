import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("announcements and logs reach players; DM-only logs and notes don't", async ({ page, browser }, testInfo) => {
  test.skip(!testUsers.a.email || !testUsers.b.email, "needs test users A and B");
  test.setTimeout(150_000);
  page.on("dialog", (dialog) => dialog.accept());
  const campaignName = `[test] ${testInfo.project.name} ${Date.now()} tools`;

  // DM: campaign, announcement, two logs, a note, an invite.
  await logIn(page, testUsers.a);
  await page.goto("/campaigns/new");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  const campaignUrl = page.url();

  await page.getByText("Post an announcement").click();
  const announce = page.getByTestId("new-announcement");
  await announce.getByLabel("Announcement title").fill("Next session Saturday 7pm");
  await announce.getByLabel("Pin to the top").check();
  await announce.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByTestId("announcements")).toContainText("Next session Saturday 7pm");

  await page.getByRole("link", { name: "Logs" }).click();
  await page.getByText("Add a session log").click();
  const newLog = page.getByTestId("new-log");
  await newLog.getByLabel("Log title").fill("The salt marsh");
  await newLog.getByLabel("Recap").fill("We met a talking eel.");
  await newLog.getByRole("button", { name: "Add log" }).click();
  await expect(page.getByTestId("session-logs")).toContainText("The salt marsh");
  await newLog.getByLabel("Log title").fill("The mayor's secret");
  await newLog.getByLabel("Who can read it").selectOption("dm_only");
  await newLog.getByRole("button", { name: "Add log" }).click();
  await expect(page.getByTestId("session-logs")).toContainText("The mayor's secret");

  await page.getByRole("link", { name: "DM notes" }).click();
  await page.getByText("Add a note").click();
  const newNote = page.getByTestId("new-note");
  await newNote.getByLabel("Note title").fill("Eel is a spy");
  await newNote.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByTestId("dm-notes")).toContainText("Eel is a spy");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();

  // Player: sees the announcement and the shared log only.
  const playerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const player = await playerContext.newPage();
  try {
    await logIn(player, testUsers.b);
    await player.goto(new URL(link).pathname);
    await player.getByRole("button", { name: "Join campaign" }).click();
    await expect(player.getByTestId("announcements")).toContainText("Next session Saturday 7pm");
    await expect(player.getByRole("link", { name: "DM notes" })).toHaveCount(0);

    await player.getByRole("link", { name: "Logs" }).click();
    await expect(player.getByTestId("session-logs")).toContainText("The salt marsh");
    await expect(player.getByText("The mayor's secret")).toHaveCount(0);
    await expect(player.getByText("Add a session log")).toHaveCount(0);

    // Going straight to the notes address sends a player back to the overview.
    await player.goto(`${new URL(campaignUrl).pathname}/notes`);
    await expect(player).toHaveURL(new RegExp(`${new URL(campaignUrl).pathname}$`));
    await expect(player.getByText("Eel is a spy")).toHaveCount(0);
  } finally {
    await playerContext.close();
  }

  // DM: the activity log shows the player joining. Then clean up.
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByTestId("activity")).toContainText("joined the campaign");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel(`Type “${campaignName}” to confirm`).fill(campaignName);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
});
