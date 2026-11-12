// LA VERIFICA AZIENDA — la simulazione che unisce le due verifiche.
//
// La verifica amministrativa dice com'è l'azienda oggi e consegna il debito
// dell'ente; la contabile porta il dato storico depositato. Qui le due cose
// diventano una sola lettura: si parte dagli anni di bilancio e si proiettano
// le annualità successive con un profilo dichiarato — standard, migliorativo,
// peggiorativo — mentre il debito dell'ente entra nel passivo come dato certo.
//
// NIENTE NUMERI INVENTATI, E NIENTE RIGHE PARALLELE (0.205.0). Prima ogni anno
// cresceva dello stesso tasso: il prospetto diventava una moltiplicazione, con
// ricavi, EBITDA e debiti che salivano in parallelo per sempre. Ora la
// traiettoria ha una forma e una fonte dichiarate:
//
//   g(t) = g_settore + (g_partenza − g_settore) · λ^(t−1)
//
// dove g_partenza è la crescita composta dei ricavi depositati (il passato che
// l'azienda ha davvero fatto) e g_settore è la crescita della serie ISTAT del
// suo gruppo ATECO. Senza serie di settore la traiettoria converge verso ricavi
// invariati: il passato non è una previsione, e non lo si spaccia per tale.
// λ (DECADIMENTO_CRESCITA) è dichiarato qui sotto, non nascosto nel calcolo.
//
// Il debito dell'ente non resta appeso al passivo per sempre: si iscrive nella
// prima annualità e si estingue in ANNI_RIENTRO_DEBITO rate costanti, così il
// passivo flette — è quel ramo in flessione che il dato attuale dell'ente
// impone alla lettura. Le disponibilità liquide seguono il risultato
// dell'esercizio al netto dei rimborsi: nessun altro movimento ipotizzato.
//
// Gli indici NON si ricalcolano con formule parallele: ogni colonna passa da
// costruisciBundleIndici, lo stesso motore del resto della piattaforma.
//
// Logica pura, con i suoi test.

import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import type { AlertSeverity, DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';

export type ProfiloSimulazione = 'STANDARD' | 'MIGLIORATIVO' | 'PEGGIORATIVO';

export const PROFILI: {
  codice: ProfiloSimulazione;
  etichetta: string;
  descrizione: string;
}[] = [
  {
    codice: 'STANDARD',
    etichetta: 'Standard',
    descrizione:
      'Ricavi dalla crescita storica composta, che si avvicina ogni anno a quella di settore; costi che seguono i ricavi. È il profilo di continuità.',
  },
  {
    codice: 'MIGLIORATIVO',
    etichetta: 'Migliorativo',
    descrizione:
      'Stessa traiettoria, spostata di 3 punti in più sui ricavi e di 2 in meno sui costi. Ipotesi dichiarata, non previsione.',
  },
  {
    codice: 'PEGGIORATIVO',
    etichetta: 'Peggiorativo',
    descrizione:
      'Stessa traiettoria, spostata di 3 punti in meno sui ricavi e di 2 in più sui costi. Ipotesi dichiarata, non previsione.',
  },
];

/** Lo scostamento dei profili, in punti percentuali. Non è un dato normativo. */
export const SCOSTAMENTO_PROFILO_PP = 3;
/** Quanto i costi seguono i ricavi in più o in meno, in punti percentuali. */
export const SCOSTAMENTO_COSTI_PP = 2;
/** Oltre questo intervallo la proiezione non descrive più un'ipotesi. */
export const LIMITE_CRESCITA_PCT = 25;
/**
 * Quanto la crescita si avvicina al dato di settore a ogni annualità: dopo un
 * anno resta il 60% dello scostamento, dopo due il 36%, dopo tre il 22%.
 */
export const DECADIMENTO_CRESCITA = 0.6;
/**
 * I limiti del decadimento configurabile: a 0 la convergenza al settore è
 * immediata (il primo anno proiettato usa già il tasso di settore), a 0,9 la
 * traiettoria resta a lungo vicina al passato. Oltre, non è più una
 * convergenza e il prospetto torna a essere una riga.
 */
export const DECADIMENTO_MINIMO = 0;
export const DECADIMENTO_MASSIMO = 0.9;
/** Rate in cui si estingue il debito dell'ente entrato nel passivo. */
export const ANNI_RIENTRO_DEBITO = 3;
export const ANNI_RIENTRO_MINIMI = 1;
export const ANNI_RIENTRO_MASSIMI = 8;

export const ANNUALITA_PREDEFINITE = 3;
export const ANNUALITA_MINIME = 1;
export const ANNUALITA_MASSIME = 8;

/** Da dove viene la traiettoria: il settore, il passato dell'azienda, o niente. */
export type SorgenteCrescita = 'SETTORE' | 'STORICA' | 'NESSUNA';

export interface AnnoStorico {
  anno: number;
  dati: DatiFinanziariPeriodo;
}

export interface CrescitaAnno {
  /** Progressivo dell'annualità proiettata: 1 è la prima. */
  progressivo: number;
  ricaviPct: number;
  costiPct: number;
}

export interface ColonnaVerificaAzienda {
  anno: number;
  tipo: 'STORICO' | 'PROIEZIONE';
  dati: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  severity: AlertSeverity;
  /** Solo sulla prima proiezione: qui è entrato il debito dell'ente. */
  debitoEnteInserito: number;
  /** Quota del debito dell'ente rimborsata in questa annualità. */
  rimborsoDebitoEnte: number;
  /** Debito dell'ente ancora a passivo a fine annualità. */
  debitoEnteResiduo: number;
  /** Crescita applicata a ricavi e costi in questa colonna (0 sugli storici). */
  crescitaRicaviPct: number;
  crescitaCostiPct: number;
}

export interface EsitoSimulazione {
  colonne: ColonnaVerificaAzienda[];
  profilo: ProfiloSimulazione;
  annualita: number;
  debitoEnte: number;
  crescitaStoricaPct: number | null;
  /** Crescita della serie ISTAT del settore, se il dato è in archivio. */
  crescitaSettorePct: number | null;
  fonteCrescita: SorgenteCrescita;
  /** Quanto crescono i ricavi nella prima annualità proiettata. */
  crescitaApplicataPct: number;
  anniRientroDebito: number;
  /** Quanto resta dello scostamento dal settore dopo un anno (0–0,9). */
  decadimentoCrescita: number;
  /** Perché la simulazione non è calcolabile, se lo è. */
  motivo: string | null;
  avvertenze: string[];
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const limita = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Crescita annua composta dei ricavi fra primo e ultimo anno: null quando i
 * dati non bastano o il primo ricavo non è positivo. Nessuna divisione per
 * zero e nessuna crescita inventata.
 */
export function crescitaStorica(anni: AnnoStorico[]): number | null {
  const validi = [...anni]
    .filter((a) => Number.isFinite(a.dati?.ricaviVendite) && a.dati.ricaviVendite > 0)
    .sort((a, b) => a.anno - b.anno);
  if (validi.length < 2) return null;
  const primo = validi[0];
  const ultimo = validi[validi.length - 1];
  const anniTrascorsi = ultimo.anno - primo.anno;
  if (anniTrascorsi <= 0) return null;
  const tasso =
    Math.pow(ultimo.dati.ricaviVendite / primo.dati.ricaviVendite, 1 / anniTrascorsi) - 1;
  if (!Number.isFinite(tasso)) return null;
  return arrotonda(limita(tasso * 100, -LIMITE_CRESCITA_PCT, LIMITE_CRESCITA_PCT));
}

/** Quanto crescono ricavi e costi nel profilo scelto, dato un tasso di base. */
export function cresciteProfilo(
  profilo: ProfiloSimulazione,
  storica: number | null
): { ricaviPct: number; costiPct: number } {
  const base = storica ?? 0;
  const scostamento =
    profilo === 'MIGLIORATIVO'
      ? SCOSTAMENTO_PROFILO_PP
      : profilo === 'PEGGIORATIVO'
        ? -SCOSTAMENTO_PROFILO_PP
        : 0;
  const ricaviPct = arrotonda(
    limita(base + scostamento, -LIMITE_CRESCITA_PCT, LIMITE_CRESCITA_PCT)
  );
  const costiScostamento =
    profilo === 'MIGLIORATIVO'
      ? -SCOSTAMENTO_COSTI_PP
      : profilo === 'PEGGIORATIVO'
        ? SCOSTAMENTO_COSTI_PP
        : 0;
  const costiPct = arrotonda(
    limita(ricaviPct + costiScostamento, -LIMITE_CRESCITA_PCT, LIMITE_CRESCITA_PCT)
  );
  return { ricaviPct, costiPct };
}

/**
 * La traiettoria delle crescite, anno per anno.
 *
 * Parte dalla crescita storica dell'azienda e si avvicina a quella di settore:
 * `g(t) = g_settore + (g_partenza − g_settore) · λ^(t−1)`. Senza settore,
 * arrivo a ricavi invariati; senza nemmeno due bilanci, parte da zero. Il
 * profilo sposta ricavi e costi di una misura dichiarata, anno per anno.
 */
export function traiettoriaCrescite(input: {
  storica: number | null;
  settore: number | null;
  profilo: ProfiloSimulazione;
  annualita: number;
  decadimento?: number;
}): CrescitaAnno[] {
  const decadimento = limita(input.decadimento ?? DECADIMENTO_CRESCITA, 0, 1);
  const partenza = input.storica ?? input.settore ?? 0;
  const arrivo = input.settore ?? 0;
  const annualita = Math.max(1, Math.round(input.annualita));

  const anni: CrescitaAnno[] = [];
  for (let progressivo = 1; progressivo <= annualita; progressivo++) {
    const convergenza = arrivo + (partenza - arrivo) * Math.pow(decadimento, progressivo - 1);
    const { ricaviPct, costiPct } = cresciteProfilo(input.profilo, arrotonda(convergenza));
    anni.push({ progressivo, ricaviPct, costiPct });
  }
  return anni;
}

function proiettaUnAnno(
  base: DatiFinanziariPeriodo,
  ricaviPct: number,
  costiPct: number,
  movimenti: { inserimento: number; rimborso: number }
): DatiFinanziariPeriodo {
  const fattoreRicavi = 1 + ricaviPct / 100;
  const fattoreCosti = 1 + costiPct / 100;

  const ricaviVendite = arrotonda(base.ricaviVendite * fattoreRicavi);
  const valoreProduzione = arrotonda(base.valoreProduzione * fattoreRicavi);
  const costiProduzione = arrotonda(base.costiProduzione * fattoreCosti);
  const ebit = arrotonda(valoreProduzione - costiProduzione);
  const ebitda = arrotonda(ebit + base.ammortamenti);
  const utileEsercizio = arrotonda(ebit - base.oneriFinanziari);
  const patrimonioNetto = arrotonda(base.patrimonioNetto + (utileEsercizio - base.utileEsercizio));

  // Il debito dell'ente è un debito iscritto: entra nel passivo, non riduce la
  // liquidità finché non lo si paga. Da lì si estingue a rate: ogni quota
  // abbassa il passivo e la cassa di pari importo.
  const totaleDebiti = Math.max(
    0,
    arrotonda(base.totaleDebiti + movimenti.inserimento - movimenti.rimborso)
  );
  const passivoCorrente = Math.max(
    0,
    arrotonda(base.passivoCorrente + movimenti.inserimento - movimenti.rimborso)
  );
  // Cassa: il risultato dell'esercizio, al netto della rata pagata. Nessun
  // altro movimento (capitale circolante, investimenti) è ipotizzato qui.
  const disponibilitaLiquide = arrotonda(
    base.disponibilitaLiquide + utileEsercizio - movimenti.rimborso
  );

  return {
    ...base,
    ricaviVendite,
    valoreProduzione,
    costiProduzione,
    ebit,
    ebitda,
    utileEsercizio,
    patrimonioNetto,
    totaleDebiti,
    passivoCorrente,
    disponibilitaLiquide,
  };
}

/**
 * Le colonne della mappa: gli anni storici così come sono, poi le proiezioni
 * con la traiettoria del profilo scelto. Il debito dell'ente entra una volta
 * sola, nella prima annualità proiettata, e si estingue in rate costanti.
 */
export function colonneSimulazione(input: {
  anni: AnnoStorico[];
  profilo: ProfiloSimulazione;
  annualita: number;
  debitoEnte: number;
  /** Crescita della serie ISTAT del settore, se disponibile: dà la destinazione. */
  crescitaSettorePct?: number | null;
  /** Rate in cui si estingue il debito dell'ente. */
  anniRientroDebito?: number;
  /** Decadimento della crescita verso il settore (0–0,9). */
  decadimentoCrescita?: number;
}): EsitoSimulazione {
  const anni = [...input.anni]
    .filter((a) => Number.isInteger(a.anno) && a.dati && typeof a.dati.ricaviVendite === 'number')
    .sort((a, b) => a.anno - b.anno);
  const annualita = Math.round(
    limita(
      Number.isFinite(input.annualita) ? input.annualita : ANNUALITA_PREDEFINITE,
      ANNUALITA_MINIME,
      ANNUALITA_MASSIME
    )
  );
  const anniRientro = Math.round(
    limita(
      Number.isFinite(input.anniRientroDebito)
        ? (input.anniRientroDebito as number)
        : ANNI_RIENTRO_DEBITO,
      ANNI_RIENTRO_MINIMI,
      ANNI_RIENTRO_MASSIMI
    )
  );
  const decadimento = limita(
    Number.isFinite(input.decadimentoCrescita)
      ? (input.decadimentoCrescita as number)
      : DECADIMENTO_CRESCITA,
    DECADIMENTO_MINIMO,
    DECADIMENTO_MASSIMO
  );
  const debitoEnte = Math.max(0, Number.isFinite(input.debitoEnte) ? input.debitoEnte : 0);
  const settore =
    input.crescitaSettorePct === null || input.crescitaSettorePct === undefined
      ? null
      : arrotonda(limita(input.crescitaSettorePct, -LIMITE_CRESCITA_PCT, LIMITE_CRESCITA_PCT));
  const storica = crescitaStorica(anni);
  const fonte: SorgenteCrescita =
    settore !== null ? 'SETTORE' : storica !== null ? 'STORICA' : 'NESSUNA';
  const traiettoria = traiettoriaCrescite({
    storica,
    settore,
    profilo: input.profilo,
    annualita,
    decadimento,
  });
  const avvertenze: string[] = [];

  if (anni.length === 0) {
    return {
      colonne: [],
      profilo: input.profilo,
      annualita,
      debitoEnte,
      crescitaStoricaPct: null,
      crescitaSettorePct: settore,
      fonteCrescita: fonte,
      crescitaApplicataPct: traiettoria[0]?.ricaviPct ?? 0,
      anniRientroDebito: anniRientro,
      decadimentoCrescita: decadimento,
      motivo: 'Nessun bilancio XBRL leggibile: la simulazione parte dal dato depositato.',
      avvertenze,
    };
  }
  if (storica === null) {
    avvertenze.push(
      'Crescita storica non calcolabile (serve più di un bilancio con ricavi positivi): la traiettoria parte dal dato di settore, se c’è.'
    );
  }
  if (settore === null) {
    avvertenze.push(
      'Dati ISTAT di settore non in archivio: la crescita parte dalla storica e converge verso ricavi invariati, non resta costante. Aggiornando i dati di settore dell’azienda la traiettoria cambia.'
    );
  }
  if (debitoEnte <= 0) {
    avvertenze.push(
      'Nessun debito dell’ente memorizzato: la simulazione non ne iscrive alcuno. La verifica amministrativa non è ancora stata chiusa.'
    );
  } else {
    avvertenze.push(
      `Il debito dell’ente si iscrive nella prima annualità proiettata e si estingue in ${anniRientro} ${anniRientro === 1 ? 'rata' : 'rate'} costanti: il passivo scende, non resta piatto.`
    );
  }
  avvertenze.push(
    'Disponibilità liquide: seguono il risultato dell’esercizio, al netto dei rimborsi del debito. Nessun movimento di capitale circolante o investimento è ipotizzato.'
  );

  const colonne: ColonnaVerificaAzienda[] = anni.map((a) => {
    const bundle = costruisciBundleIndici(a.dati);
    return {
      anno: a.anno,
      tipo: 'STORICO',
      dati: a.dati,
      indici: bundle.indici,
      altriIndici: bundle.altriIndici,
      severity: bundle.severity,
      debitoEnteInserito: 0,
      rimborsoDebitoEnte: 0,
      debitoEnteResiduo: 0,
      crescitaRicaviPct: 0,
      crescitaCostiPct: 0,
    };
  });

  let precedente = anni[anni.length - 1];
  const quota = debitoEnte > 0 ? arrotonda(debitoEnte / anniRientro) : 0;
  let residuo = 0;
  for (let i = 1; i <= annualita; i++) {
    const inserimento = i === 1 ? debitoEnte : 0;
    if (inserimento > 0) residuo = debitoEnte;
    // La prima annualità iscrive il debito; i rimborsi partono dalla seconda.
    const rimborso = i === 1 ? 0 : arrotonda(Math.min(residuo, quota));
    residuo = arrotonda(residuo - rimborso);
    const crescita = traiettoria[i - 1];
    const dati = proiettaUnAnno(precedente.dati, crescita.ricaviPct, crescita.costiPct, {
      inserimento,
      rimborso,
    });
    const bundle = costruisciBundleIndici(dati);
    const anno = precedente.anno + 1;
    colonne.push({
      anno,
      tipo: 'PROIEZIONE',
      dati,
      indici: bundle.indici,
      altriIndici: bundle.altriIndici,
      severity: bundle.severity,
      debitoEnteInserito: inserimento,
      rimborsoDebitoEnte: rimborso,
      debitoEnteResiduo: residuo,
      crescitaRicaviPct: crescita.ricaviPct,
      crescitaCostiPct: crescita.costiPct,
    });
    precedente = { anno, dati };
  }

  return {
    colonne,
    profilo: input.profilo,
    annualita,
    debitoEnte,
    crescitaStoricaPct: storica,
    crescitaSettorePct: settore,
    fonteCrescita: fonte,
    crescitaApplicataPct: traiettoria[0]?.ricaviPct ?? 0,
    anniRientroDebito: anniRientro,
    decadimentoCrescita: decadimento,
    motivo: null,
    avvertenze,
  };
}

/** Le voci della mappa, nell'ordine in cui si leggono. */
export const VOCI_MAPPA: {
  etichetta: string;
  chiave: keyof DatiFinanziariPeriodo;
  forte?: boolean;
}[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];
