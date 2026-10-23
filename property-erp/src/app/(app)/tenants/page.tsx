import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { listTenants } from "@/server/services/tenants";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listTenants(ctx, { q: q.q, status: q.status as "active" }));
  return (
    <>
      <PageHeader title={t.nav.tenants} subtitle={L(`${rows.length} مستأجر`, `${rows.length} tenants`)} actions={ctx.permissions.has("tenant.write") && <Link href="/tenants/new" className="btn-primary">+ {L("مستأجر جديد", "New tenant")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/tenants" q={q.q} searchLabel={L("الاسم، الرمز، الهاتف، البريد", "Name, code, phone, email")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} allLabel={t.common.all} options={[{ value: "active", label: L("لديه عقد ساري", "Active lease") }, { value: "former", label: L("سابق / بدون عقد", "Former / none") }]} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.name, primary: true, render: (r) => <Link className="link" href={`/tenants/${r.id}`}>{r.name}</Link> },
            { key: "c", label: t.common.code, render: (r) => <span className="num text-xs">{r.code}</span> },
            { key: "p", label: t.common.phone, render: (r) => <span className="num">{r.phone ?? "—"}</span> },
            { key: "u", label: t.common.unit, render: (r) => r.leases.map((l) => `${l.unit.property.code}/${l.unit.unitNumber}`).join("، ") || "—" },
            { key: "s", label: t.common.status, render: (r) => (r.leases.length ? <Badge tone="green">{L("ساري", "Active")}</Badge> : <Badge tone="gray">{L("بدون عقد", "No lease")}</Badge>) },
          ]}
        />
      </Card>
    </>
  );
}
