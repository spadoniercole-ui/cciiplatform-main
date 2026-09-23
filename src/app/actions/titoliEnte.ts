'use server';

// Titoli di credito dell'ente: lettura, salvataggio con riscontro sulle fonti
// ufficiali (Gazzetta Ufficiale e Normattiva per la norma; sito dell'ente per
// il riferimento interno), precaricamento INPS.
//
// Regola del salvataggio concordata con Ercole (0.109.96):
//   IN_CONTRASTO     -> la riga NON si salva; a schermo il passo trovato;
//   CONFERMATO       -> si salva, e la fonte entra nel registro (prossima tappa);
//   NON_VERIFICABILE -> si salva solo con conferma esplicita, etichetta «da
//                       riscontrare» finche' un riscontro non la chiude.
// Senza chiave AI (portable senza rete) il riscontro e' NON_VERIFICABILE.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { estraiJson } from '@/lib/visura/fatti';
import {
  DOMINI_NORMA,
  RISCONTRO_VUOTO,
  interpretaRiscontro,
  promptRiscontroInterno,
  promptRiscontroNorma,
  validaTitolo,
  type RiscontroFonte,
  type TitoloEnte,
} from '@/lib/titoliEnte/titoli';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 60 * 1000, maxRetries: 1 }) : null;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function daRiga(r: Record<string, unknown>): TitoloEnte {
  return {
    id: Number(r.id),
    codice: String(r.codice),
    atto: String(r.atto ?? ''),
    presuppostoGiuridico: String(r.presupposto_giuridico ?? ''),
    riferimentoInterno: (r.riferimento_interno as string | null) ?? null,
    effettoCalcolo: (r.effetto_calcolo as TitoloEnte['effettoCalcolo']) ?? 'NESSUNO',
    note: (r.note as string | null) ?? null,
    riscontroNorma: (r.riscontro_norma as RiscontroFonte | null) ?? RISCONTRO_VUOTO,
    riscontroInterno: (r.riscontro_interno as RiscontroFonte | null) ?? RISCONTRO_VUOTO,
  };
}

export async function ottieniTitoliEnteAction(
  nomeSchema: string
): Promise<{ success: boolean; titoli: TitoloEnte[]; dominioEnte: string | null; error?: string }> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, titoli: [], dominioEnte: null, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".titoli_ente ORDER BY codice`);
    const c = await pool.query(
      `SELECT dominio_ente FROM "${nomeSchema}".titoli_ente_config WHERE id = 1`
    );
    return {
      success: true,
      titoli: r.rows.map(daRiga),
      dominioEnte: c.rows[0]?.dominio_ente ?? null,
    };
  } catch (error: unknown) {
    console.error('[ottieniTitoliEnteAction]', error);
    return {
      success: false,
      titoli: [],
      dominioEnte: null,
      error: `Impossibile leggere i titoli: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Importa l'anagrafica dei codici dell'ente (codice, descrizione): crea le
 * righe che mancano con la descrizione ufficiale come atto, aggiorna la
 * descrizione di quelle che esistono senza toccare presupposto, riferimento e
 * riscontri gia' fatti. Nessun precaricamento: l'anagrafica e' dell'ente.
 */
export async function importaAnagraficaCodiciAction(
  codiceSpazio: string,
  codici: { codice: string; descrizione: string }[]
): Promise<{ success: boolean; inseriti: number; aggiornati: number; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return {
        success: false,
        inseriti: 0,
        aggiornati: 0,
        error: 'Operazione riservata all’Admin di Spazio.',
      };
    if (codici.length === 0)
      return {
        success: false,
        inseriti: 0,
        aggiornati: 0,
        error: 'Nel file non ci sono righe con Codice e Descrizione.',
      };
    const nomeSchema = contesto.nomeSchema;
    await assicuraTabelleParametriSpazio(nomeSchema);
    let inseriti = 0;
    let aggiornati = 0;
    for (const c of codici) {
      const codice = c.codice.trim().slice(0, 12);
      if (!/^[A-Za-z0-9.\-/]{1,12}$/.test(codice)) continue;
      const r = await pool.query(
        `INSERT INTO "${nomeSchema}".titoli_ente (codice, atto) VALUES ($1, $2)
         ON CONFLICT (codice) DO UPDATE SET atto = CASE WHEN "${nomeSchema}".titoli_ente.atto = '' OR "${nomeSchema}".titoli_ente.atto = '(da precisare)' THEN EXCLUDED.atto ELSE "${nomeSchema}".titoli_ente.atto END, aggiornato_il = now()
         RETURNING (xmax = 0) AS nuovo`,
        [codice, c.descrizione.trim().slice(0, 200)]
      );
      if (r.rows[0]?.nuovo) inseriti += 1;
      else aggiornati += 1;
    }
    return { success: true, inseriti, aggiornati };
  } catch (error: unknown) {
    console.error('[importaAnagraficaCodiciAction]', error);
    return {
      success: false,
      inseriti: 0,
      aggiornati: 0,
      error: `Importazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

async function riscontraSuFonti(prompt: string, domini: string[]): Promise<RiscontroFonte> {
  const adesso = new Date().toISOString();
  if (!anthropic) {
    return {
      ...RISCONTRO_VUOTO,
      esito: 'NON_VERIFICABILE',
      motivo:
        'Riscontro automatico non disponibile in questo ambiente (nessuna chiave AI o nessuna rete).',
      eseguitoIl: adesso,
    };
  }
  try {
    const risposta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      tools: [
        { type: 'web_search_20250305', name: 'web_search', allowed_domains: domini, max_uses: 4 },
      ],
      messages: [{ role: 'user', content: prompt }],
    });
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return interpretaRiscontro(estraiJson(testo), adesso);
  } catch (e) {
    console.error('[riscontraSuFonti]', e);
    return {
      ...RISCONTRO_VUOTO,
      esito: 'NON_VERIFICABILE',
      motivo: 'Fonte non raggiungibile o risposta non interpretabile.',
      eseguitoIl: adesso,
    };
  }
}

export interface EsitoSalvataggioTitolo {
  success: boolean;
  /** true = la riga non e' stata salvata perche' un riscontro e' IN_CONTRASTO. */
  bloccato?: boolean;
  /** true = serve la conferma esplicita: un riscontro e' NON_VERIFICABILE. */
  richiedeConferma?: boolean;
  titolo?: TitoloEnte;
  error?: string;
}

export async function salvaTitoloEnteAction(
  codiceSpazio: string,
  titolo: TitoloEnte,
  opzioni: { confermaNonVerificabile?: boolean } = {}
): Promise<EsitoSalvataggioTitolo> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const nomeSchema = contesto.nomeSchema;
    const errore = validaTitolo(titolo);
    if (errore) return { success: false, error: errore };
    await assicuraTabelleParametriSpazio(nomeSchema);

    const cfg = await pool.query(
      `SELECT dominio_ente FROM "${nomeSchema}".titoli_ente_config WHERE id = 1`
    );
    const dominioEnte: string | null = cfg.rows[0]?.dominio_ente ?? null;
    const precedente = titolo.id
      ? (await pool.query(`SELECT * FROM "${nomeSchema}".titoli_ente WHERE id = $1`, [titolo.id]))
          .rows[0]
      : null;
    const chi = contesto.email ?? contesto.modalita;

    // Riscontro solo su cio' che e' cambiato: un riscontro confermato resta.
    let riscontroNorma: RiscontroFonte = precedente?.riscontro_norma ?? RISCONTRO_VUOTO;
    if (titolo.presuppostoGiuridico.trim()) {
      if (
        !precedente ||
        precedente.presupposto_giuridico !== titolo.presuppostoGiuridico ||
        precedente.atto !== titolo.atto ||
        riscontroNorma.esito === 'NON_ESEGUITO'
      ) {
        riscontroNorma = await riscontraSuFonti(
          promptRiscontroNorma(titolo.presuppostoGiuridico, titolo.atto),
          DOMINI_NORMA
        );
      }
    } else {
      riscontroNorma = RISCONTRO_VUOTO;
    }
    let riscontroInterno: RiscontroFonte = precedente?.riscontro_interno ?? RISCONTRO_VUOTO;
    if (titolo.riferimentoInterno?.trim() && dominioEnte) {
      if (
        !precedente ||
        precedente.riferimento_interno !== titolo.riferimentoInterno ||
        precedente.presupposto_giuridico !== titolo.presuppostoGiuridico ||
        riscontroInterno.esito === 'NON_ESEGUITO'
      ) {
        riscontroInterno = await riscontraSuFonti(
          promptRiscontroInterno(
            titolo.riferimentoInterno,
            titolo.presuppostoGiuridico,
            dominioEnte
          ),
          [dominioEnte]
        );
      }
    } else {
      riscontroInterno = RISCONTRO_VUOTO;
    }

    const proposto: TitoloEnte = { ...titolo, riscontroNorma, riscontroInterno };
    if (riscontroNorma.esito === 'IN_CONTRASTO' || riscontroInterno.esito === 'IN_CONTRASTO') {
      return {
        success: false,
        bloccato: true,
        titolo: proposto,
        error:
          'Il riscontro sulle fonti ufficiali è in contrasto con quanto scritto: la riga non è stata salvata.',
      };
    }
    const daConfermare =
      riscontroNorma.esito === 'NON_VERIFICABILE' || riscontroInterno.esito === 'NON_VERIFICABILE';
    if (daConfermare && !opzioni.confermaNonVerificabile) {
      return { success: false, richiedeConferma: true, titolo: proposto };
    }
    if (riscontroNorma.esito === 'CONFERMATO' && !riscontroNorma.confermatoDa)
      riscontroNorma.confermatoDa = chi;
    if (riscontroInterno.esito === 'CONFERMATO' && !riscontroInterno.confermatoDa)
      riscontroInterno.confermatoDa = chi;

    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".titoli_ente (codice, atto, presupposto_giuridico, riferimento_interno, effetto_calcolo, note, riscontro_norma, riscontro_interno, aggiornato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (codice) DO UPDATE SET atto = $2, presupposto_giuridico = $3, riferimento_interno = $4, effetto_calcolo = $5, note = $6, riscontro_norma = $7, riscontro_interno = $8, aggiornato_il = now()
       RETURNING *`,
      [
        titolo.codice.trim(),
        titolo.atto.trim(),
        titolo.presuppostoGiuridico.trim(),
        titolo.riferimentoInterno?.trim() || null,
        titolo.effettoCalcolo,
        titolo.note?.trim() || null,
        JSON.stringify(riscontroNorma),
        JSON.stringify(riscontroInterno),
      ]
    );
    return { success: true, titolo: daRiga(r.rows[0]) };
  } catch (error: unknown) {
    console.error('[salvaTitoloEnteAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

export async function eliminaTitoloEnteAction(
  codiceSpazio: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    await pool.query(`DELETE FROM "${contesto.nomeSchema}".titoli_ente WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaDominioEnteAction(
  codiceSpazio: string,
  dominio: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const d = dominio
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
      return { success: false, error: 'Indicare un dominio, es. inps.it.' };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".titoli_ente_config (id, dominio_ente) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET dominio_ente = $1`,
      [d]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}
