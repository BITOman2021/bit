import { redirect } from "next/navigation";
import { createOwnerAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { OwnerFields } from "../owner-form";

export default async function NewOwner() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("owner.write")) redirect("/forbidden");
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={L("مالك جديد", "New owner")} back={{ href: "/owners", label: t.nav.owners }} />
      <Card>
        <ActionForm action={createOwnerAction} submitLabel={t.common.create} pendingLabel={t.common.saving}>
          <OwnerFields t={t} L={L} />
        </ActionForm>
      </Card>
    </>
  );
}
