// IL LIVELLO DI UN UTENTE SU UNA SINGOLA AZIENDA (0.255.14).
//
// Un Operatore può lavorare su più aziende, e non su tutte con lo stesso
// diritto: su una scrive, su un'altra legge soltanto. Il livello vive
// nell'associazione utente↔azienda (`utenti_aziende.livello`), mentre il
// permesso per modulo (`permessi_utente`) dice che cosa può fare nell'area
// Scenari, Check List, XBRL… Le due cose si incontrano qui: il livello per
// azienda è un tetto, non una concessione — non allarga mai il permesso di
// modulo, e non c'è modo di ottenere la scrittura su un'azienda se il modulo
// è in sola lettura.
//
// Perché un modulo puro: la regola deve essere la stessa nella schermata che
// mostra il livello effettivo e nel controllo d'accesso che lo applica, e
// deve poter essere provata senza database.

import type { LivelloPermesso } from './moduliPermesso';

export const LIVELLI_AZIENDA = ['LETTURA', 'SCRITTURA'] as const;
export type LivelloAzienda = (typeof LIVELLI_AZIENDA)[number];

export const ETICHETTA_LIVELLO_AZIENDA: Record<LivelloAzienda, string> = {
  LETTURA: 'Sola lettura',
  SCRITTURA: 'Lettura e scrittura',
};

export function livelloAziendaValido(valore: unknown): valore is LivelloAzienda {
  return valore === 'LETTURA' || valore === 'SCRITTURA';
}

/**
 * Il livello scritto in archivio, con una regola sola per i dati vecchi:
 * un'associazione creata prima del livello valeva «piena», perché nessuno
 * la limitava. Uno zero silenzioso avrebbe chiuso l'accesso a chi lavorava.
 */
export function normalizzaLivelloAzienda(valore: unknown): LivelloAzienda {
  return livelloAziendaValido(valore) ? valore : 'SCRITTURA';
}

/** Il livello che l'utente ha davvero su quell'azienda: il minore dei due. */
export function livelloEffettivo(
  modulo: LivelloPermesso | null | undefined,
  azienda: LivelloAzienda | null | undefined
): LivelloPermesso {
  const permessoModulo = modulo ?? 'NESSUNO';
  if (permessoModulo === 'NESSUNO') return 'NESSUNO';
  return normalizzaLivelloAzienda(azienda) === 'LETTURA' ? 'LETTURA' : permessoModulo;
}

/** Se il livello effettivo basta per l'operazione richiesta. */
export function livelloBasta(
  effettivo: LivelloPermesso,
  richiesto: 'LETTURA' | 'SCRITTURA'
): boolean {
  return richiesto === 'LETTURA' ? effettivo !== 'NESSUNO' : effettivo === 'SCRITTURA';
}
