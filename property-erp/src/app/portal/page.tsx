import Link from "next/link";
import { portalContactAction, portalInquiryAction, portalRequestAction } from "@/app/actions/ops";
import { ActionForm, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, DataTable, DescList, Empty, Grid, Money, PageHeader, Stat, Tabs } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { portalOverview } from "@/server/services/portal";
import { prisma } from "@/server/db";
import { load, sp, type SP } from "@/app/(app)/_lib/guard";

export const metadata = { title: "Tenant portal" };

export default async function PortalPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const tab = q.tab ?? "home";
  const d = await load(portalOverview(ctx));
  const active = d.leases.filter((l) => l.status === "ACTIVE");
  const unread = await prisma.notification.findMany({ where: { userId: ctx.userId, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 });
  const charges = d.leases.flatMap((l) => l.charges.map((c) => ({ ...c, leaseNumber: l.number })));
  return (
    <>
      <PageHeader title={`${L("مرحبًا", "Welcome")}, ${d.tenant.name}`} subtitle={active.map((l) => `${l.unit.property.name} — ${l.unit.unitNumber}`).join(" · ")} />
      {q.ok === "request" && <div className="mb-4"><Alert tone="success">{L("تم استلام طلب الصيانة وسيتم التواصل معك.", "Maintenance request received; we'll be in touch.")}</Alert></div>}
      <Grid cols={3}>
        <Stat label={L("المستحق حتى اليوم", "Due to date")} value={<Money value={d.due} />} tone={d.due > 0n ? "gold" : "success"} />
        <Stat label={L("المتأخر", "Overdue")} value={<Money value={d.overdue} />} tone={d.overdue > 0n ? "danger" : "default"} />
        <Stat label={L("طلبات الصيانة المفتوحة", "Open requests")} value={<span className="num">{d.requests.filter((r) => !["CLOSED", "CANCELLED", "RESOLVED"].includes(r.status)).length}</span>} />
      </Grid>
      <div className="mt-4" />
      <Tabs current={tab} tabs={[
        { key: "home", label: L("عقدي", "My lease"), href: "/portal" },
        { key: "charges", label: L("الإيجارات المستحقة", "Rent due"), href: "/portal?tab=charges" },
        { key: "payments", label: L("المدفوعات والإيصالات", "Payments & receipts"), href: "/portal?tab=payments" },
        { key: "maintenance", label: t.nav.maintenance, href: "/portal?tab=maintenance" },
        { key: "messages", label: L("الاستفسارات", "Inquiries"), href: "/portal?tab=messages" },
        { key: "profile", label: L("بياناتي", "My details"), href: "/portal?tab=profile" },
      ]} />

      {tab === "home" && (
        <div className="space-y-4">
          {unread.length > 0 && (
            <Card title={t.nav.notifications}>
              <ul className="space-y-1 text-sm">{unread.map((n) => <li key={n.id}><Badge tone={n.severity === "danger" ? "red" : "blue"}>●</Badge> {n.title}</li>)}</ul>
            </Card>
          )}
          {d.leases.length === 0 && <Card><Empty title={L("لا يوجد عقد مرتبط بحسابك", "No lease linked to your account")} /></Card>}
          {d.leases.map((l) => (
            <Card key={l.id} title={`${L("عقد", "Lease")} ${l.number}`} actions={<Link className="btn-secondary btn-sm" href={`/print/lease/${l.id}`} target="_blank">{t.common.printPdf}</Link>}>
              <DescList cols={3} items={[
                { label: t.common.unit, value: `${l.unit.property.name} — ${l.unit.unitNumber}` },
                { label: L("المدة", "Term"), value: <span className="num">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</span> },
                { label: t.common.status, value: <Badge status={l.status}>{label(t, "LeaseStatus", l.status)}</Badge> },
                { label: L("الإيجار الشهري", "Monthly rent"), value: <Money value={l.monthlyRent} currency /> },
                { label: L("تكرار الدفع", "Frequency"), value: label(t, "RentFrequency", l.frequency) },
                { label: L("التأمين", "Deposit"), value: l.deposits[0] ? <><Money value={l.deposits[0].received} /> / <Money value={l.deposits[0].required} /></> : "—" },
              ]} />
            </Card>
          ))}
          {d.documents.length > 0 && (
            <Card title={t.nav.documents}>
              <ul className="space-y-1 text-sm">{d.documents.map((doc) => <li key={doc.id}><a className="link" href={`/api/documents/${doc.id}`} target="_blank" rel="noopener">{doc.title}</a> <span className="text-xs text-muted">{label(t, "DocCategory", doc.category)}</span></li>)}</ul>
            </Card>
          )}
        </div>
      )}

      {tab === "charges" && (
        <Card bodyClassName="p-0">
          <DataTable rows={charges.filter((c) => toBaisa(c.amount) > toBaisa(c.paidAmount))} rowKey={(c) => c.id} empty={<Empty title={L("لا توجد مبالغ مستحقة", "Nothing due")} />} cols={[
            { key: "d", label: L("تاريخ الاستحقاق", "Due date"), primary: true, render: (c) => <span className={`num ${c.dueDate < d.today ? "font-bold text-danger" : ""}`}>{fmtDate(c.dueDate)}</span> },
            { key: "t", label: t.common.type, render: (c) => label(t, "ChargeType", c.type) },
            { key: "n", label: t.common.reference, render: (c) => <span className="num text-xs">{c.number}</span> },
            { key: "a", label: t.common.amount, align: "end", render: (c) => <Money value={c.amount} /> },
            { key: "b", label: L("المتبقي", "Balance"), align: "end", render: (c) => <Money value={toBaisa(c.amount) - toBaisa(c.paidAmount)} className="font-semibold" /> },
          ]} />
          <p className="p-3 text-xs text-muted">{L("الدفع الإلكتروني غير متاح حاليًا. يرجى السداد بالطرق المعتمدة لدى الإدارة.", "Online payment is not available yet. Please pay via the methods approved by management.")}</p>
        </Card>
      )}

      {tab === "payments" && (
        <Card bodyClassName="p-0">
          <DataTable rows={d.payments} rowKey={(p) => p.id} empty={<Empty title={t.common.empty} />} cols={[
            { key: "r", label: L("الإيصال", "Receipt"), primary: true, render: (p) => <Link className="link num" href={`/print/receipt/${p.id}`} target="_blank">{p.receipt?.number ?? p.number}</Link> },
            { key: "d", label: t.common.date, render: (p) => <span className="num">{fmtDate(p.receivedDate)}</span> },
            { key: "m", label: L("الطريقة", "Method"), render: (p) => label(t, "PaymentMethod", p.method) },
            { key: "a", label: t.common.amount, align: "end", render: (p) => <Money value={p.amount} /> },
          ]} />
        </Card>
      )}

      {tab === "maintenance" && (
        <div className="space-y-4">
          {active.length > 0 && (
            <Card title={L("طلب صيانة جديد", "New maintenance request")}>
              <ActionForm action={portalRequestAction} submitLabel={L("إرسال الطلب", "Submit request")} pendingLabel={t.common.saving} submitClassName="btn-gold w-full sm:w-auto">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select name="unitId" label={t.common.unit} options={active.map((l) => ({ value: l.unitId, label: `${l.unit.property.name} — ${l.unit.unitNumber}` }))} required />
                  <Select name="category" label={t.common.category} options={enumOptions(t, "MaintenanceCategory")} placeholder={L("تحديد تلقائي", "Auto-detect")} />
                  <Input name="title" label={L("عنوان المشكلة", "Problem")} required className="sm:col-span-2" />
                  <Textarea name="description" label={L("الوصف", "Description")} required className="sm:col-span-2" />
                  <Input name="photos" type="file" label={L("صور المشكلة (حتى 5، يمكن التصوير بالكاميرا)", "Photos (up to 5; camera supported)")} accept="image/*" capture="environment" multiple className="sm:col-span-2" />
                </div>
              </ActionForm>
            </Card>
          )}
          <Card title={L("طلباتي", "My requests")} bodyClassName="p-0">
            <DataTable rows={d.requests} rowKey={(r) => r.id} empty={<Empty title={t.common.empty} />} cols={[
              { key: "n", label: t.common.reference, primary: true, render: (r) => <span className="num">{r.number} — {r.title}</span> },
              { key: "c", label: t.common.category, render: (r) => label(t, "MaintenanceCategory", r.category) },
              { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.createdAt)}</span> },
              { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "RequestStatus", r.status)}</Badge> },
            ]} />
          </Card>
        </div>
      )}

      {tab === "messages" && (
        <div className="space-y-4">
          <Card title={L("إرسال استفسار للإدارة", "Send an inquiry")}>
            <ActionForm action={portalInquiryAction} submitLabel={L("إرسال", "Send")} resetOnSuccess>
              <div className="space-y-3">
                <Input name="subject" label={L("الموضوع", "Subject")} required />
                <Textarea name="body" label={L("الرسالة", "Message")} required />
              </div>
            </ActionForm>
          </Card>
          {d.inquiries.map((iq) => (
            <Card key={iq.id} title={iq.subject} actions={<Badge status={iq.status}>{label(t, "InquiryStatus", iq.status)}</Badge>}>
              <p className="whitespace-pre-wrap text-sm">{iq.body}</p>
              {iq.reply && <p className="mt-2 rounded bg-navy-50 p-2 text-sm">↳ {iq.reply}</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === "profile" && (
        <Card title={L("تحديث بيانات الاتصال (يخضع لاعتماد الإدارة)", "Update contact details (subject to approval)")}>
          <ActionForm action={portalContactAction} submitLabel={L("إرسال الطلب", "Submit")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input name="phone" label={t.common.phone} defaultValue={d.tenant.phone ?? undefined} type="tel" dir="ltr" />
              <Input name="email" label={t.common.email} defaultValue={d.tenant.email ?? undefined} type="email" dir="ltr" />
              <Input name="address" label={t.common.address} defaultValue={d.tenant.address ?? undefined} />
              <Input name="emergencyContact" label={L("جهة اتصال للطوارئ", "Emergency contact")} defaultValue={d.tenant.emergencyContact ?? undefined} />
              <Textarea name="note" label={t.common.notes} className="sm:col-span-2" />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
