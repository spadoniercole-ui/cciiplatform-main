// src/lib/piano/ricercaPiano.ts
//
// LA RICERCA DEL PIANO (0.256.42).
//
// L'analisi non indovina il piano in un colpo solo: scrive il punto di partenza
// — le ipotesi con la loro motivazione, le leve, il lancio — e il motore, che è
// deterministico, gira le manopole finché il piano sta in piedi: rate coperte,
// cassa non negativa, patrimonio che non si erode. Ogni mossa lascia una
// traccia: che cosa è stato girato, da che valore a che valore e quale vincolo
// stava chiudendo. È quella traccia che il pannello mostra accanto ai parametri,
// perché chi firma il piano deve poter vedere che cosa è stato cambiato.
//
// Perché è una ricerca e non una proposta: un piano che ripete l'ultimo
// bilancio per tutti gli anni non è prudente, è un'azienda ferma. Per questo,
// senza un vincolo documentato che lo imponga, i ricavi non possono restare
// fermi: la ricerca li alza fin dove la variazione ammessa dallo spazio lo
// consente, e se non basta lo dice invece di gonfiarli.
//
// Le manopole che il motore può girare sono sei, tutte già visibili nel
// pannello: la variazione annua dei ricavi, la variazione annua dei costi, e le
// leve di personale, tecnologia, produzione, mercati e clientela. Nessun'altra
// riga si tocca. Se l'operatore ha già scelto le leve, la ricerca non le
// cambia: lavora solo su ricavi e costi.
//
// Il passo non è fisso (0.256.46): a ogni mossa il motore misura il ritorno del
// primo scatto di ogni manopola, sceglie quella che rende di più per unità di
// percorso speso, allunga il passo su quella finché il rendimento tiene, e
// rifinisce l'ultimo scatto fra quello che non chiude e quello che chiude.
// Così il piano si raggiunge in poche mosse e i ricavi non salgono più del
// necessario.
//
// Logica pura e deterministica: stesse entrate, stesso piano. Nessuna chiamata
// all'AI, nessun numero casuale, un tetto di tentativi dichiarato.

import { calcolaPianoConLeve } from './levePiano';
import { LEVE, leveValide, type IdLeva, type LeveSimulazione } from './leveSimulazione';
import {
  type EsercizioStorico,
  type EsitoPiano,
  type Ipotesi,
  type IpotesiPiano,
  type RatePiano,
} from './piano';

/** Una manopola girata dalla ricerca, con il perché. */
export interface PassoRicerca {
  /** La manopola, con il nome che ha nel pannello. */
  manopola: string;
  da: string;
  a: string;
  /** Il vincolo che la mossa stava chiudendo. */
  perche: string;
}

/** La ricerca come si salva con la variante e si rilegge nel pannello. */
export interface RicercaSalvata {
  passi: PassoRicerca[];
  /** Quanti piani il motore ha calcolato, punto di partenza compreso. */
  tentativi: number;
  /** I vincoli che restano aperti: il piano non li chiude con queste manopole. */
  aperti: string[];
  soddisfatto: boolean;
  /** true quando un vincolo documentato permette ai ricavi di restare fermi. */
  ricaviFermiConsentiti: boolean;
  ricavi: { primo: number; ultimo: number } | null;
}

export interface ParametriRicerca {
  storico: EsercizioStorico;
  orizzonte: number;
  rate: RatePiano;
  capitaleSociale?: number | null;
  /** Il punto di partenza: le ipotesi scritte dall'analisi (senza le leve). */
  ipotesiIniziali: IpotesiPiano;
  /** Le leve dell'analisi o dell'operatore. */
  leveIniziali?: LeveSimulazione | null;
  /** Il tetto dello spazio alla variazione di una manopola (%). */
  variazioneMassimaPct: number;
  /**
   * I vincoli documentati (contabilità, procedure, note integrative). Quando ce
   * n'è almeno uno, i ricavi possono restare fermi: è il documento a imporlo.
   */
  vincoliDocumentati?: string[];
  /** true quando le leve le ha già scelte l'operatore: la ricerca non le tocca. */
  leveBloccate?: boolean;
  /**
   * true quando ricavi e costi sono quelli del piano dell'azienda rettificato
   * (Ricevente): la ricerca non riscrive quel percorso e agisce sulle leve.
   */
  percorsoFisso?: boolean;
}

export interface EsitoRicerca {
  /** Le ipotesi che producono il piano trovato (senza l'effetto delle leve). */
  ipotesi: IpotesiPiano;
  leve: LeveSimulazione;
  esito: EsitoPiano;
  passi: PassoRicerca[];
  aperti: string[];
  tentativi: number;
  soddisfatto: boolean;
  ricavi: { primo: number; ultimo: number };
  ricaviFermiConsentiti: boolean;
}

/** Di quanto si muove una manopola a ogni tentativo. */
const PASSO = {
  /** Punti percentuali aggiunti alla variazione annua dei ricavi. */
  crescita: 2,
  /** Punti percentuali tolti alla variazione annua dei costi. */
  costi: 1,
  /** Punti di misura di una leva, quando si accende o si rinforza. */
  levaRicavi: 5,
};

/** Fin dove la ricerca può spingersi: oltre, il piano non è più credibile. */
const LIMITE = {
  /** Punti massimi aggiunti alla crescita annua dei ricavi. */
  crescita: 12,
  /** Punti massimi tolti alla crescita annua dei costi. */
  costi: 8,
  /** Misura massima della leva del personale. */
  personale: 25,
  /** Misura massima di una leva sui ricavi. */
  ricavi: 35,
  /** Piani calcolati al massimo: una ricerca dichiarata e finita. */
  tentativi: 120,
  /**
   * Mosse: ogni mossa è una manopola sola, allungata quanto serve. La ricerca
   * non torna più a girare tutte le manopole di uno scatto per giro.
   */
  mosse: 12,
};

/** Quanti scatti di base può valere una mossa allungata, prima del tetto. */
const SCATTI_MASSIMI = 10;

/**
 * Quanto deve rendere lo scatto successivo, rispetto al primo, perché il passo
 * si allunghi ancora. Sotto questa soglia il rendimento è calato: meglio
 * ridare la parola alle altre manopole che insistere su questa.
 */
const RESA_MINIMA_ESTENSIONE = 0.5;

const r2 = (n: number) => Math.round(n * 100) / 100;

const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}%`;

interface Regolazione {
  /** Punti percentuali aggiunti alla variazione annua dei ricavi. */
  crescita: number;
  /** Punti percentuali aggiunti alla variazione annua dei costi (negativi = taglio). */
  costi: number;
  leve: LeveSimulazione;
}

/**
 * Il percorso di una riga come variazione annua: una percentuale per anno, a
 * partire dal valore storico. Un'ipotesi in valore assoluto diventa la
 * variazione che quel valore implica, così la manopola che si legge nel
 * pannello e quella che la ricerca gira sono la stessa cosa.
 */
function variazioniAnnue(
  base: number,
  celle: (Ipotesi | null)[] | undefined,
  orizzonte: number
): number[] {
  const out: number[] = [];
  let prev = base;
  for (let i = 0; i < orizzonte; i++) {
    const cella = celle?.[i] ?? null;
    if (!cella) {
      out.push(0);
      continue;
    }
    if (cella.tipo === 'pct') {
      out.push(cella.valore);
      prev = prev * (1 + cella.valore / 100);
    } else {
      out.push(prev > 0 ? ((cella.valore - prev) / prev) * 100 : 0);
      prev = cella.valore;
    }
  }
  return out;
}

/** La riga con i punti aggiunti dalla ricerca, entro il tetto dello spazio. */
function rigaSpinta(
  riga: 'ricaviVendite' | 'costiOperativi',
  iniziali: IpotesiPiano,
  base: number,
  orizzonte: number,
  punti: number,
  massimo: number,
  nota: string | null
): (Ipotesi | null)[] {
  const variazioni = variazioniAnnue(base, iniziali[riga], orizzonte);
  return variazioni.map((v, i) => {
    const originaria = iniziali[riga]?.[i]?.motivazione?.trim();
    const motivazione = [originaria, nota].filter(Boolean).join(' — ');
    return {
      tipo: 'pct' as const,
      valore: r2(Math.max(-massimo, Math.min(massimo, v + punti))),
      ...(motivazione ? { motivazione } : {}),
    };
  });
}

/** Le ipotesi che la regolazione produce: solo ricavi e costi si muovono. */
function ipotesiDaRegolazione(input: ParametriRicerca, reg: Regolazione): IpotesiPiano {
  const orizzonte = Math.max(1, Math.round(input.orizzonte));
  const massimo = Math.max(1, input.variazioneMassimaPct);
  if (reg.crescita === 0 && reg.costi === 0) return input.ipotesiIniziali;
  const notaRicavi =
    reg.crescita === 0
      ? null
      : `ricerca del motore: ${pct(reg.crescita)} sulla variazione annua dei ricavi`;
  const notaCosti =
    reg.costi === 0
      ? null
      : `ricerca del motore: ${pct(reg.costi)} sulla variazione annua dei costi`;
  return {
    ...input.ipotesiIniziali,
    ricaviVendite: rigaSpinta(
      'ricaviVendite',
      input.ipotesiIniziali,
      input.storico.ricaviVendite,
      orizzonte,
      reg.crescita,
      massimo,
      notaRicavi
    ),
    costiOperativi: rigaSpinta(
      'costiOperativi',
      input.ipotesiIniziali,
      Math.max(0, input.storico.costiProduzione - input.storico.ammortamenti),
      orizzonte,
      reg.costi,
      massimo,
      notaCosti
    ),
  };
}

interface Valutazione {
  reg: Regolazione;
  ipotesi: IpotesiPiano;
  esito: EsitoPiano;
  /** Vincoli aperti, compreso quello di forma sui ricavi fermi. */
  vincoli: string[];
  /**
   * Quanto manca per chiudere i vincoli, da 0 (tutto chiuso) in su. Non è il
   * numero dei vincoli: un anno coperto al 40% e uno al 95% sono due vincoli,
   * ma il secondo è quasi chiuso, e la ricerca deve poterlo migliorare.
   */
  mancanza: number;
  /** Quanto la regolazione si è allontanata dal punto di partenza. */
  deviazione: number;
}

/**
 * Quanto ciascun vincolo è lontano dall'essere chiuso, in frazione di ciò che
 * gli manca: la copertura che non arriva a 1, la cassa che va sotto zero, il
 * patrimonio che si erode, la perdita d'esercizio. Tutto rapportato ai ricavi
 * dell'anno, così un'azienda grande e una piccola si misurano allo stesso modo.
 */
function mancanzaDa(esito: EsitoPiano): number {
  let m = 0;
  for (const v of esito.vincoli) {
    const anno = esito.anni.find((a) => a.anno === v.anno);
    if (!anno) {
      m += 0.5;
      continue;
    }
    const scala = Math.max(1, Math.abs(anno.ricaviVendite));
    switch (v.codice) {
      case 'RATE_NON_COPERTE':
        m += Math.min(1, Math.max(0, 1 - (anno.coperturaRate ?? 0)));
        break;
      case 'CASSA_NEGATIVA':
        m += Math.min(1, Math.abs(Math.min(0, anno.disponibilitaLiquide)) / scala);
        break;
      case 'PATRIMONIO_NEGATIVO':
        m += Math.min(
          1,
          Math.abs(Math.min(0, anno.patrimonioNetto)) / Math.max(1, anno.totaleAttivo)
        );
        break;
      case 'PERDITA':
        m += Math.min(1, Math.abs(Math.min(0, anno.utile)) / scala);
        break;
    }
  }
  return Math.round(m * 1000) / 1000;
}

function deviazione(a: Regolazione, b: Regolazione): number {
  let d = Math.abs(a.crescita - b.crescita) + Math.abs(a.costi - b.costi);
  for (const l of LEVE) {
    if (a.leve[l.id].attiva !== b.leve[l.id].attiva) d += 1;
    d += Math.abs(a.leve[l.id].misura - b.leve[l.id].misura) / 20;
  }
  return r2(d);
}

function valuta(
  input: ParametriRicerca,
  reg: Regolazione,
  ricaviFermiConsentiti: boolean,
  leveIniziali: LeveSimulazione
): Valutazione {
  const orizzonte = Math.max(1, Math.round(input.orizzonte));
  const ipotesi = ipotesiDaRegolazione(input, reg);
  const { esito } = calcolaPianoConLeve({
    storico: input.storico,
    orizzonte,
    ipotesi,
    leve: reg.leve,
    rate: input.rate,
    capitaleSociale: input.capitaleSociale ?? null,
  });
  const vincoli = esito.vincoli.map((v) => v.testo);
  let mancanza = mancanzaDa(esito);
  // Il piano ripete l'ultimo bilancio? Allora non è un piano, a meno che un
  // vincolo documentato non lo imponga: è la regola che l'analisi non può
  // aggirare scrivendo zero su tutte le righe.
  const storicoRicavi = input.storico.ricaviVendite;
  const ultimo = esito.anni[esito.anni.length - 1]?.ricaviVendite ?? 0;
  const fermo = storicoRicavi > 0 && (Math.abs(ultimo - storicoRicavi) / storicoRicavi) * 100 < 0.5;
  if (fermo && !ricaviFermiConsentiti) {
    vincoli.push(
      'I ricavi ripetono l’ultimo bilancio per tutti gli anni e nessun vincolo documentato lo giustifica.'
    );
    mancanza += 0.5;
  }
  return {
    reg,
    ipotesi,
    esito,
    vincoli,
    mancanza: Math.round(mancanza * 1000) / 1000,
    deviazione: deviazione(reg, { crescita: 0, costi: 0, leve: leveIniziali }),
  };
}

/**
 * Una mossa si prende solo se migliora davvero: un guadagno invisibile non
 * giustifica un passo in più da raccontare a chi legge il piano.
 */
const MIGLIORAMENTO_MINIMO = 0.005;

interface Mossa {
  reg: Regolazione;
  passo: Omit<PassoRicerca, 'perche'>;
}

type Manopola = 'crescita' | 'costi' | IdLeva;

/**
 * L'ordine in cui la ricerca prova le manopole: prima la crescita dei ricavi,
 * che è la leva del piano, poi i costi, poi il personale e per ultima la
 * tecnologia (che nei primi anni non produce cassa).
 */
const ORDINE_MANOPOLE: Manopola[] = [
  'crescita',
  'costi',
  'PERSONALE',
  'TECNOLOGIA',
  'PRODUZIONE',
  'MERCATI',
  'CLIENTELA',
];

/** Una manopola con la regolazione da cui parte e i tetti che lo spazio le impone. */
interface StatoManopola {
  reg: Regolazione;
  manopola: Manopola;
  pctRicavi0: number;
  pctCosti0: number;
  tettoCrescita: number;
  minimoCosti: number;
  leveBloccate: boolean;
}

/**
 * La mossa di una manopola di `k` scatti: la crescita si ferma al punto che
 * serve invece di andare al tetto appena i vincoli si stringono.
 */
function mossaManopola(
  input: StatoManopola,
  /** Quanti scatti di base vale la mossa: 1 è il passo piccolo. */
  k: number
): Mossa | null {
  const { reg, manopola } = input;
  if (!(k >= 1)) return null;
  if (manopola === 'crescita') {
    const p = r2(reg.crescita + PASSO.crescita * k);
    if (p > input.tettoCrescita) return null;
    return {
      reg: { ...reg, crescita: p },
      passo: {
        manopola: 'Crescita dei ricavi in ogni anno',
        da: pct(input.pctRicavi0 + reg.crescita),
        a: pct(input.pctRicavi0 + p),
      },
    };
  }
  if (manopola === 'costi') {
    const c = r2(reg.costi - PASSO.costi * k);
    if (c < input.minimoCosti) return null;
    return {
      reg: { ...reg, costi: c },
      passo: {
        manopola: 'Variazione dei costi in ogni anno',
        da: pct(input.pctCosti0 + reg.costi),
        a: pct(input.pctCosti0 + c),
      },
    };
  }
  if (input.leveBloccate) return null;
  const definizione = LEVE.find((l) => l.id === manopola);
  if (!definizione) return null;
  const scelta = reg.leve[definizione.id];
  if (manopola === 'TECNOLOGIA') {
    // La tecnologia non porta cassa nei primi anni: se il piano non sta in
    // piedi, il motore la spegne invece di alzare i ricavi. Spegnerla è una
    // mossa sola: non c'è un passo da allungare.
    if (k !== 1 || !scelta.attiva) return null;
    return {
      reg: { ...reg, leve: { ...reg.leve, TECNOLOGIA: { ...scelta, attiva: false } } },
      passo: { manopola: definizione.domanda, da: `${pct(scelta.misura)} dei ricavi`, a: 'spenta' },
    };
  }
  const massimo = manopola === 'PERSONALE' ? LIMITE.personale : LIMITE.ricavi;
  const misura = r2((scelta.attiva ? scelta.misura : 0) + PASSO.levaRicavi * k);
  if (misura > massimo) return null;
  return {
    reg: { ...reg, leve: { ...reg.leve, [definizione.id]: { attiva: true, misura } } },
    passo: {
      manopola: definizione.domanda,
      da: scelta.attiva ? pct(scelta.misura) : 'spenta',
      a: pct(misura),
    },
  };
}

/**
 * Quanti scatti di base può ancora fare una manopola prima del suo tetto. Si
 * calcola costruendo le mosse, non valutando piani: nessun tentativo speso.
 */
function scattiMassimi(input: StatoManopola): number {
  let scatti = 0;
  for (let k = 1; k <= SCATTI_MASSIMI; k++) {
    if (!mossaManopola(input, k)) break;
    scatti = k;
  }
  return scatti;
}

/**
 * La ricerca: dal punto di partenza dell'analisi, una manopola alla volta, fino
 * a quando il piano non ha più vincoli aperti o non c'è più una mossa che
 * migliora. Se i vincoli restano, li restituisce: un piano che non arriva lo
 * deve dire, non nasconderlo dietro un numero più alto.
 */
export function cercaPiano(input: ParametriRicerca): EsitoRicerca {
  const orizzonte = Math.max(1, Math.round(input.orizzonte));
  const vincoliDocumentati = (input.vincoliDocumentati ?? []).filter(
    (v) => typeof v === 'string' && v.trim().length > 0
  );
  const ricaviFermiConsentiti = vincoliDocumentati.length > 0;
  const leveIniziali = leveValide(input.leveIniziali);
  const iniziale: Regolazione = { crescita: 0, costi: 0, leve: leveIniziali };

  const pctRicavi = variazioniAnnue(
    input.storico.ricaviVendite,
    input.ipotesiIniziali.ricaviVendite,
    orizzonte
  );
  const pctCosti = variazioniAnnue(
    Math.max(0, input.storico.costiProduzione - input.storico.ammortamenti),
    input.ipotesiIniziali.costiOperativi,
    orizzonte
  );
  const massimo = Math.max(1, input.variazioneMassimaPct);
  const percorsoFisso = input.percorsoFisso === true;
  const tettoCrescita = percorsoFisso
    ? 0
    : Math.max(0, Math.min(LIMITE.crescita, massimo - Math.max(...pctRicavi, 0)));
  const minimoCosti = percorsoFisso ? 0 : -Math.max(0, Math.min(LIMITE.costi, massimo));

  let corrente = valuta(input, iniziale, ricaviFermiConsentiti, leveIniziali);
  const passi: PassoRicerca[] = [];
  let tentativi = 1;

  /** Il contesto di una manopola: la regolazione corrente e i tetti dello spazio. */
  const manopola = (m: Manopola): StatoManopola => ({
    reg: corrente.reg,
    manopola: m,
    pctRicavi0: pctRicavi[0] ?? 0,
    pctCosti0: pctCosti[0] ?? 0,
    tettoCrescita,
    minimoCosti,
    leveBloccate: input.leveBloccate === true,
  });

  /** La mossa di una manopola con k scatti, calcolata e valutata: un tentativo. */
  const prova = (m: Manopola, k: number) => {
    if (LIMITE.tentativi - tentativi <= 0) return null;
    const mossa = mossaManopola(manopola(m), k);
    if (!mossa) return null;
    const dopo = valuta(input, mossa.reg, ricaviFermiConsentiti, leveIniziali);
    tentativi += 1;
    return { mossa, dopo };
  };

  /** Il ritorno di un passo: guadagno sui vincoli per percorso speso; null se non si vede. */
  const resaDi = (prima: Valutazione, dopo: Valutazione): number | null => {
    const guadagno = r2(prima.mancanza - dopo.mancanza);
    if (guadagno < MIGLIORAMENTO_MINIMO) return null;
    return guadagno / (1 + Math.max(0.01, dopo.deviazione - prima.deviazione));
  };

  /**
   * La manopola che rende di più: al primo scatto o, se nessuna si muove per un
   * guadagno visibile, allo scatto più ampio che il suo tetto consente — così
   * una leva che rende solo da grande non si perde.
   */
  const migliore = (ampi: boolean) => {
    let scelta: {
      m: Manopola;
      k: number;
      p: { mossa: Mossa; dopo: Valutazione };
      resa: number;
    } | null = null;
    for (const m of ORDINE_MANOPOLE) {
      const k = ampi ? scattiMassimi(manopola(m)) : 1;
      if (ampi && k < 2) continue;
      const p = prova(m, k);
      if (!p) continue;
      const resa = resaDi(corrente, p.dopo);
      if (resa === null) continue;
      if (!scelta || resa > scelta.resa + 1e-9) scelta = { m, k, p, resa };
    }
    return scelta;
  };

  for (let mosse = 0; mosse < LIMITE.mosse && corrente.mancanza > 0; mosse++) {
    // 1. LA MANOPOLA CHE RENDE DI PIÙ. Si guarda il ritorno per unità di percorso
    //    speso: una leva che chiude con poco non deve perdere contro una crescita
    //    che chiude di più ma allontana il piano dal punto di partenza.
    const scelta = migliore(false) ?? migliore(true);
    if (!scelta) break;

    // 2. QUANTO BASTA. Il passo si allunga sulla manopola scelta finché gli
    //    scatti successivi rendono almeno metà del primo, e si ferma appena il
    //    piano chiude: i ricavi non salgono più del necessario.
    let utile = scelta.p;
    let kUtile = scelta.k;
    let kPrecedente = scelta.k;
    if (scelta.k === 1 && utile.dopo.mancanza > 0) {
      const scatti = scattiMassimi(manopola(scelta.m));
      let resaPrecedente = scelta.resa;
      let prima = utile.dopo;
      for (let k = 2; k <= scatti; k++) {
        const p = prova(scelta.m, k);
        if (!p) break;
        const resa = resaDi(prima, p.dopo);
        if (resa === null || resa < resaPrecedente * RESA_MINIMA_ESTENSIONE) break;
        kPrecedente = kUtile;
        utile = p;
        kUtile = k;
        prima = p.dopo;
        resaPrecedente = resa;
        if (p.dopo.mancanza <= 0) break;
      }
      // 3. LA RIFINITURA. Fra l'ultimo passo che non chiudeva e quello che
      //    chiude, si cerca il più corto che basta: lo scatto fisso non si
      //    arrotonda al rialzo, così i ricavi si alzano solo di quel tanto.
      if (utile.dopo.mancanza <= 0 && kUtile > kPrecedente) {
        let basso = kPrecedente;
        let alto = kUtile;
        for (let i = 0; i < 4; i++) {
          const k = r2((basso + alto) / 2);
          if (k <= basso || k >= alto) break;
          const p = prova(scelta.m, k);
          if (!p) break;
          if (p.dopo.mancanza <= 0) {
            utile = p;
            alto = k;
          } else {
            basso = k;
          }
        }
      }
    }
    if (corrente.mancanza - utile.dopo.mancanza < MIGLIORAMENTO_MINIMO) break;
    passi.push({ ...utile.mossa.passo, perche: `restava aperto: ${corrente.vincoli[0]}` });
    corrente = utile.dopo;
    if (tentativi >= LIMITE.tentativi) break;
  }

  const primo = corrente.esito.anni[0]?.ricaviVendite ?? 0;
  const ultimo = corrente.esito.anni[corrente.esito.anni.length - 1]?.ricaviVendite ?? 0;
  return {
    ipotesi: corrente.ipotesi,
    leve: corrente.reg.leve,
    esito: corrente.esito,
    passi,
    aperti: corrente.vincoli,
    tentativi,
    soddisfatto: corrente.vincoli.length === 0,
    ricavi: { primo, ultimo },
    ricaviFermiConsentiti,
  };
}

/**
 * I passi per manopola: chi legge vuole sapere dove è arrivata quella manopola,
 * non contare i singoli scatti.
 */
export function passiRaggruppati(passi: PassoRicerca[]): PassoRicerca[] {
  const out: PassoRicerca[] = [];
  for (const p of passi) {
    const gia = out.find((x) => x.manopola === p.manopola);
    if (gia) {
      gia.a = p.a;
      continue;
    }
    out.push({ ...p });
  }
  return out;
}

/** La ricerca come si salva: i passi e i vincoli che restano, in breve. */
export function ricercaDaSalvare(r: EsitoRicerca): RicercaSalvata {
  return {
    passi: r.passi,
    tentativi: r.tentativi,
    aperti: r.aperti,
    soddisfatto: r.soddisfatto,
    ricaviFermiConsentiti: r.ricaviFermiConsentiti,
    ricavi: r.ricavi,
  };
}

/** La ricerca salvata nella colonna jsonb, ripulita: nulla di inventato. */
export function ricercaPulita(input: unknown): RicercaSalvata | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const testi = (v: unknown, massimo: number): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .slice(0, massimo)
          .map((x) => x.slice(0, 300))
      : [];
  const passi = Array.isArray(o.passi)
    ? o.passi
        .filter(
          (p): p is Record<string, unknown> =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as Record<string, unknown>).manopola === 'string'
        )
        .slice(0, 40)
        .map((p) => ({
          manopola: String(p.manopola).slice(0, 120),
          da: String(p.da ?? '').slice(0, 60),
          a: String(p.a ?? '').slice(0, 60),
          perche: String(p.perche ?? '').slice(0, 300),
        }))
    : [];
  const ricavi =
    o.ricavi && typeof o.ricavi === 'object'
      ? (() => {
          const r = o.ricavi as Record<string, unknown>;
          const primo = Number(r.primo);
          const ultimo = Number(r.ultimo);
          return Number.isFinite(primo) && Number.isFinite(ultimo) ? { primo, ultimo } : null;
        })()
      : null;
  const tentativi = Number(o.tentativi);
  return {
    passi,
    tentativi: Number.isFinite(tentativi) && tentativi > 0 ? Math.round(tentativi) : 0,
    aperti: testi(o.aperti, 12),
    soddisfatto: o.soddisfatto === true,
    ricaviFermiConsentiti: o.ricaviFermiConsentiti === true,
    ricavi,
  };
}

/**
 * Che cosa ha fatto la ricerca, in testo: va nella nota della variante, così il
 * piano racconta da solo come è arrivato a quei numeri.
 */
export function notaRicerca(r: EsitoRicerca): string {
  if (r.passi.length === 0)
    return r.soddisfatto
      ? 'Le ipotesi dell’analisi sostenevano già le rate e la cassa: la ricerca non ha girato nessuna manopola.'
      : `La ricerca non ha toccato le manopole e i vincoli restano aperti: ${r.aperti.join(' ')}`;
  // Una riga per manopola, dal valore di partenza a quello finale: il dettaglio
  // dei singoli scatti non serve a chi firma il piano. I vincoli si dicono una
  // volta sola, e solo se qualcuno è rimasto aperto.
  const righe = passiRaggruppati(r.passi).map((p) => `${p.manopola}: ${p.da} → ${p.a}`);
  const testa = `La ricerca del motore ha girato ${righe.length === 1 ? 'una manopola' : `${righe.length} manopole`} (${r.tentativi} piani calcolati):`;
  const chiusura = r.soddisfatto
    ? 'Con queste manopole il piano copre le rate e la cassa resta positiva in tutti gli anni.'
    : `Restano aperti i vincoli che le manopole ammesse dallo spazio non chiudono: ${r.aperti.join(' ')}`;
  return [testa, ...righe, chiusura].join('\n');
}
