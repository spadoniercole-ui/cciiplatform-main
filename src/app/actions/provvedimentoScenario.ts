'use server';

// IL PROVVEDIMENTO DELLO SCENARIO — cram down o decreto di liquidazione.
//
// Quando lo scenario non è una trattativa, l'unica cosa che si può fare è
// leggere il provvedimento: trovare i riferimenti all'ente, ricavare quanto il
// tribunale ha riconosciuto e metterlo accanto a quanto l'ente detiene. Il
// confronto è differenziale: il numero del tribunale, da solo, non dice nulla.
//
// L'AI legge il PDF del provvedimento; gli importi li salva, ma non li
// inventa: ciò che non trova resta nullo e la scheda lo dichiara.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { ErroreAutorizzazione, richiediAccessoScenario } from '@/lib/autorizzazione';
import { assicuraTabelleScenari } from '@/db/provision';
import { get } from '@/lib/blobStore';
import { consumaQuotaAi } from '@/lib/limiteAi';
import { erroreServizioEsterno } from '@/lib/serviziEsterni';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { saldoRigaDebitoEnte } from '@/lib/debitiEnte/tipoDebito';
import {
  richiedeProvvedimento,
  varianteValida,
  type VarianteScenario,
} from '@/lib/scenario/variante';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface ImportiProvvedimento {
  /** Importo riconosciuto all'ente dal provvedimento, se il testo lo dice. */
  importoEnte: number | null;
  /** Percentuale riconosciuta sul credito vantato, se il testo la dice. */
  percentualeEnte: number | null;
  /** Riferimenti all'ente trovati nel testo (numeri di ruolo, partite, note). */
  riferimenti: string[];
  /** Passaggi del provvedimento che riguardano l'ente, citati. */
  passaggi: string[];
}

export interface ProvvedimentoScenario {
  tipo: VarianteScenario;
  nomeFile: string | null;
  url: string | null;
  testo: string | null;
  importi: ImportiProvvedimento | null;
  errore: string | null;
  generatoIl: string | null;
}

export interface RisultatoProvvedimento {
  success: boolean;
  provvedimento: ProvvedimentoScenario | null;
  error?: string;
}

export async function ottieniProvvedimentoAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoProvvedimento> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!schemaOk(nomeSchema))
      return { success: false, provvedimento: null, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    const r = await pool.query(
      `SELECT tipo, nome_file, url, testo, importi, errore, generato_il
         FROM "${nomeSchema}".provvedimento_scenario WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (r.rows.length === 0) return { success: true, provvedimento: null };
    const x = r.rows[0];
    return {
      success: true,
      provvedimento: {
        tipo: (varianteValida(x.tipo) ? x.tipo : 'CRAM_DOWN') as VarianteScenario,
        nomeFile: (x.nome_file as string | null) ?? null,
        url: (x.url as string | null) ?? null,
        testo: (x.testo as string | null) ?? null,
        importi: (x.importi as ImportiProvvedimento | null) ?? null,
        errore: (x.errore as string | null) ?? null,
        generatoIl: x.generato_il ? new Date(x.generato_il).toISOString() : null,
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniProvvedimentoAction] Errore:', error);
    return {
      success: false,
      provvedimento: null,
      error: `Lettura non riuscita: ${(error as Error).message}`,
    };
  }
}

async function aziendaDelloScenario(
  nomeSchema: string,
  scenarioId: number
): Promise<{ aziendaId: number; variante: string | null }> {
  const r = await pool.query(
    `SELECT azienda_id, variante FROM "${nomeSchema}".scenari WHERE id = $1`,
    [scenarioId]
  );
  if (r.rows.length === 0) throw new ErroreAutorizzazione('Scenario non trovato.');
  return {
    aziendaId: Number(r.rows[0].azienda_id),
    variante: (r.rows[0].variante as string | null) ?? null,
  };
}

function numeroDaTesto(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const n = Number(
      v
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    );
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/**
 * Legge il provvedimento e lo salva. `tipo` deve essere una delle varianti che
 * richiedono un provvedimento: un cram down o un decreto. La trattativa non
 * passa di qui.
 */
export async function analizzaProvvedimentoAction(
  nomeSchema: string,
  scenarioId: number,
  tipo: VarianteScenario,
  url: string,
  nomeFile: string
): Promise<RisultatoProvvedimento> {
  try {
    const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    if (!schemaOk(nomeSchema))
      return { success: false, provvedimento: null, error: 'Nome schema non valido.' };
    if (!varianteValida(tipo) || !richiedeProvvedimento(tipo))
      return {
        success: false,
        provvedimento: null,
        error: 'Questa variante non prevede un provvedimento da leggere.',
      };
    if (!url || !nomeFile)
      return { success: false, provvedimento: null, error: 'Nessun documento indicato.' };

    await assicuraTabelleScenari(nomeSchema);
    const { aziendaId } = await aziendaDelloScenario(nomeSchema, scenarioId);

    if (!anthropic)
      return {
        success: false,
        provvedimento: null,
        error: 'Lettura automatica non configurata: manca la chiave del servizio AI.',
      };

    const spazioRis = await pool
      .query(`SELECT id FROM public.spazi WHERE nome_schema = $1`, [nomeSchema])
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const quota = await consumaQuotaAi(pool, 'PROVVEDIMENTO', {
      utente: contesto.email ?? 'spazio',
      spazioId: spazioRis.rows[0]?.id ? Number(spazioRis.rows[0].id) : null,
    });
    if (!quota.consentito)
      return { success: false, provvedimento: null, error: quota.error ?? 'Quota AI esaurita.' };

    const file = await get(url, { access: 'private' });
    if (!file || file.statusCode !== 200) {
      return {
        success: false,
        provvedimento: null,
        error: 'Impossibile scaricare il provvedimento dallo storage.',
      };
    }
    const buffer = Buffer.from(await new Response(file.stream).arrayBuffer());
    const base64 = buffer.toString('base64');
    if (!Buffer.from(base64.slice(0, 20), 'base64').toString('latin1').startsWith('%PDF-')) {
      return {
        success: false,
        provvedimento: null,
        error: 'Il provvedimento deve essere un PDF valido.',
      };
    }

    // Il credito dell'ente: è il termine di confronto, senza il quale il
    // numero del tribunale non dice nulla.
    const [debitiRis, enteRis] = await Promise.all([
      ottieniDebitiEnte(nomeSchema, aziendaId),
      pool
        .query(
          `SELECT DISTINCT ente_25novies FROM "${nomeSchema}".limiti_ricevibilita WHERE ente_25novies IS NOT NULL`
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);
    const creditiEnte = debitiRis.success ? debitiRis.righe : [];
    const totaleEnte = creditiEnte.reduce((a, r) => a + saldoRigaDebitoEnte(r), 0);
    const enti = Array.from(
      new Set(enteRis.rows.map((x) => String(x.ente_25novies)).filter(Boolean))
    );
    const ente = enti.length === 1 ? enti[0] : 'ente creditore dello spazio';

    const prompt = `Leggi il provvedimento allegato (${tipo === 'CRAM_DOWN' ? 'provvedimento di cram down / omologa' : 'decreto di liquidazione giudiziale'}) e cerca SOLO ciò che riguarda ${ente}.

Credito vantato da ${ente} verso l'azienda secondo la piattaforma: € ${totaleEnte.toLocaleString('it-IT')}.

Estrai, senza inventare:
1. i riferimenti all'ente presenti nel testo (numero di ruolo, partite, uffici, date, importi);
2. l'importo complessivamente riconosciuto all'ente dal tribunale, se indicato;
3. la percentuale riconosciuta sul credito vantato, se indicata o ricavabile dagli importi;
4. i passaggi del provvedimento che nominano l'ente o ne determinano il trattamento, citati testualmente e in modo breve.

Se un dato non c'è, restituisci null: non stimare, non arrotondare, non usare valori di altri creditori.
Rispondi SOLO con JSON valido:
{ "riferimenti": ["…"], "passaggi": ["…"], "importoEnte": null, "percentualeEnte": null }`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              title: nomeFile,
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const testo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const grezzo = testo.replace(/```json|```/g, '').trim();

    let letto: Record<string, unknown> = {};
    try {
      letto = JSON.parse(grezzo) as Record<string, unknown>;
    } catch {
      await salvaProvvedimento(nomeSchema, scenarioId, {
        tipo,
        nomeFile,
        url,
        testo: null,
        importi: null,
        errore: 'Il provvedimento è stato caricato ma la lettura non ha restituito dati leggibili.',
      });
      return {
        success: false,
        provvedimento: null,
        error: 'Lettura non riuscita: il provvedimento è salvato, ma i dati non sono leggibili.',
      };
    }

    const lista = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 20)
        : [];
    const importi: ImportiProvvedimento = {
      importoEnte: numeroDaTesto(letto.importoEnte),
      percentualeEnte: numeroDaTesto(letto.percentualeEnte),
      riferimenti: lista(letto.riferimenti),
      passaggi: lista(letto.passaggi),
    };

    await salvaProvvedimento(nomeSchema, scenarioId, {
      tipo,
      nomeFile,
      url,
      testo: grezzo.slice(0, 20000),
      importi,
      errore: null,
    });

    return { ...(await ottieniProvvedimentoAction(nomeSchema, scenarioId)) };
  } catch (error: unknown) {
    console.error('[analizzaProvvedimentoAction] Errore:', error);
    return {
      success: false,
      provvedimento: null,
      error:
        erroreServizioEsterno(error, 'AI') ?? `Lettura non riuscita: ${(error as Error).message}`,
    };
  }
}

async function salvaProvvedimento(
  nomeSchema: string,
  scenarioId: number,
  p: {
    tipo: VarianteScenario;
    nomeFile: string;
    url: string;
    testo: string | null;
    importi: ImportiProvvedimento | null;
    errore: string | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO "${nomeSchema}".provvedimento_scenario
       (scenario_id, tipo, nome_file, url, testo, importi, errore, generato_il)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (scenario_id) DO UPDATE
       SET tipo = $2, nome_file = $3, url = $4, testo = $5, importi = $6, errore = $7, generato_il = now()`,
    [
      scenarioId,
      p.tipo,
      p.nomeFile,
      p.url,
      p.testo,
      p.importi ? JSON.stringify(p.importi) : null,
      p.errore,
    ]
  );
}
