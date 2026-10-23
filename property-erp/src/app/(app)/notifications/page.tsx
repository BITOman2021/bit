import Link from "next/link";
import { markReadAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Badge, Card, Empty, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listNotifications } from "@/server/services/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const { t, L, locale } = await getT();
  const rows = await listNotifications(ctx);
  return (
    <>
      <PageHeader title={t.nav.notifications} subtitle={L("التنبيهات داخل التطبيق. قنوات البريد وواتساب والرسائل النصية غير مفعلة حتى ربط مزود معتمد.", "In-app alerts. Email/WhatsApp/SMS are not enabled until a real provider is connected.")} actions={rows.some((r) => !r.readAt) && <ActionButton action={markReadAction} label={L("تعليم الكل كمقروء", "Mark all read")} />} />
      <Card>
        {rows.length === 0 ? <Empty title={L("لا توجد إشعارات", "No notifications")} /> : (
          <ul className="divide-y divide-line">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 py-3 ${n.readAt ? "opacity-60" : ""}`}>
                <Badge tone={n.severity === "danger" ? "red" : n.severity === "warning" ? "amber" : n.severity === "success" ? "green" : "blue"}>●</Badge>
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className="font-semibold text-navy-900 hover:underline">{n.title}</Link> : <span className="font-semibold">{n.title}</span>}
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="text-xs text-muted">{fmtDateTime(n.createdAt, locale, ctx.timezone)}</p>
                </div>
                {!n.readAt && <ActionButton action={markReadAction} fields={{ id: n.id }} label="✓" className="btn-ghost btn-sm" />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
