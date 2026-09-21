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
