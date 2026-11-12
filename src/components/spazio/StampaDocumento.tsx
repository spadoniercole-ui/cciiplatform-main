'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';

/**
 * La stampa di un documento della piattaforma: fotografia contabile, report
 * dell'amministrativa. Il PDF si ottiene da qui — Stampa → Salva come PDF — con
 * l'impaginazione già pensata per la carta.
 */
export function StampaDocumento({
  etichetta,
  auto = false,
}: {
  etichetta: string;
  /** Arrivo dal bottone «Report PDF»: apre subito la finestra di stampa. */
  auto?: boolean;
}) {
  useEffect(() => {
    if (!auto) return;
    // Un attimo per il font e il layout: la finestra di stampa si apre sul
    // documento già impaginato, non su un foglio mezzo vuoto.
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [auto]);

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
