"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, getCtx, requestMeta, setSessionCookie } from "@/server/auth/next";
import { destroySession, login, SESSION_COOKIE } from "@/server/auth/session";
import { normalizeError } from "@/server/errors";
import { bootstrapOrganization } from "@/server/services/bootstrap";
import { setLocale } from "@/server/services/users";
import { LOCALE_COOKIE } from "@/i18n/server";
import type { ActionState } from "./run";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/";
  try {
    const res = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await requestMeta());
    await setSessionCookie(res.token, res.expiresAt);
    (await cookies()).set(LOCALE_COOKIE, res.user.locale, { path: "/", sameSite: "lax", maxAge: 31536000 });
    const role = await import("@/server/db").then(({ prisma }) => prisma.role.findUnique({ where: { id: res.user.roleId } }));
    target = role?.key === "TENANT" ? "/portal" : role?.key === "TECHNICIAN" ? "/maintenance/work-orders" : "/";
  } catch (e) {
    return { ok: false, message: normalizeError(e).message };
  }
  redirect(target);
}

export async function logoutAction() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}

export async function toggleLocaleAction() {
  const ctx = await getCtx();
  const jar = await cookies();
  const current = ctx?.locale ?? (jar.get(LOCALE_COOKIE)?.value === "en" ? "en" : "ar");
  const next = current === "ar" ? "en" : "ar";
  if (ctx) await setLocale(ctx, next);
  jar.set(LOCALE_COOKIE, next, { path: "/", sameSite: "lax", maxAge: 31536000 });
}

export async function setupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const expected = process.env.SETUP_TOKEN;
    const { timingSafeEqual } = await import("node:crypto");
    const given = Buffer.from(String(fd.get("setupToken") ?? ""));
    if (!expected || expected.length < 16 || given.length !== Buffer.byteLength(expected) || !timingSafeEqual(given, Buffer.from(expected))) {
      return { ok: false, message: "رمز التهيئة غير صحيح / Invalid setup token" };
    }
    if (String(fd.get("password")) !== String(fd.get("password2"))) return { ok: false, message: "كلمتا المرور غير متطابقتين / Passwords do not match" };
    await bootstrapOrganization({
      orgName: String(fd.get("orgName") ?? "").trim() || "GLOBAL SNOW WING (GSW)",
      orgNameAr: "جلوبال سنو وينج",
      adminEmail: String(fd.get("email") ?? ""),
      adminName: String(fd.get("name") ?? "").trim() || "Administrator",
      adminPassword: String(fd.get("password") ?? ""),
    });
  } catch (e) {
    return { ok: false, message: normalizeError(e).message };
  }
  redirect("/login?setup=1");
}
