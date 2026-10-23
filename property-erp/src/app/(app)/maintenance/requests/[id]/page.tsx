import Link from "next/link";
import { setRequestStatusAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionButton } from "@/components/ui/form";
import { Badge, Card, DescList, Grid, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { getRequest } from "@/server/services/maintenance";
import { load } from "../../../_lib/guard";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L, locale } = await getT();
  const r = await load(getRequest(ctx, id));
  const [property, unit, tenant] = await Promise.all([
    prisma.property.findUnique({ where: { id: r.propertyId }, select: { name: true, code: true } }),
    r.unitId ? prisma.unit.findUnique({ where: { id: r.unitId }, select: { unitNumber: true } }) : null,
    r.tenantId ? prisma.tenant.findUnique({ where: { id: r.tenantId }, select: { id: true, name: true, phone: true } }) : null,
  ]);
  const canWrite = ctx.permissions.has("maintenance.write");
  return (
    <>
      <PageHeader
        title={`${r.number} — ${r.title}`}
        subtitle={<span className="flex gap-2"><Badge status={r.status}>{label(t, "RequestStatus", r.status)}</Badge><Badge status={r.priority}>{label(t, "Priority", r.priority)}</Badge></span>}
        back={{ href: "/maintenance/requests", label: t.nav.requests }}
        actions={
          canWrite && (
            <>
              {!["CLOSED", "CANCELLED"].includes(r.status) && <Link className="btn-primary" href={`/maintenance/work-orders/new?requestId=${r.id}`}>+ {L("أمر عمل", "Work order")}</Link>}
              {r.status === "RESOLVED" && <ActionButton action={setRequestStatusAction} fields={{ id, status: "CLOSED" }} label={L("إغلاق الطلب", "Close request")} />}
              {["NEW", "IN_PROGRESS"].includes(r.status) && <ActionButton action={setRequestStatusAction} fields={{ id, status: "CANCELLED" }} label={t.common.cancel} className="btn-ghost" confirmText={t.common.areYouSure} />}
            </>
          )
        }
      />
      <Grid cols={2}>
        <Card title={t.common.details}>
          <DescList
            items={[
              { label: t.common.property, value: `${property?.code} ${property?.name}` },
              { label: t.common.unit, value: unit?.unitNumber },
              { label: t.common.category, value: label(t, "MaintenanceCategory", r.category) },
              { label: t.common.type, value: label(t, "MaintenanceType", r.type) },
              { label: L("مقدم الطلب", "Reported by"), value: tenant ? <>{tenant.name} ({L("بوابة المستأجر", "tenant portal")}) {tenant.phone}</> : L("الإدارة", "Staff") },
              { label: t.common.date, value: fmtDateTime(r.createdAt, locale, ctx.timezone) },
            ]}
          />
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm">{r.description}</p>
        </Card>
        <Card title={t.nav.workOrders}>
          <ul className="space-y-2 text-sm">
            {r.workOrders.map((w) => (
              <li key={w.id} className="flex items-center gap-2"><Link className="link num" href={`/maintenance/work-orders/${w.id}`}>{w.number}</Link><span className="flex-1">{w.title}</span><Badge status={w.status}>{label(t, "WorkOrderStatus", w.status)}</Badge></li>
            ))}
            {r.workOrders.length === 0 && <li className="text-muted">{L("لم يُنشأ أمر عمل بعد", "No work order yet")}</li>}
          </ul>
        </Card>
      </Grid>
      <div className="mt-4">
        <DocumentsPanel ctx={ctx} t={t} L={L} where={{ requestId: id }} link={{ requestId: id }} categories={["PHOTO", "QUOTATION", "OTHER"]} />
      </div>
    </>
  );
}
