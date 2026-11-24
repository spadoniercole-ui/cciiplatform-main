// L'ICONOGRAFIA DELLE CINQUE DIMENSIONI (0.256.5).
//
// La barra di intensità dice quanto pesa una dimensione; non dice DA CHE COSA.
// Chi legge l'iconografia di un'azienda deve poter vedere, senza aprire il
// bilancio:
//
//   A  quanto l'ente vanta, ambito per ambito                → barre a confronto
//   B  come sta in piedi (patrimonio sui debiti, margine)    → barre a confronto
//   C  da dove viene e dove va (due esercizi)                → barre a confronto
//   D  se i dati su cui si decide sono affidabili            → avviso forte
//   E  che cosa dice la visura che il bilancio non dice      → elenco
//
// PERCHÉ BARRE E NON UN GRAFICO UNICO. Le grandezze non sono omogenee (euro,
// percentuali, punteggi) e non si sommano: ogni grafico ha la sua unità e la sua
// scala, e il confronto è dentro il grafico, non fra grafici. Un'unica area
// avrebbe richiesto una normalizzazione, cioè un numero nuovo da spiegare.
//
// NESSUN VALORE INVENTATO. Un dato mancante resta una barra vuota con scritto
// «non letto», e la scala si adatta a ciò che c'è. Se non c'è nulla da
// disegnare, il grafico non si costruisce: la dimensione resta quella che è.
//
// Logica pura, con i suoi test.

import { altmanZ2, type Componente, type DatiIai } from '@/lib/iai/dimensioni';

export type UnitaGrafico = 'euro' | 'percento' | 'numero';

export interface BarraGrafico {
  etichetta: string;
  /** Il valore nella unità del grafico; null quando il dato non è stato letto. */
  valore: number | null;
  /** Come si scrive accanto alla barra. */
  testo: string;
  /** Che cosa significa quel numero (soglia, esercizio, esito). */
  riferimento: string | null;
  /** Da mettere in evidenza: è un fatto sfavorevole, non una preferenza. */
  segnala: boolean;
}

export interface GraficoDimensione {
  dimensione: 'A' | 'B' | 'C';
  titolo: string;
  /** Che cosa mostra il grafico, in una riga: il confronto che si sta facendo. */
  lettura: string;
  unita: UnitaGrafico;
  /** Il massimo assoluto su cui si scala la barra; null se non c'è nulla da disegnare. */
  massimo: number | null;
  barre: BarraGrafico[];
}

export interface AvvisoAffidabilita {
  titolo: string;
  testo: string;
  motivi: string[];
}

export interface ParticolareVisura {
  etichetta: string;
  testo: string;
  segnala: boolean;
}

export interface IconografiaDimensioni {
  grafici: GraficoDimensione[];
  avvisoAffidabilita: AvvisoAffidabilita | null;
  visura: { disponibile: boolean; particolari: ParticolareVisura[] };
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const num = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
const pct = (n: number) => `${num(n)}%`;

const massimoDi = (barre: BarraGrafico[]): number | null => {
  const valori = barre
    .map((b) => (b.valore === null ? null : Math.abs(b.valore)))
    .filter((v): v is number => v !== null && v > 0);
  return valori.length > 0 ? Math.max(...valori) : null;
};

function graficoA(dati: DatiIai): GraficoDimensione | null {
  const soglie = dati.ente.soglie;
  if (soglie.length === 0) return null;
  const barre: BarraGrafico[] = soglie.map((s) => ({
    etichetta: s.ambito,
    valore: s.esposizione,
    testo: s.esposizione === null ? 'esposizione non determinata' : euro(s.esposizione),
    riferimento:
      s.esito === 'sopra'
        ? 'presupposti oggettivi rilevati'
        : s.esito === 'sotto'
          ? 'presupposti non rilevati'
          : 'esito non esprimibile: dati mancanti',
    segnala: s.esito === 'sopra' || s.esito === 'non_determinabile',
  }));
  return {
    dimensione: 'A',
    titolo: 'Quanto vale l’esposizione, ambito per ambito',
    lettura:
      'Ogni barra è l’esposizione di un ambito dell’art. 25-novies; il confronto dice quale ambito porta l’importo e dove i presupposti risultano integrati.',
    unita: 'euro',
    massimo: massimoDi(barre),
    barre,
  };
}

function graficoB(dati: DatiIai): GraficoDimensione | null {
  const b = dati.bilancio.corrente;
  if (!b) return null;
  const barre: BarraGrafico[] = [];
  if (b.patrimonioNetto !== null && b.totaleDebiti) {
    const r = (b.patrimonioNetto / b.totaleDebiti) * 100;
    barre.push({
      etichetta: 'Patrimonio netto sui debiti',
      valore: r,
      testo: pct(r),
      riferimento: 'sotto zero il patrimonio è più piccolo del debito',
      segnala: r < 0,
    });
  }
  if (b.ebitda !== null && b.ricavi) {
    const m = (b.ebitda / b.ricavi) * 100;
    barre.push({
      etichetta: 'Margine EBITDA sui ricavi',
      valore: m,
      testo: pct(m),
      riferimento: 'sotto zero la gestione non genera cassa',
      segnala: m < 0,
    });
  }
  if (!barre.length) return null;
  return {
    dimensione: 'B',
    titolo: 'Come sta in piedi al netto delle due voci',
    lettura:
      'Due rapporti dello stesso bilancio, confrontati con lo zero: quanto dell’attivo è coperto dal patrimonio e quanto la gestione lascia prima degli ammortamenti.',
    unita: 'percento',
    massimo: massimoDi(barre),
    barre,
  };
}

function graficoC(dati: DatiIai): GraficoDimensione | null {
  const c = dati.bilancio.corrente;
  const p = dati.bilancio.precedente;
  if (!c || !p) return null;
  const anno = c.anno ?? null;
  const annoPrima = anno !== null ? anno - 1 : null;
  const etichetta = (cosa: string, a: number | null) => (a === null ? cosa : `${cosa} ${a}`);
  const coppia = (cosa: string, ora: number | null, prima: number | null, segnala: boolean) =>
    [
      {
        etichetta: etichetta(cosa, anno),
        valore: ora,
        testo: ora === null ? 'non letto' : euro(ora),
        riferimento: prima === null ? null : `esercizio precedente ${euro(prima)}`,
        segnala: segnala && ora !== null,
      },
      {
        etichetta: etichetta(cosa, annoPrima),
        valore: prima,
        testo: prima === null ? 'non letto' : euro(prima),
        riferimento: null,
        segnala: false,
      },
    ] satisfies BarraGrafico[];

  const barre: BarraGrafico[] = [
    ...coppia(
      'Ricavi',
      c.ricavi,
      p.ricavi,
      c.ricavi !== null && p.ricavi !== null && c.ricavi < p.ricavi
    ),
    ...coppia('Utile', c.utile, p.utile, c.utile !== null && c.utile < 0),
    ...coppia(
      'Patrimonio netto',
      c.patrimonioNetto,
      p.patrimonioNetto,
      c.patrimonioNetto !== null && c.patrimonioNetto < 0
    ),
  ];
  return {
    dimensione: 'C',
    titolo: 'I due esercizi, accostati',
    lettura:
      'Ogni voce ha la barra dell’ultimo esercizio accanto a quella del precedente: la lunghezza dice il livello, la coppia dice la direzione.',
    unita: 'euro',
    massimo: massimoDi(barre),
    barre,
  };
}

function avvisoD(dati: DatiIai, componenti: Componente[]): AvvisoAffidabilita | null {
  const d = componenti.find((c) => c.dimensione === 'D');
  if (!d) return null;
  const motivi = [...d.motivi, ...d.lacune];
  if (d.punteggio < 50 && motivi.length === 0) return null;
  return {
    titolo: 'I dati su cui si sta decidendo non sono tutti affidabili',
    testo:
      d.punteggio >= 70
        ? 'La dimensione D è alta: prima di usare questi numeri in una decisione va chiuso ciò che manca. Il giudizio resta quello del semaforo e non cambia per questa avvertenza.'
        : 'La dimensione D segnala lacune: i numeri ci sono, ma non tutti reggono allo stesso modo. Quello che segue dice dove.',
    motivi,
  };
}

function particolariE(dati: DatiIai): { disponibile: boolean; particolari: ParticolareVisura[] } {
  const v = dati.visura;
  const b = dati.bilancio.corrente;
  const particolari: ParticolareVisura[] = [];
  if (!v.disponibile) {
    particolari.push({
      etichetta: 'Visura',
      testo: 'i fatti della visura non sono stati estratti: il quadro procedurale non si legge.',
      segnala: false,
    });
    return { disponibile: false, particolari };
  }
  if (v.proceduraPendente) {
    particolari.push({
      etichetta: 'Procedura concorsuale',
      testo: `${v.proceduraPendente} — risulta dalla visura ed è il fatto che pesa di più su questa dimensione.`,
      segnala: true,
    });
  }
  if (v.statoAttivitaAnomalo) {
    particolari.push({
      etichetta: 'Stato dell’attività',
      testo: `${v.statoAttivitaAnomalo} — dichiarato in visura.`,
      segnala: true,
    });
  }
  if (b && b.patrimonioNetto !== null && v.capitaleSociale !== null) {
    const sotto = b.patrimonioNetto < v.capitaleSociale;
    particolari.push({
      etichetta: 'Patrimonio netto e capitale sociale',
      testo: `Patrimonio netto ${euro(b.patrimonioNetto)} contro capitale sociale ${euro(
        v.capitaleSociale
      )}: ${
        sotto
          ? 'il patrimonio è sotto il capitale — rilevano gli artt. 2482-bis/ter c.c. (da verificare, con la sospensione 2020-2022).'
          : 'il patrimonio copre il capitale sociale.'
      }`,
      segnala: sotto,
    });
  }
  if (v.giorniVisura !== null) {
    particolari.push({
      etichetta: 'Età della visura',
      testo: `${v.giorniVisura} giorni fa${v.giorniVisura > 90 ? ': oltre i novanta, il quadro va ricontrollato prima della decisione.' : '.'}`,
      segnala: v.giorniVisura > 90,
    });
  }
  if (!particolari.length) {
    particolari.push({
      etichetta: 'Visura',
      testo:
        'nessuna particolarità: nessuna procedura pendente, attività esercitata, patrimonio sopra il capitale.',
      segnala: false,
    });
  }
  return { disponibile: true, particolari };
}

export function componiIconografia(dati: DatiIai, componenti: Componente[]): IconografiaDimensioni {
  const grafici = [graficoA(dati), graficoB(dati), graficoC(dati)].filter(
    (g): g is GraficoDimensione => g !== null && g.massimo !== null
  );
  return {
    grafici,
    avvisoAffidabilita: avvisoD(dati, componenti),
    visura: particolariE(dati),
  };
}

/** Lo Z''-score usato dalla dimensione B, per mostrarlo accanto al bilancio. */
export function zScoreBilancio(dati: DatiIai): number | null {
  const b = dati.bilancio.corrente;
  if (!b || b.totaleAttivo === null || b.attivoCircolante === null) return null;
  if (b.patrimonioNetto === null || b.ebitda === null || !b.totaleDebiti) return null;
  return altmanZ2({
    attivoCircolante: b.attivoCircolante,
    passivoCorrente: null,
    totaleAttivo: b.totaleAttivo,
    utiliNonDistribuiti: null,
    ebit: b.ebitda,
    patrimonioNetto: b.patrimonioNetto,
    totaleDebiti: b.totaleDebiti,
  });
}
