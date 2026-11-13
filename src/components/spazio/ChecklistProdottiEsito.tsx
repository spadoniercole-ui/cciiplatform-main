'use client';

// LA CHECK LIST DEI PRODOTTI NELLA PAGINA DELL'ESITO (0.223.0, chiusa dietro
// un link dalla 0.224.0).
//
// Le domande scritte sui prodotti sono un oggetto dell'analisi, come la visura
// e i prospetti: si compilano qui, dove la verifica si legge, non solo nel
// triage. Il quadro che ne esce è quello che pesa nell'indicatore di attenzione
// e che il supporto decisionale cita fra i materiali esaminati.
//
// CHIUSA DI DEFAULT. Le domande possono essere decine: aperte tutte, la pagina
// diventava un elenco lunghissimo prima ancora del debito e delle soglie. Sta
// quindi sotto un link come il supporto decisionale, con in testa lo stato —
// quante risposte mancano, o il quadro raggiunto — così si sa se vale la pena
// aprirla senza aprirla.
//
// L'AGGIORNAMENTO NON È UN EFFETTO DELLA VISITA. Il componente della check list
// segnala il quadro a ogni cambio, compreso il primo caricamento: un refresh
// immediato rimbalzerebbe all'infinito. Si salta la prima segnalazione e si
// ricarica la pagina solo dopo un salvataggio, così l'indicatore e il supporto
// decisionale mostrano il peso nuovo senza che l'operatore debba ricaricare a
// mano.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { ChecklistProdottiTriage } from '@/components/spazio/ChecklistProdottiTriage';
import type { SintesiChecklistProdotti } from '@/lib/prodotti/prodotti';

/** Lo stato in una riga: è quello che si legge prima di decidere se aprire. */
function statoChecklist(sintesi: SintesiChecklistProdotti | null): string {
  if (!sintesi) return 'Caricamento…';
  if (sintesi.totale === 0) {
    return 'Nessun prodotto in check list: nessuna domanda da porre, e il quadro qualitativo non entra nella valutazione.';
  }
  if (sintesi.mancanti > 0) {
    return `${sintesi.mancanti} domande senza risposta su ${sintesi.totale}: il quadro non entra ancora nella valutazione.`;
  }
  return `Completa: ${sintesi.risposte}/${sintesi.totale} risposte — quadro «${sintesi.etichetta}».`;
}

export function ChecklistProdottiEsito({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const router = useRouter();
  const primaSegnalazione = useRef(true);
  const [sintesi, setSintesi] = useState<SintesiChecklistProdotti | null>(null);

  return (
    <details className="group bg-white border border-slate-200 rounded-xl">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5">
        <span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
            <ListChecks className="w-3.5 h-3.5 text-blue-600" />
            Check list dei prodotti
          </span>
          <span className="mt-0.5 block max-w-3xl text-[10px] text-slate-500 leading-relaxed">
            Le domande scritte sui prodotti dell’ente, oggetto dell’analisi insieme alla visura e ai
            prospetti. {statoChecklist(sintesi)}
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700 group-open:hidden">
          Apri
        </span>
        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 group-open:inline">
          Chiudi
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 p-5">
        <p className="max-w-3xl text-[11px] text-slate-600 leading-relaxed">
          Da qui viene il quadro qualitativo che pesa nell’indicatore e che il supporto decisionale
          cita fra i materiali esaminati. Una domanda senza risposta resta «senza risposta» — non è
          un no.
        </p>
        <ChecklistProdottiTriage
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          conIntestazione={false}
          onEsito={(nuova) => {
            setSintesi(nuova);
            if (primaSegnalazione.current) {
              primaSegnalazione.current = false;
              return;
            }
            router.refresh();
          }}
        />
      </div>
    </details>
  );
}
