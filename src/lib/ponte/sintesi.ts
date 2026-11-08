// src/lib/ponte/sintesi.ts
//
// LA SINTESI INTEGRATA — credito ente, debito totale stimato, recupero.
//
// Il Piano-ponte dice dove arriva il debito; la Sintesi dice che cosa vale il
// credito dell'ente rispetto a quel debito e quanto ne ricaverebbe nelle due
// ipotesi che l'ente ha già configurato. Sono tre termini di paragone, non una
// compensazione: il recupero non si sottrae al debito e non diventa una
// riduzione del credito.
//
// NESSUNA PERCENTUALE INVENTATA. Le ipotesi di recupero usano solo i parametri
// che l'ente ha scritto in Parametri › Scenari (spese di procedura, realizzo in
// liquidazione, soddisfacimento nel cram down, per rango). Se un parametro o il
// rango mancano, l'ipotesi è dichiarata non calcolabile con il motivo: non si
// usa zero, che darebbe «recupero nullo», e non si usa un valore di settore,
// che sarebbe un dato di nessuno. La logica di calcolo resta in
// `src/lib/triage/scenari.ts`: qui si compone il confronto, non si duplica la
// formula.

import {
  RANGHI,
  calcolaScenari,
  type EsitoScenari,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';
import type { SintesiIntegrataPonte } from './types';

const R2 = (n: number) => Math.round(n * 100) / 100;
const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * Compone la Sintesi integrata di un Ponte.
 *
 * `creditoEnte` è certo solo quando c'è la certificazione (o una dichiarazione
 * esplicita di zero): `null` significa «non disponibile», mai zero.
 */
export function sintesiIntegrata(input: {
  creditoEnte: number | null;
  debitoTotaleStimato: number;
  cassaFinale: number;
  rangoCredito: RangoCredito | null;
  parametriScenari: ParametriScenari | null;
}): SintesiIntegrataPonte {
  const creditoEnte =
    typeof input.creditoEnte === 'number' && Number.isFinite(input.creditoEnte)
      ? R2(input.creditoEnte)
      : null;
  const debitoTotaleStimato =
    Number.isFinite(input.debitoTotaleStimato) && input.debitoTotaleStimato > 0
      ? R2(input.debitoTotaleStimato)
      : 0;
  const cassaFinale = Number.isFinite(input.cassaFinale) ? R2(input.cassaFinale) : 0;
  const rango = input.rangoCredito ?? null;
  const rangoEtichetta = rango
    ? (RANGHI.find((r) => r.codice === rango)?.etichetta ?? rango)
    : null;

  const mancanti: string[] = [];
  const avvisi: string[] = [];

  if (creditoEnte === null) {
    mancanti.push('il credito dell’ente (certificazione o dichiarazione di zero)');
  }

  // Il rango è una scelta per azienda: senza di esso le percentuali non si
  // applicano, anche se l'ente le ha configurate.
  if (!rango) mancanti.push('il rango del credito dell’ente');

  let recupero: EsitoScenari | null = null;
  if (!input.parametriScenari) {
    mancanti.push(
      'i parametri degli scenari dell’ente (Parametri › Scenari: spese di procedura e percentuali per rango)'
    );
  } else {
    recupero = calcolaScenari({
      credito: creditoEnte,
      rango,
      parametri: input.parametriScenari,
    });
    for (const m of recupero.mancanti) if (!mancanti.includes(m)) mancanti.push(m);
    if (!recupero.calcolabile) {
      avvisi.push(
        'Il recupero non è calcolabile con i parametri configurati: il Ponte non lo stima e non mette zero al posto di un dato mancante.'
      );
    }
  }

  const incidenzaCreditoPct =
    creditoEnte !== null && debitoTotaleStimato > 0
      ? R2((creditoEnte / debitoTotaleStimato) * 100)
      : null;

  if (creditoEnte !== null && debitoTotaleStimato > 0 && creditoEnte > debitoTotaleStimato) {
    avvisi.push(
      `Il credito dell’ente (${euro(creditoEnte)}) supera il debito totale stimato (${euro(
        debitoTotaleStimato
      )}): il perimetro del debito ente va verificato prima di usare questo confronto.`
    );
  }

  return {
    creditoEnte,
    debitoTotaleStimato,
    cassaFinale,
    incidenzaCreditoPct,
    rango,
    rangoEtichetta,
    recupero,
    mancanti,
    avvisi,
  };
}
