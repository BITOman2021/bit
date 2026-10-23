import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { parseDateOnly, todayInZone } from "@/lib/dates";
import { type Baisa, fromBaisa, sum, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, assertPropertyAccess, type Ctx, scopeIn } from "../context";
import { prisma, type Tx } from "../db";
import { AppError, notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zBool, zDate, zEmail, zId, zNonNegMoney, zOptDate, zOptId, zOptMoney, zOptStr, zPhone, zPositiveMoney, zStr, zText } from "../validation";
import { accountByKey, cashAccountFor, postJournal, reverseJournal } from "./accounting";
import { requestApproval } from "./approval-core";
import { getSettings } from "./settings";

async function needsApproval(tx: Tx, ctx: Ctx, total: Baisa) {
  const s = await getSettings(ctx.orgId, tx);
  return total >= toBaisa(String(s["approval.expenseThreshold"]));
}

async function checkLinks(tx: Tx, ctx: Ctx, v: { propertyId?: string; unitId?: string; vendorId?: string; workOrderId?: string; categoryId: string }) {
  const cat = await tx.expenseCategory.findFirst({ where: { id: v.categoryId, organizationId: ctx.orgId, isActive: true } });
  if (!cat) throw rule("فئة المصروف غير صالحة / Invalid expense category");
  if (v.propertyId) {
    const p = await tx.property.findFirst({ where: { id: v.propertyId, organizationId: ctx.orgId } });
    if (!p) throw notFound("العقار غير موجود / Property not found");
    assertPropertyAccess(ctx, v.propertyId);
  } else if (ctx.propertyIds !== null) {
    throw rule("يجب ربط المصروف بعقار ضمن صلاحياتك / Expense must be linked to a property in your scope");
  }
  if (v.unitId) {
    const u = await tx.unit.findFirst({ where: { id: v.unitId, propertyId: v.propertyId ?? "__none__" } });
    if (!u) throw rule("الوحدة لا تتبع العقار / Unit does not belong to property");
  }
  if (v.vendorId) {
    const vd = await tx.vendor.findFirst({ where: { id: v.vendorId, organizationId: ctx.orgId } });
    if (!vd) throw notFound("المورد غير موجود / Vendor not found");
  }
  if (v.workOrderId) {
    const wo = await tx.workOrder.findFirst({ where: { id: v.workOrderId, organizationId: ctx.orgId } });
    if (!wo) throw notFound("أمر العمل غير موجود / Work order not found");
  }
  return cat;
}

/** الحساب المدين: حساب الفئة، أو حساب الأصول الرأسمالية إذا صُنف المصروف رأسماليًا */
async function debitAccountFor(tx: Tx, ctx: Ctx, categoryId: string, isCapital: boolean) {
  const cat = await tx.expenseCategory.findUniqueOrThrow({ where: { id: categoryId }, include: { account: true } });
  if (isCapital && cat.account.type !== "ASSET") return (await accountByKey(tx, ctx.orgId, "CAPEX")).id;
  if (!isCapital && cat.account.type === "ASSET") throw rule("هذه الفئة رأسمالية؛ فعّل خيار المصروف الرأسمالي / This category is capital; mark as capital");
  return cat.accountId;
}

// ------------------------- المصروفات المباشرة -------------------------

export const expenseSchema = z.object({
  date: zDate,
  categoryId: zId,
  description: zStr(500),
  amount: zNonNegMoney,
  taxAmount: zNonNegMoney.default("0"),
  propertyId: zOptId,
  unitId: zOptId,
  vendorId: zOptId,
  workOrderId: zOptId,
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"]).default("BANK_TRANSFER"),
  bankAccountId: zOptId,
  reference: zOptStr(200),
  isCapital: zBool.default(false),
});

export async function createExpense(ctx: Ctx, input: unknown) {
  assertCan(ctx, "expense.write");
  const v = parse(expenseSchema, input);
  const total = toBaisa(v.amount) + toBaisa(v.taxAmount);
  if (total <= 0n) throw rule("المبلغ يجب أن يكون أكبر من صفر / Amount must be positive");
  return prisma.$transaction(async (tx) => {
    const cat = await checkLinks(tx, ctx, v);
    const isCapital = v.isCapital || cat.isCapital;
    const date = parseDateOnly(v.date);
    const number = await nextNumber(tx, ctx.orgId, SEQ.EXPENSE, date.getUTCFullYear());
    const exp = await tx.expense.create({
      data: {
        organizationId: ctx.orgId,
        number,
        date,
        categoryId: v.categoryId,
        description: v.description,
        amount: v.amount,
        taxAmount: v.taxAmount,
        total: fromBaisa(total),
        propertyId: v.propertyId ?? null,
        unitId: v.unitId ?? null,
        vendorId: v.vendorId ?? null,
        workOrderId: v.workOrderId ?? null,
        paymentMethod: v.paymentMethod,
        bankAccountId: v.bankAccountId ?? null,
        reference: v.reference,
        isCapital,
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, { action: "expense.create", entityType: "Expense", entityId: exp.id, summary: `${number} ${fromBaisa(total)}`, after: exp });
    if (await needsApproval(tx, ctx, total)) {
      const ap = await requestApproval(tx, ctx, { type: "EXPENSE", entityId: exp.id, amount: total, summary: `${number}: ${v.description} (${fromBaisa(total)} OMR)`, propertyId: v.propertyId });
      return tx.expense.update({ where: { id: exp.id }, data: { status: "PENDING_APPROVAL", approvalId: ap.id } });
    }
    return postExpenseTx(tx, ctx, exp.id);
  });
}

/** ترحيل المصروف: مدين المصروف (أو الأصل الرأسمالي) وضريبة المدخلات / دائن النقدية أو البنك */
export async function postExpenseTx(tx: Tx, ctx: Ctx, expenseId: string) {
  const exp = await tx.expense.findFirst({ where: { id: expenseId, organizationId: ctx.orgId } });
  if (!exp) throw notFound();
  if (exp.status === "POSTED") throw new AppError("CONFLICT", "المصروف مرحّل مسبقًا / Expense already posted");
  if (exp.status === "VOID" || exp.status === "REJECTED") throw rule("المصروف ملغى أو مرفوض / Expense is void or rejected");
  const debitAcc = await debitAccountFor(tx, ctx, exp.categoryId, exp.isCapital);
  const cash = await cashAccountFor(tx, ctx.orgId, exp.paymentMethod, exp.bankAccountId);
  const tag = { propertyId: exp.propertyId, unitId: exp.unitId, vendorId: exp.vendorId, description: `${exp.number} ${exp.description}` };
  const lines = [
    { accountId: debitAcc, debit: toBaisa(exp.amount), ...tag },
    { accountId: cash, credit: toBaisa(exp.total), ...tag },
  ];
  if (toBaisa(exp.taxAmount) > 0n) lines.push({ accountId: (await accountByKey(tx, ctx.orgId, "VAT_INPUT")).id, debit: toBaisa(exp.taxAmount), ...tag });
  const entry = await postJournal(tx, ctx, { date: exp.date, memo: `مصروف ${exp.number}: ${exp.description}`, source: "EXPENSE", sourceKey: `EXPENSE:${exp.id}`, lines });
  return tx.expense.update({ where: { id: exp.id }, data: { status: "POSTED", journalEntryId: entry.id } });
}

export async function voidExpense(ctx: Ctx, expenseId: string, reason: string) {
  assertCan(ctx, "expense.write");
  if (!reason || reason.length < 3) throw rule("السبب مطلوب / Reason required");
  return prisma.$transaction(async (tx) => {
    const exp = await tx.expense.findFirst({ where: { id: expenseId, organizationId: ctx.orgId } });
    if (!exp) throw notFound();
    if (exp.propertyId) assertPropertyAccess(ctx, exp.propertyId);
    if (exp.status === "VOID") throw rule("ملغى مسبقًا / Already void");
    if (exp.journalEntryId) await reverseJournal(tx, ctx, exp.journalEntryId, { reason: `إلغاء مصروف ${exp.number}: ${reason}`, date: todayInZone(ctx.timezone) });
    if (exp.approvalId) await tx.approval.updateMany({ where: { id: exp.approvalId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: ctx.userId, decisionNote: "Voided" } });
    const res = await tx.expense.update({ where: { id: exp.id }, data: { status: "VOID" } });
    await audit(tx, ctx, { action: "expense.void", entityType: "Expense", entityId: exp.id, summary: `${exp.number}: ${reason}` });
    return res;
  });
}

export async function listExpenses(ctx: Ctx, f: { q?: string; from?: string; to?: string; propertyId?: string; categoryId?: string; status?: string } = {}) {
  assertCan(ctx, "finance.read");
  return prisma.expense.findMany({
    where: {
      organizationId: ctx.orgId,
      propertyId: f.propertyId ?? scopeIn(ctx),
      categoryId: f.categoryId,
      status: f.status ? (f.status as "POSTED") : undefined,
      date: { gte: f.from ? parseDateOnly(f.from) : undefined, lte: f.to ? parseDateOnly(f.to) : undefined },
      OR: f.q ? [{ number: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }] : undefined,
    },
    include: { category: true, vendor: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 1000,
  });
}

export async function listExpenseCategories(ctx: Ctx) {
  return prisma.expenseCategory.findMany({ where: { organizationId: ctx.orgId, isActive: true }, orderBy: { code: "asc" } });
}

// ------------------------- الموردون -------------------------

export const vendorSchema = z.object({
  code: zOptStr(30),
  name: zStr(200),
  specialties: z.array(z.string().max(50)).default([]),
  crNumber: zOptStr(50),
  licenseNumber: zOptStr(100),
  licenseExpiry: zOptDate,
  vatNumber: zOptStr(50),
  contactPerson: zOptStr(200),
  phone: zPhone,
  email: zEmail,
  address: zOptStr(500),
  bankDetails: zOptStr(500),
  notes: zText(3000),
});

export async function listVendors(ctx: Ctx, f: { q?: string; specialty?: string } = {}) {
  assertCan(ctx, "vendor.read");
  return prisma.vendor.findMany({
    where: {
      organizationId: ctx.orgId,
      archivedAt: null,
      specialties: f.specialty ? { has: f.specialty } : undefined,
      OR: f.q ? [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q } }] : undefined,
    },
    include: { invoices: { where: { status: { in: ["POSTED", "PARTIALLY_PAID"] } }, select: { total: true, paidAmount: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getVendor(ctx: Ctx, id: string) {
  assertCan(ctx, "vendor.read");
  const v = await prisma.vendor.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      contracts: { include: { property: { select: { name: true } } }, orderBy: { endDate: "desc" } },
      invoices: { orderBy: { date: "desc" }, include: { payments: true } },
      purchaseOrders: { orderBy: { date: "desc" } },
      workOrders: { orderBy: { createdAt: "desc" }, take: 50 },
      expenses: { orderBy: { date: "desc" }, take: 50 },
      quotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!v) throw notFound();
  return v;
}

export async function saveVendor(ctx: Ctx, id: string | null, input: unknown) {
  assertCan(ctx, "vendor.write");
  const v = parse(vendorSchema, input);
  return prisma.$transaction(async (tx) => {
    const data = { ...v, licenseExpiry: v.licenseExpiry ? parseDateOnly(v.licenseExpiry) : null };
    if (id) {
      const before = await tx.vendor.findFirst({ where: { id, organizationId: ctx.orgId } });
      if (!before) throw notFound();
      const r = await tx.vendor.update({ where: { id }, data: { ...data, code: v.code ?? before.code } });
      await audit(tx, ctx, { action: "vendor.update", entityType: "Vendor", entityId: id, before, after: r });
      return r;
    }
    const code = v.code ?? (await nextNumber(tx, ctx.orgId, SEQ.VENDOR)).replace(/-\d{4}-/, "-");
    const r = await tx.vendor.create({ data: { ...data, code, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: "vendor.create", entityType: "Vendor", entityId: r.id, summary: r.name });
    return r;
  });
}

export async function addVendorContract(ctx: Ctx, input: unknown) {
  assertCan(ctx, "vendor.write");
  const v = parse(
    z.object({ vendorId: zId, propertyId: zOptId, title: zStr(200), scope: zText(3000), startDate: zDate, endDate: zDate, value: zOptMoney, warrantyEnd: zOptDate, notes: zText(2000) }),
    input,
  );
  const vendor = await prisma.vendor.findFirst({ where: { id: v.vendorId, organizationId: ctx.orgId } });
  if (!vendor) throw notFound();
  if (v.propertyId) assertPropertyAccess(ctx, v.propertyId);
  const c = await prisma.vendorContract.create({
    data: { ...v, propertyId: v.propertyId ?? null, startDate: parseDateOnly(v.startDate), endDate: parseDateOnly(v.endDate), warrantyEnd: v.warrantyEnd ? parseDateOnly(v.warrantyEnd) : null, value: v.value ?? null },
  });
  await audit(prisma, ctx, { action: "vendor_contract.create", entityType: "VendorContract", entityId: c.id, summary: c.title });
  return c;
}

/** تقييم المورد (1-5) — متوسط تقييمات أوامر العمل */
export async function recomputeVendorRating(tx: Tx, vendorId: string) {
  const r = await tx.workOrder.aggregate({ where: { vendorId, qualityRating: { not: null } }, _avg: { qualityRating: true } });
  await tx.vendor.update({ where: { id: vendorId }, data: { rating: r._avg.qualityRating ? r._avg.qualityRating.toFixed(2) : null } });
}

// ------------------------- عروض الأسعار -------------------------

export async function addQuote(ctx: Ctx, input: unknown) {
  assertCan(ctx, "vendor.write");
  const v = parse(z.object({ vendorId: zId, workOrderId: zOptId, reference: zOptStr(100), amount: zPositiveMoney, validUntil: zOptDate, notes: zText(1000) }), input);
  const vendor = await prisma.vendor.findFirst({ where: { id: v.vendorId, organizationId: ctx.orgId } });
  if (!vendor) throw notFound();
  if (v.workOrderId) {
    const wo = await prisma.workOrder.findFirst({ where: { id: v.workOrderId, organizationId: ctx.orgId } });
    if (!wo) throw notFound();
    assertPropertyAccess(ctx, wo.propertyId);
  }
  const q = await prisma.vendorQuote.create({ data: { ...v, workOrderId: v.workOrderId ?? null, validUntil: v.validUntil ? parseDateOnly(v.validUntil) : null } });
  await audit(prisma, ctx, { action: "quote.create", entityType: "VendorQuote", entityId: q.id, summary: `${vendor.name} ${v.amount}` });
  return q;
}

/** اختيار عرض سعر: يضبط المورد والتكلفة التقديرية لأمر العمل */
export async function selectQuote(ctx: Ctx, quoteId: string) {
  assertCan(ctx, "maintenance.write");
  return prisma.$transaction(async (tx) => {
    const q = await tx.vendorQuote.findFirst({ where: { id: quoteId, vendor: { organizationId: ctx.orgId } } });
    if (!q || !q.workOrderId) throw notFound();
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: q.workOrderId } });
    assertPropertyAccess(ctx, wo.propertyId);
    if (["CLOSED", "CANCELLED"].includes(wo.status)) throw rule("أمر العمل مغلق / Work order closed");
    await tx.vendorQuote.updateMany({ where: { workOrderId: q.workOrderId }, data: { isSelected: false } });
    await tx.vendorQuote.update({ where: { id: q.id }, data: { isSelected: true } });
    await tx.workOrder.update({ where: { id: wo.id }, data: { vendorId: q.vendorId, estimatedCost: q.amount, costApprovedAt: null, costApprovedById: null } });
    await audit(tx, ctx, { action: "quote.select", entityType: "WorkOrder", entityId: wo.id, summary: `quote ${q.id} ${q.amount}` });
  });
}

// ------------------------- أوامر الشراء -------------------------

const poSchema = z.object({
  vendorId: zId,
  propertyId: zOptId,
  workOrderId: zOptId,
  date: zDate,
  expectedDate: zOptDate,
  notes: zText(2000),
  lines: z
    .array(z.object({ description: zStr(300), quantity: z.string().regex(/^\d+(\.\d{1,3})?$/), unitPrice: zPositiveMoney }))
    .min(1, "أضف بندًا واحدًا على الأقل / Add at least one line"),
});

export async function createPurchaseOrder(ctx: Ctx, input: unknown) {
  assertCan(ctx, "vendor.write");
  const v = parse(poSchema, input);
  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findFirst({ where: { id: v.vendorId, organizationId: ctx.orgId } });
    if (!vendor) throw notFound();
    if (v.propertyId) assertPropertyAccess(ctx, v.propertyId);
    const lines = v.lines.map((l) => {
      // الكمية حتى 3 منازل عشرية: الإجمالي = السعر × الكمية مقرّب إلى البيسة
      const qty = l.quantity;
      const [qi, qf = ""] = qty.split(".");
      const qScaled = BigInt(qi) * 1000n + BigInt(qf.padEnd(3, "0"));
      const total = (toBaisa(l.unitPrice) * qScaled + 500n) / 1000n;
      return { description: l.description, quantity: qty, unitPrice: l.unitPrice, lineTotal: fromBaisa(total), _t: total };
    });
    const total = sum(lines.map((l) => l._t));
    const date = parseDateOnly(v.date);
    const number = await nextNumber(tx, ctx.orgId, SEQ.PURCHASE_ORDER, date.getUTCFullYear());
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.orgId,
        number,
        vendorId: v.vendorId,
        propertyId: v.propertyId ?? null,
        workOrderId: v.workOrderId ?? null,
        date,
        expectedDate: v.expectedDate ? parseDateOnly(v.expectedDate) : null,
        notes: v.notes,
        total: fromBaisa(total),
        createdById: ctx.userId,
        lines: { create: lines.map(({ _t, ...l }) => l) },
      },
    });
    // أوامر الشراء التزام مالي: تتطلب اعتمادًا فوق الحد
    if (await needsApproval(tx, ctx, total)) {
      const ap = await requestApproval(tx, ctx, { type: "PURCHASE_ORDER", entityId: po.id, amount: total, summary: `${number} ${vendor.name} (${fromBaisa(total)} OMR)`, propertyId: v.propertyId });
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "PENDING_APPROVAL", approvalId: ap.id } });
    } else {
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "APPROVED" } });
    }
    await audit(tx, ctx, { action: "po.create", entityType: "PurchaseOrder", entityId: po.id, summary: `${number} ${fromBaisa(total)}` });
    return po;
  });
}

export async function receivePurchaseOrder(ctx: Ctx, poId: string, notes?: string) {
  assertCan(ctx, "vendor.write");
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, organizationId: ctx.orgId }, include: { lines: true } });
  if (!po) throw notFound();
  if (po.propertyId) assertPropertyAccess(ctx, po.propertyId);
  if (po.status !== "APPROVED") throw rule("أمر الشراء غير معتمد / PO is not approved");
  await prisma.$transaction(async (tx) => {
    for (const l of po.lines) await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { receivedQty: l.quantity } });
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { receivedAt: new Date(), receivedNotes: notes } });
    await audit(tx, ctx, { action: "po.receive", entityType: "PurchaseOrder", entityId: po.id, summary: po.number });
  });
}

export async function listPurchaseOrders(ctx: Ctx) {
  assertCan(ctx, "vendor.read");
  return prisma.purchaseOrder.findMany({
    where: { organizationId: ctx.orgId, OR: ctx.propertyIds === null ? undefined : [{ propertyId: { in: ctx.propertyIds } }, { propertyId: null }] },
    include: { vendor: { select: { name: true } }, lines: true },
    orderBy: { date: "desc" },
    take: 500,
  });
}

// ------------------------- فواتير الموردين ودفعاتها -------------------------

export const invoiceSchema = z.object({
  vendorId: zId,
  vendorInvoiceNo: zStr(100),
  date: zDate,
  dueDate: zDate,
  categoryId: zId,
  description: zStr(500),
  amount: zNonNegMoney,
  taxAmount: zNonNegMoney.default("0"),
  propertyId: zOptId,
  unitId: zOptId,
  workOrderId: zOptId,
  purchaseOrderId: zOptId,
  isCapital: zBool.default(false),
});

export async function createInvoice(ctx: Ctx, input: unknown) {
  assertCan(ctx, "invoice.write");
  const v = parse(invoiceSchema, input);
  const total = toBaisa(v.amount) + toBaisa(v.taxAmount);
  if (total <= 0n) throw rule("المبلغ يجب أن يكون أكبر من صفر / Amount must be positive");
  if (v.dueDate < v.date) throw rule("تاريخ الاستحقاق قبل تاريخ الفاتورة / Due date before invoice date");
  try {
    return await prisma.$transaction(async (tx) => {
      const cat = await checkLinks(tx, ctx, v);
      if (v.purchaseOrderId) {
        const po = await tx.purchaseOrder.findFirst({ where: { id: v.purchaseOrderId, organizationId: ctx.orgId, vendorId: v.vendorId } });
        if (!po) throw rule("أمر الشراء لا يخص المورد / PO does not belong to vendor");
        if (po.status !== "APPROVED") throw rule("أمر الشراء غير معتمد / PO not approved");
      }
      const date = parseDateOnly(v.date);
      const number = await nextNumber(tx, ctx.orgId, SEQ.INVOICE, date.getUTCFullYear());
      const inv = await tx.invoice.create({
        data: {
          organizationId: ctx.orgId,
          number,
          vendorId: v.vendorId,
          vendorInvoiceNo: v.vendorInvoiceNo,
          date,
          dueDate: parseDateOnly(v.dueDate),
          categoryId: v.categoryId,
          description: v.description,
          amount: v.amount,
          taxAmount: v.taxAmount,
          total: fromBaisa(total),
          propertyId: v.propertyId ?? null,
          unitId: v.unitId ?? null,
          workOrderId: v.workOrderId ?? null,
          purchaseOrderId: v.purchaseOrderId ?? null,
          isCapital: v.isCapital || cat.isCapital,
          createdById: ctx.userId,
        },
      });
      await audit(tx, ctx, { action: "invoice.create", entityType: "Invoice", entityId: inv.id, summary: `${number} (${v.vendorInvoiceNo}) ${fromBaisa(total)}` });
      if (await needsApproval(tx, ctx, total)) {
        const ap = await requestApproval(tx, ctx, { type: "INVOICE", entityId: inv.id, amount: total, summary: `${number} — ${v.description} (${fromBaisa(total)} OMR)`, propertyId: v.propertyId });
        return tx.invoice.update({ where: { id: inv.id }, data: { status: "PENDING_APPROVAL", approvalId: ap.id } });
      }
      return postInvoiceTx(tx, ctx, inv.id);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "فاتورة المورد مسجلة مسبقًا بنفس الرقم / This vendor invoice number is already recorded");
    }
    throw e;
  }
}

/** ترحيل الفاتورة: مدين المصروف/الأصل وضريبة المدخلات / دائن ذمم الموردين */
export async function postInvoiceTx(tx: Tx, ctx: Ctx, invoiceId: string) {
  const inv = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.orgId } });
  if (!inv) throw notFound();
  if (inv.journalEntryId || inv.status === "POSTED" || inv.status === "PAID" || inv.status === "PARTIALLY_PAID") {
    throw new AppError("CONFLICT", "الفاتورة مرحّلة مسبقًا / Invoice already posted");
  }
  if (inv.status === "VOID" || inv.status === "REJECTED") throw rule("الفاتورة ملغاة أو مرفوضة / Invoice is void or rejected");
  const debitAcc = await debitAccountFor(tx, ctx, inv.categoryId, inv.isCapital);
  const ap = await accountByKey(tx, ctx.orgId, "AP");
  const tag = { propertyId: inv.propertyId, unitId: inv.unitId, vendorId: inv.vendorId, description: `${inv.number} ${inv.vendorInvoiceNo}` };
  const lines = [
    { accountId: debitAcc, debit: toBaisa(inv.amount), ...tag },
    { accountId: ap.id, credit: toBaisa(inv.total), ...tag },
  ];
  if (toBaisa(inv.taxAmount) > 0n) lines.push({ accountId: (await accountByKey(tx, ctx.orgId, "VAT_INPUT")).id, debit: toBaisa(inv.taxAmount), ...tag });
  const entry = await postJournal(tx, ctx, { date: inv.date, memo: `فاتورة مورد ${inv.number} (${inv.vendorInvoiceNo})`, source: "INVOICE", sourceKey: `INVOICE:${inv.id}`, lines });
  return tx.invoice.update({ where: { id: inv.id }, data: { status: "POSTED", journalEntryId: entry.id } });
}

export async function payInvoice(ctx: Ctx, input: unknown) {
  assertCan(ctx, "invoice.write");
  const v = parse(
    z.object({
      invoiceId: zId,
      amount: zPositiveMoney,
      date: zDate,
      method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE", "OTHER"]).default("BANK_TRANSFER"),
      bankAccountId: zOptId,
      reference: zOptStr(200),
      idempotencyKey: z.string().min(8).max(100),
    }),
    input,
  );
  const dup = await prisma.vendorPayment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.orgId, idempotencyKey: v.idempotencyKey } } });
  if (dup) return { payment: dup, duplicate: true };
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${v.invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findFirst({ where: { id: v.invoiceId, organizationId: ctx.orgId } });
    if (!inv) throw notFound();
    if (inv.propertyId) assertPropertyAccess(ctx, inv.propertyId);
    if (!["POSTED", "PARTIALLY_PAID"].includes(inv.status)) throw rule("الفاتورة غير مرحّلة أو مسددة / Invoice not payable");
    const amount = toBaisa(v.amount);
    const balance = toBaisa(inv.total) - toBaisa(inv.paidAmount);
    if (amount > balance) throw rule(`المبلغ يتجاوز رصيد الفاتورة (${fromBaisa(balance)}) / Exceeds invoice balance`);
    const date = parseDateOnly(v.date);
    const number = await nextNumber(tx, ctx.orgId, SEQ.VENDOR_PAYMENT, date.getUTCFullYear());
    const vp = await tx.vendorPayment.create({
      data: { organizationId: ctx.orgId, number, invoiceId: inv.id, amount: v.amount, date, method: v.method, bankAccountId: v.bankAccountId ?? null, reference: v.reference, idempotencyKey: v.idempotencyKey, createdById: ctx.userId },
    });
    const ap = await accountByKey(tx, ctx.orgId, "AP");
    const cash = await cashAccountFor(tx, ctx.orgId, v.method, v.bankAccountId);
    const tag = { propertyId: inv.propertyId, unitId: inv.unitId, vendorId: inv.vendorId, description: `${number} ${inv.number}` };
    const entry = await postJournal(tx, ctx, {
      date,
      memo: `دفعة مورد ${number} — فاتورة ${inv.number}`,
      source: "VENDOR_PAYMENT",
      sourceKey: `VENDOR_PAYMENT:${vp.id}`,
      lines: [
        { accountId: ap.id, debit: amount, ...tag },
        { accountId: cash, credit: amount, ...tag },
      ],
    });
    const paid = toBaisa(inv.paidAmount) + amount;
    await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: fromBaisa(paid), status: paid >= toBaisa(inv.total) ? "PAID" : "PARTIALLY_PAID" } });
    await audit(tx, ctx, { action: "invoice.pay", entityType: "Invoice", entityId: inv.id, summary: `${number} ${v.amount}` });
    return tx.vendorPayment.update({ where: { id: vp.id }, data: { journalEntryId: entry.id } });
  });
  return { payment, duplicate: false };
}

export async function voidInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  assertCan(ctx, "invoice.write");
  if (!reason || reason.length < 3) throw rule("السبب مطلوب / Reason required");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.orgId } });
    if (!inv) throw notFound();
    if (inv.propertyId) assertPropertyAccess(ctx, inv.propertyId);
    if (toBaisa(inv.paidAmount) > 0n) throw rule("الفاتورة عليها دفعات / Invoice has payments");
    if (inv.status === "VOID") throw rule("ملغاة مسبقًا / Already void");
    if (inv.journalEntryId) await reverseJournal(tx, ctx, inv.journalEntryId, { reason: `إلغاء فاتورة ${inv.number}: ${reason}`, date: todayInZone(ctx.timezone) });
    if (inv.approvalId) await tx.approval.updateMany({ where: { id: inv.approvalId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: ctx.userId, decisionNote: "Voided" } });
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
    await audit(tx, ctx, { action: "invoice.void", entityType: "Invoice", entityId: inv.id, summary: `${inv.number}: ${reason}` });
  });
}

export async function listInvoices(ctx: Ctx, f: { q?: string; status?: string; vendorId?: string } = {}) {
  assertCan(ctx, "finance.read");
  return prisma.invoice.findMany({
    where: {
      organizationId: ctx.orgId,
      vendorId: f.vendorId,
      propertyId: scopeIn(ctx),
      status: f.status ? (f.status as "POSTED") : undefined,
      OR: f.q ? [{ number: { contains: f.q, mode: "insensitive" } }, { vendorInvoiceNo: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }] : undefined,
    },
    include: { vendor: { select: { id: true, name: true } }, category: true, payments: true },
    orderBy: [{ date: "desc" }],
    take: 1000,
  });
}

export async function getInvoice(ctx: Ctx, id: string) {
  assertCan(ctx, "finance.read");
  const inv = await prisma.invoice.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { vendor: true, category: true, payments: true, workOrder: true, journalEntry: { include: { lines: { include: { account: true } } } } },
  });
  if (!inv) throw notFound();
  if (inv.propertyId) assertPropertyAccess(ctx, inv.propertyId);
  return inv;
}
