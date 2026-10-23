import { Prisma } from "@/generated/prisma/client";
import { addDays, formatDateOnly, parseDateOnly, startOfMonth, startOfYear, todayInZone } from "@/lib/dates";
import { allocateByWeights, type Baisa, formatOMR, sum, toBaisa } from "@/lib/money";
import { assertCan, type Ctx } from "../context";
import { prisma } from "../db";
import { forbidden, notFound } from "../errors";
import { accountBalances, accountLedger, balanceSheet, cashFlow, incomeStatement, trialBalance } from "./accounting";
import { arrears } from "./billing";
import { resolvePropertyIds } from "./dashboard";
import { tenantStatement } from "./tenants";

export type ColumnType = "text" | "money" | "number" | "date" | "percent";
export interface Column {
  key: string;
  ar: string;
  en: string;
  type?: ColumnType;
}
export type Cell = string | number | bigint | null;
export interface ReportResult {
  key: string;
  titleAr: string;
  titleEn: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  notes?: string[];
  filters: Record<string, string>;
  generatedAt: Date;
}

export interface ReportParams {
  from?: string;
  to?: string;
  asOf?: string;
  propertyId?: string;
  ownerId?: string;
  tenantId?: string;
  accountId?: string;
  compareFrom?: string;
  compareTo?: string;
}

export interface ReportDef {
  key: string;
  titleAr: string;
  titleEn: string;
  group: "operations" | "finance" | "accounting" | "maintenance";
  params: (keyof ReportParams)[];
  run: (ctx: Ctx, p: ReportParams) => Promise<Omit<ReportResult, "key" | "titleAr" | "titleEn" | "filters" | "generatedAt">>;
}

function period(ctx: Ctx, p: ReportParams) {
  const today = todayInZone(ctx.timezone);
  return { from: p.from ? parseDateOnly(p.from) : startOfYear(today), to: p.to ? parseDateOnly(p.to) : today, today };
}

const C = (key: string, ar: string, en: string, type: ColumnType = "text"): Column => ({ key, ar, en, type });

const REPORTS: ReportDef[] = [
  {
    key: "occupancy",
    titleAr: "تقرير الإشغال",
    titleEn: "Occupancy report",
    group: "operations",
    params: ["propertyId", "ownerId"],
    async run(ctx, p) {
      assertCan(ctx, "property.read");
      const ids = await resolvePropertyIds(ctx, p);
      const props = await prisma.property.findMany({
        where: { organizationId: ctx.orgId, archivedAt: null, id: ids === null ? undefined : { in: ids } },
        include: { units: { where: { archivedAt: null }, select: { status: true } } },
        orderBy: { code: "asc" },
      });
      const rows = props.map((pr) => {
        const n = (s: string) => pr.units.filter((u) => u.status === s).length;
        const leasable = pr.units.length - n("INACTIVE");
        return { code: pr.code, name: pr.name, total: pr.units.length, occupied: n("OCCUPIED"), vacant: n("VACANT"), reserved: n("RESERVED"), maintenance: n("UNDER_MAINTENANCE"), rate: leasable ? (n("OCCUPIED") / leasable) * 100 : 0 };
      });
      const t = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);
      const leasable = t("total") - props.reduce((a, pr) => a + pr.units.filter((u) => u.status === "INACTIVE").length, 0);
      return {
        columns: [C("code", "الرمز", "Code"), C("name", "العقار", "Property"), C("total", "الوحدات", "Units", "number"), C("occupied", "مؤجرة", "Occupied", "number"), C("vacant", "شاغرة", "Vacant", "number"), C("reserved", "محجوزة", "Reserved", "number"), C("maintenance", "تحت الصيانة", "Maintenance", "number"), C("rate", "معدل الإشغال", "Occupancy", "percent")],
        rows,
        totals: { code: "", name: "الإجمالي / Total", total: t("total"), occupied: t("occupied"), vacant: t("vacant"), reserved: t("reserved"), maintenance: t("maintenance"), rate: leasable ? (t("occupied") / leasable) * 100 : 0 },
      };
    },
  },
  {
    key: "units",
    titleAr: "تقرير العقارات والوحدات",
    titleEn: "Properties & units",
    group: "operations",
    params: ["propertyId", "ownerId"],
    async run(ctx, p) {
      assertCan(ctx, "property.read");
      const ids = await resolvePropertyIds(ctx, p);
      const units = await prisma.unit.findMany({
        where: { archivedAt: null, property: { organizationId: ctx.orgId, archivedAt: null }, propertyId: ids === null ? undefined : { in: ids } },
        include: { property: true, building: true, leases: { where: { status: "ACTIVE" }, include: { tenant: true } } },
        orderBy: [{ property: { code: "asc" } }, { unitNumber: "asc" }],
      });
      return {
        columns: [C("property", "العقار", "Property"), C("building", "المبنى", "Building"), C("unit", "الوحدة", "Unit"), C("type", "النوع", "Type"), C("area", "المساحة", "Area", "number"), C("status", "الحالة", "Status"), C("tenant", "المستأجر", "Tenant"), C("rent", "الإيجار الشهري", "Monthly rent", "money"), C("end", "نهاية العقد", "Lease end", "date")],
        rows: units.map((u) => ({
          property: `${u.property.code} ${u.property.name}`,
          building: u.building?.name ?? "",
          unit: u.unitNumber,
          type: u.type,
          area: u.area ? Number(u.area) : null,
          status: u.status,
          tenant: u.leases[0]?.tenant.name ?? "",
          rent: u.leases[0] ? toBaisa(u.leases[0].monthlyRent) : null,
          end: u.leases[0] ? formatDateOnly(u.leases[0].endDate) : null,
        })),
      };
    },
  },
  {
    key: "income-expense",
    titleAr: "تقرير الإيرادات والمصروفات حسب العقار",
    titleEn: "Income & expenses by property",
    group: "finance",
    params: ["from", "to", "propertyId", "ownerId"],
    async run(ctx, p) {
      assertCan(ctx, "finance.read");
      const { from, to } = period(ctx, p);
      const ids = await resolvePropertyIds(ctx, p);
      const rows = await prisma.$queryRaw<{ propertyId: string | null; type: string; debit: string; credit: string }[]>`
        SELECT l."propertyId" AS "propertyId", a."type"::text AS type, COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
        FROM "journal_lines" l JOIN "journal_entries" e ON e."id" = l."entryId" JOIN "chart_of_accounts" a ON a."id" = l."accountId"
        WHERE e."organizationId" = ${ctx.orgId} AND e."status" = 'POSTED' AND a."type" IN ('INCOME','EXPENSE')
          AND e."date" >= ${formatDateOnly(from)}::date AND e."date" <= ${formatDateOnly(to)}::date
          ${ids === null ? Prisma.empty : Prisma.sql`AND l."propertyId" = ANY(${ids})`}
        GROUP BY l."propertyId", a."type"`;
      const props = await prisma.property.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, name: true } });
      const names = new Map(props.map((x) => [x.id, `${x.code} ${x.name}`]));
      const map = new Map<string, { income: Baisa; expense: Baisa }>();
      for (const r of rows) {
        const k = r.propertyId ?? "";
        const cur = map.get(k) ?? { income: 0n, expense: 0n };
        if (r.type === "INCOME") cur.income += toBaisa(r.credit) - toBaisa(r.debit);
        else cur.expense += toBaisa(r.debit) - toBaisa(r.credit);
        map.set(k, cur);
      }
      const out = [...map.entries()].map(([k, v]) => ({ property: k ? (names.get(k) ?? k) : "غير مرتبط بعقار / Unassigned", income: v.income, expense: v.expense, net: v.income - v.expense }));
      return {
        columns: [C("property", "العقار", "Property"), C("income", "الإيرادات", "Income", "money"), C("expense", "المصروفات", "Expenses", "money"), C("net", "صافي الدخل", "Net income", "money")],
        rows: out,
        totals: { property: "الإجمالي / Total", income: sum(out.map((r) => r.income)), expense: sum(out.map((r) => r.expense)), net: sum(out.map((r) => r.net)) },
        notes: ["المصدر: القيود المرحّلة (أساس الاستحقاق) / Source: posted journal entries (accrual basis)"],
      };
    },
  },
  {
    key: "arrears",
    titleAr: "تقرير المتأخرات (أعمار الديون)",
    titleEn: "Arrears aging",
    group: "finance",
    params: ["asOf", "propertyId"],
    async run(ctx, p) {
      const asOf = p.asOf ? parseDateOnly(p.asOf) : todayInZone(ctx.timezone);
      const list = await arrears(ctx, { asOf, propertyId: p.propertyId });
      const rows = list.map((c) => ({
        charge: c.number,
        tenant: c.lease.tenant.name,
        phone: c.lease.tenant.phone ?? "",
        property: `${c.lease.unit.property.code} / ${c.lease.unit.unitNumber}`,
        lease: c.lease.number,
        due: formatDateOnly(c.dueDate),
        days: c.daysOverdue,
        bucket: c.bucket,
        amount: toBaisa(c.amount),
        paid: toBaisa(c.paidAmount),
        balance: c.balance,
      }));
      return {
        columns: [C("charge", "الاستحقاق", "Charge"), C("tenant", "المستأجر", "Tenant"), C("phone", "الهاتف", "Phone"), C("property", "العقار/الوحدة", "Property/Unit"), C("lease", "العقد", "Lease"), C("due", "تاريخ الاستحقاق", "Due date", "date"), C("days", "أيام التأخير", "Days", "number"), C("bucket", "الفئة", "Bucket"), C("amount", "المبلغ", "Amount", "money"), C("paid", "المدفوع", "Paid", "money"), C("balance", "المتبقي", "Balance", "money")],
        rows,
        totals: { charge: "الإجمالي / Total", amount: sum(rows.map((r) => r.amount)), paid: sum(rows.map((r) => r.paid)), balance: sum(rows.map((r) => r.balance)) },
        notes: (["0-30", "31-60", "61-90", "90+"] as const).map((b) => `${b}: ${formatOMR(sum(rows.filter((r) => r.bucket === b).map((r) => r.balance)))} OMR`),
      };
    },
  },
  {
    key: "tenant-statement",
    titleAr: "كشف حساب المستأجر",
    titleEn: "Tenant statement",
    group: "finance",
    params: ["tenantId", "from", "to"],
    async run(ctx, p) {
      if (!p.tenantId) return { columns: [], rows: [], notes: ["اختر مستأجرًا / Select a tenant"] };
      const s = await tenantStatement(ctx, p.tenantId, { from: p.from, to: p.to });
      return {
        columns: [C("date", "التاريخ", "Date", "date"), C("reference", "المرجع", "Reference"), C("kind", "النوع", "Type"), C("description", "البيان", "Description"), C("debit", "مدين", "Debit", "money"), C("credit", "دائن", "Credit", "money"), C("balance", "الرصيد", "Balance", "money")],
        rows: [{ date: p.from ?? "", reference: "", kind: "", description: "رصيد افتتاحي / Opening balance", debit: null, credit: null, balance: s.opening }, ...s.lines.map((l) => ({ ...l }))],
        totals: { description: `${s.tenant.name} — الرصيد الختامي / Closing`, debit: sum(s.lines.map((l) => l.debit)), credit: sum(s.lines.map((l) => l.credit)), balance: s.closing },
        notes: ["رصيد موجب = مستحق على المستأجر؛ سالب = رصيد دائن للمستأجر / Positive = owed by tenant"],
      };
    },
  },
  {
    key: "owner-statement",
    titleAr: "كشف حساب المالك (توزيع حسب نسب الملكية)",
    titleEn: "Owner statement (by ownership share)",
    group: "finance",
    params: ["ownerId", "from", "to"],
    async run(ctx, p) {
      assertCan(ctx, "finance.read");
      const ownerId = ctx.roleKey === "OWNER" ? ctx.ownerId! : p.ownerId;
      if (!ownerId) return { columns: [], rows: [], notes: ["اختر مالكًا / Select an owner"] };
      const owner = await prisma.owner.findFirst({ where: { id: ownerId, organizationId: ctx.orgId } });
      if (!owner) throw notFound();
      const { from, to } = period(ctx, p);
      const shares = await prisma.ownershipShare.findMany({
        where: { ownerId, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }], property: { organizationId: ctx.orgId } },
        include: { property: true },
      });
      const rows = [];
      for (const s of shares) {
        if (ctx.propertyIds !== null && !ctx.propertyIds.includes(s.propertyId)) continue;
        // الفترة الفعلية لنسبة الملكية داخل فترة التقرير
        const pf = s.effectiveFrom > from ? s.effectiveFrom : from;
        const pt = s.effectiveTo && s.effectiveTo < to ? s.effectiveTo : to;
        const is = await incomeStatement({ ...ctx, propertyIds: null }, { from: pf, to: pt, propertyId: s.propertyId });
        // التوزيع: حصة المالك بطريقة أكبر باقٍ مع بقية الملاك لضمان تطابق المجموع
        const all = await prisma.ownershipShare.findMany({ where: { propertyId: s.propertyId, effectiveFrom: s.effectiveFrom }, orderBy: { id: "asc" } });
        const idx = all.findIndex((x) => x.id === s.id);
        const incomeShare = allocateByWeights(is.totalIncome, all.map((x) => x.percentage.toString()))[idx];
        const expenseShare = allocateByWeights(is.totalExpenses, all.map((x) => x.percentage.toString()))[idx];
        rows.push({
          property: `${s.property.code} ${s.property.name}`,
          period: `${formatDateOnly(pf)} → ${formatDateOnly(pt)}`,
          share: Number(s.percentage),
          income: is.totalIncome,
          expense: is.totalExpenses,
          net: is.netIncome,
          ownerIncome: incomeShare,
          ownerExpense: expenseShare,
          ownerNet: incomeShare - expenseShare,
        });
      }
      return {
        columns: [C("property", "العقار", "Property"), C("period", "الفترة", "Period"), C("share", "النسبة %", "Share %", "percent"), C("income", "إيراد العقار", "Property income", "money"), C("expense", "مصروف العقار", "Property expenses", "money"), C("net", "صافي العقار", "Property net", "money"), C("ownerIncome", "حصة الإيراد", "Owner income", "money"), C("ownerExpense", "حصة المصروف", "Owner expenses", "money"), C("ownerNet", "صافي حصة المالك", "Owner net", "money")],
        rows,
        totals: { property: owner.name, ownerIncome: sum(rows.map((r) => r.ownerIncome)), ownerExpense: sum(rows.map((r) => r.ownerExpense)), ownerNet: sum(rows.map((r) => r.ownerNet)) },
        notes: ["الأرقام على أساس الاستحقاق من القيود المرحّلة / Accrual basis from posted entries"],
      };
    },
  },
  {
    key: "cash-flow",
    titleAr: "تقرير التدفق النقدي",
    titleEn: "Cash flow",
    group: "accounting",
    params: ["from", "to", "propertyId"],
    async run(ctx, p) {
      const { from, to } = period(ctx, p);
      const cf = await cashFlow(ctx, { from, to, propertyId: p.propertyId });
      return {
        columns: [C("source", "المصدر", "Source"), C("inflow", "مقبوضات", "Inflows", "money"), C("outflow", "مدفوعات", "Outflows", "money"), C("net", "الصافي", "Net", "money")],
        rows: [{ source: "الرصيد الافتتاحي / Opening", inflow: null, outflow: null, net: cf.opening }, ...cf.bySource.map((r) => ({ source: r.source, inflow: r.inflow, outflow: r.outflow, net: r.inflow - r.outflow }))],
        totals: { source: "الرصيد الختامي / Closing", inflow: cf.inflows, outflow: cf.outflows, net: cf.closing },
      };
    },
  },
  {
    key: "profit-loss",
    titleAr: "قائمة الدخل (الأرباح والخسائر)",
    titleEn: "Profit & loss",
    group: "accounting",
    params: ["from", "to", "propertyId"],
    async run(ctx, p) {
      const { from, to } = period(ctx, p);
      const is = await incomeStatement(ctx, { from, to, propertyId: p.propertyId });
      const row = (r: (typeof is.income)[number]) => ({ code: r.code, account: `${r.nameAr} / ${r.nameEn}`, amount: r.balance });
      return {
        columns: [C("code", "الرمز", "Code"), C("account", "الحساب", "Account"), C("amount", "المبلغ", "Amount", "money")],
        rows: [
          { code: "", account: "— الإيرادات / Income —", amount: null },
          ...is.income.map(row),
          { code: "", account: "إجمالي الإيرادات / Total income", amount: is.totalIncome },
          { code: "", account: "— المصروفات / Expenses —", amount: null },
          ...is.expenses.map(row),
          { code: "", account: "إجمالي المصروفات / Total expenses", amount: is.totalExpenses },
        ],
        totals: { account: "صافي الدخل / Net income", amount: is.netIncome },
      };
    },
  },
  {
    key: "trial-balance",
    titleAr: "ميزان المراجعة",
    titleEn: "Trial balance",
    group: "accounting",
    params: ["from", "to"],
    async run(ctx, p) {
      const tb = await trialBalance(ctx, { from: p.from ? parseDateOnly(p.from) : undefined, to: p.to ? parseDateOnly(p.to) : todayInZone(ctx.timezone) });
      return {
        columns: [C("code", "الرمز", "Code"), C("account", "الحساب", "Account"), C("type", "النوع", "Type"), C("debit", "مدين", "Debit", "money"), C("credit", "دائن", "Credit", "money")],
        rows: tb.rows.map((r) => ({ code: r.code, account: `${r.nameAr} / ${r.nameEn}`, type: r.type, debit: r.debitBalance, credit: r.creditBalance })),
        totals: { account: tb.balanced ? "متوازن ✓ / Balanced" : "غير متوازن ✗ / NOT balanced", debit: tb.totalDebit, credit: tb.totalCredit },
      };
    },
  },
  {
    key: "balance-sheet",
    titleAr: "قائمة المركز المالي",
    titleEn: "Balance sheet",
    group: "accounting",
    params: ["asOf"],
    async run(ctx, p) {
      const asOf = p.asOf ? parseDateOnly(p.asOf) : todayInZone(ctx.timezone);
      const bs = await balanceSheet(ctx, asOf);
      const row = (r: { code: string; nameAr: string; nameEn: string; balance: Baisa }) => ({ code: r.code, account: `${r.nameAr} / ${r.nameEn}`, amount: r.balance });
      return {
        columns: [C("code", "الرمز", "Code"), C("account", "الحساب", "Account"), C("amount", "الرصيد", "Balance", "money")],
        rows: [
          { code: "", account: "— الأصول / Assets —", amount: null },
          ...bs.assets.map(row),
          { code: "", account: "إجمالي الأصول / Total assets", amount: bs.totalAssets },
          { code: "", account: "— الالتزامات / Liabilities —", amount: null },
          ...bs.liabilities.map(row),
          { code: "", account: "إجمالي الالتزامات / Total liabilities", amount: bs.totalLiabilities },
          { code: "", account: "— حقوق الملكية / Equity —", amount: null },
          ...bs.equity.map(row),
          { code: "", account: "أرباح الفترة غير المقفلة / Current earnings", amount: bs.earnings },
          { code: "", account: "إجمالي حقوق الملكية / Total equity", amount: bs.totalEquity },
        ],
        totals: { account: bs.balanced ? "الأصول = الالتزامات + الحقوق ✓" : "غير متوازن ✗", amount: bs.totalLiabilities + bs.totalEquity },
      };
    },
  },
  {
    key: "account-movement",
    titleAr: "حركة حساب (دفتر الأستاذ)",
    titleEn: "Account movement (ledger)",
    group: "accounting",
    params: ["accountId", "from", "to", "propertyId"],
    async run(ctx, p) {
      if (!p.accountId) return { columns: [], rows: [], notes: ["اختر حسابًا / Select an account"] };
      const { from, to } = period(ctx, p);
      const l = await accountLedger(ctx, p.accountId, { from, to, propertyId: p.propertyId });
      return {
        columns: [C("date", "التاريخ", "Date", "date"), C("number", "رقم القيد", "Entry"), C("memo", "البيان", "Memo"), C("debit", "مدين", "Debit", "money"), C("credit", "دائن", "Credit", "money"), C("balance", "الرصيد", "Balance", "money")],
        rows: [{ date: formatDateOnly(from), number: "", memo: "رصيد افتتاحي / Opening", debit: null, credit: null, balance: l.opening }, ...l.rows],
        totals: { memo: `${l.account.code} ${l.account.nameAr}`, debit: sum(l.rows.map((r) => r.debit)), credit: sum(l.rows.map((r) => r.credit)), balance: l.closing },
      };
    },
  },
  {
    key: "period-comparison",
    titleAr: "مقارنة الفترات",
    titleEn: "Period comparison",
    group: "accounting",
    params: ["from", "to", "compareFrom", "compareTo", "propertyId"],
    async run(ctx, p) {
      const { from, to } = period(ctx, p);
      const len = to.getTime() - from.getTime();
      const cFrom = p.compareFrom ? parseDateOnly(p.compareFrom) : new Date(from.getTime() - len - 86400000);
      const cTo = p.compareTo ? parseDateOnly(p.compareTo) : addDays(from, -1);
      const [a, b] = await Promise.all([accountBalances(ctx, { from, to, propertyId: p.propertyId }), accountBalances(ctx, { from: cFrom, to: cTo, propertyId: p.propertyId })]);
      const keys = new Map<string, { code: string; name: string; type: string }>();
      for (const r of [...a, ...b]) if (r.type === "INCOME" || r.type === "EXPENSE") keys.set(r.accountId, { code: r.code, name: `${r.nameAr} / ${r.nameEn}`, type: r.type });
      const rows = [...keys.entries()]
        .sort((x, y) => x[1].code.localeCompare(y[1].code))
        .map(([id, k]) => {
          const cur = a.find((r) => r.accountId === id)?.balance ?? 0n;
          const prev = b.find((r) => r.accountId === id)?.balance ?? 0n;
          return { code: k.code, account: k.name, current: cur, previous: prev, change: cur - prev, pct: prev !== 0n ? (Number(cur - prev) / Math.abs(Number(prev))) * 100 : null };
        });
      return {
        columns: [C("code", "الرمز", "Code"), C("account", "الحساب", "Account"), C("current", `${formatDateOnly(from)}→${formatDateOnly(to)}`, `${formatDateOnly(from)}→${formatDateOnly(to)}`, "money"), C("previous", `${formatDateOnly(cFrom)}→${formatDateOnly(cTo)}`, `${formatDateOnly(cFrom)}→${formatDateOnly(cTo)}`, "money"), C("change", "التغير", "Change", "money"), C("pct", "التغير %", "Change %", "percent")],
        rows,
      };
    },
  },
  {
    key: "maintenance-costs",
    titleAr: "تقرير الصيانة وتكاليفها",
    titleEn: "Maintenance & costs",
    group: "maintenance",
    params: ["from", "to", "propertyId"],
    async run(ctx, p) {
      assertCan(ctx, "maintenance.read");
      const { from, to } = period(ctx, p);
      const ids = await resolvePropertyIds(ctx, p);
      const wos = await prisma.workOrder.findMany({
        where: { organizationId: ctx.orgId, propertyId: ids === null ? undefined : { in: ids }, createdAt: { gte: from, lte: addDays(to, 1) } },
        include: { invoices: true, expenses: true, vendor: true },
        orderBy: { createdAt: "desc" },
      });
      const props = new Map((await prisma.property.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true } })).map((x) => [x.id, x.code]));
      const rows = wos.map((w) => {
        const posted = sum([...w.invoices.filter((i) => i.status !== "VOID" && i.status !== "REJECTED").map((i) => toBaisa(i.total)), ...w.expenses.filter((e) => e.status === "POSTED").map((e) => toBaisa(e.total))]);
        return {
          number: w.number,
          property: props.get(w.propertyId) ?? "",
          category: w.category,
          type: w.type,
          title: w.title,
          status: w.status,
          vendor: w.vendor?.name ?? "",
          estimated: w.estimatedCost ? toBaisa(w.estimatedCost) : null,
          internal: toBaisa(w.laborCost) + toBaisa(w.materialsCost),
          posted,
          rating: w.qualityRating,
        };
      });
      return {
        columns: [C("number", "أمر العمل", "WO"), C("property", "العقار", "Property"), C("category", "الفئة", "Category"), C("type", "النوع", "Type"), C("title", "العنوان", "Title"), C("status", "الحالة", "Status"), C("vendor", "المورد", "Vendor"), C("estimated", "التقدير", "Estimate", "money"), C("internal", "تكلفة داخلية", "Internal cost", "money"), C("posted", "فواتير/مصروفات مرحّلة", "Posted invoices/expenses", "money"), C("rating", "التقييم", "Rating", "number")],
        rows,
        totals: { number: `${rows.length}`, estimated: sum(rows.map((r) => r.estimated ?? 0n)), internal: sum(rows.map((r) => r.internal)), posted: sum(rows.map((r) => r.posted)) },
        notes: ["التكلفة المحاسبية = الفواتير والمصروفات المرحّلة المرتبطة؛ التكلفة الداخلية (عمالة/مواد) للمتابعة فقط / Accounting cost = linked posted invoices & expenses"],
      };
    },
  },
  {
    key: "vendor-payables",
    titleAr: "تقرير الموردين والمستحقات",
    titleEn: "Vendor payables",
    group: "finance",
    params: ["asOf"],
    async run(ctx, p) {
      assertCan(ctx, "finance.read");
      const asOf = p.asOf ? parseDateOnly(p.asOf) : todayInZone(ctx.timezone);
      const invs = await prisma.invoice.findMany({
        where: { organizationId: ctx.orgId, status: { in: ["POSTED", "PARTIALLY_PAID"] }, date: { lte: asOf }, propertyId: ctx.propertyIds === null ? undefined : { in: ctx.propertyIds } },
        include: { vendor: true },
        orderBy: { dueDate: "asc" },
      });
      const rows = invs.map((i) => {
        const days = Math.floor((asOf.getTime() - i.dueDate.getTime()) / 86400000);
        return { vendor: i.vendor.name, number: i.number, vendorInvoiceNo: i.vendorInvoiceNo, date: formatDateOnly(i.date), due: formatDateOnly(i.dueDate), overdueDays: days > 0 ? days : 0, total: toBaisa(i.total), paid: toBaisa(i.paidAmount), balance: toBaisa(i.total) - toBaisa(i.paidAmount) };
      });
      return {
        columns: [C("vendor", "المورد", "Vendor"), C("number", "رقم الفاتورة", "Bill"), C("vendorInvoiceNo", "رقم فاتورة المورد", "Vendor ref"), C("date", "التاريخ", "Date", "date"), C("due", "الاستحقاق", "Due", "date"), C("overdueDays", "أيام التأخير", "Days overdue", "number"), C("total", "الإجمالي", "Total", "money"), C("paid", "المدفوع", "Paid", "money"), C("balance", "المتبقي", "Balance", "money")],
        rows,
        totals: { vendor: "الإجمالي / Total", total: sum(rows.map((r) => r.total)), paid: sum(rows.map((r) => r.paid)), balance: sum(rows.map((r) => r.balance)) },
      };
    },
  },
  {
    key: "lease-expiry",
    titleAr: "تقرير انتهاء العقود",
    titleEn: "Lease expiry",
    group: "operations",
    params: ["from", "to", "propertyId"],
    async run(ctx, p) {
      assertCan(ctx, "lease.read");
      const today = todayInZone(ctx.timezone);
      const from = p.from ? parseDateOnly(p.from) : today;
      const to = p.to ? parseDateOnly(p.to) : addDays(today, 120);
      const ids = await resolvePropertyIds(ctx, p);
      const leases = await prisma.lease.findMany({
        where: { organizationId: ctx.orgId, status: "ACTIVE", endDate: { gte: from, lte: to }, unit: { propertyId: ids === null ? undefined : { in: ids } } },
        include: { tenant: true, unit: { include: { property: true } }, renewalLease: { select: { number: true, status: true } } },
        orderBy: { endDate: "asc" },
      });
      return {
        columns: [C("number", "العقد", "Lease"), C("tenant", "المستأجر", "Tenant"), C("phone", "الهاتف", "Phone"), C("unit", "العقار/الوحدة", "Property/Unit"), C("end", "تاريخ الانتهاء", "End date", "date"), C("days", "الأيام المتبقية", "Days left", "number"), C("rent", "الإيجار الشهري", "Monthly rent", "money"), C("renewal", "التجديد", "Renewal")],
        rows: leases.map((l) => ({ number: l.number, tenant: l.tenant.name, phone: l.tenant.phone ?? "", unit: `${l.unit.property.code} / ${l.unit.unitNumber}`, end: formatDateOnly(l.endDate), days: Math.round((l.endDate.getTime() - today.getTime()) / 86400000), rent: toBaisa(l.monthlyRent), renewal: l.renewalLease ? `${l.renewalLease.number} (${l.renewalLease.status})` : "—" })),
      };
    },
  },
  {
    key: "warranty-insurance",
    titleAr: "تقرير الضمانات والتأمين",
    titleEn: "Warranties & insurance",
    group: "maintenance",
    params: ["to"],
    async run(ctx, p) {
      assertCan(ctx, "property.read");
      const today = todayInZone(ctx.timezone);
      const to = p.to ? parseDateOnly(p.to) : addDays(today, 180);
      const scope = ctx.propertyIds === null ? undefined : { in: ctx.propertyIds };
      const [props, assets, contracts] = await Promise.all([
        prisma.property.findMany({ where: { organizationId: ctx.orgId, archivedAt: null, id: scope, insuranceExpiry: { lte: to } } }),
        prisma.asset.findMany({ where: { organizationId: ctx.orgId, propertyId: scope, warrantyEnd: { lte: to } } }),
        prisma.vendorContract.findMany({ where: { vendor: { organizationId: ctx.orgId }, OR: [{ warrantyEnd: { lte: to } }, { endDate: { lte: to } }] }, include: { vendor: true } }),
      ]);
      const status = (d: Date) => (d < today ? "منتهٍ / Expired" : "قريب / Upcoming");
      return {
        columns: [C("kind", "النوع", "Kind"), C("item", "البند", "Item"), C("reference", "المرجع", "Reference"), C("date", "تاريخ الانتهاء", "Expiry", "date"), C("status", "الحالة", "Status")],
        rows: [
          ...props.map((x) => ({ kind: "تأمين عقار / Insurance", item: `${x.code} ${x.name}`, reference: `${x.insuranceProvider ?? ""} ${x.insurancePolicyNo ?? ""}`.trim(), date: formatDateOnly(x.insuranceExpiry!), status: status(x.insuranceExpiry!) })),
          ...assets.map((x) => ({ kind: "ضمان أصل / Asset warranty", item: `${x.tag} ${x.name}`, reference: `${x.brand ?? ""} ${x.serialNumber ?? ""}`.trim(), date: formatDateOnly(x.warrantyEnd!), status: status(x.warrantyEnd!) })),
          ...contracts.map((x) => {
            const d = x.warrantyEnd && x.warrantyEnd <= to ? x.warrantyEnd : x.endDate;
            return { kind: "عقد مورد / Vendor contract", item: x.title, reference: x.vendor.name, date: formatDateOnly(d), status: status(d) };
          }),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    },
  },
];

export function listReportDefs(ctx: Ctx) {
  return REPORTS.filter((r) => {
    if (ctx.roleKey === "TENANT") return false;
    if (!ctx.permissions.has("report.read")) return false;
    if (r.group === "accounting") return ctx.permissions.has("journal.read") || r.key === "profit-loss" || r.key === "cash-flow";
    if (r.group === "finance") return ctx.permissions.has("finance.read");
    if (r.group === "maintenance") return ctx.permissions.has("maintenance.read") || r.key === "warranty-insurance";
    return true;
  });
}

export function getReportDef(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}

export async function runReport(ctx: Ctx, key: string, params: ReportParams): Promise<ReportResult> {
  assertCan(ctx, "report.read");
  const def = getReportDef(key);
  if (!def) throw notFound("التقرير غير موجود / Report not found");
  if (!listReportDefs(ctx).some((d) => d.key === key)) throw forbidden();
  const clean: ReportParams = {};
  for (const k of def.params) {
    const v = params[k];
    if (v && /^[\w-]{1,40}$/.test(v)) clean[k] = v;
  }
  // إظهار الفترة الفعلية المستخدمة عند عدم تحديدها (لتوثيق التقرير)
  if (!["lease-expiry", "warranty-insurance", "tenant-statement"].includes(key)) {
    const today = todayInZone(ctx.timezone);
    if (def.params.includes("from") && !clean.from) clean.from = formatDateOnly(startOfYear(today));
    if (def.params.includes("to") && !clean.to) clean.to = formatDateOnly(today);
    if (def.params.includes("asOf") && !clean.asOf) clean.asOf = formatDateOnly(today);
  }
  const r = await def.run(ctx, clean);
  return { ...r, key, titleAr: def.titleAr, titleEn: def.titleEn, filters: clean as Record<string, string>, generatedAt: new Date() };
}
