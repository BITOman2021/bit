import { approveTemplateAction, saveTemplateAction } from "@/app/actions/core";
import { ActionButton, ActionForm, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { listTemplates } from "@/server/services/leases";
import { load } from "../../_lib/guard";

const VARS = ["lease.number", "lease.startDate", "lease.endDate", "lease.monthlyRent", "lease.frequency", "lease.depositAmount", "tenant.name", "tenant.idNumber", "tenant.phone", "unit.number", "property.name", "property.address", "company.name", "today"];

export default async function TemplatesPage() {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const rows = await load(listTemplates(ctx));
  const canWrite = ctx.permissions.has("lease.write");
  return (
    <>
      <PageHeader title={t.nav.templates} back={{ href: "/leases", label: t.nav.leases }} />
      <div className="mb-4">
        <Alert tone="warning">
          {L(
            "القوالب نصوص قابلة للمراجعة والتعديل. لا يعتبر النظام أي بند صحيحًا قانونيًا تلقائيًا؛ يجب مراجعة القالب من مستشار قانوني وفق الأنظمة العُمانية ثم اعتماده. أي تعديل يلغي الاعتماد.",
            "Templates are editable text. No clause is assumed legally valid; have counsel review against Omani law, then approve. Any edit resets approval.",
          )}
        </Alert>
      </div>
      <div className="space-y-4">
        {rows.length === 0 && <Card><Empty title={t.common.empty} /></Card>}
        {rows.map((tp) => (
          <Card key={tp.id} title={<span className="flex items-center gap-2">{tp.name} <Badge status={tp.isApproved ? "APPROVED" : "PENDING"}>{tp.isApproved ? L("معتمد", "Approved") : L("غير معتمد", "Not approved")}</Badge></span>}
            actions={!tp.isApproved && ctx.permissions.has("lease.approve") && <ActionButton action={approveTemplateAction} fields={{ id: tp.id }} label={t.common.approve} confirmText={L("أؤكد أن القالب روجع قانونيًا", "I confirm legal review")} />}>
            {canWrite ? (
              <ActionForm action={saveTemplateAction} submitLabel={t.common.save}>
                <input type="hidden" name="id" value={tp.id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input name="name" label={t.common.name} defaultValue={tp.name} required />
                  <Select name="language" label="Language" options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} defaultValue={tp.language} />
                  <Textarea name="body" label={L("نص القالب", "Template body")} defaultValue={tp.body} rows={10} className="sm:col-span-2" required />
                </div>
              </ActionForm>
            ) : (
              <pre className="whitespace-pre-wrap text-sm">{tp.body}</pre>
            )}
          </Card>
        ))}
        {canWrite && (
          <Card title={L("قالب جديد", "New template")}>
            <ActionForm action={saveTemplateAction} submitLabel={t.common.create} resetOnSuccess>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input name="name" label={t.common.name} required />
                <Select name="language" label="Language" options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} />
                <Textarea name="body" label={L("نص القالب", "Template body")} rows={10} className="sm:col-span-2" required />
              </div>
              <p className="mt-2 text-xs text-muted" dir="ltr">{VARS.map((v) => `{{${v}}}`).join("  ")}</p>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
