import { AppError } from "@/server/errors";
import { handler, json } from "@/server/http/api";
import { listPayments, recordPayment } from "@/server/services/billing";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  return json({ data: await listPayments(ctx, { q: sp.get("q") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, tenantId: sp.get("tenantId") ?? undefined }) });
});
/** يتطلب ترويسة Idempotency-Key: إعادة الطلب بنفس المفتاح تعيد نفس الدفعة (200) بدل إنشاء جديدة (201) */
export const POST = handler(async (req, ctx) => {
  const key = req.headers.get("idempotency-key");
  if (!key) throw new AppError("VALIDATION", "Idempotency-Key header is required");
  const body = await req.json();
  const r = await recordPayment(ctx, { ...body, idempotencyKey: key });
  return json({ data: r.payment, duplicate: r.duplicate }, r.duplicate ? 200 : 201);
});
