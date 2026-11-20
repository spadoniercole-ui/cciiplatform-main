// LA FOTOGRAFIA COMPLESSIVA, LETTA DAL DATO (0.252.0).
//
// L'interpolazione delle due verifiche è pura (`interpolazione.ts`): qui si
// raccoglie ciò che le due verifiche hanno già prodotto — il credito
// accertato e l'esito dell'amministrativa, gli anni del prospetto con i loro
// indici, il ponte sul debito dell'ente, la nota integrativa — e si chiama la
// funzione. Una sola lettura per la scheda e per il documento da rilasciare:
// due copie darebbero due fotografie diverse della stessa posizione.
//
// Nessuna scrittura: la verifica aziendale continua a scrivere solo la riga che
// ScenariManager legge, e la scrive l'azione.

import { leggiVerificaAzienda } from './letturaVerifica';
import {
  interpolaVerifiche,
  type FotografiaComplessiva,
  type LetturaAmministrativa,
} from './interpolazione';
import type { FotografiaVerificaAzienda } from './fotografia';

export interface LetturaComplessiva {
  complessiva: FotografiaComplessiva;
  /** La fotografia contabile con i tre scenari: la scheda la mostra a parte. */
  fotografia: FotografiaVerificaAzienda;
}

/** Quanti indici dell'ultima annualità sono oltre la soglia di riferimento. */
function indiciViolati(fotografia: FotografiaVerificaAzienda): number | null {
  const ultima = fotografia.anni[fotografia.anni.length - 1];
  if (!ultima) return null;
  const tutti = [...ultima.indici, ...ultima.altriIndici];
  if (tutti.length === 0) return null;
  return tutti.filter((i) => i.esito === 'VIOLATO').length;
}

export async function leggiFotografiaComplessiva(
  nomeSchema: string,
  aziendaId: number,
  amministrativa: LetturaAmministrativa | null
): Promise<LetturaComplessiva> {
  const lettura = await leggiVerificaAzienda(nomeSchema, aziendaId);
  const fotografia = lettura.fotografia;

  const complessiva = interpolaVerifiche({
    amministrativa,
    contabile: {
      anni: fotografia.anni.map((a) => ({ anno: a.anno, tipo: a.tipo, dati: a.dati })),
      indiciViolati: indiciViolati(fotografia),
      annoVerifica: fotografia.annoVerifica,
      capacita: fotografia.capacita,
      ponte: lettura.ponte
        ? {
            debitoContabileUltimo: lettura.ponte.debitoContabileUltimo,
            debitoVerificato: lettura.ponte.debitoVerificato,
            differenza: lettura.ponte.differenza,
          }
        : null,
      nota: lettura.nota
        ? { continuita: lettura.nota.continuita, sezioni: lettura.nota.sezioni }
        : null,
    },
  });

  return { complessiva, fotografia };
}
