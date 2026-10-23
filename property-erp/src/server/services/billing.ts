import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { allocateFifo, chargeStatus } from "@/lib/allocation";
import { parseDateOnly, todayInZone } from "@/lib/dates";
import { type Baisa, fromBaisa, sum, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, assertPropertyAccess, type Ctx, scopeIn } from "../context";
import { prisma, type Tx } from "../db";
import { notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zDate, zId, zOptId, zOptStr, zPositiveMoney, zText } from "../validation";
import { accountByKey, cashAccountFor, postJournal, reverseJournal } from "./accounting";
import { requestApproval } from "./approval-core";
import { tenantScope } from "./tenants";

export const paymentSchema = z.object({
  tenantId: zId,
  leaseId: zOptId,
  amount: zPositiveMoney,
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"]),
  receivedDate: zDate,
  reference: zOptStr(200),
  bankAccountId: zOptId,
  notes: zText(1000),
  /** يُولَّد في النموذج عند عرضه؛ إعادة الإرسال بنفس المفتاح لا تُنشئ دفعة جديدة */
  idempotencyKey: z.string().min(8).max(100),
  /** اختياري: استحقاقات محددة بالترتيب؛ وإلا يُوزع على الأقدم أولًا */
  chargeIds: z.array(z.string().max(40)).optional(),
});

async function lockCharges(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  // قفل صفوف الاستحقاقات لمنع التخصيص المتزامن لنفس الاستحقاق
  await tx.$queryRaw`SELECT "id" FROM "lease_charges" WHERE "id" = ANY(${ids}) FOR UPDATE`;
}

async function applyAllocations(tx: Tx, paymentId: string, allocations: { chargeId: string; amount: Baisa }[]) {
  for (const a of allocations) {
    const c = await tx.leaseCharge.findUniqueOrThrow({ where: { id: a.chargeId } });
    const newPaid = toBaisa(c.paidAmount) + a.amount;
    if (newPaid > toBaisa(c.amount)) throw rule(`التخصيص يتجاوز رصيد الاستحقاق ${c.number} / Allocation exceeds charge balance`);
    await tx.paymentAllocation.create({ data: { paymentId, chargeId: a.chargeId, amount: fromBaisa(a.amount) } });
    await tx.leaseCharge.update({ where: { id: c.id }, data: { paidAmount: fromBaisa(newPaid), status: chargeStatus(toBaisa(c.amount), newPaid) } });
    if (c.type === "DEPOSIT") {
      const dep = await tx.deposit.findFirst({ where: { leaseId: c.leaseId }, orderBy: { createdAt: "desc" } });
      if (dep) {
        const received = toBaisa(dep.received) + a.amount;
        await tx.deposit.update({ where: { id: dep.id }, data: { received: fromBaisa(received), status: received >= toBaisa(dep.required) ? "HELD" : "PENDING" } });
      }
    }
  }
}

/**
 * تسجيل تحصيل: يوزّع على الاستحقاقات، يصدر إيصالًا مستقلًا، ويرحّل قيد (مدين نقدية/بنك — دائن ذمم المستأجرين).
 * لا يُسجل الإيراد هنا (سُجل عند الاستحقاق) لذا لا يُحتسب الإيراد مرتين.
 */
export async function recordPayment(ctx: Ctx, input: unknown) {
  assertCan(ctx, "payment.write");
  const v = parse(paymentSchema, input);
  const existing = await prisma.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.orgId, idempotencyKey: v.idempotencyKey } }, include: { receipt: true } });
  if (existing) return { payment: existing, duplicate: true };

  try {
    const payment = await prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findFirst({ where: { AND: [{ id: v.tenantId }, tenantScope(ctx)] } });
        if (!tenant) throw notFound("المستأجر غير موجود / Tenant not found");
        let lease = null;
        if (v.leaseId) {
          lease = await tx.lease.findFirst({ where: { id: v.leaseId, tenantId: v.tenantId, organizationId: ctx.orgId }, include: { unit: true } });
          if (!lease) throw rule("العقد لا يخص المستأجر / Lease does not belong to tenant");
          assertPropertyAccess(ctx, lease.unit.propertyId);
        }
        const receivedDate = parseDateOnly(v.receivedDate);
        if (receivedDate > todayInZone(ctx.timezone)) throw rule("لا يمكن تسجيل تحصيل بتاريخ مستقبلي / Collection date cannot be in the future");

        const open = await tx.leaseCharge.findMany({
          where: {
            organizationId: ctx.orgId,
            status: { in: ["OPEN", "PARTIAL"] },
            lease: { tenantId: v.tenantId, id: v.leaseId ?? undefined, status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] }, unit: { propertyId: scopeIn(ctx) } },
            id: v.chargeIds?.length ? { in: v.chargeIds } : undefined,
          },
          include: { lease: { include: { unit: true } } },
        });
        await lockCharges(tx, open.map((c) => c.id));
        const fresh = await tx.leaseCharge.findMany({ where: { id: { in: open.map((c) => c.id) } } });
        const byId = new Map(open.map((c) => [c.id, c]));
        const ordered = v.chargeIds?.length ? v.chargeIds.map((id) => fresh.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c) : fresh;
        const amount = toBaisa(v.amount);
        const { allocations, unallocated } = allocateFifo(
          amount,
          ordered.map((c) => ({ id: c.id, dueDate: c.dueDate, amount: toBaisa(c.amount), paid: toBaisa(c.paidAmount), type: c.type })),
          { preserveOrder: !!v.chargeIds?.length },
        );

        const number = await nextNumber(tx, ctx.orgId, SEQ.PAYMENT, receivedDate.getUTCFullYear());
        const p = await tx.payment.create({
          data: {
            organizationId: ctx.orgId,
            number,
            tenantId: v.tenantId,
            leaseId: v.leaseId ?? null,
            amount: v.amount,
            unallocated: fromBaisa(unallocated),
            method: v.method,
            receivedDate,
            reference: v.reference,
            bankAccountId: v.bankAccountId ?? null,
            notes: v.notes,
            idempotencyKey: v.idempotencyKey,
            createdById: ctx.userId,
          },
        });
        await applyAllocations(tx, p.id, allocations);

        // قيد التحصيل مقسّم حسب العقار لدقة تقارير العقارات
        const cash = await cashAccountFor(tx, ctx.orgId, v.method, v.bankAccountId);
        const ar = await accountByKey(tx, ctx.orgId, "AR");
        const perProperty = new Map<string, { propertyId: string | null; unitId: string | null; amount: Baisa }>();
        for (const a of allocations) {
          const c = byId.get(a.chargeId)!;
          const key = c.lease.unit.propertyId;
          const cur = perProperty.get(key) ?? { propertyId: key, unitId: c.lease.unitId, amount: 0n };
          cur.amount += a.amount;
          perProperty.set(key, cur);
        }
        if (unallocated > 0n) {
          const fallback = lease ?? (await tx.lease.findFirst({ where: { tenantId: v.tenantId }, orderBy: { startDate: "desc" }, include: { unit: true } }));
          const key = fallback?.unit.propertyId ?? "__none__";
          const cur = perProperty.get(key) ?? { propertyId: fallback?.unit.propertyId ?? null, unitId: fallback?.unitId ?? null, amount: 0n };
          cur.amount += unallocated;
          perProperty.set(key, cur);
        }
        const lines = [...perProperty.values()].flatMap((g) => [
          { accountId: cash, debit: g.amount, propertyId: g.propertyId, unitId: g.unitId, tenantId: v.tenantId, description: number },
          { accountId: ar.id, credit: g.amount, propertyId: g.propertyId, unitId: g.unitId, tenantId: v.tenantId, description: number },
        ]);
        const entry = await postJournal(tx, ctx, { date: receivedDate, memo: `تحصيل ${number} — ${tenant.name} / Collection`, source: "PAYMENT", sourceKey: `PAYMENT:${p.id}`, lines });
        const receiptNo = await nextNumber(tx, ctx.orgId, SEQ.RECEIPT, receivedDate.getUTCFullYear());
        await tx.receipt.create({ data: { organizationId: ctx.orgId, number: receiptNo, paymentId: p.id } });
        const result = await tx.payment.update({ where: { id: p.id }, data: { journalEntryId: entry.id }, include: { receipt: true } });
        await audit(tx, ctx, {
          action: "payment.record",
          entityType: "Payment",
          entityId: p.id,
          summary: `${number} ${v.amount} OMR — ${tenant.name}; receipt ${receiptNo}`,
          after: { ...v, allocations: allocations.map((a) => ({ chargeId: a.chargeId, amount: fromBaisa(a.amount) })), unallocated: fromBaisa(unallocated) },
        });
        return result;
      },
      { timeout: 30000 },
    );
    return { payment, duplicate: false };
  } catch (e) {
    // سباق على نفس مفتاح منع التكرار: نعيد الدفعة الموجودة
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await prisma.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.orgId, idempotencyKey: v.idempotencyKey } }, include: { receipt: true } });
      if (dup) return { payment: dup, duplicate: true };
    }
    throw e;
  }
}

/** تطبيق الرصيد الدائن (غير المخصص) لدفعة على استحقاقات مفتوحة. لا يتطلب قيدًا جديدًا. */
export async function applyPaymentCredit(ctx: Ctx, paymentId: string) {
  assertCan(ctx, "payment.write");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
    const p = await tx.payment.findFirst({ where: { id: paymentId, organizationId: ctx.orgId } });
    if (!p) throw notFound();
    if (p.status !== "POSTED") throw rule("الدفعة ملغاة / Payment is void");
    const credit = toBaisa(p.unallocated);
    if (credit <= 0n) throw rule("لا يوجد رصيد غير مخصص / No unallocated credit");
    const open = await tx.leaseCharge.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] }, lease: { tenantId: p.tenantId, id: p.leaseId ?? undefined, unit: { propertyId: scopeIn(ctx) } } },
    });
    await lockCharges(tx, open.map((c) => c.id));
    const fresh = await tx.leaseCharge.findMany({ where: { id: { in: open.map((c) => c.id) } } });
    const { allocations, unallocated } = allocateFifo(credit, fresh.map((c) => ({ id: c.id, dueDate: c.dueDate, amount: toBaisa(c.amount), paid: toBaisa(c.paidAmount) })));
    if (!allocations.length) throw rule("لا توجد استحقاقات مفتوحة / No open charges");
    await applyAllocations(tx, p.id, allocations);
    await tx.payment.update({ where: { id: p.id }, data: { unallocated: fromBaisa(unallocated) } });
    await audit(tx, ctx, { action: "payment.apply_credit", entityType: "Payment", entityId: p.id, summary: `${p.number} applied ${fromBaisa(credit - unallocated)}` });
  });
}

/** إلغاء دفعة: عكس التخصيصات والقيد، وإلغاء الإيصال. السجل الأصلي يبقى. */
export async function voidPayment(ctx: Ctx, input: unknown) {
  assertCan(ctx, "payment.void");
  const v = parse(z.object({ paymentId: zId, reason: zText(500).refine((x) => !!x && x.length >= 3, "السبب مطلوب / Reason required") }), input);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${v.paymentId} FOR UPDATE`;
    const p = await tx.payment.findFirst({ where: { id: v.paymentId, organizationId: ctx.orgId }, include: { allocations: { where: { reversedAt: null }, include: { charge: { include: { lease: { include: { unit: true } } } } } } } });
    if (!p) throw notFound();
    if (p.status !== "POSTED") throw rule("الدفعة ملغاة مسبقًا / Payment already void");
    for (const a of p.allocations) assertPropertyAccess(ctx, a.charge.lease.unit.propertyId);
    const refunds = await tx.refund.count({ where: { paymentId: p.id, status: { not: "REJECTED" } } });
    if (refunds) throw rule("يوجد استرداد مرتبط بهذه الدفعة / A refund is linked to this payment");

    await lockCharges(tx, p.allocations.map((a) => a.chargeId));
    for (const a of p.allocations) {
      const c = await tx.leaseCharge.findUniqueOrThrow({ where: { id: a.chargeId } });
      const newPaid = toBaisa(c.paidAmount) - toBaisa(a.amount);
      await tx.leaseCharge.update({ where: { id: c.id }, data: { paidAmount: fromBaisa(newPaid), status: c.status === "VOID" ? "VOID" : chargeStatus(toBaisa(c.amount), newPaid) } });
      await tx.paymentAllocation.update({ where: { id: a.id }, data: { reversedAt: new Date() } });
      if (c.type === "DEPOSIT") {
        const dep = await tx.deposit.findFirst({ where: { leaseId: c.leaseId }, orderBy: { createdAt: "desc" } });
        if (dep) {
          const received = toBaisa(dep.received) - toBaisa(a.amount);
          if (received < toBaisa(dep.deducted) + toBaisa(dep.refunded)) throw rule("تم رد/استقطاع التأمين؛ لا يمكن إلغاء الدفعة / Deposit already refunded/deducted");
          await tx.deposit.update({ where: { id: dep.id }, data: { received: fromBaisa(received), status: received >= toBaisa(dep.required) && received > 0n ? "HELD" : "PENDING" } });
        }
      }
    }
    if (p.journalEntryId) await reverseJournal(tx, ctx, p.journalEntryId, { reason: `إلغاء دفعة ${p.number}: ${v.reason}`, date: todayInZone(ctx.timezone), source: "PAYMENT_VOID" });
    await tx.receipt.updateMany({ where: { paymentId: p.id }, data: { voidedAt: new Date() } });
    const res = await tx.payment.update({ where: { id: p.id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: v.reason, voidedById: ctx.userId, unallocated: "0" } });
    await audit(tx, ctx, { action: "payment.void", entityType: "Payment", entityId: p.id, summary: `${p.number}: ${v.reason}`, before: p, after: res });
    return res;
  });
}

export async function listPayments(ctx: Ctx, f: { q?: string; from?: string; to?: string; status?: string; tenantId?: string } = {}) {
  assertCan(ctx, "finance.read");
  return prisma.payment.findMany({
    where: {
      organizationId: ctx.orgId,
      tenantId: f.tenantId,
      tenant: ctx.propertyIds === null ? undefined : tenantScope(ctx),
      status: f.status === "VOIDED" ? "VOIDED" : f.status === "POSTED" ? "POSTED" : undefined,
      receivedDate: { gte: f.from ? parseDateOnly(f.from) : undefined, lte: f.to ? parseDateOnly(f.to) : undefined },
      OR: f.q ? [{ number: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }, { tenant: { name: { contains: f.q, mode: "insensitive" } } }, { receipt: { number: { contains: f.q, mode: "insensitive" } } }] : undefined,
    },
    include: { tenant: { select: { id: true, name: true } }, receipt: true, lease: { select: { number: true } } },
    orderBy: [{ receivedDate: "desc" }, { number: "desc" }],
    take: 500,
  });
}

export async function getPayment(ctx: Ctx, id: string) {
  const p = await prisma.payment.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      tenant: true,
      receipt: true,
      lease: { include: { unit: { include: { property: true } } } },
      allocations: { include: { charge: true } },
      journalEntry: { include: { lines: { include: { account: true } } } },
      bankAccount: true,
    },
  });
  if (!p) throw notFound();
  if (ctx.roleKey === "TENANT") {
    if (p.tenantId !== ctx.tenantId) throw notFound();
  } else {
    assertCan(ctx, "finance.read");
    if (p.lease) assertPropertyAccess(ctx, p.lease.unit.propertyId);
  }
  return p;
}

/** المتأخرات: استحقاقات مستحقة غير مسددة حتى تاريخ معين */
export async function arrears(ctx: Ctx, f: { asOf?: Date; propertyId?: string } = {}) {
  assertCan(ctx, "finance.read");
  const asOf = f.asOf ?? todayInZone(ctx.timezone);
  const charges = await prisma.leaseCharge.findMany({
    where: {
      organizationId: ctx.orgId,
      status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lt: asOf },
      lease: { unit: { propertyId: f.propertyId ?? scopeIn(ctx) } },
    },
    include: { lease: { include: { tenant: { select: { id: true, name: true, phone: true } }, unit: { include: { property: { select: { id: true, name: true, code: true } } } } } } },
    orderBy: { dueDate: "asc" },
  });
  return charges.map((c) => {
    const days = Math.floor((asOf.getTime() - c.dueDate.getTime()) / 86400000);
    const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    return { ...c, balance: toBaisa(c.amount) - toBaisa(c.paidAmount), daysOverdue: days, bucket };
  });
}

// ------------------------- التأمينات والمبالغ المستردة -------------------------

const refundSchema = z.object({
  kind: z.enum(["DEPOSIT_REFUND", "DEPOSIT_DEDUCTION", "OVERPAYMENT_REFUND"]),
  depositId: zOptId,
  paymentId: zOptId,
  amount: zPositiveMoney,
  date: zDate,
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"]).default("BANK_TRANSFER"),
  bankAccountId: zOptId,
  reason: z.string().min(3).max(1000),
});

async function pendingRefundTotal(tx: Tx, where: Prisma.RefundWhereInput) {
  const rows = await tx.refund.findMany({ where: { ...where, status: "PENDING_APPROVAL" } });
  return sum(rows.map((r) => toBaisa(r.amount)));
}

/** طلب رد/استقطاع تأمين أو رد مبلغ زائد — يتطلب اعتمادًا قبل الترحيل */
export async function requestRefund(ctx: Ctx, input: unknown) {
  assertCan(ctx, "refund.write");
  const v = parse(refundSchema, input);
  const amount = toBaisa(v.amount);
  return prisma.$transaction(async (tx) => {
    let tenantId: string;
    let propertyId: string | null = null;
    if (v.kind === "OVERPAYMENT_REFUND") {
      if (!v.paymentId) throw rule("الدفعة مطلوبة / Payment is required");
      const p = await tx.payment.findFirst({ where: { id: v.paymentId, organizationId: ctx.orgId, status: "POSTED" }, include: { lease: { include: { unit: true } } } });
      if (!p) throw notFound();
      const available = toBaisa(p.unallocated) - (await pendingRefundTotal(tx, { paymentId: p.id }));
      if (amount > available) throw rule(`المبلغ يتجاوز الرصيد الدائن المتاح (${fromBaisa(available)}) / Exceeds available credit`);
      tenantId = p.tenantId;
      propertyId = p.lease?.unit.propertyId ?? null;
    } else {
      if (!v.depositId) throw rule("التأمين مطلوب / Deposit is required");
      const d = await tx.deposit.findFirst({ where: { id: v.depositId, organizationId: ctx.orgId }, include: { lease: { include: { unit: true } } } });
      if (!d) throw notFound();
      if (d.status === "TRANSFERRED") throw rule("تم نقل التأمين إلى عقد التجديد / Deposit transferred to renewal");
      const available = toBaisa(d.received) - toBaisa(d.deducted) - toBaisa(d.refunded) - (await pendingRefundTotal(tx, { depositId: d.id }));
      if (amount > available) throw rule(`المبلغ يتجاوز التأمين المتاح (${fromBaisa(available)}) / Exceeds deposit held`);
      tenantId = d.tenantId;
      propertyId = d.lease.unit.propertyId;
    }
    if (propertyId) assertPropertyAccess(ctx, propertyId);
    const number = await nextNumber(tx, ctx.orgId, SEQ.REFUND);
    const refund = await tx.refund.create({
      data: {
        organizationId: ctx.orgId,
        number,
        kind: v.kind,
        tenantId,
        depositId: v.depositId ?? null,
        paymentId: v.paymentId ?? null,
        amount: v.amount,
        date: parseDateOnly(v.date),
        method: v.method,
        bankAccountId: v.bankAccountId ?? null,
        reason: v.reason,
        createdById: ctx.userId,
      },
    });
    const approval = await requestApproval(tx, ctx, { type: "REFUND", entityId: refund.id, amount, summary: `${number} ${v.kind} ${v.amount} OMR: ${v.reason}`, propertyId });
    await tx.refund.update({ where: { id: refund.id }, data: { approvalId: approval.id } });
    await audit(tx, ctx, { action: "refund.request", entityType: "Refund", entityId: refund.id, summary: `${number} ${v.kind} ${v.amount}` });
    return refund;
  });
}

/** يُستدعى عند اعتماد طلب الاسترداد */
export async function postRefundTx(tx: Tx, ctx: Ctx, refundId: string) {
  const r = await tx.refund.findFirst({ where: { id: refundId, organizationId: ctx.orgId } });
  if (!r) throw notFound();
  if (r.status !== "PENDING_APPROVAL") throw rule("الطلب ليس بانتظار الاعتماد / Not pending");
  const amount = toBaisa(r.amount);
  let propertyId: string | null = null;
  let unitId: string | null = null;
  const lines = [];
  if (r.kind === "OVERPAYMENT_REFUND") {
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${r.paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: r.paymentId! }, include: { lease: { include: { unit: true } } } });
    if (toBaisa(p.unallocated) < amount) throw rule("الرصيد الدائن غير كافٍ / Insufficient credit");
    await tx.payment.update({ where: { id: p.id }, data: { unallocated: fromBaisa(toBaisa(p.unallocated) - amount) } });
    propertyId = p.lease?.unit.propertyId ?? null;
    unitId = p.lease?.unitId ?? null;
    const ar = await accountByKey(tx, ctx.orgId, "AR");
    const cash = await cashAccountFor(tx, ctx.orgId, r.method, r.bankAccountId);
    lines.push({ accountId: ar.id, debit: amount }, { accountId: cash, credit: amount });
  } else {
    await tx.$queryRaw`SELECT "id" FROM "deposits" WHERE "id" = ${r.depositId} FOR UPDATE`;
    const d = await tx.deposit.findUniqueOrThrow({ where: { id: r.depositId! }, include: { lease: { include: { unit: true } } } });
    const available = toBaisa(d.received) - toBaisa(d.deducted) - toBaisa(d.refunded);
    if (amount > available) throw rule("التأمين المتاح غير كافٍ / Insufficient deposit");
    propertyId = d.lease.unit.propertyId;
    unitId = d.lease.unitId;
    const deposits = await accountByKey(tx, ctx.orgId, "DEPOSITS");
    if (r.kind === "DEPOSIT_REFUND") {
      const cash = await cashAccountFor(tx, ctx.orgId, r.method, r.bankAccountId);
      lines.push({ accountId: deposits.id, debit: amount }, { accountId: cash, credit: amount });
      const refunded = toBaisa(d.refunded) + amount;
      await tx.deposit.update({ where: { id: d.id }, data: { refunded: fromBaisa(refunded), status: refunded + toBaisa(d.deducted) >= toBaisa(d.received) ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    } else {
      // الاستقطاع (مثل الأضرار) يصبح إيرادًا فقط عند اعتماده
      const income = await accountByKey(tx, ctx.orgId, "DEPOSIT_DEDUCTION_INCOME");
      lines.push({ accountId: deposits.id, debit: amount }, { accountId: income.id, credit: amount });
      const deducted = toBaisa(d.deducted) + amount;
      await tx.deposit.update({ where: { id: d.id }, data: { deducted: fromBaisa(deducted), status: deducted + toBaisa(d.refunded) >= toBaisa(d.received) ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    }
  }
  const entry = await postJournal(tx, ctx, {
    date: r.date,
    memo: `${r.kind} ${r.number}: ${r.reason}`,
    source: "REFUND",
    sourceKey: `REFUND:${r.id}`,
    lines: lines.map((l) => ({ ...l, propertyId, unitId, tenantId: r.tenantId, description: r.number })),
  });
  return tx.refund.update({ where: { id: r.id }, data: { status: "POSTED", journalEntryId: entry.id } });
}

export async function listDeposits(ctx: Ctx) {
  assertCan(ctx, "finance.read");
  return prisma.deposit.findMany({
    where: { organizationId: ctx.orgId, lease: { unit: { propertyId: scopeIn(ctx) } } },
    include: { lease: { include: { tenant: { select: { id: true, name: true } }, unit: { include: { property: { select: { name: true } } } } } }, refunds: true },
    orderBy: { createdAt: "desc" },
  });
}
