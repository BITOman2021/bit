import type { ApprovalType } from "@/generated/prisma/enums";
import { fromBaisa, type Baisa } from "@/lib/money";
import type { Ctx } from "../context";
import type { Tx } from "../db";

/** ينشئ طلب اعتماد ويُشعر المعتمدين */
export async function requestApproval(
  tx: Tx,
  ctx: Ctx,
  a: { type: ApprovalType; entityId: string; amount?: Baisa; summary: string; propertyId?: string | null; payload?: object },
) {
  const approval = await tx.approval.create({
    data: {
      organizationId: ctx.orgId,
      type: a.type,
      entityId: a.entityId,
      amount: a.amount !== undefined ? fromBaisa(a.amount) : null,
      summary: a.summary,
      propertyId: a.propertyId ?? null,
      payload: a.payload,
      requestedById: ctx.userId,
    },
  });
  const approvers = await tx.user.findMany({
    where: { organizationId: ctx.orgId, isActive: true, id: { not: ctx.userId }, role: { permissions: { some: { permissionKey: "approval.decide" } } } },
    select: { id: true },
  });
  if (approvers.length) {
    await tx.notification.createMany({
      data: approvers.map((u) => ({
        organizationId: ctx.orgId,
        userId: u.id,
        type: "APPROVAL_PENDING",
        title: "طلب اعتماد جديد / New approval request",
        body: a.summary,
        link: "/approvals",
        severity: "warning",
        dedupeKey: `approval:${approval.id}`,
      })),
      skipDuplicates: true,
    });
  }
  return approval;
}
