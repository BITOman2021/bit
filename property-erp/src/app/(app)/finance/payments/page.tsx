import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterDate, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listPayments } from "@/server/services/billing";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Collections" };

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listPayments(ctx, q));
  const total = sum(rows.filter((r) => r.status === "POSTED").map((r) => toBaisa(r.amount)));
  return (
    <>
      <PageHeader title={t.nav.payments} subtitle={<>{L("إجمالي المرحّل في النتائج", "Posted total in results")}: <Money value={total} currency /></>} actions={ctx.permissions.has("payment.write") && <Link href="/finance/payments/new" className="btn-primary">+ {L("تسجيل تحصيل", "Record collection")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/finance/payments" q={q.q} searchLabel={L("رقم الإيصال، المرجع، المستأجر", "Receipt, reference, tenant")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "PaymentStatus")} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "r", label: L("الإيصال", "Receipt"), primary: true, render: (r) => <Link className="link num" href={`/finance/payments/${r.id}`}>{r.receipt?.number ?? r.number}</Link> },
            { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.receivedDate)}</span> },
            { key: "t", label: t.common.tenant, render: (r) => r.tenant.name },
            { key: "l", label: t.nav.leases, render: (r) => <span className="num text-xs">{r.lease?.number ?? "—"}</span> },
            { key: "m", label: L("الطريقة", "Method"), render: (r) => label(t, "PaymentMethod", r.method) },
            { key: "a", label: t.common.amount, align: "end", render: (r) => <Money value={r.amount} /> },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "PaymentStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
