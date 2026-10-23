import { createHash, randomBytes } from "node:crypto";
import { audit } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "gsw_session";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
/** مهلة الخمول قبل انتهاء الجلسة */
const IDLE_MINUTES = 120;

export const LOGIN_LIMITS = {
  windowMinutes: 15,
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 25,
  lockMinutes: 15,
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000 || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return;
  await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
  await audit(prisma, { orgId: session.user.organizationId, userId: session.userId }, { action: "auth.logout", entityType: "User", entityId: session.userId });
}

export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** تسجيل الدخول مع الحد من المحاولات وقفل الحساب مؤقتًا */
export async function login(emailRaw: string, password: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  const since = new Date(Date.now() - LOGIN_LIMITS.windowMinutes * 60_000);
  if (meta.ip) {
    const ipFailures = await prisma.loginAttempt.count({ where: { ip: meta.ip, success: false, createdAt: { gte: since } } });
    if (ipFailures >= LOGIN_LIMITS.maxFailuresPerIp) {
      throw new AppError("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا / Too many attempts, try again later");
    }
  }
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  const fail = async (reason: string) => {
    await prisma.loginAttempt.create({ data: { email, ip: meta.ip ?? null, success: false, reason } });
    if (user) {
      const failures = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failures, lockedUntil: failures >= LOGIN_LIMITS.maxFailuresPerEmail ? new Date(Date.now() + LOGIN_LIMITS.lockMinutes * 60_000) : undefined },
      });
      await audit(prisma, { orgId: user.organizationId, userId: user.id, ip: meta.ip, userAgent: meta.userAgent }, { action: "auth.login_failed", entityType: "User", entityId: user.id, summary: reason });
    }
    throw new AppError("UNAUTHENTICATED", "البريد الإلكتروني أو كلمة المرور غير صحيحة / Invalid email or password");
  };

  if (!user) {
    // تجزئة وهمية لتوحيد زمن الاستجابة
    await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    return fail("unknown_user");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await prisma.loginAttempt.create({ data: { email, ip: meta.ip ?? null, success: false, reason: "locked" } });
    throw new AppError("RATE_LIMITED", "الحساب مقفل مؤقتًا بسبب محاولات فاشلة / Account temporarily locked");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return fail("bad_password");

  await prisma.loginAttempt.create({ data: { email, ip: meta.ip ?? null, success: true } });
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit(prisma, { orgId: user.organizationId, userId: user.id, ip: meta.ip, userAgent: meta.userAgent }, { action: "auth.login", entityType: "User", entityId: user.id });
  const session = await createSession(user.id, meta);
  return { user, ...session };
}
