import { saveScheduleAction } from "@/app/actions/ops";
import { ActionForm, Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listSchedules } from "@/server/services/maintenance";
import { load } from "../../_lib/guard";
import { maintenanceOptions } from "../opts";

export const metadata = { title: "Preventive maintenance" };

export default async function SchedulesPage() {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const [rows, o] = await load(Promise.all([listSchedules(ctx), maintenanceOptions(ctx)]));
  const propName = new Map(o.props.map((p) => [p.value, p.label]));
  return (
    <>
      <PageHeader title={t.nav.schedules} subtitle={L("تُولّد أوامر العمل تلقائيًا قبل الموعد بعدد أيام التنبيه، دون تكرار.", "Work orders are generated ahead of the due date by lead days, never duplicated.")} />
      <Card bodyClassName="p-0">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "n", label: t.common.name, primary: true, render: (r) => r.name },
            { key: "p", label: t.common.property, render: (r) => propName.get(r.propertyId) ?? "—" },
            { key: "c", label: t.common.category, render: (r) => label(t, "MaintenanceCategory", r.category) },
            { key: "f", label: L("التكرار", "Every"), render: (r) => <span className="num">{r.interval} {label(t, "FrequencyUnit", r.frequencyUnit)}</span> },
            { key: "d", label: L("الاستحقاق القادم", "Next due"), render: (r) => <span className="num">{fmtDate(r.nextDueDate)}</span> },
            { key: "l", label: L("تنبيه قبل", "Lead days"), render: (r) => <span className="num">{r.leadDays}</span> },
            { key: "s", label: t.common.status, render: (r) => (r.isActive ? <Badge tone="green">{L("نشطة", "Active")}</Badge> : <Badge tone="gray">{L("متوقفة", "Paused")}</Badge>) },
          ]}
        />
      </Card>
      {ctx.permissions.has("maintenance.write") && (
        <Card title={L("خطة صيانة وقائية جديدة", "New preventive plan")} className="mt-4">
          <ActionForm action={saveScheduleAction} submitLabel={t.common.create} resetOnSuccess>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input name="name" label={t.common.name} required className="lg:col-span-2" />
              <Select name="propertyId" label={t.common.property} options={o.props} required placeholder={t.common.select} />
              <Select name="unitId" label={t.common.unit} options={o.units} placeholder={t.common.none} />
              <Select name="assetId" label={L("الأصل", "Asset")} options={o.assets} placeholder={t.common.none} />
              <Select name="category" label={t.common.category} options={enumOptions(t, "MaintenanceCategory")} required />
              <Input name="interval" type="number" min={1} label={L("كل", "Every")} defaultValue="1" required />
              <Select name="frequencyUnit" label={L("الوحدة", "Unit")} options={enumOptions(t, "FrequencyUnit")} defaultValue="MONTH" />
              <Input name="nextDueDate" type="date" label={L("أول استحقاق", "First due")} required />
              <Input name="leadDays" type="number" min={0} label={L("أيام التنبيه المسبق", "Lead days")} defaultValue="7" />
              <Select name="assignedToId" label={L("الفني", "Technician")} options={o.techs} placeholder={t.common.none} />
              <Select name="vendorId" label={t.common.vendor} options={o.vendors} placeholder={t.common.none} />
              <Textarea name="instructions" label={L("التعليمات", "Instructions")} className="lg:col-span-3" />
              <Checkbox name="isActive" label={L("نشطة", "Active")} defaultChecked />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
