'use client';

// Indici multi-periodo — gli indici abilitati per l'azienda, sviluppati
// su più punti (fino agli ultimi 5 anni di bilancio XBRL archiviati più
// la Posizione Aggiornata), con trend. Numeri in tabella, non grafici —
// più facili da leggere in un colpo d'occhio e da citare in una relazione.

import React, { useEffect, useState } from 'react';
import { TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import {
  ottieniIndiciMultiPeriodo,
  type PuntoIndiciMultiPeriodo,
  type IndiceAbilitatoInfo,
  type RisultatoIndiciMultiPeriodo,
} from '@/app/actions/indiciMultiPeriodo';

interface Props {
  nomeSchema: string;
  scenarioId: number;
}

type RisultatoTrendLite = RisultatoIndiciMultiPeriodo['trend'];

function trovaValore(
  punto: PuntoIndiciMultiPeriodo,
  codice: string
): { valore: number | 'N/D'; esito: string } | null {
  const ind =
    punto.indici.find((i) => i.codice === codice) ||
    punto.altriIndici.find((i) => i.codice === codice);
  return ind ? { valore: ind.valore, esito: ind.esito } : null;
}

export function IndiciScenario({ nomeSchema, scenarioId }: Props) {
  const [dati, setDati] = useState<RisultatoIndiciMultiPeriodo | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniIndiciMultiPeriodo(nomeSchema, scenarioId);
      if (risultato.success) setDati(risultato);
      else setErrore(risultato.error || 'Impossibile caricare gli indici.');
      setCaricamento(false);
    })();
  }, [nomeSchema, scenarioId]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  if (errore || !dati) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </div>
    );
  }

  const { indiciAbilitati, punti, trend } = dati;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Indici multi-periodo
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Gli indici abilitati per questa azienda, calcolati su ogni periodo disponibile — fino agli
          ultimi anni impostati nei Parametri di Spazio dal bilancio XBRL, più la Posizione
          Aggiornata se compilata — con lo stesso motore di calcolo, non un&apos;approssimazione.
        </p>
      </div>

      {punti.length === 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Nessun periodo disponibile ancora: carica un bilancio XBRL o compila la Posizione
            Aggiornata per vedere gli indici qui.
          </p>
        </div>
      )}

      {punti.length > 0 && indiciAbilitati.length === 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Nessun indice abilitato per questa azienda — vai su Aziende → questa azienda → Indici
            per attivarli.
          </p>
        </div>
      )}

      {trend && trend.segnalazioni.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-bold text-red-800 uppercase tracking-wider">
              Segnalazioni dal confronto tra periodi
            </span>
          </div>
          <ul className="space-y-1">
            {trend.segnalazioni.map((s, i) => (
              <li key={i} className="text-[11px] text-red-700">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {punti.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Posizione Finanziaria Netta — per periodo
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
                {punti.map((p) => (
                  <th key={p.etichetta} className="p-2">
                    {p.etichetta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {punti.map((p) => (
                  <td key={p.etichetta} className="p-2 font-bold text-slate-900">
                    € {p.pfn.toLocaleString('it-IT')}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {indiciAbilitati.map((info) => (
          <CardIndice key={info.codice} info={info} punti={punti} trend={trend} />
        ))}
      </div>
    </div>
  );
}

function CardIndice({
  info,
  punti,
  trend,
}: {
  info: IndiceAbilitatoInfo;
  punti: PuntoIndiciMultiPeriodo[];
  trend: RisultatoTrendLite;
}) {
  const serie = punti.map((p) => {
    const v = trovaValore(p, info.codice);
    return {
      nome: p.etichetta,
      valore: v && v.valore !== 'N/D' ? v.valore : null,
      esito: v?.esito || 'NON_CALCOLABILE',
    };
  });
  const ultimoConValore = [...serie].reverse().find((s) => s.valore !== null);
  const andamento = trend?.andamentoIndici.find((a) => a.codice === info.codice);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="font-bold text-slate-900 text-xs">{info.nome}</h4>
          <span className="text-[9px] text-slate-400 uppercase">{info.categoria}</span>
        </div>
        {ultimoConValore && (
          <span
            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${
              ultimoConValore.esito === 'OK'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : ultimoConValore.esito === 'VIOLATO'
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : 'text-slate-500 bg-slate-50 border-slate-200'
            }`}
          >
            {ultimoConValore.esito}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        {serie.map((s) => (
          <div key={s.nome}>
            <span className="text-[9px] text-slate-400 block">{s.nome}</span>
            <span className="font-bold text-slate-900">{s.valore !== null ? s.valore : '—'}</span>
          </div>
        ))}
      </div>

      {andamento && (
        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
          {andamento.peggioratoUltimoPeriodo ? (
            <>
              <TrendingDown className="w-3 h-3 text-red-600" />
              <span className="text-red-700 font-bold">Peggiorato nell&apos;ultimo periodo</span>
            </>
          ) : (
            <>
              <Minus className="w-3 h-3 text-slate-400" />
              <span>Nessun peggioramento rilevato</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
