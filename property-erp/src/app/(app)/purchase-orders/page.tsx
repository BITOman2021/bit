import Link from "next/link";
import { receivePoAction } from "@/app/actions/ops";
import { ActionButton } from "@/components/ui/form";
import { Alert, Badge, Card, DataTable, Empty, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listPurchaseOrders } from "@/server/services/purchasing";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listPurchaseOrders(ctx));
  return (
    <>
      <PageHeader title={t.nav.purchaseOrders} actions={ctx.permissions.has("vendor.write") && <Link className="btn-primary" href="/purchase-orders/new">+ {L("أمر شراء", "Purchase order")}</Link>} />
      {q.ok && <div className="mb-4"><Alert tone="success">{L("تم إنشاء أمر الشراء (يحتاج اعتمادًا إذا تجاوز الحد).", "PO created (needs approval above threshold).")}</Alert></div>}
      <Card bodyClassName="p-0">
        <DataTable rows={rows} rowKey={(r) => r.id} empty={<Empty title={t.common.empty} />} cols={[
          { key: "n", label: t.common.reference, primary: true, render: (r) => <span className="num font-semibold">{r.number}</span> },
          { key: "v", label: t.common.vendor, render: (r) => r.vendor.name },
          { key: "d", label: t.common.date, render: (r) => <span className="num">{fmtDate(r.date)}</span> },
          { key: "l", label: L("البنود", "Lines"), render: (r) => r.lines.map((l) => `${l.description} ×${l.quantity}`).join("، ") },
          { key: "a", label: t.common.total, align: "end", render: (r) => <Money value={r.total} /> },
          { key: "s", label: t.common.status, render: (r) => <><Badge status={r.status}>{label(t, "DocumentStatus", r.status)}</Badge>{r.receivedAt && <Badge tone="green">{L("مستلم", "Received")}</Badge>}</> },
          { key: "x", label: "", render: (r) => r.status === "APPROVED" && !r.receivedAt && ctx.permissions.has("vendor.write") && <ActionButton action={receivePoAction} fields={{ id: r.id }} label={L("تسجيل الاستلام", "Mark received")} /> },
        ]} />
      </Card>
    </>
  );
}
