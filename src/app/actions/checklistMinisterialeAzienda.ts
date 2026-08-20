'use server';

// Check List Ministeriale a livello Azienda — solo Redigente. Diversa
// dalla Check List generata da Screening per il Ricevente: qui le 56
// domande sono FISSE (Sezione II del decreto ministeriale, mai
// generate), non un questionario su misura. Lo Screening può
// pre-compilarne alcune quando i dati lo consentono con certezza, il
// resto va completato a mano — mai per invenzione.

import Anthropic from '@anthropic-ai/sdk';
import { del, get } from '@/lib/blobStore';
import { pool } from '@/lib/db';
import { assicuraTabelleScenari } from '@/db/provision';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';
import {
  calcolaQuadroQualitativo,
  type QuadroQualitativo,
  type RispostaPerCalcolo,
} from '@/lib/checklist/scoring';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';

const apiKey = process.env.ANTHROPIC_API_KEY;
// maxRetries: 1 — con timeout a 150s, i due retry di default rischiano di
// sforare il limite della funzione serverless e farla uccidere da Vercel
// (spinner infinito lato browser). Stesso principio dello screening ENTE.
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RispostaChecklistMinisterialeAzienda {
  domandaId: string;
  risposta: boolean | null;
  note: string | null;
  daScreening: boolean;
}

export interface StatoChecklistMinisterialeAzienda {
  risposte: RispostaChecklistMinisterialeAzienda[];
  quadro: QuadroQualitativo | null;
}

export async function ottieniChecklistMinisterialeAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; stato: StatoChecklistMinisterialeAzienda; error?: string }> {
  const statoVuoto: StatoChecklistMinisterialeAzienda = { risposte: [], quadro: null };
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: statoVuoto, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleScenari(nomeSchema);
    const risultato = await pool.query(
      `SELECT domanda_id, risposta, note, da_screening
       FROM "${nomeSchema}".azienda_checklist_ministeriale_risposte WHERE azienda_id = $1`,
      [aziendaId]
    );
    const risposte: RispostaChecklistMinisterialeAzienda[] = risultato.rows.map((r) => ({
      domandaId: r.domanda_id,
      risposta: r.risposta,
      note: r.note,
      daScreening: r.da_screening,
    }));

    const mappaPerCalcolo: Record<string, RispostaPerCalcolo> = {};
    for (const r of risposte) {
      mappaPerCalcolo[r.domandaId] = { domandaId: r.domandaId, risposta: r.risposta };
    }
    const quadro = calcolaQuadroQualitativo(CHECKLIST_MINISTERIALE, mappaPerCalcolo);

    return { success: true, stato: { risposte, quadro } };
  } catch (error: any) {
    console.error('[ottieniChecklistMinisterialeAzienda] Errore:', error);
    return {
      success: false,
      stato: statoVuoto,
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

export async function salvaRispostaChecklistMinisterialeAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  domandaId: string,
  risposta: boolean | null,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_checklist_ministeriale_risposte
         (azienda_id, domanda_id, risposta, note, da_screening, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, now())
       ON CONFLICT (azienda_id, domanda_id)
       DO UPDATE SET risposta = $3, note = $4, da_screening = FALSE, updated_at = now()`,
      [aziendaId, domandaId, risposta, note]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaRispostaChecklistMinisterialeAziendaAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

/** Chiamata da un nuovo Scenario Redigente al momento della creazione
 * — copia quanto già risposto a livello Azienda (manuale o da
 * Screening) nella Check List Ministeriale dello scenario, così non
 * si riparte mai da zero. Solo le domande NON già risposte nello
 * scenario vengono scritte: se lo scenario aveva già una risposta,
 * non la sovrascrive. */
export async function ereditaChecklistMinisterialeInScenarioAction(
  nomeSchema: string,
  aziendaId: number,
  scenarioId: number
): Promise<{ success: boolean; copiate: number; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, copiate: 0, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleScenari(nomeSchema);
    const risultato = await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_risposte
         (scenario_id, modello_chiave, domanda_id, risposta, note, updated_at)
       SELECT $1, 'MINISTERIALE', domanda_id, risposta, note, now()
       FROM "${nomeSchema}".azienda_checklist_ministeriale_risposte
       WHERE azienda_id = $2 AND risposta IS NOT NULL
       ON CONFLICT (scenario_id, modello_chiave, domanda_id) DO NOTHING`,
      [scenarioId, aziendaId]
    );
    return { success: true, copiate: risultato.rowCount || 0 };
  } catch (error: any) {
    console.error('[ereditaChecklistMinisterialeInScenarioAction] Errore:', error);
    return {
      success: false,
      copiate: 0,
      error: `Impossibile ereditare le risposte: ${error.message || error}`,
    };
  }
}

export interface RisultatoPreCompilazioneMinisteriale {
  success: boolean;
  domandeCompilate: number;
  error?: string;
}

/** Pre-compila la Check List Ministeriale (56 domande fisse) dai
 * documenti caricati — solo Redigente, chiamata dallo Screening al
 * posto della generazione libera usata dal Ricevente. Non genera
 * nulla: le domande sono quelle di sempre, l'AI decide SOLO se i dati
 * forniti (bilancio XBRL, fascicolo storico) permettono di rispondere
 * con certezza a ciascuna — se non c'è un dato verificabile, la
 * domanda resta senza risposta, mai una risposta indovinata. */
export async function generaPreCompilazioneMinisterialeAction(
  nomeSchema: string,
  aziendaId: number,
  visuraUrl: string,
  nomeFileVisura: string
): Promise<RisultatoPreCompilazioneMinisteriale> {
  try {
    if (!anthropic) {
      return {
        success: false,
        domandeCompilate: 0,
        error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.',
      };
    }
    if (!validaSchema(nomeSchema)) {
      return { success: false, domandeCompilate: 0, error: 'Nome schema non valido.' };
    }

    const risultatoGet = await get(visuraUrl, { access: 'private' });
    if (!risultatoGet || risultatoGet.statusCode !== 200) {
      return {
        success: false,
        domandeCompilate: 0,
        error: 'Impossibile scaricare la visura dallo storage.',
      };
    }
    const buffer = Buffer.from(await new Response(risultatoGet.stream).arrayBuffer());
    const visuraBase64 = buffer.toString('base64');
    const intestazione = Buffer.from(visuraBase64.slice(0, 20), 'base64').toString('latin1');
    if (!intestazione.startsWith('%PDF-')) {
      return {
        success: false,
        domandeCompilate: 0,
        error: 'Il fascicolo storico deve essere un PDF valido.',
      };
    }

    await assicuraTabelleScenari(nomeSchema);

    const storicoRis = await ottieniStoricoXbrlAzienda(nomeSchema, aziendaId);
    const blocchiContesto: string[] = [];
    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ordinatoDesc = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      );
      const ultimo = ordinatoDesc[0];
      const precedente = ordinatoDesc[1];
      const d = ultimo.datiFinanziari;
      const formatta = (n: number) => `€ ${n.toLocaleString('it-IT')}`;
      blocchiContesto.push(
        `Bilancio XBRL anno ${ultimo.annoBilancio ?? 'n/d'} — Conto economico: ricavi vendite ${formatta(d.ricaviVendite)}, valore produzione ${formatta(d.valoreProduzione)}, costi produzione ${formatta(d.costiProduzione)}, EBIT ${formatta(d.ebit)}, ammortamenti ${formatta(d.ammortamenti)}, EBITDA ${formatta(d.ebitda)}, oneri finanziari ${formatta(d.oneriFinanziari)}, utile/perdita d'esercizio ${formatta(d.utileEsercizio)}.`
      );
      blocchiContesto.push(
        `Stato patrimoniale — Attivo: totale attivo ${formatta(d.totaleAttivo)}, immobilizzazioni ${formatta(d.immobilizzazioni)}, attivo circolante ${formatta(d.attivoCircolante)}, disponibilità liquide ${formatta(d.disponibilitaLiquide)}, crediti verso clienti ${formatta(d.creditiClienti)}.`
      );
      blocchiContesto.push(
        `Stato patrimoniale — Passivo: patrimonio netto ${formatta(d.patrimonioNetto)}, totale debiti ${formatta(d.totaleDebiti)} (di cui verso banche ${formatta(d.debitiBanche)}, verso fornitori ${formatta(d.debitiFornitori)}, tributari ${formatta(d.debitiTributari)}, previdenziali ${formatta(d.debitiPrevidenziali)}), passivo corrente ${formatta(d.passivoCorrente)}. Severità CCII: ${ultimo.severity}.`
      );
      if (precedente) {
        const dp = precedente.datiFinanziari;
        blocchiContesto.push(
          `Confronto con l'esercizio precedente (${precedente.annoBilancio ?? 'n/d'}): ricavi ${formatta(dp.ricaviVendite)} → ${formatta(d.ricaviVendite)}, patrimonio netto ${formatta(dp.patrimonioNetto)} → ${formatta(d.patrimonioNetto)}, totale debiti ${formatta(dp.totaleDebiti)} → ${formatta(d.totaleDebiti)}, utile/perdita ${formatta(dp.utileEsercizio)} → ${formatta(d.utileEsercizio)}.`
        );
      }
      const indiciTesto = ultimo.indici
        .map((i) => `${i.nome}: ${i.valore} (${i.esito})`)
        .join('; ');
      if (indiciTesto) blocchiContesto.push(`Indici CCII: ${indiciTesto}.`);
    } else {
      blocchiContesto.push('Nessun bilancio XBRL ancora caricato per questa azienda.');
    }

    const elencoDomande = CHECKLIST_MINISTERIALE.flatMap((sezione) =>
      sezione.domande.map((d) => `${d.id} [${sezione.titolo}]: ${d.domanda}`)
    ).join('\n');

    const prompt = `Hai a disposizione il bilancio XBRL e il fascicolo storico (visura camerale) di un'azienda. Qui sotto trovi le 56 domande fisse della Check List Ministeriale (Sezione II del decreto sulla composizione negoziata della crisi) — non devi inventarle, sono un elenco chiuso.

DATI DISPONIBILI:
${blocchiContesto.join('\n')}

DOMANDE (id, sezione, testo):
${elencoDomande}

Il tuo compito: per ciascuna domanda, decidi se i dati sopra o il documento allegato permettono di rispondere con CERTEZZA — non con una stima plausibile, non con un'inferenza ragionevole, solo se il dato è letteralmente presente e verificabile. Molte domande riguardano fatti che né il bilancio né la visura possono dire (es. governance, rapporti coi dipendenti, assetti organizzativi non documentati): per queste, NON rispondere — ometterle dall'elenco che restituisci è la risposta corretta, non un fallimento.

Rispondi SOLO con JSON valido, nessun testo prima o dopo, in questo formato esatto — includi SOLO le domande a cui puoi rispondere con certezza:
{
  "risposte": [
    { "id": "1.1", "risposta": true, "motivazione": "breve nota su quale dato lo dimostra" }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: visuraBase64 },
              title: nomeFileVisura,
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const testoGrezzo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    let parsed: { risposte: { id: string; risposta: boolean; motivazione?: string }[] };
    try {
      parsed = JSON.parse(testoGrezzo);
    } catch (erroreParsing) {
      console.error('[generaPreCompilazioneMinisterialeAction] Parsing fallito:', {
        stopReason: response.stop_reason,
        lunghezzaTesto: testoGrezzo.length,
        erroreParsing: erroreParsing instanceof Error ? erroreParsing.message : erroreParsing,
      });
      return {
        success: false,
        domandeCompilate: 0,
        error:
          "L'assistente non ha restituito una pre-compilazione leggibile — puoi comunque compilare la Check List a mano.",
      };
    }

    const idValidi = new Set(CHECKLIST_MINISTERIALE.flatMap((s) => s.domande.map((d) => d.id)));
    let salvate = 0;
    for (const r of parsed.risposte || []) {
      if (!idValidi.has(r.id) || typeof r.risposta !== 'boolean') continue;
      await pool.query(
        `INSERT INTO "${nomeSchema}".azienda_checklist_ministeriale_risposte
           (azienda_id, domanda_id, risposta, note, da_screening, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, now())
         ON CONFLICT (azienda_id, domanda_id)
         DO UPDATE SET risposta = $3, note = $4, da_screening = TRUE, updated_at = now()`,
        [aziendaId, r.id, r.risposta, r.motivazione || null]
      );
      salvate++;
    }

    return { success: true, domandeCompilate: salvate };
  } catch (error: any) {
    console.error('[generaPreCompilazioneMinisterialeAction] Errore:', error);
    return {
      success: false,
      domandeCompilate: 0,
      error: `Impossibile pre-compilare: ${error.message || error}`,
    };
  } finally {
    try {
      await del(visuraUrl);
    } catch (erroreEliminazione) {
      console.error(
        '[generaPreCompilazioneMinisterialeAction] Errore eliminazione blob:',
        erroreEliminazione
      );
    }
  }
}
