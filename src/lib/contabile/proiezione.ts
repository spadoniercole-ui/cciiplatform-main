// LA PROIEZIONE CONTABILE — voci motrici e voci derivate (0.238.0).
//
// PERCHÉ STA QUI E NON NELLA VERIFICA AZIENDA (0.236.0).
//
// Gli indici si calcolano su un anno: sono una fotografia, non guardano né
// avanti né indietro. Il dato contabile però arriva in colonne affiancate —
// ogni file XBRL porta l'anno e il precedente — e la parte più vecchia della
// serie è quella che nessun file porta con sé. È da lì che si parte.
//
// IL DIFETTO CHE HA PORTATO ALLA RISCRITTURA (0.238.0).
//
// Proiettare ogni riga per conto suo tratta un prospetto a scalare come dieci
// serie indipendenti. In pagina si vedeva: EBIT «fermo» a 100.000 mentre il
// valore della produzione cresceva del 34% e i costi del 36%; utile a 31.743
// quando EBIT meno oneri faceva 69.790. Ogni riga era coerente con la sua
// serie e incoerente con il prospetto. Un EBIT con passo 1 non è un'ipotesi:
// è un conto economico che si contraddice.
//
// COME FUNZIONA ORA.
//
//   MOTRICI   hanno una serie propria e si proiettano: valore della
//             produzione, costi della produzione, oneri finanziari, totale
//             debiti, debiti verso banche. Il differenziale di ogni anno si
//             conta sulla BASE — il bilancio più vecchio, quello che nessun
//             file porta con sé come anno precedente — in punti della base; la
//             ragione geometrica fra primo e ultimo differenziale si applica
//             ai valori dell'ULTIMO BILANCIO UTILE fino all'anno della
//             verifica.
//
//   DERIVATE  si calcolano dalle motrici, con le identità del prospetto:
//             ricavi = valore produzione − margine non-ricavi dell'ultimo
//             bilancio; EBIT = valore produzione − costi; EBITDA = EBIT +
//             ammortamenti (fermi all'ultimo dato, non c'è una serie);
//             utile = EBIT − oneri; patrimonio netto = patrimonio dell'anno
//             prima + utile; liquidità = cassa dell'anno prima + utile.
//
// Se una motrice non ha una serie utilizzabile resta ferma all'ultimo dato e
// il prospetto lo dichiara; le derivate restano comunque coerenti, perché
// partono da quella. Nessun numero inventato, e nessuna riga che racconta una
// storia diversa da quella delle righe sopra.
//
// LA VOCE DELL’ENTE SI ANCORA AL DATO ACCERTATO (0.239.0).
//
// La contabile è indietro rispetto al tempo presente; l’amministrativa
// fotografa il debito verso l’ente alla data della verifica. Il ponte fra le
// due non è una stima: l’ultimo bilancio dichiara i debiti tributari e
// previdenziali, la verifica amministrativa accerta uno stock, e la differenza
// è — per presunzione dichiarata — il debito cresciuto nel periodo che si
// ricostruisce. Si ripartisce sulle annualità calcolate in proporzione agli
// oneri sociali proiettati, si iscrive nel passivo e l’onere corrispondente va
// nella voce del personale: alla data della verifica la somma delle due voci
// torna esattamente al valore accertato, e il prospetto lo mostra invece di
// lasciarlo dedurre.
//
// Ogni annualità porta la sua etichetta: STORICO è il dato depositato,
// CALCOLATO è quello costruito. Il prospetto non li mescola in silenzio.
//
// Logica pura, con i suoi test.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export interface BilancioArchivio {
  anno: number;
  dati: DatiFinanziariPeriodo;
}

/** Un'annualità con la sua etichetta: depositata o costruita. */
export interface AnnoContabile extends BilancioArchivio {
  tipo: 'STORICO' | 'CALCOLATO';
}

export type NaturaVoce = 'MOTRICE' | 'DERIVATA';

/**
 * Le voci del prospetto, nell'ordine in cui si leggono. `motrice` = ha una
 * serie propria; `derivata` = si calcola dalle motrici, e la formula sta
 * scritta accanto.
 */
export const VOCI_PROIEZIONE: {
  chiave: keyof DatiFinanziariPeriodo;
  etichetta: string;
  natura: NaturaVoce;
  formula: string | null;
}[] = [
  {
    chiave: 'valoreProduzione',
    etichetta: 'Valore della produzione',
    natura: 'MOTRICE',
    formula: null,
  },
  {
    chiave: 'ricaviVendite',
    etichetta: 'Ricavi delle vendite',
    natura: 'DERIVATA',
    formula: 'valore della produzione meno il margine non-ricavi dell’ultimo bilancio',
  },
  {
    chiave: 'costiProduzione',
    etichetta: 'Costi della produzione',
    natura: 'MOTRICE',
    formula: null,
  },
  {
    chiave: 'costiPersonale',
    etichetta: 'Costo del personale',
    natura: 'DERIVATA',
    formula:
      'costo del personale dell’ultimo bilancio, riportato nella proporzione dei costi della produzione, più la quota della voce dell’ente',
  },
  {
    chiave: 'salariStipendi',
    etichetta: 'di cui salari e stipendi',
    natura: 'DERIVATA',
    formula:
      'salari e stipendi dell’ultimo bilancio, riportati nella proporzione dei costi della produzione',
  },
  {
    chiave: 'oneriSociali',
    etichetta: 'di cui oneri sociali e voce dell’ente',
    natura: 'DERIVATA',
    formula:
      'oneri sociali dell’ultimo bilancio, riportati nella proporzione dei costi, più la quota annua della voce dell’ente ricostruita per differenza',
  },
  {
    chiave: 'ebitda',
    etichetta: 'EBITDA',
    natura: 'DERIVATA',
    formula: 'EBIT + ammortamenti, fermi all’ultimo bilancio',
  },
  {
    chiave: 'ebit',
    etichetta: 'EBIT',
    natura: 'DERIVATA',
    formula: 'valore della produzione − costi della produzione',
  },
  { chiave: 'oneriFinanziari', etichetta: 'Oneri finanziari', natura: 'MOTRICE', formula: null },
  {
    chiave: 'utileEsercizio',
    etichetta: 'Risultato d’esercizio',
    natura: 'DERIVATA',
    formula: 'EBIT − oneri finanziari',
  },
  {
    chiave: 'patrimonioNetto',
    etichetta: 'Patrimonio netto',
    natura: 'DERIVATA',
    formula: 'patrimonio netto dell’anno prima + utile dell’esercizio',
  },
  { chiave: 'totaleDebiti', etichetta: 'Totale debiti', natura: 'MOTRICE', formula: null },
  { chiave: 'debitiBanche', etichetta: 'Debiti verso banche', natura: 'MOTRICE', formula: null },
  {
    chiave: 'disponibilitaLiquide',
    etichetta: 'Disponibilità liquide',
    natura: 'DERIVATA',
    formula: 'disponibilità dell’anno prima + utile dell’esercizio',
  },
];

/**
 * Il passo massimo ammesso: oltre, la serie non descrive più un'ipotesi ma
 * un'esplosione. Il limite è dichiarato qui, non nascosto nel calcolo.
 */
export const PASSO_MASSIMO = 3;

export interface PuntoDifferenziale {
  anno: number;
  valore: number;
  /** Valore dell'anno meno valore della base, in euro. */
  scarto: number;
  /** Scarto in punti della base: (anno − base) / |base|. null se la base è 0. */
  differenziale: number | null;
}

export interface ProiezioneVoce {
  anno: number;
  valore: number;
  /** Solo per le motrici: il differenziale applicato. */
  differenziale: number | null;
  /** Solo per le motrici: quanto aggiunge al valore dell'ultimo bilancio. */
  scarto: number | null;
}

export interface VoceSerie {
  chiave: keyof DatiFinanziariPeriodo;
  etichetta: string;
  natura: NaturaVoce;
  /** Come si calcola, per le derivate. null per le motrici. */
  formula: string | null;
  /** Gli anni depositati, con il loro valore (anche null se la voce manca). */
  storico: { anno: number; valore: number | null }[];
  /** Valore dell'anno di base: da qui si contano i differenziali (motrici). */
  valoreBase: number | null;
  /** Valore dell'ultimo bilancio: qui si applicano i differenziali (motrici). */
  valoreUltimo: number | null;
  /** I differenziali degli anni in archivio, dal primo dopo la base (motrici). */
  differenziali: PuntoDifferenziale[];
  /** Ragione geometrica dei differenziali, null se non si ricava (motrici). */
  passo: number | null;
  /** I valori costruiti, anno per anno, dall'ultimo bilancio in poi. */
  proiezioni: ProiezioneVoce[];
  proiettabile: boolean;
  /** Perché la voce non è proiettabile (o il limite applicato). */
  motivo: string | null;
}

export interface ProiezioneContabile {
  /** Gli anni dei bilanci in archivio, in ordine. */
  anniArchivio: number[];
  /** Il più vecchio: quello che non ha un anno precedente a coprirlo. */
  annoBase: number | null;
  /** L'ultimo bilancio depositato: su questo si applicano i differenziali. */
  annoUltimoBilancio: number | null;
  /** L'anno della verifica: dove la serie si ferma. */
  annoVerifica: number;
  /** Gli anni costruiti, in ordine: dall'anno dopo l'ultimo bilancio alla verifica. */
  annualitaCalcolate: number[];
  voci: VoceSerie[];
  /**
   * Gli anni con i dati da usare a valle: quelli d'archivio (tipo STORICO) e
   * quelli costruiti (tipo CALCOLATO), già coerenti fra loro.
   */
  bilanciProiettati: AnnoContabile[];
  /** Le voci motrici tenute ferme per mancanza di serie, con il loro nome. */
  vociTenuteFerme: string[];
  proiettabile: boolean;
  /** Il metodo, in una frase, come compare accanto ai numeri. */
  metodo: string;
  avvertenze: string[];
  /**
   * Il ponte fra il debito dichiarato nell’ultimo bilancio e quello accertato
   * nella verifica amministrativa. null quando non c’è un debito memorizzato:
   * non è un valore a zero, è un dato che manca.
   */
  ponteEnte: PonteEnte | null;
}

/** Il debito verso l’ente accertato nella verifica amministrativa. */
export interface DebitoEnteVerificato {
  totale: number;
  fonte?: string | null;
  /** Quando è stato accertato, per dichiararlo accanto alla cifra. */
  accertatoIl?: string | null;
}

/** Una quota della crescita del debito, iscritta in una annualità calcolata. */
export interface QuotaPonte {
  anno: number;
  quota: number;
}

/**
 * La ricostruzione della voce dell’ente: dal valore dichiarato nell’ultimo
 * bilancio al valore accertato nella verifica amministrativa.
 */
export interface PonteEnte {
  /** Debiti tributari + previdenziali dell’ultimo bilancio depositato. */
  debitoContabileUltimo: number;
  /** Lo stock accertato nella verifica amministrativa. */
  debitoVerificato: number;
  /** Quanto cresce nel periodo ricostruito: verificato − contabile. */
  differenza: number;
  /** La quota iscritta in ciascuna annualità calcolata. */
  quote: QuotaPonte[];
  /** Su quale voce del conto economico è stato iscritto l’onere. */
  voceOnere: 'oneriSociali';
  applicato: boolean;
  motivo: string | null;
  fonte: string | null;
  accertatoIl: string | null;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const arrotonda4 = (n: number) => Math.round(n * 10000) / 10000;
const numero = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;

/**
 * Il passo della serie: radice n-esima del rapporto fra ultimo e primo
 * differenziale.
 *
 * Restituisce null quando la serie non dice niente di utilizzabile — un solo
 * differenziale (biennio), un primo differenziale nullo (nessun rapporto),
 * differenziali di segno opposto (la serie non è geometrica).
 */
export function passoSerie(differenziali: PuntoDifferenziale[]): number | null {
  const validi = differenziali.filter(
    (d) => Number.isFinite(d.differenziale) && d.differenziale !== null && d.differenziale !== 0
  );
  if (validi.length < 2) return null;
  const primo = validi[0];
  const ultimo = validi[validi.length - 1];
  const anni = ultimo.anno - primo.anno;
  if (anni <= 0) return null;
  const rapporto = (ultimo.differenziale as number) / (primo.differenziale as number);
  if (!Number.isFinite(rapporto) || rapporto <= 0) return null;
  const passo = Math.pow(rapporto, 1 / anni);
  return Number.isFinite(passo) ? passo : null;
}

interface SerieMotrice {
  passo: number | null;
  differenziali: PuntoDifferenziale[];
  proiezioni: { anno: number; differenziale: number; scarto: number; valore: number }[];
  motivo: string | null;
}

/**
 * La serie di una voce motrice, calcolata una volta sola: differenziali sulla
 * base, passo geometrico, valori applicati all'ultimo bilancio. Lo stesso
 * conto serve al prospetto e alla scheda dei differenziali.
 */
function serieMotrice(input: {
  bilanci: BilancioArchivio[];
  annoBase: number;
  annualitaCalcolate: number[];
  chiave: keyof DatiFinanziariPeriodo;
}): SerieMotrice {
  const base = input.bilanci[0];
  const ultimo = input.bilanci[input.bilanci.length - 1];
  const valoreBase = numero(base.dati[input.chiave]);
  const valoreUltimo = numero(ultimo.dati[input.chiave]);

  if (valoreBase === null) {
    return {
      passo: null,
      differenziali: [],
      proiezioni: [],
      motivo: `La voce non è valorizzata nel bilancio ${base.anno}: non c’è un punto di partenza.`,
    };
  }

  const differenziali: PuntoDifferenziale[] = [];
  for (const b of input.bilanci.slice(1)) {
    const valore = numero(b.dati[input.chiave]);
    if (valore === null) continue;
    const scarto = valore - valoreBase;
    differenziali.push({
      anno: b.anno,
      valore: arrotonda(valore),
      scarto: arrotonda(scarto),
      differenziale: valoreBase === 0 ? null : arrotonda4(scarto / Math.abs(valoreBase)),
    });
  }

  const passoCalcolato = passoSerie(differenziali);
  let motivo: string | null = null;
  let passo = passoCalcolato;
  if (passo !== null && Math.abs(passo) > PASSO_MASSIMO) {
    motivo = `Il passo ricavato (${arrotonda(passo).toLocaleString('it-IT')}) supera il limite dichiarato di ${PASSO_MASSIMO}: la proiezione usa il limite, non il valore grezzo.`;
    passo = Math.sign(passo) * PASSO_MASSIMO;
  } else if (passo === null) {
    motivo =
      valoreBase === 0
        ? 'La base è zero: il differenziale percentuale non si calcola e la voce resta ferma.'
        : differenziali.length < 2
          ? 'Serve almeno un triennio in archivio per ricavare il passo: con un solo differenziale la serie non si ricava e la voce resta ferma.'
          : 'I differenziali cambiano segno o partono da zero: la serie non è geometrica e non si proietta.';
  } else if (valoreUltimo === null) {
    motivo = `La voce non è valorizzata nel bilancio ${ultimo.anno}: non c’è un valore su cui applicare i differenziali.`;
    passo = null;
  }

  const proiezioni: { anno: number; differenziale: number; scarto: number; valore: number }[] = [];
  const ultimoDifferenziale =
    differenziali.length > 0 ? differenziali[differenziali.length - 1] : null;

  if (passo !== null && ultimoDifferenziale && ultimoDifferenziale.differenziale !== null) {
    for (const [indice, anno] of input.annualitaCalcolate.entries()) {
      const differenziale = arrotonda4(
        (ultimoDifferenziale.differenziale as number) * Math.pow(passo, indice + 1)
      );
      if (differenziale <= -1) {
        motivo = `Il differenziale calcolato per il ${anno} (${Math.round(differenziale * 100)}%) porterebbe il valore a zero o sotto: da lì la voce resta ferma.`;
        passo = null;
        break;
      }
      const valore = arrotonda((valoreUltimo as number) * (1 + differenziale));
      proiezioni.push({
        anno,
        differenziale,
        scarto: arrotonda(valore - (valoreUltimo as number)),
        valore,
      });
    }
  }

  return { passo, differenziali, proiezioni, motivo };
}

/**
 * Ripartisce un importo sulle annualità, con i pesi forniti.
 *
 * L'ultima annualità chiude il conto: la somma delle quote è esattamente il
 * totale, senza residui da arrotondamento. Senza pesi utilizzabili si divide in
 * parti uguali, e lo dichiara il chiamante.
 */
export function distribuisciQuote(anni: number[], totale: number, pesi: number[]): QuotaPonte[] {
  if (anni.length === 0) return [];
  const validi = pesi.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const pesiEffettivi = validi.some((p) => p > 0) ? validi : anni.map(() => 1);
  let resto = arrotonda(totale);
  let sommaPesi = pesiEffettivi.reduce((a, b) => a + b, 0);
  const quote: QuotaPonte[] = [];
  anni.forEach((anno, indice) => {
    const ultima = indice === anni.length - 1;
    const quota = ultima
      ? arrotonda(resto)
      : sommaPesi > 0
        ? arrotonda(resto * (pesiEffettivi[indice] / sommaPesi))
        : 0;
    quote.push({ anno, quota });
    resto = arrotonda(resto - quota);
    sommaPesi = arrotonda(sommaPesi - pesiEffettivi[indice]);
  });
  return quote;
}

/**
 * Il ponte verso la verifica: dal debito dichiarato nell'ultimo bilancio allo
 * stock accertato. La differenza si presume crescita del debito nel periodo
 * ricostruito; si ripartisce come crescono gli oneri sociali proiettati, perché
 * è la contribuzione a generare quel debito.
 */
function componiPonteEnte(input: {
  debitoEnte: DebitoEnteVerificato | null | undefined;
  ultimo: BilancioArchivio;
  annualitaCalcolate: number[];
  costiProiettati: Map<number, number>;
}): PonteEnte | null {
  const debito = input.debitoEnte;
  if (!debito || !Number.isFinite(debito.totale) || debito.totale <= 0) return null;

  const tributari = numero(input.ultimo.dati.debitiTributari) ?? 0;
  const previdenziali = numero(input.ultimo.dati.debitiPrevidenziali) ?? 0;
  const contabile = arrotonda(tributari + previdenziali);
  const verificato = arrotonda(debito.totale);
  const differenza = arrotonda(verificato - contabile);
  const base = {
    debitoContabileUltimo: contabile,
    debitoVerificato: verificato,
    differenza,
    voceOnere: 'oneriSociali' as const,
    fonte: debito.fonte ?? null,
    accertatoIl: debito.accertatoIl ?? null,
  };

  if (input.annualitaCalcolate.length === 0) {
    return {
      ...base,
      quote: [],
      applicato: false,
      motivo:
        'La verifica cade dentro gli anni già in archivio: non c’è nessuna annualità da ricostruire.',
    };
  }
  if (differenza <= 0) {
    return {
      ...base,
      quote: [],
      applicato: false,
      motivo: `Il debito dichiarato nell’ultimo bilancio (${contabile.toLocaleString('it-IT')} €) non è inferiore a quello accertato (${verificato.toLocaleString('it-IT')} €): non c’è una crescita da ricostruire e la voce dell’ente resta quella depositata.`,
    };
  }

  const oneriUltimo = numero(input.ultimo.dati.oneriSociali) ?? 0;
  const costiUltimo = numero(input.ultimo.dati.costiProduzione) ?? 0;
  const pesi = input.annualitaCalcolate.map((anno) => {
    if (oneriUltimo <= 0 || costiUltimo <= 0) return 0;
    const costiAnno = input.costiProiettati.get(anno) ?? costiUltimo;
    return Math.max(0, oneriUltimo * (costiAnno / costiUltimo));
  });

  return {
    ...base,
    quote: distribuisciQuote(input.annualitaCalcolate, differenza, pesi),
    applicato: true,
    motivo: null,
  };
}

/**
 * Compone la proiezione. `bilanci` sono gli anni in archivio (ne basta uno per
 * la base, ne servono tre per una serie); `annoVerifica` è l'anno della data di
 * apertura della verifica contabile; `debitoEnte` è lo stock accertato nella
 * verifica amministrativa, con cui si chiude la voce dell'ente alla data.
 */
export function componiProiezione(input: {
  bilanci: BilancioArchivio[];
  annoVerifica: number;
  debitoEnte?: DebitoEnteVerificato | null;
}): ProiezioneContabile {
  const perAnno = new Map<number, BilancioArchivio>();
  for (const b of input.bilanci) {
    if (!Number.isInteger(b.anno) || !b.dati) continue;
    perAnno.set(b.anno, b);
  }
  const bilanci = Array.from(perAnno.values()).sort((a, b) => a.anno - b.anno);
  const anniArchivio = bilanci.map((b) => b.anno);
  const annoVerifica = Number.isInteger(input.annoVerifica)
    ? input.annoVerifica
    : new Date().getFullYear();
  const avvertenze: string[] = [];

  if (bilanci.length === 0) {
    return {
      anniArchivio: [],
      annoBase: null,
      annoUltimoBilancio: null,
      annoVerifica,
      annualitaCalcolate: [],
      voci: [],
      bilanciProiettati: [],
      vociTenuteFerme: [],
      proiettabile: false,
      metodo:
        'Nessun bilancio XBRL in archivio: non c’è una base da cui contare i differenziali, e la proiezione non si calcola.',
      avvertenze: [
        'Carica i bilanci XBRL nella verifica contabile: senza il dato depositato non c’è nulla da proiettare.',
      ],
      ponteEnte: null,
    };
  }

  const base = bilanci[0];
  const ultimoArchivio = bilanci[bilanci.length - 1];
  const annualitaCalcolate: number[] = [];
  for (let anno = ultimoArchivio.anno + 1; anno <= annoVerifica; anno += 1) {
    annualitaCalcolate.push(anno);
  }

  // LE MOTRICI. Ognuna con la sua serie; chi non ce l'ha resta fermo.
  const motrici = new Map<keyof DatiFinanziariPeriodo, SerieMotrice>();
  for (const voce of VOCI_PROIEZIONE) {
    if (voce.natura !== 'MOTRICE') continue;
    motrici.set(
      voce.chiave,
      serieMotrice({
        bilanci,
        annoBase: base.anno,
        annualitaCalcolate,
        chiave: voce.chiave,
      })
    );
  }

  const vociTenuteFerme: string[] = [];
  for (const voce of VOCI_PROIEZIONE) {
    if (voce.natura !== 'MOTRICE') continue;
    const serie = motrici.get(voce.chiave);
    if (serie && serie.passo === null) vociTenuteFerme.push(voce.etichetta);
  }

  // IL PROSPETTO, ANNO PER ANNO. Le derivate si calcolano dalle motrici di
  // quell'anno e dai valori dell'anno prima: è così che EBIT, EBITDA, utile e
  // patrimonio tornano fra loro.
  const ammortamenti =
    numero(ultimoArchivio.dati.ammortamenti) ?? numero(base.dati.ammortamenti) ?? 0;
  const gapRicavi =
    (numero(ultimoArchivio.dati.valoreProduzione) ?? 0) -
    (numero(ultimoArchivio.dati.ricaviVendite) ?? 0);

  // IL PONTE VERSO LA VERIFICA. I costi proiettati servono prima del giro,
  // perché la crescita della voce dell’ente si ripartisce come crescono gli
  // oneri sociali proiettati: chi genera più contribuzione genera più debito.
  const costiProiettati = new Map<number, number>();
  const serieCosti = motrici.get('costiProduzione');
  for (const anno of annualitaCalcolate) {
    const proiettato = serieCosti?.proiezioni.find((p) => p.anno === anno)?.valore;
    costiProiettati.set(anno, proiettato ?? numero(ultimoArchivio.dati.costiProduzione) ?? 0);
  }
  const ponteEnte = componiPonteEnte({
    debitoEnte: input.debitoEnte,
    ultimo: ultimoArchivio,
    annualitaCalcolate,
    costiProiettati,
  });
  const quotaPonte = new Map<number, number>(
    (ponteEnte?.quote ?? []).map((q) => [q.anno, q.quota])
  );
  const tributariUltimo = numero(ultimoArchivio.dati.debitiTributari) ?? 0;
  const previdenzialiUltimo = numero(ultimoArchivio.dati.debitiPrevidenziali) ?? 0;
  const debitoEnteUltimo = tributariUltimo + previdenzialiUltimo;

  const valoriPerAnno = new Map<number, Partial<DatiFinanziariPeriodo>>();
  const derivateMotivo = new Map<keyof DatiFinanziariPeriodo, string | null>();

  let precedente: DatiFinanziariPeriodo = ultimoArchivio.dati;
  // La quota dell’ente si somma anno per anno al passivo: il totale dei debiti
  // porta la crescita ACCUMULATA, non solo la rata dell’anno.
  let quotaAccumulata = 0;
  for (const anno of annualitaCalcolate) {
    const valoreMotrice = (chiave: keyof DatiFinanziariPeriodo): number | null => {
      const serie = motrici.get(chiave);
      const proiettata = serie?.proiezioni.find((p) => p.anno === anno)?.valore ?? null;
      if (proiettata !== null) return proiettata;
      // Ferma all'ultimo dato dell'anno prima (che, al primo giro, è l'ultimo
      // bilancio depositato).
      return numero(precedente[chiave]);
    };

    const valoreProduzione = valoreMotrice('valoreProduzione');
    const costiProduzioneMotrice = valoreMotrice('costiProduzione');
    const oneriFinanziari = valoreMotrice('oneriFinanziari');
    const totaleDebitiMotrice = valoreMotrice('totaleDebiti');
    const debitiBancheMotrice = valoreMotrice('debitiBanche');

    // La quota della voce dell’ente entra nei costi e nel passivo: è la stessa
    // cifra, letta dai due lati del prospetto, e alla data della verifica la
    // somma torna esattamente allo stock accertato.
    const quotaAnno = quotaPonte.get(anno) ?? 0;
    quotaAccumulata = arrotonda(quotaAccumulata + quotaAnno);
    const costiProduzione =
      costiProduzioneMotrice === null ? null : arrotonda(costiProduzioneMotrice + quotaAnno);
    const totaleDebiti =
      totaleDebitiMotrice === null ? null : arrotonda(totaleDebitiMotrice + quotaAccumulata);

    const ricaviVendite =
      valoreProduzione === null ? null : arrotonda(valoreProduzione - gapRicavi);
    const ebit =
      valoreProduzione === null || costiProduzione === null
        ? null
        : arrotonda(valoreProduzione - costiProduzione);

    // IL PERSONALE. Salari e stipendi seguono i costi della produzione nella
    // stessa proporzione dell’ultimo bilancio; gli oneri sociali ricevono in
    // più la quota annua della voce dell’ente. Il totale è la somma delle due,
    // così la scomposizione non contraddice il totale che sta sopra.
    const costiUltimo = numero(ultimoArchivio.dati.costiProduzione) ?? 0;
    const rapportoPersonale =
      costiUltimo > 0 && costiProduzioneMotrice !== null ? costiProduzioneMotrice / costiUltimo : 1;
    const salariUltimo = numero(ultimoArchivio.dati.salariStipendi);
    const oneriUltimo = numero(ultimoArchivio.dati.oneriSociali);
    const salariStipendi =
      salariUltimo === null ? null : arrotonda(salariUltimo * rapportoPersonale);
    const oneriSociali =
      oneriUltimo === null ? null : arrotonda(oneriUltimo * rapportoPersonale + quotaAnno);
    const personaleUltimo = numero(ultimoArchivio.dati.costiPersonale);
    const costiPersonale =
      personaleUltimo !== null
        ? arrotonda(personaleUltimo * rapportoPersonale + quotaAnno)
        : salariStipendi === null || oneriSociali === null
          ? null
          : arrotonda(salariStipendi + oneriSociali);
    const ebitda = ebit === null ? null : arrotonda(ebit + ammortamenti);
    const utileEsercizio =
      ebit === null || oneriFinanziari === null ? null : arrotonda(ebit - oneriFinanziari);

    const patrimonioPrecedente = numero(precedente.patrimonioNetto);
    const patrimonioNetto =
      patrimonioPrecedente === null || utileEsercizio === null
        ? null
        : arrotonda(patrimonioPrecedente + utileEsercizio);

    const cassaPrecedente = numero(precedente.disponibilitaLiquide);
    const disponibilitaLiquide =
      cassaPrecedente === null || utileEsercizio === null
        ? null
        : arrotonda(cassaPrecedente + utileEsercizio);

    // I debiti verso banche non possono superare il totale dei debiti: se le
    // due serie divergono, il prospetto taglia e lo dichiara.
    const debitiBanche =
      debitiBancheMotrice !== null && totaleDebiti !== null
        ? arrotonda(Math.min(debitiBancheMotrice, totaleDebiti))
        : debitiBancheMotrice;

    derivateMotivo.set(
      'ricaviVendite',
      ricaviVendite === null ? 'Manca il valore della produzione da cui derivare i ricavi.' : null
    );
    derivateMotivo.set(
      'ebit',
      ebit === null ? 'Mancano valore della produzione o costi della produzione.' : null
    );
    derivateMotivo.set(
      'ebitda',
      ebitda === null ? 'Manca l’EBIT da cui sommare gli ammortamenti.' : null
    );
    derivateMotivo.set(
      'utileEsercizio',
      utileEsercizio === null ? 'Mancano EBIT o oneri finanziari.' : null
    );
    derivateMotivo.set(
      'patrimonioNetto',
      patrimonioNetto === null ? 'Manca il patrimonio netto dell’anno prima o l’utile.' : null
    );
    derivateMotivo.set(
      'disponibilitaLiquide',
      disponibilitaLiquide === null
        ? 'Manca la disponibilità liquida dell’anno prima o l’utile.'
        : null
    );
    derivateMotivo.set(
      'salariStipendi',
      salariStipendi === null ? 'Il bilancio non espone salari e stipendi (B.9.a).' : null
    );
    derivateMotivo.set(
      'oneriSociali',
      oneriSociali === null ? 'Il bilancio non espone oneri sociali (B.9.b).' : null
    );
    derivateMotivo.set(
      'costiPersonale',
      costiPersonale === null ? 'Il bilancio non espone il costo del personale (B.9).' : null
    );

    const datiAnno: Partial<DatiFinanziariPeriodo> = {
      valoreProduzione: valoreProduzione ?? numero(precedente.valoreProduzione) ?? undefined,
      ricaviVendite: ricaviVendite ?? numero(precedente.ricaviVendite) ?? undefined,
      costiProduzione: costiProduzione ?? numero(precedente.costiProduzione) ?? undefined,
      ammortamenti,
      ebitda: ebitda ?? numero(precedente.ebitda) ?? undefined,
      ebit: ebit ?? numero(precedente.ebit) ?? undefined,
      oneriFinanziari: oneriFinanziari ?? numero(precedente.oneriFinanziari) ?? undefined,
      utileEsercizio: utileEsercizio ?? numero(precedente.utileEsercizio) ?? undefined,
      patrimonioNetto: patrimonioNetto ?? numero(precedente.patrimonioNetto) ?? undefined,
      totaleDebiti: totaleDebiti ?? numero(precedente.totaleDebiti) ?? undefined,
      debitiBanche: debitiBanche ?? numero(precedente.debitiBanche) ?? undefined,
      disponibilitaLiquide:
        disponibilitaLiquide ?? numero(precedente.disponibilitaLiquide) ?? undefined,
    };
    if (salariStipendi !== null) datiAnno.salariStipendi = salariStipendi;
    if (oneriSociali !== null) datiAnno.oneriSociali = oneriSociali;
    if (costiPersonale !== null) datiAnno.costiPersonale = costiPersonale;
    if (quotaAnno > 0) {
      const quotaTributari =
        debitoEnteUltimo > 0 ? arrotonda(quotaAnno * (tributariUltimo / debitoEnteUltimo)) : 0;
      datiAnno.debitiTributari = arrotonda(
        (numero(precedente.debitiTributari) ?? 0) + quotaTributari
      );
      datiAnno.debitiPrevidenziali = arrotonda(
        (numero(precedente.debitiPrevidenziali) ?? 0) + (quotaAnno - quotaTributari)
      );
    }
    valoriPerAnno.set(anno, datiAnno);
    precedente = { ...precedente, ...datiAnno };
  }

  // Le annualità, con la loro etichetta: gli anni d'archivio sono STORICO, gli
  // anni costruiti sono CALCOLATO. Nessuna colonna senza nome.
  const bilanciProiettati: AnnoContabile[] = bilanci.map((b) => ({ ...b, tipo: 'STORICO' }));
  for (const anno of annualitaCalcolate) {
    const parziale = valoriPerAnno.get(anno) ?? {};
    const precedenteAnno =
      bilanciProiettati[bilanciProiettati.length - 1]?.dati ?? ultimoArchivio.dati;
    bilanciProiettati.push({ anno, dati: { ...precedenteAnno, ...parziale }, tipo: 'CALCOLATO' });
  }

  const voci: VoceSerie[] = VOCI_PROIEZIONE.map((voce) => {
    const storico = bilanci.map((b) => ({ anno: b.anno, valore: numero(b.dati[voce.chiave]) }));
    if (voce.natura === 'MOTRICE') {
      const serie = motrici.get(voce.chiave)!;
      return {
        chiave: voce.chiave,
        etichetta: voce.etichetta,
        natura: voce.natura,
        formula: null,
        storico,
        valoreBase: numero(base.dati[voce.chiave]),
        valoreUltimo: numero(ultimoArchivio.dati[voce.chiave]),
        differenziali: serie.differenziali,
        passo: serie.passo === null ? null : arrotonda4(serie.passo),
        proiezioni: serie.proiezioni.map((p) => ({
          anno: p.anno,
          valore: p.valore,
          differenziale: p.differenziale,
          scarto: p.scarto,
        })),
        proiettabile: serie.passo !== null && serie.proiezioni.length === annualitaCalcolate.length,
        motivo: serie.motivo,
      };
    }
    const proiezioni = annualitaCalcolate.map((anno) => {
      const valore = numero(valoriPerAnno.get(anno)?.[voce.chiave]);
      return {
        anno,
        valore: valore ?? 0,
        differenziale: null,
        scarto: null,
      };
    });
    return {
      chiave: voce.chiave,
      etichetta: voce.etichetta,
      natura: voce.natura,
      formula: voce.formula,
      storico,
      valoreBase: null,
      valoreUltimo: null,
      differenziali: [],
      passo: null,
      proiezioni,
      proiettabile: annualitaCalcolate.every((anno) =>
        Number.isFinite(numero(valoriPerAnno.get(anno)?.[voce.chiave]))
      ),
      motivo: derivateMotivo.get(voce.chiave) ?? null,
    };
  });

  const motriciProiettabili = Array.from(motrici.values()).filter((m) => m.passo !== null);
  const proiettabile = motriciProiettabili.length > 0 && annualitaCalcolate.length > 0;

  avvertenze.push(
    `La base è il ${base.anno}: il più vecchio in archivio, quello che nessun file porta con sé come anno precedente.`
  );
  avvertenze.push(
    `I differenziali sono contati sul ${base.anno} in punti della base, e applicati ai valori del ${ultimoArchivio.anno}: la serie parte dalla base, il futuro parte dall’ultimo bilancio utile.`
  );
  avvertenze.push(
    'Solo valore della produzione, costi della produzione, oneri finanziari e debiti hanno una serie propria. EBIT, EBITDA, utile, patrimonio netto, ricavi e liquidità si ricavano da quelli con le identità del prospetto: un EBIT che cresce per conto suo mentre i costi corrono non è un’ipotesi, è un errore di lettura.'
  );
  if (annualitaCalcolate.length === 0) {
    avvertenze.push(
      `La verifica è datata ${annoVerifica}, dentro gli anni già in archivio: non c’è nessuna annualità da costruire.`
    );
  } else if (!proiettabile) {
    avvertenze.push(
      `Nessuna voce motrice ha una serie utilizzabile: la proiezione si ferma al ${ultimoArchivio.anno}.`
    );
  }
  if (vociTenuteFerme.length > 0 && annualitaCalcolate.length > 0) {
    avvertenze.push(
      `Voci motrici tenute ferme all’ultimo dato (serie non ricavabile): ${vociTenuteFerme.join(', ')}. Non sono proiettate, e il prospetto lo dichiara invece di stimarle.`
    );
  }
  avvertenze.push(
    'Le annualità calcolate sono un’ipotesi dichiarata — la stessa ragione geometrica dei differenziali — non una previsione: note integrative e studi di settore servono a discuterle, non a sostituirle.'
  );
  const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
  if (ponteEnte?.applicato) {
    avvertenze.push(
      `Voce dell’ente: il bilancio ${ultimoArchivio.anno} dichiara ${euro(ponteEnte.debitoContabileUltimo)} fra debiti tributari e previdenziali; la verifica amministrativa ne accerta ${euro(ponteEnte.debitoVerificato)}. La differenza di ${euro(ponteEnte.differenza)} è, per presunzione dichiarata, il debito cresciuto nel periodo ricostruito: si iscrive in ${ponteEnte.quote.length} ${ponteEnte.quote.length === 1 ? 'annualità' : 'annualità'} e l’onere va negli oneri sociali, così la voce del personale e il passivo raccontano la stessa cifra.`
    );
  } else if (ponteEnte?.motivo) {
    avvertenze.push(`Voce dell’ente non ricostruita: ${ponteEnte.motivo}`);
  } else if (annualitaCalcolate.length > 0) {
    avvertenze.push(
      'Nessun debito dell’ente memorizzato: la verifica amministrativa non è ancora chiusa, quindi la voce dell’ente resta quella depositata. Chiudendola, il ponte si calcola da sé.'
    );
  }

  const metodo =
    annualitaCalcolate.length > 0
      ? `Base ${base.anno}: differenziali di ogni anno dalla base, ragione geometrica fra primo e ultimo differenziale, applicata ai valori del ${ultimoArchivio.anno} fino al ${annoVerifica} (anno della verifica). Le voci derivate seguono il prospetto${
          ponteEnte?.applicato
            ? ', e la voce dell’ente chiude sullo stock accertato nella verifica amministrativa'
            : ''
        }.`
      : `Base ${base.anno}: gli anni in archivio arrivano già al ${ultimoArchivio.anno}, anno della verifica.`;

  return {
    anniArchivio,
    annoBase: base.anno,
    annoUltimoBilancio: ultimoArchivio.anno,
    annoVerifica,
    annualitaCalcolate,
    voci,
    bilanciProiettati,
    vociTenuteFerme,
    proiettabile,
    metodo,
    avvertenze,
    ponteEnte,
  };
}
