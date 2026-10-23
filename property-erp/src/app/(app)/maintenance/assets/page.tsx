import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listAssets } from "@/server/services/maintenance";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listAssets(ctx, q));
  const today = todayInZone(ctx.timezone);
  return (
    <>
      <PageHeader title={t.nav.assets} actions={ctx.permissions.has("asset.write") && <Link href="/maintenance/assets/new" className="btn-primary">+ {L("أصل", "Asset")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/maintenance/assets" q={q.q} searchLabel={L("الرقم، الاسم، الرقم التسلسلي", "Tag, name, serial")} submitLabel={t.common.search} resetLabel={t.common.reset} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "t", label: L("الرقم", "Tag"), primary: true, render: (r) => <Link className="link num" href={`/maintenance/assets/${r.id}`}>{r.tag} — {r.name}</Link> },
            { key: "c", label: t.common.category, render: (r) => label(t, "MaintenanceCategory", r.category) },
            { key: "u", label: t.common.unit, render: (r) => r.unit?.unitNumber ?? r.location ?? "—" },
            { key: "b", label: L("الماركة/الموديل", "Brand/model"), render: (r) => [r.brand, r.model].filter(Boolean).join(" ") || "—" },
            { key: "w", label: L("الضمان", "Warranty"), render: (r) => (r.warrantyEnd ? <Badge tone={r.warrantyEnd < today ? "gray" : "green"}>{fmtDate(r.warrantyEnd)}</Badge> : "—") },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}>{r.status}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
