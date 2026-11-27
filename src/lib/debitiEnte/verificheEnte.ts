// Le verifiche dell'ente, primo passo di ogni Scenario.
//
// Uno scenario non riparte dai documenti: parte da quello che l'ente ha già
// verificato su quell'azienda — la certificazione dei debiti letta nel triage
// e la Posizione Debitoria dell'Ente. Questo modulo compone il riepilogo di
// quello che c'è, filtrato sull'azienda dello scenario, senza inventare una
// verifica che non è stata fatta: se le righe non ci sono, il riepilogo è
// vuoto e la schermata chiede di caricarle.

export interface RigaVerificaEnte {
  codice: 'CERTIFICAZIONE' | 'POSIZIONE';
  etichetta: string;
  /** Quante posizioni compongono la verifica. */
  righe: number;
  /** Il totale dell'esposizione: contributi e sanzioni per la certificazione, saldo per la posizione. */
  totale: number;
  /** Che cosa si sta guardando, in una riga (data di rigiro o avvertenza). */
  dettaglio: string;
}

export interface RiepilogoVerificheEnte {
  presenti: number;
  voci: RigaVerificaEnte[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * Il saldo di una riga della Posizione Debitoria: quanto resta dovuto quando
 * il file distingue il debito originario da quanto è già stato pagato.
 */
export function saldoRigaPosizione(riga: {
  importo: number;
  importoVersato: number | null;
}): number {
  if (riga.importoVersato === null || riga.importoVersato === undefined) return riga.importo;
  return Math.max(0, riga.importo - riga.importoVersato);
}

export function riepilogoVerificheEnte(input: {
  righeVera: { importo: number }[];
  documentiCaricatiIl?: string | null;
  righePosizione: { importo: number; importoVersato: number | null }[];
}): RiepilogoVerificheEnte {
  const voci: RigaVerificaEnte[] = [];

  if (input.righeVera.length > 0) {
    voci.push({
      codice: 'CERTIFICAZIONE',
      etichetta: 'Certificazione dei debiti (triage)',
      righe: input.righeVera.length,
      totale: input.righeVera.reduce((s, r) => s + r.importo, 0),
      dettaglio: input.documentiCaricatiIl
        ? `letto il ${input.documentiCaricatiIl.split('-').reverse().join('/')}`
        : 'data di lettura non registrata',
    });
  }

  if (input.righePosizione.length > 0) {
    voci.push({
      codice: 'POSIZIONE',
      etichetta: 'Posizione Debitoria dell’Ente',
      righe: input.righePosizione.length,
      totale: input.righePosizione.reduce((s, r) => s + saldoRigaPosizione(r), 0),
      dettaglio: 'caricata dall’ente, a livello azienda',
    });
  }

  return { presenti: voci.length, voci };
}

/** Il totale complessivo delle verifiche presenti: serve al riepilogo di testa. */
export function totaleVerificheEnte(riepilogo: RiepilogoVerificheEnte): number {
  return riepilogo.voci.reduce((s, v) => s + v.totale, 0);
}

/**
 * IL RIPARTO DEL DEBITO CHE ENTRA NEL PIANO (0.256.50).
 *
 * Il piano non parte dalla somma delle posizioni in elenco: parte dalla cifra
 * accertata dalla verifica, quella memorizzata, e le posizioni sospese,
 * potenziali o doppie restano fuori. Dentro quella cifra il credito dell'ente e
 * quello già affidato all'Agente della Riscossione si restituiscono a due
 * soggetti diversi, e l'operatore deve vederlo prima di scrivere le rate.
 *
 * La quota a ruolo non si stima: è `creditiAgente`, che lo snapshot del debito
 * calcola dalle sezioni della certificazione intestate all'Agente. La
 * differenza con il totale è quello che si rimborsa direttamente all'ente.
 */
export interface RipartoDebitoPiano {
  /** La cifra che il piano restituisce: contabilizzato + da contabilizzare. */
  totale: number;
  /** Rimborso diretto all'ente. */
  ente: number;
  /** Rimborso all'Agente della Riscossione: le posizioni già a ruolo. */
  adr: number;
  /** true quando la cifra del piano non è la somma delle posizioni mostrate. */
  diversoDallElenco: boolean;
}

export function ripartoDebitoPiano(
  debito: { totale: number; creditiAgente: number },
  /** Il totale della voce in elenco: la somma delle posizioni, non il debito certo. */
  totaleElenco: number
): RipartoDebitoPiano {
  const centesimi = (n: number) => Math.round(n * 100) / 100;
  const totale = centesimi(Math.max(0, debito.totale));
  // Una quota a ruolo più grande del totale sarebbe un dato incoerente: si
  // tiene il totale e la si dichiara tutta all'Agente, senza cifre negative.
  const adr = centesimi(Math.min(totale, Math.max(0, debito.creditiAgente)));
  return {
    totale,
    adr,
    ente: centesimi(totale - adr),
    diversoDallElenco: Math.abs(totale - totaleElenco) >= 0.5,
  };
}

/** Testo unico della testata: dice quante verifiche ci sono e per quanto. */
export function sintesiVerificheEnte(riepilogo: RiepilogoVerificheEnte): string {
  if (riepilogo.presenti === 0)
    return 'Nessuna verifica dell’ente caricata su questa azienda: il primo passo è caricarla.';
  if (riepilogo.presenti === 1)
    return `1 verifica caricata — ${euro(totaleVerificheEnte(riepilogo))}.`;
  return `${riepilogo.presenti} verifiche caricate — ${euro(totaleVerificheEnte(riepilogo))}.`;
}
