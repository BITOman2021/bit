import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, FilterBar, FilterDate, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listAudit } from "@/server/services/users";
import { sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("audit.read")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const page = Math.max(1, Number(q.page) || 1);
  const r = await listAudit(ctx, { ...q, page });
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;
  return (
    <>
      <PageHeader title={t.nav.audit} subtitle={L(`${r.total} سجل — غير قابل للتعديل أو الحذف`, `${r.total} entries — immutable`)} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/admin/audit" q={q.q} searchLabel={L("الإجراء، الملخص، معرّف السجل", "Action, summary, record id")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
        </FilterBar>
        {r.rows.length === 0 ? <Empty title={t.common.empty} /> : (
          <ul className="divide-y divide-line">
            {r.rows.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-xs text-muted">{fmtDateTime(a.createdAt, locale, ctx.timezone)}</span>
                  <Badge tone={a.action.includes("fail") || a.action.includes("void") || a.action.includes("reject") ? "red" : "blue"}>{a.action}</Badge>
                  <span className="font-semibold">{a.userName}</span>
                  <span className="text-muted">{a.entityType}</span>
                  {a.ip && <span className="num text-xs text-muted">{a.ip}</span>}
                </div>
                {a.summary && <p className="mt-0.5">{a.summary}</p>}
                {(a.before || a.after) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-navy-700">{L("قبل / بعد", "Before / after")}</summary>
                    <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2" dir="ltr">
                      <pre className="max-h-48 overflow-auto rounded bg-navy-50 p-2 text-[11px]">{JSON.stringify(a.before, null, 1)}</pre>
                      <pre className="max-h-48 overflow-auto rounded bg-navy-50 p-2 text-[11px]">{JSON.stringify(a.after, null, 1)}</pre>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between border-t border-line p-3 text-sm">
          {page > 1 ? <Link className="link" href={qs(page - 1)}>‹ {L("السابق", "Prev")}</Link> : <span />}
          <span className="num">{page} / {Math.max(1, r.pages)}</span>
          {page < r.pages ? <Link className="link" href={qs(page + 1)}>{L("التالي", "Next")} ›</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
