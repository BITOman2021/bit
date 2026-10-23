import "server-only";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/server/errors";

/** يحوّل أخطاء الصلاحيات/عدم الوجود في الصفحات إلى صفحات مناسبة */
export async function load<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "NOT_FOUND") notFound();
      if (e.code === "FORBIDDEN") redirect("/forbidden");
      if (e.code === "UNAUTHENTICATED") redirect("/login");
    }
    throw e;
  }
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function sp(searchParams: SP) {
  const raw = await searchParams;
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = (Array.isArray(v) ? v[0] : v)?.slice(0, 200) || undefined;
  return out;
}
