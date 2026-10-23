"use client";
export function PrintButton() {
  return (
    <button className="btn-primary" onClick={() => window.print()}>
      طباعة / حفظ PDF — Print / Save as PDF
    </button>
  );
}
