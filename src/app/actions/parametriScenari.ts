'use server';

// I PARAMETRI DEGLI SCENARI DEL TRIAGE — spese di procedura e percentuali per
// rango (realizzo in liquidazione, soddisfacimento nel cram down).
//
// NESSUN DEFAULT DI PRODOTTO. Le percentuali non stanno nella legge e non sono
// nella piattaforma: le fissa l'ente, che è l'unico a sapere come si comporta
// la propria massa nei due scenari. Una riga vuota è un'ipotesi non
// calcolabile, non uno zero: il report lo dichiara invece di produrre un
// confronto costruito su un numero che nessuno ha scritto.
//
// Solo Admin di spazio: sono parametri che valgono per tutte le aziende.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleScenariTriage } from '@/db/provision';
import Anthropic from '@anthropic-ai/sdk';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import {
  RANGHI,
  validaParametri,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

export interface RisultatoParametri {
  success: boolean;
  parametri?: ParametriScenari;
  error?: string;
}

export async function ottieniParametriScenariAction(
  nomeSchema: string
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenariTriage(nomeSchema);
    const [config, righe] = await Promise.all([
      pool.query(`SELECT costi_procedura_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
    ]);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    return {
      success: true,
      parametri: {
        costiProceduraPct: num(config.rows[0]?.costi_procedura_pct),
        // L'ordine è quello dei ranghi, non quello del database: il report
        // deve leggersi sempre allo stesso modo.
        ranghi: RANGHI.map((r) => {
          const salvata = perRango.get(r.codice);
          return {
            rango: r.codice,
            tassoLiquidazionePct: num(salvata?.tasso_liquidazione_pct),
            cramDownPct: num(salvata?.cram_down_pct),
          };
        }),
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniParametriScenariAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaParametriScenariAction(
  nomeSchema: string,
  parametri: ParametriScenari
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaParametri(parametri);
    if (errore.length > 0) return { success: false, error: errore.join(' ') };

    await assicuraTabelleScenariTriage(nomeSchema);
    const ammessi = new Set<RangoCredito>(RANGHI.map((r) => r.codice));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "${nomeSchema}".parametri_scenari (id, costi_procedura_pct)
         VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET costi_procedura_pct = $1`,
        [parametri.costiProceduraPct]
      );
      for (const r of parametri.ranghi) {
        if (!ammessi.has(r.rango)) return { success: false, error: 'Rango non riconosciuto.' };
        await client.query(
          `INSERT INTO "${nomeSchema}".parametri_scenari_rango
             (rango, tasso_liquidazione_pct, cram_down_pct)
           VALUES ($1, $2, $3)
           ON CONFLICT (rango)
           DO UPDATE SET tasso_liquidazione_pct = $2, cram_down_pct = $3`,
          [r.rango, r.tassoLiquidazionePct, r.cramDownPct]
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return { success: true, parametri };
  } catch (error: unknown) {
    console.error('[salvaParametriScenariAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

export interface FonteSuggerimento {
  titolo: string;
  url: string;
}

export interface SuggerimentoScenari {
  parametri: ParametriScenari;
  note: string;
  fonti: FonteSuggerimento[];
}

/**
 * RICERCA WEB SUI PARAMETRI DEGLI SCENARI (0.168.0).
 *
 * Il pulsante «Cerca sul web» non salva nulla: propone, rango per rango, i
 * valori che la ricerca riesce a documentare e lascia all'ente la decisione.
 * È la differenza fra un parametro dell'ente e un default della piattaforma:
 * il primo lo firma chi conosce la propria massa, il secondo sarebbe un numero
 * di nessuno. Per questo i campi si compilano ma restano modificabili, e la
 * risposta porta le fonti.
 *
 * Se la ricerca non trova nulla di utilizzabile lo dice, invece di restituire
 * zeri: uno zero è un'ipotesi («recupero nullo»), non un'assenza di dato.
 */
export async function cercaParametriScenariWebAction(
  nomeSchema: string
): Promise<{ success: boolean; suggerimento?: SuggerimentoScenari; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };

    const elencoRanghi = RANGHI.map((r) => `- ${r.codice} (${r.etichetta}): ${r.aiuto}`).join('\n');

    const prompt = `Sei un analista della crisi d'impresa. Devi proporre a un ente creditore italiano, con una ricerca web, i valori di due parametri operativi usati nel triage: il tasso di realizzo in una liquidazione giudiziale e la percentuale di soddisfacimento in un cram down omologato, per rango del credito. Cerca fonti italiane autorevoli e recenti: rapporti ISTAT, Banca d'Italia, Ministero della Giustizia, Ordini professionali, osservatori sui fallimenti, prassi dei tribunali. Non inventare e non usare la memoria del modello: ogni valore deve essere riconducibile a una fonte che hai letto.

RANGHI DEL CREDITO (usa esattamente questi codici, tutti, anche quelli senza dato):
${elencoRanghi}

REGOLE:
- Esprimi le percentuali come numeri fra 0 e 100, non come frazioni.
- Se per un rango non trovi un valore documentato, scrivi null: non stimare per simmetria e non copiare il valore di un altro rango.
- Le spese di procedura sono una percentuale sul realizzo lordo; se non le trovi, null.
- Distingui ciò che è un dato osservato da ciò che è una prassi: dillo nella nota.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{
  "costiProceduraPct": number | null,
  "ranghi": [
    { "rango": "PREDEDUCIBILE", "tassoLiquidazionePct": number | null, "cramDownPct": number | null }
  ],
  "note": "2-4 frasi: su quali fonti si basano i valori, quali sono prudenziali e quali mancano",
  "fonti": [ { "titolo": "...", "url": "https://..." } ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2500,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });

    const testo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const pulito = testo.replace(/```json|```/g, '').trim();
    const inizio = pulito.indexOf('{');
    const fine = pulito.lastIndexOf('}');
    let grezzo: Record<string, unknown> | null = null;
    if (inizio >= 0 && fine > inizio) {
      try {
        const parsed: unknown = JSON.parse(pulito.slice(inizio, fine + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          grezzo = parsed as Record<string, unknown>;
      } catch {
        grezzo = null;
      }
    }
    if (!grezzo) {
      return {
        success: false,
        error:
          'La ricerca web non ha restituito un risultato leggibile. Riprova; se il problema continua, la ricerca web potrebbe non essere abilitata per questo spazio.',
      };
    }

    const percentuale = (v: unknown): number | null => {
      const n =
        typeof v === 'number'
          ? v
          : typeof v === 'string' && v.trim() !== ''
            ? Number(v.replace(',', '.'))
            : Number.NaN;
      if (!Number.isFinite(n) || n < 0 || n > 100) return null;
      return Math.round(n * 100) / 100;
    };

    const righe = Array.isArray(grezzo.ranghi) ? (grezzo.ranghi as Record<string, unknown>[]) : [];
    const parametri: ParametriScenari = {
      costiProceduraPct: percentuale(grezzo.costiProceduraPct),
      ranghi: RANGHI.map((r) => {
        const trovata = righe.find(
          (x) =>
            String(x.rango ?? '')
              .trim()
              .toUpperCase() === r.codice
        );
        return {
          rango: r.codice,
          tassoLiquidazionePct: percentuale(trovata?.tassoLiquidazionePct),
          cramDownPct: percentuale(trovata?.cramDownPct),
        };
      }),
    };

    const conDato = parametri.ranghi.filter(
      (r) => r.tassoLiquidazionePct !== null || r.cramDownPct !== null
    ).length;
    if (conDato === 0 && parametri.costiProceduraPct === null) {
      return {
        success: false,
        error:
          'La ricerca web non ha trovato percentuali utilizzabili per questo profilo: nessun campo è stato compilato. I valori restano quelli che hai scritto.',
      };
    }

    const fonti: FonteSuggerimento[] = Array.isArray(grezzo.fonti)
      ? (grezzo.fonti as Record<string, unknown>[])
          .map((f) => ({
            titolo: String(f.titolo ?? '').trim(),
            url: String(f.url ?? '').trim(),
          }))
          .filter((f) => /^https?:\/\//i.test(f.url))
          .slice(0, 8)
      : [];

    return {
      success: true,
      suggerimento: {
        parametri,
        note: String(grezzo.note ?? '').trim(),
        fonti,
      },
    };
  } catch (error: unknown) {
    console.error('[cercaParametriScenariWebAction] Errore:', error);
    return {
      success: false,
      error:
        erroreServizioEsterno(error, 'AI') ??
        `Ricerca web non riuscita: ${(error as Error).message || error}`,
    };
  }
}
