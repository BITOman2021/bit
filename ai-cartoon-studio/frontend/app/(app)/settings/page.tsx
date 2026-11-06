"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Field, PageHeader } from "@/components/ui";

export default function Settings() {
  const { tr, toast, user, lang, setLang, theme, setTheme } = useApp(); const [name, setName] = useState(user?.name || ""); const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [sess, setSess] = useState<any[]>([]); const [eng, setEng] = useState<any>(null);
  const load = () => { api.get("/auth/sessions").then(setSess); api.get("/engines").then(setEng); }; useEffect(load, []);
  return (
    <>
      <PageHeader title={tr("الإعدادات", "Settings")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("الحساب", "Account")}</h3><p className="text-sm text-mute" dir="ltr">{user?.email} · {user?.role}</p>
          <Field label={tr("الاسم", "Name")}><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={tr("اللغة", "Language")}><select className="inp" value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="ar">العربية</option><option value="en">English</option></select></Field>
            <Field label={tr("المظهر", "Theme")}><select className="inp" value={theme} onChange={(e) => setTheme(e.target.value as any)}><option value="dark">{tr("داكن", "Dark")}</option><option value="light">{tr("فاتح", "Light")}</option></select></Field></div>
          <button className="btn-primary" onClick={() => api.patch("/auth/me", { name }).then(() => toast(tr("تم الحفظ", "Saved"))).catch((e) => toast(e.message, "err"))}>{tr("حفظ", "Save")}</button></div>
        <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("تغيير كلمة المرور", "Change password")}</h3>
          <Field label={tr("الحالية", "Current")}><input className="inp" type="password" dir="ltr" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label={tr("الجديدة (8+)", "New (8+)")}><input className="inp" type="password" dir="ltr" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <button className="btn-primary" onClick={() => api.post("/auth/change-password", pw).then(() => { toast(tr("تم التغيير وأُغلقت الجلسات الأخرى", "Changed; other sessions signed out")); setPw({ current_password: "", new_password: "" }); load(); }).catch((e) => toast(e.message === "wrong_password" ? tr("كلمة المرور الحالية خاطئة", "Wrong current password") : e.message, "err"))}>{tr("تغيير", "Change")}</button></div>
        <div className="card p-5"><h3 className="mb-2 font-bold">{tr("الجلسات النشطة", "Active sessions")}</h3>
          <ul className="space-y-2 text-xs">{sess.map((s) => <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate" dir="ltr">{s.ip} · {s.user_agent.slice(0, 50)} {s.current && <b className="text-ok">({tr("الحالية", "current")})</b>}</span>
            {!s.current && <button className="text-bad" onClick={() => api.del(`/auth/sessions/${s.id}`).then(load)}>{tr("إنهاء", "Revoke")}</button>}</li>)}</ul></div>
        <div className="card p-5"><h3 className="mb-2 font-bold">{tr("المحركات والتراخيص والمتطلبات", "Engines, licenses & requirements")}</h3>
          <div className="space-y-3 text-xs">{eng?.engines.map((e: any) => <div key={e.id} className="border-b border-line pb-2"><b>{e.name}</b> <span className={e.available ? "text-ok" : "text-warn"}>{e.available ? tr("جاهز", "ready") : tr("غير متاح", "unavailable")}</span>
            <div className="text-mute">{tr("الترخيص", "License")}: {e.license}</div><div className="text-mute">{tr("الاستخدام التجاري", "Commercial use")}: {e.commercial_use}</div><div className="text-mute">{tr("المتطلبات", "Requirements")}: {e.requirements}</div></div>)}</div>
          {eng?.low_resource && <p className="mt-2 text-xs text-warn">Low Resource mode ON</p>}</div>
      </div>
    </>
  );
}
