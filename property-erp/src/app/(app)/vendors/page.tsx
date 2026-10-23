import Link from "next/link";
import { Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listVendors } from "@/server/services/purchasing";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listVendors(ctx, q));
  return (
    <>
      <PageHeader title={t.nav.vendors} actions={ctx.permissions.has("vendor.write") && <Link href="/vendors/new" className="btn-primary">+ {L("مورد / مقاول", "Vendor / contractor")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/vendors" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="specialty" label={L("التخصص", "Specialty")} value={q.specialty} options={enumOptions(t, "MaintenanceCategory")} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.name, primary: true, render: (r) => <Link className="link" href={`/vendors/${r.id}`}>{r.name}</Link> },
            { key: "s", label: L("التخصصات", "Specialties"), render: (r) => r.specialties.map((x) => label(t, "MaintenanceCategory", x)).join("، ") || "—" },
            { key: "p", label: t.common.phone, render: (r) => <span className="num">{r.phone ?? "—"}</span> },
            { key: "r", label: L("التقييم", "Rating"), render: (r) => (r.rating ? `★ ${Number(r.rating).toFixed(1)}` : "—") },
            { key: "b", label: L("المستحق له", "Payable"), align: "end", render: (r) => <Money value={sum(r.invoices.map((i) => toBaisa(i.total) - toBaisa(i.paidAmount)))} /> },
          ]}
        />
      </Card>
    </>
  );
}
