import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listInvoices } from "@/server/services/purchasing";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Vendor bills" };

export default async function InvoicesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listInvoices(ctx, q));
  return (
    <>
      <PageHeader title={t.nav.invoices} actions={ctx.permissions.has("invoice.write") && <Link href="/finance/invoices/new" className="btn-primary">+ {L("فاتورة مورد", "Vendor bill")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/finance/invoices" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "DocumentStatus")} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.reference, primary: true, render: (r) => <Link className="link num" href={`/finance/invoices/${r.id}`}>{r.number}</Link> },
            { key: "v", label: t.common.vendor, render: (r) => r.vendor.name },
            { key: "vn", label: L("رقم المورد", "Vendor ref"), render: (r) => <span className="num text-xs">{r.vendorInvoiceNo}</span> },
            { key: "d", label: L("الاستحقاق", "Due"), render: (r) => <span className="num">{fmtDate(r.dueDate)}</span> },
            { key: "a", label: t.common.total, align: "end", render: (r) => <Money value={r.total} /> },
            { key: "b", label: L("المتبقي", "Balance"), align: "end", render: (r) => <Money value={toBaisa(r.total) - toBaisa(r.paidAmount)} /> },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "DocumentStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
