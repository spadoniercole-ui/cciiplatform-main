// src/lib/soglie25novies/triage.ts
//
// DALL'ESITO COMPLETO DELLE SOGLIE AL SOLO DATO CHE SERVE AL TRIAGE:
// ci sono parametri oltre soglia, sì o no?
//
// PERCHÉ NON BASTA `esito.superate.length > 0` NEL COMPONENTE. Le tre
// domande che il triage deve poter distinguere non sono due:
//
//  - nessuna soglia applicabile (per esempio forma giuridica non
//    riconosciuta): non c'è nulla da confrontare, e non è un "sotto";
//  - soglie applicabili ma nessun superamento, con dati completi;
//  - soglie applicabili, nessun superamento, ma dati mancanti: il
//    risultato vale solo su ciò che si è potuto misurare;
//  - almeno un superamento, eventualmente insieme a righe non
//    determinabili.
//
// L'ultimo caso è quello che conta. Una soglia superata è un FATTO: non si
// perde perché un'altra riga manca di dati, e non diventa "non
// determinabile" per la presenza di una lacuna altrove (stessa regola di
// `sintesi.ts`, applicata qui al solo scopo di informare).
//
// COSA QUESTO RIEPILOGO NON DICE. Non dice che una segnalazione è dovuta:
// l'art. 25-novies richiede anche il ritardo di oltre 90 giorni, che i
// dati del triage non sempre dimostrano. Il testo resta sul piano del
// riscontro dei presupposti oggettivi (cfr. `calcolo.ts`).

import type { EsitoSoglie, RigaSoglia } from './calcolo';

// Una soglia «non applicata» non è una soglia «sotto». Il riepilogo le
// distingue perché l'errore che evitano è il peggiore possibile: dire che
// nulla supera la soglia quando la soglia non è stata confrontata.

export type StatoSoglieTriage =
  'superate' | 'nessuna_superata' | 'non_determinabile' | 'non_applicabile';

export interface RiepilogoSoglieTriage {
  stato: StatoSoglieTriage;
  /** Righe applicabili risultate oltre soglia. Vuoto se nessuna. */
  superate: RigaSoglia[];
  /** Quante righe si applicano a questa impresa. */
  applicabili: number;
  /** Quante righe applicabili non sono determinabili per dati mancanti. */
  nonDeterminabili: number;
  titolo: string;
  dettaglio: string;
}

export function riepilogaSoglieTriage(esito: EsitoSoglie): RiepilogoSoglieTriage {
  const applicabili = esito.righe.filter((r) => r.applicabile).length;
  const superate = esito.superate;
  const nonDeterminabili = esito.nonDeterminabili.length;
  // Le soglie rimaste fuori perché manca il dato che le seleziona (lavoratori
  // per l'INPS, forma giuridica per l'Agente della Riscossione).
  const nonApplicabili = esito.nonApplicabiliPerDatiMancanti ?? 0;

  if (superate.length > 0) {
    const unaSola = superate.length === 1;
    return {
      stato: 'superate',
      superate,
      applicabili,
      nonDeterminabili,
      titolo: unaSola
        ? 'Un parametro oltre la soglia di segnalazione'
        : `${superate.length} parametri oltre la soglia di segnalazione`,
      dettaglio:
        'Il superamento riguarda i presupposti oggettivi della soglia. Non equivale a un obbligo di ' +
        'segnalazione: il requisito del ritardo di oltre 90 giorni va accertato a parte, e la decisione ' +
        'resta all’ente.' +
        (nonDeterminabili > 0
          ? ` Restano ${nonDeterminabili} ${nonDeterminabili === 1 ? 'soglia non determinabile' : 'soglie non determinabili'} per dati mancanti: il superamento rilevato non ne è influenzato.`
          : '') +
        (nonApplicabili > 0
          ? ` Altre ${nonApplicabili} non sono state applicate perché manca il dato che le seleziona: non sono sotto soglia, restano fuori dal confronto.`
          : ''),
    };
  }

  if (applicabili === 0) {
    return {
      stato: 'non_applicabile',
      superate,
      applicabili,
      nonDeterminabili,
      titolo: 'Nessuna soglia applicabile a questa impresa',
      dettaglio:
        'I dati confermati non consentono di stabilire quale soglia si applichi — per esempio la forma ' +
        'giuridica non è riconosciuta fra quelle dell’art. 25-novies. Non è un esito favorevole: è ' +
        'l’assenza del confronto.',
    };
  }

  if (nonDeterminabili > 0 || nonApplicabili > 0) {
    return {
      stato: 'non_determinabile',
      superate,
      applicabili,
      nonDeterminabili,
      titolo: 'Nessun superamento rilevato sui dati disponibili',
      dettaglio:
        (nonDeterminabili > 0
          ? `${nonDeterminabili} ${nonDeterminabili === 1 ? 'soglia applicabile non è determinabile' : 'soglie applicabili non sono determinabili'} ` +
            'per dati mancanti: l’esito vale solo su ciò che si è potuto misurare e non conclude sulle altre.'
          : 'Il confronto non copre tutto il perimetro.') +
        (nonApplicabili > 0
          ? ` ${nonApplicabili} ${nonApplicabili === 1 ? 'soglia è rimasta' : 'soglie sono rimaste'} fuori perché manca il dato che le seleziona — la presenza di lavoratori per l’INPS, la forma giuridica per l’Agente della Riscossione: non sono sotto soglia, non sono state confrontate.`
          : ''),
    };
  }

  return {
    stato: 'nessuna_superata',
    superate,
    applicabili,
    nonDeterminabili,
    titolo: 'Nessun parametro oltre soglia',
    dettaglio:
      'Tutte le soglie applicabili sono state confrontate con i dati del triage e nessuna risulta superata.',
  };
}
