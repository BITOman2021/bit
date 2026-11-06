"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/app";
import { AssetPicker, Estimate, EngineStatus, Field, JobPanel, PageHeader, ProjectSelect, useCharacters, useJob, useQueryProject, Asset } from "@/components/ui";

const STYLES: Record<string, [string, string]> = { cartoon_2d: ["كرتون ثنائي الأبعاد", "2D Cartoon"], cartoon_3d: ["كرتون ثلاثي الأبعاد", "3D Cartoon"], pixar_like: ["3D بجمالية سينمائية أصلية", "Original 3D film look"],
  anime: ["أنمي", "Anime"], kids_edu: ["رسوم تعليمية للأطفال", "Kids educational"], storybook: ["كتاب قصص مائي", "Storybook watercolor"] };
const LIGHT: Record<string, [string, string]> = { "": ["تلقائي", "Auto"], soft: ["ناعمة", "Soft"], sunny: ["شمس ساطعة", "Sunny"], sunset: ["غروب", "Sunset"], night: ["ليل", "Night"], studio: ["استوديو", "Studio"], dramatic: ["درامية", "Dramatic"] };
const CAM: Record<string, [string, string]> = { "": ["تلقائي", "Auto"], eye: ["مستوى العين", "Eye level"], low: ["زاوية منخفضة", "Low angle"], high: ["زاوية عالية", "High angle"], close: ["لقطة قريبة", "Close-up"], wide: ["لقطة واسعة", "Wide"], full: ["جسم كامل", "Full body"] };

export default function ImageStudio() {
  const { tr, lang } = useApp(); const chars = useCharacters(); const [project, setProject] = useQueryProject();
  const [f, setF] = useState<any>({ prompt: "", negative: "", style: "cartoon_2d", aspect: "1:1", quality: "standard", count: 1, lighting: "", camera: "", colors: "", transparent: false, seed: "", denoise: 0.55 });
  const [mode, setMode] = useState<"t2i" | "i2i">("t2i"); const [init, setInit] = useState<number | null>(null); const [sel, setSel] = useState<number[]>([]); const [useRef, setUseRef] = useState(false);
  const { job, start, cancel, busy } = useJob();
  const [tool, setTool] = useState<{ id: number | null; op: string; factor: number; tol: number }>({ id: null, op: "upscale", factor: 2, tol: 28 }); const [toolOut, setToolOut] = useState<Asset | null>(null); const { toast } = useApp();
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const params = { ...f, seed: f.seed ? Number(f.seed) : undefined, character_ids: sel, init_asset_id: mode === "i2i" ? init : undefined, use_reference: useRef };
  const L = (o: Record<string, [string, string]>) => Object.entries(o).map(([k, v]) => <option key={k} value={k}>{lang === "ar" ? v[0] : v[1]}</option>);
  return (
    <>
      <PageHeader title={tr("استوديو الصور", "AI Image Studio")} sub={tr("تُحفظ كل الصور تلقائياً في مكتبة الملفات", "Every image is saved to your assets library automatically")} />
      <EngineStatus ids={["comfyui-sdxl"]} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card space-y-3 p-5 lg:col-span-2">
          <div className="flex gap-2">{(["t2i", "i2i"] as const).map((m) => <button key={m} className={mode === m ? "btn-primary" : "btn-ghost"} onClick={() => setMode(m)}>{m === "t2i" ? tr("نص إلى صورة", "Text to image") : tr("صورة إلى صورة", "Image to image")}</button>)}</div>
          <Field label={tr("الوصف", "Prompt")}><textarea className="inp" rows={4} value={f.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder={tr("مثال: أرنب لطيف يقرأ كتاباً في حديقة", "e.g. a cute bunny reading a book in a garden")} /></Field>
          {mode === "i2i" && <><AssetPicker kind="image" value={init} onChange={setInit} label={tr("الصورة المرجعية", "Source image")} /><Field label={`${tr("قوة التغيير", "Change strength")} ${f.denoise}`}><input type="range" min={0.1} max={0.95} step={0.05} value={f.denoise} onChange={(e) => set("denoise", Number(e.target.value))} className="w-full" /></Field></>}
          <Field label={tr("الشخصيات (يُثبَّت شكلها في كل صورة)", "Characters (appearance is locked into every image)")}>
            <div className="flex flex-wrap gap-2">{chars.length === 0 && <span className="text-xs text-mute">{tr("لا توجد شخصيات بعد", "No characters yet")}</span>}
              {chars.map((c) => <button key={c.id} className={`chip border ${sel.includes(c.id) ? "border-brand bg-brand/20 text-brand" : "border-line"}`} onClick={() => setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id])}>{c.name}</button>)}</div></Field>
          {sel.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useRef} onChange={(e) => setUseRef(e.target.checked)} />{tr("استخدام الصورة المرجعية للشخصية (img2img)", "Use the character's reference image (img2img)")}</label>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("الأسلوب", "Style")}><select className="inp" value={f.style} onChange={(e) => set("style", e.target.value)}>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{lang === "ar" ? v[0] : v[1]}</option>)}</select></Field>
            <Field label={tr("النسبة", "Aspect ratio")}><select className="inp" value={f.aspect} onChange={(e) => set("aspect", e.target.value)}>{["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label={tr("الجودة", "Quality")}><select className="inp" value={f.quality} onChange={(e) => set("quality", e.target.value)}><option value="draft">{tr("مسودة 512", "Draft 512")}</option><option value="standard">{tr("قياسي 768", "Standard 768")}</option><option value="high">{tr("عالٍ 1024", "High 1024")}</option></select></Field>
            <Field label={tr("عدد الصور", "Images")}><input className="inp" type="number" min={1} max={8} value={f.count} onChange={(e) => set("count", Number(e.target.value))} /></Field>
            <Field label={tr("الإضاءة", "Lighting")}><select className="inp" value={f.lighting} onChange={(e) => set("lighting", e.target.value)}>{L(LIGHT)}</select></Field>
            <Field label={tr("زاوية الكاميرا", "Camera angle")}><select className="inp" value={f.camera} onChange={(e) => set("camera", e.target.value)}>{L(CAM)}</select></Field>
          </div>
          <Field label={tr("الألوان", "Colors")}><input className="inp" value={f.colors} onChange={(e) => set("colors", e.target.value)} placeholder={tr("أزرق وأصفر", "blue and yellow")} /></Field>
          <Field label={tr("ما لا تريده", "Negative prompt")}><input className="inp" value={f.negative} onChange={(e) => set("negative", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Seed"><input className="inp" dir="ltr" value={f.seed} onChange={(e) => set("seed", e.target.value)} placeholder="random" /></Field><ProjectSelect value={project} onChange={setProject} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.transparent} onChange={(e) => set("transparent", e.target.checked)} />{tr("خلفية شفافة (تُزال الخلفية بعد التوليد)", "Transparent background (removed after generation)")}</label>
          <Estimate kind="image.generate" params={params} />
          <button className="btn-primary w-full" disabled={busy || !f.prompt.trim()} onClick={() => start("image.generate", params, project ?? undefined)}>{tr("توليد", "Generate")}</button>
        </div>
        <div className="lg:col-span-3"><JobPanel job={job} cancel={cancel} />
          <div className="card mt-4 space-y-3 p-5"><h3 className="font-bold">{tr("أدوات الصور (CPU، بلا GPU)", "Image tools (CPU, no GPU)")}</h3>
            <div className="grid gap-3 sm:grid-cols-3"><AssetPicker kind="image" value={tool.id} onChange={(id) => setTool({ ...tool, id })} label={tr("الصورة", "Image")} />
              <Field label={tr("العملية", "Operation")}><select className="inp" value={tool.op} onChange={(e) => setTool({ ...tool, op: e.target.value })}><option value="upscale">{tr("تكبير", "Upscale")}</option><option value="remove_background">{tr("إزالة الخلفية", "Remove background")}</option>
                <option value="edit_flip">{tr("قلب أفقي", "Flip")}</option><option value="edit_bright">{tr("زيادة السطوع", "Brighten")}</option></select></Field>
              <button className="btn-ghost self-end" disabled={!tool.id} onClick={async () => {
                try { const body: any = { asset_id: tool.id, op: tool.op.startsWith("edit") ? "edit" : tool.op, factor: tool.factor, tolerance: tool.tol, ops: tool.op === "edit_flip" ? { flip: true } : { brightness: 1.2 } };
                  setToolOut(await api.post("/image-tools", body)); toast(tr("تم الحفظ في المكتبة", "Saved to library")); } catch (e: any) { toast(e.message, "err"); } }}>{tr("تنفيذ", "Run")}</button></div>
            <p className="text-xs text-mute">{tr("التكبير: Lanczos + حدّة (ليس AI). إزالة الخلفية: للخلفيات الموحدة اللون.", "Upscale: Lanczos + sharpening (not AI). Background removal works for flat-color backgrounds.")}</p>
            {toolOut && <img src={`${toolOut.url}?token=${encodeURIComponent(localStorage.getItem("acs_token") || "")}`} className="max-h-64 rounded-xl bg-[repeating-conic-gradient(#8884_0_25%,transparent_0_50%)] bg-[length:16px_16px]" alt="" />}</div></div>
      </div>
    </>
  );
}
