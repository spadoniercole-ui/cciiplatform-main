'use server';

// Simulazione Ricevente — per chi VALUTA una proposta arrivata, non chi
// la scrive. Un solo output: un'analisi testuale che incrocia quello che
// i documenti allegati dichiarano con quello che i dati già in
// piattaforma (Proposta, Indici, trend Settore) suggeriscono. Nessun
// calcolo, nessuna leva — è un lavoro di lettura critica, non di
// aritmetica. Vedi il commento in db/provision.ts (assicuraTabella
// SimulazioneRicevente) sul perché i PDF non si conservano.

import Anthropic from '@anthropic-ai/sdk';
import { del, get } from '@/lib/blobStore';
import { pool } from '@/lib/db';
import { assicuraTabellaSimulazioneRicevente } from '@/db/provision';
import { ottieniScenarioPerId, verificaScenarioNonBloccato } from '@/app/actions/scenari';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
} from '@/app/actions/propostaScenario';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import {
  calcolaCrescitaStoricaAzienda,
  calcolaCrescitaStoricaSettore,
} from '@/lib/simulazione/calcolo';
import { ottieniLimitiRicevibilita } from '@/app/actions/parametriSpazio';

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

export async function analizzaDocumentiRiceventeAction(
  nomeSchema: string,
  scenarioId: number,
  documentiNominati: TreDocumentiRicevente
): Promise<RisultatoAnalisiRicevente> {
  const documenti: DocumentoPdf[] = [
    documentiNominati.asseverazione,
    documentiNominati.propostaCramDown,
    documentiNominati.pianoSviluppo,
  ].filter((d): d is DocumentoPdf => d !== null);
  const urlDaEliminare = documenti.map((d) => d.url);
  try {
    if (!anthropic) {
      return {
        success: false,
        error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.',
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

    // I file sono già su Vercel Blob (caricati direttamente dal browser,
    // vedi il Route Handler blob-upload) — questa funzione li scarica da
    // lì per convertirli in base64 e passarli a Claude. Il corpo di
    // QUESTA chiamata contiene solo URL, pochi byte: il limite di 4,5MB
    // di Vercel per il corpo di una funzione non si applica più qui. Lo
    // store è privato — fetch() diretto sull'URL fallirebbe (richiede
    // autenticazione), serve get() del SDK.
    const documentiConDati: { nome: string; base64: string }[] = [];
    for (const doc of documenti) {
      const risultatoGet = await get(doc.url, { access: 'private' });
      if (!risultatoGet || risultatoGet.statusCode !== 200) {
        return { success: false, error: `Impossibile scaricare "${doc.nome}" dallo storage.` };
      }
      const buffer = Buffer.from(await new Response(risultatoGet.stream).arrayBuffer());
      if (buffer.length > DIMENSIONE_MASSIMA_FILE) {
        return { success: false, error: `"${doc.nome}" supera i 20MB consentiti per file.` };
      }
      const base64 = buffer.toString('base64');
      if (!isPdfValido(base64)) {
        return {
          success: false,
          error: `"${doc.nome}" non è un PDF valido — solo file PDF sono ammessi.`,
        };
      }
      documentiConDati.push({ nome: doc.nome, base64 });
    }

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
          `Esito di ricevibilità già calcolato dalla piattaforma per quella riga: ${esitoRigaRilevante.ricevibile ? 'RICEVIBILE' : 'NON RICEVIBILE'} — ${esitoRigaRilevante.motivazione}.`
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

      const puntiStorici = [...storicoRis.storico]
        .sort((a, b) => (a.annoBilancio || 0) - (b.annoBilancio || 0))
        .map((b) => ({
          ricaviVendite: b.datiFinanziari.ricaviVendite,
          ebitda: b.datiFinanziari.ebitda,
          ebit: b.datiFinanziari.ebit,
          ammortamenti: b.datiFinanziari.ammortamenti,
        }));
      const crescitaAzienda = calcolaCrescitaStoricaAzienda(puntiStorici);
      if (crescitaAzienda !== null) {
        blocchiContesto.push(
          `Crescita storica dei ricavi dell'azienda, calcolata dai bilanci depositati: ${(crescitaAzienda * 100).toFixed(1)}% l'anno.`
        );
      }
    }

    if (settoreRis.success && settoreRis.punti.length > 0) {
      const crescitaSettore = calcolaCrescitaStoricaSettore(settoreRis.punti);
      if (crescitaSettore !== null) {
        blocchiContesto.push(
          `Crescita storica del settore ISTAT di riferimento (gruppo ATECO ${settoreRis.info?.gruppo || 'n/d'}): ${(crescitaSettore * 100).toFixed(1)}% l'anno.`
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
      documentiNominati.propostaCramDown ? 'la proposta di cram down' : null,
      documentiNominati.asseverazione ? "l'asseverazione del professionista" : null,
      documentiNominati.pianoSviluppo ? 'il piano di sviluppo' : null,
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

    const promptTestuale = `Sei un assistente che aiuta un ente (creditore) a valutare criticamente una proposta di composizione negoziata della crisi d'impresa ricevuta. Documenti allegati: ${documentiPresenti.join(', ')}.${documentiMancanti.length > 0 ? ` Mancano invece: ${documentiMancanti.join(', ')} — segnalalo esplicitamente all'inizio della relazione, è un'assenza rilevante per il giudizio.` : ''}${rigaAlias}

Il tuo compito NON è ricalcolare o riscrivere la proposta — è leggere criticamente cosa dichiarano i documenti allegati e confrontarlo con i dati che la piattaforma ha già raccolto sull'azienda, segnalando esplicitamente ogni incoerenza o affermazione poco credibile. Esempio del tipo di cosa da cercare: se un documento dichiara "il fatturato crescerà del 3% nei prossimi anni" ma il settore di riferimento è stagnante o in calo da tempo, questa è un'incoerenza da segnalare chiaramente, non da glissare.

DATI GIÀ RACCOLTI DALLA PIATTAFORMA:
${contestoTesto}

Struttura la risposta così:
1. Sintesi in 2-3 frasi di cosa propone l'azienda, secondo i documenti.
2. Punti di coerenza — cosa nei documenti è confermato o plausibile alla luce dei dati sopra.
3. Punti di incoerenza o da verificare — cosa nei documenti non torna, è ottimistico senza giustificazione, o contraddice i dati raccolti. Questa è la parte più importante: sii specifico, cita i numeri.
4. Una valutazione finale onesta e diretta: la proposta sembra credibile o ci sono segnali di allarme che meritano un supplemento di istruttoria.

Non dare un giudizio legale sulla ricevibilità (quello lo fa già la piattaforma altrove) — il tuo compito è solo la credibilità di quello che l'azienda dichiara.`;

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
  "modalita": "UNICA_SOLUZIONE",
  "numeroRate": null,
  "motivoMancata": null
}

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
         importo_dovuto_estratto, percentuale_offerta_estratta, modalita_estratta, numero_rate_estratto, estrazione_riuscita, motivo_estrazione_mancata)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (scenario_id) DO UPDATE SET
        analisi = $2, nomi_file = $3, generata_il = now(),
        nome_asseverazione = $4, nome_proposta_cram_down = $5, nome_piano_sviluppo = $6,
        importo_dovuto_estratto = $7, percentuale_offerta_estratta = $8, modalita_estratta = $9,
        numero_rate_estratto = $10, estrazione_riuscita = $11, motivo_estrazione_mancata = $12`,
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
      ]
    );

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
        : `Impossibile analizzare i documenti: ${error.message || error}`,
    };
  } finally {
    // I documenti non si conservano — riuscita o fallita che sia
    // l'analisi, il file caricato su Blob non deve restare lì.
    try {
      await Promise.all(urlDaEliminare.map((url) => del(url)));
    } catch (erroreEliminazione) {
      console.error(
        '[analizzaDocumentiRiceventeAction] Errore eliminazione blob:',
        erroreEliminazione
      );
    }
  }
}

export async function ottieniAnalisiRiceventeAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoAnalisiRicevente> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaSimulazioneRicevente(nomeSchema);
    const risultato = await pool.query(
      `SELECT analisi, nomi_file, generata_il, nome_asseverazione, nome_piano_sviluppo,
              importo_dovuto_estratto, percentuale_offerta_estratta, modalita_estratta,
              numero_rate_estratto, estrazione_riuscita, motivo_estrazione_mancata
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
      },
    };
  } catch (error: any) {
    console.error('[ottieniAnalisiRiceventeAction] Errore:', error);
    return { success: false, error: `Impossibile leggere l'analisi: ${error.message || error}` };
  }
}
