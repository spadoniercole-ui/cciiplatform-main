// src/db/provisionProdotti.ts
//
// I PRODOTTI DELL'ENTE E IL LORO PROCESSO (0.161.0).
//
// La catena dei Parametri ha quattro blocchi, e ognuno ha il suo posto:
//
//  1. le direttrici restano in `spazi.direttrici_ente_strutturate` (solo nomi);
//  2. `prodotti_ente` — il prodotto, la sua direttrice, il flag per la check
//     list e le domande da porre nel triage;
//  3. `tl` — la TS, che ora porta anche la coppia direttrice/prodotto a cui è
//     associata; più TS possono stare sullo stesso prodotto;
//  4. `processo_prodotto` — le attività con cui l'ufficio gestisce quel
//     prodotto, una riga per TS, nell'ordine in cui le esegue.
//
// PERCHÉ `domande` È JSONB. Sono poche per prodotto, si leggono e si scrivono
// sempre insieme al prodotto e non hanno una vita propria: una tabella separata
// aggiungerebbe una join e un ordine da tenere allineato. L'id della domanda sta
// dentro il documento — è quello a cui puntano le risposte del triage — e resta
// stabile quando il testo cambia.
//
// `processo_prodotto` invece è una tabella perché il processo si legge da solo:
// il report per unità operativa e le comunicazioni ai reparti lo interrogano per
// prodotto.
//
// Le risposte della check list vivono per azienda: la stessa domanda vale per
// tutte le aziende, la risposta è di ciascuna. Il testo libero sta in `testo`,
// la risposta chiusa in `si_no`: due colonne e non un campo unico, così nessuno
// deve indovinare come è stata codificata una risposta.
//
// Idempotente: ogni spazio già attivo le riceve alla prima lettura dei
// Parametri, senza migrazioni e senza perdere nulla.

import { sql } from 'drizzle-orm';
import { eseguiDdlTenant } from './provision';

export async function assicuraTabelleProdotti(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.prodotti_ente (
      id SERIAL PRIMARY KEY,
      direttrice TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '',
      in_checklist BOOLEAN NOT NULL DEFAULT false,
      domande JSONB NOT NULL DEFAULT '[]'::jsonb,
      ordine INTEGER NOT NULL DEFAULT 0,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Lo stesso prodotto non può esistere due volte nella stessa direttrice:
  // sarebbe lo stesso fatto con due check list, e il triage non saprebbe quale
  // mostrare. La grafia non conta.
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_prodotti_ente_nome
        ON ${s}.prodotti_ente (lower(btrim(direttrice)), lower(btrim(nome)))`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.processo_prodotto (
      id SERIAL PRIMARY KEY,
      prodotto_id INTEGER NOT NULL,
      tl_id INTEGER NOT NULL,
      dipendenza TEXT,
      procedura TEXT,
      esito TEXT,
      ordine INTEGER NOT NULL DEFAULT 0,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // IL GRUPPO TIENE INSIEME LE TS DI UNA STESSA OPERATIVITÀ (0.162.0).
  // Le righe restano una per TS perché i report le leggono così; il gruppo
  // permette di modificarle insieme. La colonna si aggiunge anche agli spazi
  // già attivi, e le righe scritte prima restano senza gruppo: ognuna è
  // un'operatività di sé.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.processo_prodotto ADD COLUMN IF NOT EXISTS gruppo TEXT`
  );
  // La stessa TS non è più esclusiva di un prodotto: può servire due
  // operatività dello stesso prodotto (una diffida che è anche un passo della
  // mora) e prodotti diversi. Il vecchio indice unico lo impediva.
  await eseguiDdlTenant(sql`DROP INDEX IF EXISTS ${s}.idx_processo_prodotto_unico`);
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_processo_prodotto_gruppo
        ON ${s}.processo_prodotto (prodotto_id, gruppo)`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_prodotti_risposte (
      azienda_id INTEGER NOT NULL,
      prodotto_id INTEGER NOT NULL,
      domanda_id TEXT NOT NULL,
      si_no BOOLEAN,
      testo TEXT,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (azienda_id, prodotto_id, domanda_id)
    )`
  );
}
