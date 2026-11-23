'use client';

// LA STAMPA DI UNA PAGINA DI LETTURA.
//
// Stampa la pagina così com'è: è il documento, non un report costruito da un
// secondo motore. Le regole di A4 e i margini stanno in `globals.css`; qui c'è
// solo il comando, che sparisce dalla carta (`print:hidden`) come i link di
// navigazione della pagina.
//
// Il pulsante non ha stato: serve alle pagine di sola lettura che non hanno già
// una propria barra di azioni (scheda scenario, posizione).

import { Printer } from 'lucide-react';

export function StampaPagina({ etichetta = 'Stampa / PDF' }: { etichetta?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:border-blue-400 hover:text-blue-700 print:hidden"
    >
      <Printer className="w-3.5 h-3.5" /> {etichetta}
    </button>
  );
}
