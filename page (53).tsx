'use server';

// Gestione Utenti (Operativo/Consultatore) all'interno di uno spazio,
// associabili a una o più aziende — "quando creerà gli utenti prima avrà
// creato l'azienda e, all'interno della stessa funzione, gli utenti ad
// essa designati" (dall'analisi funzionale). Distinti dall'Admin di Spazio
// (admin_workspace): questi utenti non hanno ancora un proprio login reale
// — è il prossimo passo naturale una volta che questa gestione esiste.

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { assicuraTabelleUtenti } from '@/db/provision';
import { generaUsernameUnivoco, usernameEsisteGlobale } from '@/lib/generaUsername';

export type TipologiaUtente = 'OPERATIVO' | 'CONSULTATORE';

export interface UtenteSpazio {
  id: number;
  nome: string;
  cognome: string;
  username: string | null;
  email: string;
  tipologia: TipologiaUtente;
  attivo: boolean;
  aziendeIds: number[];
}

export interface RisultatoElencoUtenti {
  success: boolean;
  utenti: UtenteSpazio[];
  error?: string;
}

export interface RisultatoOperazioneUtente {
  success: boolean;
  error?: string;
  passwordTemporanea?: string;
  username?: string;
}

export interface DatiUtente {
  nome: string;
  cognome: string;
  email: string;
  tipologia: TipologiaUtente;
  aziendeIds: number[];
}

function generaPasswordTemporanea(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let risultato = '';
  for (let i = 0; i < 12; i++) {
    risultato += alfabeto.charAt(crypto.randomInt(alfabeto.length));
  }
  return risultato;
}

export async function ottieniUtentiSpazio(nomeSchema: string): Promise<RisultatoElencoUtenti> {
  try {
    await assicuraTabelleUtenti(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righeUtenti = await db.select().from(tabelle.utenti_spazio);
    const righeAssociazioni = await db.select().from(tabelle.utenti_aziende);

    const utenti: UtenteSpazio[] = righeUtenti.map((u) => ({
      id: u.id,
      nome: u.nome,
      cognome: u.cognome,
      username: u.username ?? null,
      email: u.email,
      tipologia: u.tipologia as TipologiaUtente,
      attivo: u.attivo,
      aziendeIds: righeAssociazioni.filter((a) => a.utenteId === u.id).map((a) => a.aziendaId),
    }));

    return { success: true, utenti };
  } catch (error: any) {
    console.error('[ottieniUtentiSpazio] Errore:', error);
    return {
      success: false,
      utenti: [],
      error: `Impossibile caricare gli utenti: ${error.message || error}`,
    };
  }
}

export async function creaUtenteSpazioAction(
  nomeSchema: string,
  dati: DatiUtente
): Promise<RisultatoOperazioneUtente> {
  try {
    const nome = dati.nome.trim();
    const cognome = dati.cognome.trim();
    const email = (dati.email || '').trim().toLowerCase();

    if (!nome || !cognome) {
      return { success: false, error: 'Nome e cognome sono obbligatori.' };
    }
    // L'email non è più la chiave di login (lo è lo username generato da
    // nome.cognome): nessun controllo formale bloccante, resta un dato di
    // contatto facoltativo.
    if (!dati.aziendeIds || dati.aziendeIds.length === 0) {
      return {
        success: false,
        error: "Seleziona almeno un'azienda su cui questo utente può operare.",
      };
    }

    await assicuraTabelleUtenti(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { pool } = await import('@/lib/db');
    const tabelle = getTabelleTenant(nomeSchema);

    // Username univoco su tutta la piattaforma (nome.cognome + cifre): è la
    // chiave di login, generato prima dell'inserimento così un omonimo non
    // può sovrascrivere un utente già esistente.
    const { assicuraIndiceUtenteSpazio } = await import('@/db/ensureTables');
    await assicuraIndiceUtenteSpazio();
    const username = await generaUsernameUnivoco(nome, cognome, (u) =>
      usernameEsisteGlobale(pool, u)
    );

    const passwordTemporanea = generaPasswordTemporanea();
    const passwordHash = await bcrypt.hash(passwordTemporanea, 10);

    const inserito = await db
      .insert(tabelle.utenti_spazio)
      .values({
        nome,
        cognome,
        username,
        email,
        tipologia: dati.tipologia,
        passwordHash,
        passwordTemporanea,
      })
      .returning({ id: tabelle.utenti_spazio.id });

    const utenteId = inserito[0].id;

    for (const aziendaId of dati.aziendeIds) {
      await db.insert(tabelle.utenti_aziende).values({ utenteId, aziendaId });
    }

    // Indicizzazione username -> schema: senza questo, il login non saprebbe
    // in quale schema isolato cercare le credenziali di questo username
    // (stesso principio già usato per admin_spazio_index). Chiave
    // sull'username: nessuna sovrascrittura possibile.
    const spazioRisultato = await pool.query(
      'SELECT id, codice FROM spazi WHERE nome_schema = $1',
      [nomeSchema]
    );
    if (spazioRisultato.rows.length > 0) {
      await pool.query(
        `INSERT INTO utente_spazio_index (username, email, nome_schema, spazio_id, codice_spazio)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, nome_schema = EXCLUDED.nome_schema, spazio_id = EXCLUDED.spazio_id, codice_spazio = EXCLUDED.codice_spazio`,
        [username, email, nomeSchema, spazioRisultato.rows[0].id, spazioRisultato.rows[0].codice]
      );
    }

    // Permessi di default per un nuovo utente: moduli di analisi in
    // scrittura, gestione dello spazio (Aziende/Utenti/Parametri) negata —
    // solo l'Admin di Spazio la gestisce. Modificabili subito dopo dall'Admin.
    const permessiDefault: Record<string, 'NESSUNO' | 'LETTURA' | 'SCRITTURA'> = {
      scenari: 'SCRITTURA',
      checklist: 'SCRITTURA',
      indici: 'LETTURA',
      xbrl: 'LETTURA',
      report: 'LETTURA',
    };
    for (const [modulo, livello] of Object.entries(permessiDefault)) {
      await db.insert(tabelle.permessi_utente).values({ utenteId, modulo, livello });
    }

    return { success: true, passwordTemporanea, username };
  } catch (error: any) {
    console.error('[creaUtenteSpazioAction] Errore:', error);
    return { success: false, error: `Impossibile creare l'utente: ${error.message || error}` };
  }
}

export async function modificaUtenteSpazioAction(
  nomeSchema: string,
  id: number,
  dati: DatiUtente
): Promise<RisultatoOperazioneUtente> {
  try {
    const nome = dati.nome.trim();
    const cognome = dati.cognome.trim();
    const email = dati.email.trim().toLowerCase();

    if (!nome || !cognome) {
      return { success: false, error: 'Nome e cognome sono obbligatori.' };
    }
    if (!dati.aziendeIds || dati.aziendeIds.length === 0) {
      return {
        success: false,
        error: "Seleziona almeno un'azienda su cui questo utente può operare.",
      };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db
      .update(tabelle.utenti_spazio)
      .set({ nome, cognome, email, tipologia: dati.tipologia })
      .where(eq(tabelle.utenti_spazio.id, id));

    // Riscrive le associazioni azienda da zero: più semplice e sicuro di un
    // confronto differenziale, dato il volume atteso (poche aziende per utente).
    await db.delete(tabelle.utenti_aziende).where(eq(tabelle.utenti_aziende.utenteId, id));
    for (const aziendaId of dati.aziendeIds) {
      await db.insert(tabelle.utenti_aziende).values({ utenteId: id, aziendaId });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[modificaUtenteSpazioAction] Errore:', error);
    return { success: false, error: `Impossibile modificare l'utente: ${error.message || error}` };
  }
}

async function impostaStatoUtente(
  nomeSchema: string,
  id: number,
  attivo: boolean
): Promise<RisultatoOperazioneUtente> {
  try {
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.update(tabelle.utenti_spazio).set({ attivo }).where(eq(tabelle.utenti_spazio.id, id));
    return { success: true };
  } catch (error: any) {
    console.error('[impostaStatoUtente] Errore:', error);
    return { success: false, error: `Impossibile aggiornare lo stato: ${error.message || error}` };
  }
}

export async function disabilitaUtenteSpazioAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneUtente> {
  return impostaStatoUtente(nomeSchema, id, false);
}

export async function riattivaUtenteSpazioAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneUtente> {
  return impostaStatoUtente(nomeSchema, id, true);
}

/** Rigenera la password temporanea di un utente (stesso principio già usato per l'Admin di Spazio). */
export async function rigeneraPasswordUtenteAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneUtente> {
  try {
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const passwordTemporanea = generaPasswordTemporanea();
    const passwordHash = await bcrypt.hash(passwordTemporanea, 10);

    const risultato = await db
      .update(tabelle.utenti_spazio)
      .set({ passwordHash, passwordTemporanea })
      .where(eq(tabelle.utenti_spazio.id, id))
      .returning({ id: tabelle.utenti_spazio.id });

    if (risultato.length === 0) {
      return { success: false, error: 'Utente non trovato.' };
    }

    return { success: true, passwordTemporanea };
  } catch (error: any) {
    console.error('[rigeneraPasswordUtenteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile rigenerare la password: ${error.message || error}`,
    };
  }
}
