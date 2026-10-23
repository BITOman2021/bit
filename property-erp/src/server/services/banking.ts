import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";
import { fromBaisa, sum, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, type Ctx } from "../context";
import { prisma } from "../db";
import { notFound, rule } from "../errors";
import { parse, zDate, zId, zMoney, zOptId, zOptStr, zStr } from "../validation";

export async function listAccounts(ctx: Ctx) {
  assertCan(ctx, "journal.read");
  return prisma.chartOfAccount.findMany({ where: { organizationId: ctx.orgId }, include: { parent: true, bankAccount: true }, orderBy: { code: "asc" } });
}

export async function listActiveAccounts(ctx: Ctx) {
  return prisma.chartOfAccount.findMany({ where: { organizationId: ctx.orgId, isActive: true }, orderBy: { code: "asc" } });
}

export async function createAccount(ctx: Ctx, input: unknown) {
  assertCan(ctx, "accounts.manage");
  const v = parse(z.object({ code: z.string().regex(/^\d{3,8}$/, "رمز رقمي من 3-8 خانات / 3-8 digit code"), nameAr: zStr(200), nameEn: zStr(200), type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]), parentId: zOptId }), input);
  if (v.parentId) {
    const parent = await prisma.chartOfAccount.findFirst({ where: { id: v.parentId, organizationId: ctx.orgId } });
    if (!parent) throw notFound();
    if (parent.type !== v.type) throw rule("نوع الحساب يجب أن يطابق الحساب الأب / Type must match parent");
  }
  const a = await prisma.chartOfAccount.create({ data: { ...v, parentId: v.parentId ?? null, organizationId: ctx.orgId } });
  await audit(prisma, ctx, { action: "account.create", entityType: "ChartOfAccount", entityId: a.id, summary: `${a.code} ${a.nameEn}` });
  return a;
}

export async function toggleAccount(ctx: Ctx, id: string) {
  assertCan(ctx, "accounts.manage");
  const a = await prisma.chartOfAccount.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!a) throw notFound();
  if (a.systemKey && a.isActive) throw rule("لا يمكن تعطيل حساب نظامي / System accounts cannot be deactivated");
  await prisma.chartOfAccount.update({ where: { id }, data: { isActive: !a.isActive } });
  await audit(prisma, ctx, { action: a.isActive ? "account.deactivate" : "account.activate", entityType: "ChartOfAccount", entityId: id, summary: a.code });
}

export async function listBankAccounts(ctx: Ctx) {
  return prisma.bankAccount.findMany({ where: { organizationId: ctx.orgId }, include: { glAccount: true, reconciliations: { orderBy: { statementDate: "desc" }, take: 5 } }, orderBy: { name: "asc" } });
}

/** إنشاء حساب بنكي مع حساب أستاذ مرتبط تحت الأصول */
export async function createBankAccount(ctx: Ctx, input: unknown) {
  assertCan(ctx, "accounts.manage");
  const v = parse(z.object({ name: zStr(200), bankName: zOptStr(200), accountNumber: zOptStr(50), iban: zOptStr(50), code: z.string().regex(/^\d{3,8}$/) }), input);
  return prisma.$transaction(async (tx) => {
    const parent = await tx.chartOfAccount.findFirst({ where: { organizationId: ctx.orgId, code: "1000" } });
    const gl = await tx.chartOfAccount.create({ data: { organizationId: ctx.orgId, code: v.code, nameAr: `بنك - ${v.name}`, nameEn: `Bank - ${v.name}`, type: "ASSET", parentId: parent?.id } });
    const b = await tx.bankAccount.create({ data: { organizationId: ctx.orgId, name: v.name, bankName: v.bankName, accountNumber: v.accountNumber, iban: v.iban, glAccountId: gl.id } });
    await audit(tx, ctx, { action: "bank.create", entityType: "BankAccount", entityId: b.id, summary: v.name });
    return b;
  });
}

export async function startReconciliation(ctx: Ctx, input: unknown) {
  assertCan(ctx, "bank.reconcile");
  const v = parse(z.object({ bankAccountId: zId, statementDate: zDate, statementBalance: zMoney }), input);
  const bank = await prisma.bankAccount.findFirst({ where: { id: v.bankAccountId, organizationId: ctx.orgId } });
  if (!bank) throw notFound();
  const open = await prisma.bankReconciliation.findFirst({ where: { bankAccountId: bank.id, status: "IN_PROGRESS" } });
  if (open) throw rule("توجد تسوية قيد التنفيذ لهذا الحساب / A reconciliation is already in progress");
  const r = await prisma.bankReconciliation.create({ data: { bankAccountId: bank.id, statementDate: parseDateOnly(v.statementDate), statementBalance: v.statementBalance } });
  await audit(prisma, ctx, { action: "reconciliation.start", entityType: "BankReconciliation", entityId: r.id });
  return r;
}

export async function getReconciliation(ctx: Ctx, id: string) {
  assertCan(ctx, "bank.reconcile");
  const r = await prisma.bankReconciliation.findFirst({ where: { id, bankAccount: { organizationId: ctx.orgId } }, include: { bankAccount: true } });
  if (!r) throw notFound();
  // السطور المرشحة: سطور الحساب البنكي حتى تاريخ الكشف غير المسواة سابقًا أو المسواة في هذه التسوية
  const lines = await prisma.journalLine.findMany({
    where: { accountId: r.bankAccount.glAccountId, entry: { status: "POSTED", date: { lte: r.statementDate } }, OR: [{ reconciliationId: null }, { reconciliationId: r.id }] },
    include: { entry: true },
    orderBy: [{ entry: { date: "asc" } }],
  });
  const previouslyCleared = await prisma.journalLine.findMany({ where: { accountId: r.bankAccount.glAccountId, reconciliation: { status: "COMPLETED" } }, select: { debit: true, credit: true } });
  const base = sum(previouslyCleared.map((l) => toBaisa(l.debit) - toBaisa(l.credit)));
  const cleared = base + sum(lines.filter((l) => l.reconciliationId === r.id).map((l) => toBaisa(l.debit) - toBaisa(l.credit)));
  return { reconciliation: r, lines, clearedBalance: cleared, difference: toBaisa(r.statementBalance) - cleared };
}

export async function setClearedLines(ctx: Ctx, id: string, lineIds: string[], complete: boolean) {
  assertCan(ctx, "bank.reconcile");
  const data = await getReconciliation(ctx, id);
  if (data.reconciliation.status !== "IN_PROGRESS") throw rule("التسوية مكتملة / Reconciliation completed");
  const allowed = new Set(data.lines.map((l) => l.id));
  const chosen = lineIds.filter((l) => allowed.has(l));
  await prisma.$transaction(async (tx) => {
    await tx.journalLine.updateMany({ where: { reconciliationId: id }, data: { reconciliationId: null } });
    if (chosen.length) await tx.journalLine.updateMany({ where: { id: { in: chosen } }, data: { reconciliationId: id } });
  });
  const after = await getReconciliation(ctx, id);
  await prisma.bankReconciliation.update({ where: { id }, data: { clearedBalance: fromBaisa(after.clearedBalance), difference: fromBaisa(after.difference) } });
  if (complete) {
    if (after.difference !== 0n) throw rule(`الفرق ليس صفرًا (${fromBaisa(after.difference)}) / Difference must be zero to complete`);
    await prisma.bankReconciliation.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: ctx.userId } });
    await audit(prisma, ctx, { action: "reconciliation.complete", entityType: "BankReconciliation", entityId: id });
  }
  return after;
}

export async function listJournal(ctx: Ctx, f: { q?: string; from?: string; to?: string; source?: string; status?: string } = {}) {
  assertCan(ctx, "journal.read");
  return prisma.journalEntry.findMany({
    where: {
      organizationId: ctx.orgId,
      source: f.source ? (f.source as "MANUAL") : undefined,
      status: f.status ? (f.status as "POSTED") : undefined,
      date: { gte: f.from ? parseDateOnly(f.from) : undefined, lte: f.to ? parseDateOnly(f.to) : undefined },
      OR: f.q ? [{ number: { contains: f.q, mode: "insensitive" } }, { memo: { contains: f.q, mode: "insensitive" } }] : undefined,
      lines: ctx.propertyIds === null ? undefined : { some: { propertyId: { in: ctx.propertyIds } } },
    },
    include: { lines: { select: { debit: true } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 300,
  });
}

export async function getJournal(ctx: Ctx, id: string) {
  assertCan(ctx, "journal.read");
  const e = await prisma.journalEntry.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { lines: { include: { account: true }, orderBy: { lineNo: "asc" } }, reverses: true, reversedBy: true },
  });
  if (!e) throw notFound();
  if (ctx.propertyIds !== null && !e.lines.some((l) => l.propertyId && ctx.propertyIds!.includes(l.propertyId))) throw notFound();
  return e;
}
