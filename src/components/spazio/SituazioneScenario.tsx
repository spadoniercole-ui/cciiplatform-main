'use client';

// LA SITUAZIONE DELLO SCENARIO, MODIFICABILE (0.188.0).
//
// Alla creazione si sceglie che cosa si sta valutando — accordo transattivo,
// liquidazione giudiziale, cram down. La scelta non è un'etichetta: decide il
// percorso e le domande che lo scenario pone. Restare vincolati a un errore di
// inquadramento costringerebbe a rifare tutto da capo, quindi si corregge da
// qui finché la Relazione finale non ha congelato lo scenario.
//
// Il cambio non cancella il lavoro fatto (0.189.0): lo scenario torna in
// bozza, l'origine si riallinea e la scheda dice quante righe di proposta e
// quante risposte di Check List vanno ricontrollate.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { aggiornaSituazioneScenarioAction } from '@/app/actions/scenari';
import type { TipoIstruttoria } from '@/lib/giudice/lettura';

const SITUAZIONI: { codice: TipoIstruttoria; etichetta: string }[] = [
  { codice: 'PROPOSTA', etichetta: 'Accordo transattivo' },
  { codice: 'DECRETO_LIQUIDAZIONE', etichetta: 'Liquidazione giudiziale' },
  { codice: 'CRAM_DOWN', etichetta: 'Cram down' },
];

export function SituazioneScenario({
  nomeSchema,
  scenarioId,
  situazione,
  origine,
  bloccato,
  demo = false,
  cambiataIl,
  rivedere,
}: {
  nomeSchema: string;
  scenarioId: number;
  situazione: TipoIstruttoria;
  origine: string;
  bloccato: boolean;
  demo?: boolean;
  /** Data dell'ultimo cambio di situazione, se c'è stato. */
  cambiataIl?: string | null;
  /** Che cosa va ricontrollato dopo quel cambio. */
  rivedere?: string[];
}) {
  const router = useRouter();
  const [scelta, setScelta] = useState<TipoIstruttoria>(situazione);
  const [dataCambio, setDataCambio] = useState<string | null>(cambiataIl ?? null);
  const [daRivedere, setDaRivedere] = useState<string[]>(rivedere ?? []);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const cambia = async (codice: TipoIstruttoria) => {
    if (codice === scelta || inCorso) return;
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await aggiornaSituazioneScenarioAction(nomeSchema, scenarioId, codice);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Situazione non aggiornata.');
      return;
    }
    setScelta(codice);
    setDataCambio(new Date().toISOString().slice(0, 10));
    setDaRivedere(r.rivedere ?? []);
    setMessaggio('Situazione aggiornata: lo scenario è tornato in bozza.');
    router.refresh();
  };

  const modificabile = !bloccato && !demo;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
        Situazione dello scenario
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {SITUAZIONI.map((s) => {
          const attiva = scelta === s.codice;
          return (
            <button
              key={s.codice}
              type="button"
              onClick={() => void cambia(s.codice)}
              disabled={!modificabile || inCorso}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-bold transition-colors disabled:opacity-60 ${
                attiva
                  ? 'border-blue-400 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {s.etichetta}
            </button>
          );
        })}
        {inCorso && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Origine: {origine}
        {bloccato
          ? ' · scenario in sola lettura: la Relazione finale è già stata generata.'
          : demo
            ? ' · nell’ambiente demo i percorsi sono già predisposti.'
            : ' · modificabile finché la Relazione finale non viene generata.'}
      </p>
      {dataCambio && (
        <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 leading-relaxed">
          <span className="font-bold">Situazione cambiata il {dataCambio}.</span>{' '}
          {daRivedere.length > 0
            ? `Il lavoro fatto resta: rivedi ${daRivedere.join('; ')}.`
            : 'Nessun passo compilato da rivedere.'}
        </div>
      )}
      {errore && <p className="text-[10px] font-bold text-red-700">{errore}</p>}
      {messaggio && <p className="text-[10px] font-bold text-emerald-700">{messaggio}</p>}
    </div>
  );
}
