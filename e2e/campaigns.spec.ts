import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("a DM creates a campaign, invites a player, and the player joins", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !testUsers.a.email || !testUsers.b.email,
    "needs test users A and B",
  );
  test.setTimeout(90_000);
  const name = `[test] ${testInfo.project.name} ${Date.now()}`;

  // DM (test user A) creates the campaign.
  await logIn(page, testUsers.a);
  await page.getByRole("link", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill(name);
  await page.getByLabel("Game system").fill("Test system");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // DM makes an invite link.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByTestId("invite-link").inputValue();
  expect(link).toContain("/invite/");

  // Player (test user B) opens the link in a separate browser and joins.
  const playerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const player = await playerContext.newPage();
  try {
    await logIn(player, testUsers.b);
    await player.goto(new URL(link).pathname);
    await expect(player.getByText(name)).toBeVisible();
    await player.getByRole("button", { name: "Join campaign" }).click();
    await expect(player.getByRole("heading", { name })).toBeVisible();
    await expect(player.getByTestId("member-row")).toHaveCount(2);
    await expect(player.getByRole("link", { name: "Settings" })).toHaveCount(0);
  } finally {
    await playerContext.close();
  }

  // Clean up: the DM deletes the test campaign.
  await page.getByLabel(`Type “${name}” to confirm`).fill(name);
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(name)).toHaveCount(0);
});

test("signed-out visitors can't open a campaign page", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase settings");
  await page.goto("/campaigns/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
});

test("a made-up invite link shows a clear message", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase settings");
  await page.goto(`/invite/${"0".repeat(48)}`);
  await expect(page.getByText("This invite link isn’t valid")).toBeVisible();
});
