import { buildContext } from "@/server/context";
import { assertDocumentAccess } from "@/server/services/documents";
import { readStoredFile, verifyFileToken } from "@/server/storage";

export const dynamic = "force-dynamic";

/** رابط مؤقت موقّع: صالح لدقائق، ويُعاد التحقق من صلاحية المستخدم الذي أصدره */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = verifyFileToken((await params).token);
  if (!v) return new Response("Link expired or invalid", { status: 403 });
  try {
    const ctx = await buildContext(v.userId);
    const doc = await assertDocumentAccess(ctx, v.documentId);
    const buf = await readStoredFile(doc.storedName);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": doc.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
}
