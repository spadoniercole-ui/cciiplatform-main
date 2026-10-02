'use client';

// Dopo la valutazione: una sola domanda (mettere alla prova il piano
// dell'azienda prima di chiudere?) e poi la chiusura, con l'unico documento
// da consegnare: la Relazione. Niente più Brogliaccio né stampe intermedie.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, FileCheck2 } from 'lucide-react';
import { RelazioneAiScenario } from '@/components/spazio/RelazioneAiScenario';
import { attivaPianoSviluppoAction } from '@/app/actions/scenari';

export interface DatiChiusura {
  simulazioneAttiva: boolean;
  pianoDisponibile: boolean;
  relazioneDisponibile: boolean;
  eAdminSpazio: boolean;
  identitaUtente: string | null;
  bloccatoIl: string | null;
}

export function ChiusuraIstruttoria({
  nomeSchema,
  scenarioId,
  aziendaId,
  codice,
  dati,
}: {
  nomeSchema: string;
  scenarioId: number;
  aziendaId: number;
  codice: string;
  dati: DatiChiusura;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const urlPiano = `/spazio/${codice}/scenari/${scenarioId}/simulazione`;

  const vaiAlPiano = async () => {
    if (!dati.simulazioneAttiva) {
      setInCorso(true);
      const r = await attivaPianoSviluppoAction(nomeSchema, scenarioId);
      setInCorso(false);
      if (!r.success) {
        setErrore(r.error ?? 'Impossibile attivare il piano.');
        return;
      }
    }
    router.push(urlPiano);
  };

  return (
    <div className="space-y-4">
      {!dati.bloccatoIl && dati.pianoDisponibile && (
        <div className="border border-sky-200 bg-sky-50 rounded-xl p-5 space-y-3">
          <p className="text-xs font-bold text-slate-900">
            Vuoi mettere alla prova il piano dell’azienda prima di chiudere?
          </p>
          <p className="text-[11px] text-slate-600">
            Con le manopole proietti in avanti, dallo stato attuale, ricavi, costi e cassa e vedi
            subito se le rate reggono. Facoltativo: se lo fai, entra nella Relazione.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={vaiAlPiano}
              disabled={inCorso}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {inCorso ? 'Attivazione…' : 'Sì, apri il piano'}
            </button>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById('chiusura')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-800"
            >
              <FileCheck2 className="w-3.5 h-3.5" /> No, vai alla chiusura
            </button>
          </div>
          {errore && <p className="text-[11px] text-red-700">{errore}</p>}
        </div>
      )}

      <div id="chiusura" className="scroll-mt-4 space-y-2">
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
            4
          </span>
          Chiusura — la Relazione
        </h3>
        {dati.relazioneDisponibile ? (
          <RelazioneAiScenario
            nomeSchema={nomeSchema}
            scenarioId={scenarioId}
            aziendaId={aziendaId}
            tipoProposta="RICEVUTA"
            eAdminSpazio={dati.eAdminSpazio}
            identitaUtente={dati.identitaUtente}
            bloccatoIl={dati.bloccatoIl}
          />
        ) : (
          <p className="text-xs text-slate-500">
            La Relazione AI non è inclusa nella licenza di questo spazio.
          </p>
        )}
      </div>
    </div>
  );
}
