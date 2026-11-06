"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api, download } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Asset, AssetPicker, AssetView, Estimate, Field, JobPanel, PageHeader, ProjectSelect, useJob, useQueryProject } from "@/components/ui";

const newScene = () => ({ title: "", image_asset_id: null, video_asset_id: null, audio_asset_id: null, duration: 4, motion: "zoom_in", speed: 1, transition: "none", subtitle: "", subtitle2: "", overlays: [], volume: 1 });

export default function Editor() {
  const { tr, toast } = useApp(); const [project, setProject] = useQueryProject(); const [p, setP] = useState<any>(null); const [tl, setTl] = useState<any>({ scenes: [] }); const [ex, setEx] = useState<any>({ aspect: "16:9", resolution: 720, fps: 24, subtitles: "none" });
  const [sel, setSel] = useState(0); const [saved, setSaved] = useState(""); const [last, setLast] = useState<Asset | null>(null);
  const { job, start, cancel, busy } = useJob((j) => { if (j.assets?.length) { const v = j.assets.find((a) => a.kind === "video"); if (v) setLast(v); } });
  useEffect(() => { if (!project) return; api.get(`/projects/${project}`).then((d) => { setP(d); setTl(d.data?.timeline || { scenes: [] }); setEx({ aspect: "16:9", resolution: 720, fps: 24, subtitles: "none", ...(d.data?.export || {}) });
    const la = d.data?.last_export?.asset_id; if (la) api.get(`/assets?kind=video&project_id=${project}`).then((a: Asset[]) => setLast(a.find((x) => x.id === la) || null)); }); }, [project]);
  const timer = useRef<any>(null);
  const persist = (nt: any, ne: any) => { if (!project) return; setSaved(tr("جارٍ الحفظ...", "Saving...")); clearTimeout(timer.current);
    timer.current = setTimeout(() => api.patch(`/projects/${project}`, { data: { timeline: nt, export: ne }, revision_note: "timeline edit" }).then(() => setSaved(tr("تم الحفظ تلقائياً", "Auto-saved"))).catch((e) => toast(e.message, "err")), 800); };
  const upd = (nt: any) => { setTl(nt); persist(nt, ex); };
  const updEx = (k: string, v: any) => { const ne = { ...ex, [k]: v }; setEx(ne); persist(tl, ne); };
  const scenes: any[] = tl.scenes || []; const s = scenes[sel];
  const edit = (patch: any) => upd({ ...tl, scenes: scenes.map((x, i) => (i === sel ? { ...x, ...patch } : x)) });
  const move = (d: number) => { const j = sel + d; if (j < 0 || j >= scenes.length) return; const a = [...scenes]; [a[sel], a[j]] = [a[j], a[sel]]; upd({ ...tl, scenes: a }); setSel(j); };
  const total = scenes.reduce((a, x) => a + Number(x.duration || 0), 0);
  return (
    <>
      <PageHeader title={tr("محرر الفيديو", "Video Editor")} sub={saved} actions={<div className="w-64"><ProjectSelect value={project} onChange={setProject} /></div>} />
      {!project ? <div className="card p-8 text-center text-sm text-mute">{tr("اختر مشروعاً لفتح الخط الزمني", "Pick a project to open its timeline")}</div> : !p ? null : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-1">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">{tr("المشاهد", "Scenes")} <span className="text-xs text-mute">({total.toFixed(1)}s)</span></h3>
              <button className="btn-ghost !py-1" onClick={() => { upd({ ...tl, scenes: [...scenes, newScene()] }); setSel(scenes.length); }}><Plus size={14} />{tr("مشهد", "Scene")}</button></div>
            <div className="flex gap-1 overflow-x-auto pb-2">{scenes.map((x, i) => <div key={i} onClick={() => setSel(i)} className={`h-3 cursor-pointer rounded ${i === sel ? "bg-brand" : "bg-panel2"}`} style={{ width: `${Math.max(14, (Number(x.duration) / Math.max(total, 1)) * 100)}%`, minWidth: 14 }} title={x.title} />)}</div>
            <ul className="mt-2 space-y-1">{scenes.map((x, i) => (
              <li key={i} onClick={() => setSel(i)} className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm ${i === sel ? "border-brand bg-brand/10" : "border-line"}`}>
                <span className="truncate">{i + 1}. {x.title || tr("بلا عنوان", "Untitled")}</span><span className="text-xs text-mute">{x.duration}s</span></li>))}</ul>
            {scenes.length === 0 && <p className="text-sm text-mute">{tr("أضف مشهداً أو طبّق سيناريو من صفحة القصة.", "Add a scene or apply a script from the Story page.")}</p>}
          </div>
          <div className="space-y-4 lg:col-span-2">
            {s && <div className="card space-y-3 p-5">
              <div className="flex items-center justify-between"><h3 className="font-bold">{tr("المشهد", "Scene")} {sel + 1}</h3>
                <div className="flex gap-1"><button className="btn-ghost !px-2" onClick={() => move(-1)}><ArrowUp size={14} /></button><button className="btn-ghost !px-2" onClick={() => move(1)}><ArrowDown size={14} /></button>
                  <button className="btn-danger !px-2" onClick={() => { upd({ ...tl, scenes: scenes.filter((_, i) => i !== sel) }); setSel(Math.max(0, sel - 1)); }}><Trash2 size={14} /></button></div></div>
              <Field label={tr("العنوان", "Title")}><input className="inp" value={s.title} onChange={(e) => edit({ title: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-3"><AssetPicker kind="image" projectId={undefined} value={s.image_asset_id} onChange={(v) => edit({ image_asset_id: v })} label={tr("صورة/خلفية", "Image / background")} />
                <AssetPicker kind="video" value={s.video_asset_id} onChange={(v) => edit({ video_asset_id: v })} label={tr("مقطع فيديو", "Video clip")} />
                <AssetPicker kind="audio" value={s.audio_asset_id} onChange={(v) => edit({ audio_asset_id: v })} label={tr("الحوار", "Dialogue audio")} /></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label={tr("المدة", "Duration")}><input className="inp" type="number" min={0.5} step={0.5} value={s.duration} onChange={(e) => edit({ duration: Number(e.target.value) })} /></Field>
                <Field label={tr("الحركة", "Motion")}><select className="inp" value={s.motion} onChange={(e) => edit({ motion: e.target.value })}>{["zoom_in", "zoom_out", "pan_left", "pan_right", "shake", "static"].map((m) => <option key={m}>{m}</option>)}</select></Field>
                <Field label={tr("السرعة", "Speed")}><input className="inp" type="number" min={0.25} max={4} step={0.25} value={s.speed} onChange={(e) => edit({ speed: Number(e.target.value) })} /></Field>
                <Field label={tr("الانتقال", "Transition")}><select className="inp" value={s.transition} onChange={(e) => edit({ transition: e.target.value })}><option value="none">—</option><option value="fade">fade</option></select></Field>
                <Field label={tr("الصوت", "Volume")}><input className="inp" type="number" min={0} max={2} step={0.1} value={s.volume} onChange={(e) => edit({ volume: Number(e.target.value) })} /></Field></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label={tr("الترجمة (اللغة الأولى)", "Subtitle (primary)")}><textarea className="inp" rows={2} value={s.subtitle} onChange={(e) => edit({ subtitle: e.target.value })} /></Field>
                <Field label={tr("الترجمة (اللغة الثانية)", "Subtitle (secondary)")}><textarea className="inp" dir="ltr" rows={2} value={s.subtitle2} onChange={(e) => edit({ subtitle2: e.target.value })} /></Field></div>
              <div><div className="mb-1 flex items-center justify-between"><span className="lbl">{tr("نصوص وعناوين", "Text overlays")}</span><button className="text-xs text-brand" onClick={() => edit({ overlays: [...(s.overlays || []), { text: "", start: 0, end: s.duration, position: "top" }] })}>+ {tr("إضافة", "Add")}</button></div>
                {(s.overlays || []).map((o: any, i: number) => (
                  <div key={i} className="mb-1 flex gap-2"><input className="inp" value={o.text} onChange={(e) => edit({ overlays: s.overlays.map((y: any, k: number) => (k === i ? { ...y, text: e.target.value } : y)) })} />
                    <input className="inp !w-20" type="number" value={o.start} onChange={(e) => edit({ overlays: s.overlays.map((y: any, k: number) => (k === i ? { ...y, start: Number(e.target.value) } : y)) })} />
                    <input className="inp !w-20" type="number" value={o.end} onChange={(e) => edit({ overlays: s.overlays.map((y: any, k: number) => (k === i ? { ...y, end: Number(e.target.value) } : y)) })} />
                    <select className="inp !w-28" value={o.position} onChange={(e) => edit({ overlays: s.overlays.map((y: any, k: number) => (k === i ? { ...y, position: e.target.value } : y)) })}><option value="top">top</option><option value="center">center</option><option value="bottom">bottom</option></select>
                    <button className="text-bad" onClick={() => edit({ overlays: s.overlays.filter((_: any, k: number) => k !== i) })}><Trash2 size={14} /></button></div>))}</div>
              <button className="btn-ghost" disabled={busy} onClick={() => api.patch(`/projects/${project}`, { data: { timeline: tl, export: ex } }).then(() => start("video.render", { project_id: project, only_scene: sel }, project!))}>{tr("معاينة هذا المشهد", "Preview this scene")}</button>
            </div>}
            <div className="card space-y-3 p-5"><h3 className="font-bold">{tr("الموسيقى والمؤثرات والتصدير", "Music, effects & export")}</h3>
              <div className="grid gap-3 sm:grid-cols-2"><AssetPicker kind="audio" value={tl.music?.asset_id ?? null} onChange={(v) => upd({ ...tl, music: v ? { asset_id: v, volume: tl.music?.volume ?? 0.25 } : null })} label={tr("موسيقى خلفية", "Background music")} />
                <Field label={`${tr("مستوى الموسيقى", "Music level")} ${tl.music?.volume ?? 0.25}`}><input type="range" min={0} max={1} step={0.05} value={tl.music?.volume ?? 0.25} className="w-full" onChange={(e) => tl.music && upd({ ...tl, music: { ...tl.music, volume: Number(e.target.value) } })} /></Field></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={tr("النسبة", "Aspect")}><select className="inp" value={ex.aspect} onChange={(e) => updEx("aspect", e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></Field>
                <Field label={tr("الدقة", "Resolution")}><select className="inp" value={ex.resolution} onChange={(e) => updEx("resolution", Number(e.target.value))}><option value={720}>720p</option><option value={1080}>1080p</option></select></Field>
                <Field label="FPS"><select className="inp" value={ex.fps} onChange={(e) => updEx("fps", Number(e.target.value))}>{[12, 24, 30].map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label={tr("الترجمة المدمجة", "Burned subtitles")}><select className="inp" value={ex.subtitles} onChange={(e) => updEx("subtitles", e.target.value)}><option value="none">{tr("بدون", "None")}</option><option value="primary">{tr("الأولى", "Primary")}</option><option value="secondary">{tr("الثانية", "Secondary")}</option><option value="both">{tr("ثنائية", "Bilingual")}</option></select></Field></div>
              <Estimate kind="video.render" params={{ ...ex, duration: total }} />
              <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy || scenes.length === 0} onClick={() => api.patch(`/projects/${project}`, { data: { timeline: tl, export: ex } }).then(() => start("video.render", { project_id: project }, project!))}>{tr("تصدير الفيديو", "Render video")}</button>
                {(["primary", "secondary", "both"] as const).map((l) => <button key={l} className="btn-ghost" onClick={() => download(`/projects/${project}/srt?lang=${l}`, `${p.name}-${l}.srt`).catch((e) => toast(e.message, "err"))}>SRT {l}</button>)}</div>
              <JobPanel job={job} cancel={cancel} />
              {last && !busy && <div><h4 className="mb-1 text-sm font-bold">{tr("آخر ناتج", "Latest output")}</h4><AssetView a={last} className="max-h-96 w-full" /></div>}
            </div>
          </div>
        </div>)}
    </>
  );
}
