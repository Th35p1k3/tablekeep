import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("build, test and publish a sheet template", async ({ page }, testInfo) => {
  test.skip(!testUsers.a.email, "needs test user A");
  test.setTimeout(120_000);
  // Accept the "are you sure?" questions (publish, delete).
  page.on("dialog", (dialog) => dialog.accept());
  const name = `[test] ${testInfo.project.name} template ${Date.now()}`;

  await logIn(page, testUsers.a);
  await page.getByRole("link", { name: "Sheet templates" }).click();
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // The example sheet calculates in the live preview.
  await expect(page.getByTestId("calc-strength_mod")).toHaveText("+0");
  await page.getByLabel("Strength", { exact: true }).fill("16");
  await expect(page.getByTestId("calc-strength_mod")).toHaveText("+3");

  // Add a calculated field to the Basics section.
  await page.getByLabel("Type of new field in Basics").selectOption("calculated");
  await page.getByRole("button", { name: "Add field to Basics" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Double level");

  // A broken formula is explained and blocks publishing.
  await page.getByLabel("Formula", { exact: true }).fill("level *");
  await expect(page.getByTestId("field-problems")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish version 1" })).toBeDisabled();

  // Fixing it updates the preview.
  await page.getByLabel("Formula", { exact: true }).fill("level * 2");
  await expect(page.getByTestId("field-problems")).toHaveCount(0);
  await expect(page.getByTestId("calc-double_level")).toHaveText("2");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved");

  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("button", { name: "Make changes" })).toBeVisible();
  await expect(page.getByText("Version 1 preview")).toBeVisible();

  // Clean up.
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "My sheet templates" })).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});
