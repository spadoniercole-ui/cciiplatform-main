'use client';

// Gli indici in TABELLA: una riga per indice, una colonna per periodo
// (bilanci depositati e, se c'è, la Posizione aggiornata). È la lettura che
// l'istruttore trova più immediata: tutti i valori a colpo d'occhio, in
// rosso quelli oltre la soglia. Sostituisce le schede una per indice.

import React, { useEffect, useState } from 'react';
import {
  ottieniIndiciMultiPeriodo,
  type RisultatoIndiciMultiPeriodo,
} from '@/app/actions/indiciMultiPeriodo';
import type { IndiceCcii } from '@/lib/xbrl/types';

const fmt = (v: number | 'N/D') =>
  v === 'N/D' ? 'n/d' : v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
const euro = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;

export function TabellaIndiciPeriodi({
  nomeSchema,
  scenarioId,
  titolo = 'Indici per periodo',
}: {
  nomeSchema: string;
  scenarioId: number;
  titolo?: string;
}) {
  const [dati, setDati] = useState<RisultatoIndiciMultiPeriodo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await ottieniIndiciMultiPeriodo(nomeSchema, scenarioId);
      if (r.success) setDati(r);
      else setErrore(r.error ?? 'Indici non disponibili.');
    })();
  }, [nomeSchema, scenarioId]);

  if (errore) return <p className="text-xs text-slate-500">{errore}</p>;
  if (!dati) return <p className="text-xs text-slate-400">Caricamento degli indici…</p>;
  if (dati.punti.length === 0)
    return (
      <p className="text-xs text-slate-500">
        Nessun bilancio XBRL caricato per questa azienda: indici non calcolabili.
      </p>
    );

  const mappe = dati.punti.map((p) => {
    const m = new Map<string, IndiceCcii>();
    for (const i of [...p.indici, ...p.altriIndici]) m.set(i.codice, i);
    return m;
  });
  const soglia = (codice: string) => mappe.map((m) => m.get(codice)?.soglia).find(Boolean) ?? '—';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
      <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">{titolo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
              <th className="p-2">Indice</th>
              <th className="p-2">Soglia</th>
              {dati.punti.map((p, k) => (
                <th
                  key={k}
                  className={`p-2 text-right ${p.chiave === 'aggiornata' ? 'text-sky-700' : ''}`}
                >
                  {p.chiave === 'aggiornata' ? 'Pos. aggiornata' : (p.anno ?? p.etichetta)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dati.indiciAbilitati.map((ind) => (
              <tr key={ind.codice}>
                <td className="p-2 text-slate-800">
                  <span className="font-mono text-[10px] text-slate-400 mr-1">{ind.codice}</span>
                  {ind.nome.replace(new RegExp(`^${ind.codice}\\s*[—-]\\s*`), '')}
                </td>
                <td className="p-2 text-slate-500 text-[11px]">{soglia(ind.codice)}</td>
                {mappe.map((m, k) => {
                  const v = m.get(ind.codice);
                  const cls =
                    v?.esito === 'VIOLATO'
                      ? 'text-red-700 font-bold'
                      : v?.esito === 'OK'
                        ? 'text-emerald-700'
                        : 'text-slate-400';
                  return (
                    <td
                      key={k}
                      className={`p-2 text-right tabular-nums ${cls} ${
                        dati.punti[k].chiave === 'aggiornata' ? 'bg-sky-50/50' : ''
                      }`}
                      title={v?.note}
                    >
                      {v ? fmt(v.valore) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200">
              <td className="p-2 text-slate-800 font-bold" colSpan={2}>
                Posizione finanziaria netta
              </td>
              {dati.punti.map((p, k) => (
                <td
                  key={k}
                  className={`p-2 text-right tabular-nums text-slate-900 ${
                    p.chiave === 'aggiornata' ? 'bg-sky-50/50' : ''
                  }`}
                >
                  {euro(p.pfn)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        In rosso i valori oltre la soglia di riferimento. Strumenti operativi di lettura, non
        parametri normativi: il sistema di indici dell’originario art. 13 CCII è abrogato.
      </p>
    </div>
  );
}
