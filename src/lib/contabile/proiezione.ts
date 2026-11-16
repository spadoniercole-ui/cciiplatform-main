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

  const valoriPerAnno = new Map<number, Partial<DatiFinanziariPeriodo>>();
  const derivateMotivo = new Map<keyof DatiFinanziariPeriodo, string | null>();

  let precedente: DatiFinanziariPeriodo = ultimoArchivio.dati;
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
    const costiProduzione = valoreMotrice('costiProduzione');
    const oneriFinanziari = valoreMotrice('oneriFinanziari');
    const totaleDebiti = valoreMotrice('totaleDebiti');
    const debitiBancheMotrice = valoreMotrice('debitiBanche');

    const ricaviVendite =
      valoreProduzione === null ? null : arrotonda(valoreProduzione - gapRicavi);
    const ebit =
      valoreProduzione === null || costiProduzione === null
        ? null
        : arrotonda(valoreProduzione - costiProduzione);
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

  const metodo =
    annualitaCalcolate.length > 0
      ? `Base ${base.anno}: differenziali di ogni anno dalla base, ragione geometrica fra primo e ultimo differenziale, applicata ai valori del ${ultimoArchivio.anno} fino al ${annoVerifica} (anno della verifica). Le voci derivate seguono il prospetto.`
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
