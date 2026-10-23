import { Prisma } from "@/generated/prisma/client";
import { addDays, formatDateOnly, startOfMonth, startOfYear, endOfMonth, todayInZone } from "@/lib/dates";
import { type Baisa, sum, toBaisa } from "@/lib/money";
import { assertCan, type Ctx } from "../context";
import { prisma } from "../db";

export interface DashboardFilter {
  from?: Date;
  to?: Date;
  propertyId?: string;
  ownerId?: string;
}

/** يحدد العقارات المشمولة: نطاق المستخدم ∩ العقار المختار ∩ عقارات المالك المختار */
export async function resolvePropertyIds(ctx: Ctx, f: { propertyId?: string; ownerId?: string }): Promise<string[] | null> {
  let ids: string[] | null = ctx.propertyIds;
  if (f.ownerId) {
    const shares = await prisma.ownershipShare.findMany({ where: { ownerId: f.ownerId, effectiveTo: null, property: { organizationId: ctx.orgId } }, select: { propertyId: true } });
    const own = shares.map((s) => s.propertyId);
    ids = ids === null ? own : ids.filter((i) => own.includes(i));
  }
  if (f.propertyId) ids = ids === null ? [f.propertyId] : ids.filter((i) => i === f.propertyId);
  return ids;
}

const inProps = (col: Prisma.Sql, ids: string[] | null) => (ids === null ? Prisma.sql`TRUE` : Prisma.sql`${col} = ANY(${ids})`);

async function sumByPropertyAndType(orgId: string, ids: string[] | null, from: Date, to: Date) {
  return prisma.$queryRaw<{ propertyId: string | null; type: string; debit: string; credit: string }[]>`
    SELECT l."propertyId" AS "propertyId", a."type"::text AS type, COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
    FROM "journal_lines" l
    JOIN "journal_entries" e ON e."id" = l."entryId"
    JOIN "chart_of_accounts" a ON a."id" = l."accountId"
    WHERE e."organizationId" = ${orgId} AND e."status" = 'POSTED'
      AND e."date" >= ${formatDateOnly(from)}::date AND e."date" <= ${formatDateOnly(to)}::date
      AND a."type" IN ('INCOME','EXPENSE')
      AND ${inProps(Prisma.sql`l."propertyId"`, ids)}
    GROUP BY l."propertyId", a."type"`;
}

export async function getDashboard(ctx: Ctx, f: DashboardFilter = {}) {
  assertCan(ctx, "dashboard.view");
  const today = todayInZone(ctx.timezone);
  const from = f.from ?? startOfMonth(today);
  const to = f.to ?? endOfMonth(today);
  const ids = await resolvePropertyIds(ctx, f);
  const propWhere: Prisma.PropertyWhereInput = { organizationId: ctx.orgId, archivedAt: null, id: ids === null ? undefined : { in: ids } };
  const canFinance = ctx.permissions.has("finance.read");

  const [properties, buildings, units] = await Promise.all([
    prisma.property.findMany({ where: propWhere, select: { id: true, name: true, code: true } }),
    prisma.building.count({ where: { archivedAt: null, property: propWhere } }),
    prisma.unit.groupBy({ by: ["status"], where: { archivedAt: null, property: propWhere }, _count: true }),
  ]);
  const unitCount = (s: string) => units.find((u) => u.status === s)?._count ?? 0;
  const totalUnits = units.reduce((a, u) => a + u._count, 0);
  const leasable = totalUnits - unitCount("INACTIVE");
  const occupancyRate = leasable > 0 ? (unitCount("OCCUPIED") / leasable) * 100 : 0;

  const leaseWhere = { organizationId: ctx.orgId, unit: { propertyId: ids === null ? undefined : { in: ids } } };
  const expiringLeases = await prisma.lease.findMany({
    where: { ...leaseWhere, status: "ACTIVE", endDate: { gte: today, lte: addDays(today, 60) } },
    include: { tenant: { select: { name: true } }, unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
    orderBy: { endDate: "asc" },
    take: 10,
  });

  const woWhere: Prisma.WorkOrderWhereInput = { organizationId: ctx.orgId, propertyId: ids === null ? undefined : { in: ids } };
  const [openRequests, openWorkOrders, overdueWorkOrders] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { organizationId: ctx.orgId, propertyId: ids === null ? undefined : { in: ids }, status: { in: ["NEW", "IN_PROGRESS"] } } }),
    prisma.workOrder.count({ where: { ...woWhere, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.workOrder.count({ where: { ...woWhere, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] }, dueDate: { lt: today } } }),
  ]);

  let finance = null;
  if (canFinance) {
    const chargeWhere: Prisma.LeaseChargeWhereInput = { organizationId: ctx.orgId, status: { not: "VOID" }, type: { not: "DEPOSIT" }, lease: leaseWhere };
    const [dueCharges, arrearsCharges, payments] = await Promise.all([
      prisma.leaseCharge.findMany({ where: { ...chargeWhere, dueDate: { gte: from, lte: to } }, select: { amount: true, paidAmount: true } }),
      prisma.leaseCharge.findMany({ where: { ...chargeWhere, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: today } }, select: { amount: true, paidAmount: true } }),
      prisma.paymentAllocation.findMany({
        where: { reversedAt: null, payment: { organizationId: ctx.orgId, status: "POSTED", receivedDate: { gte: from, lte: to } }, charge: { type: { not: "DEPOSIT" }, lease: leaseWhere } },
        select: { amount: true },
      }),
    ]);
    const unallocated = await prisma.payment.findMany({
      where: { organizationId: ctx.orgId, status: "POSTED", receivedDate: { gte: from, lte: to }, ...(ids === null ? {} : { lease: { unit: { propertyId: { in: ids } } } }) },
      select: { unallocated: true },
    });

    const period = await sumByPropertyAndType(ctx.orgId, ids, from, to);
    const monthRows = await sumByPropertyAndType(ctx.orgId, ids, startOfMonth(today), endOfMonth(today));
    const yearRows = await sumByPropertyAndType(ctx.orgId, ids, startOfYear(today), today);
    const expensesOf = (rows: typeof period) => sum(rows.filter((r) => r.type === "EXPENSE").map((r) => toBaisa(r.debit) - toBaisa(r.credit)));

    const byProperty = new Map<string, { income: Baisa; expense: Baisa }>();
    for (const r of period) {
      const key = r.propertyId ?? "__none__";
      const cur = byProperty.get(key) ?? { income: 0n, expense: 0n };
      if (r.type === "INCOME") cur.income += toBaisa(r.credit) - toBaisa(r.debit);
      else cur.expense += toBaisa(r.debit) - toBaisa(r.credit);
      byProperty.set(key, cur);
    }
    const names = new Map(properties.map((p) => [p.id, `${p.code} — ${p.name}`]));
    const propertyRows = [...byProperty.entries()].map(([id, v]) => ({ propertyId: id, name: names.get(id) ?? (id === "__none__" ? "—" : id), ...v, net: v.income - v.expense }));

    // صافي التدفق النقدي من حسابات النقدية والبنوك
    const cash = await prisma.$queryRaw<{ debit: string; credit: string }[]>`
      SELECT COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
      FROM "journal_lines" l
      JOIN "journal_entries" e ON e."id" = l."entryId"
      JOIN "chart_of_accounts" a ON a."id" = l."accountId"
      WHERE e."organizationId" = ${ctx.orgId} AND e."status" = 'POSTED'
        AND e."date" >= ${formatDateOnly(from)}::date AND e."date" <= ${formatDateOnly(to)}::date
        AND (a."systemKey" = 'CASH' OR EXISTS (SELECT 1 FROM "bank_accounts" b WHERE b."glAccountId" = a."id"))
        AND ${inProps(Prisma.sql`l."propertyId"`, ids)}`;

    finance = {
      rentDue: sum(dueCharges.map((c) => toBaisa(c.amount))),
      collected: sum(payments.map((p) => toBaisa(p.amount))) + sum(unallocated.map((p) => toBaisa(p.unallocated))),
      arrears: sum(arrearsCharges.map((c) => toBaisa(c.amount) - toBaisa(c.paidAmount))),
      monthExpenses: expensesOf(monthRows),
      yearExpenses: expensesOf(yearRows),
      netCashFlow: toBaisa(cash[0].debit) - toBaisa(cash[0].credit),
      byProperty: propertyRows.sort((a, b) => (b.income > a.income ? 1 : b.income < a.income ? -1 : 0)),
    };
  }

  const tasks = await prisma.task.findMany({
    where: { organizationId: ctx.orgId, status: { in: ["OPEN", "IN_PROGRESS"] }, OR: [{ assignedToId: ctx.userId }, { createdById: ctx.userId }] },
    orderBy: { dueDate: "asc" },
    take: 8,
  });
  const notifications = await prisma.notification.findMany({ where: { userId: ctx.userId, readAt: null }, orderBy: { createdAt: "desc" }, take: 8 });

  return {
    generatedAt: new Date(),
    period: { from, to },
    properties: properties.length,
    buildings,
    units: { total: totalUnits, occupied: unitCount("OCCUPIED"), vacant: unitCount("VACANT"), reserved: unitCount("RESERVED"), maintenance: unitCount("UNDER_MAINTENANCE"), inactive: unitCount("INACTIVE") },
    occupancyRate,
    expiringLeases,
    maintenance: { openRequests, openWorkOrders, overdueWorkOrders },
    finance,
    tasks,
    notifications,
  };
}
