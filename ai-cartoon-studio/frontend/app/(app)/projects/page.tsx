"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { api, download } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Empty, Field, Modal, PageHeader } from "@/components/ui";

function Inner() {
  const { tr, toast, lang } = useApp(); const router = useRouter(); const sp = useSearchParams();
  const [items, setItems] = useState<any[]>([]); const [q, setQ] = useState(""); const [open, setOpen] = useState(sp.get("new") === "1");
  const [f, setF] = useState<{ name: string; description: string; lang: string }>({ name: "", description: "", lang });
  const load = () => api.get(`/projects${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setItems).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, [q]);
  const create = async () => { if (!f.name.trim()) return; const p = await api.post("/projects", f); router.push(`/projects/${p.id}`); };
  return (
    <>
      <PageHeader title={tr("مكتبة المشاريع", "Projects Library")} actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />{tr("مشروع جديد", "New project")}</button>} />
      <input className="inp mb-4 max-w-sm" placeholder={tr("بحث...", "Search...")} value={q} onChange={(e) => setQ(e.target.value)} />
      {items.length === 0 ? <Empty text={tr("لا توجد مشاريع بعد. أنشئ أول مشروع!", "No projects yet. Create your first one!")} /> :
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => (
          <div key={p.id} className="card p-4">
            <Link href={`/projects/${p.id}`} className="block"><h3 className="font-bold">{p.name}</h3><p className="mt-1 line-clamp-2 text-sm text-mute">{p.description || "—"}</p>
              <p className="mt-2 text-xs text-mute">{p.data.scene_count} {tr("مشهد", "scenes")} · {new Date(p.updated_at).toLocaleDateString()}</p></Link>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost !px-2" title="duplicate" onClick={async () => { await api.post(`/projects/${p.id}/duplicate`); toast(tr("تم النسخ", "Duplicated")); load(); }}><Copy size={14} /></button>
              <button className="btn-ghost !px-2" title="export" onClick={() => download(`/projects/${p.id}/export`, `project-${p.id}.zip`).catch((e) => toast(e.message, "err"))}><Download size={14} /></button>
              <button className="btn-danger !px-2" title="delete" onClick={async () => { if (confirm(tr("حذف المشروع نهائياً؟", "Delete this project permanently?"))) { await api.del(`/projects/${p.id}`); load(); } }}><Trash2 size={14} /></button>
            </div></div>))}</div>}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("مشروع جديد", "New project")}>
        <div className="space-y-3">
          <Field label={tr("الاسم", "Name")}><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={tr("الوصف", "Description")}><textarea className="inp" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label={tr("اللغة", "Language")}><select className="inp" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></select></Field>
          <button className="btn-primary" onClick={create}>{tr("إنشاء", "Create")}</button>
        </div>
      </Modal>
    </>
  );
}
export default function Projects() { return <Suspense><Inner /></Suspense>; }
