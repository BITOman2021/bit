import { redirect } from "next/navigation";
import { createJournalAction } from "@/app/actions/ops";
import { ActionForm, Checkbox, Input } from "@/components/ui/form";
import { Alert, Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listActiveAccounts } from "@/server/services/banking";
import { listProperties } from "@/server/services/properties";

export default async function NewJournal() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("journal.write")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const [accounts, props] = await Promise.all([listActiveAccounts(ctx), listProperties(ctx)]);
  return (
    <>
      <PageHeader title={L("قيد يومية يدوي", "Manual journal entry")} back={{ href: "/finance/journal", label: t.nav.journal }} />
      <Card>
        <ActionForm action={createJournalAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
            <Input name="memo" label={L("البيان", "Memo")} required className="sm:col-span-2" />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="dtable min-w-[720px]">
              <thead><tr><th>{L("الحساب", "Account")}</th><th>{L("مدين", "Debit")}</th><th>{L("دائن", "Credit")}</th><th>{t.common.property}</th><th>{t.common.description}</th></tr></thead>
              <tbody>
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td>
                      <select name="accountId[]" className="input" aria-label={L("الحساب", "Account")} defaultValue="">
                        <option value="">—</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {locale === "ar" ? a.nameAr : a.nameEn}</option>)}
                      </select>
                    </td>
                    <td><input name="debit[]" className="input" inputMode="decimal" dir="ltr" placeholder="0.000" aria-label={L("مدين", "Debit")} /></td>
                    <td><input name="credit[]" className="input" inputMode="decimal" dir="ltr" placeholder="0.000" aria-label={L("دائن", "Credit")} /></td>
                    <td>
                      <select name="linePropertyId[]" className="input" aria-label={t.common.property} defaultValue="">
                        <option value="">—</option>
                        {props.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                      </select>
                    </td>
                    <td><input name="lineDesc[]" className="input" aria-label={t.common.description} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-3">
            <Checkbox name="post" label={L("ترحيل مباشرة", "Post immediately")} hint={L("القيد المرحّل لا يُعدّل؛ التصحيح بقيد عكسي فقط", "Posted entries are immutable; correct with a reversal")} />
            <Alert>{L("يجب أن يتساوى مجموع المدين مع مجموع الدائن. يُرفض القيد غير المتوازن على مستوى التطبيق وقاعدة البيانات.", "Debits must equal credits; unbalanced entries are rejected by the app and the database.")}</Alert>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
