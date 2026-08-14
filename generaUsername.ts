'use server';

// Screening — solo spazi ENTE, a livello di Azienda. Si veda il
// commento in db/provision.ts (assicuraTabelleScreeningAzienda) per il
// perché. Genera una Check List su misura da XBRL + visura camerale +
// le direttrici dell'ente, prima ancora che arrivi una proposta.

import Anthropic from '@anthropic-ai/sdk';
import { del, get } from '@/lib/blobStore';
import { pool } from '@/lib/db';
import { assicuraTabelleScreeningAzienda } from '@/db/provision';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { raggruppaPerTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { ottieniEtichetteTipoDebito } from '@/app/actions/tipoDebitoConfig';
import { calcolaQuadroDirettrici, type QuadroDirettrici } from '@/lib/checklist/scoringDirettrici';
import type { SezioneChecklist, PesoDomanda } from '@/lib/checklist/ministeriale';

const apiKey = process.env.ANTHROPIC_API_KEY;
// Timeout esplicito, più stretto del limite di 300s di Vercel apposta:
// se una chiamata rallenta davvero, meglio che fallisca qui con un
// errore leggibile (gestito dal try/catch sotto) che essere uccisa
// dall'esterno da Vercel — quel tipo di interruzione non dà mai un
// messaggio comprensibile al browser, solo una connessione interrotta.
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000 }) : null;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/** Una direttrice con i suoi "prodotti" — ancoraggi concreti e
 * verificabili (es. Cassa Integrazione, DURC, DICA) su cui l'AI genera
 * domande specifiche, invece di indovinare cosa chiedere da un nome di
 * direttrice generico. */
export interface DirettriceStrutturata {
  nome: string;
  prodotti: string[];
}

export async function ottieniDirettriciEnte(nomeSchema: string): Promise<{
  success: boolean;
  direttrici: DirettriceStrutturata[];
  error?: string;
}> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, direttrici: [], error: 'Nome schema non valido.' };
    const r = await pool.query(
      `SELECT direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    return { success: true, direttrici: r.rows[0]?.direttrici_ente_strutturate || [] };
  } catch (error: any) {
    console.error('[ottieniDirettriciEnte] Errore:', error);
    return {
      success: false,
      direttrici: [],
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

export async function aggiornaDirettriciEnteAction(
  nomeSchema: string,
  direttrici: DirettriceStrutturata[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const pulite = direttrici
      .map((d) => ({
        nome: d.nome.trim(),
        prodotti: d.prodotti.map((p) => p.trim()).filter(Boolean),
      }))
      .filter((d) => d.nome && d.prodotti.length > 0);
    await pool.query(
      `UPDATE public.spazi SET direttrici_ente_strutturate = $1 WHERE nome_schema = $2`,
      [JSON.stringify(pulite), nomeSchema]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaDirettriciEnteAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

export interface RispostaScreening {
  domandaId: string;
  risposta: boolean | null;
  note: string | null;
}

export interface StatoScreeningAzienda {
  esiste: boolean;
  sezioni: SezioneChecklist[];
  risposte: RispostaScreening[];
  generatoIl: string | null;
  nomeFileVisura: string | null;
  quadro: QuadroDirettrici | null;
  relazioneTesto: string | null;
}

export async function ottieniScreeningAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; stato: StatoScreeningAzienda; error?: string }> {
  const vuoto: StatoScreeningAzienda = {
    esiste: false,
    sezioni: [],
    risposte: [],
    generatoIl: null,
    nomeFileVisura: null,
    quadro: null,
    relazioneTesto: null,
  };
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, stato: vuoto, error: 'Nome schema non valido.' };
    await assicuraTabelleScreeningAzienda(nomeSchema);

    const screeningRis = await pool.query(
      `SELECT sezioni, nome_file_visura, generato_il, relazione_testo FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (screeningRis.rows.length === 0) return { success: true, stato: vuoto };

    const sezioni: SezioneChecklist[] = screeningRis.rows[0].sezioni;
    const risposteRis = await pool.query(
      `SELECT domanda_id, risposta, note FROM "${nomeSchema}".azienda_screening_risposte WHERE azienda_id = $1`,
      [aziendaId]
    );
    const risposte: RispostaScreening[] = risposteRis.rows.map((r) => ({
      domandaId: r.domanda_id,
      risposta: r.risposta,
      note: r.note,
    }));

    const mappaRisposte = new Map(risposte.map((r) => [r.domandaId, r]));
    const tutteRisposte = sezioni.every((sez) =>
      sez.domande.every((d) => {
        const r = mappaRisposte.get(d.id);
        return r && r.risposta !== null;
      })
    );
    let quadro: QuadroDirettrici | null = null;
    if (tutteRisposte && sezioni.some((s) => s.domande.length > 0)) {
      const mappaPerCalcolo: Record<string, { domandaId: string; risposta: boolean | null }> = {};
      for (const sez of sezioni) {
        for (const d of sez.domande) {
          mappaPerCalcolo[d.id] = {
            domandaId: d.id,
            risposta: mappaRisposte.get(d.id)?.risposta ?? null,
          };
        }
      }
      const direttriciRis = await ottieniDirettriciEnte(nomeSchema);
      quadro = calcolaQuadroDirettrici(
        sezioni,
        direttriciRis.success ? direttriciRis.direttrici : [],
        mappaPerCalcolo
      );
    }

    return {
      success: true,
      stato: {
        esiste: true,
        sezioni,
        risposte,
        generatoIl: screeningRis.rows[0].generato_il,
        nomeFileVisura: screeningRis.rows[0].nome_file_visura,
        quadro,
        relazioneTesto: screeningRis.rows[0].relazione_testo,
      },
    };
  } catch (error: any) {
    console.error('[ottieniScreeningAzienda] Errore:', error);
    return {
      success: false,
      stato: vuoto,
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

export interface RisultatoGenerazioneScreening {
  success: boolean;
  sezioni?: SezioneChecklist[];
  relazioneTesto?: string;
  error?: string;
}

const PESI_VALIDI: PesoDomanda[] = ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE'];

export async function generaScreeningAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  visuraUrl: string,
  nomeFileVisura: string
): Promise<RisultatoGenerazioneScreening> {
  try {
    if (!anthropic) {
      return {
        success: false,
        error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.',
      };
    }
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    // Il file è già su Vercel Blob (caricato direttamente dal browser,
    // vedi il Route Handler blob-upload) — questa funzione lo scarica da
    // lì per convertirlo in base64. Il corpo di QUESTA chiamata contiene
    // solo l'URL, pochi byte: il limite di 4,5MB di Vercel per il corpo
    // di una funzione (non aggirabile da configurazione, vedi la stessa
    // correzione già fatta per Simulazione Ricevente) non si applica più
    // qui. Lo store è privato — un fetch() diretto sull'URL fallirebbe
    // (richiede autenticazione), serve get() del SDK, che autentica da
    // sola con le credenziali OIDC già presenti sull'istanza.
    const risultatoGet = await get(visuraUrl, { access: 'private' });
    if (!risultatoGet || risultatoGet.statusCode !== 200) {
      return { success: false, error: 'Impossibile scaricare la visura dallo storage.' };
    }
    const buffer = Buffer.from(await new Response(risultatoGet.stream).arrayBuffer());
    const visuraBase64 = buffer.toString('base64');

    const intestazione = Buffer.from(visuraBase64.slice(0, 20), 'base64').toString('latin1');
    if (!intestazione.startsWith('%PDF-')) {
      return { success: false, error: 'Il fascicolo storico deve essere un PDF valido.' };
    }

    await assicuraTabelleScreeningAzienda(nomeSchema);

    const [direttriciRis, storicoRis, debitiRis] = await Promise.all([
      ottieniDirettriciEnte(nomeSchema),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottieniDebitiEnte(nomeSchema, aziendaId),
    ]);

    const direttrici = direttriciRis.direttrici;
    if (!direttrici || direttrici.length === 0) {
      return {
        success: false,
        error:
          'Le direttrici di questo ente non sono ancora impostate — vai su Parametri di Spazio prima di generare uno screening.',
      };
    }
    const direttriciTesto = direttrici
      .map((d) => `${d.nome} — domande attinenti a ${d.prodotti.join(', ')}`)
      .join('\n');

    const blocchiContesto: string[] = [];
    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ordinatoDesc = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      );
      const ultimo = ordinatoDesc[0];
      const precedente = ordinatoDesc[1];
      const d = ultimo.datiFinanziari;
      const formatta = (n: number) => `€ ${n.toLocaleString('it-IT')}`;

      // Prima solo 5 macro-aggregati su 22 campi già disponibili — il
      // resto del bilancio (immobilizzazioni, disponibilità liquide,
      // scomposizione dei debiti, ecc.) non arrivava mai all'AI. Ora
      // tutto quello che il parser XBRL ha già estratto.
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

    // La Situazione Debitoria dell'ente vive ad Azienda, non più a
    // Scenario — disponibile prima ancora che esista una proposta,
    // esattamente il momento in cui si genera lo Screening.
    if (debitiRis.success && debitiRis.righe.length > 0) {
      const etichetteTipoRis = await ottieniEtichetteTipoDebito(nomeSchema);
      const mappaEtichette = etichetteTipoRis.success
        ? Object.fromEntries(etichetteTipoRis.etichette.map((e) => [e.codice, e.etichetta]))
        : {};
      const riepilogoDebiti = raggruppaPerTipoDebito(debitiRis.righe, mappaEtichette);
      const formatta = (n: number) => `€ ${n.toLocaleString('it-IT')}`;
      const totaleLordo = riepilogoDebiti.reduce((acc, r) => acc + r.totale, 0);
      const totaleSaldo = riepilogoDebiti.reduce((acc, r) => acc + r.totaleSaldo, 0);
      const perTipoTesto = riepilogoDebiti
        .filter((r) => r.numeroRighe > 0)
        .map((r) => `${r.etichetta}: ${formatta(r.totaleSaldo)} (${r.numeroRighe} voci)`)
        .join('; ');
      blocchiContesto.push(
        totaleLordo === totaleSaldo
          ? `Situazione Debitoria dichiarata dall'ente: saldo € ${formatta(totaleSaldo)} su ${debitiRis.righe.length} voci — per tipo: ${perTipoTesto}.`
          : `Situazione Debitoria dichiarata dall'ente: saldo € ${formatta(totaleSaldo)} (lordo € ${formatta(totaleLordo)}, una quota risulta già versata) su ${debitiRis.righe.length} voci — per tipo: ${perTipoTesto}.`
      );
    } else {
      blocchiContesto.push(
        "Situazione Debitoria dell'ente non ancora inserita per questa azienda."
      );
    }

    const promptTestuale = `Sei un assistente che aiuta un ente creditore a costruire un questionario di screening per un'azienda, PRIMA che arrivi una proposta di composizione negoziata della crisi — uno "state of the art" iniziale, basato solo su quello che è già pubblico (bilancio XBRL, fascicolo storico allegato), su quello che l'ente stesso ha già dichiarato di avere a credito (Situazione Debitoria), e su quello che l'ente stesso può verificare nei propri sistemi.

Le direttrici lungo cui l'ente valuta le proprie relazioni con le aziende, ciascuna con i prodotti/procedure concreti a cui deve ancorarsi ogni domanda (non generare mai una domanda che non riguardi uno di questi prodotti):
${direttriciTesto}

DATI GIÀ RACCOLTI:
${blocchiContesto.join('\n')}

Il tuo compito: genera un questionario Sì/No organizzato per sezioni, una sezione per ciascuna direttrice elencata sopra. Per ciascun prodotto elencato in una direttrice, genera 1-2 domande — mai una domanda generica sulla direttrice nel suo complesso, sempre ancorata a uno specifico prodotto/procedura tra quelli indicati. Ogni domanda deve essere qualcosa che un funzionario dell'ente può verificare nei PROPRI sistemi interni per QUESTA azienda specifica — mai un giudizio generico sull'azienda che il funzionario non potrebbe conoscere senza un'interazione diretta con l'azienda stessa (evita domande su governance, competenza del management, clima interno). Non superare le 20 domande totali complessive, distribuite tra le direttrici in proporzione al numero di prodotti elencati per ciascuna.

REGOLA VINCOLANTE SULLA FORMULAZIONE — nessuna eccezione: ogni domanda deve essere scritta in modo che "Sì" sia SEMPRE la risposta favorevole all'azienda, e "No" SEMPRE quella sfavorevole. Il punteggio finale somma il peso di ogni "No" e sottrae quello di ogni "Sì" — se anche una sola domanda avesse la polarità invertita, il conteggio diventerebbe sbagliato senza che nessuno se ne accorga leggendo la domanda da sola.
- SBAGLIATO (Sì = cattiva notizia): "Risultano versamenti scaduti negli ultimi 12 mesi?" — "Sono aperte procedure di recupero crediti?" — "Risulta attivo un flag di blocco sulla posizione?"
- CORRETTO (Sì = buona notizia, stessa domanda capovolta): "La posizione è priva di versamenti scaduti negli ultimi 12 mesi?" — "Non risultano procedure di recupero crediti aperte?" — "La posizione risulta libera da flag di blocco?"
Prima di scrivere ciascuna domanda, chiediti: "se rispondo Sì, è una buona notizia per l'azienda?" Se la risposta è no, riformula la domanda al negativo finché non lo è.

Rispondi SOLO con JSON valido, nessun testo prima o dopo, in questo formato esatto:
{
  "sezioni": [
    {
      "numero": "1",
      "titolo": "Nome della direttrice",
      "domande": [
        { "id": "1.1", "domanda": "Testo della domanda", "peso": "RILEVANTE", "aCuraDi": "esperto" }
      ]
    }
  ]
}
Peso: STRUTTURALE, RILEVANTE o DOCUMENTALE. aCuraDi è sempre "esperto" qui (non c'è un imprenditore in questo flusso). 3-6 domande per sezione, una sezione per direttrice.`;

    const promptRelazione = `Sei un assistente che scrive una relazione di analisi preliminare per un ente creditore, PRIMA che arrivi una proposta di composizione negoziata della crisi — una fotografia di partenza basata sul bilancio XBRL, sul fascicolo storico allegato, e sulla Situazione Debitoria già dichiarata dall'ente.

DATI GIÀ RACCOLTI:
${blocchiContesto.join('\n')}

Scrivi una relazione con questi paragrafi, in prosa, non elenchi puntati:
1. Identikit dell'impresa (dal fascicolo storico: anagrafica, oggetto, storia, stato, organi).
2. Posizione economico-patrimoniale (dal bilancio): sintesi di conto economico e stato patrimoniale, indici essenziali.
3. Struttura del debito: quello che emerge dal bilancio, e quello che l'ente stesso ha già dichiarato di avere a credito (Situazione Debitoria) se presente — segnala esplicitamente se i due quadri sono coerenti tra loro o se qualcosa non torna.
4. Scenario liquidatorio di base — l'ancoraggio del test di convenienza (art. 63/88 CCII): cosa otterrebbe l'ente in una liquidazione, a spanne, dai soli dati di bilancio.
5. Eventuali segnali di incoerenza da segnalare (es. continuità aziendale dichiarata in tensione con i numeri, se presente).
6. Cosa manca e va aggiornato prima di poter valutare la proposta — il ponte esplicito verso i dati correnti che arriveranno con la proposta stessa.

Non dare un giudizio legale definitivo — è una base istruttoria per chi dovrà poi leggere la proposta, non un responso.`;

    // Le due chiamate leggono lo stesso documento ma non dipendono
    // l'una dall'altra — lanciate in parallelo invece che in sequenza,
    // il tempo di attesa complessivo è quello della più lenta delle
    // due, non la somma di entrambe.
    const [response, responseRelazione] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-sonnet-5',
        // Fino a 20 domande, ciascuna con id/domanda/peso/aCuraDi
        // dentro sezioni annidate — con 3000 token il JSON veniva
        // troncato a metà (parsing falliva sempre): margine più ampio.
        max_tokens: 6000,
        // Senza questo, il ragionamento esteso può consumare l'intero
        // budget di token prima di produrre l'output — la causa più
        // probabile, retroattivamente, del troncamento originale.
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
              { type: 'text', text: promptTestuale },
            ],
          },
        ],
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
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
              { type: 'text', text: promptRelazione },
            ],
          },
        ],
      }),
    ]);

    const testoGrezzo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    let parsed: { sezioni: SezioneChecklist[] };
    try {
      parsed = JSON.parse(testoGrezzo);
    } catch (erroreParsing) {
      // Diagnostica vera invece di un catch muto — la causa più
      // probabile è il troncamento (risposta tagliata a metà prima di
      // chiudere il JSON), verificabile da stop_reason.
      console.error('[generaScreeningAziendaAction] Parsing questionario fallito:', {
        stopReason: response.stop_reason,
        lunghezzaTesto: testoGrezzo.length,
        ultimiCaratteri: testoGrezzo.slice(-200),
        erroreParsing: erroreParsing instanceof Error ? erroreParsing.message : erroreParsing,
      });
      return {
        success: false,
        error:
          response.stop_reason === 'max_tokens'
            ? 'Il questionario generato era troppo lungo ed è stato tagliato a metà — riprova, o riduci il numero di prodotti elencati per direttrice.'
            : "L'assistente non ha restituito un questionario leggibile — riprova.",
      };
    }

    for (const sez of parsed.sezioni || []) {
      for (const d of sez.domande || []) {
        if (!PESI_VALIDI.includes(d.peso)) d.peso = 'RILEVANTE';
        d.aCuraDi = 'esperto';
      }
    }
    if (!parsed.sezioni || parsed.sezioni.length === 0) {
      return { success: false, error: "L'assistente non ha generato nessuna domanda — riprova." };
    }

    const relazioneTesto = responseRelazione.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_screening (azienda_id, direttrici_usate, sezioni, relazione_testo, nome_file_visura, generato_il)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (azienda_id) DO UPDATE SET direttrici_usate = $2, sezioni = $3, relazione_testo = $4, nome_file_visura = $5, generato_il = now()`,
      [
        aziendaId,
        JSON.stringify(direttrici),
        JSON.stringify(parsed.sezioni),
        relazioneTesto,
        nomeFileVisura,
      ]
    );
    await pool.query(
      `DELETE FROM "${nomeSchema}".azienda_screening_risposte WHERE azienda_id = $1`,
      [aziendaId]
    );

    return { success: true, sezioni: parsed.sezioni, relazioneTesto };
  } catch (error: any) {
    console.error('[generaScreeningAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile generare lo screening: ${error.message || error}`,
    };
  } finally {
    // I documenti non si conservano — riuscita o fallita che sia la
    // generazione, il file caricato su Blob non deve restare lì. Stesso
    // principio già applicato in Simulazione Ricevente.
    try {
      await del(visuraUrl);
    } catch (erroreEliminazione) {
      console.error('[generaScreeningAziendaAction] Errore eliminazione blob:', erroreEliminazione);
    }
  }
}

export async function salvaRispostaScreeningAction(
  nomeSchema: string,
  aziendaId: number,
  domandaId: string,
  risposta: boolean | null,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScreeningAzienda(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_screening_risposte (azienda_id, domanda_id, risposta, note, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (azienda_id, domanda_id) DO UPDATE SET risposta = $3, note = $4, updated_at = now()`,
      [aziendaId, domandaId, risposta, note]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaRispostaScreeningAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

/** Solo per il badge sulla scheda "Screening" — conteggio leggero, non
 * ricalcola il quadro qualitativo completo (quello serve solo quando si
 * apre davvero la pagina). Usata nel layout, chiamata a ogni
 * caricamento di una pagina Azienda: deve restare veloce. */
export async function ottieniConteggioScreeningPendente(
  nomeSchema: string,
  aziendaId: number
): Promise<{ esiste: boolean; totali: number; risposte: number }> {
  try {
    if (!validaSchema(nomeSchema)) return { esiste: false, totali: 0, risposte: 0 };
    await assicuraTabelleScreeningAzienda(nomeSchema);

    const screeningRis = await pool.query(
      `SELECT sezioni FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (screeningRis.rows.length === 0) return { esiste: false, totali: 0, risposte: 0 };

    const sezioni: SezioneChecklist[] = screeningRis.rows[0].sezioni;
    const totali = sezioni.reduce((acc, s) => acc + s.domande.length, 0);

    const risposteRis = await pool.query(
      `SELECT COUNT(*) AS n FROM "${nomeSchema}".azienda_screening_risposte WHERE azienda_id = $1 AND risposta IS NOT NULL`,
      [aziendaId]
    );
    const risposte = Number(risposteRis.rows[0]?.n || 0);

    return { esiste: true, totali, risposte };
  } catch (error: any) {
    console.error('[ottieniConteggioScreeningPendente] Errore:', error);
    return { esiste: false, totali: 0, risposte: 0 };
  }
}

export interface RisultatoCorrezionePolarita {
  success: boolean;
  domandeCorrette: number;
  risposteInvertite: number;
  error?: string;
}

/** Corregge retroattivamente la polarità delle domande già generate
 * (prima che la regola "Sì = sempre favorevole" fosse imposta nel
 * prompt) — non rigenera tutto da capo, non serve il documento
 * originale: riformula solo le domande con polarità sbagliata,
 * mantenendo stessi id e stessa sostanza. Le risposte già date a una
 * domanda la cui polarità viene invertita sono invertite a loro volta
 * — altrimenti un "Sì" dato alla vecchia formulazione ("Risultano
 * versamenti scaduti?") resterebbe "Sì" anche sulla nuova
 * formulazione capovolta ("La posizione è priva di versamenti
 * scaduti?"), cambiando il fatto che rappresenta. */
export async function correggiPolaritaScreeningAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoCorrezionePolarita> {
  try {
    if (!anthropic) {
      return {
        success: false,
        domandeCorrette: 0,
        risposteInvertite: 0,
        error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.',
      };
    }
    if (!validaSchema(nomeSchema)) {
      return {
        success: false,
        domandeCorrette: 0,
        risposteInvertite: 0,
        error: 'Nome schema non valido.',
      };
    }
    await assicuraTabelleScreeningAzienda(nomeSchema);

    const screeningRis = await pool.query(
      `SELECT sezioni FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (screeningRis.rows.length === 0) {
      return {
        success: false,
        domandeCorrette: 0,
        risposteInvertite: 0,
        error: 'Nessuno screening ancora generato per questa azienda.',
      };
    }
    const sezioni: SezioneChecklist[] = screeningRis.rows[0].sezioni;
    const elencoDomande = sezioni.flatMap((s) =>
      s.domande.map((d) => ({ id: d.id, domanda: d.domanda }))
    );

    const prompt = `Ricevi un elenco di domande Sì/No di un questionario di screening. La regola vincolante è: "Sì" deve essere SEMPRE la risposta favorevole all'azienda, "No" sempre quella sfavorevole. Alcune domande, generate prima che questa regola fosse imposta, potrebbero avere la polarità invertita (es. "Risultano versamenti scaduti?" — un Sì qui è una cattiva notizia, quindi sbagliata).

Per ciascuna domanda: se la polarità è già corretta, ripetila identica. Se è invertita, riformulala al negativo mantenendo la stessa sostanza (stesso fatto verificabile, es. "Risultano versamenti scaduti negli ultimi 12 mesi?" diventa "La posizione è priva di versamenti scaduti negli ultimi 12 mesi?").

Domande:
${elencoDomande.map((d) => `${d.id}: ${d.domanda}`).join('\n')}

Rispondi SOLO con JSON valido, nessun testo prima o dopo, in questo formato esatto — un elemento per ogni domanda, stesso ordine e stessi id:
{
  "domande": [
    { "id": "1.1", "domanda": "Testo finale della domanda (identico o riformulato)", "polaritaInvertita": false }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 6000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    });
    const testoGrezzo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    let corrette: { id: string; domanda: string; polaritaInvertita: boolean }[];
    try {
      corrette = JSON.parse(testoGrezzo).domande;
    } catch (erroreParsing) {
      console.error('[correggiPolaritaScreeningAction] Parsing fallito:', {
        stopReason: response.stop_reason,
        testo: testoGrezzo.slice(0, 300),
        erroreParsing: erroreParsing instanceof Error ? erroreParsing.message : erroreParsing,
      });
      return {
        success: false,
        domandeCorrette: 0,
        risposteInvertite: 0,
        error: "L'assistente non ha restituito una correzione leggibile — riprova.",
      };
    }

    const mappaCorrezioni = new Map(corrette.map((c) => [c.id, c]));
    const sezioniCorrette: SezioneChecklist[] = sezioni.map((s) => ({
      ...s,
      domande: s.domande.map((d) => {
        const c = mappaCorrezioni.get(d.id);
        return c ? { ...d, domanda: c.domanda } : d;
      }),
    }));
    const idInvertiti = corrette.filter((c) => c.polaritaInvertita).map((c) => c.id);

    await pool.query(
      `UPDATE "${nomeSchema}".azienda_screening SET sezioni = $2 WHERE azienda_id = $1`,
      [aziendaId, JSON.stringify(sezioniCorrette)]
    );

    let risposteInvertite = 0;
    if (idInvertiti.length > 0) {
      const risultatoInversione = await pool.query(
        `UPDATE "${nomeSchema}".azienda_screening_risposte
         SET risposta = NOT risposta, updated_at = now()
         WHERE azienda_id = $1 AND domanda_id = ANY($2) AND risposta IS NOT NULL`,
        [aziendaId, idInvertiti]
      );
      risposteInvertite = risultatoInversione.rowCount || 0;
    }

    return {
      success: true,
      domandeCorrette: idInvertiti.length,
      risposteInvertite,
    };
  } catch (error: any) {
    console.error('[correggiPolaritaScreeningAction] Errore:', error);
    return {
      success: false,
      domandeCorrette: 0,
      risposteInvertite: 0,
      error: `Impossibile correggere la polarità: ${error.message || error}`,
    };
  }
}
