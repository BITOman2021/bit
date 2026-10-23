import { z } from "zod";
import type { LeaseCharge } from "@/generated/prisma/client";
import type { ChargeType } from "@/generated/prisma/enums";
import { addDays, parseDateOnly, todayInZone } from "@/lib/dates";
import { type Baisa, fromBaisa, percentOf, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, assertPropertyAccess, type Ctx } from "../context";
import { prisma, type Tx } from "../db";
import { notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zDate, zId, zPositiveMoney, zStr, zText } from "../validation";
import { accountByKey, postJournal, reverseJournal } from "./accounting";
import { getSettings } from "./settings";

const INCOME_ACCOUNT: Record<ChargeType, string> = {
  RENT: "RENT_INCOME",
  SERVICE: "SERVICE_INCOME",
  LATE_FEE: "LATE_FEE_INCOME",
  OTHER: "OTHER_INCOME",
  // التأمين التزام وليس إيرادًا
  DEPOSIT: "DEPOSITS",
};

interface LeaseRef {
  id: string;
  number: string;
  tenantId: string;
  unitId: string;
  unit: { propertyId: string };
}

/**
 * ينشئ استحقاقًا ويرحّل قيده: مدين ذمم المستأجرين / دائن الإيراد (أو التأمينات) وضريبة المخرجات.
 * القيد مؤرخ بتاريخ الاستحقاق؛ لذا لا يظهر الإيراد في الفترات السابقة لاستحقاقه.
 */
export async function createAndPostCharge(
  tx: Tx,
  ctx: Pick<Ctx, "orgId" | "userId">,
  lease: LeaseRef,
  c: { type: ChargeType; dueDate: Date; periodStart?: Date; periodEnd?: Date; netAmount: Baisa; taxAmount?: Baisa; description?: string },
): Promise<LeaseCharge> {
  const tax = c.taxAmount ?? 0n;
  const amount = c.netAmount + tax;
  if (amount <= 0n) throw rule("مبلغ الاستحقاق يجب أن يكون أكبر من صفر / Charge amount must be positive");
  const number = await nextNumber(tx, ctx.orgId, SEQ.CHARGE, c.dueDate.getUTCFullYear());
  const charge = await tx.leaseCharge.create({
    data: {
      organizationId: ctx.orgId,
      number,
      leaseId: lease.id,
      type: c.type,
      description: c.description,
      dueDate: c.dueDate,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      netAmount: fromBaisa(c.netAmount),
      taxAmount: fromBaisa(tax),
      amount: fromBaisa(amount),
      createdById: ctx.userId,
    },
  });
  const ar = await accountByKey(tx, ctx.orgId, "AR");
  const income = await accountByKey(tx, ctx.orgId, INCOME_ACCOUNT[c.type]);
  const tag = { propertyId: lease.unit.propertyId, unitId: lease.unitId, tenantId: lease.tenantId };
  const lines = [
    { accountId: ar.id, debit: amount, ...tag, description: `${number} ${lease.number}` },
    { accountId: income.id, credit: c.netAmount, ...tag, description: `${number} ${lease.number}` },
  ];
  if (tax > 0n) {
    const vat = await accountByKey(tx, ctx.orgId, "VAT_OUTPUT");
    lines.push({ accountId: vat.id, credit: tax, ...tag, description: `VAT ${number}` });
  }
  const entry = await postJournal(tx, ctx, {
    date: c.dueDate,
    memo: `استحقاق ${c.type} ${number} — عقد ${lease.number} / Charge`,
    source: "CHARGE",
    sourceKey: `CHARGE:${charge.id}`,
    lines,
  });
  return tx.leaseCharge.update({ where: { id: charge.id }, data: { journalEntryId: entry.id } });
}

/** يلغي استحقاقًا غير مدفوع ويعكس قيده (لا حذف) */
export async function voidChargeTx(tx: Tx, ctx: Pick<Ctx, "orgId" | "userId">, chargeId: string, reason: string, date?: Date) {
  const charge = await tx.leaseCharge.findFirst({ where: { id: chargeId, organizationId: ctx.orgId } });
  if (!charge) throw notFound();
  if (charge.status === "VOID") throw rule("الاستحقاق ملغى مسبقًا / Charge already void");
  if (toBaisa(charge.paidAmount) > 0n) throw rule("لا يمكن إلغاء استحقاق عليه مدفوعات؛ ألغِ الدفعة أولًا / Cannot void a charge with payments; void the payment first");
  if (charge.journalEntryId) {
    await reverseJournal(tx, ctx, charge.journalEntryId, { reason: `إلغاء استحقاق ${charge.number}: ${reason}`, date: date ?? charge.dueDate, source: "CHARGE_VOID" });
  }
  return tx.leaseCharge.update({ where: { id: chargeId }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason } });
}

const addChargeSchema = z.object({
  leaseId: zId,
  type: z.enum(["SERVICE", "OTHER", "LATE_FEE"]),
  amount: zPositiveMoney,
  dueDate: zDate,
  description: zStr(300),
});

/** إضافة استحقاق يدوي (رسوم خدمة، رسوم تأخير معتمدة، أخرى) */
export async function addManualCharge(ctx: Ctx, input: unknown) {
  assertCan(ctx, "charge.write");
  const v = parse(addChargeSchema, input);
  return prisma.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({ where: { id: v.leaseId, organizationId: ctx.orgId }, include: { unit: true } });
    if (!lease) throw notFound();
    assertPropertyAccess(ctx, lease.unit.propertyId);
    if (lease.status !== "ACTIVE") throw rule("يمكن إضافة استحقاقات للعقود السارية فقط / Charges can only be added to active leases");
    if (v.type === "LATE_FEE") {
      const settings = await getSettings(ctx.orgId, tx);
      if (!settings["lateFees.enabled"]) throw rule("رسوم التأخير غير مفعلة في إعدادات النظام / Late fees are disabled in system settings");
      if (!lease.lateFeeEnabled) throw rule("العقد لا ينص على رسوم تأخير / The lease does not provide for late fees");
      const cutoff = addDays(todayInZone(ctx.timezone), -lease.gracePeriodDays);
      const overdue = await tx.leaseCharge.count({ where: { leaseId: lease.id, status: { in: ["OPEN", "PARTIAL"] }, type: "RENT", dueDate: { lt: cutoff } } });
      if (!overdue) throw rule("لا توجد متأخرات تتجاوز فترة السماح / No arrears beyond the grace period");
      if (toBaisa(lease.lateFeeAmount) > 0n && toBaisa(v.amount) > toBaisa(lease.lateFeeAmount)) {
        throw rule(`رسوم التأخير تتجاوز المبلغ المتفق عليه في العقد (${lease.lateFeeAmount}) / Exceeds the contractual late fee`);
      }
    }
    const net = toBaisa(v.amount);
    const tax = v.type === "LATE_FEE" ? 0n : percentOf(net, lease.vatRate.toString());
    const charge = await createAndPostCharge(tx, ctx, lease, { type: v.type, dueDate: parseDateOnly(v.dueDate), netAmount: net, taxAmount: tax, description: v.description });
    await audit(tx, ctx, { action: "charge.create", entityType: "LeaseCharge", entityId: charge.id, summary: `${charge.number} ${v.type} ${v.amount}`, after: charge });
    return charge;
  });
}

export async function voidCharge(ctx: Ctx, input: unknown) {
  assertCan(ctx, "charge.write");
  const v = parse(z.object({ chargeId: zId, reason: zText(500).refine((x) => !!x, "السبب مطلوب / Reason required") }), input);
  return prisma.$transaction(async (tx) => {
    const c = await tx.leaseCharge.findFirst({ where: { id: v.chargeId, organizationId: ctx.orgId }, include: { lease: { include: { unit: true } } } });
    if (!c) throw notFound();
    assertPropertyAccess(ctx, c.lease.unit.propertyId);
    const res = await voidChargeTx(tx, ctx, v.chargeId, v.reason!);
    await audit(tx, ctx, { action: "charge.void", entityType: "LeaseCharge", entityId: c.id, summary: `${c.number}: ${v.reason}`, before: c, after: res });
    return res;
  });
}
