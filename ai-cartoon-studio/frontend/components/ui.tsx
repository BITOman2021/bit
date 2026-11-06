"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, media } from "@/lib/api";
import { useApp } from "@/lib/app";

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="fixed bottom-4 start-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`card flex max-w-sm items-center gap-2 px-4 py-3 text-sm ${t.kind === "err" ? "border-bad/50" : "border-ok/50"}`}>
          {t.kind === "err" ? <AlertTriangle size={16} className="text-bad" /> : <CheckCircle2 size={16} className="text-ok" />}{t.msg}
        </div>
      ))}
    </div>
  );
}
export const Spinner = ({ s = 16 }: { s?: number }) => <Loader2 size={s} className="animate-spin" />;
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="lbl">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}</label>;
}
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="mt-1 text-sm text-mute">{sub}</p>}</div>{actions}
    </div>
  );
}
export const Progress = ({ v }: { v: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2"><div className="h-full bg-gradient-to-r from-brand to-brand2 transition-all" style={{ width: `${Math.round(v * 100)}%` }} /></div>
);
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{title}</h3><button onClick={onClose}><X size={18} /></button></div>{children}
      </div>
    </div>
  );
}
export function Empty({ text }: { text: string }) { return <div className="card p-8 text-center text-sm text-mute">{text}</div>; }

export type Asset = { id: number; kind: string; name: string; url: string; meta: any; created_at: string; project_id: number | null };
export function AssetView({ a, className = "" }: { a: Asset; className?: string }) {
  if (a.kind === "image") return <img src={media(a.url)} alt={a.name} className={`rounded-xl object-contain ${className}`} loading="lazy" />;
  if (a.kind === "video") return <video src={media(a.url)} controls className={`rounded-xl ${className}`} />;
  if (a.kind === "audio") return <audio src={media(a.url)} controls className={className} />;
  return <a className="btn-ghost" href={media(a.url + "?download=true")}>{a.name}</a>;
}

/** Pick one asset of a kind from the user's library. */
export function AssetPicker({ kind, value, onChange, label, projectId }: { kind: string; value: number | null; onChange: (id: number | null) => void; label: string; projectId?: number }) {
  const { tr } = useApp();
  const [items, setItems] = useState<Asset[]>([]);
  useEffect(() => { api.get(`/assets?kind=${kind}${projectId ? `&project_id=${projectId}` : ""}&limit=60`).then(setItems).catch(() => {}); }, [kind, projectId]);
  return (
    <Field label={label}>
      <select className="inp" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{tr("— بدون —", "— none —")}</option>
        {items.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.name}</option>)}
      </select>
      {value && items.find((a) => a.id === value) && kind === "image" && <img className="mt-2 h-20 rounded-lg" src={media(items.find((a) => a.id === value)!.url)} alt="" />}
    </Field>
  );
}

export function EngineStatus({ ids }: { ids: string[] }) {
  const { tr } = useApp();
  const [eng, setEng] = useState<any[]>([]);
  useEffect(() => { api.get("/engines").then((d) => setEng(d.engines.filter((e: any) => ids.includes(e.id)))).catch(() => {}); }, [ids.join()]);
  return (
    <div className="mb-4 flex flex-col gap-2">
      {eng.map((e) => (
        <div key={e.id} className={`card flex flex-wrap items-start gap-2 p-3 text-xs ${e.available ? "" : "border-warn/50"}`}>
          <span className={`chip ${e.available ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>{e.available ? tr("جاهز", "Ready") : tr("غير متاح", "Unavailable")}</span>
          <b>{e.name}</b><span className="text-mute">{e.detail}</span>
          {!e.available && <span className="w-full text-mute">{tr("المتطلبات: ", "Requirements: ")}{e.requirements} — {tr("الترخيص: ", "License: ")}{e.license}</span>}
        </div>
      ))}
    </div>
  );
}

export type JobState = { id: number; status: string; progress: number; message: string; error: string; result: any; assets?: Asset[]; estimate?: any; kind: string };

/** Hook: submit a job, poll until finished. Failure is shown as failure - never as success. */
export function useJob(onDone?: (j: JobState) => void) {
  const { toast, tr } = useApp();
  const [job, setJob] = useState<JobState | null>(null);
  const timer = useRef<any>(null);
  const done = useRef(onDone); done.current = onDone;
  const poll = (id: number) => {
    clearTimeout(timer.current);
    api.get(`/jobs/${id}`).then((j: JobState) => {
      setJob(j);
      if (j.status === "queued" || j.status === "running") timer.current = setTimeout(() => poll(id), 1200);
      else if (j.status === "done") { toast(tr("اكتملت العملية", "Job finished")); done.current?.(j); }
      else if (j.status === "failed") toast(j.error.split("\n")[0], "err");
    }).catch(() => (timer.current = setTimeout(() => poll(id), 3000)));
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = async (kind: string, params: any, project_id?: number) => {
    try { const j = await api.post("/jobs", { kind, params, project_id }); setJob(j); poll(j.id); return j; }
    catch (e: any) { toast(e.message === "daily_quota_exceeded" ? tr("تجاوزت الحد اليومي للمهام", "Daily job limit reached") : e.message, "err"); }
  };
  const cancel = () => job && api.post(`/jobs/${job.id}/cancel`).then(setJob);
  const busy = !!job && (job.status === "queued" || job.status === "running");
  const watch = (id: number) => poll(id); // follow a job created elsewhere (e.g. by a dedicated endpoint)
  return { job, start, watch, cancel, busy, reset: () => setJob(null) };
}

export function JobPanel({ job, cancel }: { job: JobState | null; cancel: () => void }) {
  const { tr } = useApp();
  if (!job) return null;
  const run = job.status === "queued" || job.status === "running";
  return (
    <div className={`card mt-4 p-4 ${job.status === "failed" ? "border-bad/60" : ""}`}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold">{run && <Spinner />}{{ queued: tr("في الطابور", "Queued"), running: tr("قيد المعالجة", "Processing"), done: tr("اكتمل", "Done"), failed: tr("فشل", "Failed"), cancelled: tr("أُلغي", "Cancelled") }[job.status]}
          <span className="text-mute">{job.message}</span></span>
        {run && <button className="btn-ghost !py-1" onClick={cancel}>{tr("إلغاء", "Cancel")}</button>}
      </div>
      {run && <Progress v={job.progress} />}
      {job.status === "failed" && <pre dir="ltr" className="mt-2 whitespace-pre-wrap rounded-lg bg-bad/10 p-3 text-xs text-bad">{job.error}</pre>}
      {job.status === "done" && job.assets && job.assets.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">{job.assets.map((a) => <div key={a.id}><AssetView a={a} className="w-full" /><a className="mt-1 block text-xs text-brand" href={media(a.url + "?download=true")}>{tr("تنزيل", "Download")} #{a.id}</a></div>)}</div>
      )}
    </div>
  );
}

export function Estimate({ kind, params }: { kind: string; params: any }) {
  const { tr } = useApp();
  const [e, setE] = useState<any>(null);
  const key = JSON.stringify(params);
  useEffect(() => { const t = setTimeout(() => api.post("/estimate", { kind, params }).then(setE).catch(() => {}), 300); return () => clearTimeout(t); }, [kind, key]);
  if (!e) return null;
  return (
    <div className="rounded-xl border border-line bg-panel2 p-3 text-xs text-mute">
      <b className="text-ink">{tr("تقدير التشغيل (تقريبي): ", "Run estimate (rough): ")}</b>
      {tr(`~${e.seconds} ث`, `~${e.seconds}s`)} · {tr("تكلفة مالية: 0 (معالجة محلية)", "money cost: 0 (local processing)")}
      {e.vram_gb > 0 && ` · GPU ≥ ${e.vram_gb}GB`} · RAM ≥ {e.ram_gb}GB<div>{e.note}</div>
    </div>
  );
}

export function useProjects() {
  const [p, setP] = useState<any[]>([]);
  useEffect(() => { api.get("/projects").then(setP).catch(() => {}); }, []);
  return p;
}
export function ProjectSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { tr } = useApp(); const ps = useProjects();
  return (
    <Field label={tr("المشروع", "Project")}>
      <select className="inp" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{tr("— بدون مشروع —", "— no project —")}</option>{ps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </Field>
  );
}

/** Reads ?project=ID without useSearchParams (avoids Suspense requirements in static pages). */
export function useQueryProject(): [number | null, (v: number | null) => void] {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => { const p = new URLSearchParams(window.location.search).get("project"); if (p) setV(Number(p)); }, []);
  return [v, setV];
}
export function useCharacters(workspace?: string) {
  const [c, setC] = useState<any[]>([]);
  useEffect(() => { api.get(`/characters${workspace ? `?workspace=${workspace}` : ""}`).then(setC).catch(() => {}); }, [workspace]);
  return c;
}
