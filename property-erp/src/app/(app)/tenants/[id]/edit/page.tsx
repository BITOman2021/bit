import { redirect } from "next/navigation";
import { updateTenantAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { getTenant } from "@/server/services/tenants";
import { load } from "../../../_lib/guard";
import { TenantFields } from "../../tenant-form";

export default async function EditTenant({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("tenant.write")) redirect("/forbidden");
  const { id } = await params;
  const { t, L } = await getT();
  const tn = await load(getTenant(ctx, id));
  return (
    <>
      <PageHeader title={`${t.common.edit}: ${tn.name}`} back={{ href: `/tenants/${id}`, label: tn.name }} />
      <Card>
        <ActionForm action={updateTenantAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <input type="hidden" name="id" value={id} />
          <TenantFields t={t} L={L} v={tn as unknown as Record<string, unknown>} canSensitive={ctx.permissions.has("tenant.sensitive")} />
        </ActionForm>
      </Card>
    </>
  );
}
