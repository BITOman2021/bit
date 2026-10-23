import { audit } from "../audit";
import { assertCan, type Ctx } from "../context";
import { prisma, type Db } from "../db";

/** الإعدادات القابلة للتهيئة وقيمها الافتراضية */
export const DEFAULT_SETTINGS = {
  /** حد المبلغ (ر.ع.) الذي يتطلب اعتمادًا قبل ترحيل المصروف/الفاتورة/أمر الشراء */
  "approval.expenseThreshold": "500.000",
  /** حد تكلفة أمر العمل الذي يتطلب اعتماد التقدير */
  "approval.workOrderThreshold": "200.000",
  /** الأيام قبل انتهاء العقد لإصدار تنبيه */
  "alerts.leaseExpiryDays": 60,
  /** الأيام قبل الاستحقاق لتنبيه الإيجارات */
  "alerts.rentDueDays": 5,
  "alerts.warrantyDays": 30,
  "alerts.insuranceDays": 45,
  "alerts.invoiceDueDays": 7,
  /** الضرائب: معطلة افتراضيًا؛ لا تُطبق أي نسبة تلقائيًا */
  "tax.enabled": false,
  "tax.vatNumber": "",
  /** رسوم التأخير تتطلب تفعيلًا صريحًا على مستوى النظام وعلى مستوى العقد */
  "lateFees.enabled": false,
  "company.nameAr": "جلوبال سنو وينج",
  "company.nameEn": "GLOBAL SNOW WING (GSW)",
  "company.address": "سلطنة عُمان",
  "company.phone": "",
  "company.crNumber": "",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { -readonly [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] extends boolean ? boolean : (typeof DEFAULT_SETTINGS)[K] extends number ? number : string };

export async function getSettings(orgId: string, db: Db = prisma): Promise<Settings> {
  const rows = await db.systemSetting.findMany({ where: { organizationId: orgId } });
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as Settings;
}

export async function updateSettings(ctx: Ctx, values: Partial<Record<SettingKey, unknown>>) {
  assertCan(ctx, "settings.manage");
  const before = await getSettings(ctx.orgId);
  await prisma.$transaction(async (tx) => {
    for (const [key, raw] of Object.entries(values)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      const def = DEFAULT_SETTINGS[key as SettingKey];
      let value: unknown = raw;
      if (typeof def === "boolean") value = raw === true || raw === "on" || raw === "true";
      else if (typeof def === "number") {
        value = Number(raw);
        if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3650) continue;
      } else value = String(raw ?? "").slice(0, 500);
      await tx.systemSetting.upsert({
        where: { organizationId_key: { organizationId: ctx.orgId, key } },
        update: { value: value as object },
        create: { organizationId: ctx.orgId, key, value: value as object },
      });
    }
    await audit(tx, ctx, { action: "settings.update", entityType: "SystemSetting", before, after: values });
  });
}
