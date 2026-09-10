// src/lib/screening/validitaVerifica.ts
//
// Quanto vale ancora un giudizio di triage.
//
// Un'azienda sotto soglia a settembre può superarla a marzo: l'esito
// registrato invecchia in silenzio, e un elenco di verifiche vecchie è
// indistinguibile da un elenco di verifiche fatte ieri. Senza una scadenza,
// il triage smette di essere una coda di lavoro e diventa un archivio.
//
// La soglia NON è una regola di legge: è una convenzione di lavoro. Sei mesi
// è l'intervallo entro cui una posizione previdenziale cambia in modo
// rilevante — oltre, il giudizio va rifatto sui documenti aggiornati.

export const MESI_VALIDITA_VERIFICA = 6;

export type StatoValidita = 'recente' | 'in_scadenza' | 'da_rivedere';

export interface Validita {
  stato: StatoValidita;
  giorni: number;
  etichetta: string;
}

/**
 * @param eseguitaIl data della verifica (ISO). null = mai eseguita.
 * @param adesso iniettabile per i test: il tempo è un ingresso, non un
 *        effetto collaterale.
 */
export function valutaValidita(eseguitaIl: string | null, adesso: Date = new Date()): Validita {
  if (!eseguitaIl) {
    return { stato: 'da_rivedere', giorni: 0, etichetta: 'Mai verificata' };
  }
  const giorni = Math.floor((adesso.getTime() - new Date(eseguitaIl).getTime()) / 86_400_000);
  const limite = MESI_VALIDITA_VERIFICA * 30;

  // Una verifica con data futura è un dato incoerente, non una verifica
  // freschissima: si tratta come recente ma senza inventare numeri negativi.
  if (giorni < 0) return { stato: 'recente', giorni: 0, etichetta: 'Oggi' };

  if (giorni >= limite) {
    return { stato: 'da_rivedere', giorni, etichetta: `Da rivedere — ${mesi(giorni)}` };
  }
  // Ultimo mese di validità: si avvisa prima che scada, non dopo.
  if (giorni >= limite - 30) {
    return { stato: 'in_scadenza', giorni, etichetta: `In scadenza — ${mesi(giorni)}` };
  }
  return { stato: 'recente', giorni, etichetta: giorni === 0 ? 'Oggi' : `${giorni} giorni fa` };
}

function mesi(giorni: number): string {
  const m = Math.floor(giorni / 30);
  if (m <= 0) return `${giorni} giorni`;
  return m === 1 ? '1 mese' : `${m} mesi`;
}
