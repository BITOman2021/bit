import type { Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { listRoles } from "@/server/services/users";

export async function userOptions(ctx: Ctx) {
  const [roles, props, tenants, owners] = await Promise.all([
    listRoles(ctx),
    prisma.property.findMany({ where: { organizationId: ctx.orgId, archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.tenant.findMany({ where: { organizationId: ctx.orgId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.owner.findMany({ where: { organizationId: ctx.orgId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { roles, props, tenants, owners };
}
