import { z } from "zod";
import { hashPassword, passwordPolicyError } from "../auth/password";
import { destroyAllSessions } from "../auth/session";
import { audit } from "../audit";
import { assertCan, type Ctx } from "../context";
import { prisma } from "../db";
import { AppError, notFound, rule } from "../errors";
import { parse, zBool, zId, zOptId, zOptStr, zStr } from "../validation";

const userSchema = z.object({
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().email().max(200)),
  name: zStr(200),
  phone: zOptStr(30),
  roleId: zId,
  propertyScope: z.enum(["ALL", "RESTRICTED"]).default("RESTRICTED"),
  propertyIds: z.array(z.string().max(40)).default([]),
  locale: z.enum(["ar", "en"]).default("ar"),
  isActive: zBool.default(true),
  tenantId: zOptId,
  ownerId: zOptId,
  password: zOptStr(200),
});

export async function listUsers(ctx: Ctx) {
  assertCan(ctx, "user.manage");
  return prisma.user.findMany({
    where: { organizationId: ctx.orgId },
    include: { role: true, propertyAccess: { include: { property: { select: { code: true, name: true } } } }, tenant: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function listRoles(ctx: Ctx) {
  return prisma.role.findMany({ where: { organizationId: ctx.orgId }, include: { permissions: true, _count: { select: { users: true } } }, orderBy: { nameEn: "asc" } });
}

export async function saveUser(ctx: Ctx, id: string | null, input: unknown) {
  assertCan(ctx, "user.manage");
  const v = parse(userSchema, input);
  if (!id && !v.password) throw rule("كلمة المرور مطلوب للمستخدم الجديد / Password required");
  if (v.password) {
    const e = passwordPolicyError(v.password);
    if (e) throw rule(e);
  }
  const role = await prisma.role.findFirst({ where: { id: v.roleId, organizationId: ctx.orgId } });
  if (!role) throw notFound("الدور غير موجود / Role not found");
  if (role.key === "TENANT" && !v.tenantId) throw rule("يجب ربط حساب المستأجر بملف مستأجر / Tenant account must be linked to a tenant");
  if (role.key === "OWNER" && !v.ownerId) throw rule("يجب ربط حساب المالك بملف مالك / Owner account must be linked to an owner");
  if (id === ctx.userId && (!v.isActive || role.key !== ctx.roleKey)) throw rule("لا يمكنك تعطيل حسابك أو تغيير دورك / You cannot deactivate yourself or change your own role");
  const passwordHash = v.password ? await hashPassword(v.password) : undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const data = {
        email: v.email,
        name: v.name,
        phone: v.phone,
        roleId: v.roleId,
        propertyScope: role.key === "TENANT" || role.key === "OWNER" ? ("RESTRICTED" as const) : v.propertyScope,
        locale: v.locale,
        isActive: v.isActive,
      };
      const before = id ? await tx.user.findFirst({ where: { id, organizationId: ctx.orgId } }) : null;
      if (id && !before) throw notFound();
      const user = id
        ? await tx.user.update({ where: { id }, data: { ...data, ...(passwordHash ? { passwordHash, failedLogins: 0, lockedUntil: null } : {}) } })
        : await tx.user.create({ data: { ...data, organizationId: ctx.orgId, passwordHash: passwordHash! } });
      await tx.userPropertyAccess.deleteMany({ where: { userId: user.id } });
      if (data.propertyScope === "RESTRICTED" && v.propertyIds.length && role.key !== "TENANT" && role.key !== "OWNER") {
        const props = await tx.property.findMany({ where: { id: { in: v.propertyIds }, organizationId: ctx.orgId }, select: { id: true } });
        await tx.userPropertyAccess.createMany({ data: props.map((p) => ({ userId: user.id, propertyId: p.id })) });
      }
      await tx.tenant.updateMany({ where: { userId: user.id }, data: { userId: null } });
      await tx.owner.updateMany({ where: { userId: user.id }, data: { userId: null } });
      if (role.key === "TENANT" && v.tenantId) await tx.tenant.update({ where: { id: (await tx.tenant.findFirstOrThrow({ where: { id: v.tenantId, organizationId: ctx.orgId } })).id }, data: { userId: user.id } });
      if (role.key === "OWNER" && v.ownerId) await tx.owner.update({ where: { id: (await tx.owner.findFirstOrThrow({ where: { id: v.ownerId, organizationId: ctx.orgId } })).id }, data: { userId: user.id } });
      if (before && (!v.isActive || passwordHash || before.roleId !== v.roleId)) await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, ctx, { action: id ? "user.update" : "user.create", entityType: "User", entityId: user.id, summary: `${user.email} (${role.key})`, before, after: { ...data, propertyIds: v.propertyIds } });
      return user;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT", "البريد الإلكتروني مستخدم أو الملف مرتبط بحساب آخر / Email in use or profile already linked");
    throw e;
  }
}

export async function revokeSessions(ctx: Ctx, userId: string) {
  assertCan(ctx, "user.manage");
  const u = await prisma.user.findFirst({ where: { id: userId, organizationId: ctx.orgId } });
  if (!u) throw notFound();
  await destroyAllSessions(userId);
  await audit(prisma, ctx, { action: "user.revoke_sessions", entityType: "User", entityId: userId });
}

export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  const { verifyPassword } = await import("../auth/password");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(current, u.passwordHash))) throw rule("كلمة المرور الحالية غير صحيحة / Current password is incorrect");
  const e = passwordPolicyError(next);
  if (e) throw rule(e);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  await prisma.session.deleteMany({ where: { userId: u.id } });
  await audit(prisma, ctx, { action: "user.change_password", entityType: "User", entityId: u.id });
}

export async function setLocale(ctx: Ctx, locale: "ar" | "en") {
  await prisma.user.update({ where: { id: ctx.userId }, data: { locale } });
}

export async function listAudit(ctx: Ctx, f: { q?: string; entityType?: string; userId?: string; from?: string; to?: string; page?: number } = {}) {
  assertCan(ctx, "audit.read");
  const take = 100;
  const where = {
    organizationId: ctx.orgId,
    entityType: f.entityType || undefined,
    userId: f.userId || undefined,
    createdAt: { gte: f.from ? new Date(`${f.from}T00:00:00Z`) : undefined, lte: f.to ? new Date(`${f.to}T23:59:59Z`) : undefined },
    OR: f.q ? [{ action: { contains: f.q } }, { summary: { contains: f.q, mode: "insensitive" as const } }, { entityId: f.q }] : undefined,
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip: ((f.page ?? 1) - 1) * take }),
    prisma.auditLog.count({ where }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { rows: rows.map((r) => ({ ...r, userName: r.userId ? (names.get(r.userId) ?? r.userId) : "system" })), total, pages: Math.ceil(total / take) };
}
