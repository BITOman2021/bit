import { addDays, formatDateOnly } from "@/lib/dates";
import { formatOMR, toBaisa } from "@/lib/money";
import type { Ctx } from "../context";
import { prisma } from "../db";
import { getSettings } from "./settings";

// ------------------------------------------------------------
// قنوات الإرسال: داخل التطبيق فقط مفعلة.
// البريد وواتساب والرسائل النصية: بنية جاهزة لكنها غير مفعلة حتى ربط مزود حقيقي واختباره.
// ------------------------------------------------------------

export interface OutboundMessage {
  to: string;
  subject?: string;
  body: string;
}

export interface NotificationChannel {
  name: "email" | "whatsapp" | "sms";
  isConfigured(): boolean;
  send(msg: OutboundMessage): Promise<void>;
}

class NotConfiguredChannel implements NotificationChannel {
  constructor(public name: "email" | "whatsapp" | "sms") {}
  isConfigured() {
    return false;
  }
  async send(): Promise<void> {
    throw new Error(`Channel ${this.name} is not configured. Connect a real provider and test it before enabling.`);
  }
}

export const channels: Record<string, NotificationChannel> = {
  email: new NotConfiguredChannel("email"),
  whatsapp: new NotConfiguredChannel("whatsapp"),
  sms: new NotConfiguredChannel("sms"),
};

// ------------------------------------------------------------

async function usersWith(orgId: string, permission: string, propertyId?: string | null) {
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, isActive: true, role: { permissions: { some: { permissionKey: permission } } } },
    include: { role: true, propertyAccess: true, owner: { include: { shares: { where: { effectiveTo: null } } } } },
  });
  return users.filter((u) => {
    if (u.role.key === "TENANT") return false;
    if (!propertyId) return u.propertyScope === "ALL";
    if (u.role.key === "OWNER") return u.owner?.shares.some((s) => s.propertyId === propertyId) ?? false;
    return u.propertyScope === "ALL" || u.propertyAccess.some((a) => a.propertyId === propertyId);
  });
}

interface Alert {
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  link?: string;
  severity?: string;
  dedupeKey: string;
}

async function push(orgId: string, a: Alert) {
  if (!a.userIds.length) return 0;
  const r = await prisma.notification.createMany({
    data: a.userIds.map((userId) => ({ organizationId: orgId, userId, type: a.type, title: a.title, body: a.body, link: a.link, severity: a.severity ?? "info", dedupeKey: a.dedupeKey })),
    skipDuplicates: true,
  });
  return r.count;
}

/**
 * مهمة دورية لتوليد التنبيهات. آمنة للتشغيل المتكرر: مفتاح dedupeKey يمنع تكرار نفس التنبيه.
 */
export async function generateAlerts(orgId: string, today: Date) {
  const s = await getSettings(orgId);
  let created = 0;

  // 1) عقود قاربت على الانتهاء
  const expiring = await prisma.lease.findMany({
    where: { organizationId: orgId, status: "ACTIVE", endDate: { gte: today, lte: addDays(today, s["alerts.leaseExpiryDays"]) }, renewalLease: null },
    include: { tenant: true, unit: { include: { property: true } } },
  });
  for (const l of expiring) {
    created += await push(orgId, {
      userIds: (await usersWith(orgId, "lease.read", l.unit.propertyId)).map((u) => u.id),
      type: "LEASE_EXPIRING",
      title: `عقد ${l.number} ينتهي في ${formatDateOnly(l.endDate)}`,
      body: `${l.tenant.name} — ${l.unit.property.name} / ${l.unit.unitNumber}`,
      link: `/leases/${l.id}`,
      severity: "warning",
      dedupeKey: `lease-expiring:${l.id}`,
    });
  }

  // 2) إيجارات مستحقة قريبًا ومتأخرة
  const dueSoon = await prisma.leaseCharge.findMany({
    where: { organizationId: orgId, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: addDays(today, s["alerts.rentDueDays"]) }, lease: { status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] } } },
    include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
  });
  for (const c of dueSoon) {
    const overdue = c.dueDate < today;
    const balance = toBaisa(c.amount) - toBaisa(c.paidAmount);
    const staff = (await usersWith(orgId, "finance.read", c.lease.unit.propertyId)).map((u) => u.id);
    created += await push(orgId, {
      userIds: staff,
      type: overdue ? "RENT_OVERDUE" : "RENT_DUE",
      title: `${overdue ? "استحقاق متأخر" : "استحقاق قريب"} ${c.number}: ${formatOMR(balance)} ر.ع.`,
      body: `${c.lease.tenant.name} — ${c.lease.unit.property.name} / ${c.lease.unit.unitNumber} — ${formatDateOnly(c.dueDate)}`,
      link: `/leases/${c.leaseId}`,
      severity: overdue ? "danger" : "info",
      dedupeKey: `${overdue ? "overdue" : "due"}:${c.id}`,
    });
    if (c.lease.tenant.userId) {
      created += await push(orgId, {
        userIds: [c.lease.tenant.userId],
        type: overdue ? "RENT_OVERDUE" : "RENT_DUE",
        title: overdue ? `لديك مبلغ متأخر: ${formatOMR(balance)} ر.ع.` : `إيجار مستحق في ${formatDateOnly(c.dueDate)}: ${formatOMR(balance)} ر.ع.`,
        link: "/portal",
        severity: overdue ? "danger" : "info",
        dedupeKey: `tenant-${overdue ? "overdue" : "due"}:${c.id}`,
      });
    }
  }

  // 3) انتهاء الضمانات (الأصول وعقود الموردين وأوامر العمل)
  const warrantyLimit = addDays(today, s["alerts.warrantyDays"]);
  const assets = await prisma.asset.findMany({ where: { organizationId: orgId, warrantyEnd: { gte: today, lte: warrantyLimit } } });
  for (const a of assets) {
    created += await push(orgId, {
      userIds: (await usersWith(orgId, "maintenance.read", a.propertyId)).map((u) => u.id),
      type: "WARRANTY_EXPIRING",
      title: `ضمان الأصل ${a.tag} ينتهي ${formatDateOnly(a.warrantyEnd!)}`,
      body: a.name,
      link: `/maintenance/assets/${a.id}`,
      severity: "warning",
      dedupeKey: `warranty-asset:${a.id}:${formatDateOnly(a.warrantyEnd!)}`,
    });
  }
  const contracts = await prisma.vendorContract.findMany({ where: { vendor: { organizationId: orgId }, OR: [{ warrantyEnd: { gte: today, lte: warrantyLimit } }, { endDate: { gte: today, lte: warrantyLimit } }] }, include: { vendor: true } });
  for (const c of contracts) {
    created += await push(orgId, {
      userIds: (await usersWith(orgId, "vendor.read", c.propertyId)).map((u) => u.id),
      type: "CONTRACT_EXPIRING",
      title: `عقد المورد "${c.title}" / الضمان ينتهي قريبًا`,
      body: c.vendor.name,
      link: `/vendors/${c.vendorId}`,
      severity: "warning",
      dedupeKey: `vendor-contract:${c.id}:${formatDateOnly(c.endDate)}`,
    });
  }

  // 4) انتهاء وثائق التأمين
  const insured = await prisma.property.findMany({ where: { organizationId: orgId, archivedAt: null, insuranceExpiry: { lte: addDays(today, s["alerts.insuranceDays"]) } } });
  for (const p of insured) {
    created += await push(orgId, {
      userIds: (await usersWith(orgId, "property.write", p.id)).map((u) => u.id),
      type: "INSURANCE_EXPIRING",
      title: `تأمين العقار ${p.code} ${p.insuranceExpiry! < today ? "منتهٍ" : "ينتهي"} ${formatDateOnly(p.insuranceExpiry!)}`,
      body: p.name,
      link: `/properties/${p.id}`,
      severity: p.insuranceExpiry! < today ? "danger" : "warning",
      dedupeKey: `insurance:${p.id}:${formatDateOnly(p.insuranceExpiry!)}`,
    });
  }

  // 5) فواتير موردين مستحقة
  const bills = await prisma.invoice.findMany({ where: { organizationId: orgId, status: { in: ["POSTED", "PARTIALLY_PAID"] }, dueDate: { lte: addDays(today, s["alerts.invoiceDueDays"]) } }, include: { vendor: true } });
  for (const b of bills) {
    created += await push(orgId, {
      userIds: (await usersWith(orgId, "invoice.write", b.propertyId)).map((u) => u.id),
      type: "INVOICE_DUE",
      title: `فاتورة ${b.number} مستحقة ${formatDateOnly(b.dueDate)}`,
      body: `${b.vendor.name} — ${formatOMR(toBaisa(b.total) - toBaisa(b.paidAmount))} ر.ع.`,
      link: `/finance/invoices/${b.id}`,
      severity: b.dueDate < today ? "danger" : "warning",
      dedupeKey: `invoice-due:${b.id}`,
    });
  }

  // 6) مهام الموظفين وأوامر العمل المستحقة
  const tasks = await prisma.task.findMany({ where: { organizationId: orgId, status: { in: ["OPEN", "IN_PROGRESS"] }, assignedToId: { not: null }, dueDate: { lte: addDays(today, 1) } } });
  for (const t of tasks) {
    created += await push(orgId, { userIds: [t.assignedToId!], type: "TASK_DUE", title: `مهمة مستحقة: ${t.title}`, link: "/tasks", severity: "warning", dedupeKey: `task-due:${t.id}` });
  }
  const wos = await prisma.workOrder.findMany({ where: { organizationId: orgId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] }, dueDate: { lte: addDays(today, 2) } } });
  for (const w of wos) {
    const ids = new Set((await usersWith(orgId, "maintenance.write", w.propertyId)).map((u) => u.id));
    if (w.assignedToId) ids.add(w.assignedToId);
    created += await push(orgId, {
      userIds: [...ids],
      type: "WORK_ORDER_DUE",
      title: `أمر عمل ${w.number} ${w.dueDate! < today ? "متأخر" : "مستحق قريبًا"}`,
      body: w.title,
      link: `/maintenance/work-orders/${w.id}`,
      severity: w.dueDate! < today ? "danger" : "warning",
      dedupeKey: `wo-due:${w.id}`,
    });
  }
  return created;
}

export async function listNotifications(ctx: Ctx, onlyUnread = false) {
  return prisma.notification.findMany({ where: { userId: ctx.userId, readAt: onlyUnread ? null : undefined }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function unreadCount(ctx: Ctx) {
  return prisma.notification.count({ where: { userId: ctx.userId, readAt: null } });
}

export async function markRead(ctx: Ctx, id?: string) {
  await prisma.notification.updateMany({ where: { userId: ctx.userId, id, readAt: null }, data: { readAt: new Date() } });
}
