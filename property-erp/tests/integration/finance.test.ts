import { beforeEach, describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { fromBaisa, toBaisa } from "@/lib/money";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { balanceSheet, createManualEntry, incomeStatement, reverseManualEntry, trialBalance } from "@/server/services/accounting";
import { decideApproval } from "@/server/services/approvals";
import { applyPaymentCredit, recordPayment, requestRefund, voidPayment } from "@/server/services/billing";
import { addManualCharge, voidCharge } from "@/server/services/charges";
import { renewLease, activateLease, terminateLease, createLease } from "@/server/services/leases";
import { createExpense, createInvoice, payInvoice, saveVendor, listExpenseCategories } from "@/server/services/purchasing";
import { updateSettings } from "@/server/services/settings";
import { runReport } from "@/server/services/reports";
import { createTenant } from "@/server/services/tenants";
import { key, makeActiveLease, makeProperty, setupWorld, type World } from "./helpers";

let w: World;

async function expectBalanced() {
  const tb = await trialBalance(w.admin);
  expect(tb.balanced).toBe(true);
  const bs = await balanceSheet(w.admin, parseDateOnly("2030-12-31"));
  expect(bs.balanced).toBe(true);
}

async function arBalance(asOf = "2030-12-31") {
  const tb = await trialBalance(w.admin, { to: parseDateOnly(asOf) });
  const row = tb.rows.find((r) => r.code === "1200");
  return row ? row.debit - row.credit : 0n;
}

beforeEach(async () => {
  w = await setupWorld();
});

describe("lease activation → charges and accruals", () => {
  it("creates 12 monthly charges + deposit, each posted once, books balanced", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease } = await makeActiveLease(w.admin, units[0].id);
    const charges = await prisma.leaseCharge.findMany({ where: { leaseId: lease.id } });
    expect(charges.filter((c) => c.type === "RENT")).toHaveLength(12);
    expect(charges.filter((c) => c.type === "DEPOSIT")).toHaveLength(1);
    expect(charges.every((c) => c.journalEntryId)).toBe(true);
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: units[0].id } }).then((u) => u.status)).toBe("OCCUPIED");
    await expectBalanced();

    // الإيراد السنوي = 12 × 450، والتأمين ليس إيرادًا
    const is = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-12-31") });
    expect(fromBaisa(is.totalIncome)).toBe("5400.000");
    const bs = await balanceSheet(w.admin, parseDateOnly("2026-12-31"));
    expect(fromBaisa(bs.liabilities.find((l) => l.code === "2200")!.balance)).toBe("450.000");

    // الإيراد المستقبلي لا يظهر في الفترات السابقة
    const jan = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-01-31") });
    expect(fromBaisa(jan.totalIncome)).toBe("450.000");
  });

  it("prevents overlapping active leases on the same unit", async () => {
    const { units } = await makeProperty(w.admin);
    await makeActiveLease(w.admin, units[0].id);
    const t2 = await createTenant(w.admin, { name: "Second Tenant" });
    const l2 = await createLease(w.admin, { unitId: units[0].id, tenantId: t2.id, startDate: "2026-06-01", endDate: "2027-05-31", monthlyRent: "500", frequency: "MONTHLY", vatRate: "0" });
    await expect(activateLease(w.admin, l2.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cannot activate the same lease twice", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease } = await makeActiveLease(w.admin, units[0].id);
    await expect(activateLease(w.admin, lease.id)).rejects.toBeInstanceOf(AppError);
    expect(await prisma.leaseCharge.count({ where: { leaseId: lease.id } })).toBe(13);
  });
});

describe("collections, partial payments, receipts and idempotency", () => {
  it("allocates a partial payment oldest-first and issues one receipt", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id);
    const { payment } = await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "700", method: "BANK_TRANSFER", receivedDate: "2026-01-05", idempotencyKey: key() });
    expect(payment.receipt?.number).toMatch(/^RCT-2026-/);
    const charges = await prisma.leaseCharge.findMany({ where: { leaseId: lease.id }, orderBy: [{ dueDate: "asc" }, { type: "asc" }] });
    const deposit = charges.find((c) => c.type === "DEPOSIT")!;
    const jan = charges.find((c) => c.type === "RENT" && c.dueDate.toISOString().startsWith("2026-01"))!;
    // ترتيب الاستحقاق نفس اليوم: الأقدم ثم المعرّف — مجموع التخصيص = 700
    expect(toBaisa(deposit.paidAmount) + toBaisa(jan.paidAmount)).toBe(toBaisa("700"));
    expect([deposit.status, jan.status].sort()).toEqual(["PAID", "PARTIAL"]);
    const dep = await prisma.deposit.findFirstOrThrow({ where: { leaseId: lease.id } });
    expect(toBaisa(dep.received)).toBe(toBaisa(deposit.paidAmount));
    await expectBalanced();
  });

  it("same idempotency key never records the payment twice (sequential and concurrent)", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id);
    const k = key();
    const input = { tenantId: tenant.id, leaseId: lease.id, amount: "450", method: "CASH", receivedDate: "2026-02-01", idempotencyKey: k };
    const a = await recordPayment(w.admin, input);
    const b = await recordPayment(w.admin, input);
    expect(b.duplicate).toBe(true);
    expect(b.payment.id).toBe(a.payment.id);

    const k2 = key();
    const results = await Promise.allSettled([1, 2, 3].map(() => recordPayment(w.admin, { ...input, idempotencyKey: k2 })));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThan(0);
    expect(await prisma.payment.count({ where: { idempotencyKey: k2 } })).toBe(1);
    expect(await prisma.payment.count()).toBe(2);
    expect(await prisma.receipt.count()).toBe(2);
    await expectBalanced();
  });

  it("concurrent payments never over-allocate a charge", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0", endDate: "2026-01-31" });
    await Promise.all([1, 2, 3].map(() => recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "300", method: "CASH", receivedDate: "2026-01-02", idempotencyKey: key() })));
    const c = await prisma.leaseCharge.findFirstOrThrow({ where: { leaseId: lease.id } });
    expect(fromBaisa(toBaisa(c.paidAmount))).toBe("450.000");
    const unalloc = await prisma.payment.findMany();
    expect(fromBaisa(unalloc.reduce((a, p) => a + toBaisa(p.unallocated), 0n))).toBe("450.000");
    await expectBalanced();
  });

  it("overpayment stays as tenant credit, can be applied later, and AR reflects it", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0", endDate: "2026-01-31" });
    const { payment } = await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "500", method: "CASH", receivedDate: "2026-01-02", idempotencyKey: key() });
    expect(fromBaisa(toBaisa(payment.unallocated))).toBe("50.000");
    expect(await arBalance()).toBe(toBaisa("-50"));
    await addManualCharge(w.admin, { leaseId: lease.id, type: "SERVICE", amount: "30", dueDate: "2026-01-20", description: "Cleaning" });
    await applyPaymentCredit(w.admin, payment.id);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(fromBaisa(toBaisa(p.unallocated))).toBe("20.000");
    expect(await arBalance()).toBe(toBaisa("-20"));
    await expectBalanced();
  });

  it("voiding a payment restores charges, reverses the entry, and keeps history", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0" });
    const arBefore = await arBalance();
    const { payment } = await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "450", method: "CASH", receivedDate: "2026-01-02", idempotencyKey: key() });
    await voidPayment(w.admin, { paymentId: payment.id, reason: "Cheque bounced" });
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { receipt: true } });
    expect(p.status).toBe("VOIDED");
    expect(p.receipt?.voidedAt).not.toBeNull();
    const open = await prisma.leaseCharge.count({ where: { leaseId: lease.id, status: "OPEN" } });
    expect(open).toBe(12);
    expect(await arBalance()).toBe(arBefore);
    await expect(voidPayment(w.admin, { paymentId: payment.id, reason: "again" })).rejects.toBeInstanceOf(AppError);
    await expectBalanced();
  });

  it("rejects future-dated collections and invalid amounts", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id);
    await expect(recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "10", method: "CASH", receivedDate: "2099-01-01", idempotencyKey: key() })).rejects.toBeInstanceOf(AppError);
    await expect(recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "10.0001", method: "CASH", receivedDate: "2026-01-01", idempotencyKey: key() })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "0", method: "CASH", receivedDate: "2026-01-01", idempotencyKey: key() })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("deposits and refunds require approval", () => {
  it("deposit refund: approval needed, requester cannot self-approve, amount capped", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id);
    const deposit = await prisma.leaseCharge.findFirstOrThrow({ where: { leaseId: lease.id, type: "DEPOSIT" } });
    await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "450", method: "CASH", receivedDate: "2026-01-01", idempotencyKey: key(), chargeIds: [deposit.id] });
    const dep = await prisma.deposit.findFirstOrThrow({ where: { leaseId: lease.id } });
    expect(dep.status).toBe("HELD");

    const accountant = await w.ctxFor("ACCOUNTANT");
    await expect(requestRefund(accountant, { kind: "DEPOSIT_REFUND", depositId: dep.id, amount: "500", date: "2026-02-01", reason: "End of lease" })).rejects.toBeInstanceOf(AppError);
    const deduction = await requestRefund(accountant, { kind: "DEPOSIT_DEDUCTION", depositId: dep.id, amount: "100", date: "2026-02-01", reason: "Wall damage" });
    // لا يمكن طلب مبلغ يتجاوز المتاح مع احتساب الطلبات المعلقة
    await expect(requestRefund(accountant, { kind: "DEPOSIT_REFUND", depositId: dep.id, amount: "400", date: "2026-02-01", reason: "Refund rest" })).rejects.toBeInstanceOf(AppError);
    const refund = await requestRefund(accountant, { kind: "DEPOSIT_REFUND", depositId: dep.id, amount: "350", date: "2026-02-01", reason: "Refund rest" });

    // لم يُرحل شيء قبل الاعتماد
    expect(await prisma.journalEntry.count({ where: { source: "REFUND" } })).toBe(0);
    const ap1 = await prisma.approval.findFirstOrThrow({ where: { entityId: deduction.id } });
    await expect(decideApproval(accountant, { approvalId: ap1.id, decision: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await decideApproval(w.admin, { approvalId: ap1.id, decision: "APPROVE" });
    const ap2 = await prisma.approval.findFirstOrThrow({ where: { entityId: refund.id } });
    await decideApproval(w.admin, { approvalId: ap2.id, decision: "APPROVE" });
    await expect(decideApproval(w.admin, { approvalId: ap2.id, decision: "APPROVE" })).rejects.toBeInstanceOf(AppError);

    const after = await prisma.deposit.findUniqueOrThrow({ where: { id: dep.id } });
    expect(after.status).toBe("REFUNDED");
    const bs = await balanceSheet(w.admin, parseDateOnly("2026-12-31"));
    expect(bs.liabilities.find((l) => l.code === "2200")?.balance ?? 0n).toBe(0n);
    // الاستقطاع المعتمد فقط يصبح إيرادًا
    const is = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-12-31") });
    expect(fromBaisa(is.income.find((r) => r.code === "4400")!.balance)).toBe("100.000");
    await expectBalanced();
  });
});

describe("expenses, vendor invoices and approvals", () => {
  it("posts small expenses immediately and holds large ones for approval", async () => {
    const { property } = await makeProperty(w.admin);
    const cats = await listExpenseCategories(w.admin);
    const maint = cats.find((c) => c.code === "MAINT")!;
    const small = await createExpense(w.admin, { date: "2026-03-01", categoryId: maint.id, description: "Tap repair", amount: "25.500", propertyId: property.id, paymentMethod: "CASH" });
    expect(small.status).toBe("POSTED");
    const big = await createExpense(w.admin, { date: "2026-03-02", categoryId: maint.id, description: "Roof waterproofing", amount: "1200", propertyId: property.id });
    expect(big.status).toBe("PENDING_APPROVAL");
    let is = await incomeStatement(w.admin, { from: parseDateOnly("2026-03-01"), to: parseDateOnly("2026-03-31") });
    expect(fromBaisa(is.totalExpenses)).toBe("25.500");
    const manager = await w.ctxFor("PROPERTY_MANAGER");
    const ap = await prisma.approval.findFirstOrThrow({ where: { entityId: big.id } });
    await decideApproval(manager, { approvalId: ap.id, decision: "APPROVE" });
    is = await incomeStatement(w.admin, { from: parseDateOnly("2026-03-01"), to: parseDateOnly("2026-03-31") });
    expect(fromBaisa(is.totalExpenses)).toBe("1225.500");
    await expectBalanced();
  });

  it("capital expenditure is capitalised, not expensed", async () => {
    const { property } = await makeProperty(w.admin);
    await updateSettings(w.admin, { "approval.expenseThreshold": "100000" });
    const cats = await listExpenseCategories(w.admin);
    await createExpense(w.admin, { date: "2026-03-01", categoryId: cats.find((c) => c.code === "CAPEX")!.id, description: "New lift", amount: "8000", propertyId: property.id });
    const is = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-12-31") });
    expect(is.totalExpenses).toBe(0n);
    const bs = await balanceSheet(w.admin, parseDateOnly("2026-12-31"));
    expect(fromBaisa(bs.assets.find((a) => a.code === "1500")!.balance)).toBe("8000.000");
    await expectBalanced();
  });

  it("vendor invoice cannot be recorded twice; payments cannot exceed balance", async () => {
    const { property } = await makeProperty(w.admin);
    const vendor = await saveVendor(w.admin, null, { name: "Muscat AC Services", specialties: ["HVAC"] });
    const cats = await listExpenseCategories(w.admin);
    const hvac = cats.find((c) => c.code === "HVAC")!;
    const inv = await createInvoice(w.admin, { vendorId: vendor.id, vendorInvoiceNo: "INV-77", date: "2026-04-01", dueDate: "2026-04-30", categoryId: hvac.id, description: "AC servicing", amount: "300", taxAmount: "15", propertyId: property.id });
    expect(inv.status).toBe("POSTED");
    await expect(createInvoice(w.admin, { vendorId: vendor.id, vendorInvoiceNo: "INV-77", date: "2026-04-01", dueDate: "2026-04-30", categoryId: hvac.id, description: "dup", amount: "300", propertyId: property.id })).rejects.toMatchObject({ code: "CONFLICT" });
    const k = key();
    await payInvoice(w.admin, { invoiceId: inv.id, amount: "200", date: "2026-04-10", idempotencyKey: k });
    const again = await payInvoice(w.admin, { invoiceId: inv.id, amount: "200", date: "2026-04-10", idempotencyKey: k });
    expect(again.duplicate).toBe(true);
    await expect(payInvoice(w.admin, { invoiceId: inv.id, amount: "116", date: "2026-04-11", idempotencyKey: key() })).rejects.toBeInstanceOf(AppError);
    await payInvoice(w.admin, { invoiceId: inv.id, amount: "115", date: "2026-04-11", idempotencyKey: key() });
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(paid.status).toBe("PAID");
    const bs = await balanceSheet(w.admin, parseDateOnly("2026-12-31"));
    expect(bs.liabilities.find((l) => l.code === "2100")?.balance ?? 0n).toBe(0n);
    expect(fromBaisa(bs.assets.find((a) => a.code === "1250")!.balance)).toBe("15.000");
    await expectBalanced();
  });
});

describe("journal integrity", () => {
  it("manual entries must balance; posted entries are immutable; reversals correct them", async () => {
    const accounts = await prisma.chartOfAccount.findMany({ where: { organizationId: w.orgId } });
    const cash = accounts.find((a) => a.systemKey === "CASH")!;
    const capital = accounts.find((a) => a.systemKey === "CAPITAL")!;
    await expect(
      createManualEntry(w.admin, { date: "2026-01-01", memo: "bad", post: true, lines: [{ accountId: cash.id, debit: "100", credit: "" }, { accountId: capital.id, debit: "", credit: "99.999" }] }),
    ).rejects.toBeInstanceOf(AppError);
    const e = await createManualEntry(w.admin, { date: "2026-01-01", memo: "Capital injection", post: true, lines: [{ accountId: cash.id, debit: "1000", credit: "" }, { accountId: capital.id, debit: "", credit: "1000" }] });

    // حماية قاعدة البيانات: التعديل المباشر على قيد مرحّل يُرفض
    await expect(prisma.journalEntry.update({ where: { id: e.id }, data: { memo: "tampered" } })).rejects.toThrow(/GSW_POSTED_IMMUTABLE/);
    await expect(prisma.journalLine.updateMany({ where: { entryId: e.id }, data: { debit: "5" } })).rejects.toThrow(/GSW_POSTED_IMMUTABLE/);
    await expect(prisma.journalEntry.delete({ where: { id: e.id } })).rejects.toThrow();

    // إدخال قيد غير متوازن مباشرة في قاعدة البيانات يُرفض عند نهاية المعاملة
    await expect(
      prisma.$transaction(async (tx) => {
        const bad = await tx.journalEntry.create({ data: { organizationId: w.orgId, number: "X-1", date: new Date(), memo: "raw", status: "POSTED" } });
        await tx.journalLine.create({ data: { entryId: bad.id, accountId: cash.id, debit: "10", lineNo: 1 } });
        await tx.journalLine.create({ data: { entryId: bad.id, accountId: capital.id, credit: "9", lineNo: 2 } });
      }),
    ).rejects.toThrow(/GSW_UNBALANCED_ENTRY/);

    const rev = await reverseManualEntry(w.admin, e.id, "Entered in error");
    expect(rev.reversesId).toBe(e.id);
    await expect(reverseManualEntry(w.admin, e.id, "again")).rejects.toMatchObject({ code: "CONFLICT" });
    const tb = await trialBalance(w.admin);
    expect(tb.rows.find((r) => r.code === "1100")?.debitBalance ?? 0n).toBe(0n);
    await expectBalanced();
  });

  it("audit log rows cannot be modified or deleted", async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "x" } })).rejects.toThrow(/GSW_AUDIT_IMMUTABLE/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/GSW_AUDIT_IMMUTABLE/);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "audit_logs"`)).rejects.toThrow(/GSW_NO_TRUNCATE/);
  });

  it("financial records cannot be deleted", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease } = await makeActiveLease(w.admin, units[0].id);
    const c = await prisma.leaseCharge.findFirstOrThrow({ where: { leaseId: lease.id } });
    await expect(prisma.leaseCharge.delete({ where: { id: c.id } })).rejects.toThrow(/GSW_NO_DELETE/);
  });
});

describe("renewal and termination", () => {
  it("renewal creates a linked lease without altering the original; deposit carries over", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id);
    const dep = await prisma.leaseCharge.findFirstOrThrow({ where: { leaseId: lease.id, type: "DEPOSIT" } });
    await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "450", method: "CASH", receivedDate: "2026-01-01", idempotencyKey: key(), chargeIds: [dep.id] });
    const before = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    const renewal = await renewLease(w.admin, lease.id, { endDate: "2027-12-31", monthlyRent: "475", frequency: "QUARTERLY", depositAmount: "475", carryOverDeposit: "on" });
    expect(renewal.previousLeaseId).toBe(lease.id);
    expect(renewal.startDate.toISOString().slice(0, 10)).toBe("2027-01-01");
    const after = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(after.monthlyRent.toString()).toBe(before.monthlyRent.toString());
    expect(after.endDate.getTime()).toBe(before.endDate.getTime());
    await activateLease(w.admin, renewal.id);
    const newDeposit = await prisma.deposit.findFirstOrThrow({ where: { leaseId: renewal.id } });
    expect(fromBaisa(toBaisa(newDeposit.received))).toBe("450.000");
    const topUp = await prisma.leaseCharge.findFirstOrThrow({ where: { leaseId: renewal.id, type: "DEPOSIT" } });
    expect(fromBaisa(toBaisa(topUp.amount))).toBe("25.000");
    expect(await prisma.leaseCharge.count({ where: { leaseId: renewal.id, type: "RENT" } })).toBe(4);
    await expect(renewLease(w.admin, lease.id, { endDate: "2027-12-31", monthlyRent: "475", frequency: "MONTHLY", depositAmount: "0" })).rejects.toBeInstanceOf(AppError);
    await expectBalanced();
  });

  it("termination voids unpaid future charges and frees the unit", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0" });
    const res = await terminateLease(w.admin, lease.id, { date: "2026-06-30", reason: "Mutual agreement, documented" });
    expect(res.voided).toBe(6);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: units[0].id } })).status).toBe("VACANT");
    const is = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-12-31") });
    expect(fromBaisa(is.totalIncome)).toBe("2700.000");
    await expectBalanced();
  });

  it("voiding a charge reverses its accrual; paid charges cannot be voided", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0" });
    const charges = await prisma.leaseCharge.findMany({ where: { leaseId: lease.id }, orderBy: { dueDate: "asc" } });
    await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "450", method: "CASH", receivedDate: "2026-01-01", idempotencyKey: key() });
    await expect(voidCharge(w.admin, { chargeId: charges[0].id, reason: "test" })).rejects.toBeInstanceOf(AppError);
    await voidCharge(w.admin, { chargeId: charges[11].id, reason: "Rent waived for December" });
    const is = await incomeStatement(w.admin, { from: parseDateOnly("2026-01-01"), to: parseDateOnly("2026-12-31") });
    expect(fromBaisa(is.totalIncome)).toBe("4950.000");
    await expectBalanced();
  });

  it("late fees need both system and lease enablement", async () => {
    const { units } = await makeProperty(w.admin);
    const { lease } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0" });
    await expect(addManualCharge(w.admin, { leaseId: lease.id, type: "LATE_FEE", amount: "10", dueDate: "2026-02-15", description: "Late" })).rejects.toThrow(/Late fees are disabled/);
    await updateSettings(w.admin, { "lateFees.enabled": true });
    await expect(addManualCharge(w.admin, { leaseId: lease.id, type: "LATE_FEE", amount: "10", dueDate: "2026-02-15", description: "Late" })).rejects.toThrow(/does not provide/);
  });
});

describe("reports match the ledger", () => {
  it("income-by-property, P&L and dashboard agree", async () => {
    const { property, units } = await makeProperty(w.admin);
    const { lease, tenant } = await makeActiveLease(w.admin, units[0].id, { depositAmount: "0" });
    await recordPayment(w.admin, { tenantId: tenant.id, leaseId: lease.id, amount: "900", method: "CASH", receivedDate: "2026-02-01", idempotencyKey: key() });
    const cats = await listExpenseCategories(w.admin);
    await createExpense(w.admin, { date: "2026-02-10", categoryId: cats.find((c) => c.code === "CLEAN")!.id, description: "Cleaning", amount: "40", propertyId: property.id });
    const p = { from: "2026-01-01", to: "2026-03-31" };
    const ie = await runReport(w.admin, "income-expense", p);
    const pl = await runReport(w.admin, "profit-loss", p);
    expect(ie.totals!.net).toBe(pl.totals!.amount);
    expect(fromBaisa(ie.totals!.net as bigint)).toBe(fromBaisa(toBaisa("1350") - toBaisa("40")));
    const tb = await runReport(w.admin, "trial-balance", {});
    expect(tb.totals!.debit).toBe(tb.totals!.credit);
    const arr = await runReport(w.admin, "arrears", { asOf: "2026-04-15" });
    expect(fromBaisa(arr.totals!.balance as bigint)).toBe("900.000");
  });
});
