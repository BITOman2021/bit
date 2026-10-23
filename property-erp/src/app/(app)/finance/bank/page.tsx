import Link from "next/link";
import { createBankAccountAction, startReconciliationAction } from "@/app/actions/ops";
import { ActionForm, Input, MoneyInput, Select } from "@/components/ui/form";
import { Badge, Card, Grid, Money, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { accountBalances } from "@/server/services/accounting";
import { listBankAccounts } from "@/server/services/banking";

export const metadata = { title: "Banks" };

export default async function BankPage() {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const [banks, balances] = await Promise.all([listBankAccounts(ctx), ctx.permissions.has("journal.read") ? accountBalances(ctx) : Promise.resolve([])]);
  const bal = new Map(balances.map((b) => [b.accountId, b.balance]));
  return (
    <>
      <PageHeader title={t.nav.bank} />
      <Grid cols={3}>
        {banks.map((b) => (
          <Card key={b.id} title={b.name}>
            <p className="text-xs text-muted">{b.bankName} {b.accountNumber && `· ${b.accountNumber}`} · GL {b.glAccount.code}</p>
            <p className="mt-2 text-xl font-bold"><Money value={bal.get(b.glAccountId) ?? 0n} currency /></p>
            <ul className="mt-3 space-y-1 text-sm">
              {b.reconciliations.map((r) => (
                <li key={r.id}><Link className="link num" href={`/finance/bank/reconcile/${r.id}`}>{fmtDate(r.statementDate)}</Link> <Badge status={r.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS"}>{r.status}</Badge></li>
              ))}
            </ul>
          </Card>
        ))}
      </Grid>
      <Grid cols={2}>
        {ctx.permissions.has("bank.reconcile") && (
          <Card title={L("بدء تسوية بنكية", "Start bank reconciliation")} className="mt-4">
            <ActionForm action={startReconciliationAction} submitLabel={L("بدء", "Start")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select name="bankAccountId" label={L("الحساب", "Account")} options={banks.map((b) => ({ value: b.id, label: b.name }))} required />
                <Input name="statementDate" type="date" label={L("تاريخ الكشف", "Statement date")} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
                <MoneyInput name="statementBalance" label={L("رصيد الكشف", "Statement balance")} required />
              </div>
            </ActionForm>
          </Card>
        )}
        {ctx.permissions.has("accounts.manage") && (
          <Card title={L("حساب بنكي جديد", "New bank account")} className="mt-4">
            <ActionForm action={createBankAccountAction} submitLabel={t.common.add} resetOnSuccess>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input name="name" label={t.common.name} required />
                <Input name="bankName" label={L("البنك", "Bank")} />
                <Input name="accountNumber" label={L("رقم الحساب", "Account no.")} dir="ltr" />
                <Input name="iban" label="IBAN" dir="ltr" />
                <Input name="code" label={L("رمز حساب الأستاذ (مثل 1120)", "GL code (e.g. 1120)")} required dir="ltr" />
              </div>
            </ActionForm>
          </Card>
        )}
      </Grid>
    </>
  );
}
