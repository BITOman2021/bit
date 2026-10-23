import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/dates";
import { type Baisa, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, can, type Ctx } from "../context";
import { prisma } from "../db";
import { forbidden, notFound } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zEmail, zOptDate, zOptStr, zPhone, zStr, zText } from "../validation";

export const tenantSchema = z.object({
  code: zOptStr(30),
  type: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
  name: zStr(200),
  nationality: zOptStr(100),
  idType: zOptStr(50),
  idNumber: zOptStr(50),
  idExpiry: zOptDate,
  crNumber: zOptStr(50),
  phone: zPhone,
  email: zEmail,
  address: zOptStr(500),
  employer: zOptStr(200),
  emergencyContact: zOptStr(300),
  notes: zText(3000),
});

/** نطاق المستأجرين: المستخدم المحدود يرى مستأجري عقاراته فقط (ومن ليس لهم عقود بعد) */
export function tenantScope(ctx: Ctx): Prisma.TenantWhereInput {
  if (ctx.propertyIds === null) return { organizationId: ctx.orgId };
  return {
    organizationId: ctx.orgId,
    OR: [{ leases: { some: { unit: { propertyId: { in: ctx.propertyIds } } } } }, { leases: { none: {} } }],
  };
}

function mask<T extends { idNumber: string | null; idType?: string | null }>(ctx: Ctx, t: T): T {
  if (can(ctx, "tenant.sensitive")) return t;
  return { ...t, idNumber: t.idNumber ? `•••• ${t.idNumber.slice(-3)}` : null };
}

export async function listTenants(ctx: Ctx, f: { q?: string; status?: "active" | "former" | "all" } = {}) {
  assertCan(ctx, "tenant.read");
  const rows = await prisma.tenant.findMany({
    where: {
      AND: [
        tenantScope(ctx),
        { archivedAt: null },
        f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q } }, { email: { contains: f.q, mode: "insensitive" } }] } : {},
        f.status === "active" ? { leases: { some: { status: "ACTIVE" } } } : f.status === "former" ? { leases: { none: { status: "ACTIVE" } } } : {},
      ],
    },
    include: { leases: { where: { status: "ACTIVE" }, include: { unit: { include: { property: { select: { name: true, code: true } } } } } } },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return rows.map((t) => mask(ctx, t));
}

export async function getTenant(ctx: Ctx, id: string) {
  assertCan(ctx, "tenant.read");
  const t = await prisma.tenant.findFirst({
    where: { AND: [{ id }, tenantScope(ctx)] },
    include: {
      leases: { orderBy: { startDate: "desc" }, include: { unit: { include: { property: { select: { id: true, name: true, code: true } } } } } },
      payments: { orderBy: { receivedDate: "desc" }, include: { receipt: true }, take: 100 },
      documents: { include: { document: true } },
      inquiries: { orderBy: { createdAt: "desc" }, take: 50 },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  if (!t) throw notFound();
  const docs = can(ctx, "tenant.sensitive") ? t.documents : t.documents.filter((d) => !d.document.isSensitive);
  return { ...mask(ctx, t), documents: docs };
}

export async function createTenant(ctx: Ctx, input: unknown) {
  assertCan(ctx, "tenant.write");
  const v = parse(tenantSchema, input);
  return prisma.$transaction(async (tx) => {
    const code = v.code ?? (await nextNumber(tx, ctx.orgId, SEQ.TENANT)).replace(/-\d{4}-/, "-");
    const t = await tx.tenant.create({ data: { ...v, code, idExpiry: v.idExpiry ? parseDateOnly(v.idExpiry) : null, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: "tenant.create", entityType: "Tenant", entityId: t.id, summary: t.name, after: t });
    return t;
  });
}

export async function updateTenant(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "tenant.write");
  const v = parse(tenantSchema, input);
  const before = await prisma.tenant.findFirst({ where: { AND: [{ id }, tenantScope(ctx)] } });
  if (!before) throw notFound();
  // من لا يملك صلاحية البيانات الحساسة لا يستطيع تعديل رقم الهوية (يُرسل مقنّعًا)
  const idNumber = can(ctx, "tenant.sensitive") ? v.idNumber : before.idNumber;
  const t = await prisma.tenant.update({
    where: { id },
    data: { ...v, idNumber, code: v.code ?? before.code, idExpiry: v.idExpiry ? parseDateOnly(v.idExpiry) : null },
  });
  await audit(prisma, ctx, { action: "tenant.update", entityType: "Tenant", entityId: id, summary: t.name, before, after: t });
  return t;
}

export interface StatementLine {
  date: string;
  kind: "CHARGE" | "PAYMENT" | "REFUND" | "VOID";
  reference: string;
  description: string;
  debit: Baisa;
  credit: Baisa;
  balance: Baisa;
}

/** كشف حساب المستأجر: الاستحقاقات (مدين) والتحصيلات (دائن) والرصيد المتراكم */
export async function tenantStatement(ctx: Ctx, tenantId: string, f: { from?: string; to?: string } = {}) {
  if (ctx.roleKey === "TENANT") {
    if (ctx.tenantId !== tenantId) throw forbidden();
  } else {
    assertCan(ctx, "tenant.read");
    assertCan(ctx, "finance.read");
    const t = await prisma.tenant.findFirst({ where: { AND: [{ id: tenantId }, tenantScope(ctx)] } });
    if (!t) throw notFound();
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const from = f.from ? parseDateOnly(f.from) : undefined;
  const to = f.to ? parseDateOnly(f.to) : undefined;
  const charges = await prisma.leaseCharge.findMany({
    where: { lease: { tenantId }, status: { not: "VOID" }, dueDate: { lte: to } },
    include: { lease: { select: { number: true } } },
  });
  const payments = await prisma.payment.findMany({ where: { tenantId, status: "POSTED", receivedDate: { lte: to } }, include: { receipt: true } });
  const refunds = await prisma.refund.findMany({ where: { tenantId, status: "POSTED", kind: "OVERPAYMENT_REFUND", date: { lte: to } } });

  type Ev = Omit<StatementLine, "balance"> & { sortDate: Date };
  const events: Ev[] = [
    ...charges.map((c) => ({
      sortDate: c.dueDate,
      date: formatDateOnly(c.dueDate),
      kind: "CHARGE" as const,
      reference: c.number,
      description: `${c.type} — ${c.lease.number}${c.description ? ` — ${c.description}` : ""}`,
      debit: toBaisa(c.amount),
      credit: 0n,
    })),
    ...payments.map((p) => ({
      sortDate: p.receivedDate,
      date: formatDateOnly(p.receivedDate),
      kind: "PAYMENT" as const,
      reference: p.receipt?.number ?? p.number,
      description: `${p.method}${p.reference ? ` — ${p.reference}` : ""}`,
      debit: 0n,
      credit: toBaisa(p.amount),
    })),
    ...refunds.map((r) => ({ sortDate: r.date, date: formatDateOnly(r.date), kind: "REFUND" as const, reference: r.number, description: r.reason, debit: toBaisa(r.amount), credit: 0n })),
  ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime() || (a.kind === "CHARGE" ? -1 : 1));

  let balance = 0n;
  let opening = 0n;
  const lines: StatementLine[] = [];
  for (const e of events) {
    balance += e.debit - e.credit;
    if (from && e.sortDate < from) {
      opening = balance;
      continue;
    }
    lines.push({ date: e.date, kind: e.kind, reference: e.reference, description: e.description, debit: e.debit, credit: e.credit, balance });
  }
  return { tenant: mask(ctx, tenant), opening, lines, closing: balance };
}
