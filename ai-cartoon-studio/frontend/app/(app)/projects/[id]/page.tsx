"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, download } from "@/lib/api";
import { useApp } from "@/lib/app";
import { AssetView, Field, PageHeader, Asset } from "@/components/ui";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>(); const { tr, toast } = useApp();
  const [p, setP] = useState<any>(null); const [assets, setAssets] = useState<Asset[]>([]); const [revs, setRevs] = useState<any[]>([]); const [saved, setSaved] = useState("");
  const load = () => { api.get(`/projects/${id}`).then(setP); api.get(`/projects/${id}/assets`).then(setAssets); api.get(`/projects/${id}/revisions`).then(setRevs); };
  useEffect(load, [id]);
  const t = useRef<any>(null);
  const save = (patch: any) => { // auto-save: debounce 800ms
    setP((x: any) => ({ ...x, ...patch })); setSaved(tr("جارٍ الحفظ...", "Saving...")); clearTimeout(t.current);
    t.current = setTimeout(() => api.patch(`/projects/${id}`, patch).then(() => setSaved(tr("تم الحفظ تلقائياً", "Auto-saved"))).catch((e) => { setSaved(""); toast(e.message, "err"); }), 800);
  };
  if (!p) return null;
  const scenes = p.data?.timeline?.scenes || [];
  const links = [["/story", tr("القصة والسيناريو", "Story")], ["/image", tr("الصور", "Images")], ["/voice", tr("الأصوات", "Voices")], ["/editor", tr("المحرر", "Editor")], ["/youtube", tr("يوتيوب", "YouTube")]];
  return (
    <>
      <PageHeader title={p.name} sub={saved} actions={<div className="flex gap-2">
        <button className="btn-ghost" onClick={() => download(`/projects/${id}/export`, `project-${id}.zip`)}>{tr("تصدير المشروع", "Export project")}</button></div>} />
      <div className="mb-4 flex flex-wrap gap-2">{links.map(([h, l]) => <Link key={h} href={`${h}?project=${id}`} className="btn-ghost">{l}</Link>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <Field label={tr("اسم المشروع", "Project name")}><input className="inp" value={p.name} onChange={(e) => save({ name: e.target.value })} /></Field>
          <Field label={tr("الوصف", "Description")}><textarea className="inp" rows={3} value={p.description} onChange={(e) => save({ description: e.target.value })} /></Field>
          <Field label={tr("اللغة", "Language")}><select className="inp" value={p.lang} onChange={(e) => save({ lang: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></select></Field>
          <p className="text-sm text-mute">{scenes.length} {tr("مشهد في الخط الزمني", "scenes in timeline")} · {assets.length} {tr("ملف", "files")}</p>
        </div>
        <div className="card p-5"><h3 className="mb-2 font-bold">{tr("سجل التعديلات", "Edit history")}</h3>
          {revs.length === 0 ? <p className="text-sm text-mute">—</p> : <ul className="space-y-1 text-sm">{revs.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center justify-between"><span>{r.summary} <span className="text-xs text-mute">{new Date(r.created_at).toLocaleString()}</span></span>
              <button className="text-xs text-brand" onClick={async () => { if (confirm(tr("استعادة هذه النسخة؟", "Restore this version?"))) { await api.post(`/projects/${id}/revisions/${r.id}/restore`); load(); } }}>{tr("استعادة", "Restore")}</button></li>))}</ul>}</div>
      </div>
      <h3 className="mb-2 mt-6 font-bold">{tr("ملفات المشروع", "Project files")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{assets.map((a) => <div key={a.id} className="card p-2"><AssetView a={a} className="h-32 w-full" /><div className="mt-1 truncate text-xs text-mute">{a.name}</div></div>)}</div>
    </>
  );
}
