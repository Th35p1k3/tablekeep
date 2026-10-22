import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("build a spell with effects, publish it, and prepare it on a character", async ({ page }, testInfo) => {
  test.skip(!testUsers.a.email, "needs test user A");
  test.setTimeout(180_000);
  page.on("dialog", (dialog) => dialog.accept());
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const spellName = `[test] ${stamp} Fire burst`;
  const templateName = `[test] ${stamp} caster sheet`;
  const characterName = `[test] ${stamp} Caster`;

  await logIn(page, testUsers.a);

  // Build the spell.
  await page.goto("/spells/new");
  await page.getByLabel("Spell name").fill(spellName);
  await page.getByRole("button", { name: "Create spell" }).click();
  await expect(page.getByRole("heading", { name: spellName, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish version 1" })).toBeDisabled();

  await page.getByLabel("Level (blank if your game has none)").fill("3");
  await page.getByLabel("Description", { exact: true }).fill("A bright streak blossoms into flame.");
  await page.getByLabel("Effect type").selectOption("damage");
  await page.getByRole("button", { name: "Add effect" }).click();
  await page.getByLabel("Dice", { exact: true }).fill("8d6");
  await page.getByLabel("Damage type").fill("fire");
  await page.getByLabel("Effect type").selectOption("save");
  await page.getByRole("button", { name: "Add effect" }).click();
  await page.getByLabel("Ability or stat").fill("Dexterity");

  await expect(page.getByTestId("spell-card")).toContainText("8d6 (average 28) fire");
  await expect(page.getByTestId("spell-card")).toContainText("Saving throw: Dexterity, half on a success");
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("button", { name: "Make changes" })).toBeVisible();
  const spellUrl = page.url();

  // A sheet and a character to put it on.
  await page.goto("/templates/new");
  await page.getByLabel("Template name").fill(templateName);
  await page.getByRole("button", { name: "Create template" }).click();
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByRole("button", { name: "Make changes" })).toBeVisible();
  const templateUrl = page.url();

  await page.goto("/characters/new");
  await page.getByLabel("Character name").fill(characterName);
  await page.getByLabel("Sheet template").selectOption({ label: `${templateName} (version 1, latest)` });
  await page.getByRole("button", { name: "Create character" }).click();
  await expect(page.getByRole("heading", { name: characterName, level: 1 })).toBeVisible();

  // Add, prepare and read the spell.
  await page.getByLabel("Add a spell").selectOption({ label: `${spellName} (version 1)` });
  await page.getByRole("button", { name: "Add spell" }).click();
  await expect(page.getByTestId("character-spells")).toContainText(spellName);
  await page.getByLabel(`Prepared: ${spellName}`).check();
  await expect(page.getByTestId("character-spells")).toContainText("prepared");
  // The spell's own button starts with its name ("Remove …" doesn't).
  const escaped = spellName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("button", { name: new RegExp(`^${escaped}`) }).click();
  await expect(page.getByTestId("spell-card")).toContainText("8d6 (average 28) fire");

  // Clean up: character, spell, template.
  await page.getByRole("button", { name: "Delete character" }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await page.goto(spellUrl);
  await page.getByRole("button", { name: "Delete spell" }).click();
  await expect(page).toHaveURL(/\/spells$/);
  await page.goto(templateUrl);
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect(page).toHaveURL(/\/templates$/);
});
