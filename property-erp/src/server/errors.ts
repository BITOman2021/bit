export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "BUSINESS_RULE";

/** خطأ أعمال آمن للعرض للمستخدم (لا يحتوي على تفاصيل داخلية) */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "ليست لديك صلاحية لهذا الإجراء / You are not allowed to perform this action") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "السجل غير موجود / Record not found") => new AppError("NOT_FOUND", msg);
export const rule = (msg: string) => new AppError("BUSINESS_RULE", msg);

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUSINESS_RULE: 422,
};

/** يحوّل أخطاء قاعدة البيانات المعروفة إلى رسائل مفهومة */
export function normalizeError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("GSW_UNBALANCED_ENTRY")) return new AppError("BUSINESS_RULE", "القيد غير متوازن / Journal entry is not balanced");
  if (msg.includes("GSW_POSTED_IMMUTABLE")) return new AppError("BUSINESS_RULE", "لا يمكن تعديل قيد مرحّل؛ استخدم قيدًا عكسيًا / Posted entries cannot be modified; use a reversal");
  if (msg.includes("GSW_NO_DELETE")) return new AppError("BUSINESS_RULE", "لا يمكن حذف سجل مالي / Financial records cannot be deleted");
  if (msg.includes("leases_no_overlap_excl")) return new AppError("CONFLICT", "يوجد عقد سارٍ متداخل على نفس الوحدة / An active lease overlaps on this unit");
  const code = (e as { code?: string })?.code;
  if (code === "P2002" || msg.includes("Unique constraint")) return new AppError("CONFLICT", "القيمة مستخدمة مسبقًا / Value already exists");
  if (code === "P2025") return new AppError("NOT_FOUND", "السجل غير موجود / Record not found");
  if (msg.includes("_chk")) return new AppError("VALIDATION", "قيمة غير صالحة / Invalid amount or value");
  console.error("[unexpected-error]", e);
  return new AppError("BUSINESS_RULE", "حدث خطأ غير متوقع / Unexpected error");
}
