import Link from "next/link";
import { addQuoteAction, cancelWorkOrderAction, closeWorkOrderAction, completeWorkOrderAction, planWorkOrderAction, selectQuoteAction, startWorkOrderAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionButton, ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, DescList, Grid, Money, PageHeader, Stat } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getWorkOrder } from "@/server/services/maintenance";
import { load } from "../../../_lib/guard";
import { maintenanceOptions } from "../../opts";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const w = await load(getWorkOrder(ctx, id));
  const isManager = ctx.permissions.has("maintenance.write");
  const isAssignee = w.assignedToId === ctx.userId;
  const o = isManager ? await maintenanceOptions(ctx) : null;
  const open = !["COMPLETED", "CLOSED", "CANCELLED"].includes(w.status);
  const awaitingCost = !!w.estimatedCost && !w.costApprovedAt;
  return (
    <>
      <PageHeader
        title={`${w.number} — ${w.title}`}
        subtitle={<span className="flex flex-wrap gap-2"><Badge status={w.status}>{label(t, "WorkOrderStatus", w.status)}</Badge><Badge status={w.priority}>{label(t, "Priority", w.priority)}</Badge><Badge tone="blue">{label(t, "MaintenanceType", w.type)}</Badge></span>}
        back={{ href: "/maintenance/work-orders", label: t.nav.workOrders }}
        actions={
          <>
            {["OPEN", "ASSIGNED"].includes(w.status) && (isManager || isAssignee) && !awaitingCost && <ActionButton action={startWorkOrderAction} fields={{ id }} label={L("بدء التنفيذ", "Start work")} className="btn-gold" />}
            {isManager && open && <ActionButton action={cancelWorkOrderAction} fields={{ id }} label={t.common.cancel} className="btn-ghost" askReason={t.common.reason} />}
            {isManager && ctx.permissions.has("invoice.write") && <Link className="btn-secondary" href={`/finance/invoices/new?workOrderId=${id}&propertyId=${w.propertyId}${w.vendorId ? `&vendorId=${w.vendorId}` : ""}`}>{L("فاتورة مرتبطة", "Linked bill")}</Link>}
          </>
        }
      />
      {awaitingCost && <div className="mb-4"><Alert tone="warning">{L("تقدير التكلفة بانتظار الاعتماد قبل بدء العمل.", "Cost estimate awaiting approval before work can start.")}</Alert></div>}
      <Grid cols={3}>
        <Stat label={L("التقدير", "Estimate")} value={<Money value={w.estimatedCost} />} hint={w.costApprovedAt ? L("معتمد ✓", "Approved ✓") : undefined} />
        <Stat label={L("تكلفة داخلية (عمالة+مواد)", "Internal (labour+materials)")} value={<Money value={w.internalCost} />} />
        <Stat label={L("فواتير/مصروفات مرحّلة", "Posted bills/expenses")} tone="gold" value={<Money value={w.postedCosts} />} />
      </Grid>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t.common.details}>
          <DescList
            items={[
              { label: t.common.property, value: <Link className="link" href={`/properties/${w.propertyId}`}>{w.property?.code} {w.property?.name}</Link> },
              { label: t.common.unit, value: w.unit?.unitNumber },
              { label: L("الأصل", "Asset"), value: w.asset ? <Link className="link" href={`/maintenance/assets/${w.asset.id}`}>{w.asset.tag} {w.asset.name}</Link> : "—" },
              { label: t.common.category, value: label(t, "MaintenanceCategory", w.category) },
              { label: L("الفني", "Technician"), value: w.assignee?.name },
              { label: t.common.vendor, value: w.vendor ? <Link className="link" href={`/vendors/${w.vendor.id}`}>{w.vendor.name}</Link> : "—" },
              { label: L("الموعد / النهائي", "Scheduled / due"), value: <span className="num">{fmtDate(w.scheduledDate)} / {fmtDate(w.dueDate)}</span> },
              { label: L("طلب الصيانة", "Request"), value: w.request ? <Link className="link" href={`/maintenance/requests/${w.request.id}`}>{w.request.number}</Link> : w.schedule ? `${L("خطة وقائية", "Preventive plan")}: ${w.schedule.name}` : "—" },
              { label: L("ساعات العمل", "Labour hours"), value: w.laborHours?.toString() },
              { label: L("الضمان حتى", "Warranty until"), value: fmtDate(w.warrantyUntil) },
              { label: L("تقييم الجودة", "Quality rating"), value: w.qualityRating ? "★".repeat(w.qualityRating) + "☆".repeat(5 - w.qualityRating) : "—" },
            ]}
          />
          {w.description && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm">{w.description}</p>}
          {w.completionReport && <div className="mt-4"><h3 className="text-sm font-bold">{L("تقرير الإنجاز", "Completion report")}</h3><p className="whitespace-pre-wrap text-sm">{w.completionReport}</p></div>}
          {w.materials.length > 0 && (
            <table className="dtable mt-3">
              <thead><tr><th>{L("المادة", "Material")}</th><th>{L("الكمية", "Qty")}</th><th className="text-end">{t.common.total}</th></tr></thead>
              <tbody>{w.materials.map((m) => <tr key={m.id}><td>{m.description}</td><td className="num">{m.quantity.toString()}</td><td className="text-end"><Money value={m.lineTotal} /></td></tr>)}</tbody>
            </table>
          )}
        </Card>

        <div className="space-y-4">
          {isManager && open && o && (
            <Card title={L("التخطيط والتعيين", "Plan & assign")}>
              <ActionForm action={planWorkOrderAction} submitLabel={t.common.save}>
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select name="assignedToId" label={L("الفني", "Technician")} options={o.techs} defaultValue={w.assignedToId ?? undefined} placeholder={t.common.none} />
                  <Select name="vendorId" label={t.common.vendor} options={o.vendors} defaultValue={w.vendorId ?? undefined} placeholder={t.common.none} />
                  <Input name="scheduledDate" type="date" label={L("موعد التنفيذ", "Scheduled")} defaultValue={w.scheduledDate ? fmtDate(w.scheduledDate) : undefined} />
                  <Input name="dueDate" type="date" label={L("الموعد النهائي", "Due")} defaultValue={w.dueDate ? fmtDate(w.dueDate) : undefined} />
                  <MoneyInput name="estimatedCost" label={L("التكلفة التقديرية", "Estimate")} defaultValue={w.estimatedCost?.toFixed(3)} hint={L("تغيير التقدير يعيد طلب الاعتماد", "Changing it re-requests approval")} />
                  <Select name="priority" label={L("الأولوية", "Priority")} options={enumOptions(t, "Priority")} defaultValue={w.priority} />
                </div>
              </ActionForm>
            </Card>
          )}
          {(isManager || isAssignee) && ["IN_PROGRESS", "ASSIGNED", "OPEN"].includes(w.status) && !awaitingCost && (
            <Card title={L("تسجيل الإنجاز", "Record completion")}>
              <ActionForm action={completeWorkOrderAction} submitLabel={L("إنجاز", "Complete")} submitClassName="btn-gold">
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Textarea name="completionReport" label={L("تقرير الإنجاز", "Completion report")} required className="sm:col-span-3" />
                  <Input name="laborHours" label={L("ساعات العمل", "Hours")} inputMode="decimal" dir="ltr" />
                  <MoneyInput name="laborCost" label={L("تكلفة العمالة", "Labour cost")} />
                  <Input name="warrantyUntil" type="date" label={L("ضمان العمل حتى", "Warranty until")} />
                </div>
                <p className="mb-1 mt-3 text-sm font-semibold">{L("قطع الغيار والمواد", "Parts & materials")}</p>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mb-2 grid grid-cols-6 gap-2">
                    <input name="matDesc[]" className="input col-span-3" placeholder={L("الوصف", "Description")} aria-label={L("الوصف", "Description")} />
                    <input name="matQty[]" className="input" placeholder={L("الكمية", "Qty")} inputMode="decimal" dir="ltr" aria-label={L("الكمية", "Qty")} />
                    <input name="matCost[]" className="input col-span-2" placeholder={L("سعر الوحدة", "Unit cost")} inputMode="decimal" dir="ltr" aria-label={L("سعر الوحدة", "Unit cost")} />
                  </div>
                ))}
                <p className="text-xs text-muted">{L("صور قبل/بعد: ارفعها من قسم المستندات أدناه (يدعم الكاميرا على الهاتف).", "Before/after photos: upload in Documents below (camera supported on phones).")}</p>
              </ActionForm>
            </Card>
          )}
          {isManager && w.status === "COMPLETED" && (
            <Card title={L("اعتماد الإغلاق وتقييم الجودة", "Approve closure & rate quality")}>
              <ActionForm action={closeWorkOrderAction} submitLabel={L("اعتماد الإغلاق", "Approve closure")}>
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select name="qualityRating" label={L("التقييم", "Rating")} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))} required />
                  <Input name="note" label={t.common.notes} />
                </div>
              </ActionForm>
            </Card>
          )}
          {isManager && (
            <Card title={L("عروض الأسعار ومقارنتها", "Quotes & comparison")}>
              {w.quotes.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm">
                  {[...w.quotes].sort((a, b) => Number(a.amount) - Number(b.amount)).map((qt, i) => (
                    <li key={qt.id} className="flex items-center gap-2">
                      {i === 0 && <Badge tone="green">{L("الأقل", "Lowest")}</Badge>}
                      <span className="flex-1">{qt.vendor.name} {qt.reference && <span className="num text-xs text-muted">({qt.reference})</span>}</span>
                      <Money value={qt.amount} />
                      {qt.isSelected ? <Badge tone="gold">{L("مختار", "Selected")}</Badge> : open && <ActionButton action={selectQuoteAction} fields={{ id: qt.id }} label={L("اختيار", "Select")} className="btn-ghost btn-sm" />}
                    </li>
                  ))}
                </ul>
              )}
              {open && o && ctx.permissions.has("vendor.write") && (
                <ActionForm action={addQuoteAction} submitLabel={t.common.add} resetOnSuccess>
                  <input type="hidden" name="workOrderId" value={id} />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <Select name="vendorId" label={t.common.vendor} options={o.vendors} required />
                    <MoneyInput name="amount" label={t.common.amount} required />
                    <Input name="reference" label={t.common.reference} />
                    <Input name="validUntil" type="date" label={L("صالح حتى", "Valid until")} />
                  </div>
                </ActionForm>
              )}
            </Card>
          )}
          {(w.invoices.length > 0 || w.expenses.length > 0) && (
            <Card title={L("الفواتير والمصروفات المرتبطة", "Linked bills & expenses")}>
              <ul className="space-y-1 text-sm">
                {w.invoices.map((i) => <li key={i.id} className="flex justify-between"><Link className="link num" href={`/finance/invoices/${i.id}`}>{i.number}</Link><Badge status={i.status}>{label(t, "DocumentStatus", i.status)}</Badge><Money value={i.total} /></li>)}
                {w.expenses.map((e) => <li key={e.id} className="flex justify-between"><span className="num">{e.number}</span><Badge status={e.status}>{label(t, "DocumentStatus", e.status)}</Badge><Money value={e.total} /></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <div className="mt-4">
        <DocumentsPanel ctx={ctx} t={t} L={L} where={{ workOrderId: id }} link={{ workOrderId: id }} categories={["PHOTO", "INVOICE", "QUOTATION", "WARRANTY", "HANDOVER", "OTHER"]} />
      </div>
    </>
  );
}
