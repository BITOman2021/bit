import { redirect } from "next/navigation";
import { saveUserAction } from "@/app/actions/ops";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { userOptions } from "../opts";
import { UserFields } from "../user-form";

export default async function NewUser() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("user.manage")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const o = await userOptions(ctx);
  return (
    <>
      <PageHeader title={L("مستخدم جديد", "New user")} back={{ href: "/admin/users", label: t.nav.users }} />
      <Card><ActionForm action={saveUserAction} submitLabel={t.common.create}><UserFields t={t} L={L} {...o} isNew locale={locale} /></ActionForm></Card>
    </>
  );
}
