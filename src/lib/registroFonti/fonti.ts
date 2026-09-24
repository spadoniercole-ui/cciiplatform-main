// src/lib/registroFonti/fonti.ts
//
// REGISTRO DELLE FONTI — fase 2 della reingegnerizzazione (Libra, parti A e B).
//
// Ogni regola che produce un calcolo, un'etichetta o un testo deve citare una
// voce di questo registro per identificativo. Il registro NON e' la sezione
// divulgativa (src/lib/normativa): quella spiega gli articoli a chi legge,
// questo e' la fonte che il motore cita e che il revisore potra' controllare.
//
// Regole del registro:
//   1. una voce "vigente" deve avere l'atto che l'ha introdotta e la data di
//      efficacia: una data senza atto non e' una fonte;
//   2. una data di aggiornamento di una banca dati NON e' una data di
//      efficacia normativa. Lezione dell'art. 63 "vigente dal 12 agosto 2026":
//      una data sbagliata ha attraversato quattro consegne di Libra prima di
//      essere fermata, e nessun atto la sosteneva;
//   3. cio' che non e' stato riscontrato entra come "da_verificare" e non puo'
//      sostenere un esito.

export type StatoFonte =
  | 'vigente'
  /** Disciplina transitoria ormai chiusa, ancora rilevante per le proposte del periodo. */
  | 'transitorio'
  | 'abrogato'
  /** Prassi amministrativa: orienta, non vincola il giudice. */
  | 'prassi'
  | 'da_verificare';

export interface Fonte {
  id: string;
  norma: string;
  oggetto: string;
  /** Data di efficacia, AAAA-MM-GG. null = da verificare. */
  efficaciaDal: string | null;
  /** Ultimo giorno di applicazione, per le discipline chiuse. */
  efficaciaAl: string | null;
  stato: StatoFonte;
  /** Atto che ha introdotto o modificato la disposizione. */
  atto: string | null;
  /** Come e' stata verificata: chi, su quale fonte. */
  verifica: string;
  verificata: boolean;
}

export const FONTI: Fonte[] = [
  // ---- Art. 25-novies: segnalazioni dei creditori pubblici qualificati ----
  {
    id: 'CCII-25novies-c1-a',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 1, lett. a)',
    oggetto:
      'INPS: ritardo di oltre 90 giorni nel versamento di contributi superiori al 30% dei dovuti dell’anno precedente e a 15.000 € (con lavoratori); 5.000 € senza lavoratori.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica:
      'Libra, parte B; valori confrontati con il motore (0.109.78). Modifiche successive da confermare su Normattiva.',
    verificata: true,
  },
  {
    id: 'CCII-25novies-c1-b',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 1, lett. b)',
    oggetto:
      'INAIL: debito per premi scaduto da oltre 90 giorni e non versato, superiore a 5.000 €.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica: 'Libra, parte B; confronto con il motore (0.109.78).',
    verificata: true,
  },
  {
    id: 'CCII-25novies-c1-c',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 1, lett. c)',
    oggetto:
      'Agenzia delle Entrate: debito IVA scaduto da LIPE oltre 5.000 € e non inferiore al 10% del volume d’affari; in ogni caso oltre 20.000 €. Nessun requisito dei 90 giorni.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica: 'Libra, parte B: la logica del motore coincide (0.109.78).',
    verificata: true,
  },
  {
    id: 'CCII-25novies-c1-d',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 1, lett. d)',
    oggetto:
      'Agente della Riscossione: crediti affidati, autodichiarati o definitivamente accertati, scaduti da oltre 90 giorni, oltre 100.000 € / 200.000 € / 500.000 € secondo la forma giuridica.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica:
      'Libra, parte B. Crediti a ruolo fuori dalla soglia dell’ente emittente: regola di Ercole (0.109.78).',
    verificata: true,
  },
  {
    id: 'CCII-25novies-c2',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 2',
    oggetto:
      'Termini di invio: Agenzia delle Entrate con la comunicazione di irregolarità ed entro 150 giorni dal termine della LIPE; INPS, INAIL e Agente della Riscossione entro 60 giorni dal verificarsi dei presupposti.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica: 'Libra, parte B.',
    verificata: true,
  },
  {
    id: 'CCII-25novies-c4',
    norma: 'D.Lgs. 14/2019 (CCII), art. 25-novies, comma 4',
    oggetto:
      'Applicabilità nel tempo: debiti INPS accertati dal 1° gennaio 2022; INAIL dall’entrata in vigore del Codice; LIPE dal secondo trimestre 2022; carichi affidati all’Agente della Riscossione dal 1° luglio 2022.',
    efficaciaDal: '2022-07-15',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica: 'Libra, parte B.',
    verificata: true,
  },
  // ---- Transazione nella composizione negoziata ------------------------
  {
    id: 'CCII-23-c2bis',
    norma: 'D.Lgs. 14/2019 (CCII), art. 23, comma 2-bis',
    oggetto:
      'Transazione nella composizione negoziata: solo tributi amministrati dalle agenzie fiscali e carichi dell’Agente della Riscossione. Esclusi contributi previdenziali e premi assicurativi. Nessuna omologazione forzosa: serve la sottoscrizione dell’ente.',
    efficaciaDal: '2024-09-28',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 13 settembre 2024, n. 136',
    verifica:
      'Libra (riscontro sulla mappa F), confermato da dottrina: transazione "fiscale ma non previdenziale" nella composizione negoziata.',
    verificata: true,
  },
  // ---- Art. 63: transazione negli accordi di ristrutturazione ----------
  {
    id: 'CCII-63-vigente',
    norma: 'D.Lgs. 14/2019 (CCII), art. 63',
    oggetto:
      'Transazione su crediti tributari e contributivi negli accordi di ristrutturazione (artt. 57, 60, 61). Comprende contributi e premi degli enti previdenziali e assicurativi.',
    efficaciaDal: '2024-09-28',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 13 settembre 2024, n. 136, art. 16, comma 6 (sostituzione dell’art. 63)',
    verifica:
      'Decreto pubblicato in G.U. il 27/09/2024, in vigore dal giorno successivo. La presunta vigenza "dal 12 agosto 2026" riportata da Libra non ha riscontro: era una data di aggiornamento della banca dati, ritirata da Libra stesso.',
    verificata: true,
  },
  {
    id: 'CCII-63-c4',
    norma: 'D.Lgs. 14/2019 (CCII), art. 63, comma 4',
    oggetto:
      'Omologazione forzosa: soddisfacimento del credito pubblico non inferiore al 50% (esclusi sanzioni e interessi) quando gli altri aderenti rappresentano almeno un quarto dell’indebitamento complessivo.',
    efficaciaDal: '2024-09-28',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 13 settembre 2024, n. 136',
    verifica:
      'Libra, matrice specifica art. 63; confermato da dottrina (soglie 50/60 del correttivo-ter).',
    verificata: true,
  },
  {
    id: 'CCII-63-c5',
    norma: 'D.Lgs. 14/2019 (CCII), art. 63, comma 5',
    oggetto:
      'Omologazione forzosa senza aderenti sufficienti: soddisfacimento non inferiore al 60% (esclusi sanzioni e interessi) e dilazione non oltre dieci anni.',
    efficaciaDal: '2024-09-28',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'D.Lgs. 13 settembre 2024, n. 136',
    verifica: 'Libra, matrice specifica art. 63; confermato da dottrina.',
    verificata: true,
  },
  {
    id: 'DL69-2023-1bis',
    norma: 'D.L. 13 giugno 2023, n. 69, art. 1-bis (conv. L. 10 agosto 2023, n. 103)',
    oggetto:
      'Disciplina transitoria del cram down: soglie del 30% (con altri aderenti almeno al 25%) e del 40% (altrimenti), dilazione fino a dieci anni.',
    efficaciaDal: null,
    efficaciaAl: '2024-09-27',
    stato: 'transitorio',
    atto: 'D.L. 13 giugno 2023, n. 69, art. 1-bis',
    verifica:
      'Libra e dottrina concordi sulle soglie. Decorrenza e composizione del denominatore (con o senza sanzioni e interessi) da confermare sul testo.',
    verificata: false,
  },
  // ---- Indici e strumenti della composizione negoziata ----------------
  {
    id: 'CCII-13-c2-originario',
    norma: 'D.Lgs. 14/2019 (CCII), art. 13, comma 2 (versione originaria)',
    oggetto: 'Indici della crisi elaborati dal CNDCEC. Mai approvati ufficialmente.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'abrogato',
    atto: 'D.Lgs. 17 giugno 2022, n. 83',
    verifica:
      'Registrato nel changelog. Non può fondare nessun esito: il Test Pratico si fonda sul decreto 23 aprile 2026.',
    verificata: true,
  },
  {
    id: 'DM-2026-04-23',
    norma: 'Decreto dirigenziale del Ministero della Giustizia 23 aprile 2026',
    oggetto:
      'Test pratico per la verifica della ragionevole perseguibilità del risanamento e check list particolareggiata della composizione negoziata.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'Decreto dirigenziale 23 aprile 2026 (aggiornamento del D.M. 28 settembre 2021)',
    verifica:
      'Recepito dalla circolare dell’Agenzia delle Entrate n. 5/E del 16/07/2026. Data di efficacia da confermare.',
    verificata: true,
  },
  {
    id: 'CCII-57-60-61',
    norma: 'D.Lgs. 14/2019 (CCII), artt. 57, 60 e 61',
    oggetto:
      'Accordi di ristrutturazione: ordinari (60% dei crediti), agevolati (30%), ad efficacia estesa (75% dei crediti della categoria).',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'da_verificare',
    atto: null,
    verifica: 'Riportato da Libra (indice normalizzato), non ancora riscontrato sul testo.',
    verificata: false,
  },
  // ---- Prassi amministrativa -------------------------------------------
  {
    id: 'AdE-circ-5E-2026',
    norma: 'Agenzia delle Entrate, circolare n. 5/E del 16 luglio 2026',
    oggetto:
      'Parte I del commento al Codice: le segnalazioni non attivano procedure, invitano a valutare; la proposta fiscale in composizione negoziata richiede relazione sulla convenienza e relazione sulla completezza dei dati.',
    efficaciaDal: '2026-07-16',
    efficaciaAl: null,
    stato: 'prassi',
    atto: 'Circolare n. 5/E del 16/07/2026',
    verifica: 'Riscontrata sul sito dell’Agenzia e su commenti di dottrina.',
    verificata: true,
  },
  {
    id: 'INPS-ruoli-lettera-d',
    norma: 'Prassi dell’Istituto sui crediti affidati all’Agente della Riscossione',
    oggetto:
      'Consegnata la partita all’Agente della Riscossione, per l’Istituto è chiusa: resta l’attesa del riversamento. Ai fini dell’art. 25-novies il credito rileva solo per la soglia dell’Agente (lett. d). Analoga alla prassi INAIL.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'prassi',
    atto: null,
    verifica:
      'Regola di Ercole (Polo Crisi d’Impresa INPS). Per l’INAIL Libra cita la circolare n. 28/2023, non ancora riscontrata.',
    verificata: true,
  },

  // ---- Obblighi dichiarativi e riscontri civilistici ---------------------
  {
    id: 'DL269-2003-44-c9',
    norma: 'D.L. 30 settembre 2003, n. 269, art. 44, comma 9 (conv. L. 24 novembre 2003, n. 326)',
    oggetto:
      'Obbligo per i datori di lavoro di trasmettere mensilmente all’INPS, per via telematica, i dati retributivi e contributivi dei lavoratori dipendenti (flusso Uniemens). La sua assenza è una violazione autonoma degli obblighi dichiarativi.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'L. 24 novembre 2003, n. 326',
    verifica:
      'Fonte indicata da Ercole (0.109.85). Nelle relazioni generate l’AI aveva citato a memoria «D.M. 26/10/2009» e «D.M. 26/10/2011»: riferimenti da non usare. Data di efficacia da riscontrare su Normattiva.',
    verificata: true,
  },
  {
    id: 'CC-2482bis-ter',
    norma: 'Codice civile, artt. 2482-bis e 2482-ter (s.r.l.); artt. 2446 e 2447 (s.p.a.)',
    oggetto:
      'Riduzione del capitale per perdite: perdita superiore a un terzo, obbligo di convocare senza indugio l’assemblea e di ridurre il capitale se la perdita non rientra entro l’esercizio successivo; perdita che porta il capitale sotto il minimo legale, ricapitalizzazione, trasformazione o scioglimento (causa di scioglimento ex art. 2484, n. 4).',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'R.D. 16 marzo 1942, n. 262 (Codice civile); artt. 2482-bis/ter introdotti dal D.Lgs. 17 gennaio 2003, n. 6',
    verifica:
      'Regola ordinaria confermata da Ercole (0.109.87) con riscontro su fonti notarili e dottrinali. Attenzione: per le perdite emerse negli esercizi 2020, 2021 e 2022 opera la sospensione del D.L. 23/2020, art. 6 (DL23-2020-6): il riscontro sul patrimonio netto negativo NON accerta un obbligo senza aver verificato se la società se ne è avvalsa.',
    verificata: true,
  },
  {
    id: 'DL23-2020-6',
    norma:
      'D.L. 8 aprile 2020, n. 23, art. 6 (conv. L. 5 giugno 2020, n. 40), come sostituito dall’art. 1, comma 266, L. 30 dicembre 2020, n. 178 ed esteso dal D.L. 228/2021, art. 3, c. 1-ter e dal D.L. 198/2022 (Milleproroghe)',
    oggetto:
      'Per le perdite emerse negli esercizi in corso al 31/12/2020, 2021 e 2022 non si applicano gli artt. 2446 c. 2-3, 2447, 2482-bis c. 4-6, 2482-ter c.c. e non opera la causa di scioglimento (2484 n. 4, 2545-duodecies). Il termine per ridurre la perdita sotto il terzo è posticipato al quinto esercizio successivo: l’assemblea che approva quel bilancio deve ridurre il capitale in proporzione. Per le perdite 2020 il quinquennio scade con l’approvazione del bilancio 2025 (nel 2026); per le perdite 2022, con il bilancio 2027. Restano fermi gli obblighi di convocazione e informativa ai soci.',
    efficaciaDal: '2021-01-01',
    efficaciaAl: null,
    stato: 'vigente',
    atto: 'L. 178/2020, art. 1, c. 266; D.L. 228/2021, art. 3, c. 1-ter; D.L. 198/2022',
    verifica:
      'Riscontro di Ercole (0.109.87) su fonti notarili (Comitato Triveneto, massime T.A.1 e T.A.4; CNN Studio 88-2021/I) e dottrinali. CONTRASTO INTERPRETATIVO non consolidato (Libra REV-007): per il Triveneto è sterilizzata l’intera perdita d’esercizio, per il CNN solo la parte che incide sul capitale al netto delle riserve. Testo su Normattiva non ancora riscontrato direttamente.',
    verificata: true,
  },
  // ---- Fonti indicate dall'analisi giuridica del 24/09/2026, in attesa di riscontro di Ercole ----
  {
    id: 'CCII-20',
    norma: 'D.Lgs. 14/2019 (CCII), art. 20',
    oggetto:
      'Sospensione degli obblighi degli artt. 2446, 2447, 2482-bis, 2482-ter c.c. e delle cause di scioglimento (artt. 2484, 2545-duodecies c.c.) durante la composizione negoziata, dalla pubblicazione dell’istanza.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'da_verificare',
    atto: null,
    verifica:
      'Indicata dall’analisi giuridica di Libra (24/09/2026) come norma che rileva per il patrimonio netto negativo in vista di una composizione negoziata. Testo e decorrenza da riscontrare su Normattiva.',
    verificata: false,
  },
  {
    id: 'CC-2485-2486',
    norma: 'Codice civile, artt. 2485 e 2486',
    oggetto:
      'Accertamento delle cause di scioglimento e poteri degli amministratori: gestione ai soli fini della conservazione dell’integrità e del valore del patrimonio sociale; responsabilità per i danni.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'da_verificare',
    atto: null,
    verifica:
      'Indicata dall’analisi giuridica di Libra (24/09/2026). Nei testi della piattaforma si cita solo come norma che rileva: nessuna conclusione su persone. Testo da riscontrare.',
    verificata: false,
  },
  {
    id: 'LF-185-186',
    norma: 'R.D. 16 marzo 1942, n. 267 (legge fallimentare), artt. 185 e 186',
    oggetto:
      'Esecuzione del concordato preventivo e risoluzione per inadempimento: disciplina applicabile ai procedimenti anteriori al 15/07/2022 per la norma transitoria dell’art. 390 CCII.',
    efficaciaDal: null,
    efficaciaAl: null,
    stato: 'da_verificare',
    atto: null,
    verifica:
      'Sostituisce la citazione errata «art. 118» (l.fall. e CCII) comparsa in due analisi. Numerazione da riscontrare sul testo della legge fallimentare.',
    verificata: false,
  },
];

export function fonte(id: string): Fonte | undefined {
  return FONTI.find((f) => f.id === id);
}

/** Una fonte puo' sostenere un esito solo se e' verificata e non abrogata. */
export function puoSostenereEsito(id: string): boolean {
  const f = fonte(id);
  return !!f && f.verificata && f.stato !== 'abrogato' && f.stato !== 'da_verificare';
}

/**
 * Coerenza del registro. Restituisce l'elenco dei difetti: vuoto se sano.
 * Tenuto come funzione, non solo come test, per poterlo mostrare nella
 * sezione di amministrazione quando il registro diventera' modificabile.
 */
export function difettiRegistro(fonti: Fonte[] = FONTI): string[] {
  const difetti: string[] = [];
  const visti = new Set<string>();
  for (const f of fonti) {
    if (visti.has(f.id)) difetti.push(`${f.id}: identificativo duplicato`);
    visti.add(f.id);
    if (f.stato === 'vigente' && !f.atto) difetti.push(`${f.id}: vigente senza atto`);
    if (f.stato === 'transitorio' && !f.efficaciaAl)
      difetti.push(`${f.id}: disciplina transitoria senza data di chiusura`);
    if (f.stato === 'da_verificare' && f.verificata)
      difetti.push(`${f.id}: "da verificare" ma marcata come verificata`);
    for (const d of [f.efficaciaDal, f.efficaciaAl]) {
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) difetti.push(`${f.id}: data non valida ${d}`);
    }
  }
  return difetti;
}
