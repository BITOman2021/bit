"use client";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Estimate, EngineStatus, Field, JobPanel, PageHeader, ProjectSelect, useCharacters, useJob, useQueryProject } from "@/components/ui";

export default function Voice() {
  const { tr, toast } = useApp(); const chars = useCharacters(); const [project, setProject] = useQueryProject();
  const [v, setV] = useState<{ voices: any[]; emotions: string[] }>({ voices: [], emotions: [] });
  const [f, setF] = useState<any>({ engine: "", voice: "", text: "", speed: 1, pitch: 0, emotion: "neutral", name: "", character_id: "" }); const [prev, setPrev] = useState(""); const [busyP, setBusyP] = useState(false);
  const { job, start, cancel, busy } = useJob();
  useEffect(() => { api.get("/voices").then((d) => { setV(d); if (d.voices[0]) setF((x: any) => ({ ...x, engine: d.voices[0].engine, voice: d.voices[0].id })); }); }, []);
  const set = (k: string, val: any) => setF({ ...f, [k]: val });
  const params = { ...f, character_id: f.character_id ? Number(f.character_id) : undefined };
  const preview = async () => {
    setBusyP(true);
    try {
      const r = await fetch("/api/voices/preview", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(f) });
      if (!r.ok) throw new Error((await r.json()).detail || "error"); setPrev(URL.createObjectURL(await r.blob()));
    } catch (e: any) { toast(e.message, "err"); } finally { setBusyP(false); }
  };
  const bind = async () => { const c = chars.find((x) => x.id === Number(f.character_id)); if (!c) return; await api.patch(`/characters/${c.id}`, { voice: { engine: f.engine, voice: f.voice, speed: f.speed, pitch: f.pitch, emotion: f.emotion } }); toast(tr(`تم تخصيص الصوت للشخصية ${c.name}`, `Voice assigned to ${c.name}`)); };
  const pick = (c: any) => { setF({ ...f, character_id: String(c.id), ...(c.voice?.voice ? c.voice : {}) }); };
  return (
    <>
      <PageHeader title={tr("استوديو الأصوات", "AI Voice Studio")} sub={tr("لا يوجد استنساخ لأصوات أشخاص حقيقيين. الأصوات اصطناعية فقط.", "No cloning of real people's voices. Synthetic voices only.")} />
      <EngineStatus ids={["piper", "espeak", "edge"]} />
      {v.voices.length === 0 && <div className="card mb-4 border-warn/50 p-4 text-sm">{tr("لا يوجد محرك صوت مثبّت. ثبّت Piper أو espeak-ng (راجع docs/AI_ENGINES.md).", "No TTS engine installed. Install Piper or espeak-ng (see docs/AI_ENGINES.md).")}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <Field label={tr("الصوت", "Voice")}><select className="inp" value={`${f.engine}|${f.voice}`} onChange={(e) => { const [en, vo] = e.target.value.split("|"); setF({ ...f, engine: en, voice: vo }); }}>
            {v.voices.map((x) => <option key={x.engine + x.id} value={`${x.engine}|${x.id}`}>[{x.engine}] {x.label}</option>)}</select></Field>
          <Field label={tr("النص", "Text")}><textarea className="inp" rows={4} value={f.text} onChange={(e) => set("text", e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={`${tr("السرعة", "Speed")} ${f.speed}`}><input type="range" min={0.6} max={1.6} step={0.05} value={f.speed} onChange={(e) => set("speed", Number(e.target.value))} className="w-full" /></Field>
            <Field label={`${tr("النبرة", "Pitch")} ${f.pitch}`}><input type="range" min={-6} max={6} step={1} value={f.pitch} onChange={(e) => set("pitch", Number(e.target.value))} className="w-full" /></Field>
            <Field label={tr("الانفعال", "Emotion")}><select className="inp" value={f.emotion} onChange={(e) => set("emotion", e.target.value)}>{v.emotions.map((x) => <option key={x}>{x}</option>)}</select></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label={tr("اسم الملف", "File name")}><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field><ProjectSelect value={project} onChange={setProject} /></div>
          <Field label={tr("الشخصية", "Character")}><select className="inp" value={f.character_id} onChange={(e) => set("character_id", e.target.value)}><option value="">—</option>{chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Estimate kind="tts.synthesize" params={f} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busyP || !f.text.trim()} onClick={preview}>{tr("معاينة (لا تُحفظ)", "Preview (not saved)")}</button>
            <button className="btn-primary" disabled={busy || !f.text.trim()} onClick={() => start("tts.synthesize", params, project ?? undefined)}>{tr("اعتماد وحفظ", "Approve & save")}</button>
            <button className="btn-ghost" disabled={!f.character_id} onClick={bind}>{tr("تخصيص للشخصية", "Assign to character")}</button></div>
          {prev && <audio controls src={prev} autoPlay className="w-full" />}
          <JobPanel job={job} cancel={cancel} />
        </div>
        <div className="card p-5"><h3 className="mb-3 font-bold">{tr("أصوات الشخصيات", "Character voices")}</h3>
          {chars.length === 0 ? <p className="text-sm text-mute">{tr("لا توجد شخصيات", "No characters")}</p> : <ul className="space-y-2 text-sm">{chars.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 border-b border-line pb-2"><span><b>{c.name}</b> <span className="text-xs text-mute">{c.voice?.voice ? `${c.voice.engine}: ${c.voice.voice}` : tr("بلا صوت", "no voice")}</span></span>
              <button className="btn-ghost !py-1 text-xs" onClick={() => pick(c)}>{tr("اختيار", "Select")}</button></li>))}</ul>}</div>
      </div>
    </>
  );
}
