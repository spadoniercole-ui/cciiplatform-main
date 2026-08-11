'use client';

import React, { useState } from 'react';

// Dati di test per evitare tabelle vuote durante la compilazione statica
const MOCK_PROFILI = [
  {
    id: 'p_1',
    nome: 'Amministratore di Sistema',
    descrizione: 'Accesso completo a configurazioni, licenze e log backend',
    livello: 'Livello 1',
  },
  {
    id: 'p_2',
    nome: 'Gestore Pratiche CCII',
    descrizione: 'Inizializzazione e monitoraggio delle procedure di allerta crisi',
    livello: 'Livello 2',
  },
  {
    id: 'p_3',
    nome: 'Consultatore / Auditor',
    descrizione: 'Sola lettura dei cruscotti di indici patrimoniali ed economici',
    livello: 'Livello 3',
  },
];

interface ModuloProfiliProps {
  profili?: any[];
}

export const ModuloProfili = ({ profili }: ModuloProfiliProps) => {
  // Se la prop è undefined o vuota, usa il mock sicuro per non rompere il build
  const listaProfili = profili && profili.length > 0 ? profili : MOCK_PROFILI;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="text-sm font-black text-slate-900">
          Profili Utente &amp; Livelli Autorizzativi
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Elenco dei profili configurati per l&apos;accesso granulare alle funzioni del codice della
          crisi.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Nome Profilo
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Descrizione Funzionale
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Gerarchia
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(listaProfili || []).map((profilo) => (
              <tr
                key={profilo?.id || Math.random()}
                className="hover:bg-slate-50/50 transition-colors"
              >
                <td className="px-6 py-4 text-xs font-bold text-slate-900">
                  {profilo?.nome || 'N/D'}
                </td>
                <td className="px-6 py-4 text-xs text-slate-600 max-w-md truncate">
                  {profilo?.descrizione || 'N/D'}
                </td>
                <td className="px-6 py-4 text-xs">
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-100">
                    {profilo?.livello || 'Standard'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
