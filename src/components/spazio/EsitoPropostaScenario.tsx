'use client';

// L'ESITO CHE SI STA VALUTANDO (0.209.0 — PIN e traccia dalla 0.213.0).
//
// Lo scenario di accordo transattivo non è un esito: è una proposta. Dal voto
// dei creditori possono uscire tre cose diverse — la definizione dell'accordo,
// l'apertura della liquidazione giudiziale, il cram down — e qui si dichiara
// quale si sta valutando. Il cram down non è «l'accordo con un altro nome»:
// passa dal provvedimento del giudice, non dal consenso, e la scheda lo dice
// accanto alle scelte invece di lasciarlo intendere.
//
// Il passaggio da un esito all'altro non è un'etichetta che si sposta in
// silenzio: è un atto firmato. Si conferma con il PIN del secondo fattore e
// lascia una riga nella cronologia, con chi l'ha compiuto.

import { useState } from 'react';
import { Scale, ShieldCheck } from 'lucide-react';
import { impostaEsitoPropostaAction } from '@/app/actions/scenari';
import {
  ESITI_PROPOSTA,
  MESSAGGIO_NON_EQUIPARABILI,
  type EsitoProposta,
} from '@/lib/scenari/esitoProposta';
import type { VoceStoricoEsitoProposta } from '@/lib/scenari/storicoEsitoProposta';

const etichetta = (codice: string | null) => {
  if (!codice) return 'nessun esito dichiarato';
  return ESITI_PROPOSTA.find((e) => e.codice === codice)?.etichetta ?? codice;
};

export function EsitoPropostaScenario({
  nomeSchema,
  scenarioId,
  esito,
  bloccato,
  demo = false,
  storico = [],
}: {
  nomeSchema: string;
  scenarioId: number;
  esito: EsitoProposta | null;
  bloccato: boolean;
  demo?: boolean;
  storico?: VoceStoricoEsitoProposta[];
}) {
  const [scelto, setScelto] = useState<EsitoProposta | null>(esito);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  // L'esito in attesa di conferma: il PIN si chiede dopo la scelta, non prima.
  const [inAttesa, setInAttesa] = useState<EsitoProposta | null | undefined>(undefined);
  const [pin, setPin] = useState('');

  const modificabile = !bloccato && !demo;

  const conferma = async () => {
    if (inCorso || inAttesa === undefined) return;
    if (!pin.trim()) {
      setErrore('Il PIN del secondo fattore è necessario: il passaggio è un atto firmato.');
      return;
    }
    setInCorso(true);
    setErrore(null);
    setMessaggio(null);
    const r = await impostaEsitoPropostaAction(nomeSchema, scenarioId, inAttesa, pin);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Esito non registrato.');
      return;
    }
    setScelto(inAttesa);
    setInAttesa(undefined);
    setPin('');
    setMessaggio(
      inAttesa
        ? 'Esito registrato sotto PIN e annotato nella cronologia.'
        : 'Esito rimosso sotto PIN: resta da dichiarare.'
    );
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 print:border-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Scale className="w-3 h-3" /> Esito che si sta valutando
        </p>
        {inCorso && <span className="text-[9px] text-slate-400 print:hidden">Salvataggio…</span>}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        La proposta si definisce con il voto dei creditori, oppure passa al tribunale, oppure viene
        resa efficace dal giudice. Indica quale stai valutando: è un’ipotesi dichiarata, e lo
        scenario la porta con sé.
      </p>
      {/* I comandi non sono parte del documento: in stampa resta l'esito
          dichiarato, non i bottoni per cambiarlo. */}
      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        {ESITI_PROPOSTA.map((e) => {
          const attivo = scelto === e.codice;
          return (
            <button
              key={e.codice}
              type="button"
              onClick={() => {
                setErrore(null);
                setMessaggio(null);
                setInAttesa(e.codice);
                setPin('');
              }}
              disabled={!modificabile || inCorso || attivo}
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
            onClick={() => {
              setErrore(null);
              setMessaggio(null);
              setInAttesa(null);
              setPin('');
            }}
            disabled={inCorso}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Rimuovi
          </button>
        )}
      </div>

      {/* LA CONFERMA: il PIN si chiede qui, e senza di esso non si passa. */}
      {inAttesa !== undefined && (
        <div className="rounded-md border border-slate-300 bg-white p-2 space-y-1.5 print:hidden">
          <p className="text-[10px] text-slate-700 leading-relaxed flex items-start gap-1.5">
            <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
            <span>
              Conferma «{etichetta(inAttesa)}» con il PIN del secondo fattore. Il passaggio viene
              registrato con il tuo nome nella cronologia dell’esito.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void conferma();
                if (e.key === 'Escape') setInAttesa(undefined);
              }}
              placeholder="PIN"
              aria-label="PIN del secondo fattore"
              className="w-28 rounded border border-slate-300 px-2 py-1 text-xs tabular-nums tracking-widest"
            />
            <button
              type="button"
              onClick={() => void conferma()}
              disabled={inCorso}
              className="rounded bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Conferma
            </button>
            <button
              type="button"
              onClick={() => {
                setInAttesa(undefined);
                setPin('');
              }}
              disabled={inCorso}
              className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-700 leading-relaxed font-bold">
        {scelto
          ? `Esito in valutazione: ${ESITI_PROPOSTA.find((e) => e.codice === scelto)?.etichetta} — decide ${ESITI_PROPOSTA.find((e) => e.codice === scelto)?.chiDecide}.`
          : 'Esito in valutazione: nessuno dichiarato — lo scenario resta una proposta da valutare.'}
      </p>
      <p className="text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-amber-300 pl-2 print:block">
        {MESSAGGIO_NON_EQUIPARABILI}
      </p>
      {errore && <p className="text-[10px] font-bold text-red-700 print:hidden">{errore}</p>}
      {messaggio && (
        <p className="text-[10px] font-bold text-emerald-700 print:hidden">{messaggio}</p>
      )}

      {storico.length > 0 && (
        <div className="border-t border-slate-200 pt-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Passaggi registrati ({storico.length})
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {storico.map((voce, i) => (
              <li key={`${voce.cambiatoIl}-${i}`} className="text-[10px] text-slate-600">
                <span className="text-slate-400">
                  {voce.cambiatoIl
                    ? new Date(voce.cambiatoIl).toLocaleDateString('it-IT')
                    : 'data non registrata'}
                </span>{' '}
                — da {etichetta(voce.da)} a {etichetta(voce.a)}
                {voce.autore ? ` · ${voce.autore}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
