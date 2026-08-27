'use client';

// Griglia delle soglie di segnalazione INPS (art. 25-novies CCII), primo
// punto dell'analisi in TESTATA allo Screening.
//
// Il componente non calcola nulla: mostra ciò che la funzione pura
// src/lib/soglie25novies/calcolo.ts ha determinato. Nessuna cifra nasce qui.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { ottieniGriglia25NoviesAction } from '@/app/actions/soglie25novies';
import type { Griglia, EsitoSoglia } from '@/lib/soglie25novies/calcolo';
import { linkNormativaArticolo } from '@/lib/normativa/riferimenti';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  /** Cambia solo il taglio della raccomandazione, mai il calcolo. */
  prospettiva: 'ENTE' | 'NON_ENTE';
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function BadgeEsito({ esito, applicabile }: { esito: EsitoSoglia; applicabile: boolean }) {
  if (!applicabile) {
    return (
      <span className="inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 bg-slate-50 text-slate-400 border-slate-200">
        Non applicabile
      </span>
    );
  }
  const map: Record<EsitoSoglia, { txt: string; cls: string }> = {
    sopra: { txt: 'Oltre soglia', cls: 'bg-red-50 text-red-700 border-red-200' },
    sotto: { txt: 'Sotto soglia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    non_determinabile: {
      txt: 'Non determinabile',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  };
  const s = map[esito];
  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${s.cls}`}
    >
      {s.txt}
    </span>
  );
}

export function GrigliaSoglie25Novies({ nomeSchema, aziendaId, codice, prospettiva }: Props) {
  const [griglia, setGriglia] = useState<Griglia | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const res = await ottieniGriglia25NoviesAction(nomeSchema, aziendaId, prospettiva);
    if (!res.success || !res.griglia) {
      setErrore(res.error || 'Impossibile costruire la griglia delle soglie.');
      setGriglia(null);
    } else {
      setGriglia(res.griglia);
    }
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId, prospettiva]);

  if (caricamento) {
    return <p className="text-xs text-slate-400">Calcolo delle soglie di segnalazione...</p>;
  }

  if (errore) {
    return (
      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>{errore}</p>
      </div>
    );
  }

  if (!griglia) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Soglie di segnalazione INPS
          </h3>
          <Link
            href={linkNormativaArticolo(codice, '25-novies')}
            className="text-[10px] text-sky-700 hover:underline font-bold"
          >
            art. 25-novies
          </Link>
        </div>
        <button
          onClick={() => void carica()}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900"
        >
          <RefreshCw className="w-3 h-3" />
          Ricalcola
        </button>
      </div>

      {/* Esposizione per anno */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="text-left p-2">Anno</th>
              <th className="text-right p-2">
                Contributi
                <br />
                contabilizzati
              </th>
              <th className="text-right p-2">
                V.E.R.A. — sanzioni
                <br />
                presunte
              </th>
              <th className="text-right p-2">Totale</th>
            </tr>
          </thead>
          <tbody>
            {griglia.righe.map((r, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="p-2 font-bold text-slate-700">
                  {r.anno ?? (
                    <span className="text-slate-400 font-normal">anno non attribuito</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{euro(r.contabilizzato)}</td>
                <td className="p-2 text-right tabular-nums text-amber-800">
                  {r.sanzioniPresunte === 0 ? '—' : euro(r.sanzioniPresunte)}
                </td>
                <td className="p-2 text-right tabular-nums text-slate-500">
                  {euro(r.contabilizzato + r.sanzioniPresunte)}
                </td>
              </tr>
            ))}
            <tr className="font-bold text-slate-900 bg-slate-50">
              <td className="p-2 uppercase text-[10px] tracking-wider">Totale</td>
              <td className="p-2 text-right tabular-nums">{euro(griglia.totaleContabilizzato)}</td>
              <td className="p-2 text-right tabular-nums text-amber-800">
                {griglia.totaleSanzioniPresunte === 0 ? '—' : euro(griglia.totaleSanzioniPresunte)}
              </td>
              <td className="p-2 text-right tabular-nums">{euro(griglia.totaleComplessivo)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Il test si misura sui <span className="font-bold">soli contributi contabilizzati</span>. Le
        sanzioni indicate dalla Posizione V.E.R.A. sono una presunzione — la contabilità
        dell&apos;ente non le espone perché si determinano al momento del pagamento — e restano
        fuori dal confronto con la soglia.
      </p>

      {/* Le due righe di soglia */}
      <div className="space-y-2">
        {griglia.soglie.map((s, i) => (
          <div
            key={i}
            className={`border rounded-lg p-3 ${
              s.applicabile ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={s.applicabile ? '' : 'opacity-50'}>
                <p className="font-bold text-xs text-slate-900">{s.ambito}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{s.descrizione}</p>
                <p className="text-[10px] font-bold text-slate-700 mt-1">{s.valore}</p>
              </div>
              <BadgeEsito esito={s.esito} applicabile={s.applicabile} />
            </div>
            {s.applicabile && (
              <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-slate-100 leading-relaxed">
                {s.motivo}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Il caso in cui sono le sole sanzioni a far superare la soglia */}
      {griglia.sopraSoloConSanzioni && (
        <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-bold uppercase text-[10px] tracking-wider">
              Oltre soglia solo con le sanzioni presunte
            </span>
            <br />I contributi restano sotto la soglia applicabile. Il superamento comparirebbe solo
            includendo le sanzioni presunte dalla Posizione V.E.R.A.: non fondano da sole la
            segnalazione, vanno quantificate sugli atti dell&apos;ente.
          </p>
        </div>
      )}

      {/* Raccomandazione al valutatore */}
      {griglia.raccomandazione && (
        <div
          className={`flex items-start gap-2 text-[11px] rounded-lg p-3 border ${
            griglia.oltreSoglia
              ? 'text-red-800 bg-red-50 border-red-200'
              : 'text-slate-700 bg-slate-50 border-slate-200'
          }`}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{griglia.raccomandazione}</p>
        </div>
      )}

      {/* Cosa non è stato verificato — mai omesso */}
      {griglia.datiMancanti.length > 0 && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Cosa non è stato verificato
          </p>
          <ul className="space-y-1">
            {griglia.datiMancanti.map((d, i) => (
              <li key={i} className="text-[10px] text-slate-600 leading-relaxed flex gap-2">
                <span className="text-slate-400 shrink-0">—</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
