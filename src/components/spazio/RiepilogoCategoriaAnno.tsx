'use client';

// Riepilogo omogeneo in testa agli elenchi (Posizione Debitoria, V.E.R.A.):
// raggruppa i debiti per CATEGORIA e, dove disponibile, per ANNO. È un
// controllo di base — la prima cosa che si legge — per cogliere a colpo
// d'occhio composizione e distribuzione temporale del debito.

import React from 'react';
import { Layers } from 'lucide-react';

export interface VoceRiepilogo {
  categoria: string;
  /** null quando la fonte non porta l'anno (es. VERA). */
  anno: number | null;
  importo: number;
}

interface Props {
  titolo: string;
  voci: VoceRiepilogo[];
  /** Mostra la colonna Anno (Debitoria sì, VERA no). */
  conAnno?: boolean;
  /** Nota sotto la tabella (es. avviso che il VERA non porta l'anno). */
  nota?: string;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function RiepilogoCategoriaAnno({ titolo, voci, conAnno = true, nota }: Props) {
  if (voci.length === 0) return null;

  // Raggruppa: categoria -> anno -> totale.
  const perCategoria = new Map<string, { totale: number; perAnno: Map<string, number> }>();
  for (const v of voci) {
    const cat = v.categoria || 'Non classificato';
    if (!perCategoria.has(cat)) perCategoria.set(cat, { totale: 0, perAnno: new Map() });
    const g = perCategoria.get(cat)!;
    g.totale += v.importo;
    const chiaveAnno = v.anno === null ? '—' : String(v.anno);
    g.perAnno.set(chiaveAnno, (g.perAnno.get(chiaveAnno) ?? 0) + v.importo);
  }

  const categorie = Array.from(perCategoria.entries()).sort((a, b) => b[1].totale - a[1].totale);
  const totaleGenerale = categorie.reduce((a, [, g]) => a + g.totale, 0);
  const anniPresenti = Array.from(
    new Set(voci.map((v) => (v.anno === null ? '—' : String(v.anno))))
  ).sort();

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <Layers className="w-4 h-4 text-slate-500" />
        <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">{titolo}</h4>
        <span className="ml-auto text-[11px] font-mono font-bold text-slate-900">
          Totale {euro(totaleGenerale)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-bold">Categoria</th>
              {conAnno &&
                anniPresenti.map((a) => (
                  <th key={a} className="px-3 py-2 font-bold text-right whitespace-nowrap">
                    {a}
                  </th>
                ))}
              <th className="px-4 py-2 font-bold text-right whitespace-nowrap">Totale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categorie.map(([cat, g]) => (
              <tr key={cat} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-semibold text-slate-800">{cat}</td>
                {conAnno &&
                  anniPresenti.map((a) => (
                    <td
                      key={a}
                      className="px-3 py-2 text-right font-mono text-slate-600 whitespace-nowrap"
                    >
                      {g.perAnno.has(a) ? euro(g.perAnno.get(a) as number) : '—'}
                    </td>
                  ))}
                <td className="px-4 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                  {euro(g.totale)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td className="px-4 py-2 font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                Totale
              </td>
              {conAnno &&
                anniPresenti.map((a) => {
                  const tot = categorie.reduce((s, [, g]) => s + (g.perAnno.get(a) ?? 0), 0);
                  return (
                    <td
                      key={a}
                      className="px-3 py-2 text-right font-mono font-bold text-slate-700 whitespace-nowrap"
                    >
                      {tot > 0 ? euro(tot) : '—'}
                    </td>
                  );
                })}
              <td className="px-4 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                {euro(totaleGenerale)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {nota && (
        <p className="text-[10px] text-slate-400 px-4 py-2 border-t border-slate-100">{nota}</p>
      )}
    </div>
  );
}
