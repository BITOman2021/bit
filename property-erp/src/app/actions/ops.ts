"use server";

import { redirect } from "next/navigation";
import { todayInZone } from "@/lib/dates";
import { formToObject } from "@/server/validation";
import { assertCan } from "@/server/context";
import { rule } from "@/server/errors";
import * as acc from "@/server/services/accounting";
import * as approvals from "@/server/services/approvals";
import * as banking from "@/server/services/banking";
import * as billing from "@/server/services/billing";
import * as docs from "@/server/services/documents";
import * as leases from "@/server/services/leases";
import * as mnt from "@/server/services/maintenance";
import * as notif from "@/server/services/notifications";
import * as portal from "@/server/services/portal";
import * as pur from "@/server/services/purchasing";
import * as settings from "@/server/services/settings";
import * as tasks from "@/server/services/tasks";
import * as users from "@/server/services/users";
import { run, type ActionState } from "./run";

const obj = (fd: FormData) => formToObject(fd);
const id = (fd: FormData) => String(fd.get("id") ?? "");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// ------------------------- التحصيل -------------------------
export async function recordPaymentAction(_: ActionState, fd: FormData) {
  let pid = "";
  const r = await run(async (ctx) => {
    const data = obj(fd);
    const res = await billing.recordPayment(ctx, data);
    pid = res.payment.id;
  });
  if (r.ok) redirect(`/finance/payments/${pid}?ok=1`);
  return r;
}
export async function voidPaymentAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await billing.voidPayment(ctx, { paymentId: id(fd), reason: str(fd, "reason") })), { revalidate: `/finance/payments/${id(fd)}` });
}
export async function applyCreditAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await billing.applyPaymentCredit(ctx, id(fd))), { revalidate: `/finance/payments/${id(fd)}` });
}
export async function requestRefundAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    await billing.requestRefund(ctx, obj(fd));
    return "تم إرسال الطلب للاعتماد / Sent for approval";
  }, { revalidate: "/finance/deposits" });
}

// ------------------------- المصروفات والفواتير -------------------------
export async function createExpenseAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await pur.createExpense(ctx, obj(fd))));
  if (r.ok) redirect("/finance/expenses?ok=1");
  return r;
}
export async function voidExpenseAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.voidExpense(ctx, id(fd), str(fd, "reason"))), { revalidate: "/finance/expenses" });
}
export async function createInvoiceAction(_: ActionState, fd: FormData) {
  let iid = "";
  const r = await run(async (ctx) => {
    iid = (await pur.createInvoice(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/finance/invoices/${iid}`);
  return r;
}
export async function payInvoiceAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const res = await pur.payInvoice(ctx, obj(fd));
    return res.duplicate ? "هذه الدفعة مسجلة مسبقًا / Already recorded" : "تم تسجيل الدفعة / Payment recorded";
  }, { revalidate: `/finance/invoices/${fd.get("invoiceId")}` });
}
export async function voidInvoiceAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.voidInvoice(ctx, id(fd), str(fd, "reason"))), { revalidate: `/finance/invoices/${id(fd)}` });
}

// ------------------------- القيود والحسابات -------------------------
export async function createJournalAction(_: ActionState, fd: FormData) {
  let eid = "";
  const r = await run(async (ctx) => {
    const accounts = fd.getAll("accountId[]").map(String);
    const debits = fd.getAll("debit[]").map(String);
    const credits = fd.getAll("credit[]").map(String);
    const descs = fd.getAll("lineDesc[]").map(String);
    const propsIds = fd.getAll("linePropertyId[]").map(String);
    const lines = accounts.map((a, i) => ({ accountId: a, debit: debits[i], credit: credits[i], description: descs[i], propertyId: propsIds[i] || null })).filter((l) => l.accountId && (l.debit || l.credit));
    eid = (await acc.createManualEntry(ctx, { date: str(fd, "date"), memo: str(fd, "memo"), lines, post: fd.get("post") === "on" })).id;
  });
  if (r.ok) redirect(`/finance/journal/${eid}`);
  return r;
}
export async function postJournalAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await acc.postDraftEntry(ctx, id(fd))), { revalidate: `/finance/journal/${id(fd)}` });
}
export async function deleteDraftJournalAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await acc.deleteDraftEntry(ctx, id(fd))));
  if (r.ok) redirect("/finance/journal");
  return r;
}
export async function reverseJournalAction(_: ActionState, fd: FormData) {
  let rid = "";
  const r = await run(async (ctx) => {
    rid = (await acc.reverseManualEntry(ctx, id(fd), str(fd, "reason"))).id;
  });
  if (r.ok) redirect(`/finance/journal/${rid}`);
  return r;
}
export async function createAccountAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await banking.createAccount(ctx, obj(fd))), { revalidate: "/finance/accounts" });
}
export async function toggleAccountAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await banking.toggleAccount(ctx, id(fd))), { revalidate: "/finance/accounts" });
}
export async function createBankAccountAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await banking.createBankAccount(ctx, obj(fd))), { revalidate: "/finance/bank" });
}
export async function startReconciliationAction(_: ActionState, fd: FormData) {
  let rid = "";
  const r = await run(async (ctx) => {
    rid = (await banking.startReconciliation(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/finance/bank/reconcile/${rid}`);
  return r;
}
export async function saveReconciliationAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const res = await banking.setClearedLines(ctx, id(fd), fd.getAll("lineId[]").map(String), fd.get("complete") === "on");
    return res.difference === 0n ? "الفرق صفر ✓ / Difference is zero" : "تم الحفظ / Saved";
  }, { revalidate: `/finance/bank/reconcile/${id(fd)}` });
}

// ------------------------- الصيانة -------------------------
export async function createRequestAction(_: ActionState, fd: FormData) {
  let rid = "";
  const r = await run(async (ctx) => {
    rid = (await mnt.createRequest(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/maintenance/requests/${rid}`);
  return r;
}
export async function setRequestStatusAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.setRequestStatus(ctx, id(fd), str(fd, "status") as "CLOSED")), { revalidate: `/maintenance/requests/${id(fd)}` });
}
export async function createWorkOrderAction(_: ActionState, fd: FormData) {
  let wid = "";
  const r = await run(async (ctx) => {
    wid = (await mnt.createWorkOrder(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/maintenance/work-orders/${wid}`);
  return r;
}
export async function planWorkOrderAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.updateWorkOrderPlan(ctx, id(fd), obj(fd))), { revalidate: `/maintenance/work-orders/${id(fd)}` });
}
export async function startWorkOrderAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.startWorkOrder(ctx, id(fd))), { revalidate: `/maintenance/work-orders/${id(fd)}` });
}
export async function completeWorkOrderAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const descs = fd.getAll("matDesc[]").map(String);
    const qtys = fd.getAll("matQty[]").map(String);
    const costs = fd.getAll("matCost[]").map(String);
    const materials = descs.map((d, i) => ({ description: d, quantity: qtys[i] || "1", unitCost: costs[i] })).filter((m) => m.description);
    await mnt.completeWorkOrder(ctx, id(fd), { ...obj(fd), materials });
  }, { revalidate: `/maintenance/work-orders/${id(fd)}` });
}
export async function closeWorkOrderAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.closeWorkOrder(ctx, id(fd), obj(fd))), { revalidate: `/maintenance/work-orders/${id(fd)}` });
}
export async function cancelWorkOrderAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.cancelWorkOrder(ctx, id(fd), str(fd, "reason"))), { revalidate: `/maintenance/work-orders/${id(fd)}` });
}
export async function saveScheduleAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await mnt.saveSchedule(ctx, str(fd, "id") || null, obj(fd))), { revalidate: "/maintenance/schedules" });
}
export async function saveAssetAction(_: ActionState, fd: FormData) {
  let aid = "";
  const r = await run(async (ctx) => {
    aid = (await mnt.saveAsset(ctx, str(fd, "id") || null, obj(fd))).id;
  });
  if (r.ok) redirect(`/maintenance/assets/${aid}`);
  return r;
}

// ------------------------- الموردون والمشتريات -------------------------
export async function saveVendorAction(_: ActionState, fd: FormData) {
  let vid = "";
  const r = await run(async (ctx) => {
    vid = (await pur.saveVendor(ctx, str(fd, "id") || null, { ...obj(fd), specialties: fd.getAll("specialties").map(String) })).id;
  });
  if (r.ok) redirect(`/vendors/${vid}`);
  return r;
}
export async function addVendorContractAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.addVendorContract(ctx, obj(fd))), { revalidate: `/vendors/${fd.get("vendorId")}` });
}
export async function addQuoteAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.addQuote(ctx, obj(fd))), { revalidate: "/maintenance/work-orders" });
}
export async function selectQuoteAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.selectQuote(ctx, id(fd))), { revalidate: "/maintenance/work-orders" });
}
export async function createPoAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => {
    const d = fd.getAll("lineDesc[]").map(String);
    const q = fd.getAll("lineQty[]").map(String);
    const p = fd.getAll("linePrice[]").map(String);
    const lines = d.map((x, i) => ({ description: x, quantity: q[i] || "1", unitPrice: p[i] })).filter((l) => l.description);
    await pur.createPurchaseOrder(ctx, { ...obj(fd), lines });
  });
  if (r.ok) redirect("/purchase-orders?ok=1");
  return r;
}
export async function receivePoAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await pur.receivePurchaseOrder(ctx, id(fd), str(fd, "notes"))), { revalidate: "/purchase-orders" });
}

// ------------------------- المستندات -------------------------
export async function uploadDocumentAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw rule("لم يتم اختيار ملف / No file selected");
    const meta = obj(fd);
    delete meta.file;
    await docs.uploadDocument(ctx, file, meta);
    return "تم رفع الملف / File uploaded";
  }, { revalidate: "/" });
}
export async function archiveDocumentAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await docs.archiveDocument(ctx, id(fd), str(fd, "reason"))), { revalidate: "/documents" });
}

// ------------------------- الموافقات والمهام والإشعارات -------------------------
export async function decideApprovalAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await approvals.decideApproval(ctx, { approvalId: id(fd), decision: str(fd, "decision"), note: str(fd, "reason") || str(fd, "note") })), { revalidate: "/approvals" });
}
export async function createTaskAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await tasks.createTask(ctx, obj(fd))), { revalidate: "/tasks" });
}
export async function setTaskStatusAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await tasks.setTaskStatus(ctx, id(fd), str(fd, "status") as "DONE")), { revalidate: "/tasks" });
}
export async function markReadAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await notif.markRead(ctx, str(fd, "id") || undefined)), { revalidate: "/notifications" });
}

// ------------------------- الإدارة -------------------------
export async function saveUserAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await users.saveUser(ctx, str(fd, "id") || null, { ...obj(fd), propertyIds: fd.getAll("propertyIds").map(String) })));
  if (r.ok) redirect("/admin/users?ok=1");
  return r;
}
export async function revokeSessionsAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await users.revokeSessions(ctx, id(fd))), { revalidate: "/admin/users" });
}
export async function saveSettingsAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const values: Record<string, unknown> = {};
    for (const k of Object.keys(settings.DEFAULT_SETTINGS)) {
      const def = settings.DEFAULT_SETTINGS[k as settings.SettingKey];
      if (typeof def === "boolean") values[k] = fd.get(k) === "on";
      else if (fd.has(k)) values[k] = fd.get(k);
    }
    await settings.updateSettings(ctx, values as Partial<Record<settings.SettingKey, unknown>>);
  }, { revalidate: "/admin/settings" });
}
export async function runJobsAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    assertCan(ctx, "settings.manage");
    const today = todayInZone(ctx.timezone);
    const job = str(fd, "job");
    if (job === "expire") return `عقود منتهية: ${await leases.expireLeases(ctx.orgId, today)} / Leases expired`;
    if (job === "preventive") return `أوامر وقائية جديدة: ${await mnt.generatePreventiveWorkOrders(ctx.orgId, today)} / Preventive work orders`;
    return `تنبيهات جديدة: ${await notif.generateAlerts(ctx.orgId, today)} / New alerts`;
  });
}
export async function changePasswordAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => {
    if (str(fd, "next") !== str(fd, "next2")) throw rule("كلمتا المرور غير متطابقتين / Passwords do not match");
    await users.changeOwnPassword(ctx, str(fd, "current"), str(fd, "next"));
  });
  if (r.ok) redirect("/login");
  return r;
}

// ------------------------- بوابة المستأجر -------------------------
export async function portalRequestAction(_: ActionState, fd: FormData) {
  let rid = "";
  const r = await run(async (ctx) => {
    const req = await mnt.createTenantRequest(ctx, obj(fd));
    rid = req.id;
    const photos = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    for (const p of photos.slice(0, 5)) await docs.uploadDocument(ctx, p, { category: "PHOTO", title: p.name, requestId: req.id });
  });
  if (r.ok) redirect(`/portal?ok=request&r=${rid}`);
  return r;
}
export async function portalInquiryAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    await portal.createInquiry(ctx, obj(fd));
    return "تم إرسال استفسارك / Inquiry sent";
  }, { revalidate: "/portal" });
}
export async function portalContactAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    await portal.requestContactUpdate(ctx, obj(fd));
    return "تم إرسال طلب التحديث للاعتماد / Update request sent for approval";
  });
}
export async function replyInquiryAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await portal.replyInquiry(ctx, obj(fd))), { revalidate: "/tenants" });
}
