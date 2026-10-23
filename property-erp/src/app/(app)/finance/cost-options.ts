import type { Ctx } from "@/server/context";
import { listProperties, listUnits } from "@/server/services/properties";
import { listExpenseCategories, listVendors } from "@/server/services/purchasing";
import { prisma } from "@/server/db";

export async function costOptions(ctx: Ctx, locale: "ar" | "en") {
  const [props, units, vendors, cats, wos] = await Promise.all([
    listProperties(ctx),
    listUnits(ctx),
    ctx.permissions.has("vendor.read") ? listVendors(ctx) : Promise.resolve([]),
    listExpenseCategories(ctx),
    prisma.workOrder.findMany({ where: { organizationId: ctx.orgId, status: { notIn: ["CANCELLED"] }, propertyId: ctx.propertyIds === null ? undefined : { in: ctx.propertyIds } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return {
    props: props.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    units: units.map((u) => ({ value: u.id, label: `${u.property.code} / ${u.unitNumber}` })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.name })),
    cats: cats.map((c) => ({ value: c.id, label: `${locale === "ar" ? c.nameAr : c.nameEn}${c.isCapital ? " (CAPEX)" : ""}` })),
    workOrders: wos.map((w) => ({ value: w.id, label: `${w.number} ${w.title}` })),
  };
}
