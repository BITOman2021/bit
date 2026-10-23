import { saveReconciliationAction } from "@/app/actions/ops";
import { ActionForm, Checkbox } from "@/components/ui/form";
import { Badge, Card, Grid, Money, PageHeader, Stat } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getReconciliation } from "@/server/services/banking";
import { load } from "../../../../_lib/guard";

export default async function ReconcilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const d = await load(getReconciliation(ctx, id));
  const done = d.reconciliation.status === "COMPLETED";
  return (
    <>
      <PageHeader title={`${L("تسوية", "Reconciliation")} — ${d.reconciliation.bankAccount.name}`} subtitle={<><span className="num">{fmtDate(d.reconciliation.statementDate)}</span> <Badge status={done ? "COMPLETED" : "IN_PROGRESS"}>{d.reconciliation.status}</Badge></>} back={{ href: "/finance/bank", label: t.nav.bank }} />
      <Grid cols={3}>
        <Stat label={L("رصيد الكشف", "Statement balance")} value={<Money value={d.reconciliation.statementBalance} />} />
        <Stat label={L("الرصيد المسوّى", "Cleared balance")} value={<Money value={d.clearedBalance} />} />
        <Stat label={L("الفرق", "Difference")} tone={d.difference === 0n ? "success" : "danger"} value={<Money value={d.difference} tone />} />
      </Grid>
      <Card className="mt-4" title={L("حدد الحركات الظاهرة في كشف البنك", "Tick transactions shown on the bank statement")}>
        <ActionForm action={saveReconciliationAction} submitLabel={t.common.save} hideSubmit={done}>
          <input type="hidden" name="id" value={id} />
          <ul className="divide-y divide-line">
            {d.lines.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="checkbox" name="lineId[]" value={l.id} defaultChecked={l.reconciliationId === id} disabled={done} className="h-5 w-5 accent-navy-900" />
                  <span className="num w-24">{fmtDate(l.entry.date)}</span>
                  <span className="num w-36 text-xs">{l.entry.number}</span>
                  <span className="flex-1 truncate">{l.description ?? l.entry.memo}</span>
                  <Money value={Number(l.debit) > 0 ? l.debit : `-${l.credit}`} tone />
                </label>
              </li>
            ))}
          </ul>
          {!done && <div className="mt-3"><Checkbox name="complete" label={L("إكمال التسوية (يتطلب فرقًا صفريًا)", "Complete reconciliation (difference must be zero)")} /></div>}
        </ActionForm>
      </Card>
    </>
  );
}
