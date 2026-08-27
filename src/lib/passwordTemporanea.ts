// src/lib/passwordTemporanea.ts
//
// Definizione UNICA di "questo account deve ancora scegliersi una
// password". Esiste per lo stesso motivo di anagraficaAzienda.ts: una sola
// regola, letta da tutti i punti che decidono un accesso.
//
// La colonna `password_temporanea` è TEXT NULL. La convenzione è:
//   - NULL           → l'utente ha già una password propria;
//   - testo non vuoto → è ancora attiva la password temporanea assegnata.
//
// La stringa VUOTA non appartiene a questa convenzione, ma è comparsa
// (bootstrap dell'edizione portable) e ha prodotto un blocco d'accesso
// muto: `'' !== null` è vero, quindi il layout dello spazio reindirizzava
// al cambio password un admin che una password definitiva ce l'aveva già,
// e da lì si tornava alla pagina di accesso — un loop senza messaggi.
//
// Sul lato dati la causa è corretta; questa funzione è la seconda linea:
// una stringa vuota o di soli spazi vale come "nessuna password
// temporanea", così un valore anomalo non può più chiudere fuori nessuno.

export function richiedeCambioPassword(passwordTemporanea: string | null | undefined): boolean {
  if (passwordTemporanea === null || passwordTemporanea === undefined) return false;
  return passwordTemporanea.trim().length > 0;
}
