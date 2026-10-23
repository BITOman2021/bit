import Link from "next/link";
import { createAccountAction, toggleAccountAction } from "@/app/actions/ops";
import { ActionButton, ActionForm, Input, Select } from "@/components/ui/form";
import { Badge, Card, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { accountBalances } from "@/server/services/accounting";
import { listAccounts } from "@/server/services/banking";
import { load } from "../../_lib/guard";

export const metadata = { title: "Chart of accounts" };

export default async function AccountsPage() {
  const ctx = await requireCtx();
  const { t, L, locale } = await getT();
  const [accounts, balances] = await load(Promise.all([listAccounts(ctx), accountBalances(ctx)]));
  const bal = new Map(balances.map((b) => [b.accountId, b.balance]));
  const canManage = ctx.permissions.has("accounts.manage");
  return (
    <>
      <PageHeader title={t.nav.accounts} actions={<Link className="btn-secondary" href="/reports/trial-balance">{L("ميزان المراجعة", "Trial balance")}</Link>} />
      <Card bodyClassName="p-0 overflow-x-auto">
        <table className="dtable">
          <thead><tr><th>{t.common.code}</th><th>{t.common.name}</th><th>{t.common.type}</th><th>{L("مفتاح النظام", "System key")}</th><th className="text-end">{t.common.balance}</th><th></th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.isActive ? "" : "opacity-50"}>
                <td className="num font-semibold">{a.code}</td>
                <td className={a.parentId ? "ps-8" : "font-bold"}>
                  <Link className="link" href={`/reports/account-movement?accountId=${a.id}`}>{locale === "ar" ? a.nameAr : a.nameEn}</Link>
                </td>
                <td>{label(t, "AccountType", a.type)}</td>
                <td className="num text-xs text-muted">{a.systemKey ?? ""}</td>
                <td className="text-end"><Money value={bal.get(a.id) ?? 0n} tone /></td>
                <td>{canManage && !a.systemKey && <ActionButton action={toggleAccountAction} fields={{ id: a.id }} label={a.isActive ? L("تعطيل", "Disable") : L("تفعيل", "Enable")} className="btn-ghost btn-sm" />}{!a.isActive && <Badge tone="gray">{L("معطل", "Inactive")}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {canManage && (
        <Card title={L("إضافة حساب", "Add account")} className="mt-4">
          <ActionForm action={createAccountAction} submitLabel={t.common.add} resetOnSuccess>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <Input name="code" label={t.common.code} required dir="ltr" inputMode="numeric" />
              <Input name="nameAr" label={L("الاسم بالعربية", "Arabic name")} required />
              <Input name="nameEn" label={L("الاسم بالإنجليزية", "English name")} required dir="ltr" />
              <Select name="type" label={t.common.type} options={enumOptions(t, "AccountType")} required />
              <Select name="parentId" label={L("الحساب الأب", "Parent")} placeholder={t.common.none} options={accounts.filter((a) => !a.parentId).map((a) => ({ value: a.id, label: `${a.code} ${locale === "ar" ? a.nameAr : a.nameEn}` }))} />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
