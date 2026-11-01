// src/lib/triage/scenari.ts
//
// LE DUE IPOTESI DEL TRIAGE: LIQUIDAZIONE GIUDIZIALE E CRAM DOWN.
//
// Il triage misura quanto l'azienda deve a questo ente. Non dice quanto l'ente
// recupererebbe se l'azienda finisse in liquidazione, né quanto recupererebbe
// accettando un piano imposto dal tribunale: sono due termini di paragone
// diversi, e senza di essi il numero delle soglie resta senza contesto.
//
// NESSUN NUMERO INVENTATO. Le percentuali non sono nella legge e non sono
// nella piattaforma: le fissa l'ente, una volta, nella tabella dei parametri.
// Se una percentuale manca, l'ipotesi corrispondente si dichiara NON
// CALCOLABILE con il motivo — non si usa zero, che darebbe «recupero nullo», e
// non si usa la media di settore, che sarebbe un dato di nessuno.
//
// LA LIQUIDAZIONE HA UN COSTO, IL CRAM DOWN NO. L'ipotesi liquidatoria parte
// dal realizzo lordo del credito e sottrae le spese di procedura, perché è
// quello che accade nella realtà: il ceto incassa al netto dei costi. La
// percentuale di cram down è invece già l'esito dell'omologazione — la fissa
// l'ente come percentuale di soddisfacimento — e applicarle di nuovo dei costi
// significherebbe contarli due volte.
//
// CHE COSA QUESTO CONFRONTO NON È. Non è un giudizio di convenienza sulla
// proposta di nessuno: qui non c'è una proposta, c'è un credito e due scenari.
// Non è nemmeno una stima dell'attivo dell'azienda: il credito è quello
// dell'ente, e il realizzo si misura su di esso con le percentuali dell'ente.
//
// Logica pura, con i suoi test.

export type RangoCredito = 'PREDEDUCIBILE' | 'PRIVILEGIATO' | 'CHIROGRAFARIO' | 'POSTERGATO';

export const RANGHI: { codice: RangoCredito; etichetta: string; aiuto: string }[] = [
  {
    codice: 'PREDEDUCIBILE',
    etichetta: 'Prededucibile',
    aiuto:
      'Crediti sorti in funzione della procedura: si soddisfano prima di ogni altro. Il tasso di realizzo è di norma pieno, ma è l’ente a dichiararlo.',
  },
  {
    codice: 'PRIVILEGIATO',
    etichetta: 'Privilegiato',
    aiuto: 'Credito assistito da causa legittima di prelazione (art. 2741 c.c. e norme speciali).',
  },
  {
    codice: 'CHIROGRAFARIO',
    etichetta: 'Chirografario',
    aiuto: 'Credito senza prelazione: concorre sul residuo dopo i privilegiati.',
  },
  {
    codice: 'POSTERGATO',
    etichetta: 'Postergato',
    aiuto: 'Credito collocato dopo i chirografari per legge o per accordo.',
  },
];

export interface ParametroRango {
  rango: RangoCredito;
  /** Percentuale di realizzo lordo nella liquidazione giudiziale. */
  tassoLiquidazionePct: number | null;
  /** Percentuale di soddisfacimento nell'ipotesi di cram down. */
  cramDownPct: number | null;
}

export interface ParametriScenari {
  /** Spese di procedura, in percentuale sul realizzo lordo. */
  costiProceduraPct: number | null;
  ranghi: ParametroRango[];
}

export const PARAMETRI_VUOTI: ParametriScenari = {
  costiProceduraPct: null,
  ranghi: RANGHI.map((r) => ({ rango: r.codice, tassoLiquidazionePct: null, cramDownPct: null })),
};

/** Un'ipotesi calcolata, oppure il motivo per cui non lo è. */
export interface Ipotesi {
  nome: string;
  /** Percentuale applicata al credito, se nota. */
  percentuale: number | null;
  /** Importo lordo prima dei costi (solo liquidazione). */
  lordo: number | null;
  costi: number | null;
  /** Quanto resta in mano all'ente. */
  netto: number | null;
  calcolabile: boolean;
  motivo: string | null;
  dettaglio: string;
}

export interface EsitoScenari {
  credito: number | null;
  rango: RangoCredito | null;
  liquidazione: Ipotesi;
  cramDown: Ipotesi;
  confronto: { differenza: number; testo: string } | null;
  calcolabile: boolean;
  mancanti: string[];
}

const numeroValido = (n: number | null): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

const percentuale = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
};

/** Le percentuali ammesse: fra 0 e 100, oppure vuote. Mai un valore ambiguo. */
export function validaParametri(p: ParametriScenari): string[] {
  const out: string[] = [];
  if (p.costiProceduraPct !== null && percentuale(p.costiProceduraPct) === null)
    out.push('Le spese di procedura devono essere una percentuale fra 0 e 100.');
  for (const r of p.ranghi) {
    const etichetta = RANGHI.find((x) => x.codice === r.rango)?.etichetta ?? r.rango;
    if (r.tassoLiquidazionePct !== null && percentuale(r.tassoLiquidazionePct) === null)
      out.push(`Il tasso di realizzo «${etichetta}» deve essere una percentuale fra 0 e 100.`);
    if (r.cramDownPct !== null && percentuale(r.cramDownPct) === null)
      out.push(`La percentuale di cram down «${etichetta}» deve essere fra 0 e 100.`);
  }
  return out;
}

const euro = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;

/**
 * Calcola le due ipotesi sul credito dell'ente.
 *
 * `credito` è l'esposizione misurata dal triage; `rango` è quello che l'ente
 * dichiara per il proprio credito. Entrambi possono mancare: in quel caso
 * l'esito non è zero, è «non calcolabile», con la ragione.
 */
export function calcolaScenari(input: {
  credito: number | null;
  rango: RangoCredito | null;
  parametri: ParametriScenari;
}): EsitoScenari {
  const mancanti: string[] = [];
  const credito = numeroValido(input.credito) ? input.credito : null;
  if (credito === null) mancanti.push('l’esposizione dell’ente verso l’azienda');
  if (!input.rango) mancanti.push('il rango del credito dell’ente');

  const riga = input.rango
    ? (input.parametri.ranghi.find((r) => r.rango === input.rango) ?? null)
    : null;
  const etichettaRango = input.rango
    ? (RANGHI.find((r) => r.codice === input.rango)?.etichetta ?? input.rango)
    : null;

  // ---- Liquidazione giudiziale -------------------------------------------
  const tasso = riga ? percentuale(riga.tassoLiquidazionePct) : null;
  const costiPct = percentuale(input.parametri.costiProceduraPct);
  const motiviLiquidazione: string[] = [];
  if (input.rango && !riga) motiviLiquidazione.push('il rango non è configurato nei parametri');
  if (riga && tasso === null) motiviLiquidazione.push('manca il tasso di realizzo per il rango');
  if (costiPct === null) motiviLiquidazione.push('mancano le spese di procedura');
  const liquidazioneCalcolabile = credito !== null && tasso !== null && costiPct !== null;

  const lordo = liquidazioneCalcolabile ? (credito * tasso) / 100 : null;
  const costi = lordo !== null && costiPct !== null ? (lordo * costiPct) / 100 : null;
  const netto = lordo !== null && costi !== null ? lordo - costi : null;

  const liquidazione: Ipotesi = {
    nome: 'Liquidazione giudiziale',
    percentuale: tasso,
    lordo,
    costi,
    netto,
    calcolabile: liquidazioneCalcolabile,
    motivo: liquidazioneCalcolabile ? null : motiviLiquidazione.join('; ') || 'dati incompleti',
    dettaglio: liquidazioneCalcolabile
      ? `Realizzo lordo ${euro(lordo as number)} (${tasso}% del credito ${etichettaRango ? `«${etichettaRango}»` : ''}), meno le spese di procedura ${costiPct as number}% (${euro(
          costi as number
        )}): restano ${euro(netto as number)}.`
      : 'Non calcolabile: la formula è credito × tasso di realizzo − spese di procedura, e i parametri dell’ente non la completano.',
  };

  // ---- Cram down ---------------------------------------------------------
  const pctCram = riga ? percentuale(riga.cramDownPct) : null;
  const motiviCram: string[] = [];
  if (input.rango && !riga) motiviCram.push('il rango non è configurato nei parametri');
  if (riga && pctCram === null) motiviCram.push('manca la percentuale di cram down per il rango');
  const cramCalcolabile = credito !== null && pctCram !== null;
  const importoCram = cramCalcolabile ? (credito * pctCram) / 100 : null;

  const cramDown: Ipotesi = {
    nome: 'Cram down omologato',
    percentuale: pctCram,
    lordo: importoCram,
    costi: null,
    netto: importoCram,
    calcolabile: cramCalcolabile,
    motivo: cramCalcolabile ? null : motiviCram.join('; ') || 'dati incompleti',
    dettaglio: cramCalcolabile
      ? `Soddisfacimento al ${pctCram}% del credito: ${euro(importoCram as number)}. La percentuale è fissata dall’ente; i costi non si sottraggono, perché la percentuale è già l’esito dell’omologazione.`
      : 'Non calcolabile: la percentuale di cram down è un parametro dell’ente e qui non è impostata.',
  };

  const entrambe = liquidazione.calcolabile && cramDown.calcolabile;
  const confronto =
    entrambe && netto !== null && importoCram !== null
      ? {
          differenza: netto - importoCram,
          testo:
            netto >= importoCram
              ? `La liquidazione restituirebbe ${euro(netto - importoCram)} in più del cram down omologato.`
              : `Il cram down omologato restituirebbe ${euro(importoCram - netto)} in più della liquidazione.`,
        }
      : null;

  if (credito === null) mancanti.push('il credito su cui applicare le percentuali');
  for (const m of motiviLiquidazione) if (!mancanti.includes(m)) mancanti.push(m);
  for (const m of motiviCram) if (!mancanti.includes(m)) mancanti.push(m);

  return {
    credito,
    rango: input.rango,
    liquidazione,
    cramDown,
    confronto,
    calcolabile: entrambe,
    mancanti,
  };
}

/** La riga di parametro da modificare, senza inventarne una se il rango manca. */
export function rigaPerRango(
  parametri: ParametriScenari,
  rango: RangoCredito
): ParametroRango | null {
  return parametri.ranghi.find((r) => r.rango === rango) ?? null;
}
