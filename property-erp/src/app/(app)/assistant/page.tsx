import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { insights, searchAll } from "@/server/services/assistant";
import { sp, type SP } from "../_lib/guard";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("report.read")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [items, results] = await Promise.all([insights(ctx, L), q.q ? searchAll(ctx, q.q) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title={t.nav.assistant} subtitle={L("تحليلات من بيانات النظام فقط مع إظهار المصدر والفترة", "Insights from system data only, with source and period")} />
      <div className="mb-4">
        <Alert>
          {L(
            "المساعد يقترح ولا ينفذ: لا يصدر دفعات ولا يعدّل عقودًا ولا يحذف بيانات ولا يتخذ إجراءات قانونية. لا تُرسل أي بيانات لمزود ذكاء اصطناعي خارجي (غير مفعّل).",
            "The assistant suggests, never acts: no payments, lease changes, deletions or legal actions. No data is sent to any external AI provider (not enabled).",
          )}
        </Alert>
      </div>
      <Card title={L("بحث شامل", "Search")} className="mb-4">
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q.q} className="input" placeholder={L("ابحث بالعربية أو الإنجليزية: اسم مستأجر، رقم عقد، وحدة…", "Search: tenant, lease no., unit…")} type="search" />
          <button className="btn-primary">{t.common.search}</button>
        </form>
        {q.q && (
          <ul className="mt-3 divide-y divide-line">
            {results.length === 0 && <li className="py-2 text-sm text-muted">{L("لا نتائج ضمن صلاحياتك", "No results within your permissions")}</li>}
            {results.map((r) => <li key={r.href} className="flex gap-2 py-2 text-sm"><Badge tone="gray">{r.type}</Badge><Link className="link" href={r.href}>{r.title}</Link></li>)}
          </ul>
        )}
      </Card>
      {items.length === 0 ? (
        <Card><Empty title={L("لا توجد ملاحظات حاليًا", "Nothing needs attention right now")} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((i, idx) => (
            <Card key={idx}>
              <div className="flex items-start gap-2">
                <Badge tone={i.severity === "danger" ? "red" : i.severity === "warning" ? "amber" : "blue"}>{i.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i.link ? <Link href={i.link} className="hover:underline">{i.title}</Link> : i.title}</p>
                  <p className="mt-1 text-sm text-muted">{i.detail}</p>
                  <p className="mt-2 text-xs text-muted">{L("المصدر", "Source")}: {i.source} · {L("الفترة", "Period")}: <span className="num">{i.period}</span></p>
                  {i.draftMessage && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-navy-700">{L("مسودة رسالة مقترحة (للنسخ والمراجعة — لا تُرسل آليًا)", "Suggested draft (copy & review — never sent automatically)")}</summary>
                      <textarea readOnly className="input mt-2 text-sm" rows={6} defaultValue={i.draftMessage} />
                    </details>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
