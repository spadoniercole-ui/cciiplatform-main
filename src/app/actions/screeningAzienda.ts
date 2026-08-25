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
import { ottieniDebitiVera } from '@/app/actions/posizioneVera';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import { raggruppaPerTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { bloccoIstruzioniOperatore } from '@/lib/istruzioniOperatore';
import { ottieniEtichetteTipoDebito } from '@/app/actions/tipoDebitoConfig';
import { calcolaQuadroDirettrici, type QuadroDirettrici } from '@/lib/checklist/scoringDirettrici';
import type { SezioneChecklist, PesoDomanda } from '@/lib/checklist/ministeriale';

const apiKey = process.env.ANTHROPIC_API_KEY;
// Timeout esplicito, più stretto del limite di 300s di Vercel apposta:
// se una chiamata rallenta davvero, meglio che fallisca qui con un
// errore leggibile (gestito dal try/catch sotto) che essere uccisa
// dall'esterno da Vercel — quel tipo di interruzione non dà mai un
// messaggio comprensibile al browser, solo una connessione interrotta.
// maxRetries: 1 (non il default 2). Con due chiamate in parallelo e un
// limite di funzione di 180s, due retry a 150s l'uno sforerebbero il
// budget e la funzione verrebbe uccisa da Vercel PRIMA di rispondere —
// il browser resterebbe appeso (spinner infinito). Un solo retry copre il
// sovraccarico transitorio senza rischiare lo sforamento; a difesa
// ulteriore c'è comunque un AbortController con scadenza esplicita.
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 150 * 1000, maxRetries: 1 }) : null;

// Scadenza complessiva della generazione screening, sotto il maxDuration=180s
// della pagina: se le chiamate AI non rientrano, si abortisce e si restituisce
// un errore leggibile invece di far uccidere la funzione da Vercel (che al
// browser arriva come connessione interrotta → spinner infinito).
const SCADENZA_GENERAZIONE_MS = 150 * 1000;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/**
 * Estrae l'array di domande dalla risposta AI di una sezione, in modo
 * TOLLERANTE al troncamento: prima prova il parse pulito di
 * `{ "domande": [...] }`; se fallisce (JSON tagliato a metà), recupera
 * comunque tutti gli oggetti-domanda COMPLETI presenti nel testo — quelli
 * emessi prima del taglio non vanno persi. Con l'architettura per-sezione
 * il troncamento è comunque improbabile, ma questa è la rete di sicurezza.
 */
function estraiDomandeDaJson(raw: string): { domanda?: unknown; peso?: unknown }[] {
  const pulito = (raw || '').replace(/```json|```/g, '').trim();
  try {
    const obj = JSON.parse(pulito);
    if (Array.isArray(obj?.domande)) return obj.domande;
    if (Array.isArray(obj)) return obj;
  } catch {
    // Salvataggio: recupera ogni oggetto {...} completo che contenga "domanda".
  }
  const risultati: { domanda?: unknown; peso?: unknown }[] = [];
  const oggetti = pulito.match(/\{[^{}]*"domanda"[^{}]*\}/g) || [];
  for (const o of oggetti) {
    try {
      const parsed = JSON.parse(o);
      if (parsed && typeof parsed.domanda === 'string') risultati.push(parsed);
    } catch {
      // oggetto incompleto (troncato a metà): saltato
    }
  }
  return risultati;
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

export interface UltimoScreeningSpazio {
  aziendaId: number;
  ragioneSociale: string;
  generatoIl: string | null;
}

/**
 * Per la dashboard: l'ULTIMO report di Screening per ciascuna azienda. La
 * tabella azienda_screening tiene UNA riga per azienda (rigenerare fa UPDATE),
 * quindi qui esce sempre e solo l'ultimo — mai lo storico. Ordinati dal più
 * recente.
 */
export async function ottieniUltimiScreeningSpazio(
  nomeSchema: string
): Promise<{ success: boolean; screening: UltimoScreeningSpazio[]; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, screening: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabelleScreeningAzienda(nomeSchema);
    const r = await pool.query(
      `SELECT s.azienda_id, a.ragione_sociale, s.generato_il
         FROM "${nomeSchema}".azienda_screening s
         JOIN "${nomeSchema}".aziende a ON a.id = s.azienda_id
        ORDER BY s.generato_il DESC NULLS LAST`
    );
    return {
      success: true,
      screening: r.rows.map((x) => ({
        aziendaId: x.azienda_id,
        ragioneSociale: x.ragione_sociale,
        generatoIl: x.generato_il ? new Date(x.generato_il).toISOString() : null,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniUltimiScreeningSpazio] Errore:', error);
    return {
      success: false,
      screening: [],
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

export async function generaScreeningAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  visuraUrl: string,
  nomeFileVisura: string,
  istruzioniOperatore?: string
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

    const [direttriciRis, storicoRis, debitiRis, veraRis, categorieRis] = await Promise.all([
      ottieniDirettriciEnte(nomeSchema),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottieniDebitiEnte(nomeSchema, aziendaId),
      ottieniDebitiVera(nomeSchema, aziendaId),
      ottieniCategorieTipoDebito(nomeSchema),
    ]);

    const direttriciTutte = direttriciRis.direttrici;
    if (!direttriciTutte || direttriciTutte.length === 0) {
      return {
        success: false,
        error:
          'Le direttrici di questo ente non sono ancora impostate — vai su Parametri di Spazio prima di generare uno screening.',
      };
    }
    // Nessun limite artificiale: lo screening copre TUTTE le direttrici e i
    // prodotti che l'ente ha configurato. L'ampiezza del questionario è
    // governata direttamente da quell'elenco (editor Direttrici Ente), non da
    // parametri numerici separati — con la generazione per-sezione non c'è più
    // rischio di troncamento, quindi non serve limitare.
    const direttrici = direttriciTutte;

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

    // Verifica certo-per-certo (Posizione V.E.R.A.): confronto tra quanto
    // l'ente ha CONTABILIZZATO (Situazione Debitoria) e quanto risulta nel file
    // di verifica (VERA), per categoria. Il delta è il non contabilizzato che,
    // con la proposta, andrà contabilizzato — un dato chiave per la relazione.
    if (veraRis.success && veraRis.righe.length > 0) {
      const formatta = (n: number) => `€ ${n.toLocaleString('it-IT')}`;
      const etichettaCat = (cod: string) =>
        categorieRis.categorie.find((c) => c.codice === cod)?.etichetta || cod;
      const neutre = new Set(
        (categorieRis.success ? categorieRis.categorie : [])
          .filter((c) => !c.contribuisce)
          .map((c) => c.codice)
      );
      const codici = Array.from(
        new Set([
          ...(debitiRis.success ? debitiRis.righe.map((r) => r.tipo) : []),
          ...veraRis.righe.map((r) => r.categoria),
        ])
      );
      // Solo i trattamenti con importo noto (contabilizzato, da_contabilizzare)
      // alimentano gli importi; "potenziale" ha importo ignoto, "ignora" è escluso.
      const righeImporto = veraRis.righe.filter(
        (r) => r.trattamento === 'contabilizzato' || r.trattamento === 'da_contabilizzare'
      );
      const perCat = codici.map((cod) => {
        const contab = (debitiRis.success ? debitiRis.righe : [])
          .filter((r) => r.tipo === cod)
          .reduce((a, r) => a + r.importo, 0);
        const vera = righeImporto
          .filter((r) => r.categoria === cod)
          .reduce((a, r) => a + r.importo, 0);
        return { cod, contab, vera, delta: vera - contab, neutra: neutre.has(cod) };
      });
      const testoPerCat = perCat
        .map(
          (x) =>
            `${etichettaCat(x.cod)}${x.neutra ? ' (neutra)' : ''}: contabilizzato ${formatta(x.contab)}, VERA ${formatta(x.vera)}${x.neutra ? '' : `, delta ${formatta(x.delta)}`}`
        )
        .join('; ');
      const deltaTotale = perCat.filter((x) => !x.neutra).reduce((a, x) => a + x.delta, 0);
      blocchiContesto.push(
        `Verifica certo-per-certo (Posizione VERA, dal file di verifica dell'ente): ${testoPerCat}. Delta complessivo non contabilizzato: ${formatta(deltaTotale)} — è la quota che il file di verifica riporta oltre a quanto l'ente ha già contabilizzato, e che in presenza di proposta dovrà essere contabilizzata.`
      );

      // Esposizione totale verso l'ente = contabilizzato + da contabilizzare
      // (perimetro non neutro): il debito complessivo dell'azienda verso l'ente.
      const veraNonNeutra = righeImporto.filter((r) => !neutre.has(r.categoria));
      const espContab = veraNonNeutra
        .filter((r) => r.trattamento === 'contabilizzato')
        .reduce((a, r) => a + r.importo, 0);
      const espDaContab = veraNonNeutra
        .filter((r) => r.trattamento === 'da_contabilizzare')
        .reduce((a, r) => a + r.importo, 0);
      blocchiContesto.push(
        `Esposizione totale dell'azienda verso l'ente (dal file di verifica): ${formatta(espContab + espDaContab)} — comprensiva sia del già contabilizzato (${formatta(espContab)}) sia del da contabilizzare (${formatta(espDaContab)}). È il debito complessivo, non solo la quota già a ruolo.`
      );

      // Da contabilizzare (trattamento da_contabilizzare), per stato di lavorazione.
      const nonContab = veraRis.righe.filter((r) => r.trattamento === 'da_contabilizzare');
      if (nonContab.length > 0) {
        const perDicitura = Array.from(
          nonContab.reduce((m, r) => {
            const k = r.stato || 'senza stato';
            m.set(k, (m.get(k) || 0) + r.importo);
            return m;
          }, new Map<string, number>())
        )
          .map(([dicitura, tot]) => `${dicitura}: ${formatta(tot)}`)
          .join('; ');
        const totNonContab = nonContab.reduce((a, r) => a + r.importo, 0);
        blocchiContesto.push(
          `Debiti non ancora contabilizzati secondo VERA (certi ma non ancora esigibili, da lavorare per renderli tali): totale ${formatta(totNonContab)}, per stato di lavorazione: ${perDicitura}.`
        );
      }

      // Potenziali a importo ignoto (trattamento potenziale): natura presente
      // ma importo non ancora quantificato (es. Denunce non trasmesse).
      const potenziali = veraRis.righe.filter((r) => r.trattamento === 'potenziale');
      if (potenziali.length > 0) {
        const perNatura = Array.from(
          potenziali.reduce((m, r) => {
            m.set(r.voce, (m.get(r.voce) || 0) + 1);
            return m;
          }, new Map<string, number>())
        )
          .map(([natura, n]) => `${natura} (${n})`)
          .join('; ');
        blocchiContesto.push(
          `Posizioni potenziali a importo IGNOTO secondo VERA (natura presente ma importo non ancora quantificato — possibili passività future da monitorare): ${perNatura}. Vanno segnalate esplicitamente come rischio non ancora quantificabile.`
        );
      }
    }

    const contestoTesto = blocchiContesto.join('\n');
    // Istruzioni libere dell'operatore per questo singolo lancio (usa-e-getta).
    const istruzioniBlocco = bloccoIstruzioniOperatore(istruzioniOperatore);

    // Regola di polarità condivisa da ogni sezione — l'invariante che tiene
    // il punteggio coerente: "Sì" sempre favorevole all'azienda.
    const REGOLA_POLARITA = `REGOLA VINCOLANTE SULLA FORMULAZIONE — nessuna eccezione: ogni domanda deve essere scritta in modo che "Sì" sia SEMPRE la risposta favorevole all'azienda, e "No" SEMPRE quella sfavorevole.
- SBAGLIATO (Sì = cattiva notizia): "Risultano versamenti scaduti negli ultimi 12 mesi?"
- CORRETTO (Sì = buona notizia, stessa domanda capovolta): "La posizione è priva di versamenti scaduti negli ultimi 12 mesi?"
Prima di scrivere ciascuna domanda, chiediti: "se rispondo Sì, è una buona notizia per l'azienda?" Se no, riformulala al negativo.`;

    /**
     * Genera UNA sezione (le domande di UNA direttrice) con una chiamata
     * dedicata e output piccolo: così il troncamento è strutturalmente
     * impossibile, qualunque sia il numero totale di direttrici/domande.
     * Non invia il PDF (le domande sono ancorate a direttrici/prodotti e ai
     * dati finanziari già estratti, non alla visura): chiamate leggere,
     * veloci, parallelizzabili senza far esplodere banda e token.
     */
    const generaSezione = async (
      d: { nome: string; prodotti: string[] },
      numero: number,
      signal: AbortSignal
    ): Promise<SezioneChecklist | null> => {
      // Tetto di domande PER QUESTA sezione derivato dai suoi prodotti (1-2 a
      // testa), con un massimo di sicurezza per tenere ogni chiamata piccola.
      const perSezioneMax = Math.min(12, Math.max(2, d.prodotti.length * 2));
      const prompt = `Sei un assistente che aiuta un ente creditore a costruire la sezione di un questionario di screening per un'azienda, PRIMA che arrivi una proposta di composizione negoziata della crisi. La sezione riguarda UNA sola direttrice dell'ente.

DIRETTRICE: "${d.nome}"
PRODOTTI/PROCEDURE concreti a cui ancorare le domande (mai una domanda generica sulla direttrice nel suo complesso, sempre su uno di questi):
${d.prodotti.map((p) => `- ${p}`).join('\n')}

DATI GIÀ RACCOLTI SULL'AZIENDA:
${contestoTesto}

Genera da 1 a 2 domande per prodotto, MA non più di ${perSezioneMax} domande in tutto per questa sezione. Ogni domanda deve essere qualcosa che un funzionario dell'ente può verificare nei PROPRI sistemi interni per QUESTA azienda specifica — mai un giudizio generico sull'azienda che richiederebbe un'interazione diretta con essa (evita governance, competenza del management, clima interno).

${REGOLA_POLARITA}${istruzioniBlocco}

Rispondi SOLO con JSON valido, nessun testo prima o dopo, in questo formato esatto:
{ "domande": [ { "domanda": "Testo della domanda", "peso": "RILEVANTE" } ] }
Peso ammesso: STRUTTURALE, RILEVANTE o DOCUMENTALE.`;

      const resp = await anthropic.messages.create(
        {
          model: 'claude-sonnet-5',
          // Ampiamente sufficiente per una singola sezione (poche domande):
          // il modello termina molto prima, il troncamento non si verifica.
          max_tokens: 2000,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        },
        { signal }
      );

      const raw = resp.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      const domandeGrezze = estraiDomandeDaJson(raw);
      const domande = domandeGrezze
        .slice(0, perSezioneMax)
        .map((x, k) => ({
          id: `${numero}.${k + 1}`,
          domanda: String(x.domanda || '').trim(),
          peso: (PESI_VALIDI.includes(x.peso as PesoDomanda)
            ? (x.peso as PesoDomanda)
            : 'RILEVANTE') as PesoDomanda,
          aCuraDi: 'esperto' as const,
        }))
        .filter((q) => q.domanda.length > 0);

      if (domande.length === 0) return null;
      return { numero: String(numero), titolo: d.nome, domande };
    };

    // Carenza di bilancio: l'analisi si può lanciare comunque (flag lato UI),
    // ma la relazione deve ACQUISIRE ed EVIDENZIARE, contestualizzandola,
    // l'assenza del bilancio — non fingere numeri che non ci sono.
    const senzaBilancio = !(storicoRis.success && storicoRis.storico.length > 0);
    const avvisoCarenzaBilancio = senzaBilancio
      ? `

ATTENZIONE — BILANCIO XBRL ASSENTE: per questa azienda non è stato caricato alcun bilancio XBRL. Devi:
- Aprire la relazione con un avviso esplicito che il bilancio non è disponibile e che l'analisi è quindi PRELIMINARE e PARZIALE, condotta sui soli dati a disposizione (fascicolo storico, Situazione Debitoria, Posizione VERA).
- Nel paragrafo 2 (posizione economico-patrimoniale) NON inventare numeri: dichiara che non è valutabile dai dati di bilancio in assenza dello stesso, e ricava solo ciò che è deducibile dal fascicolo storico.
- Nel paragrafo 4 (scenario liquidatorio) segnala che l'ancoraggio quantitativo non è possibile senza bilancio e va rifatto appena disponibile.
- Nel paragrafo 6 mettere in cima, tra ciò che manca, il caricamento del bilancio XBRL come priorità.
Contestualizza sempre l'assenza: cosa se ne può dire lo stesso e cosa resta sospeso finché il bilancio non arriva.`
      : '';

    const promptRelazione = `Sei un assistente che scrive una relazione di analisi preliminare per un ente creditore, PRIMA che arrivi una proposta di composizione negoziata della crisi — una fotografia di partenza basata sul bilancio XBRL (se disponibile), sul fascicolo storico allegato, e sulla Situazione Debitoria già dichiarata dall'ente.

DATI GIÀ RACCOLTI:
${contestoTesto}
${avvisoCarenzaBilancio}

Scrivi una relazione con questi paragrafi, in prosa, non elenchi puntati:
1. Identikit dell'impresa (dal fascicolo storico: anagrafica, oggetto, storia, stato, organi).
2. Posizione economico-patrimoniale (dal bilancio): sintesi di conto economico e stato patrimoniale, indici essenziali.
3. Struttura del debito: quello che emerge dal bilancio, quello che l'ente stesso ha già dichiarato di avere a credito (Situazione Debitoria contabilizzata) e, se presente, la Verifica certo-per-certo contro la Posizione VERA — commenta esplicitamente il delta per categoria (Debito, AVA), cioè il non contabilizzato che emerge dal file di verifica e che con la proposta andrà contabilizzato; segnala se i quadri sono coerenti o se qualcosa non torna.
4. Scenario liquidatorio di base — l'ancoraggio del test di convenienza (art. 63/88 CCII): cosa otterrebbe l'ente in una liquidazione, a spanne, dai soli dati di bilancio.
5. Eventuali segnali di incoerenza da segnalare (es. continuità aziendale dichiarata in tensione con i numeri, se presente).
6. Cosa manca e va aggiornato prima di poter valutare la proposta — il ponte esplicito verso i dati correnti che arriveranno con la proposta stessa.

Non dare un giudizio legale definitivo — è una base istruttoria per chi dovrà poi leggere la proposta, non un responso.${istruzioniBlocco}`;

    const bloccoDocumento = {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: visuraBase64,
      },
      title: nomeFileVisura,
      cache_control: { type: 'ephemeral' as const },
    };

    // AbortController con scadenza esplicita: se le chiamate non rientrano nel
    // budget, si abortisce e si restituisce un errore leggibile invece di
    // lasciare che Vercel uccida la funzione (spinner infinito lato UI).
    const controller = new AbortController();
    const timerScadenza = setTimeout(() => controller.abort(), SCADENZA_GENERAZIONE_MS);

    // Tutto in parallelo: una sezione per direttrice + la relazione. Ogni
    // sezione è indipendente e piccola; allSettled garantisce che il
    // fallimento di una NON butti via le altre — si salva quello che c'è.
    let esitiSezioni: PromiseSettledResult<SezioneChecklist | null>[];
    let esitoRelazione: PromiseSettledResult<Anthropic.Messages.Message>;
    try {
      const [sezRis, relRis] = await Promise.all([
        Promise.allSettled(direttrici.map((d, i) => generaSezione(d, i + 1, controller.signal))),
        Promise.allSettled([
          anthropic.messages.create(
            {
              model: 'claude-sonnet-5',
              // La relazione è l'unico output libero e lungo: tetto ampio, ma
              // fisso — non serve un parametro utente (il questionario, ora
              // spezzato per sezione, non ha più alcun limite da regolare).
              max_tokens: 8000,
              thinking: { type: 'disabled' },
              messages: [
                {
                  role: 'user',
                  content: [bloccoDocumento, { type: 'text', text: promptRelazione }],
                },
              ],
            },
            { signal: controller.signal }
          ),
        ]),
      ]);
      esitiSezioni = sezRis;
      esitoRelazione = relRis[0];
    } finally {
      clearTimeout(timerScadenza);
    }

    // Assembla le sezioni riuscite, in ordine di direttrice.
    const sezioni: SezioneChecklist[] = [];
    let sezioniFallite = 0;
    for (const esito of esitiSezioni) {
      if (esito.status === 'fulfilled' && esito.value) sezioni.push(esito.value);
      else sezioniFallite += 1;
    }

    if (sezioni.length === 0) {
      const scaduto = controller.signal.aborted;
      return {
        success: false,
        error: scaduto
          ? 'La generazione ha superato il tempo massimo disponibile — riprova.'
          : "L'assistente non è riuscito a generare il questionario — riprova tra poco.",
      };
    }

    // La relazione è secondaria: se fallita/scaduta, si salva comunque il
    // questionario con una nota al posto della relazione.
    const corpoRelazione =
      esitoRelazione.status === 'fulfilled'
        ? esitoRelazione.value.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
        : 'Relazione di inquadramento non disponibile (la generazione non è riuscita a completarla in tempo). Puoi rigenerare lo screening per riprovare.';
    // Avviso deterministico in testa quando l'analisi è stata lanciata senza
    // bilancio: garantito anche se il modello non lo ripetesse.
    const relazioneTesto = senzaBilancio
      ? `⚠️ ANALISI PRELIMINARE — BILANCIO XBRL ASSENTE\nQuesta relazione è stata generata senza bilancio XBRL: è quindi parziale e basata sui soli dati disponibili (fascicolo storico, Situazione Debitoria, Posizione VERA). Caricare il bilancio e rigenerare per l'inquadramento economico-patrimoniale completo.\n\n${corpoRelazione}`
      : corpoRelazione;

    await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_screening (azienda_id, direttrici_usate, sezioni, relazione_testo, nome_file_visura, generato_il)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (azienda_id) DO UPDATE SET direttrici_usate = $2, sezioni = $3, relazione_testo = $4, nome_file_visura = $5, generato_il = now()`,
      [
        aziendaId,
        JSON.stringify(direttrici),
        JSON.stringify(sezioni),
        relazioneTesto,
        nomeFileVisura,
      ]
    );
    await pool.query(
      `DELETE FROM "${nomeSchema}".azienda_screening_risposte WHERE azienda_id = $1`,
      [aziendaId]
    );

    if (sezioniFallite > 0) {
      console.warn(
        `[generaScreeningAziendaAction] ${sezioniFallite}/${direttrici.length} sezioni non generate (le altre salvate).`
      );
    }

    return { success: true, sezioni, relazioneTesto };
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

/**
 * Modifica il TESTO di una singola domanda generata dello Screening
 * (icona matita in Check List). Le domande vivono nel JSON
 * `azienda_screening.sezioni`, quindi si riscrive quel JSON. L'`id` della
 * domanda NON cambia: le risposte già date (chiave azienda_id+domanda_id)
 * restano agganciate correttamente, nessuna migrazione necessaria.
 */
export async function aggiornaTestoDomandaScreeningAction(
  nomeSchema: string,
  aziendaId: number,
  domandaId: string,
  nuovoTesto: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const testo = (nuovoTesto || '').trim();
    if (!testo) return { success: false, error: 'Il testo della domanda non può essere vuoto.' };

    await assicuraTabelleScreeningAzienda(nomeSchema);
    const ris = await pool.query(
      `SELECT sezioni FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (ris.rows.length === 0) {
      return { success: false, error: 'Nessuno screening trovato per questa azienda.' };
    }

    const sezioni: SezioneChecklist[] = ris.rows[0].sezioni || [];
    let trovata = false;
    for (const sez of sezioni) {
      for (const d of sez.domande || []) {
        if (d.id === domandaId) {
          d.domanda = testo;
          trovata = true;
        }
      }
    }
    if (!trovata) {
      return { success: false, error: 'Domanda non trovata nello screening.' };
    }

    await pool.query(
      `UPDATE "${nomeSchema}".azienda_screening SET sezioni = $2 WHERE azienda_id = $1`,
      [aziendaId, JSON.stringify(sezioni)]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaTestoDomandaScreeningAction] Errore:', error);
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
