import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { logIn, testUsers } from "./helpers";

test("download my data, then import a spell from a file", async ({ page }, testInfo) => {
  test.skip(!testUsers.a.email, "needs test user A");
  test.setTimeout(120_000);
  page.on("dialog", (dialog) => dialog.accept());
  await logIn(page, testUsers.a);

  // Export: a JSON file in Tablekeep's format.
  await page.goto("/account");
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download my data" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tablekeep-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.format).toBe("tablekeep-export");
  expect(Array.isArray(exported.characters)).toBe(true);
  expect(exported.profile.email).toBe(testUsers.a.email);

  // Import: a small file with one spell.
  const spellName = `[test] ${testInfo.project.name} ${Date.now()} imported spell`;
  const file = {
    format: "tablekeep-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    spells: [
      {
        name: spellName,
        versions: [
          {
            status: "published",
            version_number: 1,
            body: {
              formatVersion: 1,
              level: 1,
              category: "",
              castingTime: "",
              range: "",
              area: "",
              duration: "",
              components: "",
              concentration: false,
              ritual: false,
              tags: [],
              description: "Imported by the automated tests.",
              higherLevels: "",
              customProperties: [],
              effects: [{ id: "e1", type: "healing", dice: "1d8" }],
            },
          },
        ],
      },
    ],
  };
  await page.goto("/account/import");
  await expect(page.getByTestId("import-form")).toHaveAttribute("data-ready", "true");
  await page.getByLabel("Tablekeep export file (.json)").setInputFiles({
    name: "import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole("button", { name: "Import 1 item" }).click();
  await expect(page.getByTestId("import-summary")).toHaveText("Finished: 1 of 1 imported.");

  // It's in My spells, published as version 1. Then clean up.
  await page.goto("/spells");
  await page.getByRole("link", { name: spellName }).click();
  await expect(page.getByText("Version 1").first()).toBeVisible();
  await page.getByRole("button", { name: "Delete spell" }).click();
  await expect(page).toHaveURL(/\/spells$/);
});

test("a file that isn't an export is explained", async ({ page }) => {
  test.skip(!testUsers.a.email, "needs test user A");
  await logIn(page, testUsers.a);
  await page.goto("/account/import");
  await expect(page.getByTestId("import-form")).toHaveAttribute("data-ready", "true");
  await page.getByLabel("Tablekeep export file (.json)").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByText("That file isn’t a Tablekeep export.")).toBeVisible();
});
