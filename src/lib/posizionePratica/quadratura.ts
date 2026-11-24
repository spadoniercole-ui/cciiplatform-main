// LA QUADRATURA DEL CREDITO (0.242.0).
//
// Lo stesso debito vive in più posti: la certificazione dei debiti, il debito
// che la verifica amministrativa ha chiuso e memorizzato, il credito vantato su
// cui girano liquidazione e cram down. Sono lo stesso numero letto da fonti
// diverse, e quando divergono il più pericoloso non è il numero sbagliato: è il
// numero sbagliato che sembra giusto perché mostrato accanto a un altro.
//
// La 0.240.0 ha eliminato la divergenza finta — due motori che ricalcolavano la
// stessa proiezione — e questa è la parte che resta: la divergenza vera, fra
// fonti che devono coincidere, va vista e dichiarata.
//
// La tolleranza è un euro: più stretta di così si segnalano gli arrotondamenti
// dei centesimi, più larga si nasconde una correzione a mano.
//
// Logica pura, con i suoi test.

/**
 * Una cifra del credito con la sua fonte. `confrontabile: false` la mostra
 * senza farla entrare nella quadratura: è il caso dell'esposizione
 * contributiva, che è un sottoinsieme del debito e non deve coincidere.
 */
export interface VoceQuadratura {
  fonte: string;
  etichetta: string;
  valore: number | null;
  confrontabile?: boolean;
  nota?: string | null;
}

export interface ScostamentoQuadratura {
  fonte: string;
  etichetta: string;
  valore: number;
  /** valore − riferimento. */
  delta: number;
  /** Scostamento sul riferimento, in percentuale; null se il riferimento è zero. */
  percentuale: number | null;
}

export type EsitoQuadratura = 'COERENTE' | 'DIVERGENTE' | 'NON_VERIFICABILE';

export interface Quadratura {
  riferimento: VoceQuadratura | null;
  voci: VoceQuadratura[];
  scostamenti: ScostamentoQuadratura[];
  esito: EsitoQuadratura;
  tolleranzaEuro: number;
  dettaglio: string;
}

export const TOLLERANZA_QUADRATURA_EURO = 1;

import { formattaEuro } from '@/lib/formato/numeri';

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const euro = (n: number) => formattaEuro(n);

/**
 * Confronta le cifre del credito fra loro. Il riferimento è la prima voce
 * confrontabile nell'ordine ricevuto: chi chiama mette prima la fonte che le
 * altre devono seguire (il debito accertato), così l'ordine è una decisione
 * dichiarata e non un effetto collaterale.
 */
export function quadraturaCredito(voci: VoceQuadratura[]): Quadratura {
  const normalizzate = voci.map((v) => ({
    ...v,
    valore: typeof v.valore === 'number' && Number.isFinite(v.valore) ? arrotonda(v.valore) : null,
  }));
  const confrontabili = normalizzate.filter((v) => v.confrontabile !== false && v.valore !== null);
  const mancanti = normalizzate.filter((v) => v.valore === null);

  if (confrontabili.length === 0) {
    return {
      riferimento: null,
      voci: normalizzate,
      scostamenti: [],
      esito: 'NON_VERIFICABILE',
      tolleranzaEuro: TOLLERANZA_QUADRATURA_EURO,
      dettaglio: `La quadratura del credito non si verifica: nessuna fonte porta una cifra${
        mancanti.length > 0 ? ` (${mancanti.map((m) => m.etichetta).join(', ')})` : ''
      }.`,
    };
  }

  const riferimento = confrontabili[0];
  const valoreRiferimento = riferimento.valore as number;

  if (confrontabili.length === 1) {
    return {
      riferimento,
      voci: normalizzate,
      scostamenti: [],
      esito: 'NON_VERIFICABILE',
      tolleranzaEuro: TOLLERANZA_QUADRATURA_EURO,
      dettaglio: `La quadratura del credito non si verifica: c'è una sola fonte con una cifra (${riferimento.etichetta}, ${euro(valoreRiferimento)}), e da sola non si può confrontare.${
        mancanti.length > 0 ? ` Mancano ${mancanti.map((m) => m.etichetta).join(', ')}.` : ''
      }`,
    };
  }

  const scostamenti: ScostamentoQuadratura[] = confrontabili.slice(1).map((v) => {
    const valore = v.valore as number;
    const delta = arrotonda(valore - valoreRiferimento);
    return {
      fonte: v.fonte,
      etichetta: v.etichetta,
      valore,
      delta,
      percentuale:
        valoreRiferimento === 0
          ? null
          : arrotonda((Math.abs(delta) / Math.abs(valoreRiferimento)) * 100),
    };
  });

  const divergenti = scostamenti.filter((s) => Math.abs(s.delta) > TOLLERANZA_QUADRATURA_EURO);

  if (divergenti.length === 0) {
    return {
      riferimento,
      voci: normalizzate,
      scostamenti,
      esito: 'COERENTE',
      tolleranzaEuro: TOLLERANZA_QUADRATURA_EURO,
      dettaglio: `Le fonti del credito coincidono (${confrontabili.length} a confronto, tolleranza ${TOLLERANZA_QUADRATURA_EURO} €) sul riferimento ${euro(valoreRiferimento)}.`,
    };
  }

  return {
    riferimento,
    voci: normalizzate,
    scostamenti,
    esito: 'DIVERGENTE',
    tolleranzaEuro: TOLLERANZA_QUADRATURA_EURO,
    dettaglio: `Le fonti del credito non coincidono: ${divergenti
      .map(
        (d) =>
          `${d.etichetta} ${euro(d.valore)} (${d.delta > 0 ? '+' : '−'}${euro(Math.abs(d.delta))}${
            d.percentuale !== null ? `, ${d.percentuale}%` : ''
          })`
      )
      .join(
        '; '
      )} rispetto a ${riferimento.etichetta} ${euro(valoreRiferimento)}. Il credito va allineato prima di usarlo nella decisione.`,
  };
}
