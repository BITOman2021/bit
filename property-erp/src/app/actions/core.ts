"use server";

import { redirect } from "next/navigation";
import { formToObject } from "@/server/validation";
import * as props from "@/server/services/properties";
import * as tenants from "@/server/services/tenants";
import * as leases from "@/server/services/leases";
import * as charges from "@/server/services/charges";
import { run, type ActionState } from "./run";

const obj = (fd: FormData) => formToObject(fd);
const id = (fd: FormData) => String(fd.get("id") ?? "");

// ------------------------- العقارات -------------------------
export async function createPropertyAction(_: ActionState, fd: FormData) {
  let newId = "";
  const r = await run(async (ctx) => {
    newId = (await props.createProperty(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/properties/${newId}`);
  return r;
}
export async function updatePropertyAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await props.updateProperty(ctx, id(fd), obj(fd))));
  if (r.ok) redirect(`/properties/${id(fd)}`);
  return r;
}
export async function archivePropertyAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await props.archiveProperty(ctx, id(fd))));
  if (r.ok) redirect("/properties");
  return r;
}
export async function createBuildingAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.createBuilding(ctx, obj(fd))), { revalidate: `/properties/${fd.get("propertyId")}` });
}
export async function createFloorAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.createFloor(ctx, obj(fd))), { revalidate: "/properties" });
}
export async function createUnitAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.createUnit(ctx, obj(fd))), { revalidate: `/properties/${fd.get("propertyId")}` });
}
export async function updateUnitAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.updateUnit(ctx, id(fd), obj(fd))), { revalidate: `/units/${id(fd)}` });
}
export async function archiveUnitAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await props.archiveUnit(ctx, id(fd))));
  if (r.ok) redirect("/units");
  return r;
}
export async function createInspectionAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.createInspection(ctx, obj(fd))), { revalidate: "/units" });
}
export async function createOwnerAction(_: ActionState, fd: FormData) {
  let newId = "";
  const r = await run(async (ctx) => {
    newId = (await props.createOwner(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/owners/${newId}`);
  return r;
}
export async function updateOwnerAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await props.updateOwner(ctx, id(fd), obj(fd))), { revalidate: `/owners/${id(fd)}` });
}
export async function setSharesAction(_: ActionState, fd: FormData) {
  const owners = fd.getAll("ownerId[]").map(String);
  const pcts = fd.getAll("percentage[]").map(String);
  const shares = owners.map((o, i) => ({ ownerId: o, percentage: pcts[i] })).filter((s) => s.ownerId && s.percentage);
  return run(
    async (ctx) => void (await props.setOwnershipShares(ctx, { propertyId: fd.get("propertyId"), effectiveFrom: fd.get("effectiveFrom"), documentRef: fd.get("documentRef"), shares })),
    { revalidate: `/properties/${fd.get("propertyId")}` },
  );
}

// ------------------------- المستأجرون -------------------------
export async function createTenantAction(_: ActionState, fd: FormData) {
  let newId = "";
  const r = await run(async (ctx) => {
    newId = (await tenants.createTenant(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/tenants/${newId}`);
  return r;
}
export async function updateTenantAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await tenants.updateTenant(ctx, id(fd), obj(fd))));
  if (r.ok) redirect(`/tenants/${id(fd)}`);
  return r;
}

// ------------------------- العقود -------------------------
export async function createLeaseAction(_: ActionState, fd: FormData) {
  let newId = "";
  const r = await run(async (ctx) => {
    newId = (await leases.createLease(ctx, obj(fd))).id;
  });
  if (r.ok) redirect(`/leases/${newId}`);
  return r;
}
export async function updateLeaseAction(_: ActionState, fd: FormData) {
  const r = await run(async (ctx) => void (await leases.updateDraftLease(ctx, id(fd), obj(fd), String(fd.get("changeReason") ?? "") || undefined)));
  if (r.ok) redirect(`/leases/${id(fd)}`);
  return r;
}
export async function activateLeaseAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await leases.activateLease(ctx, id(fd))), { revalidate: `/leases/${id(fd)}` });
}
export async function cancelLeaseAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await leases.cancelDraftLease(ctx, id(fd), String(fd.get("reason") ?? ""))), { revalidate: `/leases/${id(fd)}` });
}
export async function renewLeaseAction(_: ActionState, fd: FormData) {
  let newId = "";
  const r = await run(async (ctx) => {
    newId = (await leases.renewLease(ctx, id(fd), obj(fd))).id;
  });
  if (r.ok) redirect(`/leases/${newId}`);
  return r;
}
export async function terminateLeaseAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => {
    const res = await leases.terminateLease(ctx, id(fd), obj(fd));
    return `تم الإنهاء. استحقاقات ملغاة: ${res.voided}${res.keptPaid.length ? ` — مدفوعة مسبقًا لم تُلغَ: ${res.keptPaid.join(", ")}` : ""} / Terminated`;
  }, { revalidate: `/leases/${id(fd)}` });
}
export async function addChargeAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await charges.addManualCharge(ctx, obj(fd))), { revalidate: `/leases/${fd.get("leaseId")}` });
}
export async function voidChargeAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await charges.voidCharge(ctx, obj(fd))), { revalidate: "/leases" });
}
export async function saveTemplateAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await leases.saveTemplate(ctx, obj(fd))), { revalidate: "/leases/templates" });
}
export async function approveTemplateAction(_: ActionState, fd: FormData) {
  return run(async (ctx) => void (await leases.approveTemplate(ctx, id(fd))), { revalidate: "/leases/templates" });
}
