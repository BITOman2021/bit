import "server-only";
import { cookies } from "next/headers";
import { getCtx } from "@/server/auth/next";
import { getDict, type Locale } from "./dict";

export const LOCALE_COOKIE = "gsw_locale";

export async function getLocale(): Promise<Locale> {
  const ctx = await getCtx();
  if (ctx) return ctx.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return c === "en" ? "en" : "ar";
}

/** يعيد القاموس ودالة L للنصوص الخاصة بصفحة معينة */
export async function getT() {
  const locale = await getLocale();
  const t = getDict(locale);
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return { t, locale, L };
}
