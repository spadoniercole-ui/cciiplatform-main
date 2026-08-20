'use client';

// Dice all'assistente flottante (sempre nello stesso posto, in basso a
// destra) su quale funzione si trova l'utente in questo momento — senza
// questo, ogni pagina dovrebbe avere il proprio assistente "locale"
// (esattamente il problema segnalato: quattro chat diverse, ciascuna
// nascosta dietro un interruttore da scoprire). Le pagine che hanno
// senso da compilare in conversazione (Anagrafica, Check List,
// Situazione Debitoria, Proposta) dichiarano qui il proprio contesto
// quando montate; l'assistente lo legge per capire cosa può fare.

import React, { createContext, useContext, useState, useCallback } from 'react';

export type PaginaContestoAssistente =
  | 'anagrafica-ente'
  | 'checklist-ente'
  | 'debitoria-ente'
  | 'checklist-generale'
  | 'proposta'
  | 'xbrl'
  | 'simulazione'
  | 'brogliaccio'
  | 'parametri'
  | null;

export interface ContestoAssistente {
  pagina: PaginaContestoAssistente;
  nomeSchema: string;
  scenarioId?: number;
  tipoProposta?: 'RICEVUTA' | 'DA_DEFINIRE';
  modelloChecklist?: string;
  /** Solo per pagina 'parametri' — quale sezione (es. "Limiti di ricevibilità", "Check List — etichette colonne"). */
  sezioneParametri?: string;
}

interface ValoreContesto {
  contesto: ContestoAssistente | null;
  impostaContesto: (c: ContestoAssistente | null) => void;
}

const Contesto = createContext<ValoreContesto | null>(null);

export function ContestoAssistenteProvider({ children }: { children: React.ReactNode }) {
  const [contesto, setContesto] = useState<ContestoAssistente | null>(null);
  const impostaContesto = useCallback((c: ContestoAssistente | null) => setContesto(c), []);
  return <Contesto.Provider value={{ contesto, impostaContesto }}>{children}</Contesto.Provider>;
}

/**
 * Da chiamare nelle pagine/schede che hanno senso da compilare in
 * conversazione — dichiara il proprio contesto al montaggio, lo
 * cancella allo smontaggio (così l'assistente torna generico se
 * l'utente naviga altrove).
 */
export function useDichiaraContestoAssistente(contesto: ContestoAssistente | null) {
  const ctx = useContext(Contesto);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.impostaContesto(contesto);
    return () => ctx.impostaContesto(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(contesto)]);
}

export function useContestoAssistente(): ContestoAssistente | null {
  const ctx = useContext(Contesto);
  return ctx?.contesto ?? null;
}
