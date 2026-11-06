"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Field, Spinner } from "@/components/ui";

export default function Login() {
  const { tr, lang, login, toast, setLang } = useApp(); const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [f, setF] = useState({ email: "", password: "", name: "", token: "" }); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const err = (m: string) => ({ invalid_credentials: tr("بيانات الدخول غير صحيحة", "Invalid credentials"), email_taken: tr("البريد مستخدم", "Email already used"),
    too_many_attempts: tr("محاولات كثيرة، انتظر قليلاً", "Too many attempts, wait a moment"), registration_closed: tr("التسجيل مغلق", "Registration is closed"),
    account_disabled: tr("الحساب معطل", "Account disabled"), invalid_email: tr("بريد غير صالح", "Invalid email"), invalid_or_expired_token: tr("الرمز غير صالح أو منتهي", "Invalid or expired token") } as Record<string, string>)[m] || m;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "login" || mode === "register") {
        const d = await api.post(mode === "login" ? "/auth/login" : "/auth/register", { email: f.email, password: f.password, name: f.name, lang });
        login(d.token, d.user); router.replace("/dashboard");
      } else if (mode === "forgot") {
        const d = await api.post("/auth/forgot-password", { email: f.email });
        if (d.dev_token) { set("token", d.dev_token); toast(tr("وضع التطوير: تم ملء الرمز تلقائياً", "Dev mode: token filled in automatically")); setF({ ...f, token: d.dev_token }); }
        else toast(tr("إن وُجد الحساب فسيتواصل معك المدير بالرمز", "If the account exists, your admin will deliver a reset token"));
        setMode("reset");
      } else { await api.post("/auth/reset-password", { token: f.token, new_password: f.password }); toast(tr("تم تغيير كلمة المرور", "Password changed")); setMode("login"); }
    } catch (x: any) { toast(err(x.message), "err"); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <div className="flex items-center justify-between"><b className="flex items-center gap-2 text-lg"><Sparkles className="text-brand" />AI Cartoon Studio</b>
          <button type="button" className="text-xs text-brand" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "English" : "العربية"}</button></div>
        <h2 className="text-xl font-extrabold">{{ login: tr("تسجيل الدخول", "Sign in"), register: tr("إنشاء حساب", "Create account"), forgot: tr("استعادة كلمة المرور", "Reset password"), reset: tr("كلمة مرور جديدة", "New password") }[mode]}</h2>
        {mode === "register" && <Field label={tr("الاسم", "Name")}><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>}
        {mode !== "reset" && <Field label={tr("البريد الإلكتروني", "Email")}><input className="inp" type="email" required dir="ltr" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>}
        {mode === "reset" && <Field label={tr("رمز الاستعادة", "Reset token")}><input className="inp" required dir="ltr" value={f.token} onChange={(e) => set("token", e.target.value)} /></Field>}
        {mode !== "forgot" && <Field label={tr("كلمة المرور (8 أحرف على الأقل)", "Password (min 8 characters)")}><input className="inp" type="password" required minLength={8} dir="ltr" value={f.password} onChange={(e) => set("password", e.target.value)} /></Field>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}{{ login: tr("دخول", "Sign in"), register: tr("إنشاء الحساب", "Create account"), forgot: tr("إرسال", "Send"), reset: tr("حفظ", "Save") }[mode]}</button>
        <div className="flex justify-between text-xs text-brand">
          {mode === "login" ? <><button type="button" onClick={() => setMode("register")}>{tr("حساب جديد", "New account")}</button><button type="button" onClick={() => setMode("forgot")}>{tr("نسيت كلمة المرور؟", "Forgot password?")}</button></>
            : <button type="button" onClick={() => setMode("login")}>{tr("العودة لتسجيل الدخول", "Back to sign in")}</button>}
        </div>
      </form>
    </div>
  );
}
