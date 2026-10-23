import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";
import { audit } from "../audit";
import { assertCan, type Ctx, scopeIn } from "../context";
import { prisma } from "../db";
import { notFound } from "../errors";
import { parse, zOptDate, zOptId, zStr, zText } from "../validation";

export async function listTasks(ctx: Ctx, f: { mine?: boolean; status?: string } = {}) {
  assertCan(ctx, "task.write");
  return prisma.task.findMany({
    where: {
      organizationId: ctx.orgId,
      assignedToId: f.mine ? ctx.userId : undefined,
      status: f.status ? (f.status as "OPEN") : { in: ["OPEN", "IN_PROGRESS"] },
      OR: ctx.propertyIds === null ? undefined : [{ propertyId: scopeIn(ctx) }, { propertyId: null, OR: [{ createdById: ctx.userId }, { assignedToId: ctx.userId }] }],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function createTask(ctx: Ctx, input: unknown) {
  assertCan(ctx, "task.write");
  const v = parse(z.object({ title: zStr(200), description: zText(3000), assignedToId: zOptId, propertyId: zOptId, dueDate: zOptDate, priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM") }), input);
  if (v.assignedToId) {
    const u = await prisma.user.findFirst({ where: { id: v.assignedToId, organizationId: ctx.orgId, isActive: true } });
    if (!u) throw notFound("المستخدم غير موجود / User not found");
  }
  const t = await prisma.task.create({ data: { ...v, assignedToId: v.assignedToId ?? null, propertyId: v.propertyId ?? null, dueDate: v.dueDate ? parseDateOnly(v.dueDate) : null, organizationId: ctx.orgId, createdById: ctx.userId } });
  if (v.assignedToId && v.assignedToId !== ctx.userId) {
    await prisma.notification.create({ data: { organizationId: ctx.orgId, userId: v.assignedToId, type: "TASK_ASSIGNED", title: `مهمة جديدة: ${v.title}`, link: "/tasks", dedupeKey: `task:${t.id}` } });
  }
  await audit(prisma, ctx, { action: "task.create", entityType: "Task", entityId: t.id, summary: t.title });
  return t;
}

export async function setTaskStatus(ctx: Ctx, id: string, status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED") {
  assertCan(ctx, "task.write");
  const t = await prisma.task.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!t) throw notFound();
  await prisma.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  await audit(prisma, ctx, { action: "task.status", entityType: "Task", entityId: id, summary: `${t.status} → ${status}` });
}
