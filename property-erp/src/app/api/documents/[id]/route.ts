import { audit } from "@/server/audit";
import { handler } from "@/server/http/api";
import { assertDocumentAccess } from "@/server/services/documents";
import { readStoredFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** تنزيل/عرض مستند بعد التحقق من الصلاحية على الخادم */
export const GET = handler<{ id: string }>(async (req, ctx, { id }) => {
  const doc = await assertDocumentAccess(ctx, id);
  const buf = await readStoredFile(doc.storedName);
  await audit((await import("@/server/db")).prisma, ctx, { action: "document.download", entityType: "Document", entityId: doc.id, summary: doc.fileName });
  const inline = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${inline && req.nextUrl.searchParams.get("download") !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
