'use client';

// L'ESITO CHE SI STA VALUTANDO (0.209.0).
//
// Lo scenario di accordo transattivo non è un esito: è una proposta. Dal voto
// dei creditori possono uscire tre cose diverse — la definizione dell'accordo,
// l'apertura della liquidazione giudiziale, il cram down — e qui si dichiara
// quale si sta valutando. Il cram down non è «l'accordo con un altro nome»:
// passa dal provvedimento del giudice, non dal consenso, e la scheda lo dice
// accanto alle scelte invece di lasciarlo intendere.

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { impostaEsitoPropostaAction } from '@/app/actions/scenari';
import {
  ESITI_PROPOSTA,
  MESSAGGIO_NON_EQUIPARABILI,
  type EsitoProposta,
} from '@/lib/scenari/esitoProposta';

export function EsitoPropostaScenario({
  nomeSchema,
  scenarioId,
  esito,
  bloccato,
  demo = false,
}: {
  nomeSchema: string;
  scenarioId: number;
  esito: EsitoProposta | null;
  bloccato: boolean;
  demo?: boolean;
}) {
  const [scelto, setScelto] = useState<EsitoProposta | null>(esito);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const modificabile = !bloccato && !demo;

  const salva = async (codice: EsitoProposta | null) => {
    if (inCorso || codice === scelto) return;
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await impostaEsitoPropostaAction(nomeSchema, scenarioId, codice);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Esito non registrato.');
      return;
    }
    setScelto(codice);
    setMessaggio(
      codice ? 'Esito registrato sullo scenario.' : 'Esito rimosso: resta da dichiarare.'
    );
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 print:border-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Scale className="w-3 h-3" /> Esito che si sta valutando
        </p>
        {inCorso && <span className="text-[9px] text-slate-400">Salvataggio…</span>}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        La proposta si definisce con il voto dei creditori, oppure passa al tribunale, oppure viene
        resa efficace dal giudice. Indica quale stai valutando: è un’ipotesi dichiarata, e lo
        scenario la porta con sé.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {ESITI_PROPOSTA.map((e) => {
          const attivo = scelto === e.codice;
          return (
            <button
              key={e.codice}
              type="button"
              onClick={() => void salva(e.codice)}
              disabled={!modificabile || inCorso}
              title={e.descrizione}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-bold transition-colors disabled:opacity-60 ${
                attivo
                  ? 'border-blue-400 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {e.etichetta}
            </button>
          );
        })}
        {scelto && modificabile && (
          <button
            type="button"
            onClick={() => void salva(null)}
            disabled={inCorso}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Rimuovi
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {scelto
          ? `Decide ${ESITI_PROPOSTA.find((e) => e.codice === scelto)?.chiDecide}.`
          : 'Nessun esito dichiarato: lo scenario resta una proposta da valutare.'}
      </p>
      <p className="text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-amber-300 pl-2 print:block">
        {MESSAGGIO_NON_EQUIPARABILI}
      </p>
      {errore && <p className="text-[10px] font-bold text-red-700">{errore}</p>}
      {messaggio && <p className="text-[10px] font-bold text-emerald-700">{messaggio}</p>}
    </div>
  );
}
