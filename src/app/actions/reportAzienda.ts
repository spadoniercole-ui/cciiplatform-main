'use server';

// IL REPORT DELL'AZIENDA — l'unica uscita che tiene insieme le due verifiche e
// la valutazione.
//
// Qui non si calcola nulla di nuovo: si LEGGONO le fonti (esito
// amministrativo, dato contabile, screening, riscontri) e si compone il
// documento con `componiReport`. Il risultato si salva come SNAPSHOT con la
// versione della piattaforma e l'impronta del contenuto: rigenerare aggiunge
// una riga, non sovrascrive — la generazione precedente resta com'era.
//
// La verifica amministrativa non si tocca: nessuna funzione di questo file la
// riscrive o la rilancia. Il «rigenera» riguarda solo l'analisi AI, e passa
// dalla stessa azione dello screening (che è l'unico posto in cui si genera).

import { createHash } from 'node:crypto';
import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaReportAzienda, assicuraTabelleVerificaAzienda } from '@/db/provision';
import { APP_VERSION } from '@/lib/appVersion';
import {
  componiReport,
  normalizzaInclusioni,
  type ColonnaMappa,
  type DomandaQuestionario,
  type FonteMappa,
  type FonteSoglie25,
  type FontiReport,
  type InclusioniReport,
  type IndiceProspetto,
  type ReportComposto,
  type RigaProspetto,
} from '@/lib/reportAzienda/report';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import {
  calcolaRiscontriNormativiAzienda,
  generaScreeningAziendaAction,
  ottieniScreeningAzienda,
} from '@/app/actions/screeningAzienda';
import { ottieniVisuraTriageAction } from '@/app/actions/visuraTriage';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniIndiciSpazio } from '@/app/actions/parametriSpazio';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { leggiIdentificativiEnte } from '@/lib/anagraficaEnte/identificativi';
import { valutaValidita } from '@/lib/screening/validitaVerifica';
import { componiEsitoVerifica } from '@/lib/verifica/esito';
import { diagnosticaIaiAction } from '@/app/actions/iai';
import type { Riscontri } from '@/lib/normativa/riscontri';
import { VOCI_MAPPA } from '@/lib/verificaAzienda/voci';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import {
  raccomandaDecisione,
  type EsitoAmministrativo,
} from '@/lib/verificaAmministrativa/raccomandazione';
import { etichettaIstruttoria, type TipoIstruttoria } from '@/lib/giudice/lettura';
import { esitoPropostaValido } from '@/lib/scenari/esitoProposta';
import type {
  DocumentoPesato,
  FonteDecisioneFinale,
  ProceduraDecisione,
  StatoPiano,
} from '@/lib/reportAzienda/decisioneFinale';
import { leggiVerificaAzienda } from '@/lib/verificaAzienda/letturaVerifica';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

/** Il report salvato, così com'era al momento dell'emissione. */
export interface ReportSalvato {
  id: number;
  generatoIl: string;
  versione: string | null;
  impronta: string | null;
  contenuto: ReportComposto;
}

export interface VersioneReport {
  id: number;
  generatoIl: string;
  versione: string | null;
}

export interface StatoReportAzienda {
  success: boolean;
  report: ReportSalvato | null;
  versioni: VersioneReport[];
  error?: string;
}

export interface RisultatoGenerazioneReport {
  success: boolean;
  report?: ReportSalvato;
  error?: string;
}

export interface RigaElencoReport {
  aziendaId: number;
  ragioneSociale: string;
  anniXbrl: number;
  completa: boolean;
  debitoMemorizzato: number | null;
  ultimoReport: { generatoIl: string; versione: string | null } | null;
}

export interface ElencoReportSpazio {
  success: boolean;
  aziende: RigaElencoReport[];
  error?: string;
}

/** Le voci del prospetto, nell'ordine in cui si leggono in contabilità. */
const VOCI_PROSPETTO: { etichetta: string; chiave: string; forte: boolean }[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite', forte: false },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione', forte: false },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione', forte: false },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'Ammortamenti', chiave: 'ammortamenti', forte: false },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Oneri finanziari', chiave: 'oneriFinanziari', forte: false },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti', forte: false },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide', forte: false },
];

const numeroONull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** I NUMERIC arrivano come stringa: null resta null, non diventa zero. */
const numeric = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : numeroONull(Number(v));

/**
 * Gli indici di un bilancio, letti in modo difensivo: la forma dei due elenchi
 * (`indici`, `altriIndici`) non è identica, e un indice senza codice non può
 * essere confrontato con quelli abilitati nello spazio.
 */
function indiciDelBilancio(b: unknown): {
  codice: string;
  nome: string;
  soglia: string;
  valore: number | null;
  esito: string;
}[] {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const elenco = [
    ...(Array.isArray(o.indici) ? o.indici : []),
    ...(Array.isArray(o.altriIndici) ? o.altriIndici : []),
  ];
  return elenco.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const i = x as Record<string, unknown>;
    const codice = typeof i.codice === 'string' ? i.codice : null;
    const nome = typeof i.nome === 'string' ? i.nome : null;
    if (!codice || !nome) return [];
    return [
      {
        codice,
        nome,
        soglia: typeof i.soglia === 'string' ? i.soglia : String(i.soglia ?? '—'),
        valore: numeroONull(i.valore),
        esito: typeof i.esito === 'string' ? i.esito : '',
      },
    ];
  });
}

/**
 * Raccoglie le fonti. Ogni lettura che fallisce non ferma il report: quella
 * fonte diventa assente, e la sezione lo dichiarerà. Un documento incompleto
 * ma onesto è meglio di un errore che non lascia nulla.
 */
async function raccogliFonti(
  nomeSchema: string,
  aziendaId: number,
  inclusioni: InclusioniReport,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<FontiReport | string> {
  const azienda = await ottieniAziendaPerId(nomeSchema, aziendaId);
  if (!azienda.success || !azienda.azienda) return 'Azienda non trovata.';

  const [
    statoContabile,
    attenzioneRis,
    debitoRis,
    storicoRis,
    screeningRis,
    xbrlRis,
    indiciRis,
    dimensioniRis,
  ] = await Promise.all([
    statoVerificaContabileAction(nomeSchema).catch(() => null),
    ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).catch(() => null),
    debitoEnteMemorizzatoAction(nomeSchema, aziendaId).catch(() => null),
    ottieniStoricoVerificheAction(nomeSchema).catch(() => null),
    ottieniScreeningAzienda(nomeSchema, aziendaId).catch(() => null),
    ottieniStoricoXbrlAzienda(nomeSchema, aziendaId).catch(() => null),
    ottieniIndiciSpazio(nomeSchema).catch(() => null),
    // Le dimensioni spiegano il giudizio: si leggono una volta e il documento
    // le cita, invece di ricalcolarle nella composizione.
    diagnosticaIaiAction(nomeSchema, aziendaId, tipoSpazio).catch(() => null),
  ]);

  const identificativi = await leggiIdentificativiEnte(nomeSchema, aziendaId).catch(() => []);

  const rigaContabile = statoContabile?.success
    ? statoContabile.aziende.find((a) => a.aziendaId === aziendaId)
    : undefined;
  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const verificataIl = storicoRis?.success
    ? (storicoRis.righe?.find((v) => v.id === aziendaId)?.eseguitaIl ?? null)
    : null;

  const stato = screeningRis?.success ? screeningRis.stato : null;
  const screening = stato
    ? {
        esiste: stato.esiste,
        generatoIl: stato.generatoIl,
        relazioneTesto: stato.relazioneTesto,
        impronta: stato.visuraImpronta,
        nomeFileVisura: stato.nomeFileVisura,
        validita: stato.esiste ? valutaValidita(stato.generatoIl).etichetta : null,
        fatti: stato.visuraFatti,
      }
    : null;

  // Prospetto: solo gli indici abilitati nello spazio (fig. 12: quelli che il
  // motore davvero calcola e l'ente ha scelto), non i primi cinque.
  let prospetto: FontiReport['prospetto'] = null;
  if (xbrlRis?.success && xbrlRis.storico.length > 0) {
    const ordinati = [...xbrlRis.storico]
      .filter((b) => b.annoBilancio !== null)
      .sort((a, b) => (a.annoBilancio ?? 0) - (b.annoBilancio ?? 0));
    if (ordinati.length > 0) {
      const anni = ordinati.map((b) => b.annoBilancio);
      const righe: RigaProspetto[] = VOCI_PROSPETTO.map((v) => ({
        etichetta: v.etichetta,
        forte: v.forte,
        valori: ordinati.map((b) => {
          const dati = b.datiFinanziari as unknown as Record<string, unknown>;
          return numeroONull(dati[v.chiave]);
        }),
      }));
      const abilitati =
        indiciRis?.success && indiciRis.indici.length > 0
          ? indiciRis.indici.filter((i) => i.abilitato).map((i) => i.codice)
          : [];
      const recente = ordinati[ordinati.length - 1];
      const tutti = indiciDelBilancio(recente);
      const visibili =
        abilitati.length > 0 ? tutti.filter((i) => abilitati.includes(i.codice)) : tutti;
      const indici: IndiceProspetto[] = visibili.map((ind) => ({
        codice: ind.codice,
        nome: ind.nome,
        soglia: ind.soglia,
        valori: ordinati.map(
          (b) => indiciDelBilancio(b).find((x) => x.codice === ind.codice)?.valore ?? null
        ),
        esiti: ordinati.map(
          (b) => indiciDelBilancio(b).find((x) => x.codice === ind.codice)?.esito ?? null
        ),
      }));
      prospetto = { anni, righe, indici };
    }
  }

  let riscontri: Riscontri | null = null;
  let soglie25: FonteSoglie25 | null = null;
  if (inclusioni.riscontri) {
    const r = await calcolaRiscontriNormativiAzienda(nomeSchema, aziendaId).catch(() => null);
    riscontri = r?.success ? (r.riscontri ?? null) : null;
    // Le soglie dell'art. 25-novies: in uno spazio ENTE si valuta la sua
    // lettera, in uno REDIGENTE tutte — lo decide il motore delle soglie.
    const s = await valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio).catch(() => null);
    if (s?.success && s.esito) {
      soglie25 = {
        righe: s.esito.righe.map((riga) => ({
          ambito: riga.ambito,
          descrizione: riga.descrizione,
          esposizione: riga.esposizione,
          esito: riga.esito,
          motivo: riga.motivo,
          fonte: riga.fonte ?? null,
          applicabile: riga.applicabile,
        })),
        datiMancanti: s.esito.datiMancanti,
        nonApplicabiliPerDatiMancanti: s.esito.nonApplicabiliPerDatiMancanti ?? 0,
      };
    }
  }

  // La mappa: solo la simulazione SALVATA come base degli scenari. Se la
  // tabella non esiste ancora (verifica azienda mai aperta) non è un errore:
  // semplicemente non c'è una base da citare.
  let mappa: FonteMappa | null = null;
  try {
    await assicuraTabelleVerificaAzienda(nomeSchema);
    const baseRis = await pool.query(
      `SELECT profilo, annualita, debito_ente, crescita_storica_pct, crescita_applicata_pct,
              colonne, avvertenze, created_at
         FROM "${nomeSchema}".verifica_azienda_simulazioni
        WHERE azienda_id = $1 AND base_per_proposta = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [aziendaId]
    );
    const b = baseRis.rows[0];
    if (b) {
      const abilitati =
        indiciRis?.success && indiciRis.indici.length > 0
          ? indiciRis.indici.filter((i) => i.abilitato).map((i) => i.codice)
          : [];
      const grezze = Array.isArray(b.colonne) ? (b.colonne as unknown[]) : [];
      const colonne: ColonnaMappa[] = grezze.flatMap((x) => {
        if (!x || typeof x !== 'object') return [];
        const c = x as Record<string, unknown>;
        const anno = Number(c.anno);
        if (!Number.isInteger(anno)) return [];
        const dati = (c.dati && typeof c.dati === 'object' ? c.dati : {}) as Record<
          string,
          unknown
        >;
        const valori: Record<string, number | null> = {};
        for (const v of VOCI_MAPPA) valori[v.chiave] = numeroONull(dati[v.chiave]);
        return [
          {
            anno,
            tipo: (c.tipo === 'PROIEZIONE' || c.tipo === 'CALCOLATO' ? 'PROIEZIONE' : 'STORICO') as
              'STORICO' | 'PROIEZIONE',
            valori,
            debitoEnteInserito: numeroONull(c.debitoEnteInserito) ?? 0,
            indici: indiciDelBilancio(c)
              .filter((i) => abilitati.length === 0 || abilitati.includes(i.codice))
              .map((i) => ({
                codice: i.codice,
                nome: i.nome,
                soglia: i.soglia,
                valore: i.valore,
                esito: i.esito,
              })),
          },
        ];
      });
      const profilo = String(b.profilo ?? '');
      mappa = {
        profilo: profilo === 'FOTOGRAFIA' ? 'Fotografia contabile' : profilo,
        annualita: Number(b.annualita ?? 0),
        debitoEnte: numeric(b.debito_ente) ?? 0,
        crescitaStoricaPct: numeric(b.crescita_storica_pct),
        crescitaApplicataPct: numeric(b.crescita_applicata_pct),
        avvertenze: Array.isArray(b.avvertenze) ? b.avvertenze.map(String) : [],
        salvataIl: b.created_at ? new Date(b.created_at as string).toISOString() : null,
        colonne,
      };
    }
  } catch {
    mappa = null;
  }

  // L'ultimo bilancio in archivio: indici oltre soglia e patrimonio netto.
  // Sono gli stessi fatti che legge la raccomandazione della verifica
  // amministrativa: si prendono da qui, senza una seconda interrogazione.
  const bilancioRecente =
    xbrlRis?.success && xbrlRis.storico.length > 0
      ? [...xbrlRis.storico]
          .filter((b) => b.annoBilancio !== null)
          .sort((a, b) => (a.annoBilancio ?? 0) - (b.annoBilancio ?? 0))
          .pop()
      : undefined;
  const indiciViolati = bilancioRecente
    ? bilancioRecente.indici.filter((i) => i.esito === 'VIOLATO').length
    : null;
  const patrimonioNetto = bilancioRecente
    ? (bilancioRecente.datiFinanziari.patrimonioNetto ?? null)
    : null;

  // Gli scenari dell'azienda: il report cita l'esito che si sta valutando, non
  // lo ricalcola. La colonna può mancare in un tenant non ancora provisionato:
  // in quel caso la sezione non c'è, e non è un errore.
  let proposte: FontiReport['proposte'] = null;
  try {
    // Ogni scenario porta con sé il confronto con il provvedimento, quando
    // c'è: è da lì che il documento prende i numeri per dire che cosa cambia
    // per l'ente fra un atto e l'altro. Se la tabella dell'istruttoria non
    // esiste (tenant vecchio), si legge senza — la sezione resta, senza cifre.
    let righe: Record<string, unknown>[];
    try {
      const conIstruttoria = await pool.query(
        `SELECT s.id, s.nome, s.tipo_istruttoria, s.esito_proposta, s.archiviato,
                i.confronto
           FROM "${nomeSchema}".scenari s
           LEFT JOIN "${nomeSchema}".istruttoria_giudice i ON i.scenario_id = s.id
          WHERE s.azienda_id = $1
          ORDER BY s.id DESC`,
        [aziendaId]
      );
      righe = conIstruttoria.rows;
    } catch {
      const senzaIstruttoria = await pool.query(
        `SELECT id, nome, tipo_istruttoria, esito_proposta, archiviato
           FROM "${nomeSchema}".scenari
          WHERE azienda_id = $1
          ORDER BY id DESC`,
        [aziendaId]
      );
      righe = senzaIstruttoria.rows;
    }
    const numero = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    // Le righe dell'accordo che riguardano l'ente: una sola per proposta, la
    // sua. Da qui il recupero offerto, che il provvedimento dà in un altro
    // modo (importo ammesso e percentuale di realizzo).
    const offerteEnte = new Map<number, { dovuto: number; offerta: number; rate: number | null }>();
    try {
      const ids = righe.map((x) => Number(x.id)).filter((n) => Number.isInteger(n));
      if (ids.length > 0) {
        const q = await pool.query(
          `SELECT scenario_id, importo_dovuto, percentuale_offerta, numero_rate
             FROM "${nomeSchema}".proposta_creditori
            WHERE rilevante_per_ente = TRUE AND scenario_id = ANY($1::int[])`,
          [ids]
        );
        for (const r of q.rows) {
          offerteEnte.set(Number(r.scenario_id), {
            dovuto: Number(r.importo_dovuto ?? 0),
            offerta: Number(r.percentuale_offerta ?? 0),
            rate: numero(r.numero_rate),
          });
        }
      }
    } catch {
      // Tabella assente o riga non ancora inserita: l'atto resta senza cifre.
    }

    proposte = righe.map((x) => {
      // I numeri dell'atto per l'ente: credito, ammesso, recupero, perdita,
      // tempi. Sono quelli già calcolati nel confronto, non un secondo conto.
      const c = (x.confronto ?? null) as Record<string, unknown> | null;
      const dalProvvedimento =
        c && numero(c.creditoEnte) !== null
          ? {
              creditoEnte: numero(c.creditoEnte)!,
              ammesso: numero(c.ammessoGiudice) ?? 0,
              recupero: numero(c.recuperoAtteso),
              perdita: numero(c.perditaTotale),
              tempiMesi: numero(c.tempiMesi),
            }
          : null;
      const offerta = offerteEnte.get(Number(x.id));
      const dallAccordo = offerta
        ? {
            creditoEnte: offerta.dovuto,
            ammesso: offerta.dovuto,
            recupero: Math.round(offerta.dovuto * (offerta.offerta / 100) * 100) / 100,
            perdita: Math.round(offerta.dovuto * (1 - offerta.offerta / 100) * 100) / 100,
            tempiMesi: null,
            offertaPct: offerta.offerta,
            rate: offerta.rate,
          }
        : null;
      const ente = dalProvvedimento ?? dallAccordo;
      return {
        scenarioId: Number(x.id),
        nome: String(x.nome ?? 'Scenario'),
        situazione: etichettaIstruttoria(x.tipo_istruttoria as TipoIstruttoria),
        esito: esitoPropostaValido(x.esito_proposta) ? x.esito_proposta : null,
        archiviato: x.archiviato === true,
        ente,
      };
    });
  } catch {
    proposte = null;
  }

  // 2-bis-bis. I FATTI DELLA DECISIONE (0.247.0).
  //
  // Il piano dell'azienda è per scenario, non per azienda: esiste se almeno
  // uno degli scenari di questa azienda ce l'ha. Se la tabella non c'è (tenant
  // vecchio) non è «manca il piano»: è «non si può dire», che è un'altra cosa
  // e il documento la scrive così.
  let piano: StatoPiano = 'NON_VALUTABILE';
  try {
    const q = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM "${nomeSchema}".piano_aziendale p
         JOIN "${nomeSchema}".scenari s ON s.id = p.scenario_id
        WHERE s.azienda_id = $1`,
      [aziendaId]
    );
    piano = Number(q.rows[0]?.n ?? 0) > 0 ? 'PRESENTE' : 'ASSENTE';
  } catch {
    piano = 'NON_VALUTABILE';
  }

  // I recuperi delle due procedure rimaste: quelli della verifica azienda,
  // calcolati sulle percentuali di rango dell'ente. Non un secondo conto.
  const verifica = await leggiVerificaAzienda(nomeSchema, aziendaId).catch(() => null);
  const procedura = (codice: 'LIQUIDAZIONE' | 'CRAM_DOWN'): ProceduraDecisione | null => {
    const s = verifica?.fotografia.scenari.find((x) => x.codice === codice);
    return s
      ? {
          recupero: s.recupero,
          perdita: s.perdita,
          calcolabile: s.calcolabile,
          motivo: s.motivo,
        }
      : null;
  };

  // La documentazione fondamentale, pesata. «Alto» quando senza quel documento
  // la conclusione cambia; «medio» quando la rende meno solida. I pesi sono una
  // convenzione dichiarata, non una misura di legge.
  const documentiMancanti: DocumentoPesato[] = [];
  if (piano === 'ASSENTE') {
    documentiMancanti.push({
      nome: 'Piano dell’azienda',
      peso: 'ALTO',
      perche: 'senza, si valuta un accordo ipotizzato',
    });
  }
  if (!proposte || proposte.length === 0) {
    documentiMancanti.push({
      nome: 'Atto in valutazione (proposta, decreto o cram down)',
      peso: 'ALTO',
      perche: 'il documento non ha un atto da leggere',
    });
  }
  if ((rigaContabile?.anniXbrl ?? 0) === 0) {
    documentiMancanti.push({
      nome: 'Bilanci XBRL',
      peso: 'ALTO',
      perche: 'senza il dato depositato la contabile non si compone',
    });
  }
  if ((debitoRis?.debito?.totale ?? null) === null) {
    documentiMancanti.push({
      nome: 'Debito dell’ente accertato',
      peso: 'ALTO',
      perche: 'senza il credito vantato gli scenari non si misurano',
    });
  }
  if (verifica && verifica.nota === null) {
    documentiMancanti.push({
      nome: 'Nota integrativa',
      peso: 'MEDIO',
      perche: 'continuità e piani non si leggono dal bilancio',
    });
  }

  const decisione: FonteDecisioneFinale = {
    piano,
    credito: verifica?.fotografia.credito ?? debitoRis?.debito?.totale ?? null,
    patrimonioNetto,
    indiciViolati,
    liquidazione: procedura('LIQUIDAZIONE'),
    cramDown: procedura('CRAM_DOWN'),
    documentiMancanti,
  };

  const risposte = new Map((stato?.risposte ?? []).map((r) => [r.domandaId, r.risposta]));
  const questionario = inclusioni.questionario
    ? (stato?.sezioni ?? []).map((sezione) => ({
        titolo: `${sezione.numero}. ${sezione.titolo}`,
        domande: sezione.domande.map<DomandaQuestionario>((d) => {
          const r = risposte.get(d.id);
          return {
            id: d.id,
            domanda: d.domanda,
            risposta: r === true ? 'Sì' : r === false ? 'No' : null,
          };
        }),
      }))
    : null;

  return {
    ragioneSociale: azienda.azienda.ragioneSociale,
    partitaIva: azienda.azienda.partitaIva ?? null,
    codiceFiscale: azienda.azienda.codiceFiscale ?? null,
    identificativi: identificativi.map((i) => ({ etichetta: i.etichetta, valore: i.valore })),
    amministrativa: attenzione
      ? {
          etichetta: attenzione.etichetta,
          esito: attenzione.esito,
          copertura: `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`,
          verificataIl,
          debitoTotale: debitoRis?.debito?.totale ?? null,
          debitoFonte: debitoRis?.debito?.fonte ?? null,
          debitoIl: debitoRis?.memorizzatoIl ?? null,
        }
      : null,
    contabile: rigaContabile
      ? {
          anniXbrl: rigaContabile.anniXbrl,
          visuraIl: rigaContabile.visuraIl,
          parametriPresenti: rigaContabile.parametriPresenti,
          completa: rigaContabile.completa,
        }
      : null,
    // L'ESITO È UNO. La stessa composizione della pagina: semaforo come
    // giudizio, dimensioni come spiegazione. Nessun secondo indice.
    esito: attenzione
      ? componiEsitoVerifica({
          giudizio: attenzione,
          dimensioni:
            dimensioniRis?.success && dimensioniRis.dimensioni ? dimensioniRis.dimensioni : [],
        })
      : null,
    screening,
    prospetto,
    riscontri,
    soglie25,
    mappa,
    questionario,
    proposte,
    decisione,
    // La raccomandazione si compone dagli stessi fatti già letti qui: nessuna
    // interrogazione in più, e il documento la riporta com'era al momento
    // dell'emissione.
    raccomandazione: attenzione
      ? raccomandaDecisione({
          esito: attenzione.esito as EsitoAmministrativo,
          fattoreDeterminante: attenzione.fattoreDeterminante,
          copertura: attenzione.copertura,
          debitoEnte: debitoRis?.debito?.totale ?? null,
          anniXbrl: rigaContabile?.anniXbrl ?? 0,
          parametriPresenti: rigaContabile?.parametriPresenti ?? false,
          indiciViolati,
          patrimonioNetto,
        })
      : null,
  };
}

/** L'ultimo report emesso e le generazioni precedenti (metadati). */
export async function ottieniReportAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<StatoReportAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return { success: false, report: null, versioni: [], error: 'Nome schema non valido.' };
    await assicuraTabellaReportAzienda(nomeSchema);
    const r = await pool.query(
      `SELECT id, contenuto, impronta, app_version, generato_il
         FROM "${nomeSchema}".azienda_report
        WHERE azienda_id = $1
        ORDER BY generato_il DESC, id DESC
        LIMIT 20`,
      [aziendaId]
    );
    const versioni: VersioneReport[] = r.rows.map((x) => ({
      id: Number(x.id),
      generatoIl: new Date(x.generato_il as string).toISOString(),
      versione: x.app_version ? String(x.app_version) : null,
    }));
    const primo = r.rows[0];
    return {
      success: true,
      versioni,
      report: primo
        ? {
            id: Number(primo.id),
            generatoIl: new Date(primo.generato_il as string).toISOString(),
            versione: primo.app_version ? String(primo.app_version) : null,
            impronta: primo.impronta ? String(primo.impronta) : null,
            contenuto: primo.contenuto as ReportComposto,
          }
        : null,
    };
  } catch (error: unknown) {
    console.error('[ottieniReportAziendaAction] Errore:', error);
    return {
      success: false,
      report: null,
      versioni: [],
      error: `Impossibile leggere il report: ${(error as Error).message}`,
    };
  }
}

/** Una generazione precedente, com'era. */
export async function ottieniVersioneReportAction(
  nomeSchema: string,
  aziendaId: number,
  reportId: number
): Promise<{ success: boolean; report?: ReportSalvato; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema) || !Number.isInteger(reportId) || reportId <= 0) {
      return { success: false, error: 'Richiesta non valida.' };
    }
    const r = await pool.query(
      `SELECT id, contenuto, impronta, app_version, generato_il
         FROM "${nomeSchema}".azienda_report
        WHERE id = $1 AND azienda_id = $2`,
      [reportId, aziendaId]
    );
    if (r.rows.length === 0) return { success: false, error: 'Generazione non trovata.' };
    const x = r.rows[0];
    return {
      success: true,
      report: {
        id: Number(x.id),
        generatoIl: new Date(x.generato_il as string).toISOString(),
        versione: x.app_version ? String(x.app_version) : null,
        impronta: x.impronta ? String(x.impronta) : null,
        contenuto: x.contenuto as ReportComposto,
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniVersioneReportAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile leggere la generazione: ${(error as Error).message}`,
    };
  }
}

/**
 * Compone ed emette il report. È l'unico punto in cui si scrive: lo snapshot
 * non si modifica più, e rigenerare produce una nuova riga.
 */
export async function generaReportAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  inclusioniInput: unknown
): Promise<RisultatoGenerazioneReport> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non valida.' };
    }
    const inclusioni = normalizzaInclusioni(inclusioniInput);
    await assicuraTabellaReportAzienda(nomeSchema);

    // «Rigenera» passa dall'azione dello screening: la visura trattenuta è
    // l'unico modo per rifare l'analisi sui documenti già acquisiti. Se non
    // c'è, si dice — non si genera un'analisi senza documento.
    if (inclusioni.analisi === 'RIGENERA') {
      const visura = await ottieniVisuraTriageAction(nomeSchema, aziendaId);
      if (!visura.success || !visura.visura) {
        return {
          success: false,
          error:
            'Per rigenerare l’analisi serve la visura trattenuta: ricaricala nella verifica contabile (sezione 1), oppure scegli «riusa la relazione esistente».',
        };
      }
      const g = await generaScreeningAziendaAction(
        nomeSchema,
        aziendaId,
        visura.visura.url,
        visura.visura.nome
      );
      if (!g.success) return { success: false, error: g.error ?? 'Rigenerazione non riuscita.' };
    }

    const fonti = await raccogliFonti(nomeSchema, aziendaId, inclusioni, contesto.tipoSpazio);
    if (typeof fonti === 'string') return { success: false, error: fonti };

    const composto = componiReport(fonti, inclusioni);
    const contenuto: ReportComposto = {
      ragioneSociale: fonti.ragioneSociale,
      generatoIl: new Date().toISOString(),
      versione: APP_VERSION,
      impronta: null,
      inclusioni,
      avvisi: composto.avvisi,
      sezioni: composto.sezioni,
    };
    // L'impronta copre il contenuto senza sé stessa: è la prova che il
    // documento non è cambiato dopo l'emissione.
    const impronta = createHash('sha256')
      .update(JSON.stringify({ ...contenuto, impronta: null }))
      .digest('hex');
    contenuto.impronta = impronta;

    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_report (azienda_id, contenuto, impronta, app_version)
       VALUES ($1, $2::jsonb, $3, $4)
       RETURNING id, generato_il`,
      [aziendaId, JSON.stringify(contenuto), impronta, APP_VERSION]
    );
    return {
      success: true,
      report: {
        id: Number(r.rows[0].id),
        generatoIl: new Date(r.rows[0].generato_il as string).toISOString(),
        versione: APP_VERSION,
        impronta,
        contenuto,
      },
    };
  } catch (error: unknown) {
    console.error('[generaReportAziendaAction] Errore:', error);
    return { success: false, error: `Il report non è stato emesso: ${(error as Error).message}` };
  }
}

/** L'elenco dello spazio: azienda, stato delle fonti, ultimo report. */
export async function elencoReportSpazioAction(nomeSchema: string): Promise<ElencoReportSpazio> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return { success: false, aziende: [], error: 'Nome schema non valido.' };
    await assicuraTabellaReportAzienda(nomeSchema);

    const stato = await statoVerificaContabileAction(nomeSchema);
    if (!stato.success) {
      return { success: false, aziende: [], error: stato.error ?? 'Stato non leggibile.' };
    }
    const ultimi = await pool.query(
      `SELECT DISTINCT ON (azienda_id) azienda_id, generato_il, app_version
         FROM "${nomeSchema}".azienda_report
        ORDER BY azienda_id, generato_il DESC, id DESC`
    );
    const mappa = new Map(
      ultimi.rows.map((x) => [
        Number(x.azienda_id),
        {
          generatoIl: new Date(x.generato_il as string).toISOString(),
          versione: x.app_version ? String(x.app_version) : null,
        },
      ])
    );
    return {
      success: true,
      aziende: stato.aziende.map((a) => ({
        aziendaId: a.aziendaId,
        ragioneSociale: a.ragioneSociale,
        anniXbrl: a.anniXbrl,
        completa: a.completa,
        debitoMemorizzato: a.debitoMemorizzato,
        ultimoReport: mappa.get(a.aziendaId) ?? null,
      })),
    };
  } catch (error: unknown) {
    console.error('[elencoReportSpazioAction] Errore:', error);
    return {
      success: false,
      aziende: [],
      error: `Impossibile leggere l’elenco: ${(error as Error).message}`,
    };
  }
}
