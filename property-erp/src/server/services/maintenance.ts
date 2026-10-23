import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, addPeriod, parseDateOnly, todayInZone } from "@/lib/dates";
import { fromBaisa, sum, toBaisa } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, assertCanAny, assertPropertyAccess, can, type Ctx, scopeIn } from "../context";
import { prisma, type Tx } from "../db";
import { forbidden, notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zBool, zDate, zId, zInt, zOptDate, zOptDecimal, zOptId, zOptMoney, zOptStr, zStr, zText } from "../validation";
import { requestApproval } from "./approval-core";
import { recomputeVendorRating } from "./purchasing";
import { getSettings } from "./settings";

export const CATEGORIES = [
  "ELECTRICAL", "PLUMBING", "HVAC", "ELEVATOR", "POOL", "PUMPS_TANKS", "WATERPROOFING", "PAINTING",
  "DOORS_WINDOWS", "GARDEN_IRRIGATION", "FIRE_SECURITY", "FURNITURE_APPLIANCES", "STRUCTURAL", "CLEANING", "OTHER",
] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const TYPES = ["CORRECTIVE", "EMERGENCY", "PREVENTIVE"] as const;

/** تصنيف أولي بالكلمات المفتاحية (عربي/إنجليزي) — اقتراح فقط، يمكن للمستخدم تغييره */
export function suggestCategory(text: string): (typeof CATEGORIES)[number] {
  const t = text.toLowerCase();
  const rules: [RegExp, (typeof CATEGORIES)[number]][] = [
    [/تكييف|مكيف|تبريد|a\/?c|hvac|cool|air ?con/, "HVAC"],
    [/كهرب|إنارة|انارة|مقبس|فيوز|breaker|electric|light|socket|power/, "ELECTRICAL"],
    [/تسرب|ماء|مياه|سباك|حنفية|مجاري|صرف|leak|plumb|pipe|drain|tap|toilet/, "PLUMBING"],
    [/مصعد|elevator|lift/, "ELEVATOR"],
    [/مسبح|pool/, "POOL"],
    [/مضخة|خزان|pump|tank/, "PUMPS_TANKS"],
    [/عزل|رطوبة|waterproof|damp/, "WATERPROOFING"],
    [/دهان|طلاء|paint/, "PAINTING"],
    [/باب|نافذة|شباك|قفل|door|window|lock/, "DOORS_WINDOWS"],
    [/حديقة|ري|زرع|garden|irrigation/, "GARDEN_IRRIGATION"],
    [/حريق|إنذار|كاميرا|fire|alarm|cctv|security/, "FIRE_SECURITY"],
    [/أثاث|ثلاجة|غسالة|فرن|furniture|fridge|washer|oven|appliance/, "FURNITURE_APPLIANCES"],
    [/تشقق|شرخ|سقف|crack|structur|ceiling/, "STRUCTURAL"],
    [/نظافة|تنظيف|clean/, "CLEANING"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "OTHER";
}

export function suggestPriority(text: string): (typeof PRIORITIES)[number] {
  const t = text.toLowerCase();
  if (/حريق|دخان|ماس كهربائي|غرق|فيضان|انقطاع كامل|fire|smoke|flood|sparks|no power/.test(t)) return "URGENT";
  if (/تسرب|لا يعمل|متوقف|leak|not working|broken/.test(t)) return "HIGH";
  return "MEDIUM";
}

// ------------------------- طلبات الصيانة -------------------------

const requestSchema = z.object({
  propertyId: zId,
  unitId: zOptId,
  assetId: zOptId,
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  type: z.enum(TYPES).default("CORRECTIVE"),
  title: zStr(200),
  description: zStr(5000),
});

export async function createRequest(ctx: Ctx, input: unknown) {
  assertCan(ctx, "maintenance.write");
  const v = parse(requestSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  return prisma.$transaction(async (tx) => {
    await checkLocation(tx, ctx, v.propertyId, v.unitId, v.assetId);
    const number = await nextNumber(tx, ctx.orgId, SEQ.REQUEST);
    const r = await tx.maintenanceRequest.create({ data: { ...v, unitId: v.unitId ?? null, assetId: v.assetId ?? null, organizationId: ctx.orgId, number, reportedById: ctx.userId } });
    await audit(tx, ctx, { action: "maintenance_request.create", entityType: "MaintenanceRequest", entityId: r.id, summary: `${number} ${v.title}` });
    return r;
  });
}

/** طلب صيانة من بوابة المستأجر: مقيد بوحدته فقط */
export async function createTenantRequest(ctx: Ctx, input: unknown) {
  assertCan(ctx, "portal.tenant");
  if (!ctx.tenantId) throw forbidden();
  const v = parse(z.object({ unitId: zId, title: zStr(200), description: zStr(5000), category: z.enum(CATEGORIES).optional() }), input);
  return prisma.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({ where: { tenantId: ctx.tenantId!, unitId: v.unitId, status: "ACTIVE" }, include: { unit: true } });
    if (!lease) throw forbidden("لا يوجد عقد ساري لهذه الوحدة / No active lease for this unit");
    const text = `${v.title} ${v.description}`;
    const number = await nextNumber(tx, ctx.orgId, SEQ.REQUEST);
    const r = await tx.maintenanceRequest.create({
      data: {
        organizationId: ctx.orgId,
        number,
        propertyId: lease.unit.propertyId,
        unitId: v.unitId,
        tenantId: ctx.tenantId,
        category: v.category ?? suggestCategory(text),
        priority: suggestPriority(text),
        title: v.title,
        description: v.description,
        source: "TENANT_PORTAL",
        reportedById: ctx.userId,
      },
    });
    const managers = await tx.user.findMany({
      where: { organizationId: ctx.orgId, isActive: true, role: { permissions: { some: { permissionKey: "maintenance.write" } } }, OR: [{ propertyScope: "ALL" }, { propertyAccess: { some: { propertyId: lease.unit.propertyId } } }] },
      select: { id: true },
    });
    await tx.notification.createMany({
      data: managers.map((m) => ({ organizationId: ctx.orgId, userId: m.id, type: "MAINTENANCE_NEW", title: `طلب صيانة جديد ${number}`, body: v.title, link: `/maintenance/requests/${r.id}`, severity: r.priority === "URGENT" ? "danger" : "info", dedupeKey: `mr:${r.id}` })),
      skipDuplicates: true,
    });
    await audit(tx, ctx, { action: "maintenance_request.tenant_create", entityType: "MaintenanceRequest", entityId: r.id, summary: `${number} ${v.title}` });
    return r;
  });
}

async function checkLocation(tx: Tx, ctx: Ctx, propertyId: string, unitId?: string | null, assetId?: string | null) {
  const p = await tx.property.findFirst({ where: { id: propertyId, organizationId: ctx.orgId } });
  if (!p) throw notFound("العقار غير موجود / Property not found");
  if (unitId && !(await tx.unit.findFirst({ where: { id: unitId, propertyId } }))) throw rule("الوحدة لا تتبع العقار / Unit not in property");
  if (assetId && !(await tx.asset.findFirst({ where: { id: assetId, propertyId, organizationId: ctx.orgId } }))) throw rule("الأصل لا يتبع العقار / Asset not in property");
}

export async function listRequests(ctx: Ctx, f: { q?: string; status?: string; propertyId?: string; priority?: string } = {}) {
  assertCan(ctx, "maintenance.read");
  return prisma.maintenanceRequest.findMany({
    where: {
      organizationId: ctx.orgId,
      propertyId: f.propertyId ?? scopeIn(ctx),
      status: f.status ? (f.status as "NEW") : undefined,
      priority: f.priority ? (f.priority as "HIGH") : undefined,
      OR: f.q ? [{ number: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }] : undefined,
    },
    include: { workOrders: { select: { id: true, number: true, status: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
}

export async function getRequest(ctx: Ctx, id: string) {
  const r = await prisma.maintenanceRequest.findFirst({ where: { id, organizationId: ctx.orgId }, include: { workOrders: true } });
  if (!r) throw notFound();
  if (ctx.roleKey === "TENANT") {
    if (r.tenantId !== ctx.tenantId) throw notFound();
  } else {
    assertCan(ctx, "maintenance.read");
    assertPropertyAccess(ctx, r.propertyId);
  }
  return r;
}

export async function setRequestStatus(ctx: Ctx, id: string, status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELLED") {
  assertCan(ctx, "maintenance.write");
  const r = await prisma.maintenanceRequest.findFirst({ where: { id, organizationId: ctx.orgId }, include: { workOrders: true } });
  if (!r) throw notFound();
  assertPropertyAccess(ctx, r.propertyId);
  if (status === "CLOSED" && r.workOrders.some((w) => !["CLOSED", "CANCELLED"].includes(w.status))) {
    throw rule("أغلق أوامر العمل المرتبطة أولًا / Close linked work orders first");
  }
  await prisma.maintenanceRequest.update({ where: { id }, data: { status } });
  await audit(prisma, ctx, { action: "maintenance_request.status", entityType: "MaintenanceRequest", entityId: id, summary: `${r.status} → ${status}` });
}

// ------------------------- أوامر العمل -------------------------

const workOrderSchema = z.object({
  requestId: zOptId,
  propertyId: zId,
  unitId: zOptId,
  assetId: zOptId,
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  type: z.enum(TYPES).default("CORRECTIVE"),
  title: zStr(200),
  description: zText(5000),
  assignedToId: zOptId,
  vendorId: zOptId,
  scheduledDate: zOptDate,
  dueDate: zOptDate,
  estimatedCost: zOptMoney,
});

/** نطاق أوامر العمل: الفني يرى المسند إليه فقط */
export function workOrderScope(ctx: Ctx): Prisma.WorkOrderWhereInput {
  if (!can(ctx, "maintenance.read") && can(ctx, "workorder.assigned")) return { organizationId: ctx.orgId, assignedToId: ctx.userId };
  return { organizationId: ctx.orgId, propertyId: scopeIn(ctx) };
}

export async function createWorkOrder(ctx: Ctx, input: unknown) {
  assertCan(ctx, "maintenance.write");
  const v = parse(workOrderSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  return prisma.$transaction(async (tx) => {
    await checkLocation(tx, ctx, v.propertyId, v.unitId, v.assetId);
    if (v.requestId) {
      const req = await tx.maintenanceRequest.findFirst({ where: { id: v.requestId, organizationId: ctx.orgId, propertyId: v.propertyId } });
      if (!req) throw rule("طلب الصيانة غير مطابق / Request mismatch");
      if (req.status === "NEW") await tx.maintenanceRequest.update({ where: { id: req.id }, data: { status: "IN_PROGRESS" } });
    }
    if (v.assignedToId) await checkTechnician(tx, ctx, v.assignedToId);
    const number = await nextNumber(tx, ctx.orgId, SEQ.WORK_ORDER);
    const wo = await tx.workOrder.create({
      data: {
        ...v,
        requestId: v.requestId ?? null,
        unitId: v.unitId ?? null,
        assetId: v.assetId ?? null,
        assignedToId: v.assignedToId ?? null,
        vendorId: v.vendorId ?? null,
        scheduledDate: v.scheduledDate ? parseDateOnly(v.scheduledDate) : null,
        dueDate: v.dueDate ? parseDateOnly(v.dueDate) : null,
        estimatedCost: v.estimatedCost ?? null,
        status: v.assignedToId || v.vendorId ? "ASSIGNED" : "OPEN",
        organizationId: ctx.orgId,
        number,
        createdById: ctx.userId,
      },
    });
    if (v.assignedToId) await notifyAssignee(tx, ctx, wo.id, number, v.title, v.assignedToId);
    await maybeRequestCostApproval(tx, ctx, wo.id);
    await audit(tx, ctx, { action: "work_order.create", entityType: "WorkOrder", entityId: wo.id, summary: `${number} ${v.title}` });
    return wo;
  });
}

async function checkTechnician(tx: Tx, ctx: Ctx, userId: string) {
  const u = await tx.user.findFirst({ where: { id: userId, organizationId: ctx.orgId, isActive: true, role: { permissions: { some: { permissionKey: "workorder.assigned" } } } } });
  if (!u) throw rule("المستخدم المعين ليس فنيًا نشطًا / Assignee is not an active technician");
}

async function notifyAssignee(tx: Tx, ctx: Ctx, woId: string, number: string, title: string, userId: string) {
  await tx.notification.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey: `wo-assign:${woId}` } },
    update: {},
    create: { organizationId: ctx.orgId, userId, type: "WORK_ORDER_ASSIGNED", title: `أمر عمل مسند إليك ${number}`, body: title, link: `/maintenance/work-orders/${woId}`, dedupeKey: `wo-assign:${woId}` },
  });
}

/** اعتماد تقدير التكلفة إذا تجاوز الحد */
async function maybeRequestCostApproval(tx: Tx, ctx: Ctx, woId: string) {
  const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: woId } });
  if (!wo.estimatedCost || wo.costApprovedAt) return;
  const s = await getSettings(ctx.orgId, tx);
  const est = toBaisa(wo.estimatedCost);
  if (est < toBaisa(String(s["approval.workOrderThreshold"]))) {
    await tx.workOrder.update({ where: { id: woId }, data: { costApprovedAt: new Date(), costApprovedById: ctx.userId } });
    return;
  }
  const pending = await tx.approval.findFirst({ where: { type: "WORK_ORDER_COST", entityId: woId, status: "PENDING" } });
  if (pending) return;
  const ap = await requestApproval(tx, ctx, { type: "WORK_ORDER_COST", entityId: woId, amount: est, summary: `${wo.number}: ${wo.title} — تقدير ${fromBaisa(est)} OMR`, propertyId: wo.propertyId });
  await tx.workOrder.update({ where: { id: woId }, data: { approvalId: ap.id } });
}

export async function updateWorkOrderPlan(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "maintenance.write");
  const v = parse(z.object({ assignedToId: zOptId, vendorId: zOptId, scheduledDate: zOptDate, dueDate: zOptDate, estimatedCost: zOptMoney, priority: z.enum(PRIORITIES) }), input);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!wo) throw notFound();
    assertPropertyAccess(ctx, wo.propertyId);
    if (["CLOSED", "CANCELLED"].includes(wo.status)) throw rule("أمر العمل مغلق / Work order closed");
    if (v.assignedToId) await checkTechnician(tx, ctx, v.assignedToId);
    const estChanged = (v.estimatedCost ?? null) !== (wo.estimatedCost?.toFixed(3) ?? null);
    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        assignedToId: v.assignedToId ?? null,
        vendorId: v.vendorId ?? null,
        scheduledDate: v.scheduledDate ? parseDateOnly(v.scheduledDate) : null,
        dueDate: v.dueDate ? parseDateOnly(v.dueDate) : null,
        estimatedCost: v.estimatedCost ?? null,
        priority: v.priority,
        status: wo.status === "OPEN" && (v.assignedToId || v.vendorId) ? "ASSIGNED" : wo.status,
        ...(estChanged ? { costApprovedAt: null, costApprovedById: null, approvalId: null } : {}),
      },
    });
    if (v.assignedToId && v.assignedToId !== wo.assignedToId) await notifyAssignee(tx, ctx, id, wo.number, wo.title, v.assignedToId);
    if (estChanged) {
      await tx.approval.updateMany({ where: { type: "WORK_ORDER_COST", entityId: id, status: "PENDING" }, data: { status: "REJECTED", decisionNote: "Superseded by new estimate", decidedAt: new Date() } });
      await maybeRequestCostApproval(tx, ctx, id);
    }
    await audit(tx, ctx, { action: "work_order.plan", entityType: "WorkOrder", entityId: id, before: wo, after: updated });
    return updated;
  });
}

async function loadWorkOrderForExecution(tx: Tx, ctx: Ctx, id: string) {
  const wo = await tx.workOrder.findFirst({ where: { AND: [{ id }, workOrderScope(ctx)] } });
  if (!wo) throw notFound();
  const isManager = can(ctx, "maintenance.write");
  if (!isManager) {
    assertCan(ctx, "workorder.assigned");
    if (wo.assignedToId !== ctx.userId) throw forbidden();
  } else assertPropertyAccess(ctx, wo.propertyId);
  return wo;
}

export async function startWorkOrder(ctx: Ctx, id: string) {
  assertCanAny(ctx, "maintenance.write", "workorder.assigned");
  return prisma.$transaction(async (tx) => {
    const wo = await loadWorkOrderForExecution(tx, ctx, id);
    if (!["OPEN", "ASSIGNED"].includes(wo.status)) throw rule("لا يمكن بدء أمر العمل في حالته الحالية / Cannot start in current status");
    if (wo.estimatedCost && !wo.costApprovedAt) throw rule("تقدير التكلفة بانتظار الاعتماد / Cost estimate awaiting approval");
    await tx.workOrder.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    await audit(tx, ctx, { action: "work_order.start", entityType: "WorkOrder", entityId: id, summary: wo.number });
  });
}

const completeSchema = z.object({
  completionReport: zStr(5000),
  laborHours: zOptDecimal(2),
  laborCost: zOptMoney,
  warrantyUntil: zOptDate,
  materials: z.array(z.object({ description: zStr(200), quantity: z.string().regex(/^\d+(\.\d{1,3})?$/), unitCost: zOptMoney })).default([]),
});

export async function completeWorkOrder(ctx: Ctx, id: string, input: unknown) {
  assertCanAny(ctx, "maintenance.write", "workorder.assigned");
  const v = parse(completeSchema, input);
  return prisma.$transaction(async (tx) => {
    const wo = await loadWorkOrderForExecution(tx, ctx, id);
    if (!["IN_PROGRESS", "ASSIGNED", "OPEN"].includes(wo.status)) throw rule("لا يمكن إنجاز أمر العمل في حالته الحالية / Cannot complete in current status");
    if (wo.estimatedCost && !wo.costApprovedAt) throw rule("تقدير التكلفة بانتظار الاعتماد / Cost estimate awaiting approval");
    await tx.workOrderMaterial.deleteMany({ where: { workOrderId: id } });
    const mats = v.materials.map((m) => {
      const [qi, qf = ""] = m.quantity.split(".");
      const q = BigInt(qi) * 1000n + BigInt(qf.padEnd(3, "0"));
      const total = (toBaisa(m.unitCost ?? "0") * q + 500n) / 1000n;
      return { workOrderId: id, description: m.description, quantity: m.quantity, unitCost: m.unitCost ?? "0", lineTotal: fromBaisa(total), _t: total };
    });
    if (mats.length) await tx.workOrderMaterial.createMany({ data: mats.map(({ _t, ...m }) => m) });
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completionReport: v.completionReport,
        laborHours: v.laborHours ?? null,
        laborCost: v.laborCost ?? "0",
        materialsCost: fromBaisa(sum(mats.map((m) => m._t))),
        warrantyUntil: v.warrantyUntil ? parseDateOnly(v.warrantyUntil) : null,
      },
    });
    await audit(tx, ctx, { action: "work_order.complete", entityType: "WorkOrder", entityId: id, summary: wo.number });
  });
}

/** اعتماد إغلاق أمر العمل وتقييم الجودة (من قبل مسؤول الصيانة) */
export async function closeWorkOrder(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "maintenance.write");
  const v = parse(z.object({ qualityRating: zInt(1, 5), note: zText(1000) }), input);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!wo) throw notFound();
    assertPropertyAccess(ctx, wo.propertyId);
    if (wo.status !== "COMPLETED") throw rule("يجب إنجاز أمر العمل قبل إغلاقه / Work order must be completed first");
    await tx.workOrder.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, qualityRating: v.qualityRating } });
    if (wo.vendorId) await recomputeVendorRating(tx, wo.vendorId);
    if (wo.requestId) {
      const open = await tx.workOrder.count({ where: { requestId: wo.requestId, status: { notIn: ["CLOSED", "CANCELLED"] } } });
      if (!open) await tx.maintenanceRequest.update({ where: { id: wo.requestId }, data: { status: "RESOLVED" } });
    }
    await audit(tx, ctx, { action: "work_order.close", entityType: "WorkOrder", entityId: id, summary: `${wo.number} rating ${v.qualityRating}${v.note ? `: ${v.note}` : ""}` });
  });
}

export async function cancelWorkOrder(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "maintenance.write");
  const wo = await prisma.workOrder.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!wo) throw notFound();
  assertPropertyAccess(ctx, wo.propertyId);
  if (["CLOSED", "CANCELLED"].includes(wo.status)) throw rule("أمر العمل مغلق / Already closed");
  await prisma.workOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(prisma, ctx, { action: "work_order.cancel", entityType: "WorkOrder", entityId: id, summary: `${wo.number}: ${reason}` });
}

export async function listWorkOrders(ctx: Ctx, f: { q?: string; status?: string; propertyId?: string; mine?: boolean } = {}) {
  assertCanAny(ctx, "maintenance.read", "workorder.assigned");
  return prisma.workOrder.findMany({
    where: {
      AND: [
        workOrderScope(ctx),
        f.propertyId ? { propertyId: f.propertyId } : {},
        f.status ? { status: f.status as "OPEN" } : {},
        f.mine ? { assignedToId: ctx.userId } : {},
        f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }] } : {},
      ],
    },
    include: { vendor: { select: { name: true } }, invoices: { select: { total: true, status: true } }, expenses: { select: { total: true, status: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
}

export async function getWorkOrder(ctx: Ctx, id: string) {
  assertCanAny(ctx, "maintenance.read", "workorder.assigned");
  const wo = await prisma.workOrder.findFirst({
    where: { AND: [{ id }, workOrderScope(ctx)] },
    include: { request: true, asset: true, vendor: true, materials: true, invoices: true, expenses: true, quotes: { include: { vendor: true } }, schedule: true },
  });
  if (!wo) throw notFound();
  const [property, unit, assignee] = await Promise.all([
    prisma.property.findUnique({ where: { id: wo.propertyId }, select: { id: true, name: true, code: true } }),
    wo.unitId ? prisma.unit.findUnique({ where: { id: wo.unitId }, select: { id: true, unitNumber: true } }) : null,
    wo.assignedToId ? prisma.user.findUnique({ where: { id: wo.assignedToId }, select: { id: true, name: true } }) : null,
  ]);
  const postedCosts = sum([...wo.invoices.filter((i) => i.status !== "VOID").map((i) => toBaisa(i.total)), ...wo.expenses.filter((e) => e.status === "POSTED").map((e) => toBaisa(e.total))]);
  return { ...wo, property, unit, assignee, postedCosts, internalCost: toBaisa(wo.laborCost) + toBaisa(wo.materialsCost) };
}

// ------------------------- الصيانة الوقائية -------------------------

const scheduleSchema = z.object({
  name: zStr(200),
  propertyId: zId,
  unitId: zOptId,
  assetId: zOptId,
  category: z.enum(CATEGORIES),
  frequencyUnit: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]),
  interval: zInt(1, 365),
  nextDueDate: zDate,
  leadDays: zInt(0, 365).default(7),
  vendorId: zOptId,
  assignedToId: zOptId,
  instructions: zText(5000),
  isActive: zBool.default(true),
});

export async function saveSchedule(ctx: Ctx, id: string | null, input: unknown) {
  assertCan(ctx, "maintenance.write");
  const v = parse(scheduleSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  return prisma.$transaction(async (tx) => {
    await checkLocation(tx, ctx, v.propertyId, v.unitId, v.assetId);
    if (v.assignedToId) await checkTechnician(tx, ctx, v.assignedToId);
    const data = { ...v, unitId: v.unitId ?? null, assetId: v.assetId ?? null, vendorId: v.vendorId ?? null, assignedToId: v.assignedToId ?? null, nextDueDate: parseDateOnly(v.nextDueDate) };
    const s = id
      ? await tx.maintenanceSchedule.update({ where: { id: (await tx.maintenanceSchedule.findFirstOrThrow({ where: { id, organizationId: ctx.orgId } })).id }, data })
      : await tx.maintenanceSchedule.create({ data: { ...data, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: id ? "schedule.update" : "schedule.create", entityType: "MaintenanceSchedule", entityId: s.id, summary: s.name });
    return s;
  });
}

export async function listSchedules(ctx: Ctx) {
  assertCan(ctx, "maintenance.read");
  return prisma.maintenanceSchedule.findMany({ where: { organizationId: ctx.orgId, propertyId: scopeIn(ctx) }, orderBy: { nextDueDate: "asc" } });
}

/**
 * يولّد أوامر العمل الوقائية التي حلّ موعد إنشائها (الاستحقاق - أيام التنبيه).
 * القيد الفريد (scheduleId, scheduleDueDate) يمنع إنشاء أمر مكرر لنفس الموعد حتى لو شُغّلت المهمة عدة مرات.
 */
export async function generatePreventiveWorkOrders(orgId: string, today: Date, db = prisma) {
  const schedules = await db.maintenanceSchedule.findMany({ where: { organizationId: orgId, isActive: true } });
  let created = 0;
  for (const s of schedules) {
    let due = s.nextDueDate;
    let guard = 0;
    while (addDays(due, -s.leadDays) <= today && guard++ < 50) {
      const dueDate = due;
      await db.$transaction(async (tx) => {
        const exists = await tx.workOrder.findUnique({ where: { scheduleId_scheduleDueDate: { scheduleId: s.id, scheduleDueDate: dueDate } } });
        if (!exists) {
          const number = await nextNumber(tx, orgId, SEQ.WORK_ORDER);
          await tx.workOrder.create({
            data: {
              organizationId: orgId,
              number,
              scheduleId: s.id,
              scheduleDueDate: dueDate,
              propertyId: s.propertyId,
              unitId: s.unitId,
              assetId: s.assetId,
              category: s.category,
              type: "PREVENTIVE",
              priority: "MEDIUM",
              title: s.name,
              description: s.instructions,
              assignedToId: s.assignedToId,
              vendorId: s.vendorId,
              scheduledDate: dueDate,
              dueDate,
              status: s.assignedToId || s.vendorId ? "ASSIGNED" : "OPEN",
            },
          });
          created++;
        }
        due = addPeriod(dueDate, s.frequencyUnit, s.interval);
        await tx.maintenanceSchedule.update({ where: { id: s.id }, data: { nextDueDate: due } });
      });
    }
  }
  return created;
}

// ------------------------- الأصول -------------------------

const assetSchema = z.object({
  tag: zOptStr(50),
  name: zStr(200),
  category: z.enum(CATEGORIES),
  propertyId: zId,
  unitId: zOptId,
  location: zOptStr(200),
  brand: zOptStr(100),
  model: zOptStr(100),
  serialNumber: zOptStr(100),
  installDate: zOptDate,
  warrantyEnd: zOptDate,
  purchaseCost: zOptMoney,
  status: z.enum(["ACTIVE", "UNDER_REPAIR", "RETIRED"]).default("ACTIVE"),
  notes: zText(2000),
});

export async function saveAsset(ctx: Ctx, id: string | null, input: unknown) {
  assertCan(ctx, "asset.write");
  const v = parse(assetSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  return prisma.$transaction(async (tx) => {
    await checkLocation(tx, ctx, v.propertyId, v.unitId);
    const data = {
      ...v,
      unitId: v.unitId ?? null,
      installDate: v.installDate ? parseDateOnly(v.installDate) : null,
      warrantyEnd: v.warrantyEnd ? parseDateOnly(v.warrantyEnd) : null,
      purchaseCost: v.purchaseCost ?? null,
    };
    if (id) {
      const before = await tx.asset.findFirst({ where: { id, organizationId: ctx.orgId } });
      if (!before) throw notFound();
      const a = await tx.asset.update({ where: { id }, data: { ...data, tag: v.tag ?? before.tag } });
      await audit(tx, ctx, { action: "asset.update", entityType: "Asset", entityId: id, before, after: a });
      return a;
    }
    const tag = v.tag ?? (await nextNumber(tx, ctx.orgId, SEQ.ASSET)).replace(/-\d{4}-/, "-");
    const a = await tx.asset.create({ data: { ...data, tag, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: "asset.create", entityType: "Asset", entityId: a.id, summary: `${tag} ${v.name}` });
    return a;
  });
}

export async function listAssets(ctx: Ctx, f: { q?: string; propertyId?: string } = {}) {
  assertCan(ctx, "maintenance.read");
  return prisma.asset.findMany({
    where: {
      organizationId: ctx.orgId,
      propertyId: f.propertyId ?? scopeIn(ctx),
      OR: f.q ? [{ tag: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }, { serialNumber: { contains: f.q, mode: "insensitive" } }] : undefined,
    },
    include: { unit: { select: { unitNumber: true } } },
    orderBy: { tag: "asc" },
  });
}

export async function getAsset(ctx: Ctx, id: string) {
  assertCan(ctx, "maintenance.read");
  const a = await prisma.asset.findFirst({ where: { id, organizationId: ctx.orgId }, include: { unit: true, workOrders: { orderBy: { createdAt: "desc" } } } });
  if (!a) throw notFound();
  assertPropertyAccess(ctx, a.propertyId);
  return a;
}

export function maintenanceDue(today: Date, days = 7) {
  return { gte: today, lte: addDays(today, days) };
}

export { todayInZone };
