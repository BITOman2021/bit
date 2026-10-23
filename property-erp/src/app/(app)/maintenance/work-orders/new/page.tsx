import { redirect } from "next/navigation";
import { createWorkOrderAction } from "@/app/actions/ops";
import { ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { sp, type SP } from "../../../_lib/guard";
import { maintenanceOptions } from "../../opts";

export default async function NewWorkOrder({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("maintenance.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const o = await maintenanceOptions(ctx);
  const req = q.requestId ? await prisma.maintenanceRequest.findFirst({ where: { id: q.requestId, organizationId: ctx.orgId } }) : null;
  return (
    <>
      <PageHeader title={L("أمر عمل جديد", "New work order")} subtitle={req ? `${req.number} — ${req.title}` : undefined} back={{ href: "/maintenance/work-orders", label: t.nav.workOrders }} />
      <Card>
        <ActionForm action={createWorkOrderAction} submitLabel={t.common.create} pendingLabel={t.common.saving}>
          {req && <input type="hidden" name="requestId" value={req.id} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select name="propertyId" label={t.common.property} options={o.props} defaultValue={req?.propertyId} required placeholder={t.common.select} />
            <Select name="unitId" label={t.common.unit} options={o.units} defaultValue={req?.unitId ?? undefined} placeholder={t.common.none} />
            <Select name="assetId" label={L("الأصل", "Asset")} options={o.assets} defaultValue={req?.assetId ?? undefined} placeholder={t.common.none} />
            <Select name="category" label={t.common.category} options={enumOptions(t, "MaintenanceCategory")} defaultValue={req?.category} required />
            <Select name="priority" label={L("الأولوية", "Priority")} options={enumOptions(t, "Priority")} defaultValue={req?.priority ?? "MEDIUM"} />
            <Select name="type" label={t.common.type} options={enumOptions(t, "MaintenanceType")} defaultValue={req?.type ?? "CORRECTIVE"} />
            <Input name="title" label={L("العنوان", "Title")} defaultValue={req?.title} required className="sm:col-span-2 lg:col-span-3" />
            <Textarea name="description" label={t.common.description} defaultValue={req?.description} className="sm:col-span-2 lg:col-span-3" />
            <Select name="assignedToId" label={L("الفني", "Technician")} options={o.techs} placeholder={t.common.none} />
            <Select name="vendorId" label={L("المقاول / المورد", "Contractor / vendor")} options={o.vendors} placeholder={t.common.none} />
            <MoneyInput name="estimatedCost" label={L("التكلفة التقديرية", "Estimated cost")} hint={L("فوق الحد المحدد تتطلب اعتمادًا قبل البدء", "Above threshold requires approval before work")} />
            <Input name="scheduledDate" type="date" label={L("موعد التنفيذ", "Scheduled date")} />
            <Input name="dueDate" type="date" label={L("الموعد النهائي", "Due date")} />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
