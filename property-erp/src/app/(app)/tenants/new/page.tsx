import { redirect } from "next/navigation";
import { createTenantAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { TenantFields } from "../tenant-form";

export default async function NewTenant() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("tenant.write")) redirect("/forbidden");
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={L("مستأجر جديد", "New tenant")} back={{ href: "/tenants", label: t.nav.tenants }} />
      <Card>
        <ActionForm action={createTenantAction} submitLabel={t.common.create} pendingLabel={t.common.saving}>
          <TenantFields t={t} L={L} canSensitive={ctx.permissions.has("tenant.sensitive")} />
        </ActionForm>
      </Card>
    </>
  );
}
