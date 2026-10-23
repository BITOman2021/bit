/**
 * بيانات تجريبية للتطوير فقط — pnpm db:seed-demo
 * - تُنشأ عبر خدمات النظام نفسها (نفس القواعد والقيود المحاسبية).
 * - كل السجلات مميزة بـ isDemo ويمكن حذفها بـ pnpm db:purge-demo.
 * - يرفض العمل في بيئة الإنتاج.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { addDays, addMonths, formatDateOnly, startOfMonth, todayInZone } from "../src/lib/dates";
import { fromBaisa, toBaisa } from "../src/lib/money";
import { hashPassword } from "../src/server/auth/password";
import { buildContext } from "../src/server/context";
import { prisma } from "../src/server/db";
import { activateLease, createLease } from "../src/server/services/leases";
import { recordPayment } from "../src/server/services/billing";
import { createBuilding, createOwner, createProperty, createUnit, setOwnershipShares } from "../src/server/services/properties";
import { createTenant } from "../src/server/services/tenants";
import { createExpense, createInvoice, listExpenseCategories, saveVendor } from "../src/server/services/purchasing";
import { createRequest, createWorkOrder, saveAsset, saveSchedule } from "../src/server/services/maintenance";
import { createTask } from "../src/server/services/tasks";
import { generateAlerts } from "../src/server/services/notifications";

export const DEMO_PASSWORD = "Demo@123456";

function assertNotProduction() {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    console.error("✗ Refusing to seed demo data in production / يرفض إضافة بيانات تجريبية في الإنتاج");
    process.exit(1);
  }
}

async function main() {
  assertNotProduction();
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error("✗ Run `pnpm admin:create` first / أنشئ المدير الأول أولًا");
    process.exit(1);
  }
  if (await prisma.property.count({ where: { isDemo: true } })) {
    console.error("✗ Demo data already exists. Run `pnpm db:purge-demo` first.");
    process.exit(1);
  }
  const admin = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, role: { key: "ADMIN" }, isActive: true }, orderBy: { createdAt: "asc" } });
  const ctx = await buildContext(admin.id);
  const today = todayInZone(org.timezone);
  const m0 = startOfMonth(today);
  const ds = (d: Date) => formatDateOnly(d);

  // ---------- العقارات ----------
  const p1 = await createProperty(ctx, {
    code: "DEMO-KHW",
    name: "برج الخوير السكني / Al Khuwair Residences",
    type: "RESIDENTIAL_BUILDING",
    governorate: "مسقط",
    wilayat: "بوشر",
    area: "الخوير",
    address: "شارع 33، الخوير، مسقط",
    plotNumber: "DEMO-1/245",
    landArea: "1200",
    builtArea: "3600",
    purchaseDate: "2019-05-01",
    purchasePrice: "850000",
    estimatedValue: "1050000",
    valuationDate: ds(addMonths(m0, -6)),
    insuranceProvider: "شركة تأمين تجريبية",
    insurancePolicyNo: "DEMO-POL-001",
    insuranceExpiry: ds(addDays(today, 30)),
    ownershipSplitEnabled: "on",
  });
  const p2 = await createProperty(ctx, {
    code: "DEMO-QRM",
    name: "مجمع القرم التجاري / Qurum Commercial Plaza",
    type: "MIXED_USE",
    governorate: "مسقط",
    wilayat: "مطرح",
    area: "القرم",
    address: "شارع القرم التجاري",
    plotNumber: "DEMO-2/88",
    landArea: "900",
    builtArea: "1500",
    purchaseDate: "2021-02-15",
    purchasePrice: "620000",
    insuranceExpiry: ds(addMonths(today, 8)),
  });
  const b1 = await createBuilding(ctx, { propertyId: p1.id, code: "A", name: "المبنى A", floorsCount: "4" });
  const floors = await prisma.floor.findMany({ where: { buildingId: b1.id }, orderBy: { number: "asc" } });
  const u: Record<string, string> = {};
  const aptSpecs = [
    ["101", 1, "420"], ["102", 1, "420"], ["201", 2, "450"], ["202", 2, "450"], ["301", 3, "480"], ["302", 3, "480"],
  ] as const;
  for (const [no, fl, rent] of aptSpecs) {
    const unit = await createUnit(ctx, { propertyId: p1.id, buildingId: b1.id, floorId: floors[fl].id, unitNumber: no, type: "APARTMENT", area: "110", bedrooms: "2", bathrooms: "2", furnishing: "SEMI_FURNISHED", marketRent: rent });
    u[no] = unit.id;
  }
  for (const [no, type, rent] of [["S1", "SHOP", "650"], ["S2", "SHOP", "600"], ["O1", "OFFICE", "800"], ["O2", "OFFICE", "750"]] as const) {
    const unit = await createUnit(ctx, { propertyId: p2.id, unitNumber: no, type, area: type === "SHOP" ? "60" : "95", marketRent: rent });
    u[no] = unit.id;
  }
  await prisma.unit.update({ where: { id: u["302"] }, data: { status: "RESERVED" } });

  // ---------- الملاك ----------
  const o1 = await createOwner(ctx, { code: "DEMO-O1", name: "سالم بن خلفان الحارثي (تجريبي)", type: "INDIVIDUAL", phone: "+968 9000 0001" });
  const o2 = await createOwner(ctx, { code: "DEMO-O2", name: "مريم بنت سعيد البلوشية (تجريبي)", type: "INDIVIDUAL", phone: "+968 9000 0002" });
  const o3 = await createOwner(ctx, { code: "DEMO-O3", name: "شركة الأفق للاستثمار (تجريبي)", type: "COMPANY", crNumber: "DEMO-CR-1" });
  await setOwnershipShares(ctx, { propertyId: p1.id, effectiveFrom: "2019-05-01", shares: [{ ownerId: o1.id, percentage: "60" }, { ownerId: o2.id, percentage: "40" }] });
  await setOwnershipShares(ctx, { propertyId: p2.id, effectiveFrom: "2021-02-15", shares: [{ ownerId: o3.id, percentage: "100" }] });

  // ---------- المستأجرون والعقود ----------
  const tenants = [
    { name: "أحمد بن علي البلوشي (تجريبي)", unit: "101", rent: "420", start: addMonths(m0, -9), months: 12, freq: "MONTHLY", paidMonths: 9 },
    { name: "فاطمة بنت حمد الرواحية (تجريبي)", unit: "102", rent: "420", start: addMonths(m0, -11), months: 12, freq: "MONTHLY", paidMonths: 9 }, // ينتهي قريبًا + متأخرات
    { name: "خالد بن سالم المعمري (تجريبي)", unit: "201", rent: "450", start: addMonths(m0, -3), months: 12, freq: "QUARTERLY", paidMonths: 3 },
    { name: "Rahul Menon (Demo)", unit: "202", rent: "450", start: addMonths(m0, -5), months: 12, freq: "MONTHLY", paidMonths: 4, partial: "200" },
    { name: "مطعم الساحل (تجريبي)", unit: "S1", rent: "650", start: addMonths(m0, -6), months: 24, freq: "MONTHLY", paidMonths: 6 },
    { name: "مكتب الريادة للاستشارات (تجريبي)", unit: "O1", rent: "800", start: addMonths(m0, -2), months: 12, freq: "SEMI_ANNUAL", paidMonths: 6 },
  ] as const;
  const leaseIds: string[] = [];
  for (const [i, t] of tenants.entries()) {
    const tenant = await createTenant(ctx, { code: `DEMO-T${i + 1}`, name: t.name, type: t.unit.startsWith("S") || t.unit.startsWith("O") ? "COMPANY" : "INDIVIDUAL", phone: `+968 9100 00${10 + i}`, email: `tenant${i + 1}@demo.gsw.om`, nationality: "عُماني", idType: "بطاقة شخصية", idNumber: `DEMO${100000 + i}` });
    const start = t.start;
    const end = addDays(addMonths(start, t.months), -1);
    const lease = await createLease(ctx, {
      unitId: u[t.unit],
      tenantId: tenant.id,
      startDate: ds(start),
      endDate: ds(end),
      monthlyRent: t.rent,
      frequency: t.freq,
      paymentMethod: "BANK_TRANSFER",
      depositAmount: t.rent,
      vatRate: "0",
      gracePeriodDays: "5",
      renewalTerms: "يجدد باتفاق الطرفين كتابيًا قبل 60 يومًا من الانتهاء.",
      terminationTerms: "إشعار كتابي قبل 90 يومًا وفق الأنظمة المعمول بها.",
    });
    await activateLease(ctx, lease.id);
    leaseIds.push(lease.id);
    // دفعة التأمين ثم الإيجارات المدفوعة (بالأقدم أولًا)
    const rentB = toBaisa(t.rent);
    const firstPay = addDays(start, 1) > today ? today : addDays(start, 1);
    await recordPayment(ctx, { tenantId: tenant.id, leaseId: lease.id, amount: fromBaisa(rentB), method: "BANK_TRANSFER", receivedDate: ds(firstPay), reference: `DEMO-DEP-${i + 1}`, idempotencyKey: randomUUID() });
    const months = t.freq === "MONTHLY" ? 1 : t.freq === "QUARTERLY" ? 3 : 6;
    for (let k = 0; k * months < t.paidMonths; k++) {
      const d = addDays(addMonths(start, k * months), 3);
      if (d > today) break;
      await recordPayment(ctx, { tenantId: tenant.id, leaseId: lease.id, amount: fromBaisa(rentB * BigInt(months)), method: k % 3 === 0 ? "CHEQUE" : "BANK_TRANSFER", receivedDate: ds(d), reference: `DEMO-${i + 1}-${k + 1}`, idempotencyKey: randomUUID() });
    }
    if ("partial" in t && t.partial) {
      await recordPayment(ctx, { tenantId: tenant.id, leaseId: lease.id, amount: t.partial, method: "CASH", receivedDate: ds(addDays(today, -2)), reference: "DEMO-PARTIAL", idempotencyKey: randomUUID() });
    }
  }

  // ---------- الموردون والمصروفات ----------
  const v1 = await saveVendor(ctx, null, { code: "DEMO-V1", name: "مؤسسة البرودة للتكييف (تجريبي)", specialties: ["HVAC"], phone: "+968 9200 0001", licenseExpiry: ds(addMonths(today, 4)) });
  const v2 = await saveVendor(ctx, null, { code: "DEMO-V2", name: "شركة الأمان للخدمات (تجريبي)", specialties: ["CLEANING", "FIRE_SECURITY"], phone: "+968 9200 0002" });
  const cats = await listExpenseCategories(ctx);
  const cat = (c: string) => cats.find((x) => x.code === c)!.id;
  await createExpense(ctx, { date: ds(addDays(m0, 2)), categoryId: cat("UTIL"), description: "فاتورة كهرباء ومياه المناطق المشتركة", amount: "185.750", propertyId: p1.id, paymentMethod: "BANK_TRANSFER" });
  await createExpense(ctx, { date: ds(addMonths(m0, -1)), categoryId: cat("CLEAN"), description: "نظافة شهرية", amount: "120", propertyId: p1.id, vendorId: v2.id });
  await createExpense(ctx, { date: ds(addMonths(m0, -1)), categoryId: cat("SEC"), description: "حراسة شهرية", amount: "300", propertyId: p2.id, vendorId: v2.id });
  await createExpense(ctx, { date: ds(addMonths(m0, -2)), categoryId: cat("GOV"), description: "رسوم بلدية", amount: "75.500", propertyId: p2.id, paymentMethod: "CASH" });
  await createInvoice(ctx, { vendorId: v1.id, vendorInvoiceNo: "DEMO-AC-1001", date: ds(addDays(today, -10)), dueDate: ds(addDays(today, 5)), categoryId: cat("HVAC"), description: "صيانة دورية لوحدات التكييف", amount: "240", propertyId: p1.id });

  // ---------- الصيانة ----------
  const hash = await hashPassword(DEMO_PASSWORD);
  const demoUsers: [string, string, string][] = [
    ["PROPERTY_MANAGER", "manager@demo.gsw.om", "مدير العقارات (تجريبي)"],
    ["ACCOUNTANT", "accountant@demo.gsw.om", "المحاسب (تجريبي)"],
    ["MAINTENANCE_MANAGER", "maintenance@demo.gsw.om", "مسؤول الصيانة (تجريبي)"],
    ["COLLECTOR", "collector@demo.gsw.om", "موظف التحصيل (تجريبي)"],
    ["LEASING", "leasing@demo.gsw.om", "موظف التأجير (تجريبي)"],
    ["TECHNICIAN", "tech@demo.gsw.om", "الفني (تجريبي)"],
    ["AUDITOR", "auditor@demo.gsw.om", "المراجع المالي (تجريبي)"],
  ];
  const created: Record<string, string> = {};
  for (const [key, email, name] of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key } } });
    const user = await prisma.user.create({ data: { organizationId: org.id, email, name, passwordHash: hash, roleId: role.id, propertyScope: "ALL", isDemo: true } });
    created[key] = user.id;
  }
  const ownerUser = await prisma.user.create({
    data: { organizationId: org.id, email: "owner@demo.gsw.om", name: "سالم الحارثي (تجريبي)", passwordHash: hash, roleId: (await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "OWNER" } } })).id, isDemo: true },
  });
  await prisma.owner.update({ where: { id: o1.id }, data: { userId: ownerUser.id } });
  const tenantUser = await prisma.user.create({
    data: { organizationId: org.id, email: "tenant@demo.gsw.om", name: "أحمد البلوشي (تجريبي)", passwordHash: hash, roleId: (await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "TENANT" } } })).id, isDemo: true },
  });
  const t1 = await prisma.tenant.findFirstOrThrow({ where: { code: "DEMO-T1", organizationId: org.id } });
  await prisma.tenant.update({ where: { id: t1.id }, data: { userId: tenantUser.id } });

  const ac = await saveAsset(ctx, null, { tag: "DEMO-AC-201", name: "وحدة تكييف مركزية", category: "HVAC", propertyId: p1.id, unitId: u["201"], brand: "Gree", model: "GMV-5", serialNumber: "DEMO-SN-7781", installDate: "2022-04-01", warrantyEnd: ds(addDays(today, 20)), purchaseCost: "1450" });
  await saveAsset(ctx, null, { tag: "DEMO-LIFT-1", name: "مصعد المبنى A", category: "ELEVATOR", propertyId: p1.id, brand: "Otis", serialNumber: "DEMO-OT-9", installDate: "2019-06-01", warrantyEnd: "2024-06-01" });
  const r1 = await createRequest(ctx, { propertyId: p1.id, unitId: u["201"], assetId: ac.id, category: "HVAC", priority: "HIGH", title: "المكيف لا يبرد", description: "وحدة التكييف في الصالة لا تبرد منذ يومين." });
  await createWorkOrder(ctx, { requestId: r1.id, propertyId: p1.id, unitId: u["201"], assetId: ac.id, category: "HVAC", priority: "HIGH", title: "فحص وإصلاح وحدة التكييف", assignedToId: created.TECHNICIAN, vendorId: v1.id, scheduledDate: ds(addDays(today, 1)), dueDate: ds(addDays(today, 2)), estimatedCost: "85" });
  await createRequest(ctx, { propertyId: p2.id, unitId: u["S1"], category: "PLUMBING", priority: "MEDIUM", title: "تسرب بسيط في المغسلة", description: "تسرب ماء أسفل مغسلة المطبخ." });
  await createWorkOrder(ctx, { propertyId: p1.id, category: "PAINTING", priority: "LOW", title: "دهان ممر الطابق الأول", dueDate: ds(addDays(today, -3)) });
  await saveSchedule(ctx, null, { name: "تنظيف فلاتر التكييف", propertyId: p1.id, category: "HVAC", frequencyUnit: "MONTH", interval: "3", nextDueDate: ds(addDays(today, 10)), leadDays: "14", vendorId: v1.id });
  await saveSchedule(ctx, null, { name: "فحص نظام إنذار الحريق", propertyId: p2.id, category: "FIRE_SECURITY", frequencyUnit: "YEAR", interval: "1", nextDueDate: ds(addMonths(today, 2)), leadDays: "30" });
  await createTask(ctx, { title: "التواصل مع المستأجرة فاطمة بخصوص التجديد", assignedToId: created.LEASING, dueDate: ds(addDays(today, 3)), priority: "HIGH", propertyId: p1.id });

  // ---------- تمييز السجلات التجريبية ----------
  await prisma.property.updateMany({ where: { id: { in: [p1.id, p2.id] } }, data: { isDemo: true } });
  await prisma.unit.updateMany({ where: { propertyId: { in: [p1.id, p2.id] } }, data: { isDemo: true } });
  await prisma.owner.updateMany({ where: { id: { in: [o1.id, o2.id, o3.id] } }, data: { isDemo: true } });
  await prisma.tenant.updateMany({ where: { code: { startsWith: "DEMO-" }, organizationId: org.id }, data: { isDemo: true } });
  await prisma.vendor.updateMany({ where: { id: { in: [v1.id, v2.id] } }, data: { isDemo: true } });
  await prisma.lease.updateMany({ where: { id: { in: leaseIds } }, data: { isDemo: true } });
  await prisma.expense.updateMany({ where: { propertyId: { in: [p1.id, p2.id] } }, data: { isDemo: true } });
  await prisma.asset.updateMany({ where: { propertyId: { in: [p1.id, p2.id] } }, data: { isDemo: true } });
  await prisma.maintenanceRequest.updateMany({ where: { propertyId: { in: [p1.id, p2.id] } }, data: { isDemo: true } });
  await prisma.workOrder.updateMany({ where: { propertyId: { in: [p1.id, p2.id] } }, data: { isDemo: true } });

  const n = await generateAlerts(org.id, today);
  console.log(`✓ Demo data created (2 properties, 10 units, 6 leases). Alerts generated: ${n}`);
  console.log(`  Demo users (password: ${DEMO_PASSWORD}):`);
  for (const [, email] of demoUsers) console.log(`   - ${email}`);
  console.log("   - owner@demo.gsw.om (owner portal view)\n   - tenant@demo.gsw.om (tenant portal)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
