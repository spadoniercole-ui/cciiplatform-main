// Definizione UNICA di "questo account deve ancora scegliersi una password".
//
// La colonna `password_temporanea` è TEXT NULL, con questa convenzione:
//   NULL            → l'utente ha già una password propria;
//   testo non vuoto → è ancora attiva la password temporanea assegnata.
//
// Dalla 0.116 il testo salvato è sempre il marcatore PASSWORD_DA_CAMBIARE, mai
// la password: fino ad allora vi finiva la password temporanea IN CHIARO,
// leggibile da chiunque accedesse al database o a un suo backup. La password
// resta solo come hash bcrypt in `password_hash` e viene mostrata una volta
// sola, a chi la genera. Le righe precedenti vengono convertite da
// oscuraPasswordTemporanee (src/db/ensureTables.ts).
//
// La stringa VUOTA non appartiene alla convenzione, ma è comparsa (bootstrap
// dell'edizione portable) e ha prodotto un blocco d'accesso muto: `'' !== null`
// è vero, quindi il layout dello spazio reindirizzava al cambio password un
// admin che una password definitiva ce l'aveva già, e da lì si tornava alla
// pagina di accesso — un loop senza messaggi.
//
// Sul lato dati la causa è corretta; questa funzione è la seconda linea: una
// stringa vuota o di soli spazi vale come "nessuna password temporanea", così
// un valore anomalo non può più chiudere fuori nessuno.

export function richiedeCambioPassword(passwordTemporanea: string | null | undefined): boolean {
  if (passwordTemporanea === null || passwordTemporanea === undefined) return false;
  return passwordTemporanea.trim().length > 0;
}

/** Valore di `password_temporanea` per "password assegnata, da cambiare al primo accesso". */
export const PASSWORD_DA_CAMBIARE = 'DA_CAMBIARE';
