import { redirect } from "next/navigation";
import { updateLeaseAction } from "@/app/actions/core";
import { ActionForm, Input } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { getLease } from "@/server/services/leases";
import { load } from "../../../_lib/guard";
import { LeaseFields } from "../../lease-form";
import { leaseFormOptions } from "../../options";

export default async function EditLease({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("lease.write")) redirect("/forbidden");
  const { id } = await params;
  const { t, L } = await getT();
  const lease = await load(getLease(ctx, id));
  if (lease.status !== "DRAFT") redirect(`/leases/${id}`);
  const opts = await leaseFormOptions(ctx, L);
  return (
    <>
      <PageHeader title={`${t.common.edit}: ${lease.number}`} back={{ href: `/leases/${id}`, label: lease.number }} />
      <Card>
        <ActionForm action={updateLeaseAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <input type="hidden" name="id" value={id} />
          <LeaseFields t={t} L={L} v={lease as unknown as Record<string, unknown>} {...opts} />
          <Input name="changeReason" label={L("سبب التعديل (يُحفظ في سجل النسخ)", "Reason for change (kept in version history)")} className="mt-4" />
        </ActionForm>
      </Card>
    </>
  );
}
