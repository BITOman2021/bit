"use client";
import { useEffect, useState } from "react";
import { api, media } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Asset, AssetView, EngineStatus, Field, JobPanel, PageHeader, useJob } from "@/components/ui";

const blank = { name: "", age: "", description: "", outfit: "", colors: "", features: "", style: "cartoon_2d" };

export default function Characters() {
  const { tr, toast } = useApp(); const [f, setF] = useState<any>(blank); const [cur, setCur] = useState<any>(null); const [file, setFile] = useState<File | null>(null);
  const [lock, setLock] = useState(false); const [sheetAssets, setSheetAssets] = useState<Record<string, Asset>>({});
  const { job, watch, cancel } = useJob(() => cur && reload(cur.id));
  const reload = async (id: number) => { const c = await api.get(`/characters/${id}`); setCur(c); setF({ ...blank, ...c }); const all: Asset[] = await api.get("/assets?kind=image&limit=300"); const m: Record<string, Asset> = {};
    Object.entries(c.sheet || {}).forEach(([k, aid]) => { const a = all.find((x) => x.id === aid); if (a) m[k] = a; }); setSheetAssets(m); };
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("id"); if (id) reload(Number(id)); }, []);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const save = async () => {
    try {
      if (!f.name.trim()) return toast(tr("الاسم مطلوب", "Name is required"), "err");
      let c = cur;
      if (!cur) c = await api.post("/characters", f);
      else {
        const appearanceChanged = ["description", "outfit", "colors", "features", "age", "style"].some((k) => f[k] !== cur[k]);
        const confirm = appearanceChanged && (Object.keys(cur.sheet || {}).length || cur.version > 1 || cur.reference_asset_id) ? window.confirm(tr("تغيير المظهر سيؤثر على ثبات الشخصية في المشاهد القادمة. هل تريد المتابعة؟", "Changing appearance affects consistency in future scenes. Continue?")) : false;
        if (appearanceChanged && !confirm && (Object.keys(cur.sheet || {}).length || cur.version > 1 || cur.reference_asset_id)) return;
        c = await api.patch(`/characters/${cur.id}`, { name: f.name, age: f.age, description: f.description, outfit: f.outfit, colors: f.colors, features: f.features, style: f.style, confirm_appearance_change: confirm });
      }
      if (file) { c = await api.upload(`/characters/${c.id}/reference`, (() => { const fd = new FormData(); fd.append("file", file); fd.append("lock", String(lock)); return fd; })()).then(() => api.get(`/characters/${c.id}`)); setFile(null); }
      toast(tr("تم الحفظ", "Saved")); await reload(c.id);
    } catch (e: any) { toast(e.message === "reference_locked_character_cannot_be_redesigned" ? tr("هذه شخصية مرجعية مقفلة ولا يمكن إعادة تصميمها", "This is a locked reference character and cannot be redesigned") : e.message, "err"); }
  };
  return (
    <>
      <PageHeader title={tr("منشئ الشخصيات", "Character Creator")} sub={tr("ملف دائم لكل شخصية: يُحقن وصفها في كل توليد للحفاظ على ثباتها", "A permanent profile per character, injected into every generation for consistency")} />
      <EngineStatus ids={["comfyui-sdxl"]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3"><Field label={tr("الاسم", "Name")}><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label={tr("العمر التخيّلي", "Fictional age")}><input className="inp" value={f.age} onChange={(e) => set("age", e.target.value)} /></Field></div>
          <Field label={tr("الوصف والملامح", "Description")}><textarea className="inp" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={cur?.reference_locked} /></Field>
          <Field label={tr("الملابس", "Outfit")}><input className="inp" value={f.outfit} onChange={(e) => set("outfit", e.target.value)} disabled={cur?.reference_locked} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={tr("الألوان", "Colors")}><input className="inp" value={f.colors} onChange={(e) => set("colors", e.target.value)} disabled={cur?.reference_locked} /></Field>
            <Field label={tr("علامات مميزة", "Distinct features")}><input className="inp" value={f.features} onChange={(e) => set("features", e.target.value)} disabled={cur?.reference_locked} /></Field></div>
          <Field label={tr("أسلوب الرسم", "Art style")}><select className="inp" value={f.style} onChange={(e) => set("style", e.target.value)}>{["cartoon_2d", "cartoon_3d", "pixar_like", "anime", "kids_edu", "storybook"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label={tr("صورة مرجعية", "Reference image")}><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />{tr("قفل الهوية: لا تُعاد صياغة هذه الشخصية أبداً", "Lock identity: never redesign this character")}</label>
          <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={save}>{cur ? tr("حفظ التعديلات", "Save changes") : tr("إنشاء الشخصية", "Create character")}</button>
            {cur && <button className="btn-ghost" onClick={() => { setCur(null); setF(blank); setSheetAssets({}); }}>{tr("شخصية جديدة", "New character")}</button>}</div>
        </div>
        <div className="card space-y-3 p-5">
          {!cur ? <p className="text-sm text-mute">{tr("احفظ الشخصية أولاً لتوليد ورقة الشخصية (وضعيات وتعبيرات).", "Save the character first to generate its sheet (poses & expressions).")}</p> : <>
            <div className="flex items-center gap-3">{cur.reference_asset_id && <img className="h-24 rounded-xl" src={media(`/api/assets/${cur.reference_asset_id}/file`)} alt="" />}
              <div className="text-sm"><b>{cur.name}</b> · v{cur.version} {cur.reference_locked && <span className="chip bg-warn/15 text-warn">{tr("هوية مقفلة", "Identity locked")}</span>}
                <p className="mt-1 text-xs text-mute" dir="ltr">{cur.profile}</p></div></div>
            <button className="btn-primary" onClick={async () => { try { const r = await api.post(`/characters/${cur.id}/sheet`, {}); watch(r.job_id); } catch (e: any) { toast(e.message, "err"); } }}>{tr("توليد ورقة الشخصية (3 وضعيات + 4 تعبيرات)", "Generate character sheet (3 poses + 4 expressions)")}</button>
            <JobPanel job={job} cancel={cancel} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(sheetAssets).map(([k, a]) => <div key={k}><AssetView a={a} className="w-full" /><div className="text-center text-xs text-mute">{k}</div></div>)}</div>
            {cur.history.length > 0 && <div className="text-xs text-mute">{tr("سجل تغييرات المظهر: ", "Appearance history: ")}{cur.history.map((h: any) => `v${h.version}`).join(", ")}</div>}
          </>}
        </div>
      </div>
    </>
  );
}
