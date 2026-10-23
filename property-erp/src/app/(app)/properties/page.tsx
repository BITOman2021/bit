import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtPercent } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listOwners, listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Properties" };

export default async function PropertiesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listProperties(ctx, { q: q.q, type: q.type, status: q.status, ownerId: q.ownerId }));
  const owners = ctx.permissions.has("owner.read") ? await listOwners(ctx) : [];
  return (
    <>
      <PageHeader
        title={t.nav.properties}
        subtitle={L(`${rows.length} عقار`, `${rows.length} properties`)}
        actions={ctx.permissions.has("property.write") && <Link href="/properties/new" className="btn-primary">+ {L("عقار جديد", "New property")}</Link>}
      />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/properties" q={q.q} searchLabel={L("بحث بالاسم أو الرقم أو الولاية", "Search name, code, wilayat")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="type" label={t.common.type} value={q.type} options={enumOptions(t, "PropertyType")} allLabel={t.common.all} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "PropertyStatus")} allLabel={t.common.all} />
          {owners.length > 0 && <FilterSelect name="ownerId" label={t.common.owner} value={q.ownerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} allLabel={t.common.all} />}
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} hint={t.common.emptyHint} action={ctx.permissions.has("property.write") && <Link href="/properties/new" className="btn-primary">{L("إضافة عقار", "Add property")}</Link>} />}
          cols={[
            { key: "name", label: t.common.name, primary: true, render: (r) => <Link className="link" href={`/properties/${r.id}`}>{r.name}</Link> },
            { key: "code", label: t.common.code, render: (r) => <span className="num text-xs">{r.code}</span> },
            { key: "type", label: t.common.type, render: (r) => label(t, "PropertyType", r.type) },
            { key: "loc", label: L("الموقع", "Location"), render: (r) => [r.wilayat, r.area].filter(Boolean).join(" — ") || "—" },
            { key: "owners", label: t.nav.owners, hideOnMobile: true, render: (r) => r.shares.map((s) => `${s.owner.name} (${Number(s.percentage)}%)`).join("، ") || "—" },
            { key: "units", label: t.nav.units, render: (r) => <span className="num">{r.unitCount}</span> },
            { key: "occ", label: t.dash.occupancy, render: (r) => <span className="num">{fmtPercent(r.unitCount ? (r.occupied / r.unitCount) * 100 : 0)}</span> },
            { key: "status", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "PropertyStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
