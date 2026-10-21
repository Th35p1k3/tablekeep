import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("create a character, play with the sheet, and use restore points", async ({ page }, testInfo) => {
  test.skip(!testUsers.a.email, "needs test user A");
  test.setTimeout(150_000);
  page.on("dialog", (dialog) => dialog.accept());
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const templateName = `[test] ${stamp} sheet`;
  const characterName = `[test] ${stamp} hero`;

  // A published template to build from.
  await logIn(page, testUsers.a);
  await page.goto("/templates/new");
  await page.getByLabel("Template name").fill(templateName);
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("heading", { name: templateName, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("button", { name: "Make changes" })).toBeVisible();
  const templateUrl = page.url();

  // Create the character.
  await page.goto("/characters/new");
  await page.getByLabel("Character name").fill(characterName);
  await page.getByLabel("Sheet template").selectOption({ label: `${templateName} (version 1, latest)` });
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("heading", { name: characterName, level: 1 })).toBeVisible();

  // Values calculate and save automatically, and survive a reload.
  await page.getByLabel("Strength", { exact: true }).fill("16");
  await expect(page.getByTestId("calc-strength_mod")).toHaveText("+3");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Strength", { exact: true })).toHaveValue("16");

  // Spend hit points, then refill them.
  await page.getByLabel("Hit points", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Refill Hit points" }).click();
  await expect(page.getByLabel("Hit points", { exact: true })).toHaveValue("8");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");

  // Save a restore point, change something, then go back.
  await page.getByLabel("Restore point name").fill("Before test");
  await page.getByRole("button", { name: "Save restore point" }).click();
  await expect(page.getByTestId("restore-points")).toContainText("Before test");
  await page.getByLabel("Strength", { exact: true }).fill("10");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Restore Before test" }).click();
  await expect(page.getByLabel("Strength", { exact: true })).toHaveValue("16");

  // Clean up: character first, then its template.
  await page.getByRole("button", { name: "Delete character" }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await page.goto(templateUrl);
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect(page).toHaveURL(/\/templates$/);
});
