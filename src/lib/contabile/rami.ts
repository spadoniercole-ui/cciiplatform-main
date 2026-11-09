// IL RAMO CONTABILE PER ANNO.
//
// Il bilancio XBRL depositato è il punto di partenza: da lì si apre un ramo
// contabile per ciascun anno, che resta accanto agli altri — non li sostituisce.
// Sul ramo di partenza si innestano le simulazioni: le stesse voci contabili
// con ipotesi dichiarate (ricavi, costi, quota del debito dell'ente che entra
// nel passivo), ricalcolate con lo STESSO motore di indici del resto della
// piattaforma. Il risultato è un prospetto di raffronto, non un giudizio: qui
// si calcola, la conclusione resta all'operatore.
//
// Determinismo: a parità di dati e di leve il risultato è identico. Nessuna
// stima, nessuna media di settore, nessun valore inventato quando un dato
// manca — le divisioni per zero restano 'N/D' nel motore degli indici.

import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';

/** Ipotesi di simulazione, tutte dichiarate e modificabili dall'operatore. */
export interface LeveSimulazione {
  /** Variazione percentuale dei ricavi (e del valore della produzione). */
  variazioneRicaviPct: number;
  /** Variazione percentuale dei costi della produzione. */
  variazioneCostiPct: number;
  /** Quota del debito dell'ente che entra nel passivo (€, non negativa). */
  debitoEnteEuro: number;
  /** Dove si iscrive quella quota: previdenziale (INPS) o tributaria. */
  naturaDebitoEnte: 'previdenziale' | 'tributario';
}

export const LEVE_NEUTRE: LeveSimulazione = {
  variazioneRicaviPct: 0,
  variazioneCostiPct: 0,
  debitoEnteEuro: 0,
  naturaDebitoEnte: 'previdenziale',
};

export type LivelloValutazione = 'SOSTENIBILE' | 'DA_APPROFONDIRE' | 'NON_SOSTENIBILE';

export interface ValutazioneRamo {
  livello: LivelloValutazione;
  punti: string[];
  avvertenza: string;
}

export interface VoceConfronto {
  etichetta: string;
  base: number;
  simulato: number;
  delta: number;
  /** Variazione percentuale, null quando la base è zero (nessuna divisione per zero). */
  deltaPct: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function limita(valore: number, minimo: number, massimo: number): number {
  if (!Number.isFinite(valore)) return 0;
  return Math.min(massimo, Math.max(minimo, valore));
}

/**
 * Riconduce le leve nell'intervallo ammesso. Le percentuali stanno tra -90% e
 * +90%: oltre, il prospetto non descrive più un'ipotesi ma un'altra azienda.
 * Il debito dell'ente non può essere negativo.
 */
export function normalizzaLeve(leve: Partial<LeveSimulazione> | null | undefined): LeveSimulazione {
  const grezze = leve ?? {};
  return {
    variazioneRicaviPct: round2(limita(grezze.variazioneRicaviPct ?? 0, -90, 90)),
    variazioneCostiPct: round2(limita(grezze.variazioneCostiPct ?? 0, -90, 90)),
    debitoEnteEuro: round2(Math.max(0, grezze.debitoEnteEuro ?? 0)),
    naturaDebitoEnte: grezze.naturaDebitoEnte === 'tributario' ? 'tributario' : 'previdenziale',
  };
}

/**
 * Applica le ipotesi a un periodo contabile e ricostruisce le voci derivate.
 * Il debito dell'ente entra nel totale debiti e nel passivo corrente, ma NON
 * riduce la liquidità: è un debito iscritto, non ancora pagato. Il risultato
 * d'esercizio muove il patrimonio netto del suo delta, non lo sostituisce.
 */
export function applicaLeve(
  base: DatiFinanziariPeriodo,
  leve: Partial<LeveSimulazione> | null | undefined
): DatiFinanziariPeriodo {
  const l = normalizzaLeve(leve);
  const fattoreRicavi = 1 + l.variazioneRicaviPct / 100;
  const fattoreCosti = 1 + l.variazioneCostiPct / 100;

  const ricaviVendite = round2(base.ricaviVendite * fattoreRicavi);
  const valoreProduzione = round2(base.valoreProduzione * fattoreRicavi);
  const costiProduzione = round2(base.costiProduzione * fattoreCosti);
  const ebit = round2(valoreProduzione - costiProduzione);
  const ebitda = round2(ebit + base.ammortamenti);
  const utileEsercizio = round2(ebit - base.oneriFinanziari);
  const patrimonioNetto = round2(base.patrimonioNetto + (utileEsercizio - base.utileEsercizio));

  const quotaPrevidenziale = l.naturaDebitoEnte === 'previdenziale' ? l.debitoEnteEuro : 0;
  const quotaTributaria = l.naturaDebitoEnte === 'tributario' ? l.debitoEnteEuro : 0;

  return {
    ...base,
    ricaviVendite,
    valoreProduzione,
    costiProduzione,
    ebit,
    ebitda,
    utileEsercizio,
    patrimonioNetto,
    debitiPrevidenziali: round2(base.debitiPrevidenziali + quotaPrevidenziale),
    debitiTributari: round2(base.debitiTributari + quotaTributaria),
    totaleDebiti: round2(base.totaleDebiti + l.debitoEnteEuro),
    passivoCorrente: round2(base.passivoCorrente + l.debitoEnteEuro),
  };
}

/**
 * La valutazione del ramo simulato, con la stessa scala di lettura degli
 * indici: patrimonio netto non positivo o tre indici oltre soglia portano a
 * «non sostenibile»; uno o due indici oltre soglia, o un risultato negativo,
 * a «da approfondire». È una lettura operativa sulle ipotesi inserite — non
 * un giudizio di sostenibilità né una conclusione giuridica.
 */
export function valutaRamo(dati: DatiFinanziariPeriodo, indici: IndiceCcii[]): ValutazioneRamo {
  const violati = indici.filter((i) => i.esito === 'VIOLATO');
  const punti: string[] = [];

  if (dati.patrimonioNetto <= 0) {
    punti.push('Patrimonio netto non positivo.');
  }
  if (dati.utileEsercizio < 0) {
    punti.push('Risultato d’esercizio negativo.');
  }
  if (violati.length > 0) {
    punti.push(`Indici oltre soglia: ${violati.map((v) => v.codice).join(', ')}.`);
  }
  if (punti.length === 0) {
    punti.push('Nessuna soglia superata e patrimonio netto positivo sulle ipotesi inserite.');
  }

  const livello: LivelloValutazione =
    dati.patrimonioNetto <= 0 || violati.length >= 3
      ? 'NON_SOSTENIBILE'
      : violati.length > 0 || dati.utileEsercizio < 0
        ? 'DA_APPROFONDIRE'
        : 'SOSTENIBILE';

  return {
    livello,
    punti,
    avvertenza:
      'Lettura operativa calcolata sulle ipotesi inserite: non è un giudizio di sostenibilità né una conclusione giuridica.',
  };
}

/** Le voci che il raffronto mette a confronto, nell'ordine in cui si leggono. */
export function confrontoVoci(
  base: DatiFinanziariPeriodo,
  simulato: DatiFinanziariPeriodo
): VoceConfronto[] {
  const pfn = (d: DatiFinanziariPeriodo) => d.debitiBanche - d.disponibilitaLiquide;
  const voci: { etichetta: string; base: number; simulato: number }[] = [
    {
      etichetta: 'Ricavi delle vendite',
      base: base.ricaviVendite,
      simulato: simulato.ricaviVendite,
    },
    {
      etichetta: 'Valore della produzione',
      base: base.valoreProduzione,
      simulato: simulato.valoreProduzione,
    },
    {
      etichetta: 'Costi della produzione',
      base: base.costiProduzione,
      simulato: simulato.costiProduzione,
    },
    { etichetta: 'EBITDA', base: base.ebitda, simulato: simulato.ebitda },
    {
      etichetta: 'Risultato d’esercizio',
      base: base.utileEsercizio,
      simulato: simulato.utileEsercizio,
    },
    {
      etichetta: 'Patrimonio netto',
      base: base.patrimonioNetto,
      simulato: simulato.patrimonioNetto,
    },
    { etichetta: 'Totale debiti', base: base.totaleDebiti, simulato: simulato.totaleDebiti },
    {
      etichetta: 'Disponibilità liquide',
      base: base.disponibilitaLiquide,
      simulato: simulato.disponibilitaLiquide,
    },
    { etichetta: 'Posizione finanziaria netta', base: pfn(base), simulato: pfn(simulato) },
  ];

  return voci.map((v) => ({
    ...v,
    delta: round2(v.simulato - v.base),
    deltaPct: v.base === 0 ? null : round2(((v.simulato - v.base) / Math.abs(v.base)) * 100),
  }));
}

/** L'etichetta della simulazione: le ipotesi in chiaro, così il ramo si riconosce. */
export function descrizioneLeve(leve: Partial<LeveSimulazione> | null | undefined): string {
  const l = normalizzaLeve(leve);
  const parti: string[] = [];
  const segno = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);
  if (l.variazioneRicaviPct !== 0) parti.push(`ricavi ${segno(l.variazioneRicaviPct)}`);
  if (l.variazioneCostiPct !== 0) parti.push(`costi ${segno(l.variazioneCostiPct)}`);
  if (l.debitoEnteEuro !== 0) {
    parti.push(
      `debito ente ${Math.round(l.debitoEnteEuro).toLocaleString('it-IT')} € ${
        l.naturaDebitoEnte === 'tributario' ? 'tributario' : 'previdenziale'
      }`
    );
  }
  return parti.length > 0 ? parti.join(' · ') : 'nessuna leva: solo ricalcolo';
}
