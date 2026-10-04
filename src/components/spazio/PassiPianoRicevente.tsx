'use client';

// PASSI DEL PIANO RICEVENTE dopo il piano dell'azienda (passo 1, le manopole):
//   2. affiancare la variante di sistema (riferimento di settore);
//   3. sistemare il piano di rientro nell'arco temporale del piano, con le
//      domande che il piano non dice;
//   4. cercare la soluzione verde.
// Logica in src/lib/piano/ricevente.ts; qui solo l'interfaccia.

import React, { useState } from 'react';
import { Layers, CalendarClock, Target, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { ETICHETTA_RIGA, euro } from '@/lib/piano/piano';
import {
  ORIZZONTE_MASSIMO,
  conflittoOrizzonte,
  type ConflittoOrizzonte,
  type PianoRientro,
  type TotaleOfferto,
} from '@/lib/piano/ricevente';
import type { SoluzioneSalvata, IndicatoriPiano } from '@/lib/piano/riceventeSalvataggio';

interface Props {
  offerto: TotaleOfferto;
  rientroProposta: PianoRientro;
  pianoRientro: PianoRientro | null;
  orizzonte: number;
  serieSistema: boolean;
  sistemaDisponibile: boolean;
  soluzione: SoluzioneSalvata | null;
  soluzioneInCorso: boolean;
  onSerieSistema: (v: boolean) => void;
  onPianoRientro: (p: PianoRientro, nuovoOrizzonte?: number) => void;
  onCalcola: () => void;
}

const pct = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

function Passo({
  numero,
  icona,
  titolo,
  children,
}: {
  numero: number;
  icona: React.ReactNode;
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
          {numero}
        </span>
        {icona}
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-900">{titolo}</h3>
      </div>
      {children}
    </div>
  );
}

function descrivi(p: PianoRientro): string {
  if (p.modalita === 'UNICA')
    return `unica soluzione${p.anticipoPct ? `, con il ${p.anticipoPct}% subito` : ''}`;
  return `${p.mesi} rate mensili${p.anticipoPct ? `, con il ${p.anticipoPct}% subito` : ''}`;
}

export function PassiPianoRicevente({
  offerto,
  rientroProposta,
  pianoRientro,
  orizzonte,
  serieSistema,
  sistemaDisponibile,
  soluzione,
  soluzioneInCorso,
  onSerieSistema,
  onPianoRientro,
  onCalcola,
}: Props) {
  const [domande, setDomande] = useState(false);
  const partenza = pianoRientro ?? rientroProposta;
  const [modalita, setModalita] = useState<PianoRientro['modalita']>(partenza.modalita);
  const [mesi, setMesi] = useState<number>(partenza.mesi || Math.min(orizzonte * 12, 60));
  const [anticipo, setAnticipo] = useState<number>(partenza.anticipoPct);
  const [conflitto, setConflitto] = useState<ConflittoOrizzonte | null>(null);
  const inUso = pianoRientro?.offerto ?? offerto;
  const [totaleScritto, setTotaleScritto] = useState<number>(inUso.ente + inUso.altri);
  const [enteScritto, setEnteScritto] = useState<number>(inUso.ente);
  const totale = inUso.ente + inUso.altri;
  /** Il totale scritto dall'utente, se diverso da quello della proposta. */
  const offertoScritto = () =>
    Math.abs(totaleScritto - (offerto.ente + offerto.altri)) < 0.5 &&
    Math.abs(enteScritto - offerto.ente) < 0.5
      ? {}
      : {
          offerto: {
            ente: Math.max(0, Math.min(enteScritto, totaleScritto)),
            altri: Math.max(0, totaleScritto - Math.min(enteScritto, totaleScritto)),
          },
        };

  const applica = () => {
    const p: PianoRientro = {
      modalita,
      mesi: modalita === 'RATEALE' ? Math.max(1, Math.round(mesi)) : 0,
      anticipoPct: Math.max(0, Math.min(100, anticipo)),
      ...offertoScritto(),
    };
    const c = conflittoOrizzonte(p, orizzonte);
    if (c) return setConflitto(c);
    setConflitto(null);
    setDomande(false);
    onPianoRientro(p);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <Passo
        numero={2}
        icona={<Layers className="w-3.5 h-3.5 text-sky-700" />}
        titolo="Variante di sistema"
      >
        <p className="text-[11px] text-slate-600">
          Vuoi affiancare al piano dell’azienda quello calcolato dal sistema sul riferimento di
          settore? Le manopole rettificano entrambi e ognuna mostra due fasce: azienda e sistema.
        </p>
        <button
          type="button"
          disabled={!sistemaDisponibile}
          onClick={() => onSerieSistema(!serieSistema)}
          className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg ${serieSistema ? 'bg-white border border-slate-300 text-slate-700' : 'bg-sky-700 hover:bg-sky-800 text-white'} disabled:bg-slate-200 disabled:text-slate-400`}
        >
          {serieSistema ? 'Togli il piano di sistema' : 'Sì, affianca il piano di sistema'}
        </button>
        {!sistemaDisponibile && (
          <p className="text-[10px] text-slate-400">
            Serve il riferimento di settore, calcolato nel confronto qui sopra.
          </p>
        )}
      </Passo>

      <Passo
        numero={3}
        icona={<CalendarClock className="w-3.5 h-3.5 text-sky-700" />}
        titolo="Piano di rientro"
      >
        <p className="text-[11px] text-slate-600">
          Totale offerto a tutti i creditori: <b>{euro(totale)}</b> (ente {euro(inUso.ente)}, altri{' '}
          {euro(inUso.altri)}){pianoRientro?.offerto ? ', scritto a mano' : ''}. Ora:{' '}
          <b>
            {pianoRientro
              ? descrivi(pianoRientro)
              : `come da proposta (${descrivi(rientroProposta)})`}
          </b>
          .
        </p>
        {!domande ? (
          <button
            type="button"
            onClick={() => setDomande(true)}
            className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-sky-700 hover:bg-sky-800 text-white"
          >
            Sistema il piano nell’arco di {orizzonte} anni
          </button>
        ) : (
          <div className="space-y-2 text-[11px]">
            {offerto.ente + offerto.altri === 0 && (
              <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5">
                La proposta valutata non indica il totale offerto: scrivilo qui.
              </p>
            )}
            <label className="flex items-center gap-2">
              Totale offerto a tutti i creditori
              <input
                type="number"
                min={0}
                step={1000}
                value={totaleScritto}
                onChange={(e) => setTotaleScritto(Math.max(0, Number(e.target.value)))}
                className="w-28 p-1 border border-slate-300 rounded text-right"
              />
              €
            </label>
            <label className="flex items-center gap-2">
              di cui all’ente
              <input
                type="number"
                min={0}
                step={1000}
                value={enteScritto}
                onChange={(e) => setEnteScritto(Math.max(0, Number(e.target.value)))}
                className="w-28 p-1 border border-slate-300 rounded text-right"
              />
              €
            </label>
            <fieldset className="flex gap-3">
              <legend className="sr-only">Modalità di pagamento</legend>
              {(['UNICA', 'RATEALE'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="modalita-rientro"
                    checked={modalita === m}
                    onChange={() => setModalita(m)}
                  />
                  {m === 'UNICA' ? 'Unica soluzione' : 'Piano rateale'}
                </label>
              ))}
            </fieldset>
            {modalita === 'RATEALE' && (
              <label className="flex items-center gap-2">
                Ammortamento in
                <input
                  type="number"
                  min={2}
                  max={ORIZZONTE_MASSIMO * 12 * 2}
                  value={mesi}
                  onChange={(e) => setMesi(Number(e.target.value))}
                  className="w-16 p-1 border border-slate-300 rounded text-right"
                />
                mesi
              </label>
            )}
            <label className="flex items-center gap-2">
              Quota pagata subito
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={anticipo}
                onChange={(e) => setAnticipo(Number(e.target.value))}
                className="w-16 p-1 border border-slate-300 rounded text-right"
              />
              % del totale
            </label>
            <p className="text-[10px] text-slate-400">
              Le risposte valgono per il totale offerto a tutti i creditori, non per il solo debito
              verso l’ente.
            </p>
            {conflitto ? (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 space-y-2">
                <p className="flex gap-1 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {conflitto.mesi} mesi di ammortamento escono dal piano di {conflitto.orizzonte}{' '}
                  anni. Quale dei due adeguare?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMesi(conflitto.orizzonte * 12);
                      setConflitto(null);
                      setDomande(false);
                      onPianoRientro({
                        modalita: 'RATEALE',
                        mesi: conflitto.orizzonte * 12,
                        anticipoPct: anticipo,
                        ...offertoScritto(),
                      });
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-900 text-white"
                  >
                    Ammortamento in {conflitto.orizzonte * 12} mesi
                  </button>
                  <button
                    type="button"
                    disabled={!conflitto.allungabile}
                    onClick={() => {
                      const p: PianoRientro = {
                        modalita: 'RATEALE',
                        mesi: conflitto.mesi,
                        anticipoPct: anticipo,
                        ...offertoScritto(),
                      };
                      setConflitto(null);
                      setDomande(false);
                      onPianoRientro(p, conflitto.anniNecessari);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-white border border-slate-300 text-slate-800 disabled:text-slate-400"
                  >
                    Piano su {conflitto.anniNecessari} anni
                  </button>
                </div>
                {!conflitto.allungabile && (
                  <p className="text-[10px] text-amber-800">
                    Il piano arriva al massimo a {ORIZZONTE_MASSIMO} anni.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applica}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-slate-900 text-white"
                >
                  Applica
                </button>
                <button
                  type="button"
                  onClick={() => setDomande(false)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-white border border-slate-300 text-slate-700"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        )}
      </Passo>

      <Passo
        numero={4}
        icona={<Target className="w-3.5 h-3.5 text-sky-700" />}
        titolo="Soluzione verde"
      >
        <p className="text-[11px] text-slate-600">
          Il motore cerca la combinazione di manopole più vicina al piano dell’azienda con cui la
          cassa non va mai sotto zero, le rate sono coperte dal flusso di gestione e il patrimonio
          netto non è negativo. Poi posiziona le manopole e l’AI ne scrive la lettura.
        </p>
        <button
          type="button"
          onClick={onCalcola}
          disabled={soluzioneInCorso || !sistemaDisponibile}
          className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white"
        >
          {soluzioneInCorso ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Target className="w-3 h-3" />
          )}
          {soluzioneInCorso
            ? 'Ricerca…'
            : soluzione
              ? 'Ricalcola la soluzione'
              : 'Cerca la soluzione'}
        </button>
      </Passo>

      {soluzione && <EsitoSoluzione soluzione={soluzione} />}
    </div>
  );
}

function Indicatori({ titolo, i }: { titolo: string; i: IndicatoriPiano | null }) {
  if (!i) return null;
  return (
    <tr>
      <td className="px-2 py-1 font-bold text-slate-800">{titolo}</td>
      <td
        className={`px-2 py-1 text-right tabular-nums ${i.cassaMinima < 0 ? 'text-red-700' : ''}`}
      >
        {euro(i.cassaMinima)}
      </td>
      <td
        className={`px-2 py-1 text-right tabular-nums ${i.patrimonioFinale < 0 ? 'text-red-700' : ''}`}
      >
        {euro(i.patrimonioFinale)}
      </td>
      <td
        className={`px-2 py-1 text-right tabular-nums ${i.coperturaMinima !== null && i.coperturaMinima < 1 ? 'text-red-700' : ''}`}
      >
        {i.coperturaMinima === null ? '—' : `${i.coperturaMinima.toFixed(2)}×`}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{i.vincoli}</td>
    </tr>
  );
}

function EsitoSoluzione({ soluzione }: { soluzione: SoluzioneSalvata }) {
  return (
    <div
      className={`xl:col-span-3 border rounded-lg p-3 space-y-3 ${soluzione.verde ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
        {soluzione.verde ? (
          <Check className="w-4 h-4 text-emerald-700" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-700" />
        )}
        {soluzione.verde
          ? 'Soluzione verde: le manopole sono posizionate sulla combinazione trovata'
          : 'Il verde non si raggiunge entro i limiti delle manopole: questa è la combinazione migliore'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left">Manopola</th>
                <th className="px-2 py-1 text-right">sul piano dell’azienda</th>
                <th className="px-2 py-1 text-right">sul piano di sistema</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {soluzione.differenze.map((d) => (
                <tr key={d.riga}>
                  <td className="px-2 py-1 text-slate-800">
                    {ETICHETTA_RIGA[d.riga].split(' (')[0]}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums font-bold">
                    {pct(d.suAzienda)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {d.suSistema === null ? '—' : pct(d.suSistema)}
                  </td>
                </tr>
              ))}
              {soluzione.apportoIniziale > 0 && (
                <tr>
                  <td className="px-2 py-1 text-slate-800">Apporto dei soci (primo anno)</td>
                  <td className="px-2 py-1 text-right tabular-nums font-bold" colSpan={2}>
                    {euro(soluzione.apportoIniziale)}
                  </td>
                </tr>
              )}
              {soluzione.differenze.length === 0 && soluzione.apportoIniziale === 0 && (
                <tr>
                  <td className="px-2 py-1 text-slate-600" colSpan={3}>
                    Nessuna manopola da spostare: il piano dell’azienda è già verde.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left">Piano</th>
                <th className="px-2 py-1 text-right">Cassa minima</th>
                <th className="px-2 py-1 text-right">PN finale</th>
                <th className="px-2 py-1 text-right">Copertura rate</th>
                <th className="px-2 py-1 text-right">Vincoli</th>
              </tr>
            </thead>
            <tbody>
              <Indicatori titolo="Azienda" i={soluzione.indicatori.azienda} />
              <Indicatori titolo="Sistema" i={soluzione.indicatori.sistema} />
              <Indicatori titolo="Soluzione" i={soluzione.indicatori.soluzione} />
            </tbody>
          </table>
        </div>
      </div>
      <pre className="whitespace-pre-wrap text-[11px] text-slate-800 font-sans">
        {soluzione.testo}
      </pre>
      {soluzione.commentoAi && (
        <div className="bg-white border border-violet-200 rounded p-2">
          <p className="text-[9px] font-bold uppercase text-violet-700 mb-1">Lettura dell’AI</p>
          <p className="text-[11px] text-slate-800 whitespace-pre-wrap">{soluzione.commentoAi}</p>
        </div>
      )}
      <p className="text-[10px] text-slate-500">
        La soluzione è calcolata dal motore ed entra nella Relazione di chiusura quando salvi la
        variante. Indica le condizioni con cui il piano regge, non un giudizio sulla proposta.
      </p>
    </div>
  );
}
