"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/app";
import { AssetPicker, Estimate, EngineStatus, Field, JobPanel, PageHeader, ProjectSelect, useJob, useQueryProject } from "@/components/ui";

export default function VideoStudio() {
  const { tr } = useApp(); const [mode, setMode] = useState<"animate" | "ai" | "project">("animate"); const [project, setProject] = useQueryProject();
  const [f, setF] = useState<any>({ asset_id: null, audio_asset_id: null, motion: "zoom_in", duration: 5, aspect: "16:9", resolution: 720, fps: 24, transition: "none", prompt: "", frames: 25, subtitles: "none" });
  const { job, start, cancel, busy } = useJob(); const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const common = (
    <div className="grid grid-cols-3 gap-3">
      <Field label={tr("النسبة", "Aspect")}><select className="inp" value={f.aspect} onChange={(e) => set("aspect", e.target.value)}><option value="16:9">16:9 YouTube</option><option value="9:16">9:16 Shorts</option><option value="1:1">1:1</option></select></Field>
      <Field label={tr("الدقة", "Resolution")}><select className="inp" value={f.resolution} onChange={(e) => set("resolution", Number(e.target.value))}><option value={720}>720p</option><option value={1080}>1080p</option></select></Field>
      <Field label="FPS"><select className="inp" value={f.fps} onChange={(e) => set("fps", Number(e.target.value))}>{[12, 24, 30].map((x) => <option key={x}>{x}</option>)}</select></Field></div>);
  return (
    <>
      <PageHeader title={tr("استوديو الفيديو", "AI Video Studio")} />
      <div className="mb-4 flex flex-wrap gap-2">{([["animate", tr("صورة إلى فيديو (حركة كاميرا)", "Image to video (camera motion)")], ["ai", tr("فيديو بالذكاء الاصطناعي (ComfyUI)", "AI video (ComfyUI)")], ["project", tr("قصة إلى فيديو (من مشروع)", "Story to video (project)")]] as const).map(([k, l]) =>
        <button key={k} className={mode === k ? "btn-primary" : "btn-ghost"} onClick={() => setMode(k)}>{l}</button>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          {mode === "animate" && <>
            <AssetPicker kind="image" value={f.asset_id} onChange={(v) => set("asset_id", v)} label={tr("الصورة", "Image")} />
            <AssetPicker kind="audio" value={f.audio_asset_id} onChange={(v) => set("audio_asset_id", v)} label={tr("صوت (اختياري)", "Audio (optional)")} />
            <div className="grid grid-cols-3 gap-3"><Field label={tr("الحركة", "Motion")}><select className="inp" value={f.motion} onChange={(e) => set("motion", e.target.value)}>{["zoom_in", "zoom_out", "pan_left", "pan_right", "shake", "static"].map((m) => <option key={m}>{m}</option>)}</select></Field>
              <Field label={tr("المدة (ث)", "Seconds")}><input className="inp" type="number" min={1} max={120} value={f.duration} onChange={(e) => set("duration", Number(e.target.value))} /></Field>
              <Field label={tr("انتقال", "Transition")}><select className="inp" value={f.transition} onChange={(e) => set("transition", e.target.value)}><option value="none">—</option><option value="fade">fade</option></select></Field></div>
            {common}<Estimate kind="video.animate" params={f} />
            <button className="btn-primary w-full" disabled={busy || !f.asset_id} onClick={() => start("video.animate", f)}>{tr("إنشاء الفيديو", "Create video")}</button></>}
          {mode === "ai" && <>
            <EngineStatus ids={["comfyui-video"]} />
            <AssetPicker kind="image" value={f.asset_id} onChange={(v) => set("asset_id", v)} label={tr("صورة البداية", "Start image")} />
            <Field label={tr("الوصف", "Prompt")}><textarea className="inp" rows={3} value={f.prompt} onChange={(e) => set("prompt", e.target.value)} /></Field>
            <Field label={tr("عدد الإطارات", "Frames")}><input className="inp" type="number" min={9} max={121} value={f.frames} onChange={(e) => set("frames", Number(e.target.value))} /></Field>
            <Estimate kind="video.generate" params={f} />
            <button className="btn-primary w-full" disabled={busy} onClick={() => start("video.generate", { image_asset_id: f.asset_id, prompt: f.prompt, frames: f.frames, aspect: f.aspect, fps: 8 }, project ?? undefined)}>{tr("توليد", "Generate")}</button></>}
          {mode === "project" && <>
            <ProjectSelect value={project} onChange={setProject} />
            {common}
            <p className="text-sm text-mute">{tr("جهّز المشاهد (صور وصوت وترجمة) في محرر الفيديو ثم صدّر. تبقى الشخصيات والخلفيات متناسقة لأنها تُستخدم من نفس الملفات.", "Prepare scenes (images, audio, subtitles) in the Video Editor, then export. Characters and backgrounds stay consistent because the same asset files are reused.")}</p>
            <div className="flex gap-2">{project && <Link className="btn-ghost" href={`/editor?project=${project}`}>{tr("فتح المحرر", "Open editor")}</Link>}
              <button className="btn-primary" disabled={busy || !project} onClick={() => start("video.render", { project_id: project, aspect: f.aspect, resolution: f.resolution, fps: f.fps }, project!)}>{tr("تصدير المشروع", "Render project")}</button></div></>}
          <JobPanel job={job} cancel={cancel} />
        </div>
        <div className="card p-5 text-sm text-mute"><h3 className="mb-2 font-bold text-ink">{tr("ما الذي يعمل بدون GPU؟", "What works without a GPU?")}</h3>
          <ul className="list-disc space-y-1 ps-5"><li>{tr("تحريك الصور بحركات الكاميرا، المونتاج، الصوت، الترجمة والتصدير (FFmpeg).", "Camera-motion animation, editing, audio, subtitles and export (FFmpeg).")}</li>
            <li>{tr("توليد الصور والفيديو بالذكاء الاصطناعي يتطلب ComfyUI وبطاقة GPU.", "AI image/video generation requires ComfyUI and a GPU.")}</li>
            <li>{tr("لا نعد بتوليد غير محدود؛ الحدود هي موارد جهازك.", "Nothing is 'unlimited': your hardware is the limit.")}</li></ul></div>
      </div>
    </>
  );
}
