// src/lib/profiliUtente.ts
//
// I DUE PROFILI DI UN UTENTE DI SPAZIO (0.255.16): Operatore e Consultatore.
//
// Il profilo non è un permesso a sé: dice con che taglio l'utente entra nello
// spazio, e da lì nascono i flag iniziali delle funzioni (i moduli di
// `moduliPermesso.ts`). L'Admin di Spazio li vede già accesi dopo il
// salvataggio e può spegnerli o riaccenderli: il profilo è il punto di
// partenza, non un lucchetto.
//
// Operatore lavora: scenari e check list sono suoi, il resto lo legge.
// Consultatore consulta: legge tutto, non scrive niente.

import { MODULI_PERMESSO, type LivelloPermesso, type Modulo } from './moduliPermesso';

export type TipologiaProfilo = 'OPERATIVO' | 'CONSULTATORE';

export const TIPOLOGIE_PROFILO: TipologiaProfilo[] = ['OPERATIVO', 'CONSULTATORE'];

export const ETICHETTA_PROFILO: Record<TipologiaProfilo, string> = {
  OPERATIVO: 'Operatore',
  CONSULTATORE: 'Consultatore',
};

export const DESCRIZIONE_PROFILO: Record<TipologiaProfilo, string> = {
  OPERATIVO:
    'Lavora sulle posizioni: scenari e check list in scrittura, indici, bilanci, proposta e relazione in lettura.',
  CONSULTATORE:
    'Consulta e basta: tutte le funzioni in sola lettura, nessuna modifica ai dati dello spazio.',
};

/**
 * I flag con cui parte ogni profilo. Sono il valore iniziale scritto alla
 * creazione e quello che la schermata mostra subito dopo il salvataggio.
 */
export const PERMESSI_PROFILO: Record<TipologiaProfilo, Record<Modulo, LivelloPermesso>> = {
  OPERATIVO: {
    scenari: 'SCRITTURA',
    checklist: 'SCRITTURA',
    indici: 'LETTURA',
    xbrl: 'LETTURA',
    report: 'LETTURA',
    relazione: 'LETTURA',
    simulazione: 'LETTURA',
  },
  CONSULTATORE: {
    scenari: 'LETTURA',
    checklist: 'LETTURA',
    indici: 'LETTURA',
    xbrl: 'LETTURA',
    report: 'LETTURA',
    relazione: 'LETTURA',
    simulazione: 'LETTURA',
  },
};

/** I flag del profilo, come copia: chi li modifica non tocca la costante. */
export function permessiDelProfilo(tipologia: TipologiaProfilo): Record<Modulo, LivelloPermesso> {
  return { ...PERMESSI_PROFILO[tipologia] };
}

/**
 * I flag da scrivere per un utente: quelli scelti dall'Admin, completati con
 * il profilo per i moduli che non arrivano. Un modulo spento resta spento.
 */
export function componiPermessiUtente(
  tipologia: TipologiaProfilo,
  scelti?: Partial<Record<Modulo, LivelloPermesso>>
): Record<Modulo, LivelloPermesso> {
  const base = permessiDelProfilo(tipologia);
  for (const modulo of MODULI_PERMESSO) {
    const scelto = scelti?.[modulo];
    if (scelto) base[modulo] = scelto;
  }
  return base;
}
