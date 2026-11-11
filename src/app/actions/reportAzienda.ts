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
import { assicuraTabellaReportAzienda } from '@/db/provision';
import { APP_VERSION } from '@/lib/appVersion';
import {
  componiReport,
  normalizzaInclusioni,
  type DomandaQuestionario,
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
import type { Riscontri } from '@/lib/normativa/riscontri';

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
  inclusioni: InclusioniReport
): Promise<FontiReport | string> {
  const azienda = await ottieniAziendaPerId(nomeSchema, aziendaId);
  if (!azienda.success || !azienda.azienda) return 'Azienda non trovata.';

  const [statoContabile, attenzioneRis, debitoRis, storicoRis, screeningRis, xbrlRis, indiciRis] =
    await Promise.all([
      statoVerificaContabileAction(nomeSchema).catch(() => null),
      ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).catch(() => null),
      debitoEnteMemorizzatoAction(nomeSchema, aziendaId).catch(() => null),
      ottieniStoricoVerificheAction(nomeSchema).catch(() => null),
      ottieniScreeningAzienda(nomeSchema, aziendaId).catch(() => null),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId).catch(() => null),
      ottieniIndiciSpazio(nomeSchema).catch(() => null),
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
  if (inclusioni.riscontri) {
    const r = await calcolaRiscontriNormativiAzienda(nomeSchema, aziendaId).catch(() => null);
    riscontri = r?.success ? (r.riscontri ?? null) : null;
  }

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
    screening,
    prospetto,
    riscontri,
    questionario,
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
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
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
            'Per rigenerare l’analisi serve la visura trattenuta: ricaricala nella Valutazione completa, oppure scegli «riusa la relazione esistente».',
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

    const fonti = await raccogliFonti(nomeSchema, aziendaId, inclusioni);
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
