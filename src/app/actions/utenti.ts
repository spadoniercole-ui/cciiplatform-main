'use server';

// Gestione Utenti (Operativo/Consultatore) all'interno di uno spazio,
// associabili a una o più aziende — "quando creerà gli utenti prima avrà
// creato l'azienda e, all'interno della stessa funzione, gli utenti ad
// essa designati" (dall'analisi funzionale). Distinti dall'Admin di Spazio
// (admin_workspace): questi utenti non hanno ancora un proprio login reale
// — è il prossimo passo naturale una volta che questa gestione esiste.

import { PASSWORD_DA_CAMBIARE } from '@/lib/passwordTemporanea';
import { messaggioErrore, richiediAccessoSchema } from '@/lib/autorizzazione';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { assicuraTabelleUtenti } from '@/db/provision';
import { generaUsernameUnivoco, usernameEsisteGlobale } from '@/lib/generaUsername';
import { chiudiSessioniUtente } from '@/lib/sessione';
import { pool } from '@/lib/db';
import {
  livelloAziendaValido,
  normalizzaLivelloAzienda,
  type LivelloAzienda,
} from '@/lib/permessiAzienda';
import { componiPermessiUtente, type TipologiaProfilo } from '@/lib/profiliUtente';
import { MODULI_PERMESSO, type LivelloPermesso, type Modulo } from '@/lib/moduliPermesso';

export type TipologiaUtente = 'OPERATIVO' | 'CONSULTATORE';

/** L'utente e il livello che ha su una singola azienda (0.255.14). */
export interface AssegnazioneAzienda {
  id: number;
  livello: LivelloAzienda;
  /**
   * Le funzioni scelte per QUESTA azienda (0.256.1): modulo → livello. Se un
   * modulo non compare, per quell'azienda valgono il permesso di modulo e il
   * tetto dell'associazione.
   */
  permessi: Partial<Record<Modulo, LivelloPermesso>>;
}

export interface UtenteSpazio {
  id: number;
  nome: string;
  cognome: string;
  username: string | null;
  email: string;
  tipologia: TipologiaUtente;
  attivo: boolean;
  aziendeIds: number[];
  /** Le stesse aziende con il livello di ciascuna: è qui che vive la profilatura. */
  aziende: AssegnazioneAzienda[];
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
  /** L'utente appena creato: la schermata mostra subito le sue funzioni. */
  utenteId?: number;
}

export interface DatiUtente {
  nome: string;
  cognome: string;
  email: string;
  tipologia: TipologiaUtente;
  aziendeIds: number[];
  /**
   * Il livello scelto per ogni azienda. Se manca si conserva quello già
   * registrato (modifica) oppure vale «lettura e scrittura» (nuova
   * associazione), che è il comportamento delle associazioni vecchie.
   */
  livelli?: Record<number, LivelloAzienda>;
  /**
   * I flag delle funzioni scelti dall'Admin. Se mancano valgono quelli del
   * profilo (Operatore/Consultatore): è lì che nasce cosa può fare l'utente.
   */
  permessi?: Partial<Record<Modulo, LivelloPermesso>>;
  /**
   * Le funzioni per singola azienda (0.256.1): aziendaId → modulo → livello.
   * È la scelta che vince sui permessi di modulo quando l'utente lavora su
   * quell'azienda. Per il Consultatore la scrittura non esiste: qualunque
   * livello diverso da «NESSUNO» viene registrato come sola lettura.
   */
  permessiAzienda?: Record<number, Partial<Record<Modulo, LivelloPermesso>>>;
}

/**
 * I livelli per modulo accettabili per un profilo: il Consultatore legge e
 * basta. La regola sta qui, non solo nell'interfaccia: un livello di scrittura
 * inviato dal browser per un Consultatore non deve diventare un permesso.
 */
function livelloConsentito(tipologia: TipologiaUtente, livello: LivelloPermesso): LivelloPermesso {
  if (livello !== 'NESSUNO' && livello !== 'LETTURA' && livello !== 'SCRITTURA') return 'NESSUNO';
  if (tipologia === 'CONSULTATORE' && livello === 'SCRITTURA') return 'LETTURA';
  return livello;
}

/** Il livello da scrivere per un'azienda: scelto, altrimenti quello di prima. */
function livelloDaScrivere(
  dati: DatiUtente,
  aziendaId: number,
  precedente?: unknown
): LivelloAzienda {
  const scelto = dati.livelli?.[aziendaId];
  if (livelloAziendaValido(scelto)) return scelto;
  return precedente === undefined ? 'SCRITTURA' : normalizzaLivelloAzienda(precedente);
}

/** utenteId → aziendaId → modulo → livello. */
type MappaPermessiAzienda = Record<
  number,
  Record<number, Partial<Record<Modulo, LivelloPermesso>>>
>;

/**
 * Le funzioni per azienda di tutti gli utenti dello spazio, in una lettura
 * sola (0.256.1). La tabella arriva con questa versione: su uno schema non
 * ancora migrato la mappa è vuota e la schermata mostra i soli permessi di
 * modulo, come prima.
 */
async function leggiPermessiAziendaUtenti(nomeSchema: string): Promise<MappaPermessiAzienda> {
  const mappa: MappaPermessiAzienda = {};
  try {
    const righe = (
      await pool.query(
        `SELECT utente_id, azienda_id, modulo, livello FROM "${nomeSchema}".permessi_azienda_utente`
      )
    ).rows as { utente_id: number; azienda_id: number; modulo: string; livello: string }[];
    for (const r of righe) {
      const utenteId = Number(r.utente_id);
      const aziendaId = Number(r.azienda_id);
      mappa[utenteId] = mappa[utenteId] ?? {};
      mappa[utenteId][aziendaId] = {
        ...(mappa[utenteId][aziendaId] ?? {}),
        [r.modulo]: r.livello as LivelloPermesso,
      };
    }
  } catch {
    // Tabella non ancora creata: nessuna scelta per azienda.
  }
  return mappa;
}

/**
 * Scrive le funzioni scelte per azienda. Solo i moduli inviati vengono
 * toccati: un modulo assente dal payload resta com'era, così chi cambia una
 * funzione non deve rimandare tutte le altre.
 */
async function scriviPermessiAzienda(
  nomeSchema: string,
  utenteId: number,
  tipologia: TipologiaUtente,
  permessiAzienda: DatiUtente['permessiAzienda']
): Promise<void> {
  if (!permessiAzienda) return;
  for (const [azienda, livelli] of Object.entries(permessiAzienda)) {
    for (const modulo of MODULI_PERMESSO) {
      const grezzo = livelli?.[modulo];
      if (grezzo === undefined) continue;
      const livello = livelloConsentito(tipologia, grezzo);
      await pool.query(
        `INSERT INTO "${nomeSchema}".permessi_azienda_utente (utente_id, azienda_id, modulo, livello)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (utente_id, azienda_id, modulo) DO UPDATE SET livello = EXCLUDED.livello`,
        [utenteId, Number(azienda), modulo, livello]
      );
    }
  }
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
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleUtenti(nomeSchema);
    // Garantisce/valorizza lo username per gli operatori creati prima della
    // 0.109 (idempotente e memoizzato per processo).
    const { backfillUsernameSchema } = await import('@/db/ensureTables');
    await backfillUsernameSchema(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righeUtenti = await db.select().from(tabelle.utenti_spazio);
    const righeAssociazioni = await db.select().from(tabelle.utenti_aziende);
    const permessiPerAzienda = await leggiPermessiAziendaUtenti(nomeSchema);

    const utenti: UtenteSpazio[] = righeUtenti.map((u) => {
      const aziende: AssegnazioneAzienda[] = righeAssociazioni
        .filter((a) => a.utenteId === u.id)
        .map((a) => ({
          id: a.aziendaId,
          livello: normalizzaLivelloAzienda(a.livello),
          permessi: permessiPerAzienda[u.id]?.[a.aziendaId] ?? {},
        }));
      return {
        id: u.id,
        nome: u.nome,
        cognome: u.cognome,
        username: u.username ?? null,
        email: u.email,
        tipologia: u.tipologia as TipologiaUtente,
        attivo: u.attivo,
        aziendeIds: aziende.map((a) => a.id),
        aziende,
      };
    });

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
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
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
        passwordTemporanea: PASSWORD_DA_CAMBIARE,
      })
      .returning({ id: tabelle.utenti_spazio.id });

    const utenteId = inserito[0].id;

    for (const aziendaId of dati.aziendeIds) {
      await db
        .insert(tabelle.utenti_aziende)
        .values({ utenteId, aziendaId, livello: livelloDaScrivere(dati, aziendaId) });
    }

    // Le funzioni scelte azienda per azienda: sono quelle che i controlli
    // d'accesso leggono quando l'utente lavora su quell'azienda.
    await scriviPermessiAzienda(nomeSchema, utenteId, dati.tipologia, dati.permessiAzienda);

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

    // Le funzioni partono dal profilo scelto (Operatore o Consultatore) e
    // dalle eventuali scelte già fatte dall'Admin nella schermata: la gestione
    // dello spazio (Aziende/Utenti/Parametri) resta fuori, è dell'Admin di
    // Spazio. Modificabili subito dopo dall'Admin, flag per flag.
    const permessiProfilo = componiPermessiUtente(
      dati.tipologia as TipologiaProfilo,
      dati.permessi
    );
    for (const [modulo, livello] of Object.entries(permessiProfilo)) {
      await db.insert(tabelle.permessi_utente).values({ utenteId, modulo, livello });
    }

    return { success: true, passwordTemporanea, username, utenteId };
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
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
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
    // Prima si leggono i livelli già assegnati: chi modifica un utente da qui
    // (associa o rimuove un'azienda) non deve azzerare la profilatura delle
    // altre aziende, che si cambia nel suo selettore.
    const esistenti = await db
      .select()
      .from(tabelle.utenti_aziende)
      .where(eq(tabelle.utenti_aziende.utenteId, id));
    const livelliPrecedenti = new Map(esistenti.map((r) => [r.aziendaId, r.livello]));

    await db.delete(tabelle.utenti_aziende).where(eq(tabelle.utenti_aziende.utenteId, id));
    for (const aziendaId of dati.aziendeIds) {
      await db.insert(tabelle.utenti_aziende).values({
        utenteId: id,
        aziendaId,
        livello: livelloDaScrivere(dati, aziendaId, livelliPrecedenti.get(aziendaId)),
      });
    }

    // Le funzioni delle aziende tolte non vanno lasciate appese: se un domani
    // l'azienda tornasse assegnata, il permesso tornerebbe con lei — e non è
    // quello che l'Admin ha appena deciso.
    await assicuraTabelleUtenti(nomeSchema);
    await pool.query(
      `DELETE FROM "${nomeSchema}".permessi_azienda_utente
        WHERE utente_id = $1 AND azienda_id <> ALL($2::int[])`,
      [id, dati.aziendeIds]
    );
    await scriviPermessiAzienda(nomeSchema, id, dati.tipologia, dati.permessiAzienda);

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
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const esito = await impostaStatoUtente(nomeSchema, id, false);
    if (esito.success) {
      // Un utente disabilitato non deve restare collegato con una sessione già aperta.
      const utente = await pool.query(
        `SELECT username, email FROM "${contesto.nomeSchema}".utenti_spazio WHERE id = $1`,
        [id]
      );
      if (utente.rows[0]) await chiudiSessioniUtente(contesto.spazioId, utente.rows[0]);
    }
    return esito;
  } catch (error) {
    return { success: false, error: messaggioErrore(error, 'Operazione non riuscita.') };
  }
}

/**
 * Il livello di un utente su UNA azienda (0.255.14): è la profilatura
 * dell'associazione, distinta dai permessi per modulo. Solo l'Admin di Spazio
 * la cambia, e solo per un'azienda a cui l'utente è già associato.
 */
export async function impostaLivelloAziendaAction(
  nomeSchema: string,
  utenteId: number,
  aziendaId: number,
  livello: LivelloAzienda
): Promise<RisultatoOperazioneUtente> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!livelloAziendaValido(livello)) {
      return { success: false, error: 'Livello non valido: sola lettura o lettura e scrittura.' };
    }
    await assicuraTabelleUtenti(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const aggiornate = await db
      .update(tabelle.utenti_aziende)
      .set({ livello })
      .where(
        and(
          eq(tabelle.utenti_aziende.utenteId, Number(utenteId)),
          eq(tabelle.utenti_aziende.aziendaId, Number(aziendaId))
        )
      )
      .returning({ id: tabelle.utenti_aziende.id });

    if (aggiornate.length === 0) {
      return { success: false, error: 'Questo utente non è associato all’azienda.' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaLivelloAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare il livello: ${error.message || error}`,
    };
  }
}

/**
 * Le funzioni di un utente SU UNA AZIENDA (0.256.1).
 *
 * È la schermata Utenti a decidere, azienda per azienda, che cosa quella
 * persona legge e che cosa scrive: la scelta vale da subito nei controlli
 * d'accesso. Il Consultatore non può avere la scrittura, e la regola si
 * applica qui, non solo nell'interfaccia.
 */
export async function impostaPermessiAziendaUtenteAction(
  nomeSchema: string,
  utenteId: number,
  aziendaId: number,
  permessi: Partial<Record<Modulo, LivelloPermesso>>
): Promise<RisultatoOperazioneUtente> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (Object.keys(permessi).length === 0) {
      return { success: false, error: 'Nessuna funzione da salvare.' };
    }
    await assicuraTabelleUtenti(nomeSchema);

    const utente = await pool.query(
      `SELECT tipologia FROM "${nomeSchema}".utenti_spazio WHERE id = $1`,
      [Number(utenteId)]
    );
    if (utente.rows.length === 0) return { success: false, error: 'Utente non trovato.' };

    const associazione = await pool.query(
      `SELECT id FROM "${nomeSchema}".utenti_aziende WHERE utente_id = $1 AND azienda_id = $2`,
      [Number(utenteId), Number(aziendaId)]
    );
    if (associazione.rows.length === 0) {
      return { success: false, error: 'Questo utente non è associato all’azienda.' };
    }

    await scriviPermessiAzienda(
      nomeSchema,
      Number(utenteId),
      utente.rows[0].tipologia as TipologiaUtente,
      { [Number(aziendaId)]: permessi }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: messaggioErrore(error, 'Funzioni non salvate.') };
  }
}

export async function riattivaUtenteSpazioAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneUtente> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
  } catch (error) {
    return { success: false, error: messaggioErrore(error, 'Operazione non autorizzata.') };
  }
  return impostaStatoUtente(nomeSchema, id, true);
}

/** Rigenera la password temporanea di un utente (stesso principio già usato per l'Admin di Spazio). */
export async function rigeneraPasswordUtenteAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneUtente> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const passwordTemporanea = generaPasswordTemporanea();
    const passwordHash = await bcrypt.hash(passwordTemporanea, 10);

    const risultato = await db
      .update(tabelle.utenti_spazio)
      .set({ passwordHash, passwordTemporanea: PASSWORD_DA_CAMBIARE })
      .where(eq(tabelle.utenti_spazio.id, id))
      .returning({
        id: tabelle.utenti_spazio.id,
        username: tabelle.utenti_spazio.username,
        email: tabelle.utenti_spazio.email,
      });

    if (risultato.length === 0) {
      return { success: false, error: 'Utente non trovato.' };
    }
    await chiudiSessioniUtente(contesto.spazioId, risultato[0]);

    return { success: true, passwordTemporanea };
  } catch (error: any) {
    console.error('[rigeneraPasswordUtenteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile rigenerare la password: ${error.message || error}`,
    };
  }
}
