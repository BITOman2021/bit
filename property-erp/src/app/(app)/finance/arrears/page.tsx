import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterDate, FilterSelect, Grid, Money, PageHeader, Stat } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { parseDateOnly } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { sum } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { arrears } from "@/server/services/billing";
import { listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Arrears" };

export default async function ArrearsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  let asOf: Date | undefined;
  try { asOf = q.asOf ? parseDateOnly(q.asOf) : undefined; } catch { asOf = undefined; }
  const [rows, props] = await load(Promise.all([arrears(ctx, { asOf, propertyId: q.propertyId }), listProperties(ctx)]));
  const b = (k: string) => sum(rows.filter((r) => r.bucket === k).map((r) => r.balance));
  return (
    <>
      <PageHeader title={t.nav.arrears} actions={<Link className="btn-secondary" href={`/reports/arrears${q.asOf ? `?asOf=${q.asOf}` : ""}`}>{t.nav.reports}</Link>} />
      <Grid cols={4}>
        <Stat label="0-30" value={<Money value={b("0-30")} />} />
        <Stat label="31-60" value={<Money value={b("31-60")} />} tone="gold" />
        <Stat label="61-90" value={<Money value={b("61-90")} />} tone="danger" />
        <Stat label="90+" value={<Money value={b("90+")} />} tone="danger" />
      </Grid>
      <Card bodyClassName="p-0" className="mt-4">
        <FilterBar resetHref="/finance/arrears" submitLabel={t.common.apply} resetLabel={t.common.reset}>
          <FilterDate name="asOf" label={t.common.asOf} value={q.asOf} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={L("لا توجد متأخرات 🎉", "No arrears")} />}
          cols={[
            { key: "t", label: t.common.tenant, primary: true, render: (r) => <Link className="link" href={`/tenants/${r.lease.tenant.id}`}>{r.lease.tenant.name}</Link> },
            { key: "ph", label: t.common.phone, render: (r) => r.lease.tenant.phone ? <a className="link num" href={`tel:${r.lease.tenant.phone.replace(/\s/g, "")}`}>{r.lease.tenant.phone}</a> : "—" },
            { key: "u", label: t.common.unit, render: (r) => `${r.lease.unit.property.code} / ${r.lease.unit.unitNumber}` },
            { key: "c", label: L("الاستحقاق", "Charge"), render: (r) => <Link className="link num text-xs" href={`/leases/${r.leaseId}`}>{r.number}</Link> },
            { key: "ty", label: t.common.type, render: (r) => label(t, "ChargeType", r.type) },
            { key: "d", label: L("تاريخ الاستحقاق", "Due"), render: (r) => <span className="num">{fmtDate(r.dueDate)}</span> },
            { key: "days", label: L("أيام", "Days"), render: (r) => <Badge tone={r.daysOverdue > 60 ? "red" : r.daysOverdue > 30 ? "amber" : "blue"}>{r.daysOverdue}</Badge> },
            { key: "b", label: L("المتبقي", "Balance"), align: "end", render: (r) => <Money value={r.balance} className="font-semibold" /> },
            { key: "x", label: "", hideOnMobile: true, render: (r) => ctx.permissions.has("payment.write") && <Link className="btn-secondary btn-sm" href={`/finance/payments/new?tenantId=${r.lease.tenant.id}&leaseId=${r.leaseId}`}>{L("تحصيل", "Collect")}</Link> },
          ]}
        />
      </Card>
    </>
  );
}
