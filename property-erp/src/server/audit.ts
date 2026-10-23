import type { Db } from "./db";
import type { Ctx } from "./context";

export function toJsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value ?? null, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && "d" in (v as object)) return v.toString();
      return v;
    }),
  );
}

const REDACT = new Set(["passwordHash", "tokenHash", "idNumber"]);

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = REDACT.has(k) ? "[REDACTED]" : redact(v);
  return out;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/** يسجل عملية في سجل التدقيق (غير قابل للتعديل على مستوى قاعدة البيانات) */
export async function audit(db: Db, ctx: Pick<Ctx, "orgId" | "userId" | "ip" | "userAgent"> | { orgId: string; userId: string | null; ip?: string | null; userAgent?: string | null }, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: entry.before === undefined ? undefined : (redact(toJsonSafe(entry.before)) as object),
      after: entry.after === undefined ? undefined : (redact(toJsonSafe(entry.after)) as object),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    },
  });
}
