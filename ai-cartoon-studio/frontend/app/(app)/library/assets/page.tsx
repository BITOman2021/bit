"use client";
import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { api, fmtBytes, media } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Asset, AssetView, Empty, PageHeader } from "@/components/ui";

export default function Assets() {
  const { tr, toast } = useApp(); const [items, setItems] = useState<Asset[]>([]); const [kind, setKind] = useState(""); const [q, setQ] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const load = () => api.get(`/assets?limit=300${kind ? `&kind=${kind}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then(setItems);
  useEffect(() => { load(); }, [kind, q]);
  const up = async (files: FileList | null) => {
    for (const f of Array.from(files || [])) { const fd = new FormData(); fd.append("file", f); try { await api.upload("/assets", fd); } catch (e: any) { toast(`${f.name}: ${e.message}`, "err"); } }
    load();
  };
  return (
    <>
      <PageHeader title={tr("مكتبة الملفات", "Assets Library")} actions={<><input ref={ref} type="file" multiple hidden onChange={(e) => up(e.target.files)} /><button className="btn-primary" onClick={() => ref.current?.click()}><Upload size={16} />{tr("رفع ملفات", "Upload")}</button></>} />
      <div className="mb-4 flex flex-wrap gap-2"><input className="inp max-w-xs" placeholder={tr("بحث...", "Search...")} value={q} onChange={(e) => setQ(e.target.value)} />
        {["", "image", "audio", "video", "subtitle"].map((k) => <button key={k} className={kind === k ? "btn-primary" : "btn-ghost"} onClick={() => setKind(k)}>{k || tr("الكل", "All")}</button>)}</div>
      <p className="mb-3 text-xs text-mute">{tr("الأنواع المسموحة: صور، صوت، فيديو، ترجمة. يتم فحص محتوى كل ملف.", "Allowed: images, audio, video, subtitles. File contents are validated.")}</p>
      {items.length === 0 ? <Empty text={tr("لا توجد ملفات", "No files")} /> :
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{items.map((a) => (
          <div key={a.id} className="card p-2"><AssetView a={a} className="h-36 w-full" />
            <div className="mt-1 truncate text-xs">{a.name}</div><div className="flex items-center justify-between text-xs text-mute"><span>{fmtBytes((a as any).size)}</span>
              <span className="flex gap-2"><a className="text-brand" href={media(a.url + "?download=true")}>{tr("تنزيل", "Get")}</a>
                <button className="text-bad" onClick={async () => { try { await api.del(`/assets/${a.id}`); load(); } catch (e: any) { toast(e.message === "asset_is_locked_reference" ? tr("صورة مرجعية مقفلة", "Locked reference image") : e.message, "err"); } }}><Trash2 size={12} /></button></span></div></div>))}</div>}
    </>
  );
}
