import { createPropertyAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { redirect } from "next/navigation";
import { PropertyFields } from "../property-form";

export default async function NewPropertyPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("property.write")) redirect("/forbidden");
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={L("عقار جديد", "New property")} back={{ href: "/properties", label: t.nav.properties }} />
      <Card>
        <ActionForm action={createPropertyAction} submitLabel={t.common.create} pendingLabel={t.common.saving}>
          <PropertyFields t={t} L={L} />
        </ActionForm>
      </Card>
    </>
  );
}
