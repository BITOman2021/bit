"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, media } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Empty, Field, Modal, PageHeader } from "@/components/ui";

export default function SamKidz() {
  const { tr, toast } = useApp(); const [d, setD] = useState<any>(null); const [imp, setImp] = useState<string | null>(null); const [desc, setDesc] = useState(""); const [epName, setEpName] = useState(""); const file = useRef<HTMLInputElement>(null); const [bible, setBible] = useState("");
  const load = () => api.get("/samkidz").then((x) => { setD(x); setBible(x.workspace.data.series_bible || ""); }); useEffect(() => { load(); }, []);
  if (!d) return null;
  const doImport = async () => {
    const f = file.current?.files?.[0]; if (!f || !imp) return toast(tr("اختر صورة", "Choose an image"), "err");
    const fd = new FormData(); fd.append("name", imp); fd.append("description", desc); fd.append("file", f);
    try { await api.upload("/samkidz/characters/import", fd); setImp(null); setDesc(""); toast(tr("تم الاستيراد وقفل الهوية", "Imported; identity locked")); load(); } catch (e: any) { toast(e.message === "character_exists" ? tr("الشخصية موجودة", "Character exists") : e.message, "err"); }
  };
  const col = ["idea", "script", "production", "review", "published", "archived"];
  return (
    <>
      <PageHeader title="SAM KIDZ | سام كيدز" sub={tr("مساحة عمل مستقلة: شخصيات مرجعية، حلقات، سيناريوهات وأرشيف", "Independent workspace: reference characters, episodes, scripts & archive")} />
      <section className="mb-6"><h2 className="mb-2 font-bold">{tr("الشخصيات المرجعية", "Reference characters")}</h2>
        <p className="mb-3 text-xs text-mute">{tr("تُستورد الصورة كما هي دون إعادة تصميم وتُقفل هويتها.", "The image is imported unchanged and the identity is locked: it is never redesigned.")}</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {d.characters.map((c: any) => <div key={c.id} className="card p-3 text-center"><img className="mx-auto h-32 object-contain" src={media(`/api/assets/${c.reference_asset_id}/file`)} alt={c.name} /><b className="mt-2 block">{c.name}</b>
            <Link className="text-xs text-brand" href={`/characters?id=${c.id}`}>{tr("فتح الملف", "Open profile")}</Link></div>)}
          {d.missing_references.map((n: string) => <button key={n} onClick={() => setImp(n)} className="card flex h-full min-h-40 flex-col items-center justify-center gap-1 border-dashed p-3 text-sm text-mute hover:border-brand"><span className="text-2xl">＋</span><b>{n}</b>{tr("استيراد الصورة المرجعية", "Import reference")}</button>)}
          <button onClick={() => setImp("")} className="card flex min-h-40 flex-col items-center justify-center border-dashed p-3 text-sm text-mute hover:border-brand">＋ {tr("شخصية أخرى", "Other character")}</button></div></section>
      <section className="mb-6"><div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{tr("الحلقات", "Episodes")}</h2>
        <div className="flex gap-2"><input className="inp" placeholder={tr("اسم الحلقة", "Episode name")} value={epName} onChange={(e) => setEpName(e.target.value)} />
          <button className="btn-primary" onClick={async () => { if (!epName.trim()) return; await api.post("/samkidz/episodes", { name: epName }); setEpName(""); load(); }}>{tr("حلقة جديدة", "New episode")}</button></div></div>
        {d.episodes.length === 0 ? <Empty text={tr("لا توجد حلقات", "No episodes")} /> : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{d.episodes.map((e: any) => (
          <div key={e.id} className="card p-4"><div className="flex items-start justify-between"><div><span className="text-xs text-mute">#{e.data.scene_count ?? 0} {tr("مشهد", "scenes")}</span><h3 className="font-bold">{e.name}</h3></div>
            <select className="inp !w-auto !py-1 text-xs" value={e.status} onChange={(x) => api.patch(`/samkidz/episodes/${e.id}/status`, { status: x.target.value }).then(load)}>{col.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="mt-3 flex flex-wrap gap-1 text-xs">{[["/story", tr("السيناريو", "Script")], ["/editor", tr("المشاهد", "Scenes")], ["/voice", tr("الأصوات", "Voices")], ["/youtube", tr("الصورة المصغرة", "Thumbnail")], ["/projects", tr("المشروع", "Project")]].map(([h, l]) =>
              <Link key={h} className="btn-ghost !px-2 !py-1" href={h === "/projects" ? `/projects/${e.id}` : `${h}?project=${e.id}`}>{l}</Link>)}</div></div>))}</div>}</section>
      <section className="card space-y-2 p-5"><h2 className="font-bold">{tr("دليل السلسلة", "Series bible")}</h2>
        <textarea className="inp" rows={5} value={bible} onChange={(e) => setBible(e.target.value)} placeholder={tr("الشخصيات، النبرة، القيم، قواعد الحلقات...", "Characters, tone, values, episode rules...")} />
        <button className="btn-primary" onClick={() => api.put("/samkidz/bible", { series_bible: bible }).then(() => toast(tr("تم الحفظ", "Saved")))}>{tr("حفظ", "Save")}</button></section>
      <Modal open={imp !== null} onClose={() => setImp(null)} title={tr("استيراد شخصية مرجعية", "Import reference character")}>
        <div className="space-y-3"><Field label={tr("الاسم", "Name")}><input className="inp" value={imp || ""} onChange={(e) => setImp(e.target.value)} /></Field>
          <Field label={tr("وصف (اختياري)", "Description (optional)")}><input className="inp" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label={tr("الصورة المرجعية", "Reference image")}><input ref={file} type="file" accept="image/*" /></Field><button className="btn-primary" onClick={doImport}>{tr("استيراد", "Import")}</button></div></Modal>
    </>
  );
}
