"use client";
import { useState } from "react";
import { useApp } from "@/lib/app";
import { AssetPicker, Estimate, EngineStatus, Field, JobPanel, PageHeader, useJob } from "@/components/ui";

export default function Lipsync() {
  const { tr } = useApp(); const [f, setF] = useState<any>({ image_asset_id: null, audio_asset_id: null, engine: "audio_reactive", style: "talk", aspect: "16:9", resolution: 720, fps: 24 });
  const { job, start, cancel, busy } = useJob(); const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <>
      <PageHeader title={tr("التحريك ومزامنة الصوت", "Lip Sync & Animation")} sub={tr("معاينة الحركة قبل اعتماد المشهد", "Preview the motion before approving the scene")} />
      <EngineStatus ids={["audio_reactive", "wav2lip"]} />
      <div className="card mb-4 border-warn/40 p-3 text-xs text-warn">{tr("المحرك المدمج يحرّك الشخصية كاملة تبعاً لشدة الكلام (نبض، اهتزاز، ميلان). ليس مزامنة شفاه دقيقة للحروف؛ المزامنة الدقيقة تحتاج Wav2Lip/SadTalker على GPU.", "The built-in engine animates the whole character from speech energy (pulse, bob, tilt). It is not phoneme-accurate lip-sync; that needs Wav2Lip/SadTalker on a GPU.")}</div>
      <div className="card max-w-xl space-y-3 p-5">
        <AssetPicker kind="image" value={f.image_asset_id} onChange={(v) => set("image_asset_id", v)} label={tr("صورة الشخصية (يُفضّل بخلفية شفافة)", "Character image (transparent background preferred)")} />
        <AssetPicker kind="audio" value={f.audio_asset_id} onChange={(v) => set("audio_asset_id", v)} label={tr("الصوت", "Audio")} />
        <div className="grid grid-cols-3 gap-3"><Field label={tr("المحرك", "Engine")}><select className="inp" value={f.engine} onChange={(e) => set("engine", e.target.value)}><option value="audio_reactive">audio_reactive</option><option value="wav2lip">wav2lip</option></select></Field>
          <Field label={tr("النمط", "Style")}><select className="inp" value={f.style} onChange={(e) => set("style", e.target.value)}><option value="talk">talk</option><option value="calm">calm</option></select></Field>
          <Field label={tr("النسبة", "Aspect")}><select className="inp" value={f.aspect} onChange={(e) => set("aspect", e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></Field></div>
        <Estimate kind="video.lipsync" params={f} />
        <button className="btn-primary" disabled={busy || !f.image_asset_id || !f.audio_asset_id} onClick={() => start("video.lipsync", f)}>{tr("إنشاء معاينة", "Create preview")}</button>
        <JobPanel job={job} cancel={cancel} />
      </div>
    </>
  );
}
