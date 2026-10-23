import Link from "next/link";
import { deleteDraftJournalAction, postJournalAction, reverseJournalAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Alert, Badge, Card, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { getJournal } from "@/server/services/banking";
import { load } from "../../../_lib/guard";

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L, locale } = await getT();
  const e = await load(getJournal(ctx, id));
  const dr = sum(e.lines.map((l) => toBaisa(l.debit)));
  const cr = sum(e.lines.map((l) => toBaisa(l.credit)));
  const canWrite = ctx.permissions.has("journal.write");
  return (
    <>
      <PageHeader
        title={`${L("قيد", "Entry")} ${e.number}`}
        subtitle={<span className="flex flex-wrap gap-2"><Badge status={e.status}>{label(t, "JournalStatus", e.status)}</Badge><Badge tone="blue">{label(t, "JournalSource", e.source)}</Badge><span className="num">{fmtDate(e.date)}</span></span>}
        back={{ href: "/finance/journal", label: t.nav.journal }}
        actions={
          canWrite && (
            <>
              {e.status === "DRAFT" && <ActionButton action={postJournalAction} fields={{ id }} label={L("ترحيل", "Post")} className="btn-gold" confirmText={L("بعد الترحيل لا يمكن التعديل. متابعة؟", "Cannot edit after posting. Continue?")} />}
              {e.status === "DRAFT" && <ActionButton action={deleteDraftJournalAction} fields={{ id }} label={L("حذف المسودة", "Delete draft")} className="btn-ghost" confirmText={t.common.areYouSure} />}
              {e.status === "POSTED" && e.source === "MANUAL" && !e.reversedBy && !e.reversesId && <ActionButton action={reverseJournalAction} fields={{ id }} label={L("قيد عكسي", "Reverse")} className="btn-danger btn-sm" askReason={L("سبب العكس", "Reversal reason")} />}
            </>
          )
        }
      />
      {e.reversedBy && <div className="mb-3"><Alert tone="warning">{L("هذا القيد معكوس بالقيد", "Reversed by")} <Link className="link" href={`/finance/journal/${e.reversedBy.id}`}>{e.reversedBy.number}</Link></Alert></div>}
      {e.reverses && <div className="mb-3"><Alert>{L("قيد عكسي للقيد", "Reversal of")} <Link className="link" href={`/finance/journal/${e.reverses.id}`}>{e.reverses.number}</Link></Alert></div>}
      <Card title={e.memo} bodyClassName="p-0 overflow-x-auto">
        <table className="dtable">
          <thead><tr><th>#</th><th>{L("الحساب", "Account")}</th><th>{t.common.description}</th><th className="text-end">{L("مدين", "Debit")}</th><th className="text-end">{L("دائن", "Credit")}</th></tr></thead>
          <tbody>
            {e.lines.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.lineNo}</td>
                <td><span className="num">{l.account.code}</span> {locale === "ar" ? l.account.nameAr : l.account.nameEn}</td>
                <td className="text-muted">{l.description}</td>
                <td className="text-end"><Money value={l.debit} /></td>
                <td className="text-end"><Money value={l.credit} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-navy-50 font-bold">
            <tr><td colSpan={3}>{dr === cr ? L("متوازن ✓", "Balanced ✓") : L("غير متوازن ✗", "Unbalanced ✗")}</td><td className="text-end"><Money value={dr} /></td><td className="text-end"><Money value={cr} /></td></tr>
          </tfoot>
        </table>
      </Card>
      <p className="mt-3 text-xs text-muted">{L("الترحيل", "Posted")}: {fmtDateTime(e.postedAt, locale, ctx.timezone)} · {e.sourceKey && <span className="num">{e.sourceKey}</span>}</p>
    </>
  );
}
