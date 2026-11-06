"use client";
import { useEffect, useState } from "react";
import { api, download } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Asset, AssetPicker, AssetView, Field, PageHeader, ProjectSelect, Spinner, useQueryProject } from "@/components/ui";

export default function YouTube() {
  const { tr, toast, lang } = useApp(); const [project, setProject] = useQueryProject(); const [p, setP] = useState<any>(null);
  const [m, setM] = useState<any>(null); const [kw, setKw] = useState(""); const [eng, setEng] = useState("template"); const [ml, setMl] = useState(lang); const [busy, setBusy] = useState(false);
  const [t, setT] = useState<any>({ title: "", background_asset_id: null, character_asset_id: null, badge: "" }); const [thumb, setThumb] = useState<Asset | null>(null); const [yt, setYt] = useState<any>(null);
  useEffect(() => { api.get("/youtube/status").then(setYt); }, []);
  useEffect(() => { if (!project) return; api.get(`/projects/${project}`).then((d) => { setP(d); setT((x: any) => ({ ...x, title: x.title || d.name })); setM(d.data?.youtube?.[ml] || null);
    if (d.data?.thumbnail_asset_id) api.get(`/assets?kind=image&project_id=${project}`).then((a: Asset[]) => setThumb(a.find((y) => y.id === d.data.thumbnail_asset_id) || null)); }); }, [project]);
  const gen = async () => { setBusy(true); try { setM(await api.post("/youtube/metadata", { project_id: project, engine: eng, language: ml, keywords: kw.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })); } catch (e: any) { toast(e.message, "err"); } setBusy(false); };
  const mk = async () => { setBusy(true); try { setThumb(await api.post("/youtube/thumbnail", { ...t, project_id: project })); toast(tr("تم إنشاء الصورة المصغرة", "Thumbnail created")); } catch (e: any) { toast(e.message, "err"); } setBusy(false); };
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast(tr("تم النسخ", "Copied")));
  return (
    <>
      <PageHeader title={tr("استوديو يوتيوب", "YouTube Studio")} actions={<div className="w-64"><ProjectSelect value={project} onChange={setProject} /></div>} />
      {yt && <div className="card mb-4 border-warn/40 p-3 text-xs text-warn">{yt.reason}</div>}
      {!project ? <div className="card p-8 text-center text-sm text-mute">{tr("اختر مشروعاً", "Pick a project")}</div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("العنوان والوصف والوسوم", "Title, description & tags")}</h3>
            <div className="grid grid-cols-2 gap-3"><Field label={tr("اللغة", "Language")}><select className="inp" value={ml} onChange={(e) => { setMl(e.target.value as any); setM(p?.data?.youtube?.[e.target.value] || null); }}><option value="ar">العربية</option><option value="en">English</option></select></Field>
              <Field label={tr("المحرك", "Engine")}><select className="inp" value={eng} onChange={(e) => setEng(e.target.value)}><option value="template">{tr("قالب (بدون AI)", "Template (no AI)")}</option><option value="ollama">Ollama</option></select></Field></div>
            <Field label={tr("كلمات مفتاحية", "Keywords")}><input className="inp" value={kw} onChange={(e) => setKw(e.target.value)} /></Field>
            <button className="btn-primary" disabled={busy} onClick={gen}>{busy && <Spinner />}{tr("توليد", "Generate")}</button>
            {m && <div className="space-y-2 text-sm"><div className="rounded-xl bg-panel2 p-3"><b>{tr("عناوين مقترحة", "Title options")}</b>{m.titles?.map((x: string, i: number) => <div key={i} className="flex justify-between gap-2"><span>{x}</span><button className="text-xs text-brand" onClick={() => copy(x)}>{tr("نسخ", "Copy")}</button></div>)}</div>
              <div className="rounded-xl bg-panel2 p-3"><div className="flex justify-between"><b>{tr("الوصف", "Description")}</b><button className="text-xs text-brand" onClick={() => copy(m.description)}>{tr("نسخ", "Copy")}</button></div><pre className="whitespace-pre-wrap font-sans text-xs">{m.description}</pre></div>
              <div className="rounded-xl bg-panel2 p-3"><div className="flex justify-between"><b>{tr("الوسوم", "Tags")}</b><button className="text-xs text-brand" onClick={() => copy((m.tags || []).join(", "))}>{tr("نسخ", "Copy")}</button></div><p className="text-xs">{(m.tags || []).join(", ")}</p><p className="text-xs text-brand">{(m.hashtags || []).join(" ")}</p></div>
              <p className="text-xs text-warn">{m.made_for_kids_reminder}</p></div>}
          </div>
          <div className="space-y-4">
            <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("الصورة المصغرة (1280×720)", "Thumbnail (1280×720)")}</h3>
              <Field label={tr("عنوان الصورة", "Thumbnail title")}><input className="inp" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
              <Field label={tr("شارة (اسم القناة)", "Badge (channel)")}><input className="inp" value={t.badge} onChange={(e) => setT({ ...t, badge: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3"><AssetPicker kind="image" value={t.background_asset_id} onChange={(v) => setT({ ...t, background_asset_id: v })} label={tr("الخلفية", "Background")} /><AssetPicker kind="image" value={t.character_asset_id} onChange={(v) => setT({ ...t, character_asset_id: v })} label={tr("شخصية (PNG شفاف)", "Character (transparent PNG)")} /></div>
              <button className="btn-primary" disabled={busy || !t.title.trim()} onClick={mk}>{tr("إنشاء", "Create")}</button>{thumb && <AssetView a={thumb} className="w-full" />}</div>
            <div className="card space-y-2 p-5"><h3 className="font-bold">{tr("حزمة النشر", "Publishing package")}</h3>
              <p className="text-xs text-mute">{tr("فيديو + صورة مصغرة + ترجمات SRT + ملفات الوصف بالعربية والإنجليزية. ارفعها يدوياً إلى يوتيوب.", "Video + thumbnail + SRT files + AR/EN description files. Upload manually to YouTube.")}</p>
              <button className="btn-ghost" onClick={() => download(`/youtube/package/${project}`, `youtube-package-${project}.zip`, "POST").catch((e) => toast(e.message === "render_the_video_first" ? tr("صدّر الفيديو أولاً من المحرر", "Render the video in the Editor first") : e.message, "err"))}>{tr("تنزيل الحزمة", "Download package")}</button></div>
          </div>
        </div>)}
    </>
  );
}
