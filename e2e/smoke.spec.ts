import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tablekeep" }),
  ).toBeVisible();
});

test("health page responds", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByTestId("health-status")).toBeVisible();
});
