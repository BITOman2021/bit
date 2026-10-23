import type { Settings } from "@/server/services/settings";

export function Letterhead({ s, title, number }: { s: Settings; title: string; number: string }) {
  return (
    <header className="mb-6 flex items-start justify-between border-b-4 border-gold-500 pb-4">
      <div>
        <div className="text-lg font-black text-navy-900">{s["company.nameAr"]}</div>
        <div className="text-sm font-semibold text-navy-700" dir="ltr">{s["company.nameEn"]}</div>
        <div className="text-xs text-muted">{s["company.address"]} {s["company.phone"] && `· ${s["company.phone"]}`} {s["company.crNumber"] && `· CR ${s["company.crNumber"]}`}</div>
      </div>
      <div className="text-end">
        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-navy-900 text-xs font-black text-gold-500 print:[-webkit-print-color-adjust:exact]">GSW</div>
        <div className="text-base font-bold text-navy-900">{title}</div>
        <div className="num text-sm">{number}</div>
      </div>
    </header>
  );
}
