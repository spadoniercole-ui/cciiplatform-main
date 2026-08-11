'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Info } from 'lucide-react';

export interface IndiceCalculated {
  codice: string;
  nome: string;
  valore: number | string | null;
  soglia: string;
  esito: 'OK' | 'VIOLATO' | 'NON_CALCOLABILE';
  note?: string;
}

interface IndiciTableProps {
  indici: IndiceCalculated[];
}

export default function IndiciTable({ indici }: IndiciTableProps) {
  return (
    <div className="space-y-3">
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-[10px] font-bold text-slate-600 border-b border-slate-200 uppercase tracking-wider">
              <th className="p-3">Indicatore CCII</th>
              <th className="p-3 text-center w-40">Valore XBRL Estratto</th>
              <th className="p-3 text-center w-40">
                Soglia Normativa <span className="text-amber-600 font-bold">*</span>
              </th>
              <th className="p-3 text-center w-44">Esito Diagnostico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-mono">
            {indici && indici.length > 0 ? (
              indici.map((ind) => (
                <tr key={ind.codice} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-bold text-slate-800 font-sans">
                    <span className="text-blue-600 font-mono mr-1 font-semibold">
                      [{ind.codice}]
                    </span>{' '}
                    {ind.nome}
                  </td>
                  <td className="p-3 text-center font-bold text-slate-900">
                    {ind.valore !== null && ind.valore !== undefined
                      ? typeof ind.valore === 'number'
                        ? ind.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 })
                        : ind.valore
                      : 'N/D'}
                  </td>
                  <td className="p-3 text-center text-slate-600 font-medium">{ind.soglia}</td>
                  <td className="p-3 text-center font-sans">
                    {ind.esito === 'OK' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> REGOLARE
                      </span>
                    )}
                    {ind.esito === 'VIOLATO' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 text-rose-600" /> VIOLATO
                      </span>
                    )}
                    {ind.esito === 'NON_CALCOLABILE' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        <HelpCircle className="w-3 h-3 text-slate-400" /> Non Calcolabile
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400 italic font-sans">
                  Nessun indice ritornato dall&apos;elaborazione XBRL.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* NOTA NORMATIVA A PIÈ PAGINA */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-3 text-[11px] font-sans text-slate-600 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong className="text-slate-800">* Fonte Normativa e Riferimenti:</strong> Le soglie e
            gli indicatori della crisi d&apos;impresa sono determinati in conformità agli articoli
            13 e 24 del{' '}
            <em>
              Codice della Crisi d&apos;Impresa e dell&apos;Insolvibilità (D.Lgs. 14/2019 e s.m.i.)
            </em>{' '}
            per la rilevazione tempestiva dello stato di squilibrio patrimoniale o
            economico-finanziario.
          </p>
        </div>
      </div>
    </div>
  );
}
