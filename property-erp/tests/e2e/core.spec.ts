import { expect, test } from "@playwright/test";
import { ADMIN, DEMO_PW, login } from "./helpers";

test.describe("authentication", () => {
  test("rejects wrong password and logs in/out", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.fill("input[name=email]", ADMIN.email);
    await page.fill("input[name=password]", "wrong-password-1");
    await page.locator("form:has(input[name=email]) button[type=submit]").click();
    await expect(page.getByRole("alert")).toContainText("Invalid email or password");
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة التحكم");
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/properties");
    await expect(page).toHaveURL(/\/login/);
  });

  test("switches language to English (LTR) and back", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole("button", { name: "language" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
    await page.getByRole("button", { name: "language" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test("end-to-end: property → unit → tenant → lease → activation → partial payment → receipt", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);

  await page.goto("/properties/new");
  await page.fill("input[name=name]", "E2E برج الاختبار");
  await page.selectOption("select[name=type]", "RESIDENTIAL_BUILDING");
  await page.fill("input[name=wilayat]", "السيب");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E برج الاختبار");

  await page.getByRole("link", { name: /الوحدات/ }).first().click();
  const unitForm = page.locator("form:has(input[name=unitNumber])");
  await unitForm.locator("input[name=unitNumber]").fill("E-1");
  await unitForm.locator("select[name=type]").selectOption("APARTMENT");
  await unitForm.locator("input[name=marketRent]").fill("333.333");
  await unitForm.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByRole("link", { name: "E-1" }).first()).toBeVisible();

  await page.goto("/tenants/new");
  await page.fill("input[name=name]", "مستأجر الاختبار E2E");
  await page.fill("input[name=phone]", "+968 9999 0000");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("مستأجر الاختبار E2E");

  await page.goto("/leases/new");
  const pick = async (sel: string, text: string) => {
    const v = await page.locator(`${sel} option`, { hasText: text }).first().getAttribute("value");
    await page.selectOption(sel, v!);
  };
  await pick("select[name=unitId]", "/ E-1");
  await pick("select[name=tenantId]", "مستأجر الاختبار E2E");
  // تحقق النموذج: النهاية قبل البداية
  await page.fill("input[name=startDate]", "2026-03-01");
  await page.fill("input[name=endDate]", "2026-01-01");
  await page.fill("input[name=monthlyRent]", "333.333");
  await page.fill("input[name=depositAmount]", "333.333");
  await page.getByRole("button", { name: "حفظ المسودة" }).click();
  await expect(page.getByRole("alert")).toContainText("End date is before start date");
  await page.fill("input[name=endDate]", "2027-02-28");
  await page.getByRole("button", { name: "حفظ المسودة" }).click();
  await expect(page.getByText("مسودة: لم تُنشأ استحقاقات بعد")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "اعتماد وتفعيل العقد" }).click();
  await expect(page.getByText("CHG-2026-").first()).toBeVisible();
  await expect(page.locator("table").first()).toContainText("333.333");

  await page.getByRole("link", { name: "تسجيل تحصيل" }).click();
  await page.fill("input[name=amount]", "500.000");
  await page.fill("input[name=receivedDate]", "2026-03-02");
  await page.getByRole("button", { name: "تسجيل وإصدار إيصال" }).click();
  await expect(page.getByText("تم تسجيل التحصيل وإصدار الإيصال")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("RCT-2026-");
  const receiptUrl = page.url();

  // إعادة تحميل الصفحة لا تُنشئ دفعة ثانية
  await page.reload();
  await page.goto("/finance/payments?q=" + encodeURIComponent("مستأجر الاختبار"));
  await expect(page.locator("table tbody tr")).toHaveCount(1);

  await page.goto(receiptUrl.replace("/finance/payments/", "/print/receipt/").replace("?ok=1", ""));
  await expect(page.getByText("500.000 OMR")).toBeVisible();
  await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
});

test("search and filters on properties", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto("/properties");
  await page.fill("input[name=q]", "القرم");
  await page.getByRole("button", { name: "بحث" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table")).toContainText("Qurum");
});

test("report export: CSV (UTF-8 BOM) and Excel", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  const csv = await page.request.get("/api/reports/trial-balance?format=csv");
  expect(csv.status()).toBe(200);
  const body = await csv.body();
  expect(body.subarray(0, 3).toString("hex")).toBe("efbbbf");
  expect(body.toString("utf8")).toContain("ميزان المراجعة");
  const xlsx = await page.request.get("/api/reports/occupancy?format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  await page.goto("/reports/trial-balance");
  await expect(page.locator("tfoot")).toContainText("متوازن");
});

test("permissions are enforced: technician and API without session", async ({ page, request }) => {
  const anon = await request.get("/api/reports/trial-balance?format=json");
  expect(anon.status()).toBe(401);
  await login(page, "tech@demo.gsw.om", DEMO_PW);
  await expect(page).toHaveURL(/work-orders/);
  await page.goto("/finance/payments");
  await expect(page).toHaveURL(/forbidden/);
  const api = await page.request.get("/api/reports/trial-balance?format=json");
  expect(api.status()).toBe(403);
});

test("tenant portal: sees own data and submits a maintenance request", async ({ page }) => {
  await login(page, "tenant@demo.gsw.om", DEMO_PW);
  await expect(page).toHaveURL(/\/portal/);
  await page.goto("/portal?tab=maintenance");
  await page.fill("input[name=title]", "المكيف لا يعمل");
  await page.fill("textarea[name=description]", "المكيف في غرفة النوم متوقف منذ الصباح");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("تم استلام طلب الصيانة")).toBeVisible();
  await page.goto("/portal?tab=maintenance");
  await expect(page.locator("body")).toContainText("المكيف لا يعمل");
  await page.goto("/properties");
  await expect(page).toHaveURL(/\/portal/);
});
