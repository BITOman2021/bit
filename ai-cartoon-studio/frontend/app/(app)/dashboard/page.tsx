"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderKanban, ImageIcon, Video, Loader2, CheckCircle2, HardDrive, Plus, UserSquare2 } from "lucide-react";
import { api, fmtBytes } from "@/lib/api";
import { useApp } from "@/lib/app";
import { PageHeader } from "@/components/ui";

export default function Dashboard() {
  const { tr } = useApp(); const [d, setD] = useState<any>(null);
  useEffect(() => { const load = () => api.get("/dashboard").then(setD).catch(() => {}); load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!d) return null;
  const stats = [[FolderKanban, tr("إجمالي المشاريع", "Projects"), d.projects], [ImageIcon, tr("الصور المنشأة", "Images"), d.images], [Video, tr("الفيديوهات", "Videos"), d.videos],
    [Loader2, tr("قيد المعالجة", "Processing"), d.processing], [CheckCircle2, tr("مهام مكتملة", "Completed jobs"), d.completed], [HardDrive, tr("التخزين", "Storage"), fmtBytes(d.storage_bytes)]] as const;
  return (
    <>
      <PageHeader title={tr("لوحة التحكم", "Dashboard")} sub={tr("نظرة عامة على عملك ومحركات الذكاء الاصطناعي", "Overview of your work and AI engines")} />
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/projects?new=1" className="btn-primary"><Plus size={16} />{tr("مشروع جديد", "New project")}</Link>
        <Link href="/image" className="btn-ghost"><ImageIcon size={16} />{tr("إنشاء صورة", "Create image")}</Link>
        <Link href="/video" className="btn-ghost"><Video size={16} />{tr("إنشاء فيديو", "Create video")}</Link>
        <Link href="/characters" className="btn-ghost"><UserSquare2 size={16} />{tr("إنشاء شخصية", "Create character")}</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(([I, l, v]) => <div key={l} className="card p-4"><I size={18} className="mb-2 text-brand" /><div className="text-2xl font-extrabold">{v}</div><div className="text-xs text-mute">{l}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h3 className="mb-3 font-bold">{tr("حالة محركات الذكاء الاصطناعي", "AI engine status")}</h3>
          <ul className="space-y-2 text-sm">{d.engines.map((e: any) => (
            <li key={e.id} className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.available ? "bg-ok" : "bg-warn"}`} /><div><b>{e.name}</b><div className="text-xs text-mute">{e.detail}</div></div></li>))}</ul></div>
        <div className="card p-5"><h3 className="mb-3 font-bold">{tr("آخر العمليات", "Recent activity")}</h3>
          {d.recent.length === 0 ? <p className="text-sm text-mute">{tr("لا يوجد نشاط بعد", "No activity yet")}</p> :
            <ul className="space-y-2 text-sm">{d.recent.map((r: any, i: number) => <li key={i} className="flex justify-between gap-2 border-b border-line pb-1"><span><b>{r.action}</b> <span className="text-mute">{r.detail}</span></span><span className="shrink-0 text-xs text-mute">{new Date(r.at).toLocaleString()}</span></li>)}</ul>}</div>
      </div>
    </>
  );
}
