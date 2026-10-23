import { PrintButton } from "./print-button";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-navy-50 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
        <PrintButton />
      </div>
      <main id="main" className="mx-auto max-w-[210mm] bg-white p-[14mm] shadow print:max-w-none print:p-0 print:shadow-none">{children}</main>
    </div>
  );
}
