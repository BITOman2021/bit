import Link from "next/link";
import { activateLeaseAction, addChargeAction, cancelLeaseAction, renewLeaseAction, terminateLeaseAction, voidChargeAction } from "@/app/actions/core";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { AuditTrail } from "@/components/domain/audit-trail";
import { ActionButton, ActionForm, Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, DataTable, DescList, Empty, Grid, Money, PageHeader, Stat, Tabs } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { addMonths, addDays, todayInZone } from "@/lib/dates";
import { toBaisa } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getLease, leaseTotals } from "@/server/services/leases";
import { load, sp, type SP } from "../../_lib/guard";

export default async function LeasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const q = await sp(searchParams);
  const tab = q.tab ?? "schedule";
  const { t, L, locale } = await getT();
  const l = await load(getLease(ctx, id));
  const today = todayInZone(ctx.timezone);
  const totals = await leaseTotals(l, today);
  const can = (p: string) => ctx.permissions.has(p);
  const base = `/leases/${id}`;
  const deposit = l.deposits[0];

  return (
    <>
      <PageHeader
        title={`${L("عقد", "Lease")} ${l.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge status={l.status}>{label(t, "LeaseStatus", l.status)}</Badge>
            <Link className="link" href={`/tenants/${l.tenantId}`}>{l.tenant.name}</Link> ·
            <Link className="link" href={`/units/${l.unitId}`}>{l.unit.property.name} / {l.unit.unitNumber}</Link>
            {l.previousLease && <span>· {L("تجديد لـ", "Renewal of")} <Link className="link" href={`/leases/${l.previousLease.id}`}>{l.previousLease.number}</Link></span>}
            {l.renewalLease && <span>· {L("جُدد بـ", "Renewed by")} <Link className="link" href={`/leases/${l.renewalLease.id}`}>{l.renewalLease.number}</Link></span>}
          </span>
        }
        back={{ href: "/leases", label: t.nav.leases }}
        actions={
          <>
            <Link className="btn-secondary" href={`/print/lease/${id}`} target="_blank">{t.common.printPdf}</Link>
            {l.status === "DRAFT" && can("lease.write") && <Link className="btn-secondary" href={`${base}/edit`}>{t.common.edit}</Link>}
            {l.status === "DRAFT" && can("lease.write") && <ActionButton action={cancelLeaseAction} fields={{ id }} label={t.common.cancel} className="btn-ghost" askReason={t.common.reason} />}
            {l.status === "DRAFT" && can("lease.approve") && (
              <ActionButton action={activateLeaseAction} fields={{ id }} label={L("اعتماد وتفعيل العقد", "Approve & activate")} className="btn-gold" confirmText={L("سيتم توليد جدول الاستحقاقات وترحيل القيود. متابعة؟", "This generates the schedule and posts entries. Continue?")} />
            )}
            {l.status === "ACTIVE" && can("payment.write") && <Link className="btn-primary" href={`/finance/payments/new?tenantId=${l.tenantId}&leaseId=${id}`}>{L("تسجيل تحصيل", "Record collection")}</Link>}
          </>
        }
      />

      {l.status === "DRAFT" && (
        <div className="mb-4">
          <Alert tone="warning">{L("مسودة: لم تُنشأ استحقاقات بعد. الاعتماد يتطلب صلاحية اعتماد العقود.", "Draft: no charges yet. Activation requires lease approval permission.")}</Alert>
        </div>
      )}

      <Grid cols={4}>
        <Stat label={L("قيمة العقد (الإيجار)", "Contract value (rent)")} value={<Money value={totals.contractValue} />} />
        <Stat label={L("المستحق حتى اليوم", "Billed to date")} value={<Money value={totals.billedToDate} />} />
        <Stat label={L("المدفوع", "Paid")} tone="success" value={<Money value={totals.paid} />} />
        <Stat label={L("المتأخر", "Overdue")} tone={totals.overdue > 0n ? "danger" : "default"} value={<Money value={totals.overdue} />} />
      </Grid>

      <div className="mt-4" />
      <Tabs
        current={tab}
        tabs={[
          { key: "schedule", label: L("جدول الاستحقاقات", "Schedule"), href: base, count: l.charges.length },
          { key: "details", label: t.common.details, href: `${base}?tab=details` },
          { key: "payments", label: t.nav.payments, href: `${base}?tab=payments`, count: l.payments.length },
          { key: "actions", label: L("التجديد والإنهاء", "Renew & terminate"), href: `${base}?tab=actions` },
          { key: "history", label: L("النسخ والسجل", "Versions & log"), href: `${base}?tab=history`, count: l.versions.length },
          { key: "documents", label: t.nav.documents, href: `${base}?tab=documents` },
        ]}
      />

      {tab === "schedule" && (
        <div className="space-y-4">
          <Card bodyClassName="p-0">
            <DataTable
              rows={l.charges}
              rowKey={(c) => c.id}
              empty={<Empty title={L("لا توجد استحقاقات", "No charges")} hint={l.status === "DRAFT" ? L("اعتمد العقد لتوليد الجدول", "Activate to generate") : undefined} />}
              cols={[
                { key: "n", label: L("رقم الاستحقاق", "Charge no."), primary: true, render: (c) => <span className="num text-xs font-semibold">{c.number}</span> },
                { key: "t", label: t.common.type, render: (c) => label(t, "ChargeType", c.type) },
                { key: "d", label: L("تاريخ الاستحقاق", "Due date"), render: (c) => <span className={`num ${c.dueDate < today && c.status !== "PAID" && c.status !== "VOID" ? "font-bold text-danger" : ""}`}>{fmtDate(c.dueDate)}</span> },
                { key: "p", label: t.common.period, hideOnMobile: true, render: (c) => <span className="num text-xs text-muted">{c.periodStart ? `${fmtDate(c.periodStart)} → ${fmtDate(c.periodEnd)}` : c.description}</span> },
                { key: "a", label: L("المبلغ الأصلي", "Amount"), align: "end", render: (c) => <Money value={c.amount} /> },
                { key: "pd", label: L("المدفوع", "Paid"), align: "end", render: (c) => <Money value={c.paidAmount} /> },
                { key: "b", label: L("المتبقي", "Balance"), align: "end", render: (c) => <Money value={c.status === "VOID" ? 0n : toBaisa(c.amount) - toBaisa(c.paidAmount)} /> },
                { key: "s", label: t.common.status, render: (c) => <Badge status={c.status}>{label(t, "ChargeStatus", c.status)}</Badge> },
                {
                  key: "x",
                  label: "",
                  hideOnMobile: true,
                  render: (c) => (
                    <span className="flex gap-1">
                      {c.allocations.map((a) => a.payment.receipt && (
                        <Link key={a.id} href={`/finance/payments/${a.paymentId}`} className="link text-xs" title={a.payment.receipt.number}>🧾</Link>
                      ))}
                      {can("charge.write") && c.status === "OPEN" && toBaisa(c.paidAmount) === 0n && (
                        <ActionButton action={voidChargeAction} fields={{ chargeId: c.id }} label={t.common.void} className="btn-ghost btn-sm" askReason={t.common.reason} />
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
          {l.status === "ACTIVE" && can("charge.write") && (
            <Card title={L("إضافة استحقاق (رسوم خدمة / رسوم تأخير معتمدة / أخرى)", "Add charge (service / approved late fee / other)")}>
              <ActionForm action={addChargeAction} submitLabel={t.common.add} resetOnSuccess>
                <input type="hidden" name="leaseId" value={id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Select name="type" label={t.common.type} options={enumOptions(t, "ChargeType", ["SERVICE", "LATE_FEE", "OTHER"])} required />
                  <MoneyInput name="amount" label={t.common.amount} required />
                  <Input name="dueDate" type="date" label={L("تاريخ الاستحقاق", "Due date")} required />
                  <Input name="description" label={t.common.description} required />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "details" && (
        <Grid cols={2}>
          <Card title={L("الشروط المالية", "Financial terms")}>
            <DescList
              items={[
                { label: L("المدة", "Term"), value: <span className="num">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</span> },
                { label: L("الإيجار الشهري", "Monthly rent"), value: <Money value={l.monthlyRent} currency /> },
                { label: L("تكرار الاستحقاق", "Frequency"), value: label(t, "RentFrequency", l.frequency) },
                { label: L("طريقة الدفع", "Payment method"), value: label(t, "PaymentMethod", l.paymentMethod) },
                { label: L("الضريبة", "VAT"), value: <span className="num">{l.vatRate.toString()}%</span> },
                { label: L("فترة السماح", "Grace period"), value: <span className="num">{l.gracePeriodDays} {L("يوم", "days")}</span> },
                { label: L("رسوم التأخير", "Late fees"), value: l.lateFeeEnabled ? <Money value={l.lateFeeAmount} currency /> : t.common.no },
                { label: L("الاعتماد", "Approval"), value: l.approvedAt ? fmtDateTime(l.approvedAt, locale, ctx.timezone) : "—" },
              ]}
            />
          </Card>
          <Card title={L("التأمين", "Security deposit")}>
            {deposit ? (
              <>
                <DescList
                  items={[
                    { label: L("المطلوب", "Required"), value: <Money value={deposit.required} currency /> },
                    { label: L("المستلم", "Received"), value: <Money value={deposit.received} currency /> },
                    { label: L("المستقطع", "Deducted"), value: <Money value={deposit.deducted} currency /> },
                    { label: L("المسترد", "Refunded"), value: <Money value={deposit.refunded} currency /> },
                    { label: t.common.status, value: <Badge status={deposit.status}>{label(t, "DepositStatus", deposit.status)}</Badge> },
                  ]}
                />
                <p className="mt-3 text-xs text-muted">{L("التأمين التزام على الشركة ولا يُحتسب إيرادًا. الرد/الاستقطاع يتم من صفحة التأمينات ويتطلب اعتمادًا.", "Deposits are liabilities, not income. Refunds/deductions require approval.")}</p>
                <Link href="/finance/deposits" className="link mt-2 inline-block text-sm">{t.nav.deposits}</Link>
              </>
            ) : (
              <Empty title={L("لا يوجد تأمين", "No deposit")} />
            )}
            {l.depositTerms && <p className="mt-3 whitespace-pre-wrap text-sm">{l.depositTerms}</p>}
          </Card>
          <Card title={L("الشروط", "Terms")} className="sm:col-span-2">
            <DescList
              cols={3}
              items={[
                { label: L("شروط التجديد", "Renewal"), value: <span className="whitespace-pre-wrap">{l.renewalTerms}</span> },
                { label: L("شروط الإنهاء", "Termination"), value: <span className="whitespace-pre-wrap">{l.terminationTerms}</span> },
                { label: L("شروط خاصة", "Special"), value: <span className="whitespace-pre-wrap">{l.specialTerms}</span> },
              ]}
            />
            {l.terminatedAt && <Alert tone="danger">{L("أُنهي في", "Terminated on")} {fmtDate(l.terminatedAt)}: {l.terminationReason}</Alert>}
          </Card>
        </Grid>
      )}

      {tab === "payments" && (
        <Card bodyClassName="p-0">
          <DataTable
            rows={l.payments}
            rowKey={(p) => p.id}
            empty={<Empty title={t.common.empty} />}
            cols={[
              { key: "r", label: L("الإيصال", "Receipt"), primary: true, render: (p) => <Link className="link num" href={`/finance/payments/${p.id}`}>{p.receipt?.number ?? p.number}</Link> },
              { key: "d", label: t.common.date, render: (p) => <span className="num">{fmtDate(p.receivedDate)}</span> },
              { key: "m", label: L("الطريقة", "Method"), render: (p) => label(t, "PaymentMethod", p.method) },
              { key: "a", label: t.common.amount, align: "end", render: (p) => <Money value={p.amount} /> },
              { key: "u", label: L("غير مخصص", "Unallocated"), align: "end", render: (p) => <Money value={p.unallocated} /> },
              { key: "s", label: t.common.status, render: (p) => <Badge status={p.status}>{label(t, "PaymentStatus", p.status)}</Badge> },
            ]}
          />
        </Card>
      )}

      {tab === "actions" && (
        <Grid cols={2}>
          <Card title={L("تجديد العقد", "Renew lease")}>
            {["ACTIVE", "EXPIRED"].includes(l.status) && can("lease.write") && (!l.renewalLease || l.renewalLease.status === "CANCELLED") ? (
              <ActionForm action={renewLeaseAction} submitLabel={L("إنشاء عقد تجديد (مسودة)", "Create renewal (draft)")} pendingLabel={t.common.saving}>
                <input type="hidden" name="id" value={id} />
                <p className="mb-3 text-sm text-muted">{L("يُنشأ عقد جديد مرتبط يبدأ في", "A new linked lease starting on")} <span className="num font-semibold">{fmtDate(addDays(l.endDate, 1))}</span>. {L("العقد الحالي وسجله لا يتغيران.", "The current lease and its history stay unchanged.")}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input name="endDate" type="date" label={L("نهاية التجديد", "Renewal end")} defaultValue={fmtDate(addMonths(l.endDate, 12))} required />
                  <MoneyInput name="monthlyRent" label={L("الإيجار الشهري الجديد", "New monthly rent")} defaultValue={l.monthlyRent.toFixed(3)} required hint={L("أي زيادة يجب أن تكون متفقًا عليها وموثقة", "Any increase must be agreed and documented")} />
                  <Select name="frequency" label={L("التكرار", "Frequency")} options={enumOptions(t, "RentFrequency")} defaultValue={l.frequency} />
                  <MoneyInput name="depositAmount" label={L("التأمين المطلوب", "Required deposit")} defaultValue={l.depositAmount.toFixed(3)} />
                  <Checkbox name="carryOverDeposit" label={L("نقل التأمين المحتفظ به إلى عقد التجديد", "Carry over held deposit")} defaultChecked />
                  <Textarea name="reason" label={t.common.notes} />
                </div>
              </ActionForm>
            ) : (
              <Empty title={l.renewalLease ? `${L("مجدد بالعقد", "Renewed by")} ${l.renewalLease.number}` : L("غير متاح لهذه الحالة", "Not available for this status")} />
            )}
          </Card>
          <Card title={L("إنهاء العقد", "Terminate lease")}>
            {l.status === "ACTIVE" && can("lease.approve") ? (
              <ActionForm action={terminateLeaseAction} submitLabel={L("تسجيل الإنهاء", "Record termination")} submitClassName="btn-danger" confirmText={L("سيتم إلغاء الاستحقاقات المستقبلية غير المدفوعة. متابعة؟", "Unpaid future charges will be voided. Continue?")}>
                <input type="hidden" name="id" value={id} />
                <Alert tone="warning">
                  {L(
                    "هذا تسجيل إداري لإنهاء متفق عليه أو مقرر نظاميًا. لا ينفذ النظام أي إخلاء أو إجراء قانوني تلقائي؛ تأكد من استيفاء المتطلبات النظامية والموافقات.",
                    "This records an agreed or legally decided termination. The system performs no eviction or legal action; ensure legal requirements and approvals are met.",
                  )}
                </Alert>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <Input name="date" type="date" label={L("تاريخ الإنهاء", "Termination date")} defaultValue={fmtDate(today)} required />
                  <Textarea name="reason" label={L("السبب والمرجع (اتفاقية/قرار)", "Reason & reference (agreement/decision)")} required minLength={5} />
                </div>
              </ActionForm>
            ) : (
              <Empty title={L("غير متاح", "Not available")} />
            )}
          </Card>
        </Grid>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <Card title={L("نسخ العقد (لا تُعدّل النسخ السابقة)", "Lease versions (immutable)")}>
            <ul className="space-y-2 text-sm">
              {l.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                  <Badge tone="blue">v{v.version}</Badge>
                  <span className="font-semibold">{v.changeType}</span>
                  <span className="text-muted">{v.reason}</span>
                  <span className="num ms-auto text-xs text-muted">{fmtDateTime(v.createdAt, locale, ctx.timezone)}</span>
                  <details className="w-full">
                    <summary className="cursor-pointer text-xs text-navy-700">JSON</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-navy-50 p-2 text-[11px]" dir="ltr">{JSON.stringify(v.snapshot, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
          <AuditTrail entityId={id} t={t} L={L} canSee={can("audit.read")} />
        </div>
      )}

      {tab === "documents" && <DocumentsPanel ctx={ctx} t={t} L={L} where={{ leaseId: id }} link={{ leaseId: id }} categories={["LEASE", "HANDOVER", "CORRESPONDENCE", "OTHER"]} />}
    </>
  );
}
