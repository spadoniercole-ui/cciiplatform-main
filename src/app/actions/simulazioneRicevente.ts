'use server';

// Simulazione Ricevente — per chi VALUTA una proposta arrivata, non chi
// la scrive. Un solo output: un'analisi testuale che incrocia quello che
// i documenti allegati dichiarano con quello che i dati già in
// piattaforma (Proposta, Indici, trend Settore) suggeriscono. Nessun
// calcolo, nessuna leva — è un lavoro di lettura critica, non di
// aritmetica. Vedi il commento in db/provision.ts (assicuraTabella
// SimulazioneRicevente) sul perché i PDF non si conservano.

import { richiediAccessoScenario, verificaFileDelloSpazio } from '@/lib/autorizzazione';
import Anthropic from '@anthropic-ai/sdk';
import { erroreServizioEsterno, messaggioChiaveAiMancante } from '@/lib/serviziEsterni';
import { del, get } from '@/lib/blobStore';
import { bloccoIstruzioniOperatore } from '@/lib/istruzioniOperatore';
import { pool } from '@/lib/db';
import { assicuraTabellaSimulazioneRicevente } from '@/db/provision';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
} from '@/app/actions/propostaScenario';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { crescitaAzienda, crescitaDaSerie } from '@/lib/piano/automatico';
import { ottieniLimitiRicevibilita } from '@/app/actions/parametriSpazio';
import { voceStrumento } from '@/lib/proposta/inquadramento';
import {
  normalizzaPrimaLettura,
  promptPrimaLettura,
  type PrimaLettura,
  type TipoDocumentoRicevuto,
} from '@/lib/proposta/primaLettura';
import {
  classificaDocumenti,
  elencoDaSalvato,
  ruoliDaDocumenti,
  type DocumentoRicevuto,
} from '@/lib/proposta/documentiRicevuti';
import type { LetturaPosizionePdf } from '@/lib/posizioneAggiornata/letturaPdf';
import { leggiPosizioneDaPdf } from '@/lib/posizioneAggiornata/letturaPdfServer';

const apiKey = process.env.ANTHROPIC_API_KEY;
// timeout esplicito + maxRetries: 1 (non il default 2): due chiamate pesanti in
// parallelo su PDF grandi, con due retry a 150s l'una, sforerebbero il limite
// della funzione serverless e la farebbero uccidere da Vercel PRIMA di
// rispondere (spinner infinito lato browser). A difesa ulteriore, un
// AbortController con scadenza esplicita attorno alle chiamate.
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

// Scadenza complessiva dell'analisi documenti, sotto il maxDuration della
// pagina: se le chiamate AI non rientrano, si abortisce e si restituisce un
// errore leggibile invece di far uccidere la funzione da Vercel.
const SCADENZA_ANALISI_MS = 240 * 1000;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface DocumentoPdf {
  nome: string;
  /** URL Vercel Blob — il file è già caricato dal browser, questa Server Action lo scarica da qui, non lo riceve nel corpo (limite Vercel di 4,5MB per il corpo di una funzione, non aggirabile da configurazione). */
  url: string;
}

const DIMENSIONE_MASSIMA_FILE = 20 * 1024 * 1024;
const NUMERO_MASSIMO_FILE = 8;

function isPdfValido(base64: string): boolean {
  try {
    const intestazione = Buffer.from(base64.slice(0, 20), 'base64').toString('latin1');
    return intestazione.startsWith('%PDF-');
  } catch {
    return false;
  }
}

/** L'importo offerto non si inserisce a mano — lo estrae l'AI dal PDF
 * della proposta di cram down. Se il documento non lo quantifica
 * chiaramente per questo ente, estrazioneRiuscita è false e
 * motivoMancata spiega perché — mai un fallimento silenzioso. */
export interface EstrazioneOffertaRicevente {
  estrazioneRiuscita: boolean;
  importoDovuto: number | null;
  percentualeOfferta: number | null;
  modalita: 'UNICA_SOLUZIONE' | 'RATEALE' | null;
  numeroRate: number | null;
  motivoMancata: string | null;
  /** Credito al netto di sanzioni, interessi e somme aggiuntive (base art. 63). */
  importoCapitale?: number | null;
  /** Percentuale offerta su quella base. */
  percentualeOffertaCapitale?: number | null;
}

export interface RisultatoAnalisiRicevente {
  success: boolean;
  analisi?: string;
  nomiFile?: string[];
  generataIl?: string;
  /** Nomi dei tre documenti attesi (asseverazione, proposta di cram down, piano di sviluppo) mancanti — usato per il "sentimento" che penalizza il giudizio finale, non solo informativo. */
  documentiMancanti?: string[];
  estrazione?: EstrazioneOffertaRicevente;
  /** true se l'analisi critica si è interrotta per il limite di token prima di finire — il testo mostrato è parziale. */
  troncata?: boolean;
  error?: string;
}

export interface TreDocumentiRicevente {
  asseverazione: DocumentoPdf | null;
  propostaCramDown: DocumentoPdf | null;
  pianoSviluppo: DocumentoPdf | null;
}

type DocumentoScaricato = { nome: string; base64: string };

function numeroONull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Scarica e controlla i PDF dallo storage dello spazio. */
async function scaricaDocumenti(
  documenti: DocumentoPdf[]
): Promise<{ documenti: DocumentoScaricato[] } | { error: string }> {
  const out: DocumentoScaricato[] = [];
  for (const doc of documenti) {
    const risultatoGet = await get(doc.url, { access: 'private' });
    if (!risultatoGet || risultatoGet.statusCode !== 200) {
      return { error: `Impossibile scaricare "${doc.nome}" dallo storage.` };
    }
    const buffer = Buffer.from(await new Response(risultatoGet.stream).arrayBuffer());
    if (buffer.length > DIMENSIONE_MASSIMA_FILE) {
      return { error: `"${doc.nome}" supera i 20MB consentiti per file.` };
    }
    const base64 = buffer.toString('base64');
    if (!isPdfValido(base64)) {
      return { error: `"${doc.nome}" non è un PDF valido — solo file PDF sono ammessi.` };
    }
    out.push({ nome: doc.nome, base64 });
  }
  return { documenti: out };
}

/** I documenti caricati al primo passo e non ancora consumati dalla valutazione. */
async function leggiDocumentiCaricati(
  nomeSchema: string,
  scenarioId: number
): Promise<DocumentoRicevuto[]> {
  const r = await pool
    .query(
      `SELECT documenti_caricati FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
      [scenarioId]
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return elencoDaSalvato(r.rows[0]?.documenti_caricati);
}

/** Riga degli alias dell'ente per i prompt (l'ente nei documenti ha altri nomi). */
async function rigaAliasEnte(nomeSchema: string): Promise<string> {
  const limitiEnteRis = await ottieniLimitiRicevibilita(nomeSchema, 'ENTE');
  const aliasEnte = limitiEnteRis.success ? limitiEnteRis.limiti[0]?.alias || [] : [];
  return aliasEnte.length > 0
    ? ` Questo ente può comparire nei documenti con nomi o termini diversi dal proprio acronimo: considera equivalenti ${aliasEnte.join(', ')}.`
    : '';
}

export interface StatoDocumentiRicevente {
  success: boolean;
  /** Documenti caricati e in attesa di valutazione, con il tipo assegnato. */
  documenti?: { nome: string; tipo: TipoDocumentoRicevuto }[] | null;
  primaLettura?: PrimaLettura | null;
  primaLetturaIl?: string | null;
  /** Valori della situazione contabile letti dal documento, da confermare. */
  posizioneLetta?: LetturaPosizionePdf | null;
  /** La prima lettura non è riuscita (i documenti però sono caricati). */
  erroreLettura?: string;
  /** Documenti su cui è stata fatta l'ultima valutazione (i file non ci sono più). */
  documentiEsaminati?: { nome: string; tipo: TipoDocumentoRicevuto }[] | null;
  error?: string;
}

const pubblici = (el: DocumentoRicevuto[]) => el.map((d) => ({ nome: d.nome, tipo: d.tipo }));

/** Elenco salvato dei documenti valutati: solo nome e tipo (i file non ci sono più). */
function elencoEsaminati(grezzo: unknown): { nome: string; tipo: TipoDocumentoRicevuto }[] | null {
  if (!Array.isArray(grezzo)) return null;
  const el = grezzo
    .filter((d) => d && typeof d.nome === 'string')
    .map((d) => ({ nome: String(d.nome), tipo: d.tipo as TipoDocumentoRicevuto }));
  return el.length ? el : null;
}

/**
 * PASSI 1 e 2: un solo caricamento per TUTTI i documenti ricevuti, così come
 * li ha mandati l'azienda. La prima lettura li classifica (proposta,
 * attestazione, piano, situazione contabile, altro) e propone strumento,
 * data di deposito, quota degli altri aderenti e offerta all'ente, citando
 * il passo; dalla situazione contabile, se c'è, ricava i valori della
 * Posizione Aggiornata da confermare. I file restano fino alla valutazione.
 * Una nuova carica sostituisce (ed elimina) la precedente.
 */
export async function caricaDocumentiRiceventeAction(
  nomeSchema: string,
  scenarioId: number,
  documenti: DocumentoPdf[]
): Promise<StatoDocumentiRicevente> {
  const contesto = await richiediAccessoScenario(nomeSchema, scenarioId, {
    modulo: ['report'],
    livello: 'SCRITTURA',
  });
  for (const d of documenti) verificaFileDelloSpazio(contesto, d.url);
  if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
  if (messaggioBloccato) return { success: false, error: messaggioBloccato };
  if (documenti.length === 0) return { success: false, error: 'Nessun documento caricato.' };
  if (documenti.length > NUMERO_MASSIMO_FILE)
    return { success: false, error: `Massimo ${NUMERO_MASSIMO_FILE} documenti.` };
  await assicuraTabellaSimulazioneRicevente(nomeSchema);

  // Sostituzione: i file della carica precedente non restano orfani.
  const precedenti = await leggiDocumentiCaricati(nomeSchema, scenarioId);
  const nuoviUrl = new Set(documenti.map((d) => d.url));
  await Promise.all(
    precedenti.filter((d) => !nuoviUrl.has(d.url)).map((d) => del(d.url).catch(() => undefined))
  );

  let elenco = classificaDocumenti(documenti, []);
  const salva = async (lettura: PrimaLettura | null, posizione: LetturaPosizionePdf | null) =>
    pool.query(
      `INSERT INTO "${nomeSchema}".simulazione_ricevente (scenario_id, documenti_caricati, prima_lettura, prima_lettura_il, posizione_letta)
       VALUES ($1, $2, $3, CASE WHEN $3::jsonb IS NULL THEN NULL ELSE now() END, $4)
       ON CONFLICT (scenario_id) DO UPDATE SET documenti_caricati = $2, prima_lettura = $3,
         prima_lettura_il = CASE WHEN $3::jsonb IS NULL THEN NULL ELSE now() END, posizione_letta = $4`,
      [
        scenarioId,
        JSON.stringify({ elenco }),
        lettura ? JSON.stringify(lettura) : null,
        posizione ? JSON.stringify(posizione) : null,
      ]
    );
  await salva(null, null);

  // Prima lettura: se non riesce, i documenti restano caricati e
  // classificati dal nome del file; l'inquadramento si compila a mano.
  try {
    if (!anthropic)
      return {
        success: true,
        documenti: pubblici(elenco),
        erroreLettura: messaggioChiaveAiMancante(),
      };
    const scaricati = await scaricaDocumenti(documenti);
    if ('error' in scaricati)
      return { success: true, documenti: pubblici(elenco), erroreLettura: scaricati.error };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120 * 1000);
    let risposta: Anthropic.Messages.Message;
    try {
      risposta = await anthropic.messages.create(
        {
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          thinking: { type: 'disabled' },
          messages: [
            {
              role: 'user',
              content: [
                ...scaricati.documenti.map((doc): Anthropic.Messages.ContentBlockParam => ({
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
                  title: doc.nome,
                })),
                { type: 'text', text: promptPrimaLettura(await rigaAliasEnte(nomeSchema)) },
              ],
            },
          ],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const inizio = testo.indexOf('{');
    const fine = testo.lastIndexOf('}');
    let grezzo: unknown = null;
    try {
      grezzo = inizio >= 0 && fine > inizio ? JSON.parse(testo.slice(inizio, fine + 1)) : null;
    } catch {
      grezzo = null;
    }
    if (!grezzo) {
      return {
        success: true,
        documenti: pubblici(elenco),
        erroreLettura:
          'La prima lettura non ha prodotto una risposta leggibile: controlla il tipo dei documenti e compila l’inquadramento a mano.',
      };
    }
    const primaLettura = normalizzaPrimaLettura(grezzo);
    elenco = classificaDocumenti(documenti, primaLettura.documenti);

    // Situazione contabile ricevuta: i suoi valori vanno nella Posizione
    // Aggiornata senza un secondo caricamento.
    const situazione = ruoliDaDocumenti(elenco).situazioneContabile;
    let posizione: LetturaPosizionePdf | null = null;
    if (situazione) {
      const doc = scaricati.documenti.find((d) => d.nome === situazione.nome);
      if (doc) {
        posizione = await leggiPosizioneDaPdf(anthropic, doc.base64, doc.nome, 100 * 1000).catch(
          () => null
        );
      }
    }
    await salva(primaLettura, posizione);
    return {
      success: true,
      documenti: pubblici(elenco),
      primaLettura,
      primaLetturaIl: new Date().toISOString(),
      posizioneLetta: posizione,
    };
  } catch (error: unknown) {
    console.error('[caricaDocumentiRiceventeAction] Prima lettura:', error);
    return {
      success: true,
      documenti: pubblici(elenco),
      erroreLettura:
        erroreServizioEsterno(error, 'AI') ??
        `Prima lettura non riuscita: ${(error as Error).message}. Compila l’inquadramento a mano.`,
    };
  }
}

/** L'istruttore corregge il tipo di un documento ricevuto. */
export async function aggiornaTipoDocumentoRiceventeAction(
  nomeSchema: string,
  scenarioId: number,
  nome: string,
  tipo: TipoDocumentoRicevuto
): Promise<{
  success: boolean;
  documenti?: { nome: string; tipo: TipoDocumentoRicevuto }[];
  error?: string;
}> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const elenco = await leggiDocumentiCaricati(nomeSchema, scenarioId);
    const nuovo = elenco.map((d) => (d.nome === nome ? { ...d, tipo } : d));
    await pool.query(
      `UPDATE "${nomeSchema}".simulazione_ricevente SET documenti_caricati = $2 WHERE scenario_id = $1`,
      [scenarioId, JSON.stringify({ elenco: nuovo })]
    );
    return { success: true, documenti: pubblici(nuovo) };
  } catch (error: unknown) {
    return { success: false, error: `Aggiornamento non riuscito: ${(error as Error).message}` };
  }
}

/** Documenti in attesa di valutazione e prima lettura, per riaprire la pagina dove si era. */
export async function ottieniDocumentiRiceventeAction(
  nomeSchema: string,
  scenarioId: number
): Promise<StatoDocumentiRicevente> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const r = await pool.query(
      `SELECT documenti_caricati, documenti_esaminati, prima_lettura, prima_lettura_il, posizione_letta FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
      [scenarioId]
    );
    const x = r.rows[0];
    const elenco = elencoDaSalvato(x?.documenti_caricati);
    return {
      success: true,
      documenti: elenco.length ? pubblici(elenco) : null,
      documentiEsaminati: elencoEsaminati(x?.documenti_esaminati),
      primaLettura: x?.prima_lettura ? normalizzaPrimaLettura(x.prima_lettura) : null,
      primaLetturaIl: x?.prima_lettura_il ? new Date(x.prima_lettura_il).toISOString() : null,
      // Già normalizzata al salvataggio.
      posizioneLetta: (x?.posizione_letta as LetturaPosizionePdf | null) ?? null,
    };
  } catch (error: unknown) {
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function analizzaDocumentiRiceventeAction(
  nomeSchema: string,
  scenarioId: number,
  istruzioniOperatore?: string
): Promise<RisultatoAnalisiRicevente> {
  await richiediAccessoScenario(nomeSchema, scenarioId, {
    modulo: ['report'],
    livello: 'SCRITTURA',
  });
  if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
  await assicuraTabellaSimulazioneRicevente(nomeSchema);
  // I documenti sono quelli CARICATI al primo passo (e già letti nella
  // prima lettura): la valutazione non li richiede di nuovo.
  const caricati = await leggiDocumentiCaricati(nomeSchema, scenarioId);
  const ruoli = ruoliDaDocumenti(caricati);
  const documentiNominati: TreDocumentiRicevente = {
    asseverazione: ruoli.attestazione,
    propostaCramDown: ruoli.proposta,
    pianoSviluppo: ruoli.piano,
  };
  // Tutti i documenti ricevuti entrano nella lettura: anche la situazione
  // contabile e gli altri (lettere, convocazioni) possono contenere ciò che
  // serve a valutare.
  const documenti: DocumentoPdf[] = [
    ruoli.proposta,
    ruoli.attestazione,
    ruoli.piano,
    ruoli.situazioneContabile,
    ...ruoli.altri,
  ].filter((d): d is DocumentoPdf => d !== null);
  let valutazioneRiuscita = false;
  try {
    if (!anthropic) {
      return {
        success: false,
        error: messaggioChiaveAiMancante(),
      };
    }
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    // La proposta di cram down è l'unico dei tre documenti la cui
    // assenza blocca del tutto l'analisi — senza di lei non c'è nulla
    // da leggere criticamente. Asseverazione e piano di sviluppo sono
    // opzionali: la loro assenza penalizza il giudizio finale (vedi
    // calcolaGiudizioFinaleRicevente), non impedisce l'analisi.
    if (!documentiNominati.propostaCramDown) {
      return {
        success: false,
        error:
          'Carica almeno la proposta di cram down prima di procedere — è l\u2019unico documento senza il quale l\u2019analisi non può partire.',
      };
    }
    if (documenti.length > NUMERO_MASSIMO_FILE) {
      return { success: false, error: `Massimo ${NUMERO_MASSIMO_FILE} file per volta.` };
    }
    // La valutazione parte solo dopo che l'istruttore ha CONFERMATO
    // l'inquadramento (strumento, data, quota): sono le sue scelte, non
    // quelle della prima lettura.
    const inq = await pool.query(
      `SELECT strumento_proposta, data_deposito_proposta, quota_altri_aderenti_manuale
         FROM "${nomeSchema}".scenari WHERE id = $1`,
      [scenarioId]
    );
    const inquadramento = inq.rows[0] ?? {};
    if (!inquadramento.strumento_proposta) {
      return {
        success: false,
        error:
          'Prima della valutazione conferma l’inquadramento della proposta (strumento, data di deposito, quota degli altri aderenti) e salvalo.',
      };
    }

    // I file sono già su Vercel Blob (caricati direttamente dal browser,
    // vedi il Route Handler blob-upload) — questa funzione li scarica da
    // lì per convertirli in base64 e passarli a Claude. Il corpo di
    // QUESTA chiamata contiene solo URL, pochi byte: il limite di 4,5MB
    // di Vercel per il corpo di una funzione non si applica più qui. Lo
    // store è privato — fetch() diretto sull'URL fallirebbe (richiede
    // autenticazione), serve get() del SDK.
    const scaricati = await scaricaDocumenti(documenti);
    if ('error' in scaricati) return { success: false, error: scaricati.error };
    const documentiConDati = scaricati.documenti;

    await assicuraTabellaSimulazioneRicevente(nomeSchema);

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const spazioRis = await pool.query(
      `SELECT tipo_spazio FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    const tipoSpazio: 'ENTE' | 'NON_ENTE' = spazioRis.rows[0]?.tipo_spazio || 'NON_ENTE';

    const [propostaRis, esitoRis, storicoRis, settoreRis] = await Promise.all([
      ottieniPropostaScenario(nomeSchema, scenarioId),
      verificaRicevibilitaProposta(nomeSchema, scenarioId, tipoSpazio),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottieniDatiSettore(nomeSchema, aziendaId),
    ]);

    const blocchiContesto: string[] = [];
    const voce = voceStrumento(String(inquadramento.strumento_proposta));
    blocchiContesto.push(
      `Inquadramento confermato dall'istruttore: strumento ${voce ? `${voce.etichetta} (${voce.riferimento})` : inquadramento.strumento_proposta}${
        inquadramento.data_deposito_proposta
          ? `, deposito il ${String(inquadramento.data_deposito_proposta).split('-').reverse().join('/')}`
          : ''
      }${
        inquadramento.quota_altri_aderenti_manuale !== null &&
        inquadramento.quota_altri_aderenti_manuale !== undefined
          ? `, quota degli altri aderenti ${(Number(inquadramento.quota_altri_aderenti_manuale) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
          : ''
      }. Leggi i documenti alla luce di questo strumento; se i documenti lo contraddicono, segnalalo.`
    );

    const rigaRilevante = propostaRis.success
      ? propostaRis.righe.find((r) => r.rilevantePerEnte)
      : null;
    if (rigaRilevante) {
      blocchiContesto.push(
        `Riga della proposta rilevante per l'ente: ${rigaRilevante.categoriaCreditore}, importo dovuto € ${rigaRilevante.importoDovuto.toLocaleString('it-IT')}, offerta ${rigaRilevante.percentualeOfferta}%, modalità ${rigaRilevante.modalita}${rigaRilevante.rangoLegale ? `, rango ${rigaRilevante.rangoLegale}` : ''}.`
      );
    }
    if (esitoRis.success && esitoRis.esito && rigaRilevante) {
      const esitoRigaRilevante = esitoRis.esito.righe.find((r) => r.id === rigaRilevante.id);
      if (esitoRigaRilevante) {
        blocchiContesto.push(
          `Riscontro con i parametri dell’ente già calcolato dalla piattaforma per quella riga: ${esitoRigaRilevante.ricevibile ? 'COERENTE CON I PARAMETRI CONFIGURATI' : 'NON COERENTE CON I PARAMETRI CONFIGURATI'} — ${esitoRigaRilevante.motivazione}.`
        );
      }
    }

    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ultimo = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      )[0];
      blocchiContesto.push(
        `Ultimo bilancio XBRL disponibile (anno ${ultimo.annoBilancio || 'n/d'}): ricavi delle vendite € ${ultimo.datiFinanziari.ricaviVendite.toLocaleString('it-IT')}, EBITDA € ${ultimo.datiFinanziari.ebitda.toLocaleString('it-IT')}, patrimonio netto € ${ultimo.datiFinanziari.patrimonioNetto.toLocaleString('it-IT')}, totale debiti € ${ultimo.datiFinanziari.totaleDebiti.toLocaleString('it-IT')}.`
      );

      const crescitaAz = crescitaAzienda(
        storicoRis.storico
          .filter((x) => x.annoBilancio)
          .map((x) => ({
            anno: x.annoBilancio as number,
            ricaviVendite: x.datiFinanziari.ricaviVendite,
          }))
          .sort((x, y) => y.anno - x.anno)
      );
      if (crescitaAz) {
        blocchiContesto.push(
          `Crescita storica dei ricavi dell'azienda, calcolata dai bilanci depositati: ${crescitaAz.tasso.toFixed(1)}% l'anno.`
        );
      }
    }

    if (settoreRis.success && settoreRis.punti.length > 0) {
      const crescitaSettore = crescitaDaSerie(settoreRis.punti);
      if (crescitaSettore) {
        blocchiContesto.push(
          `Crescita storica del settore ISTAT di riferimento (gruppo ATECO ${settoreRis.info?.gruppo || 'n/d'}): ${crescitaSettore.tasso.toFixed(1)}% l'anno.`
        );
      }
    }

    const contestoTesto =
      blocchiContesto.length > 0
        ? blocchiContesto.join('\n')
        : "Nessun dato strutturato ancora disponibile in piattaforma (Proposta, XBRL, Dati di Settore) — basa l'analisi solo sui documenti allegati, segnalando esplicitamente questa limitazione.";

    const blocchiDocumento: Anthropic.Messages.ContentBlockParam[] = documentiConDati.map(
      (doc) => ({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
        title: doc.nome,
      })
    );

    const documentiPresenti = [
      documentiNominati.propostaCramDown ? 'la proposta' : null,
      documentiNominati.asseverazione ? "l'attestazione del professionista" : null,
      documentiNominati.pianoSviluppo ? 'il piano' : null,
      ruoli.situazioneContabile ? 'la situazione contabile aggiornata' : null,
      ruoli.altri.length ? `altri documenti (${ruoli.altri.map((d) => d.nome).join(', ')})` : null,
    ].filter(Boolean);
    const documentiMancanti = [
      !documentiNominati.asseverazione ? 'Asseverazione del professionista' : null,
      !documentiNominati.pianoSviluppo ? 'Piano di sviluppo' : null,
    ].filter((d): d is string => d !== null);

    // Un ente scrive raramente di sé stesso col proprio acronimo nei
    // documenti che riceve — l'INPS in un atto formale può comparire
    // come "Ente previdenziale", "Istituto", ecc. — e per un ente
    // fiscale (Agenzia delle Entrate, internamente "ADE") il documento
    // può usare termini tematici come "ente fiscale", "debiti
    // tributari", "fiscali", "erariali", mai l'acronimo interno. Gli
    // alias configurati in Parametri di Spazio → Soglia di
    // ricevibilità coprono proprio questo: non solo varianti del nome,
    // anche termini di categoria che nel contesto si riferiscono senza
    // ambiguità a questo stesso ente.
    const limitiEnteRis = await ottieniLimitiRicevibilita(nomeSchema, 'ENTE');
    const aliasEnte = limitiEnteRis.success ? limitiEnteRis.limiti[0]?.alias || [] : [];
    const rigaAlias =
      aliasEnte.length > 0
        ? ` Questo ente può comparire nei documenti con nomi o termini diversi dal proprio acronimo interno — considera equivalenti a questo stesso ente anche: ${aliasEnte.join(', ')}. Se il documento usa uno di questi termini (o una variante plausibile, es. al plurale o con un aggettivo diverso), trattalo come riferito a questo ente: non dichiarare l'estrazione fallita solo perché l'acronimo esatto non compare mai nel testo.`
        : '';

    const promptTestuale = `Sei un assistente che aiuta un ente (creditore) a valutare criticamente una proposta ricevuta da un'impresa in crisi, nell'ambito dello strumento indicato nell'inquadramento confermato qui sotto (chiamalo con quel nome, non con un altro). Documenti allegati: ${documentiPresenti.join(', ')}.${documentiMancanti.length > 0 ? ` Mancano invece: ${documentiMancanti.join(', ')} — segnalalo esplicitamente all'inizio della relazione, è un'assenza rilevante per il giudizio.` : ''}${rigaAlias}

Il tuo compito NON è ricalcolare o riscrivere la proposta — è leggere criticamente cosa dichiarano i documenti allegati e confrontarlo con i dati che la piattaforma ha già raccolto sull'azienda, segnalando esplicitamente ogni incoerenza o affermazione poco credibile. Esempio del tipo di cosa da cercare: se un documento dichiara "il fatturato crescerà del 3% nei prossimi anni" ma il settore di riferimento è stagnante o in calo da tempo, questa è un'incoerenza da segnalare chiaramente, non da glissare.

DATI GIÀ RACCOLTI DALLA PIATTAFORMA:
${contestoTesto}

Struttura la risposta così:
1. Sintesi in 2-3 frasi di cosa propone l'azienda, secondo i documenti.
2. Punti di coerenza — cosa nei documenti è confermato o plausibile alla luce dei dati sopra.
3. Punti di incoerenza o da verificare — cosa nei documenti non torna, è ottimistico senza giustificazione, o contraddice i dati raccolti. Questa è la parte più importante: sii specifico, cita i numeri.
4. Una valutazione finale onesta e diretta: la proposta sembra credibile o ci sono segnali di allarme che meritano un supplemento di istruttoria.

Non esprimere valutazioni giuridiche sulla proposta (il riscontro con i parametri dell’ente lo fa già la piattaforma altrove) — il tuo compito è solo la credibilità di quello che l'azienda dichiara.${bloccoIstruzioniOperatore(istruzioniOperatore)}`;

    // Estrazione strutturata separata dall'analisi critica — output
    // JSON puro invece di prosa, per poter confrontare il numero con
    // la soglia configurata senza che l'utente debba rileggerlo a
    // mano dal documento. Legge TUTTI i documenti caricati, non solo
    // la proposta di cram down: nella pratica, il documento formale
    // spesso riporta solo l'importo del debito (senza la percentuale
    // offerta), mentre la percentuale è dettagliata nel piano di
    // sviluppo o nella relazione di asseverazione allegati — un caso
    // reale trovato in test, non un'ipotesi.
    const promptEstrazione = `Estrai dai documenti allegati (proposta di cram down, ed eventualmente asseverazione e piano di sviluppo se presenti) i dati economici dell'offerta fatta a QUESTO ente creditore specifico — non ad altri creditori eventualmente citati negli stessi documenti. La percentuale o l'importo offerto possono comparire in un documento diverso dalla proposta formale — es. il piano di sviluppo può specificare "20% a Erario ed Enti previdenziali" anche se il documento di proposta riporta solo l'importo del debito senza la percentuale: leggi tutti i documenti insieme prima di concludere che il dato manca.${rigaAlias}

Rispondi SOLO con JSON valido, nessun testo prima o dopo, in questo formato esatto:
{
  "estrazioneRiuscita": true,
  "importoDovuto": 0,
  "percentualeOfferta": 0,
  "importoCapitale": null,
  "percentualeOffertaCapitale": null,
  "modalita": "UNICA_SOLUZIONE",
  "numeroRate": null,
  "motivoMancata": null
}

"importoDovuto" e "percentualeOfferta" riguardano il credito TOTALE dell'ente. "importoCapitale" è lo stesso credito al netto di sanzioni, interessi e somme aggiuntive (per un ente previdenziale: i soli contributi), e "percentualeOffertaCapitale" la percentuale offerta su quel capitale: es. «100% dei contributi e 30% delle somme aggiuntive» → percentualeOffertaCapitale 100. Se il documento non distingue capitale e accessori, lasciali null: non stimarli.

"modalita" deve essere esattamente "UNICA_SOLUZIONE" o "RATEALE". Prima di dichiarare l'estrazione fallita, verifica se il documento usa uno dei termini indicati sopra come equivalenti a questo ente (categoria di credito, non solo nome proprio) — se sì, l'importo relativo a quella categoria è l'importo di questo ente. Solo se davvero non c'è alcun riferimento, nemmeno tematico, a questo ente, imposta "estrazioneRiuscita": false e spiega perché in "motivoMancata" (es. "il documento non menziona questo ente né i termini a esso equivalenti" o "l'importo offerto non è quantificato").`;

    const controllerAnalisi = new AbortController();
    const timerAnalisi = setTimeout(() => controllerAnalisi.abort(), SCADENZA_ANALISI_MS);
    let response: Anthropic.Messages.Message;
    let responseEstrazione: Anthropic.Messages.Message;
    try {
      [response, responseEstrazione] = await Promise.all([
        anthropic.messages.create(
          {
            model: 'claude-sonnet-5',
            // Analisi critica su più documenti, articolata su più punti
            // (A/B/C/D...) — con 3000 token si troncava a metà, adesso che
            // il ragionamento esteso è disabilitato tutto il budget va
            // davvero al testo, ma un'analisi approfondita ne consuma di
            // più.
            max_tokens: 6000,
            // Senza questo, il ragionamento esteso può consumare l'intero
            // budget di token prima di produrre testo visibile — esattamente
            // la causa di un'analisi risultata vuota nonostante stop_reason
            // 'max_tokens' con un solo blocco (di thinking, non di testo).
            thinking: { type: 'disabled' },
            messages: [
              {
                role: 'user',
                content: [...blocchiDocumento, { type: 'text', text: promptTestuale }],
              },
            ],
          },
          { signal: controllerAnalisi.signal }
        ),
        anthropic.messages.create(
          {
            model: 'claude-sonnet-5',
            // Con il prompt esteso (alias, istruzioni sulla polarità
            // tematica) e una motivoMancata che può essere un paragrafo
            // intero quando l'estrazione fallisce, 1024 token rischiava di
            // troncare il JSON a metà — un fallimento di parsing silenzioso
            // (mai mostrato all'utente), diverso e più subdolo di
            // un'estrazione che dichiara semplicemente di non riuscire.
            max_tokens: 2000,
            thinking: { type: 'disabled' },
            messages: [
              {
                role: 'user',
                content: [...blocchiDocumento, { type: 'text', text: promptEstrazione }],
              },
            ],
          },
          { signal: controllerAnalisi.signal }
        ),
      ]);
    } finally {
      clearTimeout(timerAnalisi);
    }

    const analisi = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    if (!analisi.trim()) {
      console.error('[analizzaDocumentiRiceventeAction] Analisi critica vuota:', {
        stopReason: response.stop_reason,
        numeroBlocchi: response.content.length,
        tipiBlocchi: response.content.map((b) => b.type),
      });
    }

    const testoEstrazione = responseEstrazione.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();
    let estrazione: EstrazioneOffertaRicevente | null = null;
    try {
      estrazione = JSON.parse(testoEstrazione);
    } catch (erroreParsing) {
      console.error('[analizzaDocumentiRiceventeAction] Estrazione importo fallita:', {
        stopReason: responseEstrazione.stop_reason,
        testoEstrazione: testoEstrazione.slice(0, 300),
        erroreParsing: erroreParsing instanceof Error ? erroreParsing.message : erroreParsing,
      });
    }

    const nomiFile = documentiConDati.map((d) => d.nome);
    await pool.query(
      `INSERT INTO "${nomeSchema}".simulazione_ricevente
        (scenario_id, analisi, nomi_file, generata_il, nome_asseverazione, nome_proposta_cram_down, nome_piano_sviluppo,
         importo_dovuto_estratto, percentuale_offerta_estratta, modalita_estratta, numero_rate_estratto, estrazione_riuscita, motivo_estrazione_mancata,
         importo_capitale_estratto, percentuale_capitale_estratta)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (scenario_id) DO UPDATE SET
        analisi = $2, nomi_file = $3, generata_il = now(),
        nome_asseverazione = $4, nome_proposta_cram_down = $5, nome_piano_sviluppo = $6,
        importo_dovuto_estratto = $7, percentuale_offerta_estratta = $8, modalita_estratta = $9,
        numero_rate_estratto = $10, estrazione_riuscita = $11, motivo_estrazione_mancata = $12,
        importo_capitale_estratto = $13, percentuale_capitale_estratta = $14`,
      [
        scenarioId,
        analisi,
        nomiFile,
        documentiNominati.asseverazione?.nome || null,
        documentiNominati.propostaCramDown.nome,
        documentiNominati.pianoSviluppo?.nome || null,
        // 0, non null, quando il parsing è fallito — un importo null
        // fa scattare il messaggio generico "carica e analizza",
        // fuorviante quando l'analisi in realtà è stata fatta ma il
        // parsing della risposta AI è fallito. Con 0 e
        // estrazioneRiuscita: false scatta invece il messaggio con la
        // motivazione specifica sotto.
        estrazione?.importoDovuto ?? 0,
        estrazione?.percentualeOfferta ?? 0,
        estrazione?.modalita ?? null,
        estrazione?.numeroRate ?? null,
        estrazione?.estrazioneRiuscita ?? false,
        estrazione?.motivoMancata ??
          "L'assistente non ha risposto in un formato leggibile durante l'estrazione — riprova; se si ripete, il documento potrebbe essere troppo lungo o complesso per questo passaggio.",
        numeroONull(estrazione?.importoCapitale),
        numeroONull(estrazione?.percentualeOffertaCapitale),
      ]
    );

    valutazioneRiuscita = true;
    return {
      success: true,
      analisi,
      nomiFile,
      documentiMancanti,
      generataIl: new Date().toISOString(),
      estrazione: estrazione || undefined,
      troncata: response.stop_reason === 'max_tokens',
    };
  } catch (error: any) {
    console.error('[analizzaDocumentiRiceventeAction] Errore:', error);
    // Distinzione utile: se abbiamo abortito per scadenza, il messaggio deve
    // dirlo (non "errore generico") e suggerire cosa fare.
    const scaduto =
      error?.name === 'APIUserAbortError' || /abort/i.test(String(error?.message || ''));
    return {
      success: false,
      error: scaduto
        ? "L'analisi ha superato il tempo massimo disponibile — riprova. Se i documenti sono molto voluminosi, carica solo le pagine rilevanti o un file per volta."
        : (erroreServizioEsterno(error, 'AI') ??
          `Impossibile analizzare i documenti: ${error.message || error}`),
    };
  } finally {
    // I documenti non si conservano oltre la valutazione: a valutazione
    // RIUSCITA si eliminano. Se fallisce restano, per riprovare senza
    // ricaricarli (stessa regola della visura del triage).
    if (valutazioneRiuscita) {
      try {
        await Promise.all(documenti.map((d) => del(d.url)));
        await pool.query(
          `UPDATE "${nomeSchema}".simulazione_ricevente
              SET documenti_esaminati = $2, documenti_caricati = NULL
            WHERE scenario_id = $1`,
          [scenarioId, JSON.stringify(pubblici(caricati))]
        );
      } catch (erroreEliminazione) {
        console.error(
          '[analizzaDocumentiRiceventeAction] Errore eliminazione blob:',
          erroreEliminazione
        );
      }
    }
  }
}

export async function ottieniAnalisiRiceventeAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoAnalisiRicevente> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const risultato = await pool.query(
      `SELECT analisi, nomi_file, generata_il, nome_asseverazione, nome_piano_sviluppo,
              importo_dovuto_estratto, percentuale_offerta_estratta, modalita_estratta,
              numero_rate_estratto, estrazione_riuscita, motivo_estrazione_mancata,
              importo_capitale_estratto, percentuale_capitale_estratta
       FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (risultato.rows.length === 0 || !risultato.rows[0].analisi) {
      return { success: true, analisi: undefined };
    }
    const r = risultato.rows[0];
    const documentiMancanti = [
      !r.nome_asseverazione ? 'Asseverazione del professionista' : null,
      !r.nome_piano_sviluppo ? 'Piano di sviluppo' : null,
    ].filter((d): d is string => d !== null);
    return {
      success: true,
      analisi: r.analisi,
      nomiFile: r.nomi_file || [],
      documentiMancanti,
      generataIl: r.generata_il,
      estrazione: {
        estrazioneRiuscita: r.estrazione_riuscita ?? false,
        importoDovuto:
          r.importo_dovuto_estratto !== null ? Number(r.importo_dovuto_estratto) : null,
        percentualeOfferta:
          r.percentuale_offerta_estratta !== null ? Number(r.percentuale_offerta_estratta) : null,
        modalita: r.modalita_estratta,
        numeroRate: r.numero_rate_estratto,
        motivoMancata: r.motivo_estrazione_mancata,
        importoCapitale:
          r.importo_capitale_estratto !== null ? Number(r.importo_capitale_estratto) : null,
        percentualeOffertaCapitale:
          r.percentuale_capitale_estratta !== null ? Number(r.percentuale_capitale_estratta) : null,
      },
    };
  } catch (error: any) {
    console.error('[ottieniAnalisiRiceventeAction] Errore:', error);
    return { success: false, error: `Impossibile leggere l'analisi: ${error.message || error}` };
  }
}
