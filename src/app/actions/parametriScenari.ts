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
import {
  RANGHI,
  validaParametri,
  type ParametroRango,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';
import Anthropic from '@anthropic-ai/sdk';
import { consumaQuotaAi } from '@/lib/limiteAi';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface FonteSuggerimento {
  titolo: string;
  url: string;
}

/** Le percentuali proposte dalla ricerca web: non sono quelle in uso. */
export interface SuggerimentoParametri {
  ranghi: ParametroRango[];
  costiProceduraPct: number | null;
  fonti: FonteSuggerimento[];
  nota: string | null;
  generatoIl: string | null;
}

export interface RisultatoParametri {
  success: boolean;
  parametri?: ParametriScenari;
  /** La quota che l'ente considera dovuta sul proprio credito (INPS: 100). */
  soddisfazioneAttesaPct?: number | null;
  /** Il suggerimento salvato, distinto dai valori in uso. */
  suggerimento?: SuggerimentoParametri | null;
  error?: string;
}

export async function ottieniParametriScenariAction(
  nomeSchema: string
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenariTriage(nomeSchema);
    const [config, righe, suggerite] = await Promise.all([
      pool.query(
        `SELECT costi_procedura_pct, soddisfazione_attesa_pct FROM "${nomeSchema}".parametri_scenari WHERE id = 1`
      ),
      pool.query(
        `SELECT rango, tasso_liquidazione_pct, cram_down_pct
           FROM "${nomeSchema}".parametri_scenari_rango`
      ),
      pool
        .query(
          `SELECT chiave, tasso_liquidazione_pct, cram_down_pct, fonti, nota, generato_il
             FROM "${nomeSchema}".parametri_scenari_suggerimento`
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);
    const perRango = new Map(righe.rows.map((r) => [String(r.rango), r]));
    const perChiave = new Map(suggerite.rows.map((r) => [String(r.chiave), r]));
    const rigaSuggerita = perChiave.get('COSTI') ?? suggerite.rows[0] ?? null;
    const suggerimento: SuggerimentoParametri | null =
      suggerite.rows.length > 0
        ? {
            costiProceduraPct: num(perChiave.get('COSTI')?.costi_procedura_pct),
            ranghi: RANGHI.map((r) => {
              const x = perChiave.get(`RANGO:${r.codice}`);
              return {
                rango: r.codice,
                tassoLiquidazionePct: num(x?.tasso_liquidazione_pct),
                cramDownPct: num(x?.cram_down_pct),
              };
            }),
            fonti: Array.isArray(rigaSuggerita?.fonti)
              ? (rigaSuggerita?.fonti as FonteSuggerimento[]).filter((f) => f && f.url)
              : [],
            nota: (rigaSuggerita?.nota as string | null) ?? null,
            generatoIl: rigaSuggerita?.generato_il
              ? new Date(String(rigaSuggerita.generato_il)).toISOString()
              : null,
          }
        : null;
    return {
      success: true,
      soddisfazioneAttesaPct: num(config.rows[0]?.soddisfazione_attesa_pct),
      suggerimento,
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
  parametri: ParametriScenari,
  soddisfazioneAttesaPct: number | null = null
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaParametri(parametri);
    if (errore.length > 0) return { success: false, error: errore.join(' ') };
    if (
      soddisfazioneAttesaPct !== null &&
      (!Number.isFinite(soddisfazioneAttesaPct) ||
        soddisfazioneAttesaPct < 0 ||
        soddisfazioneAttesaPct > 100)
    )
      return {
        success: false,
        error: 'La quota attesa dall’ente deve essere una percentuale fra 0 e 100.',
      };

    await assicuraTabelleScenariTriage(nomeSchema);
    const ammessi = new Set<RangoCredito>(RANGHI.map((r) => r.codice));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "${nomeSchema}".parametri_scenari (id, costi_procedura_pct, soddisfazione_attesa_pct)
         VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE
           SET costi_procedura_pct = $1, soddisfazione_attesa_pct = $2`,
        [parametri.costiProceduraPct, soddisfazioneAttesaPct]
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

    return { success: true, parametri, soddisfazioneAttesaPct };
  } catch (error: unknown) {
    console.error('[salvaParametriScenariAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// IL SUGGERIMENTO DALLA RICERCA WEB (0.159.0)
// ---------------------------------------------------------------------------
//
// Le percentuali non le inventa l'operatore e non le inventa la piattaforma:
// si cercano sul web i tassi di recupero della liquidazione giudiziale e le
// evidenze storiche, si citano le fonti e si salvano COME SUGGERIMENTO. Il
// valore entra nel calcolo solo quando l'Admin lo salva: un suggerimento e una
// decisione sono due cose diverse, e la scheda lo dice.
//
// Se l'AI non c'è, non si propone nulla: meglio nessun suggerimento che un
// numero senza fonte.

async function chiediSuggerimento(prompt: string): Promise<string | null> {
  if (!anthropic) return null;
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 3000,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
  });
  return response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();
}

export async function suggerisciParametriScenariAction(
  nomeSchema: string
): Promise<RisultatoParametri> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };

    await assicuraTabelleScenariTriage(nomeSchema);
    const spazioRis = await pool
      .query(`SELECT id FROM public.spazi WHERE nome_schema = $1`, [nomeSchema])
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const quota = await consumaQuotaAi(pool, 'SCENARI', {
      utente: contesto.email ?? 'spazio',
      spazioId: spazioRis.rows[0]?.id ? Number(spazioRis.rows[0].id) : null,
    });
    if (!quota.consentito) return { success: false, error: quota.error ?? 'Quota AI esaurita.' };

    const atecoRis = await pool
      .query(
        `SELECT codice_ateco, count(*)::int AS n FROM "${nomeSchema}".aziende
          WHERE codice_ateco IS NOT NULL GROUP BY codice_ateco ORDER BY n DESC LIMIT 5`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const settori = atecoRis.rows.map((x) => String(x.codice_ateco)).filter(Boolean);
    const enteRis = await pool
      .query(
        `SELECT DISTINCT ente_25novies FROM "${nomeSchema}".limiti_ricevibilita WHERE ente_25novies IS NOT NULL`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const enti = enteRis.rows.map((x) => String(x.ente_25novies)).filter(Boolean);
    const ente = enti.length === 1 ? enti[0] : null;

    const prompt = `Sei un analista che aiuta un ente creditore pubblico italiano a impostare i parametri di confronto tra la liquidazione giudiziale e un cram down omologato (artt. 63, 84, 87 e 112 CCII).

Cerca sul web, con fonti verificabili e recenti:
1. i tassi di recupero medi (recovery rate) della liquidazione giudiziale in Italia, possibilmente distinti per rango del credito (prededucibile, privilegiato, chirografario, postergato)${settori.length ? ` e per i settori ATECO più presenti nello spazio (${settori.join(', ')})` : ''};
2. le spese di procedura tipiche, in percentuale sul realizzo lordo;
3. le evidenze storiche disponibili sui cram down omologati e sulle percentuali di soddisfacimento riconosciute ai creditori pubblici${ente ? ` (lo spazio è di ${ente})` : ''}.

Restituisci SOLO JSON valido, nessun testo prima o dopo:
{
  "costiProceduraPct": null,
  "ranghi": [
    { "rango": "PREDEDUCIBILE", "tassoLiquidazionePct": null, "cramDownPct": null },
    { "rango": "PRIVILEGIATO", "tassoLiquidazionePct": null, "cramDownPct": null },
    { "rango": "CHIROGRAFARIO", "tassoLiquidazionePct": null, "cramDownPct": null },
    { "rango": "POSTERGATO", "tassoLiquidazionePct": null, "cramDownPct": null }
  ],
  "fonti": [ { "titolo": "…", "url": "https://…" } ],
  "nota": "due righe su che cosa dicono le fonti e su quanto sono affidabili"
}

Le percentuali sono numeri fra 0 e 100. Se una fonte non copre un rango, lascia null: non riempire per simmetria. Le fonti devono essere pagine che hai effettivamente letto.`;

    const grezzo = await chiediSuggerimento(prompt);
    if (!grezzo) return { success: false, error: 'La ricerca non ha prodotto un risultato.' };
    let letto: Record<string, unknown>;
    try {
      letto = JSON.parse(grezzo) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        error: 'La ricerca ha restituito un risultato non leggibile: riprova.',
      };
    }

    const ammessi = new Set<string>(RANGHI.map((r) => r.codice));
    const daJson = Array.isArray(letto.ranghi) ? (letto.ranghi as Record<string, unknown>[]) : [];
    const ranghi: ParametroRango[] = RANGHI.map((r) => {
      const x = daJson.find((v) => v && v.rango === r.codice) ?? {};
      return {
        rango: r.codice,
        tassoLiquidazionePct: num(x.tassoLiquidazionePct),
        cramDownPct: num(x.cramDownPct),
      };
    }).filter((r) => ammessi.has(r.rango));
    const costi = num(letto.costiProceduraPct);
    const fonti: FonteSuggerimento[] = Array.isArray(letto.fonti)
      ? (letto.fonti as Record<string, unknown>[])
          .map((f) => ({ titolo: String(f?.titolo ?? ''), url: String(f?.url ?? '') }))
          .filter((f) => /^https?:\/\//.test(f.url))
          .slice(0, 10)
      : [];
    if (
      ranghi.every((r) => r.tassoLiquidazionePct === null && r.cramDownPct === null) &&
      costi === null
    )
      return { success: false, error: 'La ricerca non ha trovato percentuali utilizzabili.' };

    const nota = typeof letto.nota === 'string' ? letto.nota.slice(0, 800) : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${nomeSchema}".parametri_scenari_suggerimento`);
      const fontiJson = JSON.stringify(fonti);
      await client.query(
        `INSERT INTO "${nomeSchema}".parametri_scenari_suggerimento
           (chiave, tasso_liquidazione_pct, cram_down_pct, fonti, nota, generato_il)
         VALUES ('COSTI', NULL, NULL, $1::jsonb, $2, now())`,
        [fontiJson, nota]
      );
      for (const r of ranghi) {
        await client.query(
          `INSERT INTO "${nomeSchema}".parametri_scenari_suggerimento
             (chiave, tasso_liquidazione_pct, cram_down_pct, fonti, nota, generato_il)
           VALUES ($1, $2, $3, $4::jsonb, NULL, now())`,
          [`RANGO:${r.rango}`, r.tassoLiquidazionePct, r.cramDownPct, fontiJson]
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return await ottieniParametriScenariAction(nomeSchema);
  } catch (error: unknown) {
    console.error('[suggerisciParametriScenariAction] Errore:', error);
    return {
      success: false,
      error:
        erroreServizioEsterno(error, 'AI') ?? `Ricerca non riuscita: ${(error as Error).message}`,
    };
  }
}
