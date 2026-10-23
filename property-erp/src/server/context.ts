import { prisma, type Db } from "./db";
import { AppError, forbidden } from "./errors";
import type { Permission } from "./auth/permissions";

/** سياق المستخدم الموثوق — يُبنى على الخادم فقط من الجلسة */
export interface Ctx {
  orgId: string;
  userId: string;
  userName: string;
  email: string;
  roleKey: string;
  permissions: Set<string>;
  /** null = كل العقارات؛ مصفوفة = العقارات المسموح بها فقط */
  propertyIds: string[] | null;
  tenantId: string | null;
  ownerId: string | null;
  timezone: string;
  locale: "ar" | "en";
  ip?: string | null;
  userAgent?: string | null;
}

export async function buildContext(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}, db: Db = prisma): Promise<Ctx> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: true } },
      organization: true,
      propertyAccess: true,
      tenant: true,
      owner: { include: { shares: true } },
    },
  });
  if (!user || !user.isActive) throw new AppError("UNAUTHENTICATED", "Session is no longer valid");

  let propertyIds: string[] | null = null;
  if (user.role.key === "OWNER") {
    // المالك يرى العقارات التي يملك فيها حصة فقط
    propertyIds = [...new Set((user.owner?.shares ?? []).filter((s) => !s.effectiveTo || s.effectiveTo >= new Date()).map((s) => s.propertyId))];
  } else if (user.role.key === "TENANT") {
    propertyIds = [];
  } else if (user.propertyScope === "RESTRICTED") {
    propertyIds = user.propertyAccess.map((a) => a.propertyId);
  }

  return {
    orgId: user.organizationId,
    userId: user.id,
    userName: user.name,
    email: user.email,
    roleKey: user.role.key,
    permissions: new Set(user.role.permissions.map((p) => p.permissionKey)),
    propertyIds,
    tenantId: user.tenant?.id ?? null,
    ownerId: user.owner?.id ?? null,
    timezone: user.organization.timezone,
    locale: user.locale === "en" ? "en" : "ar",
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  };
}

export function can(ctx: Ctx, perm: Permission): boolean {
  return ctx.permissions.has(perm);
}

export function canAny(ctx: Ctx, ...perms: Permission[]): boolean {
  return perms.some((p) => ctx.permissions.has(p));
}

export function assertCan(ctx: Ctx, ...perms: Permission[]): void {
  for (const p of perms) if (!ctx.permissions.has(p)) throw forbidden();
}

export function assertCanAny(ctx: Ctx, ...perms: Permission[]): void {
  if (!canAny(ctx, ...perms)) throw forbidden();
}

/** فلتر Prisma على propertyId حسب نطاق المستخدم */
export function scopeIn(ctx: Ctx): { in: string[] } | undefined {
  return ctx.propertyIds === null ? undefined : { in: ctx.propertyIds };
}

export function hasPropertyAccess(ctx: Ctx, propertyId: string | null | undefined): boolean {
  if (ctx.propertyIds === null) return true;
  if (!propertyId) return false;
  return ctx.propertyIds.includes(propertyId);
}

export function assertPropertyAccess(ctx: Ctx, propertyId: string | null | undefined): void {
  if (!hasPropertyAccess(ctx, propertyId)) throw forbidden();
}
