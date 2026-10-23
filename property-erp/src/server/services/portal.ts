import { z } from "zod";
import { todayInZone } from "@/lib/dates";
import { toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, type Ctx } from "../context";
import { prisma } from "../db";
import { forbidden, notFound } from "../errors";
import { parse, zEmail, zId, zOptStr, zPhone, zStr, zText } from "../validation";
import { requestApproval } from "./approval-core";

function tenantId(ctx: Ctx) {
  assertCan(ctx, "portal.tenant");
  if (!ctx.tenantId) throw forbidden();
  return ctx.tenantId;
}

/** بيانات بوابة المستأجر: وحدته وعقوده ومدفوعاته وطلباته فقط */
export async function portalOverview(ctx: Ctx) {
  const id = tenantId(ctx);
  const today = todayInZone(ctx.timezone);
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, phone: true, email: true, address: true, emergencyContact: true, code: true },
  });
  const leases = await prisma.lease.findMany({
    where: { tenantId: id, status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] } },
    include: { unit: { include: { property: { select: { name: true, address: true } } } }, charges: { where: { status: { not: "VOID" } }, orderBy: { dueDate: "asc" } }, deposits: true },
    orderBy: { startDate: "desc" },
  });
  const payments = await prisma.payment.findMany({ where: { tenantId: id, status: "POSTED" }, include: { receipt: true }, orderBy: { receivedDate: "desc" } });
  const requests = await prisma.maintenanceRequest.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" } });
  const inquiries = await prisma.inquiry.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" } });
  const documents = await prisma.document.findMany({
    where: { organizationId: ctx.orgId, deletedAt: null, OR: [{ tenantId: id }, { leaseId: { in: leases.map((l) => l.id) } }] },
    orderBy: { createdAt: "desc" },
  });
  let due = 0n;
  let overdue = 0n;
  for (const l of leases)
    for (const c of l.charges) {
      const bal = toBaisa(c.amount) - toBaisa(c.paidAmount);
      if (bal <= 0n) continue;
      if (c.dueDate <= today) due += bal;
      if (c.dueDate < today) overdue += bal;
    }
  return { tenant, leases, payments, requests, inquiries, documents, due, overdue, today };
}

export async function createInquiry(ctx: Ctx, input: unknown) {
  const id = tenantId(ctx);
  const v = parse(z.object({ subject: zStr(200), body: zStr(5000) }), input);
  const q = await prisma.inquiry.create({ data: { organizationId: ctx.orgId, tenantId: id, subject: v.subject, body: v.body } });
  const staff = await prisma.user.findMany({ where: { organizationId: ctx.orgId, isActive: true, role: { permissions: { some: { permissionKey: "tenant.write" } } } }, select: { id: true } });
  await prisma.notification.createMany({
    data: staff.map((s) => ({ organizationId: ctx.orgId, userId: s.id, type: "INQUIRY", title: `استفسار من مستأجر: ${v.subject}`, link: `/tenants/${id}`, dedupeKey: `inquiry:${q.id}` })),
    skipDuplicates: true,
  });
  await audit(prisma, ctx, { action: "inquiry.create", entityType: "Inquiry", entityId: q.id, summary: v.subject });
  return q;
}

export async function replyInquiry(ctx: Ctx, input: unknown) {
  assertCan(ctx, "tenant.write");
  const v = parse(z.object({ inquiryId: zId, reply: zStr(5000) }), input);
  const q = await prisma.inquiry.findFirst({ where: { id: v.inquiryId, organizationId: ctx.orgId }, include: { tenant: true } });
  if (!q) throw notFound();
  await prisma.inquiry.update({ where: { id: q.id }, data: { reply: v.reply, repliedAt: new Date(), repliedById: ctx.userId, status: "ANSWERED" } });
  if (q.tenant.userId) {
    await prisma.notification.create({ data: { organizationId: ctx.orgId, userId: q.tenant.userId, type: "INQUIRY_REPLY", title: `رد على استفسارك: ${q.subject}`, link: "/portal", dedupeKey: `inquiry-reply:${q.id}:${Date.now()}` } });
  }
  await audit(prisma, ctx, { action: "inquiry.reply", entityType: "Inquiry", entityId: q.id });
}

/** تحديث بيانات الاتصال يخضع لاعتماد الإدارة (سياسة الاعتماد) */
export async function requestContactUpdate(ctx: Ctx, input: unknown) {
  const id = tenantId(ctx);
  const v = parse(z.object({ phone: zPhone, email: zEmail, address: zOptStr(500), emergencyContact: zOptStr(300), note: zText(500) }), input);
  return prisma.$transaction(async (tx) => {
    const pending = await tx.approval.findFirst({ where: { type: "TENANT_CONTACT_UPDATE", entityId: id, status: "PENDING" } });
    if (pending) await tx.approval.update({ where: { id: pending.id }, data: { status: "REJECTED", decisionNote: "Superseded by new request", decidedAt: new Date() } });
    const lease = await tx.lease.findFirst({ where: { tenantId: id }, orderBy: { startDate: "desc" }, include: { unit: true } });
    const a = await requestApproval(tx, ctx, {
      type: "TENANT_CONTACT_UPDATE",
      entityId: id,
      summary: `تحديث بيانات اتصال المستأجر ${ctx.userName}${v.note ? `: ${v.note}` : ""}`,
      propertyId: lease?.unit.propertyId,
      payload: { phone: v.phone, email: v.email, address: v.address, emergencyContact: v.emergencyContact },
    });
    await audit(tx, ctx, { action: "tenant.contact_update_request", entityType: "Tenant", entityId: id });
    return a;
  });
}
