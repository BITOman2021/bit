import { z } from "zod";
import { audit } from "../audit";
import { assertCan, type Ctx, hasPropertyAccess } from "../context";
import { prisma } from "../db";
import { forbidden, notFound, rule } from "../errors";
import { parse, zId, zText } from "../validation";
import { postRefundTx } from "./billing";
import { postExpenseTx, postInvoiceTx } from "./purchasing";

export async function listApprovals(ctx: Ctx, status: "PENDING" | "APPROVED" | "REJECTED" | "ALL" = "PENDING") {
  assertCan(ctx, "approval.decide");
  const rows = await prisma.approval.findMany({
    where: { organizationId: ctx.orgId, status: status === "ALL" ? undefined : status },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.filter((r) => !r.propertyId || hasPropertyAccess(ctx, r.propertyId));
}

/**
 * قرار الاعتماد. فصل المهام: لا يجوز لمقدم الطلب اعتماد طلبه بنفسه.
 * عند الاعتماد يُنفذ الإجراء المرتبط (ترحيل المصروف/الفاتورة/الاسترداد ...) في نفس المعاملة.
 */
export async function decideApproval(ctx: Ctx, input: unknown) {
  assertCan(ctx, "approval.decide");
  const v = parse(z.object({ approvalId: zId, decision: z.enum(["APPROVE", "REJECT"]), note: zText(1000) }), input);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "approvals" WHERE "id" = ${v.approvalId} FOR UPDATE`;
      const a = await tx.approval.findFirst({ where: { id: v.approvalId, organizationId: ctx.orgId } });
      if (!a) throw notFound();
      if (a.status !== "PENDING") throw rule("تم البت في الطلب مسبقًا / Already decided");
      if (a.propertyId && !hasPropertyAccess(ctx, a.propertyId)) throw forbidden();
      if (a.requestedById === ctx.userId) throw forbidden("لا يمكنك اعتماد طلب قدمته بنفسك / You cannot decide your own request");
      if (v.decision === "REJECT" && !v.note) throw rule("سبب الرفض مطلوب / Rejection reason required");

      const approve = v.decision === "APPROVE";
      await tx.approval.update({ where: { id: a.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: ctx.userId, decidedAt: new Date(), decisionNote: v.note } });

      switch (a.type) {
        case "EXPENSE":
          if (approve) {
            await tx.expense.update({ where: { id: a.entityId }, data: { status: "APPROVED" } });
            await postExpenseTx(tx, ctx, a.entityId);
          } else await tx.expense.update({ where: { id: a.entityId }, data: { status: "REJECTED" } });
          break;
        case "INVOICE":
          if (approve) {
            await tx.invoice.update({ where: { id: a.entityId }, data: { status: "APPROVED" } });
            await postInvoiceTx(tx, ctx, a.entityId);
          } else await tx.invoice.update({ where: { id: a.entityId }, data: { status: "REJECTED" } });
          break;
        case "PURCHASE_ORDER":
          await tx.purchaseOrder.update({ where: { id: a.entityId }, data: { status: approve ? "APPROVED" : "REJECTED" } });
          break;
        case "REFUND":
          if (approve) await postRefundTx(tx, ctx, a.entityId);
          else await tx.refund.update({ where: { id: a.entityId }, data: { status: "REJECTED" } });
          break;
        case "WORK_ORDER_COST":
          if (approve) await tx.workOrder.update({ where: { id: a.entityId }, data: { costApprovedAt: new Date(), costApprovedById: ctx.userId } });
          break;
        case "TENANT_CONTACT_UPDATE":
          if (approve) {
            const p = (a.payload ?? {}) as { phone?: string; email?: string; address?: string; emergencyContact?: string };
            await tx.tenant.update({ where: { id: a.entityId }, data: { phone: p.phone, email: p.email, address: p.address, emergencyContact: p.emergencyContact } });
          }
          break;
        default:
          break;
      }
      if (a.requestedById) {
        await tx.notification.create({
          data: {
            organizationId: ctx.orgId,
            userId: a.requestedById,
            type: "APPROVAL_DECIDED",
            title: approve ? "تم اعتماد طلبك / Request approved" : "تم رفض طلبك / Request rejected",
            body: `${a.summary}${v.note ? ` — ${v.note}` : ""}`,
            severity: approve ? "success" : "danger",
            dedupeKey: `approval-decided:${a.id}`,
          },
        });
      }
      await audit(tx, ctx, { action: approve ? "approval.approve" : "approval.reject", entityType: "Approval", entityId: a.id, summary: `${a.type} ${a.summary}${v.note ? ` — ${v.note}` : ""}` });
    },
    { timeout: 30000 },
  );
}
