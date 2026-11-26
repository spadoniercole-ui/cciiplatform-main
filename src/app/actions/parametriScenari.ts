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
import {
  haPercentuali,
  leggiSuggerimento,
  type FonteSuggerimento,
  type SuggerimentoScenari,
} from '@/lib/triage/suggerimentoScenari';
import {
  leggiParametriAllaData,
  leggiVersioniParametri,
} from '@/lib/triage/letturaParametriScenari';
import {
  dataItaliana,
  giornoIso,
  oggiIso,
  type VersioneParametri,
} from '@/lib/triage/versioniParametri';

export type { FonteSuggerimento, SuggerimentoScenari };

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

export interface RisultatoParametri {
  success: boolean;
  parametri?: ParametriScenari;
  /** La versione in vigore alla data letta; null se lo spazio ha solo i parametri storici. */
  versione?: VersioneParametri | null;
  /** Tutte le versioni, dalla più recente: la scheda dei Parametri. */
  versioni?: VersioneParametri[];
  error?: string;
}

/**
 * Le percentuali in vigore (0.256.33), non più «le percentuali» e basta: con
 * `dataRiferimento` si legge la versione di quel giorno, senza si legge quella
 * di oggi. È la lettura dei calcoli nuovi e delle pagine che mostrano il dato.
 */
export async function ottieniParametriScenariAction(
  nomeSchema: string,
  dataRiferimento: string | null = null
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenariTriage(nomeSchema);
    const { parametri, versione, versioni } = await leggiParametriAllaData(
      nomeSchema,
      dataRiferimento
    );
    return { success: true, parametri, versione, versioni };
  } catch (error: unknown) {
    console.error('[ottieniParametriScenariAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * UNA VERSIONE NUOVA, NON UNA SOVRASCRITTURA (0.256.33).
 *
 * Salvare i parametri registra una versione con la sua decorrenza: da quel
 * giorno i calcoli nuovi usano questi valori, e i documenti chiusi prima
 * restano su quelli con cui sono nati. Una decorrenza nel futuro è ammessa ed
 * è il modo per preparare un aggiornamento senza applicarlo subito.
 *
 * Le tabelle storiche (`parametri_scenari`, `parametri_scenari_rango`) si
 * allineano quando la versione decorre già: sono la forma in cui i valori
 * escono nei backup e nei ripristini vecchi, e non devono dire una cosa diversa
 * da quella che il triage applica. Con una decorrenza futura restano quelle di
 * oggi, che è esattamente ciò che vale fino a quel giorno.
 */
export async function salvaParametriScenariAction(
  nomeSchema: string,
  parametri: ParametriScenari,
  opzioni: { validiDa?: string | null; nota?: string | null } = {}
): Promise<RisultatoParametri> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaParametri(parametri);
    if (errore.length > 0) return { success: false, error: errore.join(' ') };

    const giorno = opzioni.validiDa ? giornoIso(opzioni.validiDa) : oggiIso();
    if (!giorno)
      return {
        success: false,
        error: 'La decorrenza deve essere una data (anno-mese-giorno).',
      };

    await assicuraTabelleScenariTriage(nomeSchema);
    const esistenti = await leggiVersioniParametri(nomeSchema);
    const occupata = esistenti.find((v) => v.validiDa === giorno);
    if (occupata)
      return {
        success: false,
        error: `Esiste già una versione con decorrenza ${dataItaliana(giorno)}. Scegli un altro giorno: le percentuali di una data già registrata non si riscrivono, altrimenti un documento chiuso cambierebbe numeri.`,
      };

    const ammessi = new Set<RangoCredito>(RANGHI.map((r) => r.codice));
    for (const r of parametri.ranghi)
      if (!ammessi.has(r.rango)) return { success: false, error: 'Rango non riconosciuto.' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserita = await client.query(
        `INSERT INTO "${nomeSchema}".parametri_scenari_versioni
           (validi_da, nota, costi_procedura_pct)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [giorno, opzioni.nota?.trim() || null, parametri.costiProceduraPct]
      );
      const versioneId = Number(inserita.rows[0]?.id);
      for (const r of parametri.ranghi) {
        await client.query(
          `INSERT INTO "${nomeSchema}".parametri_scenari_versione_ranghi
             (versione_id, rango, tasso_liquidazione_pct, cram_down_pct)
           VALUES ($1, $2, $3, $4)`,
          [versioneId, r.rango, r.tassoLiquidazionePct, r.cramDownPct]
        );
      }
      // La versione decorre già: le tabelle storiche dicono la stessa cosa.
      if (giorno <= oggiIso()) {
        await client.query(
          `INSERT INTO "${nomeSchema}".parametri_scenari (id, costi_procedura_pct, aggiornato_il)
           VALUES (1, $1, now())
           ON CONFLICT (id) DO UPDATE SET costi_procedura_pct = $1, aggiornato_il = now()`,
          [parametri.costiProceduraPct]
        );
        for (const r of parametri.ranghi) {
          await client.query(
            `INSERT INTO "${nomeSchema}".parametri_scenari_rango
               (rango, tasso_liquidazione_pct, cram_down_pct, aggiornato_il)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (rango)
             DO UPDATE SET tasso_liquidazione_pct = $2, cram_down_pct = $3, aggiornato_il = now()`,
            [r.rango, r.tassoLiquidazionePct, r.cramDownPct]
          );
        }
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    const letto = await leggiParametriAllaData(nomeSchema, giorno);
    return {
      success: true,
      parametri: letto.parametri,
      versione: letto.versione,
      versioni: letto.versioni,
    };
  } catch (error: unknown) {
    console.error('[salvaParametriScenariAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

/**
 * RICERCA WEB SUI PARAMETRI DEGLI SCENARI (0.168.0 → 0.169.0).
 *
 * Il pulsante «Cerca sul web» non salva nulla: propone, rango per rango, i
 * valori che la ricerca riesce a documentare e lascia all'ente la decisione.
 * È la differenza fra un parametro dell'ente e un default della piattaforma:
 * il primo lo firma chi conosce la propria massa, il secondo sarebbe un numero
 * di nessuno. Per questo i campi si compilano ma restano modificabili, e la
 * risposta porta le fonti.
 *
 * DUE LIVELLI, NON UNO. Prima si cercano i dati ufficiali (ISTAT, Banca
 * d'Italia, Ministero della Giustizia, statistiche dei tribunali). Quando la
 * statistica non esiste o non copre un rango, la ricerca non si ferma: cerca
 * casistiche e best practice — omologazioni, relazioni dei commissari,
 * osservatori, prassi dei tribunali — e ne ricava un valore tipico. Il numero
 * che ne esce è una stima, e viene dichiarato come tale: meglio una stima
 * difendibile con la sua fonte che un campo vuoto che blocca lo scenario.
 *
 * Se anche la casistica manca, il valore resta null. Uno zero sarebbe
 * un'ipotesi («recupero nullo»), non un'assenza di dato.
 */
export async function cercaParametriScenariWebAction(
  nomeSchema: string
): Promise<{ success: boolean; suggerimento?: SuggerimentoScenari; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };

    const elencoRanghi = RANGHI.map((r) => `- ${r.codice} (${r.etichetta}): ${r.aiuto}`).join('\n');

    const prompt = `Sei un analista della crisi d'impresa. Devi proporre a un ente creditore italiano, con una ricerca web, i valori di due parametri operativi usati nel triage: il tasso di realizzo in una liquidazione giudiziale e la percentuale di soddisfacimento in un cram down omologato, per rango del credito.

LA RICERCA È A DUE LIVELLI, NELL'ORDINE:
1. DATI UFFICIALI. Cerca rapporti ISTAT, Banca d'Italia, Ministero della Giustizia, statistiche dei tribunali fallimentari, osservatori pubblici. Sono la base preferibile: un dato osservato batte una stima.
2. CASE HISTORY E BEST PRACTICE. Se il dato ufficiale non esiste, non è aggiornato o non copre un rango, NON fermarti: cerca casi concreti e prassi — provvedimenti di omologazione del cram down, decreti di liquidazione, relazioni dei commissari e dei curatori, osservatori privati (per esempio OCI o Cerved), studi di Ordini professionali, linee guida e prassi dei tribunali — e ricava da più casi un valore tipico o mediano. Dichiara che è una stima da casistica, non un dato osservato. L'ente ha bisogno di un numero difendibile anche quando la statistica non c'è.
3. Se anche la casistica manca, scrivi null per quel valore: non inventare, non stimare per simmetria e non copiare il valore di un altro rango.

RANGHI DEL CREDITO (usa esattamente questi codici, tutti, anche quelli senza dato):
${elencoRanghi}

REGOLE:
- Esprimi le percentuali come numeri fra 0 e 100, non come frazioni.
- Ogni valore proposto deve avere almeno una fonte che hai letto: niente numeri presi dalla memoria del modello.
- Dichiara la base complessiva della proposta con "base": DATO_UFFICIALE se tutti i valori vengono da statistiche ufficiali, CASISTICA se vengono da casi, PRASSI se vengono da best practice o linee guida, MISTA se convivono.
- Nella nota indica, per ogni rango compilato, se il valore è ufficiale, da casistica o da prassi, e quanto è prudente. Se un valore è una stima, dillo con parole esplicite.
- Le spese di procedura sono una percentuale sul realizzo lordo; se non le trovi, null.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{
  "base": "DATO_UFFICIALE" | "CASISTICA" | "PRASSI" | "MISTA",
  "costiProceduraPct": number | null,
  "ranghi": [
    { "rango": "PREDEDUCIBILE", "tassoLiquidazionePct": number | null, "cramDownPct": number | null }
  ],
  "note": "2-5 frasi: da dove viene ogni valore, quali sono ufficiali, quali stimati da casistica, quali prudenziali e quali mancano",
  "fonti": [ { "titolo": "...", "url": "https://..." } ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
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

    const suggerimento = leggiSuggerimento(grezzo);
    if (!haPercentuali(suggerimento)) {
      return {
        success: false,
        error:
          'La ricerca web non ha trovato percentuali utilizzabili: né un dato ufficiale né una casistica sufficiente per questo profilo. Nessun campo è stato compilato; i valori restano quelli che hai scritto.',
      };
    }

    return { success: true, suggerimento };
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
