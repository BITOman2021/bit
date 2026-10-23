import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.locator("form:has(input[name=email]) button[type=submit]").click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const ADMIN = { email: "admin@e2e.om", password: "Admin@123456" };
export const DEMO_PW = "Demo@123456";
