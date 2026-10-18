import { expect, test } from "@playwright/test";
import { testUsers } from "./helpers";

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const testUser = testUsers.a;

test("signed-out visitors are sent from Home to Log in", async ({ page }) => {
  test.skip(!hasSupabase, "needs Supabase settings");
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});

test("signed-out visitors are sent from Account to Log in", async ({ page }) => {
  test.skip(!hasSupabase, "needs Supabase settings");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign-up form shows its fields", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("form errors appear for bad input", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("a wrong password shows a friendly message", async ({ page }) => {
  test.skip(!hasSupabase, "needs Supabase settings");
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByTestId("form-message")).toContainText("incorrect");
});

test("the test user can log in and log out", async ({ page }) => {
  test.skip(!testUser.email || !testUser.password, "needs test user A");
  await page.goto("/login");
  await page.getByLabel("Email").fill(testUser.email);
  await page.getByLabel("Password", { exact: true }).fill(testUser.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
