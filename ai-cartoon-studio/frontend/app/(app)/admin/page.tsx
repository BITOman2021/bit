"use client";
import { useEffect, useState } from "react";
import { api, fmtBytes } from "@/lib/api";
import { useApp } from "@/lib/app";
import { PageHeader } from "@/components/ui";

export default function Admin() {
  const { tr, toast, user } = useApp(); const [o, setO] = useState<any>(null); const [users, setUsers] = useState<any[]>([]); const [act, setAct] = useState<any[]>([]); const [bk, setBk] = useState<any[]>([]); const [quota, setQuota] = useState(200);
  const load = () => Promise.all([api.get("/admin/overview"), api.get("/admin/users"), api.get("/admin/activity?limit=40"), api.get("/admin/backups")]).then(([a, b, c, d]) => { setO(a); setUsers(b); setAct(c); setBk(d); setQuota(a.quota.jobs_per_day); }).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);
  if (user?.role !== "admin") return <p>403</p>; if (!o) return null;
  const patch = (id: number, b: any) => api.patch(`/admin/users/${id}`, b).then(load).catch((e) => toast(e.message === "cannot_demote_or_disable_self" ? tr("لا يمكنك تعطيل نفسك", "You cannot demote/disable yourself") : e.message, "err"));
  return (
    <>
      <PageHeader title={tr("لوحة الإدارة", "Admin Dashboard")} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">{[[tr("المستخدمون", "Users"), o.users], [tr("المشاريع", "Projects"), o.projects], [tr("الملفات", "Assets"), o.assets], [tr("المهام", "Jobs"), o.jobs], [tr("مهام فاشلة", "Failed"), o.jobs_failed], [tr("التخزين", "Storage"), fmtBytes(o.storage_bytes)]].map(([l, v]) =>
        <div key={String(l)} className="card p-4"><div className="text-xl font-extrabold">{v}</div><div className="text-xs text-mute">{l}</div></div>)}</div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("حدود الاستخدام والتسجيل", "Usage limits & registration")}</h3>
          <div className="flex items-end gap-2"><label className="flex-1"><span className="lbl">{tr("مهام يومياً لكل مستخدم", "Jobs per user per day")}</span><input className="inp" type="number" min={0} value={quota} onChange={(e) => setQuota(Number(e.target.value))} /></label>
            <button className="btn-primary" onClick={() => api.put("/admin/settings", { jobs_per_day: quota }).then(() => toast(tr("تم الحفظ", "Saved")))}>{tr("حفظ", "Save")}</button></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.registration_open} onChange={(e) => api.put("/admin/settings", { registration_open: e.target.checked }).then(load)} />{tr("السماح بالتسجيل الجديد", "Allow new registrations")}</label></div>
        <div className="card space-y-2 p-5"><h3 className="font-bold">{tr("النسخ الاحتياطي", "Backups")}</h3>
          <button className="btn-primary" onClick={() => api.post("/admin/backup").then((r) => { toast(`${r.file} (${fmtBytes(r.size)})`); load(); }).catch((e) => toast(e.message, "err"))}>{tr("إنشاء نسخة الآن", "Backup now")}</button>
          <ul className="text-xs text-mute">{bk.slice(0, 5).map((b) => <li key={b.file} dir="ltr">{b.file} · {fmtBytes(b.size)}</li>)}</ul><p className="text-xs text-mute">{tr("الملفات في data/backups على الخادم.", "Files are stored in data/backups on the server.")}</p></div>
      </div>
      <div className="card mb-4 overflow-x-auto p-5"><h3 className="mb-2 font-bold">{tr("المستخدمون", "Users")}</h3>
        <table className="w-full text-sm"><thead className="text-xs text-mute"><tr><th className="p-1 text-start">Email</th><th>{tr("الدور", "Role")}</th><th>{tr("نشط", "Active")}</th><th>{tr("حد يومي", "Daily quota")}</th><th>{tr("مشاريع", "Projects")}</th><th>{tr("تخزين", "Storage")}</th></tr></thead>
          <tbody>{users.map((u) => <tr key={u.id} className="border-t border-line"><td className="p-1" dir="ltr">{u.email}</td>
            <td><select className="inp !py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}><option>user</option><option>admin</option></select></td>
            <td className="text-center"><input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} /></td>
            <td><input className="inp !w-20 !py-1" type="number" defaultValue={u.daily_job_quota ?? ""} placeholder="∞" onBlur={(e) => patch(u.id, { daily_job_quota: e.target.value })} /></td>
            <td className="text-center">{u.projects}</td><td className="text-center">{fmtBytes(u.storage_bytes)}</td></tr>)}</tbody></table></div>
      <div className="card p-5"><h3 className="mb-2 font-bold">{tr("سجل النشاطات", "Activity log")}</h3>
        <ul className="space-y-1 text-xs">{act.map((a) => <li key={a.id} className="flex justify-between gap-2 border-b border-line pb-1"><span><b>{a.action}</b> <span className="text-mute" dir="ltr">{a.user} {a.detail}</span></span><span className="shrink-0 text-mute">{new Date(a.at).toLocaleString()}</span></li>)}</ul></div>
    </>
  );
}
