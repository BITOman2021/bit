import Link from "next/link";
import { addVendorContractAction, saveVendorAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, Grid, Money, PageHeader, Stat, Tabs } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { sum, toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listProperties } from "@/server/services/properties";
import { getVendor } from "@/server/services/purchasing";
import { load, sp, type SP } from "../../_lib/guard";
import { VendorFields } from "../vendor-form";

export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const q = await sp(searchParams);
  const tab = q.tab ?? "overview";
  const { t, L } = await getT();
  const v = await load(getVendor(ctx, id));
  const payable = sum(v.invoices.filter((i) => ["POSTED", "PARTIALLY_PAID"].includes(i.status)).map((i) => toBaisa(i.total) - toBaisa(i.paidAmount)));
  const base = `/vendors/${id}`;
  return (
    <>
      <PageHeader title={v.name} subtitle={<span className="num">{v.code}</span>} back={{ href: "/vendors", label: t.nav.vendors }} actions={ctx.permissions.has("invoice.write") && <Link className="btn-primary" href={`/finance/invoices/new?vendorId=${id}`}>+ {L("فاتورة", "Bill")}</Link>} />
      <Grid cols={4}>
        <Stat label={L("المستحق للمورد", "Payable")} tone={payable > 0n ? "danger" : "default"} value={<Money value={payable} />} />
        <Stat label={L("التقييم", "Rating")} value={v.rating ? `★ ${Number(v.rating).toFixed(1)}` : "—"} />
        <Stat label={t.nav.workOrders} value={<span className="num">{v.workOrders.length}</span>} />
        <Stat label={L("العقود", "Contracts")} value={<span className="num">{v.contracts.length}</span>} />
      </Grid>
      <div className="mt-4" />
      <Tabs current={tab} tabs={[{ key: "overview", label: L("الأعمال والفواتير", "Work & bills"), href: base }, { key: "contracts", label: L("العقود والضمانات", "Contracts & warranties"), href: `${base}?tab=contracts` }, { key: "edit", label: t.common.edit, href: `${base}?tab=edit` }, { key: "documents", label: t.nav.documents, href: `${base}?tab=documents` }]} />
      {tab === "overview" && (
        <Grid cols={2}>
          <Card title={t.nav.invoices} bodyClassName="p-0">
            <DataTable rows={v.invoices} rowKey={(i) => i.id} empty={<Empty title={t.common.empty} />} cols={[
              { key: "n", label: t.common.reference, primary: true, render: (i) => <Link className="link num" href={`/finance/invoices/${i.id}`}>{i.number}</Link> },
              { key: "d", label: L("الاستحقاق", "Due"), render: (i) => <span className="num">{fmtDate(i.dueDate)}</span> },
              { key: "a", label: t.common.total, align: "end", render: (i) => <Money value={i.total} /> },
              { key: "s", label: t.common.status, render: (i) => <Badge status={i.status}>{label(t, "DocumentStatus", i.status)}</Badge> },
            ]} />
          </Card>
          <Card title={L("سجل الأعمال", "Work history")} bodyClassName="p-0">
            <DataTable rows={v.workOrders} rowKey={(w) => w.id} empty={<Empty title={t.common.empty} />} cols={[
              { key: "n", label: t.common.reference, primary: true, render: (w) => <Link className="link num" href={`/maintenance/work-orders/${w.id}`}>{w.number}</Link> },
              { key: "t", label: L("العنوان", "Title"), render: (w) => w.title },
              { key: "r", label: L("التقييم", "Rating"), render: (w) => (w.qualityRating ? "★".repeat(w.qualityRating) : "—") },
              { key: "s", label: t.common.status, render: (w) => <Badge status={w.status}>{label(t, "WorkOrderStatus", w.status)}</Badge> },
            ]} />
          </Card>
        </Grid>
      )}
      {tab === "contracts" && (
        <div className="space-y-4">
          <Card bodyClassName="p-0">
            <DataTable rows={v.contracts} rowKey={(c) => c.id} empty={<Empty title={t.common.empty} />} cols={[
              { key: "t", label: L("العقد", "Contract"), primary: true, render: (c) => c.title },
              { key: "p", label: t.common.property, render: (c) => c.property?.name ?? "—" },
              { key: "d", label: t.common.period, render: (c) => <span className="num">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</span> },
              { key: "v", label: L("القيمة", "Value"), render: (c) => <Money value={c.value} /> },
              { key: "w", label: L("الضمان", "Warranty"), render: (c) => <span className="num">{fmtDate(c.warrantyEnd)}</span> },
            ]} />
          </Card>
          {ctx.permissions.has("vendor.write") && (
            <Card title={L("إضافة عقد خدمة/صيانة", "Add service/maintenance contract")}>
              <ActionForm action={addVendorContractAction} submitLabel={t.common.add} resetOnSuccess>
                <input type="hidden" name="vendorId" value={id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input name="title" label={L("العنوان", "Title")} required />
                  <Select name="propertyId" label={t.common.property} options={(await listProperties(ctx)).map((p) => ({ value: p.id, label: p.name }))} placeholder={t.common.none} />
                  <MoneyInput name="value" label={L("القيمة", "Value")} />
                  <Input name="startDate" type="date" label={t.common.from} required />
                  <Input name="endDate" type="date" label={t.common.to} required />
                  <Input name="warrantyEnd" type="date" label={L("انتهاء الضمان", "Warranty end")} />
                  <Textarea name="scope" label={L("النطاق", "Scope")} className="sm:col-span-3" />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
      {tab === "edit" && ctx.permissions.has("vendor.write") && (
        <Card><ActionForm action={saveVendorAction} submitLabel={t.common.save}><input type="hidden" name="id" value={id} /><VendorFields t={t} L={L} v={v as unknown as Record<string, unknown>} /></ActionForm></Card>
      )}
      {tab === "documents" && <DocumentsPanel ctx={ctx} t={t} L={L} where={{ vendorId: id }} link={{ vendorId: id }} categories={["QUOTATION", "INVOICE", "MAINTENANCE_CONTRACT", "WARRANTY", "CORRESPONDENCE", "OTHER"]} />}
    </>
  );
}
