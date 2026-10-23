import Link from "next/link";
import { requestRefundAction } from "@/app/actions/ops";
import { ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listDeposits } from "@/server/services/billing";
import { load } from "../../_lib/guard";

export const metadata = { title: "Deposits" };

export default async function DepositsPage() {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const rows = await load(listDeposits(ctx));
  const held = (d: (typeof rows)[number]) => toBaisa(d.received) - toBaisa(d.deducted) - toBaisa(d.refunded);
  const refundable = rows.filter((d) => held(d) > 0n && d.status !== "TRANSFERRED");
  return (
    <>
      <PageHeader title={t.nav.deposits} subtitle={L("التأمينات التزام على الشركة وليست إيرادًا", "Deposits are liabilities, not income")} />
      <Card bodyClassName="p-0">
        <DataTable
          rows={rows}
          rowKey={(d) => d.id}
          empty={<Empty title={t.common.empty} />}
          cols={[
            { key: "l", label: t.nav.leases, primary: true, render: (d) => <Link className="link num" href={`/leases/${d.leaseId}`}>{d.lease.number}</Link> },
            { key: "t", label: t.common.tenant, render: (d) => d.lease.tenant.name },
            { key: "p", label: t.common.property, render: (d) => `${d.lease.unit.property.name} / ${d.lease.unit.unitNumber}` },
            { key: "r", label: L("المطلوب", "Required"), align: "end", render: (d) => <Money value={d.required} /> },
            { key: "rc", label: L("المستلم", "Received"), align: "end", render: (d) => <Money value={d.received} /> },
            { key: "dd", label: L("المستقطع", "Deducted"), align: "end", render: (d) => <Money value={d.deducted} /> },
            { key: "rf", label: L("المسترد", "Refunded"), align: "end", render: (d) => <Money value={d.refunded} /> },
            { key: "h", label: L("المحتفظ به", "Held"), align: "end", render: (d) => <Money value={held(d)} className="font-semibold" /> },
            { key: "s", label: t.common.status, render: (d) => <Badge status={d.status}>{label(t, "DepositStatus", d.status)}</Badge> },
            { key: "rq", label: L("الطلبات", "Requests"), hideOnMobile: true, render: (d) => d.refunds.map((r) => <div key={r.id} className="text-xs">{label(t, "RefundKind", r.kind)} <Money value={r.amount} /> <Badge status={r.status}>{label(t, "RefundStatus", r.status)}</Badge></div>) },
          ]}
        />
      </Card>
      {ctx.permissions.has("refund.write") && refundable.length > 0 && (
        <Card title={L("طلب رد أو استقطاع من التأمين (يتطلب اعتمادًا)", "Request deposit refund or deduction (requires approval)")} className="mt-4">
          <ActionForm action={requestRefundAction} submitLabel={L("إرسال للاعتماد", "Send for approval")} resetOnSuccess>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select name="depositId" label={t.nav.deposits} required placeholder={t.common.select} options={refundable.map((d) => ({ value: d.id, label: `${d.lease.number} — ${d.lease.tenant.name} (${(Number(held(d)) / 1000).toFixed(3)})` }))} />
              <Select name="kind" label={t.common.type} options={enumOptions(t, "RefundKind", ["DEPOSIT_REFUND", "DEPOSIT_DEDUCTION"])} required />
              <MoneyInput name="amount" label={t.common.amount} required />
              <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
              <Select name="method" label={L("طريقة الرد", "Refund method")} options={enumOptions(t, "PaymentMethod")} defaultValue="BANK_TRANSFER" />
              <Textarea name="reason" label={L("السبب (مثل: أضرار موثقة بمحضر الاستلام)", "Reason (e.g. damages documented at move-out)")} required />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
