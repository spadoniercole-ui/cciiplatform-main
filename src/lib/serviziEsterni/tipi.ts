// src/lib/serviziEsterni/tipi.ts
//
// I tipi del pannello dei servizi a pagamento stanno qui e non nel file
// `'use server'`: quel file esporta solo funzioni async (CLAUDE.md), e i tipi
// servono anche alla pagina client.

import type { LetturaCredito } from './crediti';

export interface VoceServizio {
  nome: string;
  /** La variabile d'ambiente che lo accende. */
  chiave: string;
  configurazione: 'PRESENTE' | 'ASSENTE';
  lettura: LetturaCredito;
}

export interface UsoAi {
  funzione: string;
  chiamate: number;
}

export interface EsitoServiziEsterni {
  success: boolean;
  /** Quando è stata fatta la verifica. */
  quando: string;
  voci: VoceServizio[];
  usoAi: UsoAi[];
  error?: string;
}
