import { randomUUID } from "node:crypto";
import { hashPassword } from "@/server/auth/password";
import { buildContext, type Ctx } from "@/server/context";
import { prisma } from "@/server/db";
import { bootstrapOrganization } from "@/server/services/bootstrap";
import { createProperty, createUnit } from "@/server/services/properties";
import { createTenant } from "@/server/services/tenants";
import { createLease, activateLease } from "@/server/services/leases";

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$transaction([prisma.$executeRawUnsafe(`SET LOCAL gsw.allow_truncate = 'on'`), prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`)]);
}

export interface World {
  orgId: string;
  admin: Ctx;
  ctxFor: (roleKey: string, opts?: { propertyIds?: string[]; scope?: "ALL" | "RESTRICTED"; tenantId?: string; ownerId?: string }) => Promise<Ctx>;
}

export async function setupWorld(): Promise<World> {
  await resetDatabase();
  const { org, admin } = await bootstrapOrganization({ orgName: "Test Org", adminEmail: "admin@test.om", adminName: "Admin", adminPassword: "AdminPass123" });
  const adminCtx = await buildContext(admin.id);
  const hash = await hashPassword("UserPass1234");
  return {
    orgId: org.id,
    admin: adminCtx,
    async ctxFor(roleKey, opts = {}) {
      const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: roleKey } } });
      const user = await prisma.user.create({
        data: { organizationId: org.id, email: `${roleKey.toLowerCase()}-${randomUUID().slice(0, 8)}@test.om`, name: `${roleKey} user`, passwordHash: hash, roleId: role.id, propertyScope: opts.scope ?? (opts.propertyIds ? "RESTRICTED" : "ALL") },
      });
      if (opts.propertyIds) await prisma.userPropertyAccess.createMany({ data: opts.propertyIds.map((p) => ({ userId: user.id, propertyId: p })) });
      if (opts.tenantId) await prisma.tenant.update({ where: { id: opts.tenantId }, data: { userId: user.id } });
      if (opts.ownerId) await prisma.owner.update({ where: { id: opts.ownerId }, data: { userId: user.id } });
      return buildContext(user.id);
    },
  };
}

export async function makeProperty(ctx: Ctx, name = "Al Khuwair Tower", units = ["101", "102", "103"]) {
  const p = await createProperty(ctx, { name, type: "RESIDENTIAL_BUILDING", wilayat: "Bawshar", governorate: "Muscat" });
  const unitRows = [];
  for (const u of units) unitRows.push(await createUnit(ctx, { propertyId: p.id, unitNumber: u, type: "APARTMENT", marketRent: "450" }));
  return { property: p, units: unitRows };
}

export async function makeActiveLease(ctx: Ctx, unitId: string, opts: Partial<Record<string, string>> = {}) {
  const tenant = await createTenant(ctx, { name: opts.tenantName ?? "Ahmed Al Balushi", phone: "+968 9123 4567" });
  const lease = await createLease(ctx, {
    unitId,
    tenantId: tenant.id,
    startDate: opts.startDate ?? "2026-01-01",
    endDate: opts.endDate ?? "2026-12-31",
    monthlyRent: opts.monthlyRent ?? "450",
    frequency: opts.frequency ?? "MONTHLY",
    depositAmount: opts.depositAmount ?? "450",
    vatRate: "0",
  });
  await activateLease(ctx, lease.id);
  return { tenant, lease };
}

export const key = () => randomUUID();
