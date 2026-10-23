import Link from "next/link";
import { replyInquiryAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionForm, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, DescList, Empty, Grid, Money, PageHeader, Stat } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getTenant, tenantStatement } from "@/server/services/tenants";
import { load } from "../../_lib/guard";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const tn = await load(getTenant(ctx, id));
  const stmt = ctx.permissions.has("finance.read") ? await tenantStatement(ctx, id) : null;
  return (
    <>
      <PageHeader
        title={tn.name}
        subtitle={<span className="num">{tn.code}</span>}
        back={{ href: "/tenants", label: t.nav.tenants }}
        actions={
          <>
            {ctx.permissions.has("tenant.write") && <Link className="btn-secondary" href={`/tenants/${id}/edit`}>{t.common.edit}</Link>}
            {ctx.permissions.has("payment.write") && <Link className="btn-gold" href={`/finance/payments/new?tenantId=${id}`}>{L("تسجيل تحصيل", "Record collection")}</Link>}
            {ctx.permissions.has("lease.write") && <Link className="btn-primary" href={`/leases/new?tenantId=${id}`}>+ {L("عقد", "Lease")}</Link>}
          </>
        }
      />
      <div className="space-y-4">
        {stmt && (
          <Grid cols={3}>
            <Stat label={L("الرصيد الحالي", "Current balance")} value={<Money value={stmt.closing} tone />} tone={stmt.closing > 0n ? "danger" : "success"} hint={stmt.closing < 0n ? L("رصيد دائن للمستأجر", "Tenant credit") : undefined} />
            <Stat label={t.nav.leases} value={<span className="num">{tn.leases.length}</span>} />
            <Stat label={t.nav.payments} value={<span className="num">{tn.payments.length}</span>} />
          </Grid>
        )}
        <Grid cols={2}>
          <Card title={L("بيانات الاتصال", "Contact details")}>
            <DescList
              items={[
                { label: t.common.type, value: label(t, "TenantType", tn.type) },
                { label: t.common.phone, value: <span className="num">{tn.phone}</span> },
                { label: t.common.email, value: tn.email },
                { label: t.common.address, value: tn.address },
                { label: L("الجنسية", "Nationality"), value: tn.nationality },
                { label: L("جهة العمل", "Employer"), value: tn.employer },
                { label: L("الهوية", "ID"), value: [tn.idType, tn.idNumber, tn.idExpiry && fmtDate(tn.idExpiry)].filter(Boolean).join(" · ") },
                { label: L("حساب البوابة", "Portal account"), value: tn.user ? `${tn.user.email} ${tn.user.isActive ? "" : "(inactive)"}` : L("غير مفعل", "Not enabled") },
              ]}
            />
          </Card>
          <Card title={t.nav.leases}>
            {tn.leases.length === 0 ? <Empty title={t.common.empty} /> : (
              <ul className="divide-y divide-line text-sm">
                {tn.leases.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link className="link" href={`/leases/${l.id}`}>{l.number}</Link>
                    <span className="flex-1">{l.unit.property.name} / {l.unit.unitNumber}</span>
                    <span className="num text-xs text-muted">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</span>
                    <Badge status={l.status}>{label(t, "LeaseStatus", l.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Grid>
        {stmt && (
          <Card title={L("كشف الحساب", "Statement")} actions={<Link className="btn-secondary btn-sm" href={`/reports/tenant-statement?tenantId=${id}`}>{t.common.printPdf}</Link>} bodyClassName="p-0">
            <DataTable
              rows={stmt.lines.slice(-30)}
              rowKey={(l) => `${l.reference}-${l.date}-${l.kind}`}
              empty={<Empty title={t.common.empty} />}
              cols={[
                { key: "d", label: t.common.date, render: (l) => <span className="num">{l.date}</span> },
                { key: "r", label: t.common.reference, primary: true, render: (l) => <span className="num text-xs">{l.reference}</span> },
                { key: "x", label: t.common.description, render: (l) => l.description },
                { key: "dr", label: L("مدين", "Debit"), align: "end", render: (l) => (l.debit ? <Money value={l.debit} /> : "") },
                { key: "cr", label: L("دائن", "Credit"), align: "end", render: (l) => (l.credit ? <Money value={l.credit} /> : "") },
                { key: "b", label: t.common.balance, align: "end", render: (l) => <Money value={l.balance} tone /> },
              ]}
            />
          </Card>
        )}
        <Grid cols={2}>
          <DocumentsPanel ctx={ctx} t={t} L={L} where={{ tenantId: id }} link={{ tenantId: id }} categories={["TENANT_ID", "LEASE", "CORRESPONDENCE", "RECEIPT", "OTHER"]} />
          <Card title={L("الاستفسارات والمراسلات", "Inquiries & correspondence")}>
            {tn.inquiries.length === 0 ? <Empty title={t.common.empty} /> : (
              <ul className="space-y-3">
                {tn.inquiries.map((q) => (
                  <li key={q.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex justify-between gap-2"><span className="font-semibold">{q.subject}</span><Badge status={q.status}>{label(t, "InquiryStatus", q.status)}</Badge></div>
                    <p className="mt-1 whitespace-pre-wrap">{q.body}</p>
                    {q.reply ? <p className="mt-2 rounded bg-navy-50 p-2 text-navy-800">↳ {q.reply}</p> : ctx.permissions.has("tenant.write") && (
                      <ActionForm action={replyInquiryAction} submitLabel={L("إرسال الرد", "Send reply")} className="mt-2">
                        <input type="hidden" name="inquiryId" value={q.id} />
                        <Textarea name="reply" label={L("الرد", "Reply")} required />
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Grid>
      </div>
    </>
  );
}
