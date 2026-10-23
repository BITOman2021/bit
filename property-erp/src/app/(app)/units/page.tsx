import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listProperties, listUnits } from "@/server/services/properties";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Units" };

export default async function UnitsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [rows, props] = await load(Promise.all([listUnits(ctx, q), listProperties(ctx)]));
  return (
    <>
      <PageHeader title={t.nav.units} subtitle={L(`${rows.length} وحدة`, `${rows.length} units`)} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/units" q={q.q} searchLabel={L("رقم الوحدة أو العقار", "Unit or property")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "UnitStatus")} allLabel={t.common.all} />
          <FilterSelect name="type" label={t.common.type} value={q.type} options={enumOptions(t, "UnitType")} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(u) => u.id}
          empty={<Empty title={t.common.empty} hint={L("أضف الوحدات من صفحة العقار", "Add units from the property page")} />}
          cols={[
            { key: "no", label: t.common.unit, primary: true, render: (u) => <Link className="link" href={`/units/${u.id}`}>{u.property.code} / {u.unitNumber}</Link> },
            { key: "p", label: t.common.property, render: (u) => u.property.name },
            { key: "type", label: t.common.type, render: (u) => label(t, "UnitType", u.type) },
            { key: "tenant", label: t.common.tenant, render: (u) => (u.leases[0] ? <Link className="link" href={`/tenants/${u.leases[0].tenant.id}`}>{u.leases[0].tenant.name}</Link> : "—") },
            { key: "rent", label: L("الإيجار الشهري", "Monthly rent"), align: "end", render: (u) => <Money value={u.leases[0]?.monthlyRent ?? u.marketRent} /> },
            { key: "end", label: L("نهاية العقد", "Lease end"), render: (u) => <span className="num">{fmtDate(u.leases[0]?.endDate)}</span> },
            { key: "status", label: t.common.status, render: (u) => <Badge status={u.status}>{label(t, "UnitStatus", u.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
