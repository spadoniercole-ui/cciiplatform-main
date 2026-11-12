'use client';

import { Printer } from 'lucide-react';

/**
 * La stampa di un documento della piattaforma: fotografia contabile, report
 * dell'amministrativa. Il PDF si ottiene da qui — Stampa → Salva come PDF — con
 * l'impaginazione già pensata per la carta.
 */
export function StampaDocumento({ etichetta }: { etichetta: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 print:hidden"
    >
      <Printer className="w-3.5 h-3.5" /> {etichetta}
    </button>
  );
}
