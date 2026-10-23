import Link from "next/link";
import { Card, DataTable, Empty, FilterBar, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { listOwners } from "@/server/services/properties";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Owners" };

export default async function OwnersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listOwners(ctx, q.q));
  return (
    <>
      <PageHeader title={t.nav.owners} actions={ctx.permissions.has("owner.write") && <Link href="/owners/new" className="btn-primary">+ {L("مالك جديد", "New owner")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/owners" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset} />
        <DataTable
          rows={rows}
          rowKey={(o) => o.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.name, primary: true, render: (o) => <Link className="link" href={`/owners/${o.id}`}>{o.name}</Link> },
            { key: "c", label: t.common.code, render: (o) => <span className="num text-xs">{o.code}</span> },
            { key: "t", label: t.common.type, render: (o) => label(t, "OwnerType", o.type) },
            { key: "p", label: t.common.phone, render: (o) => <span className="num">{o.phone ?? "—"}</span> },
            { key: "s", label: t.nav.properties, render: (o) => o.shares.map((s) => `${s.property.code} (${Number(s.percentage)}%)`).join("، ") || "—" },
          ]}
        />
      </Card>
    </>
  );
}
