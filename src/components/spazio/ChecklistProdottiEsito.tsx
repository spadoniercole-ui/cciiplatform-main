'use client';

// LA CHECK LIST DEI PRODOTTI NELLA PAGINA DELL'ESITO (0.223.0).
//
// Le domande scritte sui prodotti sono un oggetto dell'analisi, come la visura
// e i prospetti: si compilano qui, dove la verifica si legge, non solo nel
// triage. Il quadro che ne esce è quello che pesa nell'indicatore di attenzione
// e che il supporto decisionale cita fra i materiali esaminati.
//
// L'AGGIORNAMENTO NON È UN EFFETTO DELLA VISITA. Il componente della check list
// segnala il quadro a ogni cambio, compreso il primo caricamento: un refresh
// immediato rimbalzerebbe all'infinito. Si salta la prima segnalazione e si
// ricarica la pagina solo dopo un salvataggio, così l'indicatore e il supporto
// decisionale mostrano il peso nuovo senza che l'operatore debba ricaricare a
// mano.

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { ChecklistProdottiTriage } from '@/components/spazio/ChecklistProdottiTriage';

export function ChecklistProdottiEsito({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const router = useRouter();
  const primaSegnalazione = useRef(true);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5 text-blue-600" />
          Check list dei prodotti
        </h2>
        <p className="mt-1 max-w-3xl text-[11px] text-slate-600 leading-relaxed">
          Le domande scritte sui prodotti dell’ente. Entrano nell’analisi insieme alla visura e ai
          prospetti: da qui viene il quadro qualitativo che pesa nell’indicatore e che il supporto
          decisionale cita fra i materiali esaminati. Una domanda senza risposta resta «senza
          risposta» — non è un no.
        </p>
      </div>
      <ChecklistProdottiTriage
        nomeSchema={nomeSchema}
        aziendaId={aziendaId}
        conIntestazione={false}
        onEsito={() => {
          if (primaSegnalazione.current) {
            primaSegnalazione.current = false;
            return;
          }
          router.refresh();
        }}
      />
    </section>
  );
}
