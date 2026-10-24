// src/lib/lavorazioni/solaLettura.ts
//
// LA CONFIGURAZIONE «LAVORAZIONI PER TIPOLOGIA DI DEBITO» È IN SOLA LETTURA.
//
// Perché si è scelto di congelarla invece di eliminarla. Quella tabella non
// è inerte: è l'unica fonte del DESTINATARIO delle comunicazioni ai colleghi
// e dei documenti per reparto del triage. Cancellarla lascerebbe quelle due
// funzioni senza indirizzo, e senza un errore che lo dica; nasconderla
// lascerebbe una configurazione autorevole e invisibile. Congelarla no:
// nessun dato viene toccato, i destinatari restano quelli già indicati,
// e nessuno può più aggiungerne di nuovi per errore.
//
// PER RIAPRIRLA: riportare il valore a `false`. Il blocco non è solo nella
// schermata — le due server action di scrittura rifiutano l'operazione — così
// non basta togliere un pulsante per far ripartire le modifiche.

/**
 * `true` = la tabella si consulta e non si modifica.
 * Il valore vive qui, e non nel componente, perché lo leggono tre punti che
 * devono dire la stessa cosa: la pagina, le server action e i testi del triage.
 */
export const LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA = true;

/** L'avviso mostrato in testa alla pagina. */
export const AVVISO_LAVORAZIONI_SOLA_LETTURA =
  'Questa configurazione è in sola lettura. Le posizioni già indicate restano valide e continuano ad alimentare le comunicazioni ai colleghi e i documenti per reparto del triage, ma non se ne possono aggiungere, modificare o eliminare. Nessun dato è stato toccato.';

/** Il messaggio restituito se una scrittura arriva comunque dal browser. */
export const MESSAGGIO_LAVORAZIONI_SOLA_LETTURA =
  'La configurazione delle lavorazioni per tipologia di debito è in sola lettura: si consulta, non si modifica.';
