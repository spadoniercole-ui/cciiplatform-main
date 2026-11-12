'use client';

import { Printer } from 'lucide-react';

/**
 * La stampa della scheda scenario. Prima stava dentro il blocco della
 * situazione; con la natura spostata fuori dalla fase operativa, il comando
 * resta sulla scheda: è il documento che si condivide, non un'azione sul dato.
 */
export function StampaSchedaScenario({ etichetta = 'Stampa scheda' }: { etichetta?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 print:hidden"
    >
      <Printer className="w-3 h-3" /> {etichetta}
    </button>
  );
}
