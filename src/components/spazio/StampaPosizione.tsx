'use client';

import { Printer } from 'lucide-react';

// Stampa la pagina così com'è: è il documento della posizione, non un report
// generato a parte. Nessun PDF costruito da un secondo motore.

export function StampaPosizione() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:border-blue-400 hover:text-blue-700"
    >
      <Printer className="w-3.5 h-3.5" />
      Stampa la posizione
    </button>
  );
}
