import { archiveDocumentAction, uploadDocumentAction } from "@/app/actions/ops";
import { ActionButton, ActionForm, Checkbox, Input, Select } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, FilterBar, FilterDate, FilterSelect, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listDocuments } from "@/server/services/documents";
import { listProperties } from "@/server/services/properties";
import { listTenants } from "@/server/services/tenants";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [rows, props, tenants] = await load(Promise.all([listDocuments(ctx, q), listProperties(ctx), ctx.permissions.has("tenant.read") ? listTenants(ctx) : Promise.resolve([])]));
  const pname = new Map(props.map((p) => [p.id, p.code]));
  return (
    <>
      <PageHeader title={t.nav.documents} subtitle={L("تُحفظ الملفات في تخزين خاص ولا تُتاح إلا بعد التحقق من الصلاحية", "Files are stored privately and served only after an authorization check")} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/documents" q={q.q} searchLabel={L("العنوان أو اسم الملف", "Title or file name")} submitLabel={t.common.search} resetLabel={t.common.reset}>
          <FilterSelect name="category" label={t.common.category} value={q.category} options={enumOptions(t, "DocCategory")} allLabel={t.common.all} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />
          {tenants.length > 0 && <FilterSelect name="tenantId" label={t.common.tenant} value={q.tenantId} options={tenants.map((x) => ({ value: x.id, label: x.name }))} allLabel={t.common.all} />}
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
        </FilterBar>
        <DataTable rows={rows} rowKey={(d) => d.id} empty={<Empty title={t.common.empty} />} cols={[
          { key: "t", label: L("العنوان", "Title"), primary: true, render: (d) => <a className="link" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{d.title}</a> },
          { key: "c", label: t.common.category, render: (d) => <><Badge tone="blue">{label(t, "DocCategory", d.category)}</Badge>{d.isSensitive && <Badge tone="red">{L("حساس", "Sensitive")}</Badge>}</> },
          { key: "p", label: t.common.property, render: (d) => (d.propertyId ? pname.get(d.propertyId) : "—") },
          { key: "f", label: L("الملف", "File"), hideOnMobile: true, render: (d) => <span className="num text-xs">{d.fileName} · {Math.ceil(d.sizeBytes / 1024)}KB</span> },
          { key: "d", label: t.common.date, render: (d) => <span className="num">{fmtDate(d.documentDate ?? d.createdAt)}</span> },
          { key: "e", label: L("ينتهي", "Expires"), render: (d) => <span className="num">{fmtDate(d.expiresAt)}</span> },
          { key: "x", label: "", hideOnMobile: true, render: (d) => <span className="flex gap-1"><a className="btn-ghost btn-sm" href={`/api/documents/${d.id}?download=1`}>{t.common.download}</a>{ctx.permissions.has("document.write") && <ActionButton action={archiveDocumentAction} fields={{ id: d.id }} label={t.common.archive} className="btn-ghost btn-sm" askReason={t.common.reason} />}</span> },
        ]} />
      </Card>
      {ctx.permissions.has("document.write") && (
        <Card title={t.common.upload} className="mt-4">
          <ActionForm action={uploadDocumentAction} submitLabel={t.common.upload} pendingLabel={t.common.saving} resetOnSuccess>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select name="category" label={t.common.category} options={enumOptions(t, "DocCategory")} required />
              <Input name="title" label={L("العنوان", "Title")} required />
              <Select name="propertyId" label={t.common.property} options={props.map((p) => ({ value: p.id, label: p.name }))} placeholder={t.common.none} />
              {tenants.length > 0 && <Select name="tenantId" label={t.common.tenant} options={tenants.map((x) => ({ value: x.id, label: x.name }))} placeholder={t.common.none} />}
              <Input name="documentDate" type="date" label={t.common.date} />
              <Input name="expiresAt" type="date" label={L("تاريخ الانتهاء", "Expiry")} />
              <Input name="file" type="file" label={L("الملف", "File")} required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.xlsx,image/*" className="sm:col-span-2" />
              <Checkbox name="isSensitive" label={L("مستند حساس", "Sensitive document")} />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
