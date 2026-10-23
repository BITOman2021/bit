import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { buildContext, type Ctx } from "../context";
import { AppError, HTTP_STATUS, normalizeError } from "../errors";
import { SESSION_COOKIE, validateSessionToken } from "../auth/session";
import { toJsonSafe } from "../audit";

/** حد معدل الطلبات لكل مستخدم/عنوان (ذاكرة العملية — يكفي لخادم واحد؛ استخدم Redis عند التوسع الأفقي) */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++b.count > limit) throw new AppError("RATE_LIMITED", "طلبات كثيرة جدًا / Too many requests");
  if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}

function ipOf(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || null;
}

/** حماية CSRF لطلبات التعديل: يجب أن يطابق Origin مضيف التطبيق */
function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-origin request rejected");
}

export async function apiCtx(req: NextRequest): Promise<Ctx> {
  checkOrigin(req);
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new AppError("UNAUTHENTICATED", "Authentication required");
  rateLimit(`u:${session.userId}`);
  return buildContext(session.userId, { ip: ipOf(req), userAgent: req.headers.get("user-agent") });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(toJsonSafe(data), { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(e: unknown) {
  const err = normalizeError(e);
  return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: HTTP_STATUS[err.code], headers: { "Cache-Control": "no-store" } });
}

export function handler<P>(fn: (req: NextRequest, ctx: Ctx, params: P) => Promise<Response>) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      const ctx = await apiCtx(req);
      return await fn(req, ctx, await route.params);
    } catch (e) {
      return apiError(e);
    }
  };
}
