import { beforeEach, describe, expect, it } from "vitest";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { login, validateSessionToken, LOGIN_LIMITS } from "@/server/auth/session";
import { verifyFileToken, signFileToken } from "@/server/storage";
import { recordPayment } from "@/server/services/billing";
import { assertDocumentAccess, uploadDocument } from "@/server/services/documents";
import { getLease, listLeases } from "@/server/services/leases";
import { completeWorkOrder, createTenantRequest, createWorkOrder, generatePreventiveWorkOrders, getWorkOrder, listWorkOrders, saveSchedule, startWorkOrder } from "@/server/services/maintenance";
import { portalOverview } from "@/server/services/portal";
import { createOwner, createProperty, getProperty, listProperties, setOwnershipShares } from "@/server/services/properties";
import { createExpense, createInvoice, listExpenseCategories, saveVendor } from "@/server/services/purchasing";
import { getTenant } from "@/server/services/tenants";
import { createTenant } from "@/server/services/tenants";
import { runReport } from "@/server/services/reports";
import { key, makeActiveLease, makeProperty, setupWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await setupWorld();
});

const pdf = (body = "hello") => new File([Buffer.from(`%PDF-1.4\n${body}\n%%EOF`)], "doc.pdf", { type: "application/pdf" });

describe("role-based access is enforced on the server", () => {
  it("collector cannot record expenses or post journals", async () => {
    const { property } = await makeProperty(w.admin);
    const collector = await w.ctxFor("COLLECTOR");
    const cats = await listExpenseCategories(w.admin);
    await expect(createExpense(collector, { date: "2026-01-01", categoryId: cats[0].id, description: "x", amount: "1", propertyId: property.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("restricted user only sees and acts on assigned properties", async () => {
    const a = await makeProperty(w.admin, "Tower A", ["A1"]);
    const b = await makeProperty(w.admin, "Tower B", ["B1"]);
    const leaseB = await makeActiveLease(w.admin, b.units[0].id, { tenantName: "Tenant B" });
    const mgr = await w.ctxFor("PROPERTY_MANAGER", { propertyIds: [a.property.id] });
    const props = await listProperties(mgr);
    expect(props.map((p) => p.id)).toEqual([a.property.id]);
    await expect(getProperty(mgr, b.property.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getLease(mgr, leaseB.lease.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listLeases(mgr)).toHaveLength(0);
    await expect(getTenant(mgr, leaseB.tenant.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordPayment(mgr, { tenantId: leaseB.tenant.id, leaseId: leaseB.lease.id, amount: "10", method: "CASH", receivedDate: "2026-01-02", idempotencyKey: key() })).rejects.toBeInstanceOf(AppError);
  });

  it("owner sees only properties they own and their own statement", async () => {
    const a = await makeProperty(w.admin, "Owned", ["1"]);
    await makeProperty(w.admin, "Not owned", ["1"]);
    const owner = await createOwner(w.admin, { name: "Salim Al Harthy" });
    const other = await createOwner(w.admin, { name: "Other Owner" });
    await setOwnershipShares(w.admin, { propertyId: a.property.id, effectiveFrom: "2020-01-01", shares: [{ ownerId: owner.id, percentage: "60" }, { ownerId: other.id, percentage: "40" }] });
    const octx = await w.ctxFor("OWNER", { ownerId: owner.id, scope: "RESTRICTED" });
    const props = await listProperties(octx);
    expect(props.map((p) => p.id)).toEqual([a.property.id]);
    const stmt = await runReport(octx, "owner-statement", { ownerId: other.id, from: "2026-01-01", to: "2026-12-31" });
    // يتم تجاهل ownerId المرسل: المالك يرى كشفه فقط
    expect(stmt.totals!.property).toBe("Salim Al Harthy");
  });

  it("ownership shares must total exactly 100%", async () => {
    const a = await makeProperty(w.admin, "P", ["1"]);
    const o1 = await createOwner(w.admin, { name: "O1" });
    const o2 = await createOwner(w.admin, { name: "O2" });
    await expect(setOwnershipShares(w.admin, { propertyId: a.property.id, effectiveFrom: "2026-01-01", shares: [{ ownerId: o1.id, percentage: "50" }, { ownerId: o2.id, percentage: "49.9999" }] })).rejects.toBeInstanceOf(AppError);
    await setOwnershipShares(w.admin, { propertyId: a.property.id, effectiveFrom: "2026-01-01", shares: [{ ownerId: o1.id, percentage: "33.3333" }, { ownerId: o2.id, percentage: "66.6667" }] });
    expect(await prisma.ownershipShare.count({ where: { propertyId: a.property.id } })).toBe(2);
  });

  it("technician sees only work orders assigned to them", async () => {
    const { property } = await makeProperty(w.admin);
    const tech1 = await w.ctxFor("TECHNICIAN");
    const tech2 = await w.ctxFor("TECHNICIAN");
    const wo = await createWorkOrder(w.admin, { propertyId: property.id, category: "PLUMBING", title: "Fix leak", assignedToId: tech1.userId });
    await createWorkOrder(w.admin, { propertyId: property.id, category: "HVAC", title: "Service AC" });
    expect((await listWorkOrders(tech1)).map((x) => x.id)).toEqual([wo.id]);
    expect(await listWorkOrders(tech2)).toHaveLength(0);
    await expect(getWorkOrder(tech2, wo.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startWorkOrder(tech2, wo.id)).rejects.toBeInstanceOf(AppError);
    await startWorkOrder(tech1, wo.id);
    await completeWorkOrder(tech1, wo.id, { completionReport: "Replaced washer", laborHours: "1.5", materials: [{ description: "Washer", quantity: "2", unitCost: "0.750" }] });
    const done = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.materialsCost.toString()).toBe("1.5");
  });

  it("tenant portal: tenant sees only their own data and can only raise requests on their unit", async () => {
    const { units } = await makeProperty(w.admin);
    const mine = await makeActiveLease(w.admin, units[0].id, { tenantName: "Me" });
    const other = await makeActiveLease(w.admin, units[1].id, { tenantName: "Other" });
    const t = await w.ctxFor("TENANT", { tenantId: mine.tenant.id, scope: "RESTRICTED" });
    const ov = await portalOverview(t);
    expect(ov.leases.map((l) => l.id)).toEqual([mine.lease.id]);
    await expect(getLease(t, other.lease.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createTenantRequest(t, { unitId: units[1].id, title: "x", description: "y" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const r = await createTenantRequest(t, { unitId: units[0].id, title: "تسرب مياه في المطبخ", description: "الماء يتسرب من تحت المغسلة" });
    expect(r.category).toBe("PLUMBING");
    expect(r.priority).toBe("HIGH");
    await expect(listProperties(t)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("documents", () => {
  it("validates real file types and sizes", async () => {
    const { property } = await makeProperty(w.admin);
    const exe = new File([Buffer.from("MZ\x90\x00 fake exe")], "invoice.pdf", { type: "application/pdf" });
    await expect(uploadDocument(w.admin, exe, { category: "INVOICE", title: "x", propertyId: property.id })).rejects.toMatchObject({ code: "VALIDATION" });
    const empty = new File([], "a.pdf");
    await expect(uploadDocument(w.admin, empty, { category: "INVOICE", title: "x", propertyId: property.id })).rejects.toMatchObject({ code: "VALIDATION" });
    const doc = await uploadDocument(w.admin, pdf(), { category: "INVOICE", title: "Bill", propertyId: property.id });
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.storedName).toMatch(/^[a-f0-9]{32}\.pdf$/);
  });

  it("sensitive tenant documents are hidden from users without permission and from other tenants", async () => {
    const { units } = await makeProperty(w.admin);
    const a = await makeActiveLease(w.admin, units[0].id, { tenantName: "A" });
    const b = await makeActiveLease(w.admin, units[1].id, { tenantName: "B" });
    const idDoc = await uploadDocument(w.admin, pdf("id"), { category: "TENANT_ID", title: "ID card", tenantId: a.tenant.id });
    expect(idDoc.isSensitive).toBe(true);
    const collector = await w.ctxFor("COLLECTOR");
    await expect(assertDocumentAccess(collector, idDoc.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const leasing = await w.ctxFor("LEASING");
    await expect(assertDocumentAccess(leasing, idDoc.id)).resolves.toBeTruthy();
    const tb = await w.ctxFor("TENANT", { tenantId: b.tenant.id, scope: "RESTRICTED" });
    await expect(assertDocumentAccess(tb, idDoc.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ta = await w.ctxFor("TENANT", { tenantId: a.tenant.id, scope: "RESTRICTED" });
    await expect(assertDocumentAccess(ta, idDoc.id)).resolves.toBeTruthy();
  });

  it("signed file links expire and cannot be forged", () => {
    const t = signFileToken("doc1", "user1", 60);
    expect(verifyFileToken(t)).toEqual({ documentId: "doc1", userId: "user1" });
    const forged = Buffer.from(Buffer.from(t, "base64url").toString().replace("doc1", "doc2")).toString("base64url");
    expect(verifyFileToken(forged)).toBeNull();
    expect(verifyFileToken(signFileToken("doc1", "user1", -1))).toBeNull();
    expect(verifyFileToken("garbage")).toBeNull();
  });
});

describe("authentication", () => {
  it("logs in, rejects wrong passwords, and locks after repeated failures", async () => {
    const meta = { ip: "10.0.0.1", userAgent: "vitest" };
    const ok = await login("ADMIN@test.om", "AdminPass123", meta);
    expect(await validateSessionToken(ok.token)).not.toBeNull();
    expect(await validateSessionToken("not-a-token")).toBeNull();
    const hashOnly = await prisma.session.findFirstOrThrow();
    expect(hashOnly.tokenHash).not.toBe(ok.token);

    for (let i = 0; i < LOGIN_LIMITS.maxFailuresPerEmail; i++) {
      await expect(login("admin@test.om", "wrong-password", meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(login("admin@test.om", "AdminPass123", meta)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const audits = await prisma.auditLog.count({ where: { action: "auth.login_failed" } });
    expect(audits).toBe(LOGIN_LIMITS.maxFailuresPerEmail);
    await expect(login("nobody@test.om", "x", meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rate-limits an IP with many failed attempts across accounts", async () => {
    const meta = { ip: "10.9.9.9", userAgent: "vitest" };
    for (let i = 0; i < LOGIN_LIMITS.maxFailuresPerIp; i++) {
      await login(`user${i}@nowhere.om`, "x", meta).catch(() => undefined);
    }
    await expect(login("admin@test.om", "AdminPass123", meta)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("maintenance workflows", () => {
  it("preventive schedule generation never duplicates work orders", async () => {
    const { property } = await makeProperty(w.admin);
    const today = todayInZone();
    const due = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    await saveSchedule(w.admin, null, { name: "AC filter cleaning", propertyId: property.id, category: "HVAC", frequencyUnit: "MONTH", interval: "1", nextDueDate: due, leadDays: "7" });
    expect(await generatePreventiveWorkOrders(w.orgId, today)).toBe(1);
    expect(await generatePreventiveWorkOrders(w.orgId, today)).toBe(0);
    expect(await prisma.workOrder.count({ where: { type: "PREVENTIVE" } })).toBe(1);
  });

  it("work order cost above threshold needs approval before work starts; links to invoices", async () => {
    const { property } = await makeProperty(w.admin);
    const tech = await w.ctxFor("TECHNICIAN");
    const mm = await w.ctxFor("MAINTENANCE_MANAGER");
    const wo = await createWorkOrder(mm, { propertyId: property.id, category: "ELEVATOR", title: "Lift motor", assignedToId: tech.userId, estimatedCost: "900" });
    await expect(startWorkOrder(tech, wo.id)).rejects.toThrow(/awaiting approval/);
    const ap = await prisma.approval.findFirstOrThrow({ where: { type: "WORK_ORDER_COST", entityId: wo.id } });
    const { decideApproval } = await import("@/server/services/approvals");
    await decideApproval(w.admin, { approvalId: ap.id, decision: "APPROVE" });
    await startWorkOrder(tech, wo.id);
    const vendor = await saveVendor(w.admin, null, { name: "Lift Co", specialties: ["ELEVATOR"] });
    const cats = await listExpenseCategories(w.admin);
    await createInvoice(w.admin, { vendorId: vendor.id, vendorInvoiceNo: "L-1", date: "2026-05-01", dueDate: "2026-05-30", categoryId: cats.find((c) => c.code === "MAINT")!.id, description: "Lift motor", amount: "450", propertyId: property.id, workOrderId: wo.id });
    const detail = await getWorkOrder(w.admin, wo.id);
    expect(detail.postedCosts).toBe(450000n);
  });
});

describe("tenant data protection", () => {
  it("masks ID numbers without the sensitive permission", async () => {
    const t = await createTenant(w.admin, { name: "Masked", idNumber: "12345678" });
    const collector = await w.ctxFor("COLLECTOR");
    expect((await getTenant(collector, t.id)).idNumber).toBe("•••• 678");
    const leasing = await w.ctxFor("LEASING");
    expect((await getTenant(leasing, t.id)).idNumber).toBe("12345678");
  });

  it("property creation is audited", async () => {
    await createProperty(w.admin, { name: "Audited", type: "LAND" });
    expect(await prisma.auditLog.count({ where: { action: "property.create" } })).toBe(1);
  });
});
