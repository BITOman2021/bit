"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Estimate, EngineStatus, Field, JobPanel, PageHeader, ProjectSelect, useJob, useQueryProject } from "@/components/ui";

export default function Story() {
  const { tr, toast, lang } = useApp(); const [project, setProject] = useQueryProject();
  const [f, setF] = useState<any>({ idea: "", language: lang, age_group: "4-7", genre: "adventure", duration_minutes: 3, scenes: 6, characters: "", comedy: 2, education: 3, moral: "", engine: "template" });
  const [story, setStory] = useState<any>(null);
  const { job, start, cancel, busy } = useJob((j) => setStory(j.result.story));
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const params = { ...f, characters: f.characters.split(/[,،]/).map((s: string) => s.trim()).filter(Boolean) };
  const edit = (i: number, patch: any) => setStory({ ...story, scenes: story.scenes.map((s: any, k: number) => (k === i ? { ...s, ...patch } : s)) });
  const apply = async () => {
    if (!project) return toast(tr("اختر مشروعاً أولاً", "Pick a project first"), "err");
    const p = await api.get(`/projects/${project}`); const old = p.data?.timeline?.scenes || [];
    const scenes = story.scenes.map((s: any, i: number) => ({ ...(old[i] || {}), title: s.title, duration: Number(s.duration) || 5, motion: old[i]?.motion || "zoom_in", subtitle: s.subtitle || "", description: s.description || "", action: s.action || "", characters: s.characters || [] }));
    await api.patch(`/projects/${project}`, { data: { script: story, timeline: { ...(p.data?.timeline || {}), scenes } }, revision_note: "script applied" });
    toast(tr("تم تطبيق السيناريو على الخط الزمني للمشروع", "Script applied to the project timeline"));
  };
  return (
    <>
      <PageHeader title={tr("مولّد القصص والسيناريو", "Story & Script Generator")} />
      <EngineStatus ids={["gateway", "ollama", "template"]} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card space-y-3 p-5 lg:col-span-2">
          <Field label={tr("الفكرة", "Idea")}><textarea className="inp" rows={3} value={f.idea} onChange={(e) => set("idea", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("اللغة", "Language")}><select className="inp" value={f.language} onChange={(e) => set("language", e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select></Field>
            <Field label={tr("الفئة العمرية", "Age group")}><select className="inp" value={f.age_group} onChange={(e) => set("age_group", e.target.value)}>{["2-4", "4-7", "7-10", "10+"].map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label={tr("نوع القصة", "Genre")}><select className="inp" value={f.genre} onChange={(e) => set("genre", e.target.value)}>{["adventure", "educational", "comedy", "fantasy", "friendship", "bedtime"].map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label={tr("المدة (دقائق)", "Duration (min)")}><input className="inp" type="number" min={0.5} step={0.5} value={f.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} /></Field>
            <Field label={tr("عدد المشاهد", "Scenes")}><input className="inp" type="number" min={1} max={30} value={f.scenes} onChange={(e) => set("scenes", Number(e.target.value))} /></Field>
            <Field label={tr("الكوميديا (0-5)", "Comedy (0-5)")}><input className="inp" type="number" min={0} max={5} value={f.comedy} onChange={(e) => set("comedy", Number(e.target.value))} /></Field>
            <Field label={tr("المستوى التعليمي (0-5)", "Educational (0-5)")}><input className="inp" type="number" min={0} max={5} value={f.education} onChange={(e) => set("education", Number(e.target.value))} /></Field>
            <Field label={tr("المحرك", "Engine")}><select className="inp" value={f.engine} onChange={(e) => set("engine", e.target.value)}><option value="template">{tr("هيكل جاهز (بدون ذكاء اصطناعي)", "Scaffold (no AI)")}</option><option value="ollama">Ollama (LLM)</option><option value="gateway">OmniRoute / OpenAI-compatible</option></select></Field>
          </div>
          <Field label={tr("الشخصيات (مفصولة بفاصلة)", "Characters (comma separated)")}><input className="inp" value={f.characters} onChange={(e) => set("characters", e.target.value)} /></Field>
          <Field label={tr("الرسالة التعليمية / القيمة", "Moral / value")}><input className="inp" value={f.moral} onChange={(e) => set("moral", e.target.value)} /></Field>
          <Estimate kind="story.generate" params={params} />
          <button className="btn-primary w-full" disabled={busy || !f.idea.trim()} onClick={() => start("story.generate", params)}>{tr("توليد", "Generate")}</button>
          <JobPanel job={job} cancel={cancel} />
        </div>
        <div className="lg:col-span-3">
          {story && <div className="card space-y-3 p-5">
            {story.notice && <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{story.notice}</div>}
            <Field label={tr("العنوان", "Title")}><input className="inp" value={story.title || ""} onChange={(e) => setStory({ ...story, title: e.target.value })} /></Field>
            <Field label={tr("الملخص", "Synopsis")}><textarea className="inp" rows={2} value={story.synopsis || ""} onChange={(e) => setStory({ ...story, synopsis: e.target.value })} /></Field>
            {story.scenes.map((s: any, i: number) => (
              <div key={i} className="rounded-xl border border-line p-3"><div className="mb-2 flex gap-2"><span className="chip bg-brand/15 text-brand">{i + 1}</span>
                <input className="inp" value={s.title} onChange={(e) => edit(i, { title: e.target.value })} /><input className="inp !w-24" type="number" value={s.duration} onChange={(e) => edit(i, { duration: e.target.value })} /></div>
                <textarea className="inp mb-2" rows={2} placeholder={tr("وصف المشهد والحركة والتعبيرات", "Scene, action and expressions")} value={s.description || ""} onChange={(e) => edit(i, { description: e.target.value })} />
                {(s.dialogue || []).map((d: any, k: number) => <div key={k} className="mb-1 text-xs"><b>{d.character}:</b> {d.line} <i className="text-mute">{d.emotion}</i></div>)}
                <textarea className="inp" rows={2} placeholder={tr("الحوار / الترجمة", "Dialogue / subtitle")} value={s.subtitle || ""} onChange={(e) => edit(i, { subtitle: e.target.value })} /></div>))}
            <div className="grid grid-cols-2 gap-3"><ProjectSelect value={project} onChange={setProject} /><button className="btn-primary self-end" onClick={apply}>{tr("تطبيق على المشروع", "Apply to project")}</button></div>
          </div>}
        </div>
      </div>
    </>
  );
}
