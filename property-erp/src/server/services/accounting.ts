import { Prisma } from "@/generated/prisma/client";
import type { AccountType, JournalSource } from "@/generated/prisma/enums";
import { formatDateOnly, parseDateOnly } from "@/lib/dates";
import { type Baisa, fromBaisa, sum, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, type Ctx } from "../context";
import { prisma, type Db, type Tx } from "../db";
import { AppError, notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";

// ------------------------------------------------------------
// دليل الحسابات الافتراضي (قابل للتهيئة بعد الإنشاء)
// ------------------------------------------------------------

export interface AccountSeed {
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  parent?: string;
  systemKey?: string;
}

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  { code: "1000", nameAr: "الأصول", nameEn: "Assets", type: "ASSET" },
  { code: "1100", nameAr: "النقدية في الصندوق", nameEn: "Cash on hand", type: "ASSET", parent: "1000", systemKey: "CASH" },
  { code: "1110", nameAr: "البنك - الحساب الرئيسي", nameEn: "Bank - main account", type: "ASSET", parent: "1000", systemKey: "BANK_MAIN" },
  { code: "1200", nameAr: "ذمم المستأجرين المدينة", nameEn: "Tenant receivables", type: "ASSET", parent: "1000", systemKey: "AR" },
  { code: "1250", nameAr: "ضريبة القيمة المضافة - مدخلات", nameEn: "VAT input recoverable", type: "ASSET", parent: "1000", systemKey: "VAT_INPUT" },
  { code: "1500", nameAr: "تحسينات رأسمالية على العقارات", nameEn: "Capital improvements", type: "ASSET", parent: "1000", systemKey: "CAPEX" },
  { code: "1510", nameAr: "معدات وأثاث", nameEn: "Equipment and furniture", type: "ASSET", parent: "1000", systemKey: "EQUIPMENT" },
  { code: "2000", nameAr: "الالتزامات", nameEn: "Liabilities", type: "LIABILITY" },
  { code: "2100", nameAr: "ذمم الموردين الدائنة", nameEn: "Accounts payable - vendors", type: "LIABILITY", parent: "2000", systemKey: "AP" },
  { code: "2200", nameAr: "تأمينات المستأجرين المستلمة", nameEn: "Tenant security deposits held", type: "LIABILITY", parent: "2000", systemKey: "DEPOSITS" },
  { code: "2300", nameAr: "ضريبة القيمة المضافة - مخرجات", nameEn: "VAT output payable", type: "LIABILITY", parent: "2000", systemKey: "VAT_OUTPUT" },
  { code: "2400", nameAr: "مستحقات الملاك", nameEn: "Owners payable", type: "LIABILITY", parent: "2000", systemKey: "OWNER_PAYABLE" },
  { code: "3000", nameAr: "حقوق الملكية", nameEn: "Equity", type: "EQUITY" },
  { code: "3100", nameAr: "رأس مال الملاك", nameEn: "Owners' capital", type: "EQUITY", parent: "3000", systemKey: "CAPITAL" },
  { code: "3200", nameAr: "الأرباح المحتجزة", nameEn: "Retained earnings", type: "EQUITY", parent: "3000", systemKey: "RETAINED" },
  { code: "4000", nameAr: "الإيرادات", nameEn: "Income", type: "INCOME" },
  { code: "4100", nameAr: "إيرادات الإيجار", nameEn: "Rental income", type: "INCOME", parent: "4000", systemKey: "RENT_INCOME" },
  { code: "4150", nameAr: "إيرادات التأجير قصير الأجل", nameEn: "Short-term rental income", type: "INCOME", parent: "4000", systemKey: "SHORT_TERM_INCOME" },
  { code: "4200", nameAr: "إيرادات رسوم الخدمات", nameEn: "Service charge income", type: "INCOME", parent: "4000", systemKey: "SERVICE_INCOME" },
  { code: "4300", nameAr: "إيرادات رسوم التأخير", nameEn: "Late fee income", type: "INCOME", parent: "4000", systemKey: "LATE_FEE_INCOME" },
  { code: "4400", nameAr: "استقطاعات من التأمينات", nameEn: "Deposit deductions (damages)", type: "INCOME", parent: "4000", systemKey: "DEPOSIT_DEDUCTION_INCOME" },
  { code: "4900", nameAr: "إيرادات أخرى", nameEn: "Other income", type: "INCOME", parent: "4000", systemKey: "OTHER_INCOME" },
  { code: "5000", nameAr: "المصروفات", nameEn: "Expenses", type: "EXPENSE" },
  { code: "5100", nameAr: "الصيانة والإصلاح", nameEn: "Maintenance and repairs", type: "EXPENSE", parent: "5000", systemKey: "EXP_MAINTENANCE" },
  { code: "5200", nameAr: "الكهرباء والمياه", nameEn: "Electricity and water", type: "EXPENSE", parent: "5000", systemKey: "EXP_UTILITIES" },
  { code: "5250", nameAr: "التكييف", nameEn: "Air conditioning", type: "EXPENSE", parent: "5000", systemKey: "EXP_HVAC" },
  { code: "5300", nameAr: "النظافة", nameEn: "Cleaning", type: "EXPENSE", parent: "5000", systemKey: "EXP_CLEANING" },
  { code: "5350", nameAr: "الحراسة", nameEn: "Security guarding", type: "EXPENSE", parent: "5000", systemKey: "EXP_SECURITY" },
  { code: "5400", nameAr: "إدارة العقارات", nameEn: "Property management", type: "EXPENSE", parent: "5000", systemKey: "EXP_MANAGEMENT" },
  { code: "5450", nameAr: "التأمين", nameEn: "Insurance", type: "EXPENSE", parent: "5000", systemKey: "EXP_INSURANCE" },
  { code: "5500", nameAr: "الرسوم الحكومية", nameEn: "Government fees", type: "EXPENSE", parent: "5000", systemKey: "EXP_GOV_FEES" },
  { code: "5600", nameAr: "المصروفات الإدارية", nameEn: "Administrative expenses", type: "EXPENSE", parent: "5000", systemKey: "EXP_ADMIN" },
  { code: "5700", nameAr: "مصروفات الموردين", nameEn: "Vendor services", type: "EXPENSE", parent: "5000", systemKey: "EXP_VENDOR" },
  { code: "5900", nameAr: "مصروفات أخرى", nameEn: "Other expenses", type: "EXPENSE", parent: "5000", systemKey: "EXP_OTHER" },
];

export const DEFAULT_EXPENSE_CATEGORIES: { code: string; nameAr: string; nameEn: string; accountKey: string; isCapital?: boolean }[] = [
  { code: "MAINT", nameAr: "الصيانة والإصلاح", nameEn: "Maintenance & repair", accountKey: "EXP_MAINTENANCE" },
  { code: "UTIL", nameAr: "الكهرباء والمياه", nameEn: "Electricity & water", accountKey: "EXP_UTILITIES" },
  { code: "HVAC", nameAr: "التكييف", nameEn: "Air conditioning", accountKey: "EXP_HVAC" },
  { code: "CLEAN", nameAr: "النظافة", nameEn: "Cleaning", accountKey: "EXP_CLEANING" },
  { code: "SEC", nameAr: "الحراسة", nameEn: "Security", accountKey: "EXP_SECURITY" },
  { code: "MGMT", nameAr: "إدارة العقارات", nameEn: "Property management", accountKey: "EXP_MANAGEMENT" },
  { code: "INS", nameAr: "التأمين", nameEn: "Insurance", accountKey: "EXP_INSURANCE" },
  { code: "GOV", nameAr: "الرسوم الحكومية", nameEn: "Government fees", accountKey: "EXP_GOV_FEES" },
  { code: "ADMIN", nameAr: "المصروفات الإدارية", nameEn: "Administrative", accountKey: "EXP_ADMIN" },
  { code: "VENDOR", nameAr: "مصروفات الموردين", nameEn: "Vendor services", accountKey: "EXP_VENDOR" },
  { code: "CAPEX", nameAr: "مصروفات رأسمالية", nameEn: "Capital expenditure", accountKey: "CAPEX", isCapital: true },
  { code: "EQUIP", nameAr: "معدات وأثاث (أصل)", nameEn: "Equipment & furniture (asset)", accountKey: "EQUIPMENT", isCapital: true },
  { code: "OTHER", nameAr: "مصروفات أخرى", nameEn: "Other", accountKey: "EXP_OTHER" },
];

export async function seedChartOfAccounts(db: Db, orgId: string) {
  const idByCode = new Map<string, string>();
  for (const a of DEFAULT_ACCOUNTS) {
    const acc = await db.chartOfAccount.upsert({
      where: { organizationId_code: { organizationId: orgId, code: a.code } },
      update: {},
      create: {
        organizationId: orgId,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        type: a.type,
        systemKey: a.systemKey,
        parentId: a.parent ? idByCode.get(a.parent) : undefined,
      },
    });
    idByCode.set(a.code, acc.id);
  }
  for (const c of DEFAULT_EXPENSE_CATEGORIES) {
    const acc = await db.chartOfAccount.findUniqueOrThrow({ where: { organizationId_systemKey: { organizationId: orgId, systemKey: c.accountKey } } });
    await db.expenseCategory.upsert({
      where: { organizationId_code: { organizationId: orgId, code: c.code } },
      update: {},
      create: { organizationId: orgId, code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, accountId: acc.id, isCapital: c.isCapital ?? false },
    });
  }
  const bankGl = await db.chartOfAccount.findUniqueOrThrow({ where: { organizationId_systemKey: { organizationId: orgId, systemKey: "BANK_MAIN" } } });
  const existing = await db.bankAccount.findUnique({ where: { glAccountId: bankGl.id } });
  if (!existing) {
    await db.bankAccount.create({ data: { organizationId: orgId, name: "الحساب البنكي الرئيسي / Main bank account", glAccountId: bankGl.id } });
  }
}

export async function accountByKey(db: Db, orgId: string, key: string) {
  const acc = await db.chartOfAccount.findUnique({ where: { organizationId_systemKey: { organizationId: orgId, systemKey: key } } });
  if (!acc) throw new AppError("BUSINESS_RULE", `System account ${key} is not configured`);
  return acc;
}

/** حساب النقدية/البنك المقابل لطريقة الدفع */
export async function cashAccountFor(db: Db, orgId: string, method: string, bankAccountId?: string | null) {
  if (bankAccountId) {
    const bank = await db.bankAccount.findFirst({ where: { id: bankAccountId, organizationId: orgId, isActive: true } });
    if (!bank) throw rule("الحساب البنكي غير صالح / Invalid bank account");
    return bank.glAccountId;
  }
  if (method === "CASH") return (await accountByKey(db, orgId, "CASH")).id;
  return (await accountByKey(db, orgId, "BANK_MAIN")).id;
}

// ------------------------------------------------------------
// محرك الترحيل
// ------------------------------------------------------------

export interface PostingLine {
  accountId: string;
  debit?: Baisa;
  credit?: Baisa;
  description?: string;
  propertyId?: string | null;
  unitId?: string | null;
  tenantId?: string | null;
  vendorId?: string | null;
}

export interface PostingInput {
  date: Date;
  memo: string;
  source: JournalSource;
  /** مفتاح فريد يمنع ترحيل نفس العملية مرتين */
  sourceKey?: string | null;
  lines: PostingLine[];
  reversesId?: string;
}

export function validateLines(lines: PostingLine[]): { debit: Baisa; credit: Baisa } {
  if (lines.length < 2) throw rule("القيد يحتاج سطرين على الأقل / An entry needs at least two lines");
  for (const l of lines) {
    const d = l.debit ?? 0n;
    const c = l.credit ?? 0n;
    if (d < 0n || c < 0n) throw rule("لا يسمح بمبالغ سالبة في القيد / Negative amounts are not allowed");
    if ((d > 0n) === (c > 0n)) throw rule("كل سطر يجب أن يكون مدينًا أو دائنًا فقط / Each line must be either debit or credit");
  }
  const debit = sum(lines.map((l) => l.debit ?? 0n));
  const credit = sum(lines.map((l) => l.credit ?? 0n));
  if (debit !== credit) throw rule(`القيد غير متوازن: مدين ${fromBaisa(debit)} ≠ دائن ${fromBaisa(credit)} / Unbalanced entry`);
  return { debit, credit };
}

/** يرحّل قيدًا متوازنًا داخل المعاملة الحالية. يُستدعى من الخدمات فقط. */
export async function postJournal(tx: Tx, ctx: Pick<Ctx, "orgId" | "userId">, input: PostingInput) {
  const lines = input.lines.filter((l) => (l.debit ?? 0n) !== 0n || (l.credit ?? 0n) !== 0n);
  validateLines(lines);
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx.chartOfAccount.findMany({ where: { id: { in: accountIds }, organizationId: ctx.orgId, isActive: true } });
  if (accounts.length !== accountIds.length) throw rule("حساب غير صالح أو غير نشط في القيد / Invalid or inactive account in entry");

  if (input.sourceKey) {
    const dup = await tx.journalEntry.findUnique({ where: { organizationId_sourceKey: { organizationId: ctx.orgId, sourceKey: input.sourceKey } } });
    if (dup) throw new AppError("CONFLICT", "تم ترحيل هذه العملية مسبقًا / This transaction was already posted");
  }
  const number = await nextNumber(tx, ctx.orgId, SEQ.JOURNAL, input.date.getUTCFullYear());
  return tx.journalEntry.create({
    data: {
      organizationId: ctx.orgId,
      number,
      date: input.date,
      memo: input.memo,
      status: "POSTED",
      source: input.source,
      sourceKey: input.sourceKey ?? null,
      reversesId: input.reversesId,
      postedAt: new Date(),
      postedById: ctx.userId,
      createdById: ctx.userId,
      lines: {
        create: lines.map((l, i) => ({
          lineNo: i + 1,
          accountId: l.accountId,
          debit: fromBaisa(l.debit ?? 0n),
          credit: fromBaisa(l.credit ?? 0n),
          description: l.description,
          propertyId: l.propertyId ?? null,
          unitId: l.unitId ?? null,
          tenantId: l.tenantId ?? null,
          vendorId: l.vendorId ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}

/** قيد عكسي كامل لقيد مرحّل — الطريقة الوحيدة لتصحيح القيود المرحّلة */
export async function reverseJournal(tx: Tx, ctx: Pick<Ctx, "orgId" | "userId">, entryId: string, opts: { date?: Date; reason: string; source?: JournalSource }) {
  const entry = await tx.journalEntry.findFirst({ where: { id: entryId, organizationId: ctx.orgId }, include: { lines: true, reversedBy: true } });
  if (!entry) throw notFound();
  if (entry.status !== "POSTED") throw rule("لا يمكن عكس قيد غير مرحّل / Only posted entries can be reversed");
  if (entry.reversedBy) throw new AppError("CONFLICT", "هذا القيد معكوس مسبقًا / Entry already reversed");
  if (entry.reversesId) throw rule("لا يمكن عكس قيد عكسي / Cannot reverse a reversal");
  return postJournal(tx, ctx, {
    date: opts.date ?? entry.date,
    memo: `عكس ${entry.number}: ${opts.reason} / Reversal of ${entry.number}`,
    source: opts.source ?? "REVERSAL",
    sourceKey: `REVERSAL:${entry.id}`,
    reversesId: entry.id,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      debit: toBaisa(l.credit),
      credit: toBaisa(l.debit),
      description: l.description ?? undefined,
      propertyId: l.propertyId,
      unitId: l.unitId,
      tenantId: l.tenantId,
      vendorId: l.vendorId,
    })),
  });
}

// ------------------------------------------------------------
// القيود اليدوية
// ------------------------------------------------------------

export interface ManualEntryInput {
  date: string;
  memo: string;
  lines: { accountId: string; debit: string; credit: string; description?: string; propertyId?: string | null }[];
  post: boolean;
}

export async function createManualEntry(ctx: Ctx, input: ManualEntryInput) {
  assertCan(ctx, "journal.write");
  const date = parseDateOnly(input.date);
  const lines: PostingLine[] = input.lines
    .map((l) => ({ accountId: l.accountId, debit: toBaisa(l.debit || "0"), credit: toBaisa(l.credit || "0"), description: l.description, propertyId: l.propertyId || null }))
    .filter((l) => l.debit !== 0n || l.credit !== 0n);
  validateLines(lines);
  return prisma.$transaction(async (tx) => {
    let entry;
    if (input.post) {
      entry = await postJournal(tx, ctx, { date, memo: input.memo, source: "MANUAL", lines });
    } else {
      const accountIds = [...new Set(lines.map((l) => l.accountId))];
      const n = await tx.chartOfAccount.count({ where: { id: { in: accountIds }, organizationId: ctx.orgId } });
      if (n !== accountIds.length) throw rule("حساب غير صالح / Invalid account");
      entry = await tx.journalEntry.create({
        data: {
          organizationId: ctx.orgId,
          number: await nextNumber(tx, ctx.orgId, SEQ.JOURNAL, date.getUTCFullYear()),
          date,
          memo: input.memo,
          status: "DRAFT",
          source: "MANUAL",
          createdById: ctx.userId,
          lines: { create: lines.map((l, i) => ({ lineNo: i + 1, accountId: l.accountId, debit: fromBaisa(l.debit ?? 0n), credit: fromBaisa(l.credit ?? 0n), description: l.description, propertyId: l.propertyId })) },
        },
      });
    }
    await audit(tx, ctx, { action: input.post ? "journal.post" : "journal.draft", entityType: "JournalEntry", entityId: entry.id, summary: `${entry.number} ${input.memo}`, after: { lines: input.lines } });
    return entry;
  });
}

export async function postDraftEntry(ctx: Ctx, entryId: string) {
  assertCan(ctx, "journal.write");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({ where: { id: entryId, organizationId: ctx.orgId }, include: { lines: true } });
    if (!entry) throw notFound();
    if (entry.status !== "DRAFT") throw rule("القيد مرحّل مسبقًا / Entry already posted");
    validateLines(entry.lines.map((l) => ({ accountId: l.accountId, debit: toBaisa(l.debit), credit: toBaisa(l.credit) })));
    const updated = await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.userId } });
    await audit(tx, ctx, { action: "journal.post", entityType: "JournalEntry", entityId: entry.id, summary: entry.number });
    return updated;
  });
}

export async function deleteDraftEntry(ctx: Ctx, entryId: string) {
  assertCan(ctx, "journal.write");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({ where: { id: entryId, organizationId: ctx.orgId } });
    if (!entry) throw notFound();
    if (entry.status !== "DRAFT") throw rule("لا يمكن حذف قيد مرحّل / Posted entries cannot be deleted");
    await tx.journalLine.deleteMany({ where: { entryId } });
    await tx.journalEntry.delete({ where: { id: entryId } });
    await audit(tx, ctx, { action: "journal.delete_draft", entityType: "JournalEntry", entityId: entryId, summary: entry.number });
  });
}

export async function reverseManualEntry(ctx: Ctx, entryId: string, reason: string, date?: string) {
  assertCan(ctx, "journal.write");
  if (!reason.trim()) throw rule("سبب العكس مطلوب / Reason is required");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({ where: { id: entryId, organizationId: ctx.orgId } });
    if (!entry) throw notFound();
    if (entry.source !== "MANUAL") throw rule("القيود الآلية تُعكس من مصدرها (إلغاء الدفعة/المصروف) / Automatic entries must be reversed from their source document");
    const rev = await reverseJournal(tx, ctx, entryId, { reason, date: date ? parseDateOnly(date) : undefined });
    await audit(tx, ctx, { action: "journal.reverse", entityType: "JournalEntry", entityId: entryId, summary: `${entry.number} → ${rev.number}: ${reason}` });
    return rev;
  });
}

// ------------------------------------------------------------
// التقارير المحاسبية (تعتمد حصرًا على القيود المرحّلة)
// ------------------------------------------------------------

export interface BalanceRow {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  debit: Baisa;
  credit: Baisa;
  /** الرصيد بطبيعة الحساب: مدين للأصول والمصروفات، دائن للالتزامات والحقوق والإيرادات */
  balance: Baisa;
}

export interface LedgerFilter {
  from?: Date;
  to?: Date;
  propertyId?: string;
  propertyIds?: string[] | null;
}

function lineWhere(ctx: Ctx, f: LedgerFilter) {
  const parts = [Prisma.sql`e."organizationId" = ${ctx.orgId}`, Prisma.sql`e."status" = 'POSTED'`];
  if (f.from) parts.push(Prisma.sql`e."date" >= ${formatDateOnly(f.from)}::date`);
  if (f.to) parts.push(Prisma.sql`e."date" <= ${formatDateOnly(f.to)}::date`);
  if (f.propertyId) parts.push(Prisma.sql`l."propertyId" = ${f.propertyId}`);
  else if (ctx.propertyIds !== null) parts.push(Prisma.sql`l."propertyId" = ANY(${ctx.propertyIds})`);
  return Prisma.join(parts, " AND ");
}

export function naturalBalance(type: AccountType, debit: Baisa, credit: Baisa): Baisa {
  return type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit;
}

export async function accountBalances(ctx: Ctx, f: LedgerFilter = {}): Promise<BalanceRow[]> {
  const rows = await prisma.$queryRaw<{ accountId: string; debit: string; credit: string }[]>`
    SELECT l."accountId" AS "accountId", COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
    FROM "journal_lines" l JOIN "journal_entries" e ON e."id" = l."entryId"
    WHERE ${lineWhere(ctx, f)}
    GROUP BY l."accountId"`;
  const accounts = await prisma.chartOfAccount.findMany({ where: { organizationId: ctx.orgId }, orderBy: { code: "asc" } });
  const map = new Map(rows.map((r) => [r.accountId, r]));
  return accounts
    .filter((a) => map.has(a.id))
    .map((a) => {
      const r = map.get(a.id)!;
      const debit = toBaisa(r.debit);
      const credit = toBaisa(r.credit);
      return { accountId: a.id, code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, type: a.type, debit, credit, balance: naturalBalance(a.type, debit, credit) };
    });
}

export async function trialBalance(ctx: Ctx, f: LedgerFilter = {}) {
  assertCan(ctx, "journal.read");
  const rows = await accountBalances(ctx, f);
  const out = rows.map((r) => {
    const net = r.debit - r.credit;
    return { ...r, debitBalance: net > 0n ? net : 0n, creditBalance: net < 0n ? -net : 0n };
  });
  const totalDebit = sum(out.map((r) => r.debitBalance));
  const totalCredit = sum(out.map((r) => r.creditBalance));
  return { rows: out, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function incomeStatement(ctx: Ctx, f: LedgerFilter) {
  assertCan(ctx, "finance.read");
  const rows = (await accountBalances(ctx, f)).filter((r) => r.type === "INCOME" || r.type === "EXPENSE");
  const income = rows.filter((r) => r.type === "INCOME");
  const expenses = rows.filter((r) => r.type === "EXPENSE");
  const totalIncome = sum(income.map((r) => r.balance));
  const totalExpenses = sum(expenses.map((r) => r.balance));
  return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
}

export async function balanceSheet(ctx: Ctx, asOf: Date) {
  assertCan(ctx, "journal.read");
  const rows = await accountBalances(ctx, { to: asOf });
  const assets = rows.filter((r) => r.type === "ASSET");
  const liabilities = rows.filter((r) => r.type === "LIABILITY");
  const equity = rows.filter((r) => r.type === "EQUITY");
  const earnings = sum(rows.filter((r) => r.type === "INCOME").map((r) => r.balance)) - sum(rows.filter((r) => r.type === "EXPENSE").map((r) => r.balance));
  const totalAssets = sum(assets.map((r) => r.balance));
  const totalLiabilities = sum(liabilities.map((r) => r.balance));
  const totalEquity = sum(equity.map((r) => r.balance)) + earnings;
  return { assets, liabilities, equity, earnings, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

export async function accountLedger(ctx: Ctx, accountId: string, f: LedgerFilter) {
  assertCan(ctx, "journal.read");
  const account = await prisma.chartOfAccount.findFirst({ where: { id: accountId, organizationId: ctx.orgId } });
  if (!account) throw notFound();
  const opening = f.from ? (await accountBalances(ctx, { ...f, from: undefined, to: new Date(f.from.getTime() - 86400000) })).find((r) => r.accountId === accountId) : undefined;
  const lines = await prisma.journalLine.findMany({
    where: {
      accountId,
      entry: { organizationId: ctx.orgId, status: "POSTED", date: { gte: f.from, lte: f.to } },
      ...(f.propertyId ? { propertyId: f.propertyId } : ctx.propertyIds !== null ? { propertyId: { in: ctx.propertyIds } } : {}),
    },
    include: { entry: true },
    orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }, { lineNo: "asc" }],
  });
  let running = opening?.balance ?? 0n;
  const rows = lines.map((l) => {
    const d = toBaisa(l.debit);
    const c = toBaisa(l.credit);
    running += naturalBalance(account.type, d, c);
    return { id: l.id, date: formatDateOnly(l.entry.date), number: l.entry.number, entryId: l.entryId, memo: l.description || l.entry.memo, debit: d, credit: c, balance: running };
  });
  return { account, opening: opening?.balance ?? 0n, rows, closing: running };
}

/** ملخص التدفق النقدي: حركة حسابات النقدية والبنوك حسب المصدر */
export async function cashFlow(ctx: Ctx, f: LedgerFilter) {
  assertCan(ctx, "finance.read");
  const cashAccounts = await prisma.chartOfAccount.findMany({
    where: { organizationId: ctx.orgId, OR: [{ systemKey: "CASH" }, { bankAccount: { isNot: null } }] },
  });
  const ids = cashAccounts.map((a) => a.id);
  if (ids.length === 0) return { inflows: 0n, outflows: 0n, net: 0n, bySource: [] as { source: string; inflow: Baisa; outflow: Baisa }[], opening: 0n, closing: 0n };
  const rows = await prisma.$queryRaw<{ source: string; debit: string; credit: string }[]>`
    SELECT e."source"::text AS source, COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
    FROM "journal_lines" l JOIN "journal_entries" e ON e."id" = l."entryId"
    WHERE ${lineWhere(ctx, f)} AND l."accountId" = ANY(${ids})
    GROUP BY e."source"`;
  const openingRows = f.from
    ? await prisma.$queryRaw<{ debit: string; credit: string }[]>`
        SELECT COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
        FROM "journal_lines" l JOIN "journal_entries" e ON e."id" = l."entryId"
        WHERE ${lineWhere(ctx, { ...f, from: undefined, to: new Date(f.from.getTime() - 86400000) })} AND l."accountId" = ANY(${ids})`
    : [{ debit: "0", credit: "0" }];
  const opening = toBaisa(openingRows[0].debit) - toBaisa(openingRows[0].credit);
  const bySource = rows.map((r) => ({ source: r.source, inflow: toBaisa(r.debit), outflow: toBaisa(r.credit) }));
  const inflows = sum(bySource.map((r) => r.inflow));
  const outflows = sum(bySource.map((r) => r.outflow));
  return { inflows, outflows, net: inflows - outflows, bySource, opening, closing: opening + inflows - outflows };
}
