// LA PROIEZIONE CONTABILE — la serie degli scarti, portata all'anno della verifica.
//
// PERCHÉ STA QUI E NON NELLA VERIFICA AZIENDA (0.236.0).
//
// Gli indici si calcolano su un anno: sono una fotografia, non guardano né
// avanti né indietro. Il dato contabile però arriva in colonne affiancate —
// ogni file XBRL porta l'anno e il precedente — e la parte più vecchia della
// serie è quella che nessun file porta con sé. È da lì che si parte.
//
// IL METODO, PER COME È STATO CHIESTO.
//
// 1. BASE. L'anno di base è il più vecchio in archivio, quello che non ha un
//    «-1» a coprirlo. Nell'esempio 2024 + 2023 il 2023 è già dentro il 2024,
//    ma il 2022 no: la base è il 2022.
// 2. SCARTI SULLA BASE. Ogni anno successivo si confronta con la BASE, non con
//    l'anno precedente: uno scarto calcolato sul 2023 racconterebbe il salto
//    2023→2024, e la serie perderebbe il suo punto di partenza.
// 3. PASSO. Gli scarti crescono con una ragione geometrica: il passo è la
//    radice ennesima del rapporto fra l'ultimo e il primo scarto. Con un
//    triennio in archivio ci sono due scarti e il passo si ricava; con un
//    biennio ce n'è uno solo, e il passo non si inventa: la voce resta ferma e
//    la ragione è dichiarata.
// 4. PROIEZIONE. Dallo scarto dell'ultimo anno in archivio, lo stesso passo si
//    applica fino all'ANNO DELLA VERIFICA — la data di apertura della verifica
//    contabile, conservata apposta per poter rifare il conto con gli stessi
//    criteri — e non oltre.
//
// Quello che esce non è una previsione: è un'ipotesi dichiarata, con il suo
// metodo scritto accanto ai numeri. Le note integrative e gli studi di settore
// servono a discutere questa ipotesi, non a produrla: qui non si inventa un
// tasso che i documenti non contengono.
//
// Logica pura, con i suoi test.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export interface AnnoContabile {
  anno: number;
  dati: DatiFinanziariPeriodo;
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

export interface PuntoScarto {
  anno: number;
  valore: number;
  /** Valore dell'anno meno valore dell'anno di base. */
  scarto: number;
}

export interface VoceSerie {
  chiave: keyof DatiFinanziariPeriodo;
  etichetta: string;
  /** Valore dell'anno di base: il punto da cui si contano gli scarti. */
  valoreBase: number;
  /** Gli scarti degli anni in archivio, dal primo successivo alla base. */
  scarti: PuntoScarto[];
  /** Ragione geometrica degli scarti (può essere negativa), null se non si ricava. */
  passo: number | null;
  proiezioni: { anno: number; scarto: number; valore: number }[];
  proiettabile: boolean;
  /** Perché la voce non è proiettabile (o il limite applicato). */
  motivo: string | null;
}

export interface ProiezioneContabile {
  /** Gli anni dei bilanci in archivio, in ordine. */
  anniArchivio: number[];
  /** Il più vecchio: quello che non ha un anno precedente a coprirlo. */
  annoBase: number | null;
  /** L'anno della verifica: dove la serie si ferma. */
  annoVerifica: number;
  /** Gli anni proiettati, in ordine. */
  annualitaProiettate: number[];
  voci: VoceSerie[];
  /**
   * Gli anni con i dati da usare a valle: quelli d'archivio e quelli
   * ricostruiti. Le voci senza serie restano ferme all'ultimo dato letto, e
   * l'elenco di quali sono è dichiarato.
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
const numero = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;

/**
 * Il passo della serie: radice n-esima del rapporto fra ultimo e primo scarto.
 *
 * Restituisce null quando la serie non dice niente di utilizzabile — un solo
 * scarto (biennio), un primo scarto nullo (nessun rapporto), scarti di segno
 * opposto (la serie non è geometrica).
 */
export function passoSerie(scarti: PuntoScarto[]): number | null {
  const validi = scarti.filter((s) => Number.isFinite(s.scarto) && s.scarto !== 0);
  if (validi.length < 2) return null;
  const primo = validi[0];
  const ultimo = validi[validi.length - 1];
  const anni = ultimo.anno - primo.anno;
  if (anni <= 0) return null;
  const rapporto = ultimo.scarto / primo.scarto;
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
  bilanci: AnnoContabile[];
  annoVerifica: number;
}): ProiezioneContabile {
  const perAnno = new Map<number, AnnoContabile>();
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
      annoVerifica,
      annualitaProiettate: [],
      voci: [],
      bilanciProiettati: [],
      vociTenuteFerme: [],
      proiettabile: false,
      metodo:
        'Nessun bilancio XBRL in archivio: non c’è una base da cui contare gli scarti, e la proiezione non si calcola.',
      avvertenze: [
        'Carica i bilanci XBRL nella verifica contabile: senza il dato depositato non c’è nulla da proiettare.',
      ],
    };
  }

  const base = bilanci[0];
  const ultimoArchivio = bilanci[bilanci.length - 1];
  const annualitaProiettate: number[] = [];
  for (let anno = ultimoArchivio.anno + 1; anno <= annoVerifica; anno += 1) {
    annualitaProiettate.push(anno);
  }

  const voci: VoceSerie[] = [];
  const vociTenuteFerme: string[] = [];
  const proiezioniPerAnno = new Map<number, Partial<DatiFinanziariPeriodo>>();

  for (const voce of VOCI_PROIEZIONE) {
    const valoreBase = numero(base.dati[voce.chiave]);
    if (valoreBase === null) {
      voci.push({
        chiave: voce.chiave,
        etichetta: voce.etichetta,
        valoreBase: 0,
        scarti: [],
        passo: null,
        proiezioni: [],
        proiettabile: false,
        motivo: `La voce non è valorizzata nel bilancio ${base.anno}: non c’è un punto di partenza.`,
      });
      continue;
    }

    // GLI SCARTI SI CONTANO SULLA BASE, non sull'anno precedente.
    const scarti: PuntoScarto[] = [];
    for (const b of bilanci.slice(1)) {
      const valore = numero(b.dati[voce.chiave]);
      if (valore === null) continue;
      scarti.push({
        anno: b.anno,
        valore: arrotonda(valore),
        scarto: arrotonda(valore - valoreBase),
      });
    }

    const passoCalcolato = passoSerie(scarti);
    let motivo: string | null = null;
    let passo = passoCalcolato;
    if (passo !== null && Math.abs(passo) > PASSO_MASSIMO) {
      motivo = `Il passo ricavato (${arrotonda(passo).toLocaleString('it-IT')}) supera il limite dichiarato di ${PASSO_MASSIMO}: la proiezione usa il limite, non il valore grezzo.`;
      passo = Math.sign(passo) * PASSO_MASSIMO;
    } else if (passo === null) {
      motivo =
        scarti.length < 2
          ? 'Serve almeno un triennio in archivio per ricavare il passo: con un solo scarto la serie non si ricava e la voce resta ferma.'
          : 'Gli scarti cambiano segno o partono da zero: la serie non è geometrica e non si proietta.';
    }

    const proiezioni: { anno: number; scarto: number; valore: number }[] = [];
    const ultimoScarto = scarti.length > 0 ? scarti[scarti.length - 1] : null;
    if (passo !== null && ultimoScarto) {
      annualitaProiettate.forEach((anno, indice) => {
        const scarto = arrotonda(ultimoScarto.scarto * Math.pow(passo, indice + 1));
        proiezioni.push({ anno, scarto, valore: arrotonda(valoreBase + scarto) });
        const annoDati = proiezioniPerAnno.get(anno) ?? {};
        annoDati[voce.chiave] = arrotonda(valoreBase + scarto);
        proiezioniPerAnno.set(anno, annoDati);
      });
    } else {
      vociTenuteFerme.push(voce.etichetta);
      // Tenuta ferma all'ultimo dato letto: dichiarato, non silenzioso.
      const ultimoValore = scarti.length > 0 ? scarti[scarti.length - 1].valore : valoreBase;
      for (const anno of annualitaProiettate) {
        const annoDati = proiezioniPerAnno.get(anno) ?? {};
        annoDati[voce.chiave] = ultimoValore;
        proiezioniPerAnno.set(anno, annoDati);
      }
    }

    voci.push({
      chiave: voce.chiave,
      etichetta: voce.etichetta,
      valoreBase,
      scarti,
      passo: passo === null ? null : arrotonda(passo),
      proiezioni,
      proiettabile: passo !== null,
      motivo,
    });
  }

  // Le annualità ricostruite, complete: per ogni anno, le voci proiettate e —
  // per quelle senza serie — il valore tenuto fermo.
  const bilanciProiettati: AnnoContabile[] = [];
  for (const b of bilanci) bilanciProiettati.push(b);
  for (const anno of annualitaProiettate) {
    const parziale = proiezioniPerAnno.get(anno) ?? {};
    const precedente = bilanciProiettati[bilanciProiettati.length - 1]?.dati ?? ultimoArchivio.dati;
    const dati: DatiFinanziariPeriodo = { ...precedente, ...parziale };
    bilanciProiettati.push({ anno, dati });
  }

  const proiettabili = voci.filter((v) => v.proiettabile);
  const proiettabile = proiettabili.length > 0 && annualitaProiettate.length > 0;

  avvertenze.push(
    `La base è il ${base.anno}: il più vecchio in archivio, quello che nessun file porta con sé come anno precedente.`
  );
  avvertenze.push(
    `Ogni scarto è contato sul ${base.anno}, non sull’anno precedente: è la serie che si proietta, e cambiare il punto di partenza cambierebbe la ragione.`
  );
  if (annualitaProiettate.length === 0) {
    avvertenze.push(
      `La verifica è datata ${annoVerifica}, dentro gli anni già in archivio: non c’è nessuna annualità da proiettare.`
    );
  } else if (!proiettabile) {
    avvertenze.push(
      `Nessuna voce ha una serie utilizzabile: la proiezione si ferma al ${ultimoArchivio.anno}.`
    );
  }
  if (vociTenuteFerme.length > 0 && annualitaProiettate.length > 0) {
    avvertenze.push(
      `Voci tenute ferme all’ultimo dato (serie non ricavabile): ${vociTenuteFerme.join(', ')}. Non sono proiettate, e il prospetto lo dichiara invece di stimarle.`
    );
  }
  avvertenze.push(
    'Le annualità proiettate sono un’ipotesi dichiarata — la stessa ragione geometrica degli scarti — non una previsione: note integrative e studi di settore servono a discuterle, non a sostituirle.'
  );

  const metodo =
    annualitaProiettate.length > 0
      ? `Base ${base.anno}: scarti di ogni anno dalla base, ragione geometrica fra ultimo e primo scarto, applicata fino al ${annoVerifica} (anno della verifica).`
      : `Base ${base.anno}: gli anni in archivio arrivano già al ${ultimoArchivio.anno}, anno della verifica.`;

  return {
    anniArchivio,
    annoBase: base.anno,
    annoVerifica,
    annualitaProiettate,
    voci,
    bilanciProiettati,
    vociTenuteFerme,
    proiettabile,
    metodo,
    avvertenze,
  };
}
