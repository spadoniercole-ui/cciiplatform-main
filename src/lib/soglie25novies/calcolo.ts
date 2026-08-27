// src/lib/soglie25novies/calcolo.ts
//
// Griglia delle soglie di segnalazione INPS (art. 25-novies, comma 1,
// lettera a) CCII), da mostrare in TESTATA allo Screening dell'azienda come
// primo punto dell'analisi.
//
// FONTE — le due righe replicano esattamente le prime due voci di SOGLIE in
// src/lib/normativa/dati.ts, che riportano il testo dell'articolo:
//
//   1) imprese CON lavoratori subordinati e parasubordinati:
//      ritardo > 90 giorni per contributi previdenziali di ammontare
//      superiore al 30% di quelli dovuti nell'anno precedente
//      E all'importo di 15.000 € — i due requisiti sono CONGIUNTI;
//   2) imprese SENZA lavoratori subordinati e parasubordinati:
//      ritardo > 90 giorni, importo superiore a 5.000 €
//      (nessun vincolo percentuale).
//
// Le due righe sono ALTERNATIVE, mai sommabili: quale si applica dipende
// dalla presenza di lavoratori subordinati/parasubordinati, dato che va
// dichiarato in anagrafica azienda.
//
// ---------------------------------------------------------------------------
// SU COSA GIRA IL TEST: sul CONTRIBUTO, non sul contributo piu' sanzioni
//
// Il delta fra la Posizione V.E.R.A. e la Situazione Debitoria contabilizzata
// e', nella prassi, il calcolo delle SANZIONI: la contabilita' dell'ente non
// le espone, perche' vanno determinate al momento del pagamento; VERA le
// propone su una presunzione, che la piattaforma acquisisce come tale.
//
// Le sanzioni civili sono un accessorio, di natura diversa dal contributo, e
// possono arrivare al 40-60% di esso. Il test dell'art. 25-novies confronta i
// CONTRIBUTI non versati con il 30% dei CONTRIBUTI dovuti nell'anno
// precedente: mettere le sanzioni al numeratore e i soli contributi al
// denominatore gonfierebbe il rapporto per costruzione, facendo scattare
// "oltre soglia" per effetto di una nostra presunzione. Confermato da Ercole
// sulla prassi INPS: la soglia si misura sul contributo.
//
// Perche' allora le sanzioni presunte restano nella griglia? Perche' il
// valutatore le deve vedere. Il motore le espone, le dichiara come
// presunzione, e segnala esplicitamente il caso che conta: contributi sotto
// soglia ma totale con sanzioni sopra. Nascondere quel caso dietro un unico
// verdetto sarebbe peggio in entrambe le direzioni.
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// PRINCIPIO NON NEGOZIABILE — "oltre soglia" NON è "segnalazione dovuta"
//
// La fattispecie dell'art. 25-novies ha TRE condizioni: (a) natura
// previdenziale del debito, (b) importo oltre soglia, (c) ritardo di oltre
// NOVANTA GIORNI nel versamento. La piattaforma oggi dimostra (a) e (b);
// (c) non è ricavabile, perché i tracciati importati non portano la data di
// scadenza delle singole partite.
//
// Perciò questo motore non afferma mai che una segnalazione è dovuta.
// Dichiara che l'esposizione è oltre soglia, elenca ciò che non ha potuto
// verificare, e su quella base RACCOMANDA al valutatore di accertare il
// requisito temporale prima di procedere. È la stessa disciplina già scelta
// per i riscontri normativi: mai asserire un obbligo se i dati non provano
// tutte le condizioni.
// ---------------------------------------------------------------------------

/** Soglie della lettera a), comma 1, art. 25-novies CCII. */
export const SOGLIE_INPS_25NOVIES = {
  /** Imprese CON lavoratori: percentuale dei contributi dovuti nell'anno precedente. */
  percentualeConLavoratori: 0.3,
  /** Imprese CON lavoratori: importo minimo, congiunto alla percentuale. */
  importoConLavoratori: 15_000,
  /** Imprese SENZA lavoratori: importo, senza vincolo percentuale. */
  importoSenzaLavoratori: 5_000,
  /** Giorni di ritardo richiesti dalla norma (non verificabili dai dati odierni). */
  giorniRitardo: 90,
} as const;

/** Esposizione previdenziale di un singolo anno. */
export interface RigaAnno {
  /** Anno di competenza; null = riga priva di data nei dati di origine. */
  anno: number | null;
  /** CONTRIBUTI contabilizzati dall'ente (Situazione Debitoria). Base del test. */
  contabilizzato: number;
  /**
   * Delta V.E.R.A. rispetto al contabilizzato = SANZIONI PRESUNTE.
   * Mostrato, dichiarato come presunzione, MAI incluso nel test di soglia.
   */
  sanzioniPresunte: number;
}

export interface IngressoGriglia {
  righe: RigaAnno[];
  /**
   * L'impresa ha lavoratori subordinati/parasubordinati?
   * null = non dichiarato in anagrafica: non si può scegliere quale delle
   * due righe di soglia applicare.
   */
  conLavoratori: boolean | null;
  /**
   * Totale dei contributi DOVUTI nell'anno precedente (dato dichiarato in
   * anagrafica azienda). null = non disponibile.
   */
  contributiDovutiAnnoPrecedente: number | null;
  /** Anno cui si riferisce il dato precedente (per l'etichetta a video). */
  annoContributiDovuti: number | null;
  /** Esiste un organo di controllo nominato? Determina il destinatario. */
  organoDiControlloNominato: boolean | null;
  /**
   * Chi sta leggendo la griglia. Cambia SOLO la raccomandazione, mai il
   * calcolo: la soglia di legge e' la stessa per tutti.
   *
   * - 'ENTE'      il valutatore dell'istituto, che deve decidere se
   *               comunicare all'imprenditore;
   * - 'NON_ENTE'  il professionista che redige per conto dell'impresa, che
   *               non comunica proprio nulla: per lui il superamento e' una
   *               misura di quanto tempo gli resta prima che la segnalazione
   *               parta dall'ente.
   */
  prospettiva: 'ENTE' | 'NON_ENTE';
}

export type EsitoSoglia = 'sotto' | 'sopra' | 'non_determinabile';

export interface RigaSoglia {
  /** Etichetta identica a quella della Sezione Normativa. */
  ambito: string;
  descrizione: string;
  /** Valore della soglia, come testo, per la colonna "Soglie". */
  valore: string;
  /** Questa riga è quella che si applica all'impresa in esame? */
  applicabile: boolean;
  esito: EsitoSoglia;
  /** Perché quell'esito, in parole concrete e con i numeri. */
  motivo: string;
}

export interface Griglia {
  righe: RigaAnno[];
  /** Totale dei contributi contabilizzati: LA BASE DEL TEST. */
  totaleContabilizzato: number;
  /** Totale delle sanzioni presunte da VERA: fuori dal test. */
  totaleSanzioniPresunte: number;
  /** Contributi + sanzioni presunte. A video, non nel test. */
  totaleComplessivo: number;
  /**
   * true quando i contributi sono SOTTO soglia ma il totale con le sanzioni
   * presunte la supererebbe: e' il caso che il valutatore deve conoscere.
   */
  sopraSoloConSanzioni: boolean;
  /** Il 30% dei contributi dovuti nell'anno precedente; null se non calcolabile. */
  sogliaPercentuale: number | null;
  soglie: RigaSoglia[];
  /** Esito complessivo: la riga applicabile è superata? */
  oltreSoglia: boolean;
  /** Cosa NON è stato verificato — sempre mostrato, mai omesso. */
  datiMancanti: string[];
  /** Raccomandazione al valutatore; null se non c'è nulla da raccomandare. */
  raccomandazione: string | null;
}

function euro(n: number): string {
  return `${Math.round(n).toLocaleString('it-IT')} €`;
}

/**
 * Costruisce la griglia. Funzione PURA: nessun accesso al database, nessuna
 * chiamata AI. Stessi ingressi, stesso risultato, sempre verificabile a mano.
 */
export function calcolaGriglia25Novies(input: IngressoGriglia): Griglia {
  const righe = [...input.righe].sort((a, b) => {
    // Anni in ordine crescente; le righe senza anno sempre in fondo.
    if (a.anno === null) return 1;
    if (b.anno === null) return -1;
    return a.anno - b.anno;
  });

  const totaleContabilizzato = righe.reduce((s, r) => s + r.contabilizzato, 0);
  const totaleSanzioniPresunte = righe.reduce((s, r) => s + r.sanzioniPresunte, 0);
  const totaleComplessivo = totaleContabilizzato + totaleSanzioniPresunte;

  // BASE DEL TEST: i soli contributi. Le sanzioni presunte non entrano.
  const base = totaleContabilizzato;

  const datiMancanti: string[] = [];

  // Requisito temporale: mai dimostrabile con i dati odierni.
  datiMancanti.push(
    `Requisito del ritardo di oltre ${SOGLIE_INPS_25NOVIES.giorniRitardo} giorni: non ricavabile dai tracciati importati, che non portano la data di scadenza delle singole partite.`
  );

  if (input.conLavoratori === null) {
    datiMancanti.push(
      'Presenza di lavoratori subordinati/parasubordinati non dichiarata in anagrafica azienda: non è possibile stabilire quale delle due soglie si applichi.'
    );
  }

  const sogliaPercentuale =
    input.contributiDovutiAnnoPrecedente !== null
      ? input.contributiDovutiAnnoPrecedente * SOGLIE_INPS_25NOVIES.percentualeConLavoratori
      : null;

  if (input.conLavoratori !== false && input.contributiDovutiAnnoPrecedente === null) {
    datiMancanti.push(
      'Totale dei contributi dovuti nell’anno precedente non presente in anagrafica azienda: il requisito percentuale (30%) non è calcolabile.'
    );
  }

  if (righe.some((r) => r.anno === null)) {
    datiMancanti.push(
      'Una parte dell’esposizione non è attribuibile a un anno (righe prive di data nei dati di origine): concorre ai totali, non alla ripartizione per anno.'
    );
  }

  if (totaleSanzioniPresunte !== 0) {
    datiMancanti.push(
      'Le sanzioni indicate dalla Posizione V.E.R.A. sono una PRESUNZIONE: la contabilità dell’ente non le espone perché si determinano al momento del pagamento. Restano fuori dal test di soglia, che si misura sui soli contributi.'
    );
  }

  // --- Riga 1: imprese CON lavoratori (requisiti CONGIUNTI) ----------------
  const applicabileCon = input.conLavoratori === true;
  let esitoCon: EsitoSoglia;
  let motivoCon: string;

  if (sogliaPercentuale === null) {
    esitoCon = 'non_determinabile';
    motivoCon =
      'Manca il totale dei contributi dovuti nell’anno precedente: il 30% non è calcolabile, quindi il concorso dei due requisiti non è verificabile.';
  } else {
    const oltrePercentuale = base > sogliaPercentuale;
    const oltreImporto = base > SOGLIE_INPS_25NOVIES.importoConLavoratori;
    esitoCon = oltrePercentuale && oltreImporto ? 'sopra' : 'sotto';
    motivoCon =
      `Contributi ${euro(base)} — 30% dei contributi dovuti nell’anno precedente: ${euro(sogliaPercentuale)} (${oltrePercentuale ? 'superato' : 'non superato'}); ` +
      `importo di ${euro(SOGLIE_INPS_25NOVIES.importoConLavoratori)} (${oltreImporto ? 'superato' : 'non superato'}). ` +
      `I due requisiti sono congiunti: ${esitoCon === 'sopra' ? 'entrambi superati' : 'non entrambi superati'}.`;
  }

  // --- Riga 2: imprese SENZA lavoratori (solo importo) ---------------------
  const applicabileSenza = input.conLavoratori === false;
  const oltreSenza = base > SOGLIE_INPS_25NOVIES.importoSenzaLavoratori;
  const motivoSenza =
    `Contributi ${euro(base)} — soglia ${euro(SOGLIE_INPS_25NOVIES.importoSenzaLavoratori)}: ` +
    `${oltreSenza ? 'superata' : 'non superata'}. Nessun vincolo percentuale per questa fattispecie.`;

  const soglie: RigaSoglia[] = [
    {
      ambito: 'Segnalazione INPS — imprese CON lavoratori',
      descrizione:
        'Ritardo di oltre 90 giorni nel versamento di contributi previdenziali di ammontare superiore alla soglia (entrambi i requisiti).',
      valore: '> 30% dei contributi dovuti nell’anno precedente E > 15.000 €',
      applicabile: applicabileCon,
      esito: esitoCon,
      motivo: motivoCon,
    },
    {
      ambito: 'Segnalazione INPS — imprese SENZA lavoratori',
      descrizione: 'Ritardo di oltre 90 giorni nel versamento di contributi previdenziali.',
      valore: '> 5.000 €',
      applicabile: applicabileSenza,
      esito: oltreSenza ? 'sopra' : 'sotto',
      motivo: motivoSenza,
    },
  ];

  const rigaApplicabile = soglie.find((s) => s.applicabile);
  const oltreSoglia = rigaApplicabile?.esito === 'sopra';

  // Il caso che il valutatore deve conoscere: contributi sotto soglia, ma
  // il totale con le sanzioni presunte la supererebbe. Non cambia l'esito
  // (il test resta sul contributo) — cambia cio' che il valutatore sa.
  let sopraSoloConSanzioni = false;
  if (!oltreSoglia && rigaApplicabile && totaleSanzioniPresunte > 0) {
    if (rigaApplicabile.applicabile && input.conLavoratori === false) {
      sopraSoloConSanzioni = totaleComplessivo > SOGLIE_INPS_25NOVIES.importoSenzaLavoratori;
    } else if (input.conLavoratori === true && sogliaPercentuale !== null) {
      sopraSoloConSanzioni =
        totaleComplessivo > sogliaPercentuale &&
        totaleComplessivo > SOGLIE_INPS_25NOVIES.importoConLavoratori;
    }
  }

  // --- Raccomandazione al valutatore --------------------------------------
  let raccomandazione: string | null = null;
  const perRedigente = input.prospettiva === 'NON_ENTE';

  if (oltreSoglia && perRedigente) {
    // Il professionista non invia comunicazioni: le riceve il suo cliente.
    // Quello che gli serve sapere e' che l'ente ha ora il presupposto per
    // segnalare, e che questo comprime il tempo a disposizione.
    raccomandazione =
      `L'esposizione previdenziale dell'impresa supera la soglia dell'art. 25-novies applicabile. ` +
      `Ricorrendo anche il ritardo di oltre ${SOGLIE_INPS_25NOVIES.giorniRitardo} giorni — che i dati qui disponibili non dimostrano — l'ente ha il presupposto per la segnalazione all'imprenditore e, ove esistente, all'organo di controllo. ` +
      `Da valutare come vincolo di tempo nella costruzione del piano: la finestra utile per presentare la proposta si restringe.`;
  } else if (oltreSoglia) {
    const destinatari =
      input.organoDiControlloNominato === true
        ? 'all’imprenditore e all’organo di controllo, nella persona del presidente del collegio sindacale o del sindaco unico'
        : input.organoDiControlloNominato === false
          ? 'all’imprenditore (nessun organo di controllo risulta nominato)'
          : 'all’imprenditore e, ove nominato, all’organo di controllo nella persona del presidente del collegio sindacale o del sindaco unico';
    raccomandazione =
      `Esposizione previdenziale oltre la soglia dell’art. 25-novies applicabile a questa impresa. ` +
      `Prima di procedere va accertato il requisito del ritardo di oltre ${SOGLIE_INPS_25NOVIES.giorniRitardo} giorni, che i dati disponibili non dimostrano. ` +
      `Accertato quello, inviare la comunicazione ${destinatari}, con l’invito a valutare l’accesso alla composizione negoziata.`;
  } else if (sopraSoloConSanzioni) {
    raccomandazione =
      `Contributi SOTTO la soglia applicabile (${euro(totaleContabilizzato)}). La soglia risulterebbe superata solo sommando le sanzioni presunte dalla Posizione V.E.R.A. (${euro(totaleSanzioniPresunte)}, totale ${euro(totaleComplessivo)}). ` +
      `Le sanzioni sono un accessorio, si determinano al momento del pagamento e qui sono una presunzione: NON fondano da sole la segnalazione. ` +
      `Prima di qualunque iniziativa vanno quantificate sugli atti dell'ente.`;
  } else if (rigaApplicabile?.esito === 'non_determinabile') {
    raccomandazione =
      'Esito non determinabile: completare in anagrafica azienda i dati mancanti indicati sotto, poi rileggere questa griglia.';
  } else if (!rigaApplicabile) {
    raccomandazione =
      'Nessuna delle due soglie è stata applicata: dichiarare in anagrafica azienda la presenza o assenza di lavoratori subordinati/parasubordinati.';
  }

  return {
    righe,
    totaleContabilizzato,
    totaleSanzioniPresunte,
    totaleComplessivo,
    sopraSoloConSanzioni,
    sogliaPercentuale,
    soglie,
    oltreSoglia,
    datiMancanti,
    raccomandazione,
  };
}
