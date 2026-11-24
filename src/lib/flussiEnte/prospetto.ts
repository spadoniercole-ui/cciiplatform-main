// src/lib/flussiEnte/prospetto.ts
//
// IL PROSPETTO DEGLI ADEMPIMENTI, RAGGRUPPATO PER ANNO (0.256.6).
//
// Una tabella di sessanta righe non si legge: due anni di denunce e pagamenti
// sono quarantotto posizioni, e in un elenco piatto il periodo che manca si
// trova solo scorrendo tutto. Il raggruppamento per anno fa quello che fa un
// filtro di Excel: un nodo per anno, che dice quante posizioni contiene e
// quante sono scoperte, e dentro le righe dell'anno. Chi cerca il 2024 apre il
// 2024.
//
// L'anno è quello del PERIODO DI COMPETENZA, che è il modo in cui i documenti
// dell'ente sono organizzati: una denuncia di dicembre 2024 scade a gennaio
// 2025, e resta nel 2024, perché è il mese che si sta dichiarando.
//
// NESSUN VALORE AGGIUNTO. I totali del nodo sono conteggi di righe già presenti
// — posizioni, scoperte, ritardo massimo — non stime e non medie.
//
// Funzione pura, con i suoi test.

import type { FamigliaFlusso, RigaProspetto, StatoAdempimento } from './congruenza';

export interface GruppoAnnoProspetto {
  anno: number;
  righe: RigaProspetto[];
  /** Quante posizioni sono scoperte: è il numero che si cerca aprendo il nodo. */
  scoperte: number;
  /** Il ritardo più alto dell'anno, in giorni; null se nessuna riga lo misura. */
  ritardoMassimo: number | null;
}

export interface FiltriProspetto {
  /** Solo le posizioni scoperte. */
  soloScoperte?: boolean;
  /** Una sola fonte: la denuncia o il pagamento. */
  fonte?: FamigliaFlusso | null;
}

const annoDi = (periodo: string): number => Number(periodo.slice(0, 4));

const ORDINE_STATO: Record<StatoAdempimento, number> = {
  SCOPERTA: 0,
  REGOLARIZZATA: 1,
  TRASMESSO: 2,
  FUORI_PERIMETRO: 3,
};

/** Gli anni, dal più recente: il nodo che si apre per primo è quello che conta. */
export function raggruppaProspettoPerAnno(
  righe: RigaProspetto[],
  filtri: FiltriProspetto = {}
): GruppoAnnoProspetto[] {
  const filtrate = righe.filter(
    (r) =>
      (!filtri.soloScoperte || r.stato === 'SCOPERTA') && (!filtri.fonte || r.tipo === filtri.fonte)
  );

  const perAnno = new Map<number, RigaProspetto[]>();
  for (const r of filtrate) {
    const anno = annoDi(r.periodo);
    if (!Number.isFinite(anno)) continue;
    const gruppo = perAnno.get(anno);
    if (gruppo) gruppo.push(r);
    else perAnno.set(anno, [r]);
  }

  const gruppi: GruppoAnnoProspetto[] = [];
  for (const [anno, dellAnno] of perAnno) {
    // Dentro l'anno: il periodo in ordine, e prima la denuncia del pagamento.
    const ordinate = [...dellAnno].sort(
      (a, b) =>
        a.periodo.localeCompare(b.periodo) ||
        a.tipo.localeCompare(b.tipo) ||
        ORDINE_STATO[a.stato] - ORDINE_STATO[b.stato]
    );
    const ritardi = ordinate
      .map((r) => r.ritardo)
      .filter((g): g is number => g !== null && Number.isFinite(g));
    gruppi.push({
      anno,
      righe: ordinate,
      scoperte: ordinate.filter((r) => r.stato === 'SCOPERTA').length,
      ritardoMassimo: ritardi.length > 0 ? Math.max(...ritardi) : null,
    });
  }

  return gruppi.sort((a, b) => b.anno - a.anno);
}

/** «06/2025», come si legge un periodo nei documenti dell'ente. */
export function periodoLeggibile(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  return m ? `${m[2]}/${m[1]}` : periodo;
}

/** «06/07/2025»: la scadenza di legge come la scrive un ufficio. */
export function dataLeggibile(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const ETICHETTA_STATO_ADEMPIMENTO: Record<StatoAdempimento, string> = {
  TRASMESSO: 'trasmesso',
  SCOPERTA: 'scoperto',
  REGOLARIZZATA: 'coperto da una partita',
  FUORI_PERIMETRO: 'fuori dall’arco',
};
