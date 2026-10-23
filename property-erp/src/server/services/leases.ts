import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, formatDateOnly, parseDateOnly, todayInZone } from "@/lib/dates";
import { generateRentSchedule } from "@/lib/lease-schedule";
import { fromBaisa, toBaisa } from "@/lib/money";
import { audit, toJsonSafe } from "../audit";
import { assertCan, assertPropertyAccess, type Ctx, scopeIn } from "../context";
import { prisma, type Tx } from "../db";
import { AppError, notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zBool, zDate, zId, zInt, zNonNegMoney, zOptId, zPositiveMoney, zText } from "../validation";
import { createAndPostCharge, voidChargeTx } from "./charges";
import { refreshUnitStatus } from "./properties";
import { getSettings } from "./settings";

export const leaseSchema = z
  .object({
    unitId: zId,
    tenantId: zId,
    templateId: zOptId,
    startDate: zDate,
    endDate: zDate,
    monthlyRent: zPositiveMoney,
    frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"]).default("BANK_TRANSFER"),
    depositAmount: zNonNegMoney.default("0"),
    depositTerms: zText(3000),
    vatRate: z.preprocess((v) => (v === "" || v == null ? "0" : v), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "نسبة غير صالحة / Invalid rate")),
    gracePeriodDays: zInt(0, 365).default(0),
    lateFeeEnabled: zBool.default(false),
    lateFeeAmount: zNonNegMoney.default("0"),
    renewalTerms: zText(5000),
    terminationTerms: zText(5000),
    specialTerms: zText(10000),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "تاريخ النهاية قبل البداية / End date is before start date", path: ["endDate"] });

type LeaseInput = z.infer<typeof leaseSchema>;

function leaseData(v: LeaseInput) {
  return {
    unitId: v.unitId,
    tenantId: v.tenantId,
    templateId: v.templateId ?? null,
    startDate: parseDateOnly(v.startDate),
    endDate: parseDateOnly(v.endDate),
    monthlyRent: v.monthlyRent,
    frequency: v.frequency,
    paymentMethod: v.paymentMethod,
    depositAmount: v.depositAmount,
    depositTerms: v.depositTerms ?? null,
    vatRate: v.vatRate,
    gracePeriodDays: v.gracePeriodDays,
    lateFeeEnabled: v.lateFeeEnabled,
    lateFeeAmount: v.lateFeeAmount,
    renewalTerms: v.renewalTerms ?? null,
    terminationTerms: v.terminationTerms ?? null,
    specialTerms: v.specialTerms ?? null,
  };
}

async function snapshot(tx: Tx, ctx: Ctx, leaseId: string, changeType: string, reason?: string) {
  const lease = await tx.lease.findUniqueOrThrow({ where: { id: leaseId } });
  const last = await tx.leaseVersion.findFirst({ where: { leaseId }, orderBy: { version: "desc" } });
  await tx.leaseVersion.create({
    data: { leaseId, version: (last?.version ?? 0) + 1, snapshot: toJsonSafe(lease) as object, changeType, reason, createdById: ctx.userId },
  });
}

async function validateParties(tx: Tx, ctx: Ctx, v: LeaseInput) {
  const unit = await tx.unit.findFirst({ where: { id: v.unitId, property: { organizationId: ctx.orgId } }, include: { property: true } });
  if (!unit || unit.archivedAt) throw notFound("الوحدة غير موجودة / Unit not found");
  assertPropertyAccess(ctx, unit.propertyId);
  if (unit.status === "INACTIVE") throw rule("الوحدة غير نشطة / Unit is inactive");
  const tenant = await tx.tenant.findFirst({ where: { id: v.tenantId, organizationId: ctx.orgId, archivedAt: null } });
  if (!tenant) throw notFound("المستأجر غير موجود / Tenant not found");
  if (v.templateId) {
    const t = await tx.leaseTemplate.findFirst({ where: { id: v.templateId, organizationId: ctx.orgId } });
    if (!t) throw notFound("القالب غير موجود / Template not found");
  }
  const settings = await getSettings(ctx.orgId, tx);
  if (Number(v.vatRate) > 0 && !settings["tax.enabled"]) {
    throw rule("الضريبة غير مفعلة في الإعدادات؛ لا يمكن تطبيق نسبة ضريبة / Tax is disabled in settings");
  }
  return { unit, tenant };
}

export async function listLeases(ctx: Ctx, f: { q?: string; status?: string; propertyId?: string; expiringDays?: number } = {}) {
  assertCan(ctx, "lease.read");
  const today = todayInZone(ctx.timezone);
  const statuses = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED", "CANCELLED"] as const;
  return prisma.lease.findMany({
    where: {
      organizationId: ctx.orgId,
      unit: { propertyId: f.propertyId && (ctx.propertyIds === null || ctx.propertyIds.includes(f.propertyId)) ? f.propertyId : scopeIn(ctx) },
      status: f.status && (statuses as readonly string[]).includes(f.status) ? (f.status as (typeof statuses)[number]) : undefined,
      endDate: f.expiringDays ? { gte: today, lte: addDays(today, f.expiringDays) } : undefined,
      OR: f.q
        ? [{ number: { contains: f.q, mode: "insensitive" } }, { tenant: { name: { contains: f.q, mode: "insensitive" } } }, { unit: { unitNumber: { contains: f.q, mode: "insensitive" } } }]
        : undefined,
    },
    include: { tenant: { select: { id: true, name: true } }, unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true, code: true } } } } },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
    take: 1000,
  });
}

export async function getLease(ctx: Ctx, id: string) {
  const lease = await prisma.lease.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      tenant: true,
      unit: { include: { property: true, building: true, floor: true } },
      charges: { orderBy: [{ dueDate: "asc" }, { number: "asc" }], include: { allocations: { where: { reversedAt: null }, include: { payment: { include: { receipt: true } } } } } },
      deposits: { include: { refunds: true } },
      versions: { orderBy: { version: "desc" } },
      inspections: { orderBy: { date: "desc" } },
      previousLease: { select: { id: true, number: true } },
      renewalLease: { select: { id: true, number: true, status: true } },
      payments: { orderBy: { receivedDate: "desc" }, include: { receipt: true } },
    },
  });
  if (!lease) throw notFound();
  if (ctx.roleKey === "TENANT") {
    if (lease.tenantId !== ctx.tenantId) throw notFound();
  } else {
    assertCan(ctx, "lease.read");
    assertPropertyAccess(ctx, lease.unit.propertyId);
  }
  return lease;
}

export async function createLease(ctx: Ctx, input: unknown) {
  assertCan(ctx, "lease.write");
  const v = parse(leaseSchema, input);
  return prisma.$transaction(async (tx) => {
    await validateParties(tx, ctx, v);
    const number = await nextNumber(tx, ctx.orgId, SEQ.LEASE, parseDateOnly(v.startDate).getUTCFullYear());
    const lease = await tx.lease.create({ data: { organizationId: ctx.orgId, number, ...leaseData(v), createdById: ctx.userId } });
    await snapshot(tx, ctx, lease.id, "CREATED");
    await audit(tx, ctx, { action: "lease.create", entityType: "Lease", entityId: lease.id, summary: number, after: lease });
    return lease;
  });
}

/** تعديل مسودة فقط؛ العقد الساري لا يُعدّل (يُجدد أو يُنهى) */
export async function updateDraftLease(ctx: Ctx, id: string, input: unknown, reason?: string) {
  assertCan(ctx, "lease.write");
  const v = parse(leaseSchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.lease.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true } });
    if (!before) throw notFound();
    assertPropertyAccess(ctx, before.unit.propertyId);
    if (before.status !== "DRAFT") throw rule("لا يمكن تعديل عقد غير مسودة؛ استخدم التجديد / Only draft leases can be edited; use renewal");
    await validateParties(tx, ctx, v);
    const lease = await tx.lease.update({ where: { id }, data: leaseData(v) });
    await snapshot(tx, ctx, id, "AMENDED", reason);
    await audit(tx, ctx, { action: "lease.update", entityType: "Lease", entityId: id, summary: lease.number, before, after: lease });
    return lease;
  });
}

/**
 * اعتماد وتفعيل العقد: يولّد جدول الاستحقاقات ويرحّل قيودها ويسجل التأمين المطلوب،
 * ويضبط حالة الوحدة. كل ذلك داخل معاملة واحدة.
 */
export async function activateLease(ctx: Ctx, id: string) {
  assertCan(ctx, "lease.approve");
  return prisma.$transaction(
    async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true, previousLease: { include: { deposits: true } } } });
      if (!lease) throw notFound();
      assertPropertyAccess(ctx, lease.unit.propertyId);
      if (lease.status !== "DRAFT") throw rule("العقد ليس مسودة / Lease is not a draft");
      if (lease.unit.status === "INACTIVE" || lease.unit.archivedAt) throw rule("الوحدة غير نشطة / Unit is inactive");
      const overlap = await tx.lease.findFirst({
        where: { unitId: lease.unitId, status: "ACTIVE", startDate: { lte: lease.endDate }, endDate: { gte: lease.startDate } },
      });
      if (overlap) throw new AppError("CONFLICT", `يوجد عقد سارٍ متداخل (${overlap.number}) / Overlapping active lease`);

      const schedule = generateRentSchedule({
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: toBaisa(lease.monthlyRent),
        frequency: lease.frequency,
        vatRate: lease.vatRate.toString(),
      });
      for (const p of schedule) {
        await createAndPostCharge(tx, ctx, lease, {
          type: "RENT",
          dueDate: p.dueDate,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          netAmount: p.netAmount,
          taxAmount: p.taxAmount,
          description: `${formatDateOnly(p.periodStart)} → ${formatDateOnly(p.periodEnd)}`,
        });
      }

      const depositRequired = toBaisa(lease.depositAmount);
      const prevDeposit = lease.previousLease?.deposits.find((d) => d.status === "HELD" || d.status === "PARTIALLY_REFUNDED");
      if (lease.carryOverDeposit && prevDeposit) {
        // نقل التأمين المحتفظ به من العقد السابق دون حركة نقدية
        const held = toBaisa(prevDeposit.received) - toBaisa(prevDeposit.deducted) - toBaisa(prevDeposit.refunded);
        await tx.deposit.update({ where: { id: prevDeposit.id }, data: { status: "TRANSFERRED" } });
        await tx.deposit.create({
          data: {
            organizationId: ctx.orgId,
            leaseId: lease.id,
            tenantId: lease.tenantId,
            required: fromBaisa(depositRequired),
            received: fromBaisa(held),
            status: held >= depositRequired ? "HELD" : "PENDING",
            transferredFromId: prevDeposit.id,
          },
        });
        if (depositRequired > held) {
          await createAndPostCharge(tx, ctx, lease, { type: "DEPOSIT", dueDate: lease.startDate, netAmount: depositRequired - held, description: "فرق التأمين / Deposit top-up" });
        }
      } else if (depositRequired > 0n) {
        await tx.deposit.create({ data: { organizationId: ctx.orgId, leaseId: lease.id, tenantId: lease.tenantId, required: fromBaisa(depositRequired) } });
        await createAndPostCharge(tx, ctx, lease, { type: "DEPOSIT", dueDate: lease.startDate, netAmount: depositRequired, description: "تأمين العقد / Security deposit" });
      }

      const updated = await tx.lease.update({ where: { id }, data: { status: "ACTIVE", approvedById: ctx.userId, approvedAt: new Date() } });
      await refreshUnitStatus(tx, lease.unitId);
      await snapshot(tx, ctx, id, "ACTIVATED");
      await audit(tx, ctx, { action: "lease.activate", entityType: "Lease", entityId: id, summary: `${lease.number}: ${schedule.length} charges` });
      return updated;
    },
    { timeout: 60000 },
  );
}

export async function cancelDraftLease(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "lease.write");
  return prisma.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true } });
    if (!lease) throw notFound();
    assertPropertyAccess(ctx, lease.unit.propertyId);
    if (lease.status !== "DRAFT") throw rule("يمكن إلغاء المسودات فقط / Only drafts can be cancelled");
    await tx.lease.update({ where: { id }, data: { status: "CANCELLED", terminationReason: reason } });
    await snapshot(tx, ctx, id, "CANCELLED", reason);
    await audit(tx, ctx, { action: "lease.cancel", entityType: "Lease", entityId: id, summary: `${lease.number}: ${reason}` });
  });
}

const renewSchema = z
  .object({
    endDate: zDate,
    monthlyRent: zPositiveMoney,
    frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
    depositAmount: zNonNegMoney,
    carryOverDeposit: zBool.default(true),
    reason: zText(1000),
  });

/**
 * التجديد: ينشئ عقدًا جديدًا (مسودة) مرتبطًا بالعقد الأصلي، يبدأ في اليوم التالي لنهايته.
 * العقد الأصلي وسجله التاريخي لا يتغيران. زيادة الإيجار ليست آلية: يجب إدخالها واعتمادها.
 */
export async function renewLease(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "lease.write");
  const v = parse(renewSchema, input);
  return prisma.$transaction(async (tx) => {
    const prev = await tx.lease.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true, renewalLease: true } });
    if (!prev) throw notFound();
    assertPropertyAccess(ctx, prev.unit.propertyId);
    if (!["ACTIVE", "EXPIRED"].includes(prev.status)) throw rule("يمكن تجديد العقود السارية أو المنتهية فقط / Only active or expired leases can be renewed");
    if (prev.renewalLease && prev.renewalLease.status !== "CANCELLED") throw rule(`يوجد تجديد مسبق (${prev.renewalLease.number}) / Already renewed`);
    if (prev.renewalLease) {
      // تجديد ملغى سابقًا: نفك الارتباط للسماح بتجديد جديد
      await tx.lease.update({ where: { id: prev.renewalLease.id }, data: { previousLeaseId: null } });
    }
    const start = addDays(prev.endDate, 1);
    const end = parseDateOnly(v.endDate);
    if (end < start) throw rule("نهاية التجديد يجب أن تكون بعد نهاية العقد الحالي / Renewal must end after the current lease");
    const number = await nextNumber(tx, ctx.orgId, SEQ.LEASE, start.getUTCFullYear());
    const lease = await tx.lease.create({
      data: {
        organizationId: ctx.orgId,
        number,
        unitId: prev.unitId,
        tenantId: prev.tenantId,
        templateId: prev.templateId,
        startDate: start,
        endDate: end,
        monthlyRent: v.monthlyRent,
        frequency: v.frequency,
        paymentMethod: prev.paymentMethod,
        depositAmount: v.depositAmount,
        depositTerms: prev.depositTerms,
        vatRate: prev.vatRate,
        gracePeriodDays: prev.gracePeriodDays,
        lateFeeEnabled: prev.lateFeeEnabled,
        lateFeeAmount: prev.lateFeeAmount,
        renewalTerms: prev.renewalTerms,
        terminationTerms: prev.terminationTerms,
        specialTerms: prev.specialTerms,
        previousLeaseId: prev.id,
        carryOverDeposit: v.carryOverDeposit,
        createdById: ctx.userId,
      },
    });
    await snapshot(tx, ctx, lease.id, "RENEWAL_CREATED", v.reason ?? `Renewal of ${prev.number}`);
    await audit(tx, ctx, { action: "lease.renew", entityType: "Lease", entityId: lease.id, summary: `${prev.number} → ${number}` });
    return lease;
  });
}

/**
 * إنهاء العقد (بموافقة): يلغي الاستحقاقات المستقبلية غير المدفوعة ويعكس قيودها.
 * لا ينفذ أي إخلاء أو إجراء قانوني؛ هذا تسجيل إداري لإنهاء متفق عليه أو مقرر نظاميًا.
 */
export async function terminateLease(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "lease.approve");
  const v = parse(z.object({ date: zDate, reason: zText(2000).refine((x) => !!x && x.length >= 5, "السبب مطلوب / Reason required") }), input);
  return prisma.$transaction(
    async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true, charges: true } });
      if (!lease) throw notFound();
      assertPropertyAccess(ctx, lease.unit.propertyId);
      if (lease.status !== "ACTIVE") throw rule("العقد غير ساري / Lease is not active");
      const date = parseDateOnly(v.date);
      if (date < lease.startDate || date > lease.endDate) throw rule("تاريخ الإنهاء خارج مدة العقد / Termination date outside lease term");
      let voided = 0;
      const kept: string[] = [];
      for (const c of lease.charges) {
        if (c.status === "VOID" || c.type === "DEPOSIT" || c.dueDate <= date) continue;
        if (toBaisa(c.paidAmount) > 0n) {
          kept.push(c.number);
          continue;
        }
        await voidChargeTx(tx, ctx, c.id, `إنهاء العقد ${lease.number}`, date);
        voided++;
      }
      await tx.lease.update({ where: { id }, data: { status: "TERMINATED", terminatedAt: date, terminationReason: v.reason } });
      await refreshUnitStatus(tx, lease.unitId);
      await snapshot(tx, ctx, id, "TERMINATED", v.reason);
      await audit(tx, ctx, { action: "lease.terminate", entityType: "Lease", entityId: id, summary: `${lease.number} on ${v.date}: voided ${voided}; kept paid ${kept.join(",")}` });
      return { voided, keptPaid: kept };
    },
    { timeout: 60000 },
  );
}

/** مهمة دورية: تحويل العقود التي انتهت مدتها إلى "منتهية" وتحرير الوحدة */
export async function expireLeases(orgId: string, today: Date, db = prisma) {
  const due = await db.lease.findMany({ where: { organizationId: orgId, status: "ACTIVE", endDate: { lt: today } } });
  for (const l of due) {
    await db.$transaction(async (tx) => {
      await tx.lease.update({ where: { id: l.id }, data: { status: "EXPIRED" } });
      await refreshUnitStatus(tx, l.unitId);
      await audit(tx, { orgId, userId: null }, { action: "lease.expire", entityType: "Lease", entityId: l.id, summary: l.number });
    });
  }
  return due.length;
}

export async function leaseTotals(lease: { charges: { status: string; type: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; dueDate: Date }[] }, today: Date) {
  let billed = 0n;
  let paid = 0n;
  let overdue = 0n;
  let contractValue = 0n;
  for (const c of lease.charges) {
    if (c.status === "VOID") continue;
    const amt = toBaisa(c.amount);
    const pd = toBaisa(c.paidAmount);
    if (c.type === "RENT") contractValue += amt;
    if (c.dueDate <= today) billed += amt;
    paid += pd;
    if (c.dueDate < today) overdue += amt - pd;
  }
  return { contractValue, billedToDate: billed, paid, overdue };
}

// ------------------------- قوالب العقود -------------------------

export async function listTemplates(ctx: Ctx) {
  assertCan(ctx, "lease.read");
  return prisma.leaseTemplate.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } });
}

export async function saveTemplate(ctx: Ctx, input: unknown) {
  assertCan(ctx, "lease.write");
  const v = parse(z.object({ id: zOptId, name: z.string().min(2).max(200), language: z.enum(["ar", "en"]), body: z.string().min(10).max(50000) }), input);
  return prisma.$transaction(async (tx) => {
    const data = { name: v.name, language: v.language, body: v.body, isApproved: false, approvedAt: null, approvedById: null };
    const t = v.id
      ? await tx.leaseTemplate.update({ where: { id: (await tx.leaseTemplate.findFirstOrThrow({ where: { id: v.id, organizationId: ctx.orgId } })).id }, data })
      : await tx.leaseTemplate.create({ data: { ...data, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: "template.save", entityType: "LeaseTemplate", entityId: t.id, summary: t.name });
    return t;
  });
}

/** اعتماد القالب بعد المراجعة القانونية (من صلاحية lease.approve) */
export async function approveTemplate(ctx: Ctx, id: string) {
  assertCan(ctx, "lease.approve");
  const t = await prisma.leaseTemplate.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!t) throw notFound();
  await prisma.leaseTemplate.update({ where: { id }, data: { isApproved: true, approvedAt: new Date(), approvedById: ctx.userId } });
  await audit(prisma, ctx, { action: "template.approve", entityType: "LeaseTemplate", entityId: id, summary: t.name });
}

/** يملأ متغيرات القالب {{...}} من بيانات العقد */
export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `[${k}]`);
}
