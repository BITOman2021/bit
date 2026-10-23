import { redirect } from "next/navigation";
import { saveSettingsAction } from "@/app/actions/ops";
import { ActionForm, Checkbox, Input, MoneyInput } from "@/components/ui/form";
import { Alert, Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { getSettings } from "@/server/services/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("settings.manage")) redirect("/forbidden");
  const { t, L } = await getT();
  const s = await getSettings(ctx.orgId);
  const integrations = [
    { name: L("البريد الإلكتروني", "Email"), env: "EMAIL_PROVIDER / SMTP_URL" },
    { name: "WhatsApp", env: "WHATSAPP_PROVIDER" },
    { name: L("الرسائل النصية", "SMS"), env: "SMS_PROVIDER" },
    { name: L("الذكاء الاصطناعي الخارجي", "External AI"), env: "AI_PROVIDER / AI_API_KEY" },
    { name: L("الدفع الإلكتروني", "Online payments"), env: "—" },
    { name: L("التوقيع الإلكتروني", "E-signature"), env: "—" },
  ];
  return (
    <>
      <PageHeader title={t.nav.settings} />
      <ActionForm action={saveSettingsAction} submitLabel={t.common.save}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={L("بيانات الشركة (للطباعة)", "Company details (print)")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input name="company.nameAr" label={L("الاسم بالعربية", "Arabic name")} defaultValue={s["company.nameAr"]} />
              <Input name="company.nameEn" label={L("الاسم بالإنجليزية", "English name")} defaultValue={s["company.nameEn"]} dir="ltr" />
              <Input name="company.address" label={t.common.address} defaultValue={s["company.address"]} />
              <Input name="company.phone" label={t.common.phone} defaultValue={s["company.phone"]} dir="ltr" />
              <Input name="company.crNumber" label={L("السجل التجاري", "CR number")} defaultValue={s["company.crNumber"]} dir="ltr" />
            </div>
          </Card>
          <Card title={L("حدود الاعتماد", "Approval thresholds")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyInput name="approval.expenseThreshold" label={L("المصروفات/الفواتير/أوامر الشراء (ر.ع.)", "Expenses/bills/POs (OMR)")} defaultValue={String(s["approval.expenseThreshold"])} />
              <MoneyInput name="approval.workOrderThreshold" label={L("تقدير أوامر العمل (ر.ع.)", "Work order estimate (OMR)")} defaultValue={String(s["approval.workOrderThreshold"])} />
            </div>
          </Card>
          <Card title={L("فترات التنبيه (أيام)", "Alert windows (days)")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input name="alerts.leaseExpiryDays" type="number" min={0} label={L("انتهاء العقود", "Lease expiry")} defaultValue={String(s["alerts.leaseExpiryDays"])} />
              <Input name="alerts.rentDueDays" type="number" min={0} label={L("الإيجارات المستحقة", "Rent due")} defaultValue={String(s["alerts.rentDueDays"])} />
              <Input name="alerts.warrantyDays" type="number" min={0} label={L("الضمانات", "Warranties")} defaultValue={String(s["alerts.warrantyDays"])} />
              <Input name="alerts.insuranceDays" type="number" min={0} label={L("التأمين", "Insurance")} defaultValue={String(s["alerts.insuranceDays"])} />
              <Input name="alerts.invoiceDueDays" type="number" min={0} label={L("فواتير الموردين", "Vendor bills")} defaultValue={String(s["alerts.invoiceDueDays"])} />
            </div>
          </Card>
          <Card title={L("الضرائب ورسوم التأخير", "Tax & late fees")}>
            <div className="space-y-3">
              <Alert tone="warning">{L("لا يطبق النظام أي نسبة ضريبة أو إعفاء تلقائيًا. تحقق من انطباق ضريبة القيمة المضافة في سلطنة عُمان على كل نشاط (السكني/التجاري) مع مستشار ضريبي.", "No tax rate or exemption is applied automatically. Verify Omani VAT applicability per activity with a tax adviser.")}</Alert>
              <Checkbox name="tax.enabled" label={L("تفعيل الضريبة على العقود", "Enable tax on leases")} defaultChecked={s["tax.enabled"]} />
              <Input name="tax.vatNumber" label={L("الرقم الضريبي للشركة", "Company VAT number")} defaultValue={s["tax.vatNumber"]} dir="ltr" />
              <Checkbox name="lateFees.enabled" label={L("السماح برسوم التأخير (يدويًا، للعقود التي تنص عليها فقط)", "Allow late fees (manual, only for leases that provide for them)")} defaultChecked={s["lateFees.enabled"]} />
            </div>
          </Card>
        </div>
      </ActionForm>
      <Card title={L("التكاملات الخارجية", "External integrations")} className="mt-4">
        <ul className="divide-y divide-line text-sm">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-center justify-between py-2">
              <span>{i.name} <span className="num text-xs text-muted">{i.env}</span></span>
              <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs text-muted">{L("غير مفعّل — يتطلب مزودًا حقيقيًا واختبارًا", "Not enabled — requires a real provider and testing")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
