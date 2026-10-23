import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test("mobile: bottom navigation, drawer and card lists", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  const bottom = page.getByRole("navigation", { name: "bottom" });
  await expect(bottom).toBeVisible();
  await bottom.getByRole("link", { name: "العقود" }).click();
  await expect(page).toHaveURL(/\/leases/);
  // على الهاتف تظهر البطاقات بدل الجدول
  await expect(page.locator("table").first()).toBeHidden();
  await expect(page.locator("ul.md\\:hidden li").first()).toBeVisible();
  await page.getByRole("button", { name: "menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "التقارير" })).toBeVisible();
  // لا يوجد تمرير أفقي للصفحة
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
