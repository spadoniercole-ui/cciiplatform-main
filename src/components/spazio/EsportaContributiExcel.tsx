'use client';

import { FileSpreadsheet } from 'lucide-react';
import { esportaVistaContributiExcel } from '@/lib/soglie25novies/excelVistaSpazio';
import type { RigaVistaContributi } from '@/lib/soglie25novies/vistaSpazio';

// Il pulsante che scarica la vista così com'è: stesse righe, stesso ordine.
// L'export gira nel browser (SheetJS è già il motore degli altri fogli), non
// in una server action: i dati sono già qui, e non c'è nulla da rileggere.

export function EsportaContributiExcel({
  nomeSpazio,
  righe,
}: {
  nomeSpazio: string;
  righe: RigaVistaContributi[];
}) {
  return (
    <button
      type="button"
      onClick={() => esportaVistaContributiExcel(nomeSpazio, righe)}
      disabled={righe.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      title="Scarica la tabella in Excel: una riga per azienda, una colonna per esercizio"
    >
      <FileSpreadsheet className="w-3.5 h-3.5" />
      Esporta Excel
    </button>
  );
}
