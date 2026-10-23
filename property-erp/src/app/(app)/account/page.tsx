import { changePasswordAction } from "@/app/actions/ops";
import { ActionForm, Input } from "@/components/ui/form";
import { Card, DescList, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={t.nav.account} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t.common.details}>
          <DescList items={[{ label: t.common.name, value: ctx.userName }, { label: t.common.email, value: ctx.email }, { label: L("الدور", "Role"), value: ctx.roleKey }, { label: L("نطاق العقارات", "Property scope"), value: ctx.propertyIds === null ? L("كل العقارات", "All properties") : `${ctx.propertyIds.length}` }]} />
        </Card>
        <Card title={t.auth.changePassword}>
          <ActionForm action={changePasswordAction} submitLabel={t.common.save}>
            <div className="space-y-3">
              <Input name="current" type="password" label={t.auth.currentPassword} required dir="ltr" autoComplete="current-password" />
              <Input name="next" type="password" label={t.auth.newPassword} required dir="ltr" minLength={10} hint={t.auth.passwordHint} autoComplete="new-password" />
              <Input name="next2" type="password" label={`${t.auth.newPassword} (2)`} required dir="ltr" autoComplete="new-password" />
            </div>
            <p className="mt-2 text-xs text-muted">{L("سيتم إنهاء جميع جلساتك بعد التغيير.", "All your sessions will be signed out.")}</p>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
