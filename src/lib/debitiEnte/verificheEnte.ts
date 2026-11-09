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

/** Testo unico della testata: dice quante verifiche ci sono e per quanto. */
export function sintesiVerificheEnte(riepilogo: RiepilogoVerificheEnte): string {
  if (riepilogo.presenti === 0)
    return 'Nessuna verifica dell’ente caricata su questa azienda: il primo passo è caricarla.';
  if (riepilogo.presenti === 1)
    return `1 verifica caricata — ${euro(totaleVerificheEnte(riepilogo))}.`;
  return `${riepilogo.presenti} verifiche caricate — ${euro(totaleVerificheEnte(riepilogo))}.`;
}
