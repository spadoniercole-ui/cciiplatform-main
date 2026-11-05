'use server';

// ISTRUTTORIA DEL PROVVEDIMENTO DEL GIUDICE (0.170.0).
//
// Quando lo scenario non nasce da una proposta ma da un decreto di
// liquidazione giudiziale o da un dispositivo di cram down, non c'è nulla
// da valutare nel merito: c'è un atto del giudice da riscontrare con i dati
// dell'ente. Questo file fa tre cose, in quest'ordine:
//   1. legge l'atto e i documenti che lo corredano (AI, una volta);
//   2. confronta i crediti letti con la posizione debitoria dell'ente
//      (aritmetica deterministica, in src/lib/giudice/confronto.ts);
//   3. scrive l'analisi critica sui numeri già calcolati (AI, una volta).
//
// L'AI non calcola mai la perdita: la calcola il modulo puro. All'AI resta
// la parte che sa fare meglio — spiegare, ordinare, dire dove guardare —
// e le istruzioni le vietano di aggiungere numeri, articoli o rimedi.
//
// I file restano finché non si genera l'analisi: chi corregge un documento
// o rifà la lettura non deve ricaricare tutto. Dopo, vengono eliminati e
// restano i dati letti e il confronto, che bastano a rigenerare il testo.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { richiediAccessoScenario, verificaFileDelloSpazio } from '@/lib/autorizzazione';
import { del, get } from '@/lib/blobStore';
import { assicuraTabellaDebitiEnte, assicuraTabelleScenari } from '@/db/provision';
import { verificaScenarioNonBloccato, ottieniScenarioPerId } from '@/app/actions/scenari';
import { PERCORSO_DEMO } from '@/lib/demo/percorsoEnte';
import { ottieniLimitiRicevibilita } from '@/app/actions/parametriSpazio';
import { consumaQuotaAi } from '@/lib/limiteAi';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import {
  normalizzaLettura,
  promptLetturaProvvedimento,
  tipoAttoValido,
  type LetturaProvvedimento,
  type TipoAttoGiudice,
} from '@/lib/giudice/lettura';
import {
  confrontaProvvedimento,
  promptAnalisiCritica,
  type ConfrontoProvvedimento,
  type VoceEnte,
} from '@/lib/giudice/confronto';

export interface DocumentoProvvedimento {
  nome: string;
  url: string;
}

export interface StatoIstruttoriaGiudice {
  success: boolean;
  tipoIstruttoria?: TipoAttoGiudice;
  documenti?: DocumentoProvvedimento[];
  lettura?: LetturaProvvedimento | null;
  confronto?: ConfrontoProvvedimento | null;
  relazione?: string | null;
  letturaIl?: string | null;
  generataIl?: string | null;
  /** Nessuna posizione debitoria dell'ente per questa azienda: il confronto non esiste. */
  posizioneAssente?: boolean;
  error?: string;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const DIMENSIONE_MASSIMA_FILE = 20 * 1024 * 1024;
const NUMERO_MASSIMO_FILE = 8;

type DocumentoScaricato = { nome: string; base64: string };

function isPdfValido(base64: string): boolean {
  try {
    return Buffer.from(base64.slice(0, 20), 'base64').toString('latin1').startsWith('%PDF-');
  } catch {
    return false;
  }
}

async function scaricaDocumenti(
  documenti: DocumentoProvvedimento[]
): Promise<{ documenti: DocumentoScaricato[] } | { error: string }> {
  const out: DocumentoScaricato[] = [];
  for (const doc of documenti) {
    const risultato = await get(doc.url, { access: 'private' });
    if (!risultato || risultato.statusCode !== 200) {
      return { error: `Impossibile scaricare «${doc.nome}» dallo storage.` };
    }
    const buffer = Buffer.from(await new Response(risultato.stream).arrayBuffer());
    if (buffer.length > DIMENSIONE_MASSIMA_FILE) {
      return { error: `«${doc.nome}» supera i 20MB consentiti per file.` };
    }
    const base64 = buffer.toString('base64');
    if (!isPdfValido(base64)) {
      return { error: `«${doc.nome}» non è un PDF valido — solo file PDF sono ammessi.` };
    }
    out.push({ nome: doc.nome, base64 });
  }
  return { documenti: out };
}

function testoRisposta(blocchi: Anthropic.Messages.ContentBlock[]): string {
  return blocchi
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function jsonDaTesto(testo: string): unknown {
  const pulito = testo
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const inizio = pulito.indexOf('{');
  const fine = pulito.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) throw new Error('La risposta non contiene un oggetto JSON.');
  return JSON.parse(pulito.slice(inizio, fine + 1));
}

function leggiDocumenti(grezzo: unknown): DocumentoProvvedimento[] {
  if (!Array.isArray(grezzo)) return [];
  return grezzo
    .filter(
      (d): d is DocumentoProvvedimento =>
        !!d &&
        typeof d === 'object' &&
        typeof (d as DocumentoProvvedimento).nome === 'string' &&
        typeof (d as DocumentoProvvedimento).url === 'string'
    )
    .map((d) => ({ nome: d.nome, url: d.url }));
}

async function rigaEsistente(
  nomeSchema: string,
  scenarioId: number
): Promise<{
  documenti: DocumentoProvvedimento[];
  lettura: LetturaProvvedimento | null;
  confronto: ConfrontoProvvedimento | null;
  relazione: string | null;
  letturaIl: string | null;
  generataIl: string | null;
} | null> {
  const r = await pool.query(
    `SELECT documenti, lettura, confronto, relazione, lettura_il, generata_il
       FROM "${nomeSchema}".istruttoria_giudice WHERE scenario_id = $1`,
    [scenarioId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    documenti: leggiDocumenti(row.documenti),
    lettura: (row.lettura as LetturaProvvedimento | null) ?? null,
    confronto: (row.confronto as ConfrontoProvvedimento | null) ?? null,
    relazione: row.relazione ?? null,
    letturaIl: row.lettura_il ? new Date(row.lettura_il).toISOString() : null,
    generataIl: row.generata_il ? new Date(row.generata_il).toISOString() : null,
  };
}

/** Lo stato dell'istruttoria, per riaprire la pagina senza perdere nulla. */
export async function ottieniIstruttoriaGiudiceAction(
  nomeSchema: string,
  scenarioId: number
): Promise<StatoIstruttoriaGiudice> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    const scenario = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenario.success || !scenario.scenario) {
      return { success: false, error: scenario.error || 'Scenario non trovato.' };
    }
    const tipo = (scenario.scenario.tipoIstruttoria ?? 'PROPOSTA') as TipoAttoGiudice;
    const stato = await rigaEsistente(nomeSchema, scenarioId);
    const posizione = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1`,
      [scenario.scenario.aziendaId]
    );
    return {
      success: true,
      tipoIstruttoria: tipo,
      documenti: stato?.documenti ?? [],
      lettura: stato?.lettura ?? null,
      confronto: stato?.confronto ?? null,
      relazione: stato?.relazione ?? null,
      letturaIl: stato?.letturaIl ?? null,
      generataIl: stato?.generataIl ?? null,
      posizioneAssente: Number(posizione.rows[0]?.n ?? 0) === 0,
    };
  } catch (error: any) {
    console.error('[ottieniIstruttoriaGiudiceAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile caricare l'istruttoria: ${error.message || error}`,
    };
  }
}

/**
 * La risposta alla domanda che si pone appena creato lo scenario. Si può
 * cambiare finché non ci sono documenti: dopo, cambiare atto significherebbe
 * rileggere tutto e il confronto già calcolato non varrebbe più.
 */
export async function impostaTipoIstruttoriaAction(
  nomeSchema: string,
  scenarioId: number,
  tipo: TipoAttoGiudice
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!tipoAttoValido(tipo)) return { success: false, error: 'Tipo di atto non valido.' };
    const bloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    await assicuraTabelleScenari(nomeSchema);
    const stato = await rigaEsistente(nomeSchema, scenarioId);
    // Nella valutazione aperta la scelta è il gesto centrale della demo:
    // si può cambiare percorso anche dopo la prima lettura, perché la
    // piattaforma deve mostrare di saper assorbire la variante. Sugli altri
    // scenari resta il blocco: cambiare atto dopo aver letto i documenti
    // renderebbe falso il confronto già calcolato.
    const info = await pool.query(
      `SELECT a.ragione_sociale, sp.demo
         FROM "${nomeSchema}".scenari s
         JOIN "${nomeSchema}".aziende a ON a.id = s.azienda_id
         JOIN public.spazi sp ON sp.nome_schema = $1
        WHERE s.id = $2`,
      [nomeSchema, scenarioId]
    );
    const aperta =
      Boolean(info.rows[0]?.demo) &&
      PERCORSO_DEMO.some(
        (a) => a.aperta && a.ragioneSociale === String(info.rows[0]?.ragione_sociale ?? '')
      );
    if (stato && stato.documenti.length > 0 && !aperta) {
      return {
        success: false,
        error:
          'Ci sono già documenti acquisiti per questo scenario: eliminare la lettura prima di cambiare il tipo di atto.',
      };
    }
    await pool.query(`UPDATE "${nomeSchema}".scenari SET tipo_istruttoria = $2 WHERE id = $1`, [
      scenarioId,
      tipo,
    ]);
    if (aperta) {
      const { preparaValutazioneApertaDemo } = await import('@/lib/demo/caricaPercorsoEnte');
      await preparaValutazioneApertaDemo(nomeSchema, scenarioId, tipo);
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaTipoIstruttoriaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile impostare il tipo di atto: ${error.message || error}`,
    };
  }
}

/**
 * Legge il provvedimento e i documenti allegati, ne estrae i crediti e li
 * confronta con la posizione debitoria dell'ente. Non genera ancora il
 * testo: prima si vede il confronto, poi si chiede l'analisi.
 */
export async function caricaDocumentiProvvedimentoAction(
  nomeSchema: string,
  scenarioId: number,
  documenti: DocumentoProvvedimento[]
): Promise<StatoIstruttoriaGiudice> {
  try {
    const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    for (const d of documenti) verificaFileDelloSpazio(contesto, d.url);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };
    const bloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    if (documenti.length === 0) return { success: false, error: 'Nessun documento caricato.' };
    if (documenti.length > NUMERO_MASSIMO_FILE) {
      return { success: false, error: `Massimo ${NUMERO_MASSIMO_FILE} documenti.` };
    }

    const scenario = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenario.success || !scenario.scenario) {
      return { success: false, error: scenario.error || 'Scenario non trovato.' };
    }
    const tipo = scenario.scenario.tipoIstruttoria;
    if (tipo !== 'DECRETO_LIQUIDAZIONE' && tipo !== 'CRAM_DOWN') {
      return {
        success: false,
        error: 'Questo scenario non è un decreto di liquidazione o un cram down.',
      };
    }

    // I documenti da eliminare sono quelli della lettura PRECEDENTE: se si
    // leggessero dopo il salvataggio sarebbero già i nuovi, e i vecchi file
    // resterebbero orfani sullo storage.
    const statoPrecedente = await rigaEsistente(nomeSchema, scenarioId);

    const scaricati = await scaricaDocumenti(documenti);
    if ('error' in scaricati) return { success: false, error: scaricati.error };

    const limiti = await ottieniLimitiRicevibilita(nomeSchema, 'ENTE').catch(() => null);
    const alias = limiti?.success ? limiti.limiti[0]?.alias || [] : [];
    const rigaAlias =
      alias.length > 0
        ? ` Questo ente può comparire nei documenti con nomi o termini diversi dal proprio acronimo: considera equivalenti ${alias.join(', ')}.`
        : '';

    let risposta: Anthropic.Messages.Message;
    try {
      risposta = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              ...scaricati.documenti.map((d) => ({
                type: 'document' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'application/pdf' as const,
                  data: d.base64,
                },
                title: d.nome,
              })),
              { type: 'text', text: promptLetturaProvvedimento(tipo, rigaAlias) },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('[caricaDocumentiProvvedimentoAction] AI:', error);
      return {
        success: false,
        error:
          erroreServizioEsterno(error, 'AI') ||
          'Il servizio AI non è raggiungibile in questo momento. Riprova tra poco.',
      };
    }

    if (risposta.stop_reason === 'max_tokens') {
      return {
        success: false,
        error:
          'La lettura si è interrotta prima della fine: i documenti sono troppo lunghi. Caricane meno per volta o dividili.',
      };
    }

    let lettura: LetturaProvvedimento;
    try {
      lettura = normalizzaLettura(jsonDaTesto(testoRisposta(risposta.content)));
    } catch (error) {
      console.error('[caricaDocumentiProvvedimentoAction] Risposta non leggibile:', error);
      return {
        success: false,
        error:
          'La lettura non ha restituito dati leggibili. Riprova; se continua, carica il provvedimento da solo, senza gli allegati.',
      };
    }

    // I dati dell'ente: prima le righe dello scenario, poi — solo se non ce
    // ne sono — quelle caricate a livello azienda prima che la posizione si
    // spostasse nello scenario. Sommarle entrambe conterebbe due volte.
    await assicuraTabellaDebitiEnte(nomeSchema);
    const perScenario = await pool.query(
      `SELECT voce, importo FROM "${nomeSchema}".debiti_ente
        WHERE azienda_id = $1 AND scenario_id = $2 ORDER BY id ASC`,
      [scenario.scenario.aziendaId, scenarioId]
    );
    const righe =
      perScenario.rows.length > 0
        ? perScenario.rows
        : (
            await pool.query(
              `SELECT voce, importo FROM "${nomeSchema}".debiti_ente
                WHERE azienda_id = $1 AND scenario_id IS NULL ORDER BY id ASC`,
              [scenario.scenario.aziendaId]
            )
          ).rows;
    const vociEnte: VoceEnte[] = righe.map((r) => ({
      voce: String(r.voce),
      importo: Number(r.importo),
    }));
    const confronto = confrontaProvvedimento(vociEnte, lettura, tipo);

    await assicuraTabelleScenari(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".istruttoria_giudice
         (scenario_id, documenti, lettura, confronto, lettura_il)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (scenario_id) DO UPDATE SET
         documenti = $2, lettura = $3, confronto = $4,
         relazione = NULL, generata_il = NULL, lettura_il = now()`,
      [scenarioId, JSON.stringify(documenti), JSON.stringify(lettura), JSON.stringify(confronto)]
    );

    // Solo ora i file della lettura precedente possono andare: la nuova è
    // salvata. Se qualcosa fosse fallito prima, i vecchi restavano leggibili.
    const nuovi = new Set(documenti.map((d) => d.url));
    if (statoPrecedente) {
      await Promise.all(
        statoPrecedente.documenti
          .filter((d) => !nuovi.has(d.url))
          .map((d) => del(d.url).catch(() => undefined))
      );
    }

    return {
      success: true,
      tipoIstruttoria: tipo,
      documenti,
      lettura,
      confronto,
      relazione: null,
      letturaIl: new Date().toISOString(),
      generataIl: null,
      posizioneAssente: vociEnte.length === 0,
    };
  } catch (error: any) {
    console.error('[caricaDocumentiProvvedimentoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile leggere il provvedimento: ${error.message || error}`,
    };
  }
}

/**
 * L'analisi critica. L'AI riceve il confronto già calcolato e scrive solo il
 * testo: non ricalcola, non stima, non cita rimedi o articoli. I file vengono
 * eliminati dopo la generazione, come per la proposta; il confronto e la
 * lettura restano, quindi il testo si può rigenerare senza ricaricare nulla.
 */
export async function generaAnalisiCriticaAction(
  nomeSchema: string,
  scenarioId: number
): Promise<{ success: boolean; relazione?: string; error?: string }> {
  try {
    const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!anthropic) return { success: false, error: messaggioChiaveAiMancante() };
    const bloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };

    const scenario = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenario.success || !scenario.scenario) {
      return { success: false, error: scenario.error || 'Scenario non trovato.' };
    }
    const tipo = scenario.scenario.tipoIstruttoria;
    if (tipo !== 'DECRETO_LIQUIDAZIONE' && tipo !== 'CRAM_DOWN') {
      return { success: false, error: 'Questo scenario non è un decreto o un cram down.' };
    }

    await assicuraTabelleScenari(nomeSchema);
    const stato = await rigaEsistente(nomeSchema, scenarioId);
    if (!stato?.lettura || !stato.confronto) {
      return { success: false, error: 'Leggi prima il provvedimento e i documenti allegati.' };
    }

    const quota = await consumaQuotaAi(pool, 'RISCONTRO', {
      utente: contesto.email || `spazio:${contesto.spazioId}`,
      spazioId: contesto.spazioId,
    });
    if (!quota.consentito) {
      return { success: false, error: quota.error || 'Limite di analisi raggiunto.' };
    }

    const prompt = promptAnalisiCritica({
      tipoAtto: tipo,
      nomeAzienda: scenario.scenario.ragioneSocialeAzienda,
      lettura: stato.lettura,
      confronto: stato.confronto,
    });

    let risposta: Anthropic.Messages.Message;
    try {
      risposta = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      console.error('[generaAnalisiCriticaAction] AI:', error);
      return {
        success: false,
        error:
          erroreServizioEsterno(error, 'AI') ||
          'Il servizio AI non è raggiungibile in questo momento. Riprova tra poco.',
      };
    }

    const testo = testoRisposta(risposta.content);
    if (!testo) {
      return { success: false, error: "L'analisi non ha prodotto un testo leggibile. Riprova." };
    }

    await pool.query(
      `UPDATE "${nomeSchema}".istruttoria_giudice
          SET relazione = $2, generata_il = now() WHERE scenario_id = $1`,
      [scenarioId, testo]
    );

    // I documenti hanno fatto il loro lavoro: si eliminano, come per la
    // proposta. Restano i dati letti e il confronto, che sono il risultato.
    await Promise.all(stato.documenti.map((d) => del(d.url).catch(() => undefined)));

    return { success: true, relazione: testo };
  } catch (error: any) {
    console.error('[generaAnalisiCriticaAction] Errore:', error);
    return { success: false, error: `Impossibile generare l'analisi: ${error.message || error}` };
  }
}
