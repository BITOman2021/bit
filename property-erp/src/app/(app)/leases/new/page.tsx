import { redirect } from "next/navigation";
import { createLeaseAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { sp, type SP } from "../../_lib/guard";
import { LeaseFields } from "../lease-form";
import { leaseFormOptions } from "../options";

export default async function NewLease({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("lease.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const opts = await leaseFormOptions(ctx, L);
  return (
    <>
      <PageHeader title={L("عقد إيجار جديد (مسودة)", "New lease (draft)")} subtitle={L("يُحفظ كمسودة، ثم يُعتمد لتوليد جدول الاستحقاقات", "Saved as draft; approval generates the payment schedule")} back={{ href: "/leases", label: t.nav.leases }} />
      <Card>
        <ActionForm action={createLeaseAction} submitLabel={L("حفظ المسودة", "Save draft")} pendingLabel={t.common.saving}>
          <LeaseFields t={t} L={L} v={{ unitId: q.unitId, tenantId: q.tenantId }} {...opts} />
        </ActionForm>
      </Card>
    </>
  );
}
