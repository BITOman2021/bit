import { redirect } from "next/navigation";
import { runJobsAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Alert, Card, Grid, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";

export const metadata = { title: "System jobs" };

export default async function SystemPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("settings.manage")) redirect("/forbidden");
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={t.nav.system} />
      <div className="mb-4"><Alert>{L("في الإنتاج تُشغَّل هذه المهام يوميًا عبر الأمر pnpm jobs:notifications (cron/systemd timer). يمكن تشغيلها يدويًا هنا بأمان؛ لا تُنشئ تكرارًا.", "In production run daily via `pnpm jobs:notifications` (cron). Safe to run manually here; idempotent.")}</Alert></div>
      <Grid cols={3}>
        <Card title={L("توليد التنبيهات", "Generate alerts")}><p className="mb-3 text-sm text-muted">{L("العقود المنتهية قريبًا، الإيجارات المستحقة والمتأخرة، الضمانات، التأمين، الفواتير، المهام.", "Expiring leases, due/overdue rent, warranties, insurance, bills, tasks.")}</p><ActionButton action={runJobsAction} fields={{ job: "alerts" }} label={L("تشغيل", "Run")} className="btn-primary" /></Card>
        <Card title={L("تحديث حالة العقود", "Expire leases")}><p className="mb-3 text-sm text-muted">{L("تحويل العقود التي انتهت مدتها إلى منتهية وتحرير الوحدات.", "Mark ended leases as expired and free units.")}</p><ActionButton action={runJobsAction} fields={{ job: "expire" }} label={L("تشغيل", "Run")} className="btn-primary" /></Card>
        <Card title={L("الصيانة الوقائية", "Preventive maintenance")}><p className="mb-3 text-sm text-muted">{L("إنشاء أوامر العمل المستحقة من الخطط الدورية دون تكرار.", "Create due work orders from plans without duplicates.")}</p><ActionButton action={runJobsAction} fields={{ job: "preventive" }} label={L("تشغيل", "Run")} className="btn-primary" /></Card>
      </Grid>
    </>
  );
}
