// src/lib/posizionePratica/segnalazioni.ts
//
// LE SEGNALAZIONI DELLA VERIFICA AMMINISTRATIVA (0.256.20).
//
// Il primo passo dell'esito amministrativo diceva che cosa il triage aveva
// accertato, e per farlo parlava di indici di bilancio: «4 indici diagnostici
// oltre la soglia di riferimento». In un contesto amministrativo il bilancio
// non c'entra — la verifica amministrativa guarda il debito dell'ente e i
// documenti, il bilancio è materia della contabile — e una frase così fa
// sembrare accertato qualcosa che questa verifica non ha guardato.
//
// Qui invece si mettono le segnalazioni che vengono dalle verifiche della
// pagina stessa: la Check list dei prodotti (quadro qualitativo) e la
// certificazione dei debiti (il credito). Niente bilancio, niente indici:
// se non c'è nulla da dire, l'elenco è vuoto e il riquadro non si mostra.
//
// Logica pura, con i suoi test.

export type StatoSegnalazione = 'OK' | 'ATTENZIONE' | 'MANCANTE';

export interface Segnalazione {
  testo: string;
  stato: StatoSegnalazione;
}

export interface InputSegnalazioni {
  /** La sintesi della Check list dei prodotti, se c'è. */
  checklist: { totale: number; risposte: number; mancanti: number } | null;
  /** Il debito certificato dell'ente, se è stato memorizzato. */
  debito: { totale: number; memorizzatoIl: string | null } | null;
  /** La percentuale pesata di criticità della Check List, se compilata. */
  percentualeCriticita?: number | null;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * Le segnalazioni, nell'ordine dei passi che le producono: prima il quadro
 * qualitativo, poi il credito. Ognuna dice che cosa è successo e con quali
 * numeri; nessuna anticipa un giudizio che spetta al valutatore.
 */
export function segnalazioniAmministrative(input: InputSegnalazioni): Segnalazione[] {
  const out: Segnalazione[] = [];
  const cl = input.checklist;

  if (!cl || cl.totale === 0) {
    out.push({
      stato: 'MANCANTE',
      testo:
        'Check list dei prodotti: nessuna domanda in check list, il quadro qualitativo non si compila.',
    });
  } else if (cl.mancanti > 0) {
    out.push({
      stato: 'ATTENZIONE',
      testo: `Check list dei prodotti: mancano ${cl.mancanti} risposte su ${cl.totale}.`,
    });
  } else {
    const pesata =
      typeof input.percentualeCriticita === 'number' && Number.isFinite(input.percentualeCriticita)
        ? ` Criticità pesata al ${input.percentualeCriticita}%.`
        : '';
    out.push({
      stato: 'OK',
      testo: `Check list dei prodotti: completa, ${cl.risposte} risposte su ${cl.totale}.${pesata}`,
    });
  }

  if (!input.debito) {
    out.push({
      stato: 'MANCANTE',
      testo: 'Certificazione dei debiti: il debito dell’ente non è ancora accertato.',
    });
  } else {
    const il = input.debito.memorizzatoIl
      ? ` il ${new Date(input.debito.memorizzatoIl).toLocaleDateString('it-IT')}`
      : '';
    out.push({
      stato: 'OK',
      testo: `Certificazione dei debiti: ${euro(input.debito.totale)} accertati${il}.`,
    });
  }

  return out;
}
