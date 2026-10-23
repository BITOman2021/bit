import type { Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { listProperties, listUnits } from "@/server/services/properties";
import { listVendors } from "@/server/services/purchasing";

export async function maintenanceOptions(ctx: Ctx) {
  const [props, units, vendors, techs, assets] = await Promise.all([
    listProperties(ctx),
    listUnits(ctx),
    ctx.permissions.has("vendor.read") ? listVendors(ctx) : Promise.resolve([]),
    prisma.user.findMany({ where: { organizationId: ctx.orgId, isActive: true, role: { permissions: { some: { permissionKey: "workorder.assigned" } } } }, select: { id: true, name: true } }),
    prisma.asset.findMany({ where: { organizationId: ctx.orgId, propertyId: ctx.propertyIds === null ? undefined : { in: ctx.propertyIds } }, select: { id: true, tag: true, name: true } }),
  ]);
  return {
    props: props.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    units: units.map((u) => ({ value: u.id, label: `${u.property.code} / ${u.unitNumber}` })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.name })),
    techs: techs.map((u) => ({ value: u.id, label: u.name })),
    assets: assets.map((a) => ({ value: a.id, label: `${a.tag} ${a.name}` })),
  };
}
