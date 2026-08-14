'use server';

// Login reale del sistema. Sostituisce il precedente meccanismo che, ad ogni
// accesso superadmin riuscito, impostava SEMPRE la stessa stringa costante
// ('TOKEN_GHOST_SUPERADMIN_SYSTEM') come token di sessione: chiunque avesse
// letto il codice sorgente poteva autenticarsi come superadmin senza
// conoscere alcuna password, semplicemente impostando quel cookie a mano.
// Ora ogni login genera un token casuale univoco, salvato in DB (tabella
// `sessioni`, vedi src/db/sql/sessioni.sql) con scadenza, verificabile e
// revocabile da un logout reale.

import { getTabelleTenant } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';

const DURATA_SESSIONE_ORE = 8;

export interface WorkspaceDinamico {
  id: string;
  name: string;
  type: 'system' | 'tenant';
}

/** Confronto a tempo costante, per non rivelare via timing quanti caratteri della password sono corretti. */
function confrontoSicuro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Confronta comunque con un buffer della stessa lunghezza per non
    // rivelare la lunghezza corretta tramite un fallimento immediato.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function creaSessione(
  ruolo: 'SUPERADMIN' | 'USER',
  workspaceId: number | null,
  email?: string,
  username?: string
) {
  const { assicuraTabellaSessioni } = await import('@/db/ensureTables');
  await assicuraTabellaSessioni();

  const token = crypto.randomBytes(32).toString('hex');
  const scadenza = new Date(Date.now() + DURATA_SESSIONE_ORE * 60 * 60 * 1000);

  // Identità della sessione: lo username (chiave di login). L'email resta
  // memorizzata solo per la visualizzazione (tracciamento azioni).
  await pool.query(
    'INSERT INTO sessioni (token, ruolo, workspace_id, email, username, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [token, ruolo, workspaceId, email || null, username || null, scadenza]
  );

  const cookieStore = await cookies();
  cookieStore.set('session_token', token, {
    httpOnly: true,
    // Secure solo in produzione E non nell'edizione portable: la portable
    // gira su http://127.0.0.1 (HTTP semplice), e un cookie Secure verrebbe
    // scartato dal browser su HTTP, impedendo il login (loop sulla pagina
    // di accesso). In cloud (Vercel, HTTPS) resta Secure.
    secure: process.env.NODE_ENV === 'production' && process.env.PORTABLE !== '1',
    sameSite: 'lax',
    path: '/',
    expires: scadenza,
  });
}

interface SchemaAdminTrovato {
  nomeSchema: string;
  spazioId: number;
  codiceSpazio: string;
}

/**
 * Cerca uno USERNAME tra gli admin_workspace di TUTTI gli schemi tenant e,
 * se lo trova, ripara l'indice globale al volo (fallback difensivo: il
 * backfill in fase di login popola già l'indice, ma questa scansione copre
 * anche i casi in cui l'indice fosse rimasto disallineato). La prossima
 * volta il login lo troverà subito, senza ripetere la scansione.
 */
async function cercaERiparaIndiceAdmin(username: string): Promise<SchemaAdminTrovato | null> {
  try {
    const schemiRisultato = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'`
    );

    for (const riga of schemiRisultato.rows) {
      const nomeSchema = riga.schema_name as string;
      // Solo nomi già validati dal catalogo di sistema (information_schema),
      // ma per sicurezza si applica comunque un controllo di formato prima
      // di usarlo in una query con lo schema interpolato: pg non permette
      // di parametrizzare nomi di schema/tabella.
      if (!/^[a-z0-9_]+$/.test(nomeSchema)) continue;

      let trovato;
      try {
        trovato = await pool.query(
          `SELECT email FROM "${nomeSchema}".admin_workspace WHERE username = $1`,
          [username]
        );
      } catch {
        continue; // schema senza colonna/tabella: salta e prova il prossimo
      }

      if (trovato.rows.length > 0) {
        const email = (trovato.rows[0].email || '').toLowerCase();
        const spazioResult = await pool.query(
          'SELECT id, codice FROM spazi WHERE nome_schema = $1',
          [nomeSchema]
        );
        if (spazioResult.rows.length === 0) continue;

        const spazioId = spazioResult.rows[0].id;
        const codiceSpazio = spazioResult.rows[0].codice;

        await pool.query(
          `INSERT INTO admin_spazio_index (username, email, nome_schema, spazio_id, codice_spazio)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (username) DO NOTHING`,
          [username, email, nomeSchema, spazioId, codiceSpazio]
        );

        return { nomeSchema, spazioId, codiceSpazio };
      }
    }

    return null;
  } catch (error) {
    console.error('[cercaERiparaIndiceAdmin] Errore durante la scansione degli schemi:', error);
    return null;
  }
}

/**
 * Stessa auto-riparazione di cercaERiparaIndiceAdmin, ma per la tabella
 * utenti_spazio (Operativo/Consultatore), risolvendo per username.
 */
async function cercaERiparaIndiceUtente(username: string): Promise<SchemaAdminTrovato | null> {
  try {
    const schemiRisultato = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'`
    );

    for (const riga of schemiRisultato.rows) {
      const nomeSchema = riga.schema_name as string;
      if (!/^[a-z0-9_]+$/.test(nomeSchema)) continue;

      let trovato;
      try {
        trovato = await pool.query(
          `SELECT email FROM "${nomeSchema}".utenti_spazio WHERE username = $1`,
          [username]
        );
      } catch {
        continue;
      }

      if (trovato.rows.length > 0) {
        const email = (trovato.rows[0].email || '').toLowerCase();
        const spazioResult = await pool.query(
          'SELECT id, codice FROM spazi WHERE nome_schema = $1',
          [nomeSchema]
        );
        if (spazioResult.rows.length === 0) continue;

        const spazioId = spazioResult.rows[0].id;
        const codiceSpazio = spazioResult.rows[0].codice;

        await pool.query(
          `INSERT INTO utente_spazio_index (username, email, nome_schema, spazio_id, codice_spazio)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (username) DO NOTHING`,
          [username, email, nomeSchema, spazioId, codiceSpazio]
        );

        return { nomeSchema, spazioId, codiceSpazio };
      }
    }

    return null;
  } catch (error) {
    console.error('[cercaERiparaIndiceUtente] Errore durante la scansione degli schemi:', error);
    return null;
  }
}

export async function eseguiAutenticazione(utenteInput: any, passwordInput: any) {
  try {
    const utente = String(utenteInput || '').trim();
    const password = String(passwordInput || '');

    if (!utente || !password) {
      return { success: false, error: 'Utente e password sono obbligatori.' };
    }

    // 1. SUPERADMIN DI SISTEMA (unico, a questo stadio del progetto)
    const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'superadmin';
    const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD;

    if (utente === SUPERADMIN_USER) {
      if (!SUPERADMIN_PASSWORD) {
        console.error('SUPERADMIN_PASSWORD non configurata nel server.');
        return { success: false, error: 'Accesso superadmin non configurato sul server.' };
      }
      if (!confrontoSicuro(password, SUPERADMIN_PASSWORD)) {
        return { success: false, error: 'Parola chiave Superadmin errata.' };
      }

      await creaSessione('SUPERADMIN', null);
      return { success: true, role: 'SUPERADMIN', goToChoice: true };
    }

    // 2. ACCESSO ADMIN DI SPAZIO, con password hashata con bcrypt.
    // Ogni Admin di Spazio vive nello schema isolato del proprio spazio
    // (tenant_xxx), non nello schema public: prima si cerca in quale
    // schema si trova questa email (admin_spazio_index, popolato da
    // creaSpazioAction alla creazione), poi si verificano le credenziali
    // in quello schema specifico.
    try {
      const { assicuraIndiceAdminSpazio, assicuraIndiceUtenteSpazio, backfillUsernameGlobale } =
        await import('@/db/ensureTables');
      await assicuraIndiceAdminSpazio();
      await assicuraIndiceUtenteSpazio();
      // Popola gli username mancanti dei dati creati prima della 0.109, così
      // il login per username trova anche gli account preesistenti. Eseguito
      // una sola volta per processo, non blocca in caso di errore.
      await backfillUsernameGlobale();

      // La chiave di login è lo USERNAME (nome.cognome + eventuali cifre),
      // non più l'email: niente controllo formale, nessuna sovrascrittura
      // possibile tra account con la stessa email.
      const username = utente.toLowerCase();

      const indiceAdminRisultato = await pool.query(
        'SELECT nome_schema, spazio_id, codice_spazio FROM admin_spazio_index WHERE username = $1',
        [username]
      );

      const schemaAdmin: SchemaAdminTrovato | null =
        indiceAdminRisultato.rows.length > 0
          ? {
              nomeSchema: indiceAdminRisultato.rows[0].nome_schema,
              spazioId: indiceAdminRisultato.rows[0].spazio_id,
              codiceSpazio: indiceAdminRisultato.rows[0].codice_spazio,
            }
          : await cercaERiparaIndiceAdmin(username);

      if (schemaAdmin) {
        const { db } = await import('@/db/client');
        const tabelleSpazio = getTabelleTenant(schemaAdmin.nomeSchema);

        const utenteDb = await db
          .select()
          .from(tabelleSpazio.admin_workspace)
          .where(eq(tabelleSpazio.admin_workspace.username, username))
          .limit(1);

        if (utenteDb.length > 0) {
          const passwordCorretta = await bcrypt.compare(password, utenteDb[0].passwordHash);
          if (!passwordCorretta) {
            return { success: false, error: 'Credenziali non valide.' };
          }

          await creaSessione(
            'USER',
            schemaAdmin.spazioId,
            (utenteDb[0].email || '').toLowerCase(),
            username
          );
          return {
            success: true,
            role: 'USER',
            goToChoice: false,
            tenantName: schemaAdmin.codiceSpazio,
            tenantId: String(utenteDb[0].id),
          };
        }
      }

      // 3. ACCESSO UTENTE (Operativo/Consultatore), stesso principio ma su
      // utenti_spazio invece di admin_workspace. Un Operatore/Consultatore
      // è soggetto a permessi granulari (permessi_utente, utenti_aziende),
      // letti dalla sidebar e dal controllo d'accesso di ogni pagina.
      const indiceUtenteRisultato = await pool.query(
        'SELECT nome_schema, spazio_id, codice_spazio FROM utente_spazio_index WHERE username = $1',
        [username]
      );

      const schemaUtente: SchemaAdminTrovato | null =
        indiceUtenteRisultato.rows.length > 0
          ? {
              nomeSchema: indiceUtenteRisultato.rows[0].nome_schema,
              spazioId: indiceUtenteRisultato.rows[0].spazio_id,
              codiceSpazio: indiceUtenteRisultato.rows[0].codice_spazio,
            }
          : await cercaERiparaIndiceUtente(username);

      if (!schemaUtente) {
        return { success: false, error: 'Credenziali non valide.' };
      }

      const { db } = await import('@/db/client');
      const tabelleSpazio = getTabelleTenant(schemaUtente.nomeSchema);

      const utenteDb = await db
        .select()
        .from(tabelleSpazio.utenti_spazio)
        .where(eq(tabelleSpazio.utenti_spazio.username, username))
        .limit(1);

      if (utenteDb.length === 0) {
        return { success: false, error: 'Credenziali non valide.' };
      }
      if (!utenteDb[0].attivo) {
        return { success: false, error: 'Utente disabilitato: contatta il tuo Admin di Spazio.' };
      }

      const passwordCorretta = await bcrypt.compare(password, utenteDb[0].passwordHash);
      if (!passwordCorretta) {
        return { success: false, error: 'Credenziali non valide.' };
      }

      await creaSessione(
        'USER',
        schemaUtente.spazioId,
        (utenteDb[0].email || '').toLowerCase(),
        username
      );
      return {
        success: true,
        role: 'USER',
        goToChoice: false,
        tenantName: schemaUtente.codiceSpazio,
        tenantId: String(utenteDb[0].id),
      };
    } catch (dbError: any) {
      console.error('Errore connessione database utenti:', dbError);
      return {
        success: false,
        error: `Database non raggiungibile o non configurato: ${dbError.message || dbError}`,
      };
    }
  } catch (erroreGenerale: any) {
    console.error('Crash critico nella Server Action:', erroreGenerale);
    return {
      success: false,
      error: `Errore interno del server: ${erroreGenerale.message || erroreGenerale}`,
    };
  }
}

/** Invalida la sessione corrente sia sul DB che sul cookie del browser. */
export async function eseguiLogout() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;

    if (token) {
      await pool.query('DELETE FROM sessioni WHERE token = $1', [token]);
    }
    cookieStore.delete('session_token');

    return { success: true };
  } catch (error: any) {
    console.error('[eseguiLogout] Errore:', error);
    // Anche in caso di errore sul DB, il cookie va comunque rimosso: meglio
    // un logout "silenzioso" lato sessione locale che bloccare l'utente
    // fuori da un logout che dovrebbe essere sempre disponibile.
    try {
      const cookieStore = await cookies();
      cookieStore.delete('session_token');
    } catch {
      // Ignorato: se anche questo fallisce, non c'è altro da fare qui.
    }
    return { success: true };
  }
}

export async function ottieniListaWorkspace(): Promise<WorkspaceDinamico[]> {
  return [{ id: 'CENTRAL_CONSOLE', name: '👑 CONSOLE CENTRALE superadmin', type: 'system' }];
}
