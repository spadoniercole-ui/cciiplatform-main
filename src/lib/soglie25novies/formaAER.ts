// Mappa la forma giuridica dell'anagrafica sulle tre fattispecie dell'Agente
// della Riscossione (art. 25-novies): 100.000 € imprese individuali,
// 200.000 € societa' di persone, 500.000 € altre societa'.
//
// Deliberatamente CONSERVATIVA: riconosce solo le forme inequivocabili e
// restituisce null per tutto il resto. Sbagliare fattispecie qui significa
// confrontare i crediti affidati con 100.000 € invece che con 500.000 €,
// cioe' dichiarare "oltre soglia" un'impresa che non lo e'. Meglio non
// applicare alcuna soglia e dirlo.
//
// Funzione PURA, in un file senza 'use server' cosi' da poter essere testata.

import type { FormaAER } from './calcolo';

/**
 * Mappa la forma giuridica dell'anagrafica sulle tre fattispecie AER.
 *
 * Deliberatamente CONSERVATIVA: riconosce solo le forme inequivocabili e
 * restituisce null per tutto il resto, perche' sbagliare fattispecie qui
 * significa confrontare i crediti affidati con 100.000 € invece che con
 * 500.000 € — cioe' dichiarare "oltre soglia" un'impresa che non lo e'.
 */
export function formaAERdaAnagrafica(forma: string | null | undefined): FormaAER | null {
  if (!forma) return null;
  const f = forma.toLowerCase().replace(/[.\s]/g, '');
  if (/ditta|impresaindividuale|individuale|artigian/.test(f)) return 'IMPRESA_INDIVIDUALE';
  if (/^snc$|^sas$|societàdipersone|societadipersone|^ss$/.test(f)) return 'SOCIETA_PERSONE';
  if (/^srl$|^srls$|^spa$|^sapa$|^scarl$|^soccoop|cooperativa/.test(f)) return 'ALTRE_SOCIETA';
  return null;
}
