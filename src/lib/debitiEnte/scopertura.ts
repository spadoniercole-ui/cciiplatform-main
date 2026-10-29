// src/lib/debitiEnte/scopertura.ts
//
// DA QUANDO IL VERSAMENTO È SCOPERTO.
//
// Il V.E.R.A. scrive il PERIODO di competenza di un versamento, non la data in
// cui è scaduto: il contributo di un mese si versa entro il 16 del mese
// successivo. La distanza fra quel termine e la data della verifica non è un
// dato che il file dichiari, e non serve chiederla all'operatore: si calcola.
// «03/2026» alla verifica del 28/10/2026 significa che quel versamento è
// scoperto da 195 giorni, cioè da molto più dei 30 che la denuncia non
// trasmessa può attendere.
//
// PERCHÉ UNA SOGLIA. Oltre i 30 giorni la scopertura non è più un ritardo
// fisiologico: la denuncia va trasmessa e il flusso regolarizzato. La soglia è
// una costante dichiarata — non un'inferenza sul singolo file — così il
// documento per l'ufficio la nomina e chi legge sa a che cosa si riferisce.
//
// A CHI SI APPLICA. Solo alle nature che hanno davvero un termine di
// versamento: «F24 non presentato» e «Denunce non trasmesse». Una verifica,
// un verbale ispettivo o una cartella non hanno un termine del 16: trattarli
// come versamenti scaduti produrrebbe scoperture di migliaia di giorni su
// posizioni che non c'entrano, e il numero perde senso dove serve.

import { periodoDaVera } from './veraImport';

/** Oltre questa scopertura la denuncia non trasmessa va presa in carico. */
export const SCOPERTURA_GIORNI_RILEVANTE = 30;

export interface ScoperturaVera {
  /** Termine di versamento, AAAA-MM-GG (il 16 del mese successivo al periodo). */
  termine: string;
  /** Giorni trascorsi dal termine alla data della verifica. */
  giorni: number;
}

/**
 * Il termine di versamento del periodo, se il periodo è leggibile.
 * Il mese di `periodoDaVera` è 1-based e `Date.UTC` 0-based: `Date.UTC(anno,
 * mese, 16)` è il 16 del mese SUCCESSIVO, che è la regola del versamento.
 */
export function termineVersamento(periodo: string | undefined | null): Date | null {
  const p = periodo ? periodoDaVera(periodo) : null;
  if (!p) return null;
  return new Date(Date.UTC(p.anno, p.mese, 16));
}

/**
 * La scopertura di una posizione alla data della verifica.
 *
 * null quando il periodo non si legge o quando il termine non è ancora
 * passato: un versamento che scade domani non è scoperto, e scriverlo come
 * «scoperto da -1 giorni» sarebbe un numero inventato.
 */
export function scoperturaDaVera(
  periodo: string | undefined | null,
  dataVerifica: string
): ScoperturaVera | null {
  const termine = termineVersamento(periodo);
  if (!termine) return null;
  const verifica = new Date(`${(dataVerifica ?? '').trim()}T00:00:00Z`);
  if (Number.isNaN(verifica.getTime())) return null;
  const giorni = Math.floor((verifica.getTime() - termine.getTime()) / 86_400_000);
  if (giorni < 0) return null;
  return { termine: termine.toISOString().slice(0, 10), giorni };
}

/** La natura ha un termine di versamento da misurare? */
export function eVersamentoConTermine(voce: string): boolean {
  return /f24|denunc/i.test(voce);
}
