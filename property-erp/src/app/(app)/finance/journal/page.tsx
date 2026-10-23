import Link from "next/link";
import { Badge, Card, DataTable, Empty, FilterBar, FilterDate, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listJournal } from "@/server/services/banking";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listJournal(ctx, q));
  return (
    <>
      <PageHeader title={t.nav.journal} actions={ctx.permissions.has("journal.write") && <Link className="btn-primary" href="/finance/journal/new">+ {L("قيد يدوي", "Manual entry")}</Link>} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/finance/journal" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
          <FilterSelect name="source" label={L("المصدر", "Source")} value={q.source} options={enumOptions(t, "JournalSource")} allLabel={t.common.all} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "JournalStatus")} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: L("رقم القيد", "Entry"), primary: true, render: (r) => <Link className="link num" href={`/finance/journal/${r.id}`}>{r.number}</Link> },
            { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.date)}</span> },
            { key: "m", label: L("البيان", "Memo"), render: (r) => <span className="line-clamp-2">{r.memo}</span> },
            { key: "s", label: L("المصدر", "Source"), render: (r) => <Badge tone="blue">{label(t, "JournalSource", r.source)}</Badge> },
            { key: "a", label: t.common.amount, align: "end", render: (r) => <Money value={sum(r.lines.map((l) => toBaisa(l.debit)))} /> },
            { key: "st", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "JournalStatus", r.status)}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
