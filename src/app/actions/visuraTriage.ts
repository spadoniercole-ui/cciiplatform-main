'use server';

// Visura del triage: trattenuta fino allo screening, poi distrutta.
//
// PERCHÉ ESISTE. La piattaforma elimina sempre i documenti dopo
// l'elaborazione. Applicata alla lettera, quella regola faceva sì che la
// visura caricata nel triage venisse distrutta subito dopo l'estrazione
// dell'anagrafica — e due schermate dopo lo screening la richiedesse di
// nuovo. Un file chiesto due volte nello stesso percorso.
//
// La deroga è circoscritta e dichiarata:
//   - riguarda SOLO la visura, che è un atto pubblico del Registro Imprese,
//     non un documento riservato;
//   - dura il tempo di un passaggio: dalla verifica alla generazione dello
//     screening;
//   - l'eliminazione avviene DENTRO la generazione dello screening, non
//     affidata a una pulizia periodica che qualcuno può dimenticare di
//     configurare.

import { pool } from '@/lib/db';
import { assicuraTabellaAziende } from '@/db/provision';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface VisuraTrattenuta {
  url: string;
  nome: string;
  caricataIl: string;
}

/** Registra la visura appena caricata nel triage. */
export async function registraVisuraTriageAction(
  nomeSchema: string,
  aziendaId: number,
  url: string,
  nome: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaAziende(nomeSchema);
    await pool.query(
      `UPDATE "${nomeSchema}".aziende
          SET visura_triage_url = $2, visura_triage_nome = $3, visura_triage_il = now()
        WHERE id = $1`,
      [aziendaId, url, nome]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[registraVisuraTriageAction] Errore:', error);
    return { success: false, error: `Registrazione non riuscita: ${(error as Error).message}` };
  }
}

/** La visura trattenuta, se c'è. */
export async function ottieniVisuraTriageAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; visura?: VisuraTrattenuta | null; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool
      .query(
        `SELECT visura_triage_url, visura_triage_nome, visura_triage_il
           FROM "${nomeSchema}".aziende WHERE id = $1`,
        [aziendaId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const x = r.rows[0];
    if (!x?.visura_triage_url) return { success: true, visura: null };
    return {
      success: true,
      visura: {
        url: String(x.visura_triage_url),
        nome: String(x.visura_triage_nome ?? 'visura.pdf'),
        caricataIl: x.visura_triage_il
          ? new Date(x.visura_triage_il as string).toISOString()
          : new Date().toISOString(),
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniVisuraTriageAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Dimentica il riferimento alla visura trattenuta.
 *
 * Il file sullo storage viene eliminato dalla generazione dello screening,
 * che lo fa già per ogni documento che riceve. Qui si azzera il riferimento,
 * perché un riferimento a un file eliminato è peggio di nessun riferimento:
 * la schermata direbbe "visura disponibile" e la generazione fallirebbe.
 */
export async function dimenticaVisuraTriageAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(
      `UPDATE "${nomeSchema}".aziende
          SET visura_triage_url = NULL, visura_triage_nome = NULL, visura_triage_il = NULL
        WHERE id = $1`,
      [aziendaId]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[dimenticaVisuraTriageAction] Errore:', error);
    return { success: false, error: `Operazione non riuscita: ${(error as Error).message}` };
  }
}
