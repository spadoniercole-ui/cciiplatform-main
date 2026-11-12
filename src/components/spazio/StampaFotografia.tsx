'use client';

import { Printer } from 'lucide-react';

/** Solo il pulsante: la pagina è un Server Component e non può passare handler. */
export function StampaFotografia() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 print:hidden"
    >
      <Printer className="w-3 h-3" /> Stampa la fotografia
    </button>
  );
}
