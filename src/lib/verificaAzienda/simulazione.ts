// LA VERIFICA AZIENDA — la simulazione che unisce le due verifiche.
//
// La verifica amministrativa dice com'è l'azienda oggi e consegna il debito
// dell'ente; la contabile porta il dato storico depositato. Qui le due cose
// diventano una sola lettura: si parte dagli anni di bilancio e si proiettano
// le annualità successive con un profilo dichiarato — standard, migliorativo,
// peggiorativo — mentre il debito dell'ente entra nel passivo come dato certo.
//
// NIENTE NUMERI INVENTATI. Il profilo standard usa la crescita storica dei
// ricavi (CAGR, limitata); migliorativo e peggiorativo la scostano di una
// misura DICHIARATA qui sotto, non di una stima di settore. Il debito è quello
// memorizzato a fine verifica amministrativa: se manca, la simulazione lo dice
// e non mette zero al posto suo.
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
      'Ricavi alla crescita storica composta; costi che crescono con i ricavi. È il profilo di continuità.',
  },
  {
    codice: 'MIGLIORATIVO',
    etichetta: 'Migliorativo',
    descrizione:
      'Crescita dei ricavi superiore di 3 punti alla storica, costi più lenti di 2 punti. Ipotesi dichiarata, non previsione.',
  },
  {
    codice: 'PEGGIORATIVO',
    etichetta: 'Peggiorativo',
    descrizione:
      'Crescita dei ricavi inferiore di 3 punti alla storica, costi più veloci di 2 punti. Ipotesi dichiarata, non previsione.',
  },
];

/** Lo scostamento dei profili, in punti percentuali. Non è un dato normativo. */
export const SCOSTAMENTO_PROFILO_PP = 3;
/** Quanto i costi seguono i ricavi in più o in meno, in punti percentuali. */
export const SCOSTAMENTO_COSTI_PP = 2;
/** Oltre questo intervallo la proiezione non descrive più un'ipotesi. */
export const LIMITE_CRESCITA_PCT = 25;

export const ANNUALITA_PREDEFINITE = 3;
export const ANNUALITA_MINIME = 1;
export const ANNUALITA_MASSIME = 8;

export interface AnnoStorico {
  anno: number;
  dati: DatiFinanziariPeriodo;
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
}

export interface EsitoSimulazione {
  colonne: ColonnaVerificaAzienda[];
  profilo: ProfiloSimulazione;
  annualita: number;
  debitoEnte: number;
  crescitaStoricaPct: number | null;
  crescitaApplicataPct: number;
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

/** Quanto crescono ricavi e costi nel profilo scelto. */
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

function proiettaUnAnno(
  base: DatiFinanziariPeriodo,
  ricaviPct: number,
  costiPct: number,
  debitoEnte: number
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

  return {
    ...base,
    ricaviVendite,
    valoreProduzione,
    costiProduzione,
    ebit,
    ebitda,
    utileEsercizio,
    patrimonioNetto,
    // Il debito dell'ente è un debito iscritto: aumenta il passivo, non
    // riduce la liquidità (non è ancora stato pagato).
    totaleDebiti: arrotonda(base.totaleDebiti + debitoEnte),
    passivoCorrente: arrotonda(base.passivoCorrente + debitoEnte),
  };
}

/**
 * Le colonne della mappa: gli anni storici così come sono, poi le proiezioni
 * con il profilo scelto. Il debito dell'ente entra una volta sola, nella prima
 * annualità proiettata, e da lì resta nel passivo.
 */
export function colonneSimulazione(input: {
  anni: AnnoStorico[];
  profilo: ProfiloSimulazione;
  annualita: number;
  debitoEnte: number;
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
  const debitoEnte = Math.max(0, Number.isFinite(input.debitoEnte) ? input.debitoEnte : 0);
  const storica = crescitaStorica(anni);
  const { ricaviPct, costiPct } = cresciteProfilo(input.profilo, storica);
  const avvertenze: string[] = [];

  if (anni.length === 0) {
    return {
      colonne: [],
      profilo: input.profilo,
      annualita,
      debitoEnte,
      crescitaStoricaPct: null,
      crescitaApplicataPct: ricaviPct,
      motivo: 'Nessun bilancio XBRL leggibile: la simulazione parte dal dato depositato.',
      avvertenze,
    };
  }
  if (storica === null) {
    avvertenze.push(
      'Crescita storica non calcolabile (serve più di un bilancio con ricavi positivi): il profilo parte da zero, e lo dichiara.'
    );
  }
  if (debitoEnte <= 0) {
    avvertenze.push(
      'Nessun debito dell’ente memorizzato: la simulazione non ne iscrive alcuno. La verifica amministrativa non è ancora stata chiusa.'
    );
  }

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
    };
  });

  let precedente = anni[anni.length - 1];
  for (let i = 1; i <= annualita; i++) {
    const debitoDaInserire = i === 1 ? debitoEnte : 0;
    const dati = proiettaUnAnno(precedente.dati, ricaviPct, costiPct, debitoDaInserire);
    const bundle = costruisciBundleIndici(dati);
    const anno = precedente.anno + 1;
    colonne.push({
      anno,
      tipo: 'PROIEZIONE',
      dati,
      indici: bundle.indici,
      altriIndici: bundle.altriIndici,
      severity: bundle.severity,
      debitoEnteInserito: debitoDaInserire,
    });
    precedente = { anno, dati };
  }

  return {
    colonne,
    profilo: input.profilo,
    annualita,
    debitoEnte,
    crescitaStoricaPct: storica,
    crescitaApplicataPct: ricaviPct,
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
