import { redirect } from "next/navigation";
import { decideApprovalAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { listApprovals } from "@/server/services/approvals";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Approvals" };

const LINKS: Record<string, string> = { EXPENSE: "/finance/expenses", INVOICE: "/finance/invoices/", PURCHASE_ORDER: "/purchase-orders", REFUND: "/finance/deposits", WORK_ORDER_COST: "/maintenance/work-orders/", TENANT_CONTACT_UPDATE: "/tenants/" };

export default async function ApprovalsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("approval.decide")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listApprovals(ctx, (q.status as "PENDING") ?? "PENDING"));
  const users = new Map((await prisma.user.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={t.nav.approvals} subtitle={L("لا يمكن لمقدم الطلب اعتماد طلبه (فصل المهام)", "Requesters cannot approve their own requests (segregation of duties)")} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/approvals" submitLabel={t.common.apply} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} options={[...enumOptions(t, "ApprovalStatus"), { value: "ALL", label: t.common.all }]} allLabel={label(t, "ApprovalStatus", "PENDING")} />
        </FilterBar>
        <DataTable rows={rows} rowKey={(r) => r.id} empty={<Empty title={L("لا توجد طلبات", "No requests")} />} cols={[
          { key: "t", label: t.common.type, primary: true, render: (r) => <Badge tone="blue">{label(t, "ApprovalType", r.type)}</Badge> },
          { key: "s", label: t.common.description, render: (r) => {
            const href = LINKS[r.type];
            const full = href?.endsWith("/") ? `${href}${r.entityId}` : href;
            return full ? <a className="link" href={full}>{r.summary}</a> : r.summary;
          } },
          { key: "a", label: t.common.amount, align: "end", render: (r) => (r.amount ? <Money value={r.amount} /> : "—") },
          { key: "by", label: L("مقدم الطلب", "Requested by"), render: (r) => (r.requestedById ? users.get(r.requestedById) : "—") },
          { key: "d", label: t.common.date, render: (r) => <span className="text-xs">{fmtDateTime(r.createdAt, locale, ctx.timezone)}</span> },
          { key: "st", label: t.common.status, render: (r) => <><Badge status={r.status}>{label(t, "ApprovalStatus", r.status)}</Badge>{r.decisionNote && <div className="text-xs text-muted">{r.decisionNote}</div>}</> },
          { key: "x", label: "", render: (r) => r.status === "PENDING" && r.requestedById !== ctx.userId && (
            <span className="flex gap-1">
              <ActionButton action={decideApprovalAction} fields={{ id: r.id, decision: "APPROVE" }} label={t.common.approve} className="btn-gold btn-sm" confirmText={L("اعتماد وتنفيذ الإجراء المرتبط؟", "Approve and execute?")} />
              <ActionButton action={decideApprovalAction} fields={{ id: r.id, decision: "REJECT" }} label={t.common.reject} className="btn-ghost btn-sm" askReason={L("سبب الرفض", "Rejection reason")} />
            </span>
          ) },
        ]} />
      </Card>
    </>
  );
}
