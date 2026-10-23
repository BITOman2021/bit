import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

/** أنواع الملفات المسموح بها: يُتحقق من التوقيع الفعلي للملف (magic bytes) وليس الامتداد فقط */
const TYPES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/heic", ext: "heic", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && /heic|heix|mif1|hevc/.test(b.subarray(8, 12).toString("latin1")) },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && b.includes(Buffer.from("word/")),
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && b.includes(Buffer.from("xl/")),
  },
];

export const ALLOWED_EXTENSIONS = TYPES.map((t) => t.ext);

export function maxUploadBytes() {
  return Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024;
}

export function storageDir() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

export function detectType(buf: Buffer) {
  return TYPES.find((t) => t.test(buf)) ?? null;
}

export function sanitizeFileName(name: string) {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return (base || "file").slice(0, 150);
}

export async function saveFile(buf: Buffer, originalName: string) {
  if (buf.length === 0) throw new AppError("VALIDATION", "الملف فارغ / File is empty");
  if (buf.length > maxUploadBytes()) throw new AppError("VALIDATION", `حجم الملف يتجاوز ${process.env.MAX_UPLOAD_MB ?? 15} ميجابايت / File too large`);
  const type = detectType(buf);
  if (!type) throw new AppError("VALIDATION", `نوع الملف غير مسموح. المسموح: ${ALLOWED_EXTENSIONS.join(", ")} / File type not allowed`);
  const storedName = `${randomBytes(16).toString("hex")}.${type.ext}`;
  const dir = storageDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), buf, { mode: 0o600 });
  return { storedName, mimeType: type.mime, sizeBytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), fileName: sanitizeFileName(originalName) };
}

export async function readStoredFile(storedName: string) {
  if (!/^[a-f0-9]{32}\.[a-z]{3,4}$/.test(storedName)) throw new AppError("NOT_FOUND", "File not found");
  return readFile(path.join(storageDir(), storedName));
}

// ------- روابط وصول مؤقتة موقّعة -------

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (32+ chars)");
  return s;
}

export function signFileToken(documentId: string, userId: string, ttlSeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${documentId}.${userId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyFileToken(token: string): { documentId: string; userId: string } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString();
    const [documentId, userId, expStr, sig] = raw.split(".");
    if (!documentId || !userId || !expStr || !sig) return null;
    const expected = createHmac("sha256", secret()).update(`${documentId}.${userId}.${expStr}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
    return { documentId, userId };
  } catch {
    return null;
  }
}
