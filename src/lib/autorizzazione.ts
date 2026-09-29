// src/lib/autorizzazione.ts
//
// Unico punto di verifica di CHI sta chiamando una server action o una
// route API. Ogni funzione esportata da un file 'use server' è un endpoint
// pubblico: Next.js la rende invocabile da chiunque conosca il suo id (che
// finisce nel bundle JS del browser). Nascondere un pulsante o proteggere
// il layout della pagina NON basta: la verifica va fatta dentro l'azione.
//
// Regole:
//   - l'identità viene SOLO dalla sessione (cookie `session_token` → tabella
//     `sessioni`), mai da parametri passati dal browser;
//   - un `nomeSchema` / `codice` ricevuto dal browser è accettato solo se
//     coincide con lo spazio della sessione (o se chi chiama è il
//     Superadmin, che può operare su qualunque spazio esistente);
//   - il cookie di ispezione (modalità salvagente) contiene solo l'id dello
//     spazio scelto e vale solo insieme a una sessione SUPERADMIN valida.
//
// Modulo neutro (niente 'use server'): può esportare costanti e classi, ed è
// importato da actions, layout e route API.

import { cache } from 'react';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db';
import { richiedeCambioPassword as valutaCambioPassword } from '@/lib/passwordTemporanea';
import type { Modulo, LivelloPermesso } from '@/lib/moduliPermesso';

export const COOKIE_SESSIONE = 'session_token';
export const COOKIE_SPAZIO_ISPEZIONE = 'spazio_ispezione';

const REGEX_SCHEMA_TENANT = /^tenant_[a-z0-9_]+$/;

/** Errore lanciato dalle funzioni `richiedi*`: il messaggio è mostrabile all'utente. */
export class ErroreAutorizzazione extends Error {
  constructor(messaggio = 'Operazione non autorizzata: sessione assente o scaduta.') {
    super(messaggio);
    this.name = 'ErroreAutorizzazione';
  }
}

export interface SessioneValida {
  token: string;
  ruolo: 'SUPERADMIN' | 'USER';
  /** id dello spazio per gli utenti tenant; null per il Superadmin. */
  workspaceId: number | null;
  email: string | null;
  username: string | null;
}

export interface ContestoAccessoSpazio {
  spazioId: number;
  codice: string;
  descrizione: string;
  nomeSchema: string;
  modalita: 'SALVAGENTE' | 'ADMIN_SPAZIO' | 'OPERATORE';
  /** Solo per ADMIN_SPAZIO: id del record admin_workspace, per l'azione di cambio password. */
  adminId?: number;
  /** Solo per OPERATORE: id del record utenti_spazio, per cambio password e risoluzione permessi. */
  utenteId?: number;
  /** Email dell'utente loggato — ADMIN_SPAZIO e OPERATORE, per tracciare azioni sensibili (es. sblocco scenario). */
  email?: string;
  /** true se sta ancora usando una password temporanea da sostituire (ADMIN_SPAZIO o OPERATORE). */
  richiedeCambioPassword?: boolean;
  /** Solo per OPERATORE: permessi per modulo. SALVAGENTE e ADMIN_SPAZIO non sono mai ristretti. */
  permessi?: Record<string, LivelloPermesso>;
  /** Solo per OPERATORE: id delle aziende su cui può operare. */
  aziendeConsentite?: number[];
  /** ENTE cambia a cascata i limiti di ricevibilità (1 sola soglia invece di N categorie) e il feedback sulla Proposta — vedi RicevibilitaManager e PropostaScenario. */
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** Predisposto, non ancora operativo altrove nel codice. */
  giudicante: boolean;
}

export interface RequisitiAccesso {
  /** Solo Admin di Spazio (o Superadmin): gestione utenti, permessi, configurazione. */
  soloAdmin?: boolean;
  /**
   * Per gli Operatori: modulo e livello minimo richiesto. Con un elenco di
   * moduli basta il permesso su uno qualunque (azioni condivise fra passi).
   */
  modulo?: Modulo | readonly Modulo[];
  livello?: 'LETTURA' | 'SCRITTURA';
}

// ---------------------------------------------------------------------------
// Sessione
// ---------------------------------------------------------------------------

/** La sessione valida (non scaduta) del chiamante, oppure null. */
export async function leggiSessione(): Promise<SessioneValida | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_SESSIONE)?.value;
  if (!token) return null;
  return sessionePerToken(token);
}

// Memoizzata per richiesta (React cache): una pagina o un'azione che chiama
// più funzioni protette interroga il database una volta sola.
const sessionePerToken = cache(async (token: string): Promise<SessioneValida | null> => {
  try {
    const ris = await pool.query(
      `SELECT ruolo, workspace_id, email, username FROM sessioni
       WHERE token = $1 AND expires_at > now()`,
      [token]
    );
    if (ris.rows.length === 0) return null;
    const r = ris.rows[0];
    return {
      token,
      ruolo: r.ruolo === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER',
      workspaceId: r.workspace_id ?? null,
      email: r.email ?? null,
      username: r.username ?? null,
    };
  } catch (error) {
    // Tabella sessioni non ancora creata (database vergine): nessuna sessione.
    console.error('[leggiSessione] Errore:', error);
    return null;
  }
});

export async function richiediSessione(): Promise<SessioneValida> {
  const sessione = await leggiSessione();
  if (!sessione) throw new ErroreAutorizzazione();
  return sessione;
}

export async function richiediSuperadmin(): Promise<SessioneValida> {
  const sessione = await richiediSessione();
  if (sessione.ruolo !== 'SUPERADMIN') {
    throw new ErroreAutorizzazione('Operazione riservata al Superadmin.');
  }
  return sessione;
}

// ---------------------------------------------------------------------------
// Spazio (tenant)
// ---------------------------------------------------------------------------

interface RigaSpazio {
  id: number;
  codice: string;
  descrizione: string;
  nome_schema: string;
  schema_provisionato: boolean;
  tipo_spazio: 'ENTE' | 'NON_ENTE' | null;
  giudicante: boolean | null;
}

async function caricaSpazio(
  campo: 'id' | 'codice' | 'nome_schema',
  valore: string | number
): Promise<RigaSpazio | null> {
  const ris = await pool.query(
    `SELECT id, codice, descrizione, nome_schema, schema_provisionato, tipo_spazio, giudicante
     FROM spazi WHERE ${campo} = $1`,
    [valore]
  );
  return ris.rows[0] ?? null;
}

function contestoSalvagente(spazio: RigaSpazio): ContestoAccessoSpazio {
  return {
    spazioId: spazio.id,
    codice: spazio.codice,
    descrizione: spazio.descrizione,
    nomeSchema: spazio.nome_schema,
    modalita: 'SALVAGENTE',
    tipoSpazio: spazio.tipo_spazio || 'NON_ENTE',
    giudicante: spazio.giudicante || false,
  };
}

/** Id dello spazio scelto per l'ispezione, letto dal cookie (anche dal vecchio formato JSON). */
async function leggiSpazioIdIspezione(): Promise<number | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_SPAZIO_ISPEZIONE)?.value;
  if (!raw) return null;
  const diretto = Number(raw);
  if (Number.isInteger(diretto) && diretto > 0) return diretto;
  try {
    const id = Number((JSON.parse(raw) as { spazioId?: unknown }).spazioId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Contesto dell'ispezione in corso (modalità salvagente). Valido solo con una
 * sessione SUPERADMIN attiva; i dati dello spazio sono riletti dal database,
 * mai presi dal cookie.
 */
export async function contestoIspezioneCorrente(): Promise<ContestoAccessoSpazio | null> {
  const spazioId = await leggiSpazioIdIspezione();
  if (!spazioId) return null;
  const sessione = await leggiSessione();
  if (!sessione || sessione.ruolo !== 'SUPERADMIN') return null;
  const spazio = await caricaSpazio('id', spazioId);
  if (!spazio || !spazio.schema_provisionato || !spazio.nome_schema) return null;
  return contestoSalvagente(spazio);
}

/**
 * Contesto di accesso allo spazio `codice` per il chiamante, oppure null se
 * non ha accesso. È la stessa verifica usata dal layout del pannello spazio.
 */
export async function risolviContestoSpazio(codice: string): Promise<ContestoAccessoSpazio | null> {
  return risolviContestoSpazioMemo(codice);
}

const risolviContestoSpazioMemo = cache(async function (
  codice: string
): Promise<ContestoAccessoSpazio | null> {
  try {
    // 1. Modalità salvagente (Superadmin in ispezione)
    const ispezione = await contestoIspezioneCorrente();
    if (ispezione && ispezione.codice === codice) return ispezione;

    // 2. Sessione reale di un utente dello spazio
    const sessione = await leggiSessione();
    if (!sessione || sessione.ruolo !== 'USER' || !sessione.workspaceId) return null;

    const spazio = await caricaSpazio('id', sessione.workspaceId);
    if (!spazio || spazio.codice !== codice || !spazio.nome_schema) return null;
    if (!REGEX_SCHEMA_TENANT.test(spazio.nome_schema)) return null;

    return await contestoUtenteSpazio(sessione, spazio);
  } catch (error) {
    console.error('[risolviContestoSpazio] Errore:', error);
    return null;
  }
});

async function contestoUtenteSpazio(
  sessione: SessioneValida,
  spazio: RigaSpazio
): Promise<ContestoAccessoSpazio | null> {
  if (!sessione.username && !sessione.email) return null;
  const nomeSchema = spazio.nome_schema;

  // Garantisce la colonna username su questo schema prima di leggerla
  // (schemi creati prima della 0.109). Idempotente e memoizzato.
  const { backfillUsernameSchema } = await import('@/db/ensureTables');
  await backfillUsernameSchema(nomeSchema);

  const base = {
    spazioId: spazio.id,
    codice: spazio.codice,
    descrizione: spazio.descrizione,
    nomeSchema,
    tipoSpazio: spazio.tipo_spazio || 'NON_ENTE',
    giudicante: spazio.giudicante || false,
  } as const;

  // Identità della sessione: username (chiave di login dalla 0.109). Le
  // sessioni create prima hanno solo l'email: le si onora come fallback.
  const campo = sessione.username ? 'username' : 'email';
  const valore = sessione.username ?? sessione.email;

  // Admin di Spazio: nessuna restrizione di permessi.
  const admin = await pool.query(
    `SELECT id, email, password_temporanea FROM "${nomeSchema}".admin_workspace
     WHERE ${campo} = $1 LIMIT 1`,
    [valore]
  );
  if (admin.rows.length > 0) {
    return {
      ...base,
      modalita: 'ADMIN_SPAZIO',
      adminId: admin.rows[0].id,
      email: admin.rows[0].email ?? sessione.email ?? undefined,
      richiedeCambioPassword: valutaCambioPassword(admin.rows[0].password_temporanea),
    };
  }

  // Operatore/Consultatore: permessi per modulo e aziende consentite.
  const utente = await pool.query(
    `SELECT id, email, attivo, password_temporanea FROM "${nomeSchema}".utenti_spazio
     WHERE ${campo} = $1 LIMIT 1`,
    [valore]
  );
  if (utente.rows.length === 0) return null;
  // Utente disabilitato dopo il login: la sessione non vale più.
  if (utente.rows[0].attivo === false) return null;
  const utenteId: number = utente.rows[0].id;

  const permessiRis = await pool.query(
    `SELECT modulo, livello FROM "${nomeSchema}".permessi_utente WHERE utente_id = $1`,
    [utenteId]
  );
  const permessi: Record<string, LivelloPermesso> = {};
  for (const p of permessiRis.rows) permessi[p.modulo] = p.livello as LivelloPermesso;

  const aziendeRis = await pool.query(
    `SELECT azienda_id FROM "${nomeSchema}".utenti_aziende WHERE utente_id = $1`,
    [utenteId]
  );

  return {
    ...base,
    modalita: 'OPERATORE',
    utenteId,
    email: utente.rows[0].email ?? undefined,
    richiedeCambioPassword: valutaCambioPassword(utente.rows[0].password_temporanea),
    permessi,
    aziendeConsentite: aziendeRis.rows.map((a: { azienda_id: number }) => a.azienda_id),
  };
}

function verificaRequisiti(contesto: ContestoAccessoSpazio, req: RequisitiAccesso): void {
  if (contesto.modalita !== 'OPERATORE') return; // Admin e Superadmin non sono ristretti
  if (req.soloAdmin) {
    throw new ErroreAutorizzazione('Operazione riservata all’Admin di Spazio.');
  }
  if (req.modulo) {
    const moduli: readonly Modulo[] = typeof req.modulo === 'string' ? [req.modulo] : req.modulo;
    const richiesto = req.livello ?? 'LETTURA';
    const ok = moduli.some((m) => {
      const livello = contesto.permessi?.[m] ?? 'NESSUNO';
      return richiesto === 'LETTURA' ? livello !== 'NESSUNO' : livello === 'SCRITTURA';
    });
    if (!ok) {
      const nomi = moduli.map((m) => `"${NOMI_MODULO[m] ?? m}"`).join(' o ');
      throw new ErroreAutorizzazione(
        richiesto === 'SCRITTURA'
          ? `Permesso in sola lettura: serve il permesso di scrittura sul modulo ${nomi}.`
          : `Nessun permesso sul modulo ${nomi}.`
      );
    }
  }
}

// Etichette mostrate all'utente (la chiave 'report' è il modulo Proposta).
const NOMI_MODULO: Partial<Record<Modulo, string>> = {
  scenari: 'Scenari',
  checklist: 'Check List',
  indici: 'Indici',
  xbrl: 'XBRL',
  report: 'Proposta',
  relazione: 'Relazione',
  simulazione: 'Simulazione',
};

/**
 * Verifica che il chiamante possa operare sullo spazio `codice` e restituisce
 * il contesto (con il `nomeSchema` affidabile, preso dal database).
 */
export async function richiediAccessoSpazio(
  codice: string,
  req: RequisitiAccesso = {}
): Promise<ContestoAccessoSpazio> {
  const sessione = await richiediSessione();
  if (sessione.ruolo === 'SUPERADMIN') {
    const spazio = typeof codice === 'string' ? await caricaSpazio('codice', codice) : null;
    if (!spazio || !spazio.nome_schema) throw new ErroreAutorizzazione('Spazio non trovato.');
    return contestoSalvagente(spazio);
  }
  const contesto = await risolviContestoSpazio(codice);
  if (!contesto) throw new ErroreAutorizzazione('Accesso allo spazio non consentito.');
  verificaRequisiti(contesto, req);
  return contesto;
}

/**
 * Come `richiediAccessoSpazio`, ma partendo dal nome dello schema tenant che
 * molte azioni ricevono come parametro. Rifiuta qualunque schema diverso da
 * quello della sessione: blocca sia l'accesso ai dati di altri spazi sia
 * l'uso del parametro come vettore di SQL injection.
 */
export async function richiediAccessoSchema(
  nomeSchema: string,
  req: RequisitiAccesso = {}
): Promise<ContestoAccessoSpazio> {
  const sessione = await richiediSessione();
  if (typeof nomeSchema !== 'string' || !REGEX_SCHEMA_TENANT.test(nomeSchema)) {
    throw new ErroreAutorizzazione('Spazio non valido.');
  }
  const spazio = await caricaSpazio('nome_schema', nomeSchema);
  if (!spazio) throw new ErroreAutorizzazione('Spazio non trovato.');
  if (sessione.ruolo === 'SUPERADMIN') return contestoSalvagente(spazio);

  const contesto = await risolviContestoSpazio(spazio.codice);
  if (!contesto || contesto.nomeSchema !== nomeSchema) {
    throw new ErroreAutorizzazione('Accesso allo spazio non consentito.');
  }
  verificaRequisiti(contesto, req);
  return contesto;
}

/** Come `richiediAccessoSchema`, partendo dall'id numerico dello spazio. */
export async function richiediAccessoSpazioId(
  spazioId: number,
  req: RequisitiAccesso = {}
): Promise<ContestoAccessoSpazio> {
  const sessione = await richiediSessione();
  const spazio = await caricaSpazio('id', Number(spazioId));
  if (!spazio || !spazio.nome_schema) throw new ErroreAutorizzazione('Spazio non trovato.');
  if (sessione.ruolo === 'SUPERADMIN') return contestoSalvagente(spazio);
  const contesto = await risolviContestoSpazio(spazio.codice);
  if (!contesto) throw new ErroreAutorizzazione('Accesso allo spazio non consentito.');
  verificaRequisiti(contesto, req);
  return contesto;
}

/** Per gli Operatori: verifica che l'azienda sia tra quelle assegnate. */
export function verificaAziendaConsentita(
  contesto: ContestoAccessoSpazio,
  aziendaId: number
): void {
  if (contesto.modalita !== 'OPERATORE') return;
  if (!contesto.aziendeConsentite?.includes(Number(aziendaId))) {
    throw new ErroreAutorizzazione('Azienda non assegnata a questo utente.');
  }
}

/**
 * Accesso a un'azienda dello spazio: per gli Operatori deve essere fra
 * quelle assegnate dall'Admin di Spazio.
 */
export async function richiediAccessoAzienda(
  nomeSchema: string,
  aziendaId: number,
  req: RequisitiAccesso = {}
): Promise<ContestoAccessoSpazio> {
  const contesto = await richiediAccessoSchema(nomeSchema, req);
  verificaAziendaConsentita(contesto, aziendaId);
  return contesto;
}

/**
 * Accesso a uno scenario: per gli Operatori l'azienda dello scenario deve
 * essere fra quelle assegnate. Uno scenario inesistente passa (l'azione
 * risponderà "non trovato" come prima).
 */
export async function richiediAccessoScenario(
  nomeSchema: string,
  scenarioId: number,
  req: RequisitiAccesso = {}
): Promise<ContestoAccessoSpazio> {
  const contesto = await richiediAccessoSchema(nomeSchema, req);
  if (contesto.modalita === 'OPERATORE') {
    await verificaRigaConsentita(contesto, 'scenari', scenarioId);
  }
  return contesto;
}

// Tabelle tenant con una riga riconducibile a un'azienda: colonna diretta
// `azienda_id`, oppure `scenario_id` (e da lì l'azienda dello scenario).
const TABELLE_CON_AZIENDA = {
  scenari: 'azienda_id',
  debiti_ente: 'azienda_id',
  debiti_triage: 'azienda_id',
  debiti_vera: 'azienda_id',
  xbrl_storico_azienda: 'azienda_id',
  proposta_creditori: 'scenario_id',
  posizione_aggiornata: 'scenario_id',
} as const;
export type TabellaConAzienda = keyof typeof TABELLE_CON_AZIENDA;

/**
 * Per gli Operatori: la riga `id` della tabella deve appartenere a
 * un'azienda assegnata. Serve alle azioni che ricevono solo l'id di una
 * riga (modifica/elimina). Una riga inesistente passa.
 */
export async function verificaRigaConsentita(
  contesto: ContestoAccessoSpazio,
  tabella: TabellaConAzienda,
  id: number
): Promise<void> {
  if (contesto.modalita !== 'OPERATORE') return;
  const colonna = TABELLE_CON_AZIENDA[tabella];
  const s = contesto.nomeSchema;
  const sql =
    colonna === 'azienda_id'
      ? `SELECT azienda_id FROM "${s}".${tabella} WHERE id = $1`
      : `SELECT sc.azienda_id FROM "${s}".${tabella} t
           JOIN "${s}".scenari sc ON sc.id = t.scenario_id WHERE t.id = $1`;
  const ris = await pool.query(sql, [Number(id)]);
  if (ris.rows.length === 0) return;
  verificaAziendaConsentita(contesto, ris.rows[0].azienda_id);
}

/** Prefisso del nome dei file caricati: lega il file allo spazio che lo carica. */
export function prefissoFileSpazio(spazioId: number): string {
  return `spazio-${spazioId}-`;
}

/**
 * Un file caricato (URL Vercel Blob o `localblob:` della portable) può essere
 * letto o eliminato da un'azione solo se appartiene allo spazio del
 * chiamante. I file caricati prima di questa regola non hanno il prefisso:
 * restano accettati (il nome contiene un suffisso casuale non indovinabile),
 * ma un file con il prefisso di un ALTRO spazio viene sempre rifiutato.
 */
export function verificaFileDelloSpazio(contesto: ContestoAccessoSpazio, url: string): void {
  const rifiuta = () => {
    throw new ErroreAutorizzazione('File non appartenente a questo spazio.');
  };
  if (typeof url !== 'string' || !url) rifiuta();
  let nome: string;
  if (url.startsWith('localblob:')) {
    const id = url.slice('localblob:'.length);
    if (/[\\/]|\.\./.test(id)) rifiuta();
    nome = id.includes('__') ? id.slice(id.indexOf('__') + 2) : id;
  } else {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return rifiuta();
    }
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.blob.vercel-storage.com')) rifiuta();
    nome = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  }
  const m = /^spazio-(\d+)-/.exec(nome);
  if (m && Number(m[1]) !== contesto.spazioId) rifiuta();
}

/** Messaggio sicuro da restituire al browser per un errore catturato. */
export function messaggioErrore(error: unknown, fallback: string): string {
  if (error instanceof ErroreAutorizzazione) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Route API
// ---------------------------------------------------------------------------

/**
 * Per le route API: null se il chiamante è autorizzato, altrimenti la
 * risposta 401/403 da restituire così com'è.
 */
export async function rifiutaSeNonAutorizzato(
  richiesto: 'SESSIONE' | 'SUPERADMIN'
): Promise<Response | null> {
  const sessione = await leggiSessione();
  if (!sessione) {
    return Response.json({ error: 'Sessione assente o scaduta.' }, { status: 401 });
  }
  if (richiesto === 'SUPERADMIN' && sessione.ruolo !== 'SUPERADMIN') {
    return Response.json({ error: 'Operazione riservata al Superadmin.' }, { status: 403 });
  }
  return null;
}
