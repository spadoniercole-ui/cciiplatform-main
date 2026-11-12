// LA FOTOGRAFIA CONTABILE — il documento schematico della verifica contabile.
//
// Non è il report dell'azienda (quello tiene insieme le due verifiche e
// l'analisi): è la fotografia del dato depositato, sui documenti che l'ente ha
// in possesso. Serve a leggere in una pagina sola — e a stampare — il
// prospetto, TUTTI gli indici abilitati nei parametri dello spazio su ogni
// annualità, e la diagnosi che ne discende: quanti indici oltre soglia, come
// cambiano, che patrimonio netto e che posizione finanziaria netta risultano.
//
// DUE REGOLE.
//
// 1. Nessun calcolo nuovo: i valori sono quelli salvati dal motore XBRL
//    (`costruisciBundleIndici`), non una seconda formula che potrebbe
//    disallinearsi.
// 2. Gli indicatori del CCII che un bilancio non basta a calcolare — il DSCR,
//    che ha bisogno della rata — stanno nel documento dichiarati «n/d» con il
//    motivo, invece di mancare. Un indice che sparisce fa pensare a un guasto;
//    uno «n/d» spiegato è un dato.
//
// Logica pura, con i suoi test.

import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';
import { indiciVisibili, valoreIndice, type RigaIndice } from '@/lib/xbrl/indiciVisibili';

export interface BilancioFotografia {
  anno: number;
  dati: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
}

export interface RigaIndiceFotografia {
  codice: string;
  nome: string;
  soglia: string;
  /** Un valore per annualità; null = non calcolabile su quel bilancio. */
  valori: (number | null)[];
  esiti: (IndiceCcii['esito'] | null)[];
}

export interface DiagnosiAnno {
  anno: number;
  indiciOltreSoglia: number;
  indiciCalcolabili: number;
  patrimonioNetto: number;
  posizioneFinanziariaNetta: number;
  ricavi: number;
  /** Debiti / ricavi, la stessa misura di C1 ma esposta come fatto dell'anno. */
  debitiSuRicavi: number | null;
}

/**
 * Le assunzioni con cui i fact XBRL diventano gli schemi del documento. Non
 * sono formule nuove: sono le scelte già fatte dal mappatore e dal motore,
 * scritte perché chi legge il prospetto sappia su che cosa poggia.
 */
export interface AssunzioneTraduzione {
  voce: string;
  assunzione: string;
  origine: 'MAPPATURA' | 'RISERVA' | 'FUORI_BILANCIO';
}

export const ASSUNZIONI_TRADUZIONE: AssunzioneTraduzione[] = [
  {
    voce: 'Ricavi delle vendite',
    assunzione:
      'Ricavi delle vendite e delle prestazioni: il fact XBRL ricondotto a `ricaviVendite` dal mapping dei tag.',
    origine: 'MAPPATURA',
  },
  {
    voce: 'Valore della produzione',
    assunzione:
      'Se il fact non c’è, si assume il valore dei ricavi delle vendite: senza il totale della produzione il prospetto non avrebbe una base.',
    origine: 'RISERVA',
  },
  {
    voce: 'EBIT',
    assunzione:
      'Se non è dichiarato, si assume valore della produzione meno costi della produzione.',
    origine: 'RISERVA',
  },
  {
    voce: 'EBITDA',
    assunzione: 'Se non è dichiarato, si assume EBIT più ammortamenti.',
    origine: 'RISERVA',
  },
  {
    voce: 'Patrimonio netto',
    assunzione: 'Il totale del patrimonio netto del passivo, così come esposto nel bilancio.',
    origine: 'MAPPATURA',
  },
  {
    voce: 'Debiti',
    assunzione:
      'Il totale dei debiti (voce D del passivo), non solo quelli verso banche: è la base di C1 e del rapporto debiti/ricavi.',
    origine: 'MAPPATURA',
  },
  {
    voce: 'Posizione finanziaria netta',
    assunzione:
      'Debiti verso banche meno disponibilità liquide. Le altre passività finanziarie, se esposte altrove, non entrano: la fotografia non le sposta.',
    origine: 'RISERVA',
  },
  {
    voce: 'Fact assenti',
    assunzione:
      'Non si stimano: valgono zero nella scheda. Un indice che dipende da un fact assente può quindi risultare non calcolabile o non rappresentativo, e il valore va letto con questa avvertenza.',
    origine: 'RISERVA',
  },
  {
    voce: 'Nota integrativa',
    assunzione:
      'Si legge come contesto (criteri, fatti di rilievo, impegni, parti correlate): non si converte in un tasso né in una percentuale.',
    origine: 'FUORI_BILANCIO',
  },
  {
    voce: 'DSCR e test pratico',
    assunzione:
      'Non si assumono: servono la quota capitale e gli interessi in scadenza, che il bilancio non espone. Restano «n/d» con il motivo, e si leggono sugli scenari.',
    origine: 'FUORI_BILANCIO',
  },
];

export interface FotografiaContabile {
  anni: number[];
  /** Gli indici abilitati nello spazio, con i valori per annualità. */
  indici: RigaIndiceFotografia[];
  /** Indicatori del CCII che il solo bilancio non calcola: dichiarati, non omessi. */
  indicatoriDichiarati: RigaIndice[];
  diagnosi: DiagnosiAnno[];
  /** Cosa dicono i numeri sulla direzione, senza aggettivi di giudizio. */
  tendenza: string;
  /** Le assunzioni della traduzione XBRL → schemi, dichiarate una per una. */
  assunzioni: AssunzioneTraduzione[];
  avvertenze: string[];
}

export const VOCI_FOTOGRAFIA: { etichetta: string; chiave: keyof DatiFinanziariPeriodo }[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda' },
  { etichetta: 'EBIT', chiave: 'ebit' },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio' },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto' },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * Compone la fotografia. `codiciAbilitati` sono gli indici scelti nei Parametri
 * di Spazio: se è vuoto si mostrano tutti quelli che il motore calcola. Gli
 * indicatori dichiarati (DSCR, test pratico) compaiono sempre, perché la loro
 * assenza è un'informazione, non un vuoto.
 */
export function componiFotografia(input: {
  bilanci: BilancioFotografia[];
  codiciAbilitati: string[];
}): FotografiaContabile {
  const bilanci = [...input.bilanci]
    .filter((b) => Number.isInteger(b.anno) && b.dati && typeof b.dati.ricaviVendite === 'number')
    .sort((a, b) => a.anno - b.anno);
  const avvertenze: string[] = [];

  if (bilanci.length === 0) {
    return {
      anni: [],
      indici: [],
      indicatoriDichiarati: [],
      diagnosi: [],
      tendenza: 'Nessun bilancio in archivio: non c’è una direzione da leggere.',
      assunzioni: ASSUNZIONI_TRADUZIONE,
      avvertenze: [
        'Nessun bilancio XBRL caricato per questa azienda: la fotografia contabile non ha documenti su cui poggiare.',
      ],
    };
  }

  const primo = bilanci[0];
  const righe = indiciVisibili(input.codiciAbilitati, primo.indici, primo.altriIndici);

  const indici: RigaIndiceFotografia[] = righe
    .filter((r) => !r.motivoNonCalcolabile)
    .map((r) => ({
      codice: r.codice,
      nome: r.nome,
      soglia: r.soglia,
      valori: bilanci.map((b) => {
        const trovato = valoreIndice(b, r.codice);
        return typeof trovato?.valore === 'number' ? trovato.valore : null;
      }),
      esiti: bilanci.map((b) => valoreIndice(b, r.codice)?.esito ?? null),
    }));

  // Gli indicatori dichiarati non dipendono dai codici abilitati: non sono
  // spenti, sono fuori portata del bilancio.
  const indicatoriDichiarati = indiciVisibili(['DSCR', 'TEST-PRATICO'], [], []);

  const diagnosi: DiagnosiAnno[] = bilanci.map((b) => {
    const calcolabili = [...b.indici, ...b.altriIndici].filter((i) => typeof i.valore === 'number');
    return {
      anno: b.anno,
      indiciOltreSoglia: calcolabili.filter((i) => i.esito === 'VIOLATO').length,
      indiciCalcolabili: calcolabili.length,
      patrimonioNetto: b.dati.patrimonioNetto,
      posizioneFinanziariaNetta: arrotonda(b.dati.debitiBanche - b.dati.disponibilitaLiquide),
      ricavi: b.dati.ricaviVendite,
      debitiSuRicavi:
        b.dati.ricaviVendite > 0 ? arrotonda(b.dati.totaleDebiti / b.dati.ricaviVendite) : null,
    };
  });

  const primoAnno = diagnosi[0];
  const ultimoAnno = diagnosi[diagnosi.length - 1];
  let tendenza: string;
  if (diagnosi.length === 1) {
    tendenza = `Una sola annualità in archivio (${primoAnno.anno}): la direzione si legge da due bilanci.`;
    avvertenze.push(
      'Con un solo bilancio non c’è una tendenza: la fotografia descrive la data, non un andamento.'
    );
  } else {
    const delta = ultimoAnno.indiciOltreSoglia - primoAnno.indiciOltreSoglia;
    const direzione =
      delta < 0 ? 'in riduzione' : delta > 0 ? 'in aumento' : 'invariati nel numero';
    tendenza = `Indici oltre soglia ${direzione}: ${primoAnno.indiciOltreSoglia} nel ${primoAnno.anno}, ${ultimoAnno.indiciOltreSoglia} nel ${ultimoAnno.anno}. Patrimonio netto da ${primoAnno.patrimonioNetto.toLocaleString('it-IT')} € a ${ultimoAnno.patrimonioNetto.toLocaleString('it-IT')} €.`;
  }

  avvertenze.push(
    'Gli indici sono strumenti operativi di lettura, non parametri normativi: il sistema dell’originario art. 13 CCII è abrogato.'
  );
  avvertenze.push(
    'Il DSCR non è calcolabile dal bilancio depositato, perché serve il servizio del debito (quota capitale e interessi in scadenza): si legge sugli scenari, dove il piano di rientro lo definisce.'
  );

  return {
    anni: bilanci.map((b) => b.anno),
    indici,
    indicatoriDichiarati,
    diagnosi,
    tendenza,
    assunzioni: ASSUNZIONI_TRADUZIONE,
    avvertenze,
  };
}
