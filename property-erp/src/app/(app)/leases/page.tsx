import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listLeases } from "@/server/services/leases";
import { listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Leases" };

export default async function LeasesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [rows, props] = await load(Promise.all([listLeases(ctx, { q: q.q, status: q.status, propertyId: q.propertyId, expiringDays: q.expiring ? Number(q.expiring) || 60 : undefined }), listProperties(ctx)]));
  return (
    <>
      <PageHeader
        title={t.nav.leases}
        subtitle={L(`${rows.length} عقد`, `${rows.length} leases`)}
        actions={
          <>
            <Link href="/leases/templates" className="btn-secondary">{t.nav.templates}</Link>
            {ctx.permissions.has("lease.write") && <Link href="/leases/new" className="btn-primary">+ {L("عقد جديد", "New lease")}</Link>}
          </>
        }
      />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/leases" q={q.q} searchLabel={L("رقم العقد، المستأجر، الوحدة", "Lease no., tenant, unit")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "LeaseStatus")} allLabel={t.common.all} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
          <FilterSelect name="expiring" label={L("ينتهي خلال", "Expiring within")} value={q.expiring} allLabel={t.common.all} options={[{ value: "30", label: L("30 يومًا", "30 days") }, { value: "60", label: L("60 يومًا", "60 days") }, { value: "90", label: L("90 يومًا", "90 days") }]} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: L("رقم العقد", "Lease no."), primary: true, render: (r) => <Link className="link num" href={`/leases/${r.id}`}>{r.number}</Link> },
            { key: "t", label: t.common.tenant, render: (r) => r.tenant.name },
            { key: "u", label: t.common.unit, render: (r) => `${r.unit.property.code} / ${r.unit.unitNumber}` },
            { key: "p", label: t.common.period, render: (r) => <span className="num text-xs">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span> },
            { key: "r", label: L("الإيجار الشهري", "Monthly rent"), align: "end", render: (r) => <Money value={r.monthlyRent} /> },
            { key: "f", label: L("التكرار", "Frequency"), hideOnMobile: true, render: (r) => label(t, "RentFrequency", r.frequency) },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "LeaseStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
