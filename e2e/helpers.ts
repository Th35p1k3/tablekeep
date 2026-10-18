import { expect, type Page } from "@playwright/test";

export const testUsers = {
  a: { email: process.env.TEST_USER_A_EMAIL ?? "", password: process.env.TEST_USER_A_PASSWORD ?? "" },
  b: { email: process.env.TEST_USER_B_EMAIL ?? "", password: process.env.TEST_USER_B_PASSWORD ?? "" },
};

export async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/home$/);
}
