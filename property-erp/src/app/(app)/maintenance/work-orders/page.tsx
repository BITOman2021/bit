import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listWorkOrders } from "@/server/services/maintenance";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Work orders" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listWorkOrders(ctx, { q: q.q, status: q.status, mine: q.mine === "1" }));
  const today = todayInZone(ctx.timezone);
  const isTech = !ctx.permissions.has("maintenance.read");
  return (
    <>
      <PageHeader title={isTech ? L("أوامر العمل المسندة إليّ", "My assigned work orders") : t.nav.workOrders} actions={ctx.permissions.has("maintenance.write") && <Link className="btn-primary" href="/maintenance/work-orders/new">+ {L("أمر عمل", "Work order")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/maintenance/work-orders" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "WorkOrderStatus")} allLabel={t.common.all} />
          {!isTech && <FilterSelect name="mine" label={L("المسند", "Assigned")} value={q.mine} options={[{ value: "1", label: L("المسند إليّ", "Assigned to me") }]} allLabel={t.common.all} />}
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.reference, primary: true, render: (r) => <Link className="link num" href={`/maintenance/work-orders/${r.id}`}>{r.number} — {r.title}</Link> },
            { key: "c", label: t.common.category, render: (r) => label(t, "MaintenanceCategory", r.category) },
            { key: "ty", label: t.common.type, render: (r) => label(t, "MaintenanceType", r.type) },
            { key: "p", label: L("الأولوية", "Priority"), render: (r) => <Badge status={r.priority}>{label(t, "Priority", r.priority)}</Badge> },
            { key: "due", label: L("الموعد", "Due"), render: (r) => <span className={`num ${r.dueDate && r.dueDate < today && !["COMPLETED", "CLOSED", "CANCELLED"].includes(r.status) ? "font-bold text-danger" : ""}`}>{fmtDate(r.dueDate ?? r.scheduledDate)}</span> },
            { key: "v", label: t.common.vendor, hideOnMobile: true, render: (r) => r.vendor?.name ?? "—" },
            { key: "e", label: L("التقدير", "Estimate"), align: "end", hideOnMobile: true, render: (r) => <Money value={r.estimatedCost} /> },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "WorkOrderStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
