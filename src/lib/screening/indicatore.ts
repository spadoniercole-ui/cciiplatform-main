// src/lib/screening/indicatore.ts
//
// INDICATORE SINTETICO DI ATTENZIONE
//
// Sintetizza in un solo esito le grandezze che entrano nello Screening:
// copertura informativa, soglie di segnalazione, equilibrio patrimoniale e
// finanziario, quadro qualitativo.
//
// ---------------------------------------------------------------------------
// PERCHÉ NON È UNA MEDIA PONDERATA
//
// La media è la strada istintiva ed è quella sbagliata, per tre ragioni.
//
// 1. NON ESISTE UNA POPOLAZIONE DI RIFERIMENTO. Standardizzare (z-score,
//    percentili) richiede una distribuzione. Qui si valuta un'azienda alla
//    volta: non c'è il campione rispetto a cui dire "questo ROE è basso".
//    Qualunque normalizzazione sarebbe costruita su soglie decise da noi e
//    poi presentata come statistica.
//
// 2. LE GRANDEZZE NON SONO COMPENSABILI. Una media dice che un buon
//    patrimonio netto compensa il superamento della soglia dell'art.
//    25-novies. Ma quel superamento è un FATTO GIURIDICO: o c'è o non c'è, e
//    nessun indice di bilancio lo annulla. Un indicatore compensatorio
//    produrrebbe un verde su un'azienda che l'ente è tenuto a segnalare —
//    l'errore più grave immaginabile su questa piattaforma.
//
// 3. I DATI MANCANO QUASI SEMPRE. In un indicatore compensatorio il dato
//    mancante diventa implicitamente un valore, di norma favorevole: verde
//    per assenza di prove.
//
// Si adotta perciò una regola GERARCHICA e NON COMPENSATORIA — la logica dei
// sistemi di allerta precoce, non quella dei ranking. Ogni livello può
// peggiorare l'esito, nessuno può migliorarlo.
//
// ---------------------------------------------------------------------------
// COSA QUESTO INDICATORE NON È
//
// NON è una probabilità di default, e non va letto come tale.
//
// La popolazione su cui opera è già il risultato di una selezione: aziende
// non virtuose, estratte per essere attenzionate. Condizionare su quella
// selezione significa che le frequenze osservate qui non sono trasferibili
// alla popolazione generale delle imprese. L'indicatore misura PRIORITÀ DI
// ATTENZIONE dentro un insieme già anomalo.
//
// Per la stessa ragione l'esito migliore non è un "verde" pieno ma
// "nessuna criticità rilevata CON I DATI DISPONIBILI": uno screening è
// preliminare per definizione, e su una crisi d'impresa un verde secco è una
// promessa che non si può mantenere.
//
// ---------------------------------------------------------------------------
// L'ASSENZA DI DATI È UN SEGNALE, NON UNA NEUTRALITÀ
//
// Se i dati in possesso dell'ente non circoscrivono un perimetro preciso, il
// valutatore DEVE chiedere documentazione: è un'azione dovuta, quindi
// l'esito è ROSSO. Uno stato "grigio" a sé stante permetterebbe a un
// fascicolo incompleto di restare in silenzio.
//
// ---------------------------------------------------------------------------
// DUE REGISTRI SEPARATI: GRAVITÀ E AZIONE
//
// Il colore risponde a "quanto è grave". L'ordine delle azioni risponde a
// "cosa faccio adesso". Sono domande diverse, e sovrapporle significa
// prendere posizione su una prassi interna che nell'ente non è univoca: se
// con un fascicolo incompleto la comunicazione all'imprenditore parta lo
// stesso o si attenda dipende dall'ufficio e dal dirigente.
//
// L'indicatore restituisce perciò DUE elenchi affiancati e senza gerarchia:
//
//   ACCERTATO   — ciò che i dati dimostrano;
//   DA ACCERTARE — ciò che manca per circoscrivere il perimetro.
//
// Nessuno dei due "viene prima". Il valutatore li vede entrambi e decide
// secondo la propria prassi. Sui FATTI il sistema è preciso; sulla
// PROCEDURA resta neutrale — la stessa scelta già fatta per il requisito dei
// 90 giorni, dove si dichiara il superamento della soglia ma non si afferma
// mai che la segnalazione sia dovuta.
//
// ---------------------------------------------------------------------------
// L'anno di costituzione serve proprio a questo: distingue "XBRL assente
// perché l'impresa è giovane" da "XBRL assente perché i bilanci non sono
// stati depositati". Il secondo caso è di per sé un segnale. Ma la giovane
// età NON è una scusante quando l'esposizione supera la soglia di legge.

// ---------------------------------------------------------------------------
// DIMENSIONI PORTANTI E DIMENSIONI ACCESSORIE
//
// Non tutte le dimensioni pesano allo stesso modo sulla possibilità di
// esprimere un giudizio, e trattarle come equivalenti era un errore della
// prima stesura.
//
// PORTANTI — la soglia di segnalazione dell'ente e il bilancio. Senza queste
// il perimetro non è circoscrivibile e l'esito è "approfondimenti
// necessari".
//
// ACCESSORIA — il quadro qualitativo (Check List / Direttrici). Per come è
// costruito l'indicatore, il quadro qualitativo può soltanto PEGGIORARE
// l'esito, mai migliorarlo. La sua assenza non può quindi capovolgere un
// giudizio: al più lo lascia più mite del vero. Contarla fra le lacune
// bloccanti mandava in rosso aziende che rosse non erano — e su uno
// strumento di triage significa restituire sempre lo stesso rosso, cioè
// rumore.
//
// Nota sulle soglie: uno spazio ENTE valuta SOLO la propria. Le righe degli
// altri enti non entrano nel calcolo e non possono quindi mancare: la
// copertura reale è più alta di quanto una lettura frettolosa suggerisca.
// ---------------------------------------------------------------------------

export type EsitoAttenzione = 'ROSSO' | 'GIALLO' | 'ATTENZIONE_MINIMA';

/** Anni entro cui l'assenza di bilanci depositati è spiegabile con l'età. */
export const ANNI_GIOVANE_IMPRESA = 3;

export interface IngressoIndicatore {
  /** Anno di costituzione (anagrafica). null = non dichiarato. */
  annoCostituzione: number | null;
  /** Anno corrente, per calcolare l'età. */
  annoCorrente: number;
  /** Bilancio XBRL caricato e analizzato? */
  xbrlPresente: boolean;
  /** Patrimonio netto dall'ultimo bilancio; null se XBRL assente. */
  patrimonioNetto: number | null;
  /** Numero di indici CCII risultati violati; null se non calcolabili. */
  indiciViolati: number | null;
  /**
   * Soglie di segnalazione art. 25-novies: almeno una superata?
   * null = non determinabile (dati non inseriti).
   */
  sogliaSuperata: boolean | null;
  /** Esposizione complessiva verso l'ente; null se non nota. */
  esposizione: number | null;
  /** Soglia di legge applicabile a questa impresa; null se non determinabile. */
  sogliaApplicabile: number | null;
  /** Colore del quadro qualitativo (Check List / Direttrici). */
  coloreQualitativo: 'verde' | 'giallo' | 'rosso' | 'grigio' | null;
}

export interface Attenzione {
  esito: EsitoAttenzione;
  /** Etichetta breve, da mostrare accanto al semaforo. */
  etichetta: string;
  /** La dimensione che ha determinato l'esito: un semaforo deve dire perché. */
  fattoreDeterminante: string;
  /** Ciò che i dati DIMOSTRANO. Fatti, non ipotesi. */
  accertato: string[];
  /** Ciò che MANCA per circoscrivere il perimetro. */
  daAccertare: string[];
  /** Quante dimensioni erano determinabili, su quante previste. */
  copertura: { determinate: number; totali: number };
}

/**
 * Un fatto accertato e una lacuna possono coesistere: l'etichetta le dice
 * INSIEME invece di ordinarle, perché stabilire quale "viene prima"
 * significherebbe prendere posizione su una prassi che nell'ente non è
 * univoca.
 */
function etichettaCriticita(daAccertare: string[]): string {
  return daAccertare.length > 0
    ? 'Criticità rilevante che potrebbe richiedere approfondimenti'
    : 'Criticità rilevante';
}

const DIMENSIONI_TOTALI = 4; // copertura, soglie, equilibrio, qualitativo

export function calcolaAttenzione(input: IngressoIndicatore): Attenzione {
  const accertato: string[] = [];
  const daAccertare: string[] = [];
  // Solo le lacune PORTANTI impediscono di circoscrivere il perimetro.
  const lacunePortanti: string[] = [];
  let determinate = 0;

  // ---- Livello 0: copertura informativa --------------------------------
  const eta = input.annoCostituzione !== null ? input.annoCorrente - input.annoCostituzione : null;
  const giovane = eta !== null && eta <= ANNI_GIOVANE_IMPRESA;

  // "Debito importante": si usa la soglia di legge applicabile, non un
  // numero inventato. Sono le soglie dell'art. 25-novies, già configurate.
  const debitoOltreSoglia =
    input.esposizione !== null &&
    input.sogliaApplicabile !== null &&
    input.esposizione > input.sogliaApplicabile;

  if (input.annoCostituzione === null) {
    daAccertare.push(
      'Anno di costituzione non dichiarato: non è possibile stabilire se l’assenza di bilanci dipenda dalla giovane età dell’impresa o dal mancato deposito.'
    );
  }

  if (!input.xbrlPresente) {
    if (input.annoCostituzione === null) {
      daAccertare.push('Bilancio XBRL non caricato.');
      lacunePortanti.push('Bilancio XBRL non caricato.');
    } else if (giovane && !debitoOltreSoglia) {
      // Unico caso in cui l'assenza di bilancio non è un segnale: impresa
      // giovane E esposizione sotto la soglia di legge.
      accertato.push(
        `Bilancio XBRL assente, compatibile con la costituzione recente (${input.annoCostituzione}) e con un’esposizione sotto la soglia di legge.`
      );
      determinate++;
    } else if (giovane && debitoOltreSoglia) {
      accertato.push(
        `Bilancio XBRL assente e impresa di costituzione recente (${input.annoCostituzione}), MA l’esposizione supera la soglia di legge: la giovane età non spiega l’esposizione.`
      );
      daAccertare.push('Bilancio XBRL non caricato.');
      lacunePortanti.push('Bilancio XBRL non caricato.');
    } else {
      accertato.push(
        `Bilancio XBRL assente per un’impresa costituita nel ${input.annoCostituzione}: l’età non giustifica il mancato deposito.`
      );
      daAccertare.push('Bilancio XBRL non caricato o bilanci non depositati.');
      lacunePortanti.push('Bilancio XBRL non caricato o bilanci non depositati.');
    }
  } else {
    determinate++;
  }

  if (input.sogliaSuperata === null) {
    daAccertare.push(
      'Soglie di segnalazione non determinabili: valori non inseriti nella scheda dedicata.'
    );
    lacunePortanti.push('Soglie di segnalazione non determinabili.');
  } else {
    determinate++;
  }

  if (input.indiciViolati === null) {
    if (input.xbrlPresente) daAccertare.push('Indici CCII non calcolabili dal bilancio caricato.');
  } else {
    determinate++;
  }

  if (input.coloreQualitativo === null || input.coloreQualitativo === 'grigio') {
    // NON si elenca fra le cose da accertare.
    //
    // È una dimensione accessoria: può solo peggiorare l'esito, mai
    // migliorarlo, quindi la sua assenza non cambia nulla del giudizio. E la
    // Check List si compila DOPO — è il passo successivo del percorso — per
    // cui dire "non è compilata" a chi ha appena caricato i documenti è
    // un'ovvietà che occupa spazio e distrae dalle lacune che contano
    // davvero. Concorre solo alla copertura, che resta dichiarata.
  } else {
    determinate++;
  }

  const copertura = { determinate, totali: DIMENSIONI_TOTALI };

  // ---- Livello 1: vincoli giuridici ------------------------------------
  if (input.sogliaSuperata === true) {
    accertato.unshift('Almeno una soglia di segnalazione dell’art. 25-novies risulta superata.');
    return {
      esito: 'ROSSO',
      // La formula lunga solo dove ci sono davvero lacune: con il quadro
      // completo "potrebbe richiedere approfondimenti" sarebbe fuorviante,
      // perché non c'è nulla da approfondire.
      etichetta: etichettaCriticita(lacunePortanti),
      fattoreDeterminante: 'Soglia di segnalazione superata',
      accertato,
      daAccertare,
      copertura,
    };
  }

  if (input.patrimonioNetto !== null && input.patrimonioNetto < 0) {
    accertato.unshift('Patrimonio netto negativo dall’ultimo bilancio disponibile.');
    return {
      esito: 'ROSSO',
      etichetta: etichettaCriticita(lacunePortanti),
      fattoreDeterminante: 'Patrimonio netto negativo',
      accertato,
      daAccertare,
      copertura,
    };
  }

  // ---- Livello 0 (esito): perimetro non circoscrivibile -----------------
  // Se i dati non circoscrivono il perimetro, il valutatore deve richiedere
  // documentazione: è un'azione dovuta, quindi rosso. Non un "grigio", che
  // permetterebbe a un fascicolo incompleto di restare in silenzio.
  if (lacunePortanti.length > 0) {
    return {
      esito: 'ROSSO',
      etichetta: 'Approfondimenti necessari',
      fattoreDeterminante: 'Perimetro non circoscrivibile con i dati disponibili',
      accertato,
      daAccertare,
      copertura,
    };
  }

  // ---- Livello 2: equilibrio economico-finanziario ---------------------
  if (input.indiciViolati !== null && input.indiciViolati >= 3) {
    accertato.unshift(`${input.indiciViolati} indici CCII oltre soglia.`);
    return {
      esito: 'ROSSO',
      etichetta: etichettaCriticita(lacunePortanti),
      fattoreDeterminante: 'Indici CCII oltre soglia',
      accertato,
      daAccertare,
      copertura,
    };
  }

  let esito: EsitoAttenzione = 'ATTENZIONE_MINIMA';
  let fattoreDeterminante = 'Nessuna criticità emersa dai dati disponibili';

  if (input.indiciViolati !== null && input.indiciViolati > 0) {
    esito = 'GIALLO';
    fattoreDeterminante = 'Indici CCII oltre soglia';
    accertato.unshift(
      `${input.indiciViolati} ${input.indiciViolati === 1 ? 'indice CCII oltre soglia' : 'indici CCII oltre soglia'}.`
    );
  }

  // ---- Livello 3: quadro qualitativo ------------------------------------
  // Può peggiorare, mai migliorare, e si ferma al giallo: le criticità della
  // Check List sono dichiarazioni e valutazioni, non fatti accertati, e non
  // producono da sole l'allarme massimo.
  if (input.coloreQualitativo === 'rosso' || input.coloreQualitativo === 'giallo') {
    if (esito === 'ATTENZIONE_MINIMA') {
      esito = 'GIALLO';
      fattoreDeterminante = 'Quadro qualitativo';
    }
    accertato.push(
      input.coloreQualitativo === 'rosso'
        ? 'Il quadro qualitativo evidenzia criticità strutturali rilevanti.'
        : 'Il quadro qualitativo evidenzia aree da rafforzare.'
    );
  }

  return {
    esito,
    etichetta:
      esito === 'GIALLO' ? 'Attenzione' : 'Nessuna criticità rilevata con i dati disponibili',
    fattoreDeterminante,
    accertato,
    daAccertare,
    copertura,
  };
}
