import { notFound, redirect } from "next/navigation";
import { revokeSessionsAction, saveUserAction } from "@/app/actions/ops";
import { ActionButton, ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { userOptions } from "../opts";
import { UserFields } from "../user-form";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("user.manage")) redirect("/forbidden");
  const { id } = await params;
  const { t, L, locale } = await getT();
  const u = await prisma.user.findFirst({ where: { id, organizationId: ctx.orgId }, include: { propertyAccess: true, tenant: { select: { id: true } }, owner: { select: { id: true } } } });
  if (!u) notFound();
  const o = await userOptions(ctx);
  return (
    <>
      <PageHeader title={u.name} back={{ href: "/admin/users", label: t.nav.users }} actions={<ActionButton action={revokeSessionsAction} fields={{ id }} label={L("إنهاء كل الجلسات", "Revoke all sessions")} confirmText={t.common.areYouSure} />} />
      <Card>
        <ActionForm action={saveUserAction} submitLabel={t.common.save}>
          <input type="hidden" name="id" value={id} />
          <UserFields t={t} L={L} {...o} u={{ ...u, tenantId: u.tenant?.id, ownerId: u.owner?.id }} isNew={false} locale={locale} />
        </ActionForm>
      </Card>
    </>
  );
}
