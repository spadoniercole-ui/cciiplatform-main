'use client';

// src/components/spazio/ChecklistParametriTabs.tsx
//
// I PARAMETRI DELLA CHECK LIST (0.168.0).
//
// Per l'ente non c'è più niente da pesare qui: la check list nasce dai prodotti
// dell'ente, e ogni prodotto porta con sé il flag e le domande. La pagina resta
// come promemoria, perché chi arriva da un vecchio link deve capire dove si
// configura, invece di trovare un vuoto. Per il RED resta il peso per domanda
// della Check List Ministeriale: quella è la sua parte.

import React from 'react';
import Link from 'next/link';
import { ChecklistPesoPerDomandaManager } from '@/components/spazio/ChecklistPesoPerDomandaManager';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Props {
  nomeSchema: string;
  codice: string;
  apriModelloId?: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

export function ChecklistParametriTabs({ nomeSchema, codice, apriModelloId, tipoSpazio }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri:
      tipoSpazio === 'ENTE'
        ? 'Check List — generata dai Prodotti dell’ente'
        : apriModelloId
          ? `Check List — modello #${apriModelloId}`
          : 'Check List Ministeriale — peso per domanda',
  });

  if (tipoSpazio === 'ENTE') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Check List</p>
        <h2 className="text-base font-bold text-slate-900">
          La check list nasce dai prodotti dell’ente
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Non ci sono pesi da configurare qui. Ogni prodotto agganciato alla direttrice porta il
          flag «in check list» e le domande che lo riguardano: sono quelle domande, tutte, a formare
          la check list dell’azienda. Il triage la compila prima dell’elaborato e la stampa come
          analisi qualitativa.
        </p>
        <Link
          href={`/spazio/${codice}/parametri/prodotti`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline"
        >
          Vai ai Prodotti dell’ente →
        </Link>
      </div>
    );
  }

  return <ChecklistPesoPerDomandaManager nomeSchema={nomeSchema} />;
}
