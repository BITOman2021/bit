import Link from "next/link";
import { archiveUnitAction, createInspectionAction, updateUnitAction } from "@/app/actions/core";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionButton, ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, DescList, Empty, Grid, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getUnit } from "@/server/services/properties";
import { load } from "../../_lib/guard";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const u = await load(getUnit(ctx, id));
  const active = u.leases.find((l) => l.status === "ACTIVE");
  const canWrite = ctx.permissions.has("property.write");
  return (
    <>
      <PageHeader
        title={`${u.property.name} — ${u.unitNumber}`}
        subtitle={<Badge status={u.status}>{label(t, "UnitStatus", u.status)}</Badge>}
        back={{ href: `/properties/${u.propertyId}?tab=units`, label: u.property.name }}
        actions={
          <>
            {!active && ctx.permissions.has("lease.write") && <Link href={`/leases/new?unitId=${u.id}`} className="btn-primary">+ {L("عقد جديد", "New lease")}</Link>}
            {ctx.permissions.has("maintenance.write") && <Link href={`/maintenance/requests/new?propertyId=${u.propertyId}&unitId=${u.id}`} className="btn-secondary">{L("طلب صيانة", "Maintenance request")}</Link>}
            {canWrite && <ActionButton action={archiveUnitAction} fields={{ id }} label={t.common.archive} className="btn-ghost" confirmText={t.common.areYouSure} />}
          </>
        }
      />
      <div className="space-y-4">
        <Grid cols={2}>
          <Card title={t.common.details}>
            <DescList
              items={[
                { label: L("المبنى / الطابق", "Building / floor"), value: `${u.building?.name ?? "—"} / ${u.floor ? (u.floor.name ?? u.floor.number) : "—"}` },
                { label: t.common.type, value: label(t, "UnitType", u.type) },
                { label: L("المساحة", "Area"), value: <span className="num">{u.area?.toString() ?? "—"} m²</span> },
                { label: L("الغرف / الحمامات", "Bedrooms / bathrooms"), value: <span className="num">{u.bedrooms ?? "—"} / {u.bathrooms ?? "—"}</span> },
                { label: L("الأثاث", "Furnishing"), value: label(t, "FurnishingStatus", u.furnishing) },
                { label: L("التجهيزات", "Fixtures"), value: u.fixtures },
                { label: L("عداد الكهرباء / المياه", "Electricity / water meter"), value: [u.electricityMeter, u.waterMeter].filter(Boolean).join(" / ") },
                { label: L("الإيجار المقترح", "Market rent"), value: <Money value={u.marketRent} currency /> },
              ]}
            />
          </Card>
          <Card title={L("المستأجر والعقد الحالي", "Current tenant & lease")}>
            {active ? (
              <DescList
                items={[
                  { label: t.common.tenant, value: <Link className="link" href={`/tenants/${active.tenant.id}`}>{active.tenant.name}</Link> },
                  { label: t.nav.leases, value: <Link className="link" href={`/leases/${active.id}`}>{active.number}</Link> },
                  { label: L("المدة", "Term"), value: <span className="num">{fmtDate(active.startDate)} → {fmtDate(active.endDate)}</span> },
                  { label: L("الإيجار الشهري", "Monthly rent"), value: <Money value={active.monthlyRent} currency /> },
                  { label: L("التأمين", "Deposit"), value: <Money value={active.depositAmount} currency /> },
                ]}
              />
            ) : (
              <Empty title={L("الوحدة غير مؤجرة حاليًا", "Unit is not currently leased")} />
            )}
          </Card>
        </Grid>
        <Card title={L("سجل المستأجرين والعقود", "Tenancy history")} bodyClassName="p-0">
          <DataTable
            rows={u.leases}
            rowKey={(l) => l.id}
            empty={<Empty title={t.common.empty} />}
            cols={[
              { key: "n", label: t.nav.leases, primary: true, render: (l) => <Link className="link" href={`/leases/${l.id}`}>{l.number}</Link> },
              { key: "t", label: t.common.tenant, render: (l) => l.tenant.name },
              { key: "p", label: t.common.period, render: (l) => <span className="num">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</span> },
              { key: "r", label: L("الإيجار", "Rent"), render: (l) => <Money value={l.monthlyRent} /> },
              { key: "s", label: t.common.status, render: (l) => <Badge status={l.status}>{label(t, "LeaseStatus", l.status)}</Badge> },
            ]}
          />
        </Card>
        <Grid cols={2}>
          <Card title={L("محاضر التسليم والاستلام", "Handover reports")}>
            {u.inspections.length === 0 ? <Empty title={t.common.empty} /> : (
              <ul className="space-y-2 text-sm">
                {u.inspections.map((i) => (
                  <li key={i.id} className="rounded-lg border border-line p-2">
                    <div className="flex justify-between"><Badge tone="blue">{label(t, "InspectionType", i.type)}</Badge><span className="num text-xs">{fmtDate(i.date)}</span></div>
                    <p className="mt-1">{i.condition}</p>
                    <p className="text-xs text-muted">{L("كهرباء", "Elec.")}: {i.electricityReading ?? "—"} · {L("مياه", "Water")}: {i.waterReading ?? "—"} · {L("مفاتيح", "Keys")}: {i.keysHandedOver ?? "—"}</p>
                  </li>
                ))}
              </ul>
            )}
            {(canWrite || ctx.permissions.has("lease.write")) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-navy-700">+ {L("محضر جديد", "New report")}</summary>
                <ActionForm action={createInspectionAction} submitLabel={t.common.save} resetOnSuccess className="mt-3">
                  <input type="hidden" name="unitId" value={u.id} />
                  {active && <input type="hidden" name="leaseId" value={active.id} />}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select name="type" label={t.common.type} options={enumOptions(t, "InspectionType")} required />
                    <Input name="date" type="date" label={t.common.date} required />
                    <Textarea name="condition" label={L("حالة الوحدة", "Condition")} required className="sm:col-span-2" />
                    <Input name="electricityReading" label={L("قراءة الكهرباء", "Electricity reading")} dir="ltr" />
                    <Input name="waterReading" label={L("قراءة المياه", "Water reading")} dir="ltr" />
                    <Input name="keysHandedOver" type="number" min={0} label={L("عدد المفاتيح", "Keys")} />
                    <Textarea name="notes" label={t.common.notes} />
                  </div>
                </ActionForm>
              </details>
            )}
          </Card>
          <DocumentsPanel ctx={ctx} t={t} L={L} where={{ unitId: u.id }} link={{ unitId: u.id }} categories={["PHOTO", "HANDOVER", "DRAWING", "OTHER"]} />
        </Grid>
        {canWrite && (
          <Card title={t.common.edit}>
            <ActionForm action={updateUnitAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="propertyId" value={u.propertyId} />
              {u.buildingId && <input type="hidden" name="buildingId" value={u.buildingId} />}
              {u.floorId && <input type="hidden" name="floorId" value={u.floorId} />}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input name="unitNumber" label={L("رقم الوحدة", "Unit number")} defaultValue={u.unitNumber} required />
                <Select name="type" label={t.common.type} options={enumOptions(t, "UnitType")} defaultValue={u.type} />
                <Select name="status" label={t.common.status} options={enumOptions(t, "UnitStatus", ["VACANT", "RESERVED", "UNDER_MAINTENANCE", "INACTIVE", "OCCUPIED"])} defaultValue={u.status} hint={L("حالة 'مؤجرة' تُدار تلقائيًا من العقود", "'Occupied' is managed by leases")} />
                <Input name="area" label={L("المساحة", "Area")} defaultValue={u.area?.toString()} inputMode="decimal" dir="ltr" />
                <Input name="bedrooms" type="number" label={L("الغرف", "Bedrooms")} defaultValue={u.bedrooms ?? undefined} />
                <Input name="bathrooms" type="number" label={L("الحمامات", "Bathrooms")} defaultValue={u.bathrooms ?? undefined} />
                <Select name="furnishing" label={L("الأثاث", "Furnishing")} options={enumOptions(t, "FurnishingStatus")} defaultValue={u.furnishing} />
                <MoneyInput name="marketRent" label={L("الإيجار المقترح", "Market rent")} defaultValue={u.marketRent?.toFixed(3)} />
                <Input name="electricityMeter" label={L("عداد الكهرباء", "Electricity meter")} defaultValue={u.electricityMeter ?? undefined} dir="ltr" />
                <Input name="waterMeter" label={L("عداد المياه", "Water meter")} defaultValue={u.waterMeter ?? undefined} dir="ltr" />
                <Textarea name="fixtures" label={L("الأثاث والتجهيزات", "Furniture & fixtures")} defaultValue={u.fixtures ?? undefined} />
                <Textarea name="notes" label={L("ملاحظات الصيانة", "Maintenance notes")} defaultValue={u.notes ?? undefined} />
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
