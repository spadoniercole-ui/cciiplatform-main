'use server';

// Piano dell'azienda e confronto con il piano automatico di settore
// (percorso Ricevente, passo «Piano di sviluppo», solo con il flag dello
// scenario). Qui: lettura e salvataggio del piano normalizzato, memoria
// dell'abbinamento delle voci per azienda, soglie dei semafori, estrazione
// da PDF con l'AI (sempre seguita dalla conferma dell'operatore: l'AI legge,
// non salva). Il confronto si calcola nel browser con i moduli puri.

import {
  richiediAccessoScenario,
  richiediAccessoSchema,
  richiediAccessoSpazio,
  verificaFileDelloSpazio,
} from '@/lib/autorizzazione';
import Anthropic from '@anthropic-ai/sdk';
import { del, get } from '@/lib/blobStore';
import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { verificaScenarioNonBloccato } from '@/app/actions/scenari';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { estraiJson } from '@/lib/visura/fatti';
import {
  RIGHE_AZIENDA,
  valoriPuliti,
  type DestinazioneVoce,
  type PianoAzienda,
  type ValoriPianoAzienda,
} from '@/lib/piano/pianoAziendale';
import { ETICHETTA_RIGA } from '@/lib/piano/piano';
import { soglieValide, type SoglieConfronto } from '@/lib/piano/confronto';
import type { PuntoSerie } from '@/lib/piano/automatico';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

const valida = (s: string) => /^[a-z0-9_]+$/.test(s);

const DESTINAZIONI: DestinazioneVoce[] = [...RIGHE_AZIENDA, 'costiProduzioneTotali', 'esclusa'];

export interface DatiConfrontoPiano {
  piano: PianoAzienda | null;
  soglie: SoglieConfronto;
  settore: { punti: PuntoSerie[]; descrizione: string | null; motivo: string | null };
  abbinamento: Record<string, DestinazioneVoce>;
  unita: number;
}

export async function ottieniConfrontoPianoAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number
): Promise<{ success: boolean; dati?: DatiConfrontoPiano; error?: string }> {
  if (!valida(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    await assicuraTabelleParametriSpazio(nomeSchema);
    const [pianoRis, soglieRis, tracciatoRis, settoreRis] = await Promise.all([
      pool.query(`SELECT * FROM "${nomeSchema}".piano_aziendale WHERE scenario_id = $1`, [
        scenarioId,
      ]),
      pool.query(
        `SELECT soglia_verde, soglia_gialla FROM "${nomeSchema}".parametri_confronto_piano WHERE id = 1`
      ),
      pool.query(
        `SELECT abbinamento, unita FROM "${nomeSchema}".tracciati_piano_aziendale WHERE azienda_id = $1`,
        [aziendaId]
      ),
      ottieniDatiSettore(nomeSchema, aziendaId),
    ]);
    const r = pianoRis.rows[0];
    const s = soglieRis.rows[0];
    const abbinamento: Record<string, DestinazioneVoce> = {};
    for (const [k, v] of Object.entries(
      (tracciatoRis.rows[0]?.abbinamento as Record<string, unknown>) ?? {}
    )) {
      if (DESTINAZIONI.includes(v as DestinazioneVoce)) abbinamento[k] = v as DestinazioneVoce;
    }
    return {
      success: true,
      dati: {
        piano: r
          ? {
              valori: valoriPuliti(r.valori),
              origine: r.origine,
              nomeFile: r.nome_file ?? null,
              documentoId: r.documento_id ?? null,
              note: r.note ?? null,
              salvatoIl: r.salvato_il ? new Date(r.salvato_il).toISOString() : null,
            }
          : null,
        soglie: soglieValide({
          verde:
            s?.soglia_verde !== null && s?.soglia_verde !== undefined
              ? Number(s.soglia_verde)
              : undefined,
          giallo:
            s?.soglia_gialla !== null && s?.soglia_gialla !== undefined
              ? Number(s.soglia_gialla)
              : undefined,
        }),
        settore: {
          punti: settoreRis.success ? settoreRis.punti : [],
          descrizione: settoreRis.info ? `ATECO ${settoreRis.info.gruppo}` : null,
          motivo: settoreRis.success ? null : (settoreRis.error ?? null),
        },
        abbinamento,
        unita: Number(tracciatoRis.rows[0]?.unita ?? 1) || 1,
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniConfrontoPianoAction]', error);
    return {
      success: false,
      error: `Impossibile leggere il piano dell’azienda: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaPianoAziendaleAction(
  codiceSpazio: string,
  scenarioId: number,
  aziendaId: number,
  piano: {
    valori: ValoriPianoAzienda;
    origine: 'excel' | 'pdf' | 'manuale';
    nomeFile: string | null;
    documentoId: number | null;
    note: string | null;
  },
  memoria: { abbinamento: Record<string, DestinazioneVoce>; unita: number } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contesto.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    const s = contesto.nomeSchema;
    const bloccato = await verificaScenarioNonBloccato(s, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    const valori = valoriPuliti(piano.valori);
    if (Object.keys(valori).length === 0)
      return { success: false, error: 'Il piano non contiene valori da salvare.' };
    if (!['excel', 'pdf', 'manuale'].includes(piano.origine))
      return { success: false, error: 'Origine non valida.' };
    await assicuraTabelleParametriSpazio(s);
    await pool.query(
      `INSERT INTO "${s}".piano_aziendale (scenario_id, valori, origine, nome_file, documento_id, note, salvato_il)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, now())
       ON CONFLICT (scenario_id) DO UPDATE SET valori = EXCLUDED.valori, origine = EXCLUDED.origine,
         nome_file = EXCLUDED.nome_file, documento_id = EXCLUDED.documento_id, note = EXCLUDED.note, salvato_il = now()`,
      [
        scenarioId,
        JSON.stringify(valori),
        piano.origine,
        piano.nomeFile?.slice(0, 255) ?? null,
        Number.isInteger(piano.documentoId) ? piano.documentoId : null,
        piano.note?.trim().slice(0, 4000) || null,
      ]
    );
    if (memoria) {
      const abb: Record<string, DestinazioneVoce> = {};
      for (const [k, v] of Object.entries(memoria.abbinamento ?? {}))
        if (k.length <= 300 && DESTINAZIONI.includes(v)) abb[k] = v;
      const unita = [1, 1000, 1_000_000].includes(memoria.unita) ? memoria.unita : 1;
      await pool.query(
        `INSERT INTO "${s}".tracciati_piano_aziendale (azienda_id, abbinamento, unita, aggiornato_il)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (azienda_id) DO UPDATE SET
           abbinamento = "${s}".tracciati_piano_aziendale.abbinamento || EXCLUDED.abbinamento,
           unita = EXCLUDED.unita, aggiornato_il = now()`,
        [aziendaId, JSON.stringify(abb), unita]
      );
    }
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

export async function eliminaPianoAziendaleAction(
  codiceSpazio: string,
  scenarioId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    await richiediAccessoScenario(contesto.nomeSchema, scenarioId, {
      modulo: ['simulazione'],
      livello: 'SCRITTURA',
    });
    const bloccato = await verificaScenarioNonBloccato(contesto.nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    await pool.query(
      `DELETE FROM "${contesto.nomeSchema}".piano_aziendale WHERE scenario_id = $1`,
      [scenarioId]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

export async function ottieniSoglieConfrontoAction(
  nomeSchema: string
): Promise<{ success: boolean; soglie: SoglieConfronto; personalizzate: boolean; error?: string }> {
  const predefinite = soglieValide(null);
  if (!valida(nomeSchema))
    return {
      success: false,
      soglie: predefinite,
      personalizzate: false,
      error: 'Nome schema non valido.',
    };
  try {
    await richiediAccessoSchema(nomeSchema);
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(
      `SELECT soglia_verde, soglia_gialla FROM "${nomeSchema}".parametri_confronto_piano WHERE id = 1`
    );
    if (!r.rows[0]) return { success: true, soglie: predefinite, personalizzate: false };
    return {
      success: true,
      soglie: soglieValide({
        verde: Number(r.rows[0].soglia_verde),
        giallo: Number(r.rows[0].soglia_gialla),
      }),
      personalizzate: true,
    };
  } catch (error: unknown) {
    return {
      success: false,
      soglie: predefinite,
      personalizzate: false,
      error: (error as Error).message,
    };
  }
}

export async function salvaSoglieConfrontoAction(
  codiceSpazio: string,
  soglie: SoglieConfronto | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const s = contesto.nomeSchema;
    await assicuraTabelleParametriSpazio(s);
    if (soglie === null) {
      await pool.query(`DELETE FROM "${s}".parametri_confronto_piano WHERE id = 1`);
      return { success: true };
    }
    if (!(soglie.verde >= 0 && soglie.giallo > soglie.verde && soglie.giallo <= 200))
      return {
        success: false,
        error: 'La soglia gialla deve essere maggiore della verde (e al massimo 200%).',
      };
    await pool.query(
      `INSERT INTO "${s}".parametri_confronto_piano (id, soglia_verde, soglia_gialla, aggiornato_il) VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET soglia_verde = $1, soglia_gialla = $2, aggiornato_il = now()`,
      [soglie.verde, soglie.giallo]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

const PROMPT_ESTRAZIONE_PIANO = `Nel documento allegato c'è il piano economico-finanziario di un'impresa (piano industriale, business plan, piano di risanamento o simile). Estrai SOLO i numeri previsionali, anno per anno, e riportali sulle righe qui sotto. Non inventare: se una riga non è nel documento, omettila. Non calcolare voci che il documento non riporta (unica eccezione: se il documento dà i costi per natura — materie, servizi, personale, godimento beni, oneri diversi — sommali in «costiOperativi», senza gli ammortamenti).

Righe ammesse (chiave: significato):
${RIGHE_AZIENDA.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]}`).join('\n')}

Regole:
- valori in EURO interi (se il documento è in migliaia o milioni, moltiplica e dillo in "unitaDocumento");
- anni solari a 4 cifre come chiavi (es. "2027"); ignora i consuntivi se sono chiaramente passati rispetto al piano, ma riportali se il piano li affianca come anno base;
- costi e ammortamenti come numeri positivi;
- per ogni riga indica in "fonti" dove l'hai letta (pagina o nome della tabella/voce del documento).

Rispondi SOLO con un oggetto JSON, senza testo prima o dopo:
{"valori": {"ricaviVendite": {"2026": 1200000, "2027": 1300000}}, "fonti": {"ricaviVendite": "pag. 12, tabella Conto economico previsionale, voce Ricavi"}, "unitaDocumento": "migliaia di euro", "orizzonte": "2026-2030", "note": "eventuali avvertenze sulla lettura"}
Se il documento non contiene un piano numerico, rispondi {"valori": {}, "note": "motivo"}.`;

export interface EstrazionePianoPdf {
  valori: ValoriPianoAzienda;
  fonti: Partial<Record<string, string>>;
  unitaDocumento: string | null;
  note: string | null;
}

export async function estraiPianoAziendaleDaPdfAction(
  codiceSpazio: string,
  url: string,
  nomeFile: string
): Promise<{ success: boolean; estrazione?: EstrazionePianoPdf; error?: string }> {
  try {
    await richiediAccessoSpazio(codiceSpazio, { modulo: ['simulazione'], livello: 'SCRITTURA' });
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) return { success: false, error: 'Accesso non valido.' };
    // Il file deve appartenere a questo spazio prima di leggerlo o cancellarlo.
    verificaFileDelloSpazio(contesto, url);
    if (!anthropic) {
      await del(url).catch(() => undefined);

      return {
        success: false,
        error:
          'Chiave API ANTHROPIC_API_KEY non configurata nel server: la lettura del PDF con l’AI non è disponibile. Usa l’import da Excel.',
      };
    }
    const g = await get(url, { access: 'private' });
    if (!g || g.statusCode !== 200)
      return { success: false, error: `Impossibile scaricare «${nomeFile}» dallo storage.` };
    const buffer = Buffer.from(await new Response(g.stream).arrayBuffer());
    // Il file non si conserva: serve solo alla lettura.
    await del(url).catch(() => undefined);
    if (buffer.length > 20 * 1024 * 1024)
      return { success: false, error: `«${nomeFile}» supera i 20MB.` };
    const base64 = buffer.toString('base64');
    if (!Buffer.from(base64.slice(0, 20), 'base64').toString('latin1').startsWith('%PDF-'))
      return { success: false, error: `«${nomeFile}» non è un PDF valido.` };
    const risposta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
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
            { type: 'text', text: PROMPT_ESTRAZIONE_PIANO },
          ],
        },
      ],
    });
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const json = estraiJson(testo) as Record<string, unknown> | null;
    if (!json)
      return {
        success: false,
        error:
          'La lettura del PDF non ha prodotto un risultato leggibile. Riprova o usa l’import da Excel.',
      };
    const fonti: Partial<Record<string, string>> = {};
    for (const [k, v] of Object.entries((json.fonti as Record<string, unknown>) ?? {}))
      if (RIGHE_AZIENDA.includes(k as never) && typeof v === 'string') fonti[k] = v.slice(0, 300);
    return {
      success: true,
      estrazione: {
        valori: valoriPuliti(json.valori),
        fonti,
        unitaDocumento:
          typeof json.unitaDocumento === 'string' ? json.unitaDocumento.slice(0, 80) : null,
        note: typeof json.note === 'string' ? json.note.slice(0, 1000) : null,
      },
    };
  } catch (error: unknown) {
    console.error('[estraiPianoAziendaleDaPdfAction]', error);
    return {
      success: false,
      error: `Lettura del PDF non riuscita: ${(error as Error).message || error}`,
    };
  }
}
