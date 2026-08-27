'use server';

// Creazione reale di uno Spazio di Lavoro: collega una licenza operativa a
// una licenza commerciale esistente (tabella `licenze`, gestita da
// ModuloLicenza.tsx — una licenza commerciale può governare 1 o più spazi),
// provisiona lo schema Postgres isolato, e crea contestualmente l'Admin di
// Spazio con una password temporanea.
//
// SQL diretto tramite il Pool di src/lib/db.ts per le tabelle di sistema
// (spazi, licenze_spazio), coerente con licenze/sessioni/indici/parametri_sistema.

import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { provisionaSchemaSpazio, creaAdminSpazio } from '@/db/provision';
import { assicuraTabelleSpazi, assicuraIndiceAdminSpazio } from '@/db/ensureTables';
import { contaSpaziPerLicenza, getLicenzaPerId } from '@/app/actions/licenze';
import { RUOLI_ADMIN_SPAZIO, type RuoloAdminSpazio } from '@/lib/ruoliAdminSpazio';
import { generaSlug } from '@/lib/slug';
import { generaUsernameUnivoco, usernameEsisteGlobale } from '@/lib/generaUsername';
import { richiedeCambioPassword as valutaCambioPassword } from '@/lib/passwordTemporanea';

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface CreaSpazioInput {
  descrizione: string;
  licenzaCommercialeId: string; // id_licenza della licenza commerciale scelta
  tier: 'MICRO' | 'PMI' | 'HOLDING' | 'CUSTOM';
  maxUtenti: number;
  maxAziende: number;
  dataScadenza?: string | null; // formato YYYY-MM-DD, opzionale
  /** Funzioni plus, non incluse nella licenza base — partono tutte false se non specificate. */
  tipoSpazio?: 'ENTE' | 'NON_ENTE';
  giudicante?: boolean;
  admin: {
    nome: string;
    cognome: string;
    email: string;
    ruolo: RuoloAdminSpazio;
    cellulare: string;
  };
}

export interface SpazioConLicenza {
  id: number;
  codice: string;
  descrizione: string;
  stato: string;
  createdAt: string;
  nomeSchema: string | null;
  schemaProvisionato: boolean;
  chiaveLicenza: string;
  licenzaCommercialeId: string | null;
  ragioneSocialeLicenzaCommerciale: string | null;
  tier: string;
  statoLicenza: string;
  maxUtenti: number;
  maxAziende: number;
  dataScadenza: string | null;
  plusDatiSettore: boolean;
  plusSimulazione: boolean;
  plusRelazioneAi: boolean;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  giudicante: boolean;
}

/**
 * Genera un codice spazio "parlante": incorpora la descrizione (es.
 * "STUDIOROSSI-2026-001" invece di un progressivo opaco come "WP-2026-002"),
 * così è riconoscibile a colpo d'occhio da chi lo copia/incolla per
 * comunicarlo altrove. Progressivo scoped per slug+anno, non globale: due
 * clienti diversi possono avere entrambi un "-001" senza collidere.
 */
async function generaCodiceSpazio(descrizione: string): Promise<string> {
  const anno = new Date().getFullYear();
  const slug = generaSlug(descrizione, 16);
  const prefisso = `${slug}-${anno}-`;

  const risultato = await pool.query(
    `SELECT codice FROM spazi WHERE codice LIKE $1 ORDER BY codice DESC LIMIT 1`,
    [`${prefisso}%`]
  );

  let prossimoProgressivo = 1;
  if (risultato.rows.length > 0) {
    const ultimoCodice = risultato.rows[0].codice as string; // es. "STUDIOROSSI-2026-007"
    const ultimoProgressivo = parseInt(ultimoCodice.slice(prefisso.length), 10);
    if (!Number.isNaN(ultimoProgressivo)) {
      prossimoProgressivo = ultimoProgressivo + 1;
    }
  }

  return `${prefisso}${String(prossimoProgressivo).padStart(3, '0')}`;
}

function generaPasswordTemporanea(): string {
  // Leggibile e digitabile a mano (l'admin dovrà trascriverla al primo accesso),
  // ma con entropia sufficiente: 12 caratteri da un alfabeto ampio.
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let risultato = '';
  for (let i = 0; i < 12; i++) {
    risultato += alfabeto.charAt(crypto.randomInt(alfabeto.length));
  }
  return risultato;
}

export async function creaSpazioAction(
  data: CreaSpazioInput
): Promise<ActionResult & { codice?: string; passwordTemporanea?: string; username?: string }> {
  try {
    await assicuraTabelleSpazi();

    const descrizione = (data.descrizione || '').trim();
    const admin = data.admin;

    if (!descrizione) {
      return { success: false, error: 'La descrizione dello spazio è obbligatoria.' };
    }
    if (!data.licenzaCommercialeId) {
      return {
        success: false,
        error: 'Seleziona una licenza commerciale a cui collegare lo spazio.',
      };
    }
    if (!data.maxUtenti || data.maxUtenti < 1) {
      return { success: false, error: 'Il numero massimo di utenti deve essere almeno 1.' };
    }
    if (!data.maxAziende || data.maxAziende < 1) {
      return { success: false, error: 'Il numero massimo di aziende deve essere almeno 1.' };
    }

    // Funzioni plus: non più una scelta diretta alla creazione dello
    // spazio — ereditate dalla licenza commerciale scelta, nel momento
    // in cui la si sceglie. Restano modificabili sul singolo spazio dopo
    // (Manutenzione Spazi), se serve scostarsi da quanto la licenza
    // prevede di norma.
    const licenzaRis = await pool.query(
      `SELECT plus_dati_settore, plus_simulazione, plus_relazione_ai FROM licenze WHERE id_licenza = $1`,
      [data.licenzaCommercialeId]
    );
    const plusDaLicenza = licenzaRis.rows[0] || {
      plus_dati_settore: false,
      plus_simulazione: false,
      plus_relazione_ai: false,
    };
    if (!admin?.nome?.trim() || !admin?.cognome?.trim()) {
      return { success: false, error: "Nome e cognome dell'Admin di Spazio sono obbligatori." };
    }
    // L'email NON è più la chiave di login (lo è lo username generato da
    // nome.cognome): niente più controllo formale bloccante sul suo
    // formato, ed è ammesso riusarla su più spazi. Resta un semplice dato
    // di contatto, facoltativo.
    if (!admin?.cellulare?.trim()) {
      return {
        success: false,
        error:
          "Il numero di cellulare dell'Admin di Spazio è obbligatorio (serve per l'OTP di sicurezza).",
      };
    }
    if (!RUOLI_ADMIN_SPAZIO.includes(admin.ruolo)) {
      return { success: false, error: 'Ruolo in azienda non valido.' };
    }

    // Verifica capienza e stato della licenza commerciale scelta.
    const licenzaCommerciale = await getLicenzaPerId(data.licenzaCommercialeId);
    if (!licenzaCommerciale) {
      return { success: false, error: 'Licenza commerciale non trovata.' };
    }
    if (licenzaCommerciale.stato !== 'ATTIVA') {
      return {
        success: false,
        error: `La licenza commerciale "${licenzaCommerciale.ragione_sociale}" non è attiva (stato: ${licenzaCommerciale.stato}): non può essere collegata a un nuovo spazio.`,
      };
    }
    const spaziEsistenti = await contaSpaziPerLicenza(data.licenzaCommercialeId);
    if (spaziEsistenti >= licenzaCommerciale.max_spazi) {
      return {
        success: false,
        error: `La licenza commerciale "${licenzaCommerciale.ragione_sociale}" ha già raggiunto il limite di ${licenzaCommerciale.max_spazi} spazi. Aumenta il limite o scegli un'altra licenza.`,
      };
    }

    // Identità di login: username "nome.cognome" (+cifre in caso di
    // omonimia), univoco su tutta la piattaforma. Generato PRIMA di creare
    // qualunque cosa — così due Admin con la stessa email non si
    // sovrascrivono più (era il bug: l'indice, con l'email come chiave,
    // faceva "sparire" il primo). L'unicità è garantita dal generatore.
    await assicuraIndiceAdminSpazio();
    const usernameAdmin = await generaUsernameUnivoco(
      admin.nome.trim(),
      admin.cognome.trim(),
      (u) => usernameEsisteGlobale(pool, u)
    );

    const client = await pool.connect();
    try {
      const codice = await generaCodiceSpazio(descrizione);
      const chiaveLicenzaOperativa = `OP-${codice}`;

      await client.query('BEGIN');

      const spazioInserito = await client.query(
        `INSERT INTO spazi (codice, descrizione, tipo_spazio, giudicante) VALUES ($1, $2, $3, $4) RETURNING id`,
        [codice, descrizione, data.tipoSpazio || 'NON_ENTE', data.giudicante || false]
      );
      const spazioId = spazioInserito.rows[0].id;

      await client.query(
        `INSERT INTO licenze_spazio
           (spazio_id, licenza_commerciale_id, chiave_licenza, tier, max_utenti, max_aziende, data_scadenza, plus_dati_settore, plus_simulazione, plus_relazione_ai)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          spazioId,
          data.licenzaCommercialeId,
          chiaveLicenzaOperativa,
          data.tier,
          data.maxUtenti,
          data.maxAziende,
          data.dataScadenza || null,
          plusDaLicenza.plus_dati_settore,
          plusDaLicenza.plus_simulazione,
          plusDaLicenza.plus_relazione_ai,
        ]
      );

      await client.query('COMMIT');

      // Provisioning dello schema isolato + creazione Admin di Spazio: FUORI
      // dalla transazione appena chiusa, perché usano il client Drizzle (per
      // le tabelle per-tenant — vedi la nota architetturale in
      // src/db/schema.ts) invece del Pool grezzo usato sopra. Se qualcosa
      // fallisce qui, lo spazio resta comunque creato: non lo perdiamo, ma va
      // segnalato chiaramente.
      try {
        const nomeSchema = await provisionaSchemaSpazio(codice);
        await pool.query(
          'UPDATE spazi SET nome_schema = $1, schema_provisionato = true WHERE id = $2',
          [nomeSchema, spazioId]
        );

        const passwordTemporanea = generaPasswordTemporanea();
        const passwordHash = await bcrypt.hash(passwordTemporanea, 10);
        const codiceConvalida = crypto.randomBytes(6).toString('hex');

        await creaAdminSpazio(nomeSchema, {
          nome: admin.nome.trim(),
          cognome: admin.cognome.trim(),
          username: usernameAdmin,
          email: (admin.email || '').trim().toLowerCase(),
          cellulare: admin.cellulare.trim(),
          passwordHash,
          passwordTemporanea,
          codiceConvalida,
        });

        // Indicizzazione username -> schema: senza questo, il login non
        // saprebbe in quale schema isolato cercare le credenziali di questo
        // username (vedi eseguiAutenticazione in actions/auth.ts). Chiave
        // sull'username: nessuna sovrascrittura possibile tra spazi.
        await assicuraIndiceAdminSpazio();
        await pool.query(
          `INSERT INTO admin_spazio_index (username, email, nome_schema, spazio_id, codice_spazio)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, nome_schema = EXCLUDED.nome_schema, spazio_id = EXCLUDED.spazio_id, codice_spazio = EXCLUDED.codice_spazio`,
          [usernameAdmin, (admin.email || '').trim().toLowerCase(), nomeSchema, spazioId, codice]
        );

        revalidatePath('/superadmin/Spazi');
        return { success: true, codice, passwordTemporanea, username: usernameAdmin };
      } catch (erroreProvisioning: any) {
        console.error(
          '[creaSpazioAction] Spazio creato ma provisioning schema/admin fallito:',
          erroreProvisioning
        );
        revalidatePath('/superadmin/Spazi');
        return {
          success: true,
          codice,
          error: `Spazio creato, ma il provisioning dello schema o la creazione dell'Admin di Spazio sono falliti: ${erroreProvisioning.message || erroreProvisioning}. Riprova il provisioning dalla lista spazi; l'Admin andrà creato manualmente se il problema persiste.`,
        };
      }
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[creaSpazioAction] Errore durante la creazione dello spazio:', error);
      return {
        success: false,
        error: `Errore durante la scrittura sul database: ${error.message || error}`,
      };
    } finally {
      client.release();
    }
  } catch (erroreGenerale: any) {
    // Rete di sicurezza finale: qualunque cosa non gestita nei blocchi sopra
    // (compresi assicuraTabelleSpazi, getLicenzaPerId, contaSpaziPerLicenza,
    // se in futuro cambiano) finisce comunque qui invece di uscire come
    // throw non gestito — che Next.js maschererebbe in produzione con un
    // messaggio generico, esattamente il problema già risolto altrove.
    console.error(
      '[creaSpazioAction] Errore imprevisto non gestito nei blocchi interni:',
      erroreGenerale
    );
    return {
      success: false,
      error: `Errore imprevisto durante la creazione dello spazio: ${erroreGenerale.message || erroreGenerale}`,
    };
  }
}

/** Riprova il provisioning dello schema per uno spazio già esistente ma non ancora provisionato. */
export async function riprovaProvisioningAction(
  spazioId: number,
  codice: string
): Promise<ActionResult> {
  try {
    const nomeSchema = await provisionaSchemaSpazio(codice);
    await pool.query(
      'UPDATE spazi SET nome_schema = $1, schema_provisionato = true WHERE id = $2',
      [nomeSchema, spazioId]
    );
    revalidatePath('/superadmin/Spazi');
    return { success: true };
  } catch (error: any) {
    console.error('[riprovaProvisioningAction] Errore:', error);
    return { success: false, error: `Provisioning fallito: ${error.message || error}` };
  }
}

// ============================================================================
// "Salvagente": il superadmin entra in uno spazio come rete di sicurezza
// dell'admin di spazio, senza sostituire la propria sessione di
// autenticazione (resta autenticato come superadmin) — solo un contesto di
// navigazione aggiuntivo, salvato in un cookie separato, che indica quale
// spazio sta ispezionando in questo momento.
// ============================================================================

const COOKIE_SPAZIO_ISPEZIONE = 'spazio_ispezione';

export interface ContestoIspezione {
  spazioId: number;
  codice: string;
  descrizione: string;
  nomeSchema: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  giudicante: boolean;
}

export async function entraComeSalvagenteAction(spazioId: number): Promise<ActionResult> {
  try {
    const { cookies } = await import('next/headers');

    const risultato = await pool.query(
      'SELECT id, codice, descrizione, nome_schema, schema_provisionato, tipo_spazio, giudicante FROM spazi WHERE id = $1',
      [spazioId]
    );

    if (risultato.rows.length === 0) {
      return { success: false, error: 'Spazio non trovato.' };
    }

    const spazio = risultato.rows[0];
    if (!spazio.schema_provisionato || !spazio.nome_schema) {
      return {
        success: false,
        error: 'Lo schema di questo spazio non è ancora provisionato: impossibile entrare.',
      };
    }

    const contesto: ContestoIspezione = {
      spazioId: spazio.id,
      codice: spazio.codice,
      descrizione: spazio.descrizione,
      nomeSchema: spazio.nome_schema,
      tipoSpazio: spazio.tipo_spazio || 'NON_ENTE',
      giudicante: spazio.giudicante || false,
    };

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_SPAZIO_ISPEZIONE, JSON.stringify(contesto), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 ore, come la sessione di autenticazione
    });

    return { success: true };
  } catch (error: any) {
    console.error('[entraComeSalvagenteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile entrare nello spazio: ${error.message || error}`,
    };
  }
}

export async function esciDaSalvagenteAction(): Promise<ActionResult> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_SPAZIO_ISPEZIONE);
  return { success: true };
}

export async function ottieniContestoIspezione(): Promise<ContestoIspezione | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_SPAZIO_ISPEZIONE)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ContestoIspezione;
  } catch {
    return null;
  }
}

export interface RisultatoElencoSpazi {
  success: boolean;
  spazi: SpazioConLicenza[];
  error?: string;
}

/**
 * IMPORTANTE: restituisce l'esito, non lo lancia. Next.js maschera in
 * produzione QUALSIASI errore lanciato (throw) da una Server Action con un
 * messaggio generico ("An error occurred in the Server Components
 * render..."), indipendentemente dal messaggio scritto nel throw — il
 * try/catch interno da solo non basta, il messaggio leggibile non arriva
 * mai al client. L'unico modo per mostrare un errore comprensibile è non
 * lanciarlo: restituirlo come dato normale, che il chiamante legge da
 * risultato.error invece che da un catch.
 */
export async function ottieniSpaziAction(): Promise<RisultatoElencoSpazi> {
  try {
    await assicuraTabelleSpazi();
    const risultato = await pool.query(`
      SELECT
        s.id, s.codice, s.descrizione, s.stato, s.created_at,
        s.nome_schema, s.schema_provisionato, s.tipo_spazio, s.giudicante,
        l.chiave_licenza, l.licenza_commerciale_id, l.tier, l.stato AS stato_licenza,
        l.max_utenti, l.max_aziende, l.data_scadenza,
        l.plus_dati_settore, l.plus_simulazione, l.plus_relazione_ai,
        lc.ragione_sociale AS ragione_sociale_licenza_commerciale
      FROM spazi s
      LEFT JOIN licenze_spazio l ON l.spazio_id = s.id
      LEFT JOIN licenze lc ON lc.id_licenza = l.licenza_commerciale_id
      ORDER BY s.created_at DESC
    `);

    const spazi = risultato.rows.map((r) => ({
      id: r.id,
      codice: r.codice,
      descrizione: r.descrizione,
      stato: r.stato,
      createdAt: r.created_at,
      nomeSchema: r.nome_schema,
      schemaProvisionato: r.schema_provisionato,
      tipoSpazio: r.tipo_spazio || 'NON_ENTE',
      giudicante: r.giudicante || false,
      chiaveLicenza: r.chiave_licenza,
      licenzaCommercialeId: r.licenza_commerciale_id,
      ragioneSocialeLicenzaCommerciale: r.ragione_sociale_licenza_commerciale,
      tier: r.tier,
      statoLicenza: r.stato_licenza,
      maxUtenti: r.max_utenti,
      maxAziende: r.max_aziende,
      dataScadenza: r.data_scadenza,
      plusDatiSettore: r.plus_dati_settore || false,
      plusSimulazione: r.plus_simulazione || false,
      plusRelazioneAi: r.plus_relazione_ai || false,
    }));

    return { success: true, spazi };
  } catch (error: any) {
    console.error('[ottieniSpaziAction] Errore durante la lettura degli spazi:', error);
    return {
      success: false,
      spazi: [],
      error: `Impossibile caricare l'elenco degli spazi: ${error.message || error}`,
    };
  }
}

export interface AnagraficaSpazioInput {
  descrizione: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  giudicante: boolean;
}

/**
 * Prima azione che rende manutenibile l'anagrafica di uno spazio dopo la
 * creazione — prima non esisteva nessuna scrittura utente su questa
 * tabella, solo aggiornamenti interni del provisioning. Il tipo
 * (ENTE/NON_ENTE) condiziona a cascata i limiti di ricevibilità (una
 * sola soglia invece di N categorie) e il feedback sulla Proposta —
 * vedi i relativi moduli. Giudicante è predisposto ma non ancora
 * operativo altrove nel codice.
 */
/**
 * Elimina UNO spazio per intero — schema tenant, e tutte le tabelle
 * globali collegate. Molto più mirata dell'azzeramento completo (che
 * elimina TUTTO): serve per non dover "far esplodere" l'intero
 * database solo per ripulire un singolo spazio di test creato per
 * errore o con impostazioni sbagliate (es. tipo ENTE/NON_ENTE scelto
 * male in fase di test, prima che una correzione a monte impedisse di
 * ripeterlo — una correzione al codice non cambia retroattivamente i
 * dati già creati).
 *
 * licenze_spazio, admin_spazio_index, utente_spazio_index hanno già
 * ON DELETE CASCADE verso spazi(id) — si puliscono da sole quando la
 * riga in spazi viene eliminata. sessioni no (nessun FK dichiarato,
 * solo workspace_id): va ripulita esplicitamente, o resterebbero
 * sessioni orfane che puntano a uno spazio che non esiste più.
 * IRREVERSIBILE — la conferma forte (scrivere il codice esatto dello
 * spazio) sta nell'interfaccia, non qui.
 */
export async function eliminaSpazioCompletoAction(spazioId: number): Promise<ActionResult> {
  try {
    const spazioRis = await pool.query(`SELECT nome_schema FROM spazi WHERE id = $1`, [spazioId]);
    if (spazioRis.rows.length === 0) {
      return { success: false, error: 'Spazio non trovato.' };
    }
    const nomeSchema = spazioRis.rows[0].nome_schema;

    if (nomeSchema) {
      await pool.query(`DROP SCHEMA IF EXISTS "${nomeSchema.replace(/"/g, '""')}" CASCADE`);
    }
    await pool.query(`DELETE FROM public.sessioni WHERE workspace_id = $1`, [spazioId]);
    // Il DELETE su spazi fa scattare la CASCADE già dichiarata sulle
    // altre tabelle globali collegate — non serve ripeterla qui.
    await pool.query(`DELETE FROM public.spazi WHERE id = $1`, [spazioId]);

    return { success: true };
  } catch (error: any) {
    console.error('[eliminaSpazioCompletoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare lo spazio: ${error.message || error}`,
    };
  }
}

export async function aggiornaAnagraficaSpazioAction(
  spazioId: number,
  dati: AnagraficaSpazioInput
): Promise<ActionResult> {
  try {
    const descrizione = (dati.descrizione || '').trim();
    if (!descrizione) {
      return { success: false, error: 'La descrizione dello spazio è obbligatoria.' };
    }
    if (dati.tipoSpazio !== 'ENTE' && dati.tipoSpazio !== 'NON_ENTE') {
      return { success: false, error: 'Tipo spazio non valido.' };
    }
    await assicuraTabelleSpazi();
    const aggiornata = await pool.query(
      `UPDATE spazi SET descrizione = $2, tipo_spazio = $3, giudicante = $4 WHERE id = $1`,
      [spazioId, descrizione, dati.tipoSpazio, dati.giudicante]
    );
    if (aggiornata.rowCount === 0) {
      return { success: false, error: 'Spazio non trovato.' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaAnagraficaSpazioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare l'anagrafica dello spazio: ${error.message || error}`,
    };
  }
}

/**
 * Elenco leggero degli spazi selezionabili subito dopo il login del
 * superadmin (combo "dashboard operativa o spazio da ispezionare"). Solo
 * gli spazi con schema già provisionato: un admin non può "entrare" in uno
 * spazio il cui schema non esiste ancora (stessa regola già applicata in
 * entraComeSalvagenteAction).
 */
export interface SpazioPerScelta {
  id: number;
  codice: string;
  descrizione: string;
}

export async function ottieniSpaziPerScelta(): Promise<SpazioPerScelta[]> {
  try {
    await assicuraTabelleSpazi();
    const risultato = await pool.query(
      `SELECT id, codice, descrizione FROM spazi WHERE schema_provisionato = true ORDER BY descrizione ASC`
    );
    return risultato.rows.map((r) => ({ id: r.id, codice: r.codice, descrizione: r.descrizione }));
  } catch (error: any) {
    console.error('[ottieniSpaziPerScelta] Errore:', error);
    // Non blocchiamo il login per questo: se la lista non si carica, il
    // superadmin va comunque alla propria dashboard.
    return [];
  }
}

export interface RisultatoNuovaPassword {
  success: boolean;
  passwordTemporanea?: string;
  error?: string;
}

/**
 * Rigenera la password temporanea di un Admin di Spazio già esistente.
 * Necessaria perché la password mostrata alla creazione viene vista una
 * sola volta: se si perde (o se l'admin è stato creato prima che questo
 * pulsante esistesse), prima non c'era alcun modo di recuperarla.
 */
export async function rigeneraPasswordAdminSpazioAction(
  nomeSchema: string,
  adminId: number
): Promise<RisultatoNuovaPassword> {
  try {
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const passwordTemporanea = generaPasswordTemporanea();
    const passwordHash = await bcrypt.hash(passwordTemporanea, 10);

    const risultato = await db
      .update(tabelle.admin_workspace)
      .set({ passwordHash, passwordTemporanea })
      .where(eq(tabelle.admin_workspace.id, adminId))
      .returning({ id: tabelle.admin_workspace.id });

    if (risultato.length === 0) {
      return { success: false, error: 'Admin non trovato in questo spazio.' };
    }

    return { success: true, passwordTemporanea };
  } catch (error: any) {
    console.error('[rigeneraPasswordAdminSpazioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile rigenerare la password: ${error.message || error}`,
    };
  }
}

/**
 * Il superadmin (in manutenzione dello spazio) modifica l'email di contatto
 * di un Admin di Spazio. L'email NON è più la chiave di login (lo è lo
 * username), quindi cambiarla è un'operazione sicura: non tocca né
 * l'identità di accesso né l'indice di login. Aggiorna anche la copia
 * dell'email nell'indice globale, per coerenza della diagnostica per-email.
 */
export async function aggiornaEmailAdminAction(
  nomeSchema: string,
  adminId: number,
  nuovaEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const email = (nuovaEmail || '').trim().toLowerCase();
    // Nessun controllo formale bloccante (era proprio il vincolo da cui ci
    // si voleva liberare); si rifiuta solo il vuoto per non perdere il dato.
    if (!email) {
      return { success: false, error: "Indica un'email di contatto." };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const aggiornato = await db
      .update(tabelle.admin_workspace)
      .set({ email })
      .where(eq(tabelle.admin_workspace.id, adminId))
      .returning({ username: tabelle.admin_workspace.username });

    if (aggiornato.length === 0) {
      return { success: false, error: 'Admin non trovato in questo spazio.' };
    }

    // Allinea l'email nell'indice globale (per lo username di questo admin).
    const username = aggiornato[0].username;
    if (username) {
      await pool.query('UPDATE admin_spazio_index SET email = $1 WHERE username = $2', [
        email,
        username,
      ]);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaEmailAdminAction] Errore:', error);
    // Violazione di unicità email per-schema (un altro admin nello stesso
    // schema ha già quell'email): messaggio chiaro invece del codice grezzo.
    if (error?.code === '23505') {
      return {
        success: false,
        error: 'Un altro Admin di questo spazio usa già questa email.',
      };
    }
    return { success: false, error: `Impossibile aggiornare l'email: ${error.message || error}` };
  }
}

/**
 * L'Admin di Spazio imposta la propria password definitiva, sostituendo
 * quella temporanea (di creazione o di rigenerazione). Da qui in poi il
 * login userà questa; passwordTemporanea torna a NULL, quindi il layout
 * non forzerà più il passaggio da questa pagina.
 */
export async function impostaNuovaPasswordAdminAction(
  nomeSchema: string,
  adminId: number,
  nuovaPassword: string
): Promise<RisultatoNuovaPassword> {
  try {
    if (!nuovaPassword || nuovaPassword.length < 8) {
      return { success: false, error: 'La nuova password deve contenere almeno 8 caratteri.' };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const passwordHash = await bcrypt.hash(nuovaPassword, 10);

    const risultato = await db
      .update(tabelle.admin_workspace)
      .set({ passwordHash, passwordTemporanea: null })
      .where(eq(tabelle.admin_workspace.id, adminId))
      .returning({ id: tabelle.admin_workspace.id });

    if (risultato.length === 0) {
      return { success: false, error: 'Admin non trovato in questo spazio.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[impostaNuovaPasswordAdminAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile impostare la nuova password: ${error.message || error}`,
    };
  }
}

/**
 * Come impostaNuovaPasswordAdminAction, ma per un Utente
 * Operativo/Consultatore (tabella utenti_spazio invece di admin_workspace).
 */
export async function impostaNuovaPasswordUtenteAction(
  nomeSchema: string,
  utenteId: number,
  nuovaPassword: string
): Promise<RisultatoNuovaPassword> {
  try {
    if (!nuovaPassword || nuovaPassword.length < 8) {
      return { success: false, error: 'La nuova password deve contenere almeno 8 caratteri.' };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const passwordHash = await bcrypt.hash(nuovaPassword, 10);

    const risultato = await db
      .update(tabelle.utenti_spazio)
      .set({ passwordHash, passwordTemporanea: null })
      .where(eq(tabelle.utenti_spazio.id, utenteId))
      .returning({ id: tabelle.utenti_spazio.id });

    if (risultato.length === 0) {
      return { success: false, error: 'Utente non trovato in questo spazio.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[impostaNuovaPasswordUtenteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile impostare la nuova password: ${error.message || error}`,
    };
  }
}

export interface AdminSpazio {
  id: number;
  nome: string;
  cognome: string;
  username: string | null;
  email: string;
  cellulare: string;
}

export interface RisultatoAdminSpazio {
  success: boolean;
  admins: AdminSpazio[];
  error?: string;
}

/**
 * Legge gli Admin di Spazio realmente presenti nello schema isolato di uno
 * spazio — la verifica concreta che "l'admin esiste davvero", non solo
 * un'affermazione. Non restituisce passwordHash/passwordTemporanea/
 * codiceConvalida: il superadmin vede chi esiste, non le sue credenziali.
 */
export async function ottieniAdminSpazio(nomeSchema: string): Promise<RisultatoAdminSpazio> {
  try {
    // Auto-riparazione: garantisce la colonna username (e la valorizza) su
    // questo schema anche se creato prima della 0.109 e mai passato dal
    // backfill del login (es. superadmin in salvagente).
    const { backfillUsernameSchema } = await import('@/db/ensureTables');
    await backfillUsernameSchema(nomeSchema);

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db
      .select({
        id: tabelle.admin_workspace.id,
        nome: tabelle.admin_workspace.nome,
        cognome: tabelle.admin_workspace.cognome,
        username: tabelle.admin_workspace.username,
        email: tabelle.admin_workspace.email,
        cellulare: tabelle.admin_workspace.cellulare,
      })
      .from(tabelle.admin_workspace);

    return { success: true, admins: righe };
  } catch (error: any) {
    console.error('[ottieniAdminSpazio] Errore durante la lettura degli admin:', error);
    return {
      success: false,
      admins: [],
      error: `Impossibile leggere gli admin di questo spazio: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Diagnosi e riparazione dell'indice email → schema per gli Admin di
// Spazio (admin_spazio_index). Serve per il caso in cui l'indice punti
// allo schema sbagliato — es. una stessa email usata per due Admin in
// due spazi diversi: l'indice (chiave primaria su email, unica su tutta
// la piattaforma) finisce per puntare a uno solo dei due, "nascondendo"
// l'altro al login anche se il suo account esiste ancora intatto nel
// proprio schema. La creazione di un nuovo spazio ora blocca questo
// caso in anticipo (vedi creaSpazioAction) — questi strumenti servono
// per i casi già successi prima di quel controllo.
// ============================================================================

export interface SpazioConEmailAdmin {
  nomeSchema: string;
  spazioId: number;
  codiceSpazio: string;
  descrizioneSpazio: string;
  puntatoDaIndice: boolean;
}

/** Cerca un'email in TUTTI gli schemi tenant (non solo il primo trovato,
 * a differenza di cercaERiparaIndiceAdmin usata al login) — mostra ogni
 * spazio dove quell'email è un Admin, e quale di questi è attualmente
 * quello puntato dall'indice globale. */
export async function diagnosticaEmailAdminAction(
  email: string
): Promise<{ success: boolean; spazi: SpazioConEmailAdmin[]; error?: string }> {
  try {
    const emailNormalizzata = email.trim().toLowerCase();
    if (!emailNormalizzata) return { success: false, spazi: [], error: "Indica un'email." };

    await assicuraIndiceAdminSpazio();
    const indiceRis = await pool.query(
      'SELECT nome_schema FROM admin_spazio_index WHERE email = $1',
      [emailNormalizzata]
    );
    const schemaPuntatoOra: string | null = indiceRis.rows[0]?.nome_schema || null;

    const schemiRisultato = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'`
    );

    const trovati: SpazioConEmailAdmin[] = [];
    for (const riga of schemiRisultato.rows) {
      const nomeSchema = riga.schema_name as string;
      if (!/^[a-z0-9_]+$/.test(nomeSchema)) continue;

      let presente;
      try {
        presente = await pool.query(
          `SELECT email FROM "${nomeSchema}".admin_workspace WHERE email = $1`,
          [emailNormalizzata]
        );
      } catch {
        continue;
      }
      if (presente.rows.length === 0) continue;

      const spazioRis = await pool.query(
        'SELECT id, codice, descrizione FROM spazi WHERE nome_schema = $1',
        [nomeSchema]
      );
      if (spazioRis.rows.length === 0) continue;

      trovati.push({
        nomeSchema,
        spazioId: spazioRis.rows[0].id,
        codiceSpazio: spazioRis.rows[0].codice,
        descrizioneSpazio: spazioRis.rows[0].descrizione,
        puntatoDaIndice: nomeSchema === schemaPuntatoOra,
      });
    }

    return { success: true, spazi: trovati };
  } catch (error: any) {
    console.error('[diagnosticaEmailAdminAction] Errore:', error);
    return {
      success: false,
      spazi: [],
      error: `Impossibile diagnosticare: ${error.message || error}`,
    };
  }
}

/** Fa puntare esplicitamente l'indice a UNO dei due (o più) spazi
 * trovati — l'unico spazio scelto sarà raggiungibile con quell'email al
 * login, gli altri restano con l'account intatto ma non raggiungibile
 * finché non gli si cambia email (nessuna email può essere condivisa
 * tra due Admin di Spazio contemporaneamente, per design). */
export async function riparaIndiceAdminAction(
  email: string,
  nomeSchemaScelto: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const emailNormalizzata = email.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(nomeSchemaScelto)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    await assicuraIndiceAdminSpazio();
    // Garantisce/valorizza lo username sullo schema scelto (la chiave
    // dell'indice è lo username dalla 0.109).
    const { backfillUsernameSchema } = await import('@/db/ensureTables');
    await backfillUsernameSchema(nomeSchemaScelto);

    const presente = await pool.query(
      `SELECT username, email FROM "${nomeSchemaScelto}".admin_workspace WHERE email = $1`,
      [emailNormalizzata]
    );
    if (presente.rows.length === 0) {
      return { success: false, error: 'Questa email non risulta admin in quello spazio.' };
    }
    const username = presente.rows[0].username;
    if (!username) {
      return {
        success: false,
        error: 'Nome utente non disponibile per questo admin: riprova dopo aver aperto lo spazio.',
      };
    }

    const spazioRis = await pool.query('SELECT id, codice FROM spazi WHERE nome_schema = $1', [
      nomeSchemaScelto,
    ]);
    if (spazioRis.rows.length === 0) {
      return { success: false, error: 'Spazio non trovato.' };
    }

    // Chiave dell'indice: lo username. Ripunta l'indice di questo username
    // allo schema scelto (l'email resta solo come dato di contatto).
    await pool.query(
      `INSERT INTO admin_spazio_index (username, email, nome_schema, spazio_id, codice_spazio)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, nome_schema = EXCLUDED.nome_schema, spazio_id = EXCLUDED.spazio_id, codice_spazio = EXCLUDED.codice_spazio`,
      [
        username,
        emailNormalizzata,
        nomeSchemaScelto,
        spazioRis.rows[0].id,
        spazioRis.rows[0].codice,
      ]
    );

    return { success: true };
  } catch (error: any) {
    console.error('[riparaIndiceAdminAction] Errore:', error);
    return { success: false, error: `Impossibile riparare: ${error.message || error}` };
  }
}

// ============================================================================
// Accesso al Pannello Spazio: valido sia per il superadmin in modalità
// salvagente (cookie di ispezione) sia per un vero Admin di Spazio
// autenticato con la propria sessione. Un solo punto di verifica, usato dal
// layout del pannello — non due implementazioni parallele per due tipi di
// accesso allo stesso posto.
// ============================================================================

export type LivelloPermesso = 'NESSUNO' | 'LETTURA' | 'SCRITTURA';

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

export async function ottieniContestoAccessoSpazio(
  codice: string
): Promise<ContestoAccessoSpazio | null> {
  try {
    // 1. Modalità salvagente (superadmin in ispezione)
    const contestoIspezione = await ottieniContestoIspezione();
    if (contestoIspezione && contestoIspezione.codice === codice) {
      return { ...contestoIspezione, modalita: 'SALVAGENTE' };
    }

    // 2. Sessione reale di un Admin di Spazio
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    if (!token) return null;

    const risultato = await pool.query(
      `SELECT s.ruolo, s.email, s.username, sp.id AS spazio_id, sp.codice, sp.descrizione, sp.nome_schema,
              sp.tipo_spazio, sp.giudicante
       FROM sessioni s
       JOIN spazi sp ON sp.id = s.workspace_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );

    if (risultato.rows.length === 0) return null;
    const riga = risultato.rows[0];
    if (riga.ruolo !== 'USER' || riga.codice !== codice) return null;

    // Garantisce la colonna username su questo schema prima di leggerla
    // (schemi creati prima della 0.109). Idempotente e memoizzato.
    {
      const { backfillUsernameSchema } = await import('@/db/ensureTables');
      await backfillUsernameSchema(riga.nome_schema);
    }

    // Verifica se questa email è l'Admin di Spazio di questo schema. Se sì,
    // nessuna restrizione di permessi (l'Admin non è mai ristretto).
    let adminId: number | undefined;
    let adminEmail: string | undefined;
    let richiedeCambioPassword = false;
    let eAdmin = false;
    // Identità della sessione: username (chiave di login dalla 0.109). Le
    // sessioni create prima del deploy hanno solo l'email: le si onora come
    // fallback finché non scadono.
    if (riga.username || riga.email) {
      const { db } = await import('@/db/client');
      const { getTabelleTenant } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const tabelle = getTabelleTenant(riga.nome_schema);
      const condAdmin = riga.username
        ? eq(tabelle.admin_workspace.username, riga.username)
        : eq(tabelle.admin_workspace.email, riga.email);
      const adminRighe = await db
        .select({
          id: tabelle.admin_workspace.id,
          email: tabelle.admin_workspace.email,
          passwordTemporanea: tabelle.admin_workspace.passwordTemporanea,
        })
        .from(tabelle.admin_workspace)
        .where(condAdmin)
        .limit(1);
      if (adminRighe.length > 0) {
        eAdmin = true;
        adminId = adminRighe[0].id;
        adminEmail = adminRighe[0].email || undefined;
        richiedeCambioPassword = valutaCambioPassword(adminRighe[0].passwordTemporanea);
      }
    }

    if (eAdmin) {
      return {
        spazioId: riga.spazio_id,
        codice: riga.codice,
        descrizione: riga.descrizione,
        nomeSchema: riga.nome_schema,
        modalita: 'ADMIN_SPAZIO',
        adminId,
        email: adminEmail ?? riga.email,
        richiedeCambioPassword,
        tipoSpazio: riga.tipo_spazio || 'NON_ENTE',
        giudicante: riga.giudicante || false,
      };
    }

    // Non è l'Admin: verifica se è un Operatore/Consultatore, e se sì
    // risolve i suoi permessi per modulo e le aziende consentite — la
    // STESSA fonte che userà anche la sidebar per filtrare le voci
    // visibili e il controllo d'accesso di ogni pagina, per non avere due
    // posti diversi (e potenzialmente disallineati) che decidono cosa un
    // utente può fare.
    if (riga.username || riga.email) {
      const { db } = await import('@/db/client');
      const { getTabelleTenant } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const tabelle = getTabelleTenant(riga.nome_schema);

      const condUtente = riga.username
        ? eq(tabelle.utenti_spazio.username, riga.username)
        : eq(tabelle.utenti_spazio.email, riga.email);
      const utenteRighe = await db.select().from(tabelle.utenti_spazio).where(condUtente).limit(1);

      if (utenteRighe.length > 0) {
        const utenteId = utenteRighe[0].id;

        const permessiRighe = await db
          .select()
          .from(tabelle.permessi_utente)
          .where(eq(tabelle.permessi_utente.utenteId, utenteId));
        const permessi: Record<string, LivelloPermesso> = {};
        for (const p of permessiRighe) permessi[p.modulo] = p.livello as LivelloPermesso;

        const aziendeRighe = await db
          .select()
          .from(tabelle.utenti_aziende)
          .where(eq(tabelle.utenti_aziende.utenteId, utenteId));
        const aziendeConsentite = aziendeRighe.map((a) => a.aziendaId);

        return {
          spazioId: riga.spazio_id,
          codice: riga.codice,
          descrizione: riga.descrizione,
          nomeSchema: riga.nome_schema,
          modalita: 'OPERATORE',
          utenteId,
          email: utenteRighe[0].email || undefined,
          richiedeCambioPassword: valutaCambioPassword(utenteRighe[0].passwordTemporanea),
          permessi,
          aziendeConsentite,
          tipoSpazio: riga.tipo_spazio || 'NON_ENTE',
          giudicante: riga.giudicante || false,
        };
      }
    }

    // Nessun Admin né Utente trovato per questa email in questo schema:
    // sessione incoerente (es. utente cancellato dopo il login).
    return null;
  } catch (error) {
    console.error('[ottieniContestoAccessoSpazio] Errore:', error);
    return null;
  }
}
