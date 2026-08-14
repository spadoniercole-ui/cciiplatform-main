'use client';

// Non più una scelta tra due schede: per ogni tipo di spazio c'è ormai
// una sola Check List sensata — Ministeriale per il Redigente (56
// domande fisse, Sezione II del decreto), pesi da direttrici per il
// Ricevente (calcolati dallo Screening). La vecchia "Customizzata"
// (colonne Excel + modelli propri) resta raggiungibile solo da un
// link diretto a un modello già esistente (apriModelloId) — per non
// rompere dati storici di spazi che la usavano prima di questa
// semplificazione, non più come opzione scelta dal menu.

import React from 'react';
import { ChecklistPesoPerDomandaManager } from '@/components/spazio/ChecklistPesoPerDomandaManager';
import { ChecklistColonneConfigManager } from '@/components/spazio/ChecklistColonneConfigManager';
import { ChecklistModelliManager } from '@/components/spazio/ChecklistModelliManager';
import { PesiDirettriciInfo } from '@/components/spazio/PesiDirettriciInfo';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Props {
  nomeSchema: string;
  apriModelloId?: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

export function ChecklistParametriTabs({ nomeSchema, apriModelloId, tipoSpazio }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: apriModelloId
      ? 'Check List — modello custom (link diretto)'
      : tipoSpazio === 'ENTE'
        ? 'Check List — pesi da direttrici (Screening)'
        : 'Check List Ministeriale — peso per domanda',
  });

  if (apriModelloId) {
    return (
      <div className="space-y-4">
        <ChecklistColonneConfigManager nomeSchema={nomeSchema} />
        <ChecklistModelliManager nomeSchema={nomeSchema} apriModelloId={apriModelloId} />
      </div>
    );
  }

  if (tipoSpazio === 'ENTE') {
    return <PesiDirettriciInfo nomeSchema={nomeSchema} />;
  }

  return <ChecklistPesoPerDomandaManager nomeSchema={nomeSchema} />;
}
