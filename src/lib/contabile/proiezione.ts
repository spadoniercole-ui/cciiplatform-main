// LA PROIEZIONE CONTABILE — i differenziali sulla base, portati all'anno della verifica.
//
// PERCHÉ STA QUI E NON NELLA VERIFICA AZIENDA (0.236.0).
//
// Gli indici si calcolano su un anno: sono una fotografia, non guardano né
// avanti né indietro. Il dato contabile però arriva in colonne affiancate —
// ogni file XBRL porta l'anno e il precedente — e la parte più vecchia della
// serie è quella che nessun file porta con sé. È da lì che si parte.
//
// IL METODO, COME È STATO CHIESTO (0.237.0).
//
// 1. BASE. L'anno di base è il più vecchio in archivio, quello che non ha un
//    «-1» a coprirlo. Nell'esempio 2024 + 2023 il 2023 è già dentro il 2024,
//    ma il 2022 no: la base è il 2022.
// 2. DIFFERENZIALI SULLA BASE. Ogni anno successivo si confronta con la BASE,
//    non con l'anno precedente: uno scarto calcolato sul 2023 racconterebbe il
//    salto 2023→2024, e la serie perderebbe il suo punto di partenza. Il
//    differenziale è quello scarto in punti della base: (anno − base) / |base|.
// 3. PASSO. I differenziali crescono con una ragione geometrica: il passo è la
//    radice ennesima del rapporto fra l'ultimo e il primo differenziale. Con un
//    triennio in archivio ci sono due differenziali e il passo si ricava; con
//    un biennio ce n'è uno solo, e il passo non si inventa: la voce resta
//    ferma e la ragione è dichiarata.
// 4. APPLICAZIONE ALL'ULTIMO BILANCIO. Il differenziale non si somma alla
//    base: lo stesso passo si applica ai valori dell'ultimo bilancio utile
//    (2024 nell'esempio), anno dopo anno, fino all'ANNO DELLA VERIFICA — la
//    data di apertura della verifica contabile, conservata apposta per poter
//    rifare il conto con gli stessi criteri — e non oltre. Così il 2024 resta
//    il punto di partenza del futuro e la base resta il punto di partenza
//    della serie: due cose diverse, dette entrambe.
//
// Ogni annualità porta la sua etichetta: STORICO è il dato depositato,
// CALCOLATO è quello costruito. Il prospetto non li mescola in silenzio.
//
// Quello che esce non è una previsione: è un'ipotesi dichiarata, con il suo
// metodo scritto accanto ai numeri. Le note integrative e gli studi di settore
// servono a discutere questa ipotesi, non a produrla: qui non si inventa un
// tasso che i documenti non contengono.
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

/** Le voci che il riquadro mostra, nell'ordine del prospetto a scalare. */
export const VOCI_PROIEZIONE: { chiave: keyof DatiFinanziariPeriodo; etichetta: string }[] = [
  { chiave: 'ricaviVendite', etichetta: 'Ricavi delle vendite' },
  { chiave: 'valoreProduzione', etichetta: 'Valore della produzione' },
  { chiave: 'costiProduzione', etichetta: 'Costi della produzione' },
  { chiave: 'ebitda', etichetta: 'EBITDA' },
  { chiave: 'ebit', etichetta: 'EBIT' },
  { chiave: 'oneriFinanziari', etichetta: 'Oneri finanziari' },
  { chiave: 'utileEsercizio', etichetta: 'Risultato d’esercizio' },
  { chiave: 'patrimonioNetto', etichetta: 'Patrimonio netto' },
  { chiave: 'totaleDebiti', etichetta: 'Totale debiti' },
  { chiave: 'debitiBanche', etichetta: 'Debiti verso banche' },
  { chiave: 'disponibilitaLiquide', etichetta: 'Disponibilità liquide' },
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

export interface VoceSerie {
  chiave: keyof DatiFinanziariPeriodo;
  etichetta: string;
  /** Valore dell'anno di base: il punto da cui si contano i differenziali. */
  valoreBase: number;
  /** Valore dell'ultimo bilancio in archivio: il punto su cui si applicano. */
  valoreUltimo: number | null;
  /** I differenziali degli anni in archivio, dal primo successivo alla base. */
  differenziali: PuntoDifferenziale[];
  /** Ragione geometrica dei differenziali, null se non si ricava. */
  passo: number | null;
  /** I valori costruiti, anno per anno, dall'ultimo bilancio in poi. */
  proiezioni: { anno: number; differenziale: number; scarto: number; valore: number }[];
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
   * quelli costruiti (tipo CALCOLATO). Le voci senza serie restano ferme
   * all'ultimo dato letto, e l'elenco di quali sono è dichiarato.
   */
  bilanciProiettati: AnnoContabile[];
  /** Le voci tenute ferme per mancanza di serie, con il loro nome. */
  vociTenuteFerme: string[];
  proiettabile: boolean;
  /** Il metodo, in una frase, come compare accanto ai numeri. */
  metodo: string;
  avvertenze: string[];
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

/**
 * Compone la proiezione. `bilanci` sono gli anni in archivio (ne basta uno per
 * la base, ne servono tre per una serie); `annoVerifica` è l'anno della data di
 * apertura della verifica contabile.
 */
export function componiProiezione(input: {
  bilanci: BilancioArchivio[];
  annoVerifica: number;
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
    };
  }

  const base = bilanci[0];
  const ultimoArchivio = bilanci[bilanci.length - 1];
  const annualitaCalcolate: number[] = [];
  for (let anno = ultimoArchivio.anno + 1; anno <= annoVerifica; anno += 1) {
    annualitaCalcolate.push(anno);
  }

  const voci: VoceSerie[] = [];
  const vociTenuteFerme: string[] = [];
  const proiezioniPerAnno = new Map<number, Partial<DatiFinanziariPeriodo>>();

  for (const voce of VOCI_PROIEZIONE) {
    const valoreBase = numero(base.dati[voce.chiave]);
    const valoreUltimo = numero(ultimoArchivio.dati[voce.chiave]);
    if (valoreBase === null) {
      voci.push({
        chiave: voce.chiave,
        etichetta: voce.etichetta,
        valoreBase: 0,
        valoreUltimo,
        differenziali: [],
        passo: null,
        proiezioni: [],
        proiettabile: false,
        motivo: `La voce non è valorizzata nel bilancio ${base.anno}: non c’è un punto di partenza.`,
      });
      continue;
    }

    // I DIFFERENZIALI SI CONTANO SULLA BASE, non sull'anno precedente. Il
    // denominatore è la base in valore assoluto: con una base negativa il
    // differenziale resta leggibile (il segno lo porta lo scarto).
    const differenziali: PuntoDifferenziale[] = [];
    for (const b of bilanci.slice(1)) {
      const valore = numero(b.dati[voce.chiave]);
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
      motivo = `La voce non è valorizzata nel bilancio ${ultimoArchivio.anno}: non c’è un valore su cui applicare i differenziali.`;
      passo = null;
    } else if (valoreUltimo <= 0) {
      motivo = `L’ultimo bilancio (${ultimoArchivio.anno}) ha la voce non positiva: un differenziale percentuale non la porta avanti, e la voce resta ferma.`;
      passo = null;
    }

    const proiezioni: { anno: number; differenziale: number; scarto: number; valore: number }[] =
      [];
    const ultimoDifferenziale =
      differenziali.length > 0 ? differenziali[differenziali.length - 1] : null;

    if (passo !== null && ultimoDifferenziale && ultimoDifferenziale.differenziale !== null) {
      for (const [indice, anno] of annualitaCalcolate.entries()) {
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
        const annoDati = proiezioniPerAnno.get(anno) ?? {};
        annoDati[voce.chiave] = valore;
        proiezioniPerAnno.set(anno, annoDati);
      }
    }

    if (passo === null || proiezioni.length < annualitaCalcolate.length) {
      vociTenuteFerme.push(voce.etichetta);
      // Tenuta ferma all'ultimo dato letto: dichiarato, non silenzioso.
      const fermo = proiezioni.length > 0 ? proiezioni[proiezioni.length - 1].valore : valoreUltimo;
      for (const anno of annualitaCalcolate) {
        if (proiezioni.some((p) => p.anno === anno)) continue;
        if (fermo === null) continue;
        const annoDati = proiezioniPerAnno.get(anno) ?? {};
        annoDati[voce.chiave] = fermo;
        proiezioniPerAnno.set(anno, annoDati);
      }
    }

    voci.push({
      chiave: voce.chiave,
      etichetta: voce.etichetta,
      valoreBase,
      valoreUltimo,
      differenziali,
      passo: passo === null ? null : arrotonda4(passo),
      proiezioni,
      proiettabile: passo !== null && proiezioni.length === annualitaCalcolate.length,
      motivo,
    });
  }

  // Le annualità, con la loro etichetta: gli anni d'archivio sono STORICO, gli
  // anni costruiti sono CALCOLATO. Nessuna colonna senza nome.
  const bilanciProiettati: AnnoContabile[] = bilanci.map((b) => ({ ...b, tipo: 'STORICO' }));
  for (const anno of annualitaCalcolate) {
    const parziale = proiezioniPerAnno.get(anno) ?? {};
    const precedente = bilanciProiettati[bilanciProiettati.length - 1]?.dati ?? ultimoArchivio.dati;
    const dati: DatiFinanziariPeriodo = { ...precedente, ...parziale };
    bilanciProiettati.push({ anno, dati, tipo: 'CALCOLATO' });
  }

  const proiettabili = voci.filter((v) => v.proiettabile);
  const proiettabile = proiettabili.length > 0 && annualitaCalcolate.length > 0;

  avvertenze.push(
    `La base è il ${base.anno}: il più vecchio in archivio, quello che nessun file porta con sé come anno precedente.`
  );
  avvertenze.push(
    `I differenziali sono contati sul ${base.anno} in punti della base, e applicati ai valori del ${ultimoArchivio.anno}: la serie parte dalla base, il futuro parte dall’ultimo bilancio utile.`
  );
  if (annualitaCalcolate.length === 0) {
    avvertenze.push(
      `La verifica è datata ${annoVerifica}, dentro gli anni già in archivio: non c’è nessuna annualità da costruire.`
    );
  } else if (!proiettabile) {
    avvertenze.push(
      `Nessuna voce ha una serie utilizzabile: la proiezione si ferma al ${ultimoArchivio.anno}.`
    );
  }
  if (vociTenuteFerme.length > 0 && annualitaCalcolate.length > 0) {
    avvertenze.push(
      `Voci tenute ferme all’ultimo dato (serie non ricavabile): ${vociTenuteFerme.join(', ')}. Non sono proiettate, e il prospetto lo dichiara invece di stimarle.`
    );
  }
  avvertenze.push(
    'Le annualità calcolate sono un’ipotesi dichiarata — la stessa ragione geometrica dei differenziali — non una previsione: note integrative e studi di settore servono a discuterle, non a sostituirle.'
  );

  const metodo =
    annualitaCalcolate.length > 0
      ? `Base ${base.anno}: differenziali di ogni anno dalla base, ragione geometrica fra primo e ultimo differenziale, applicata ai valori del ${ultimoArchivio.anno} fino al ${annoVerifica} (anno della verifica).`
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
  };
}
