import Link from "next/link";
import { voidExpenseAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Alert, Badge, Card, DataTable, Empty, FilterBar, FilterDate, FilterSelect, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listExpenseCategories, listExpenses } from "@/server/services/purchasing";
import { listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const [rows, props, cats] = await load(Promise.all([listExpenses(ctx, q), listProperties(ctx), listExpenseCategories(ctx)]));
  const posted = sum(rows.filter((r) => r.status === "POSTED").map((r) => toBaisa(r.total)));
  return (
    <>
      <PageHeader title={t.nav.expenses} subtitle={<>{L("المرحّل في النتائج", "Posted in results")}: <Money value={posted} currency /></>} actions={ctx.permissions.has("expense.write") && <Link href="/finance/expenses/new" className="btn-primary">+ {L("مصروف جديد", "New expense")}</Link>} />
      {q.ok && <div className="mb-4"><Alert tone="success">{L("تم حفظ المصروف (يُرحّل فورًا أو بعد الاعتماد إذا تجاوز الحد).", "Expense saved (posted now, or after approval if above threshold).")}</Alert></div>}
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/finance/expenses" q={q.q} searchLabel={t.common.search} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
          <FilterSelect name="categoryId" label={t.common.category} value={q.categoryId} options={cats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn }))} allLabel={t.common.all} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "DocumentStatus", ["POSTED", "PENDING_APPROVAL", "VOID", "REJECTED"])} allLabel={t.common.all} />
        </FilterBar>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.reference, primary: true, render: (r) => <span className="num text-xs font-semibold">{r.number}</span> },
            { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.date)}</span> },
            { key: "x", label: t.common.description, render: (r) => r.description },
            { key: "c", label: t.common.category, render: (r) => (locale === "ar" ? r.category.nameAr : r.category.nameEn) + (r.isCapital ? " · CAPEX" : "") },
            { key: "v", label: t.common.vendor, hideOnMobile: true, render: (r) => r.vendor?.name ?? "—" },
            { key: "a", label: t.common.total, align: "end", render: (r) => <Money value={r.total} /> },
            { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "DocumentStatus", r.status)}</Badge> },
            { key: "act", label: "", hideOnMobile: true, render: (r) => ctx.permissions.has("expense.write") && r.status !== "VOID" && r.status !== "REJECTED" && <ActionButton action={voidExpenseAction} fields={{ id: r.id }} label={t.common.void} className="btn-ghost btn-sm" askReason={t.common.reason} /> },
          ]}
        />
      </Card>
    </>
  );
}
