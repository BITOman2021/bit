import { redirect } from "next/navigation";
import { createRequestAction } from "@/app/actions/ops";
import { ActionForm, Input, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { sp, type SP } from "../../../_lib/guard";
import { maintenanceOptions } from "../../opts";

export default async function NewRequest({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("maintenance.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const o = await maintenanceOptions(ctx);
  return (
    <>
      <PageHeader title={L("طلب صيانة جديد", "New maintenance request")} back={{ href: "/maintenance/requests", label: t.nav.requests }} />
      <Card>
        <ActionForm action={createRequestAction} submitLabel={t.common.create} pendingLabel={t.common.saving}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select name="propertyId" label={t.common.property} options={o.props} defaultValue={q.propertyId} required placeholder={t.common.select} />
            <Select name="unitId" label={t.common.unit} options={o.units} defaultValue={q.unitId} placeholder={t.common.none} />
            <Select name="assetId" label={L("الأصل", "Asset")} options={o.assets} placeholder={t.common.none} />
            <Select name="category" label={t.common.category} options={enumOptions(t, "MaintenanceCategory")} required />
            <Select name="priority" label={L("الأولوية", "Priority")} options={enumOptions(t, "Priority")} defaultValue="MEDIUM" />
            <Select name="type" label={t.common.type} options={enumOptions(t, "MaintenanceType")} defaultValue="CORRECTIVE" />
            <Input name="title" label={L("العنوان", "Title")} required className="sm:col-span-2 lg:col-span-3" />
            <Textarea name="description" label={t.common.description} required className="sm:col-span-2 lg:col-span-3" />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
