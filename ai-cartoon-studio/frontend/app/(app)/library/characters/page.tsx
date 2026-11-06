"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, media } from "@/lib/api";
import { useApp } from "@/lib/app";
import { Empty, PageHeader } from "@/components/ui";

export default function CharLib() {
  const { tr, toast } = useApp(); const [items, setItems] = useState<any[]>([]);
  const load = () => api.get("/characters?workspace=general").then(setItems);
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title={tr("مكتبة الشخصيات", "Character Library")} actions={<Link href="/characters" className="btn-primary">{tr("شخصية جديدة", "New character")}</Link>} />
      {items.length === 0 ? <Empty text={tr("لا توجد شخصيات بعد", "No characters yet")} /> :
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map((c) => (
          <div key={c.id} className="card p-3">
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-panel2">{c.reference_asset_id ? <img className="h-full object-contain" src={media(`/api/assets/${c.reference_asset_id}/file`)} alt="" /> : <span className="text-4xl">🎭</span>}</div>
            <div className="mt-2 flex items-center justify-between"><div><b>{c.name}</b><div className="text-xs text-mute">v{c.version} · {Object.keys(c.sheet).length} {tr("صور", "sheet imgs")}</div></div>
              <div className="flex gap-1"><Link className="btn-ghost !px-2 !py-1 text-xs" href={`/characters?id=${c.id}`}>{tr("فتح", "Open")}</Link>
                <button className="btn-danger !px-2 !py-1" onClick={async () => { if (confirm(tr("حذف الشخصية؟", "Delete character?"))) { await api.del(`/characters/${c.id}`).catch((e) => toast(e.message, "err")); load(); } }}><Trash2 size={14} /></button></div></div></div>))}</div>}
    </>
  );
}
