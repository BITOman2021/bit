import "server-only";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCtx } from "@/server/auth/next";
import type { Ctx } from "@/server/context";
import { AppError, normalizeError } from "@/server/errors";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** يغير قيمة النموذج بعد النجاح لإعادة تعيينه */
  nonce?: number;
  data?: Record<string, string>;
}

export const initialState: ActionState = { ok: false };

/**
 * غلاف موحد لكل Server Action: يتحقق من الجلسة على الخادم، ويحوّل أخطاء الأعمال
 * إلى رسائل آمنة، ويمرر redirect/notFound كما هي.
 */
export async function run(fn: (ctx: Ctx) => Promise<void | string | Partial<ActionState>>, opts: { revalidate?: string } = {}): Promise<ActionState> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new AppError("UNAUTHENTICATED", "انتهت الجلسة، يرجى تسجيل الدخول / Session expired, please sign in");
    const r = await fn(ctx);
    if (opts.revalidate) revalidatePath(opts.revalidate, "layout");
    if (typeof r === "string") return { ok: true, message: r, nonce: Date.now() };
    return { ok: true, message: "تم الحفظ بنجاح / Saved successfully", nonce: Date.now(), ...(r ?? {}) };
  } catch (e) {
    unstable_rethrow(e);
    const err = normalizeError(e);
    return { ok: false, message: err.message, fieldErrors: err.details };
  }
}
