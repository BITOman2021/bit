import { handler, json } from "@/server/http/api";
import { assertDocumentAccess } from "@/server/services/documents";
import { signFileToken } from "@/server/storage";

export const dynamic = "force-dynamic";

/** يولّد رابط وصول مؤقت (5 دقائق) لمستند يملك المستخدم صلاحيته */
export const GET = handler<{ id: string }>(async (_req, ctx, { id }) => {
  const doc = await assertDocumentAccess(ctx, id);
  const token = signFileToken(doc.id, ctx.userId, 300);
  return json({ url: `/api/files/${token}`, expiresInSeconds: 300 });
});
