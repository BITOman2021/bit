import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listRequests } from "@/server/services/maintenance";
import { listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Maintenance requests" };

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [rows, props] = await load(Promise.all([listRequests(ctx, q), listProperties(ctx)]));
  return (
    <>
      <PageHeader title={t.nav.requests} actions={ctx.permissions.has("maintenance.write") && <Link className="btn-primary" href="/maintenance/requests/new">+ {L("طلب صيانة", "New request")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/maintenance/requests" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "RequestStatus")} allLabel={t.common.all} />
          <FilterSelect name="priority" label={L("الأولوية", "Priority")} value={q.priority} options={enumOptions(t, "Priority")} allLabel={t.common.all} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.reference, primary: true, render: (r) => <Link className="link num" href={`/maintenance/requests/${r.id}`}>{r.number}</Link> },
            { key: "t", label: L("العنوان", "Title"), render: (r) => r.title },
            { key: "c", label: t.common.category, render: (r) => label(t, "MaintenanceCategory", r.category) },
            { key: "p", label: L("الأولوية", "Priority"), render: (r) => <Badge status={r.priority}>{label(t, "Priority", r.priority)}</Badge> },
            { key: "src", label: L("المصدر", "Source"), hideOnMobile: true, render: (r) => (r.source === "TENANT_PORTAL" ? L("المستأجر", "Tenant") : L("الإدارة", "Staff")) },
            { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.createdAt)}</span> },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "RequestStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
