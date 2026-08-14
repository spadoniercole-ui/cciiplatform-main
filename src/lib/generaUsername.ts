// src/lib/generaUsername.ts
//
// Identità di login del sistema. Fino alla 0.108 il login usava l'email
// come chiave: fragile per due motivi concreti emersi sul campo.
//
//   1) L'email è soggetta a un controllo formale (deve contenere "@", ecc.)
//      e uno stesso professionista può voler riusare la stessa email
//      (aziendale = personale) su più spazi.
//   2) L'indice globale email → schema aveva l'email come chiave unica su
//      tutta la piattaforma: un secondo Admin con la stessa email
//      SOVRASCRIVEVA silenziosamente l'indice del primo, facendolo
//      "sparire" al login (l'account restava intatto nel suo schema, ma il
//      login non lo trovava più).
//
// La chiave di login diventa lo USERNAME: "nome.cognome", e in caso di
// omonimia "nome.cognome" + due cifre progressive (nome.cognome01,
// nome.cognome02, ...). Deterministico, senza "@", verificabile prima
// dell'inserimento — così l'ultimo creato non può più sovrascrivere un
// utente già esistente. L'email torna a essere un semplice dato di
// contatto: modificabile e non più vincolo di unicità.

/**
 * Riduce una stringa a soli caratteri [a-z0-9]: minuscolo, accenti rimossi
 * (à→a, é→e, ç→c...), spazi e punteggiatura eliminati. "Città" → "citta",
 * "D'Angelo" → "dangelo".
 */
function riduciAscii(s: string): string {
  return (s || '')
    .normalize('NFD') // separa i diacritici dalle lettere base
    .replace(/[\u0300-\u036f]/g, '') // rimuove i diacritici (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Base dello username a partire da nome e cognome: "nome.cognome". Se uno
 * dei due manca del tutto (dopo la riduzione), si usa l'altro da solo; se
 * mancano entrambi, si ripiega su "utente" — non lascia mai una base vuota,
 * che romperebbe l'unicità e la leggibilità.
 */
export function baseUsername(nome: string, cognome: string): string {
  const n = riduciAscii(nome);
  const c = riduciAscii(cognome);
  if (n && c) return `${n}.${c}`;
  if (n) return n;
  if (c) return c;
  return 'utente';
}

/**
 * Genera uno username univoco a partire da nome e cognome, delegando la
 * verifica di esistenza a `esiste` (che il chiamante implementa
 * interrogando l'indice globale — vedi usernameEsisteGlobale). La base
 * "nome.cognome" si prova per prima; alla prima collisione si aggiungono
 * due cifre progressive: 01, 02, ... 99. Oltre 99 omonimi (praticamente
 * impossibile) si passa a un suffisso più lungo, per non restare mai senza
 * uno username valido.
 */
export async function generaUsernameUnivoco(
  nome: string,
  cognome: string,
  esiste: (username: string) => Promise<boolean>
): Promise<string> {
  const base = baseUsername(nome, cognome);

  if (!(await esiste(base))) return base;

  for (let i = 1; i <= 99; i++) {
    const candidato = `${base}${String(i).padStart(2, '0')}`;
    if (!(await esiste(candidato))) return candidato;
  }

  // Oltre 99 omonimi: suffisso a 3+ cifre, finché non ne trova uno libero.
  let i = 100;
  // Limite di sicurezza altissimo, solo per non ciclare all'infinito in
  // presenza di un bug del checker.
  while (i < 100000) {
    const candidato = `${base}${i}`;
    if (!(await esiste(candidato))) return candidato;
    i++;
  }
  // Fallback estremo: non dovrebbe mai essere raggiunto.
  return `${base}${i}`;
}

/**
 * Verifica se uno username è già in uso su TUTTA la piattaforma: controlla
 * sia l'indice degli Admin (admin_spazio_index) sia quello degli Utenti
 * (utente_spazio_index). Login risolve prima gli Admin poi gli Utenti, così
 * i due namespace condividono lo stesso spazio dei nomi: uno username non
 * può appartenere a un Admin e a un Operatore diversi contemporaneamente.
 *
 * `pool` è il Pool pg (passato dal chiamante per non creare dipendenze
 * cicliche tra lib e db in fase di import).
 */
export async function usernameEsisteGlobale(pool: any, username: string): Promise<boolean> {
  // Due query separate, ognuna tollerante all'assenza della propria tabella
  // (un indice potrebbe non essere ancora stato creato in questo processo):
  // un errore su una non deve impedire il controllo sull'altra.
  for (const tabella of ['public.admin_spazio_index', 'public.utente_spazio_index']) {
    try {
      const ris = await pool.query(`SELECT 1 FROM ${tabella} WHERE username = $1 LIMIT 1`, [
        username,
      ]);
      if (ris.rows.length > 0) return true;
    } catch {
      // Tabella non ancora esistente o altro problema transitorio: prosegui.
    }
  }
  return false;
}
