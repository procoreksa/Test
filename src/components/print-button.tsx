"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium"
    >
      🖨️ طباعة / حفظ PDF
    </button>
  );
}
