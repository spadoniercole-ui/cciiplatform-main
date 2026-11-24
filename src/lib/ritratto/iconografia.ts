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
// importi, punteggi) e non si sommano: ogni grafico ha la sua scala, e il
// confronto è dentro il grafico, non fra grafici. Un'unica area avrebbe
// richiesto una normalizzazione, cioè un numero nuovo da spiegare.
//
// NESSUN VALORE INVENTATO. Un dato mancante resta una barra vuota con scritto
// «non letto», e la scala si adatta a ciò che c'è. Se non c'è nulla da
// disegnare, il grafico non si costruisce: la dimensione resta quella che è.
//
// Logica pura, con i suoi test.

import { type Componente, type DatiIai } from '@/lib/iai/dimensioni';
import { gravitaDebito, type DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';

/**
 * I VALORI ATTUALIZZATI (0.256.6).
 *
 * I box A-E arrivano dopo lo sviluppo dello scenario: accanto al valore di
 * bilancio — storico — c'è quello che il piano di sviluppo porta a fine
 * orizzonte. Non è una previsione del sistema: è il piano che l'azienda ha
 * presentato o che è stato simulato, letto nelle stesse voci. Quando non c'è,
 * la riga non si inventa e il box lo dichiara.
 */
export interface ProspetticoBilancio {
  /** L'anno di chiusura dell'orizzonte. */
  anno: number;
  ricavi: number | null;
  utile: number | null;
  patrimonioNetto: number | null;
  /** Il debito verso l'ente come lo porta il piano, se il piano lo espone. */
  debitoEnte: number | null;
}

export interface ExtraIconografia {
  /** Il confronto fra debito accertato e debito scritto in bilancio. */
  debito: DebitoInBilancio | null;
  /** I valori a fine orizzonte dello scenario, quando è stato sviluppato. */
  prospettico: ProspetticoBilancio | null;
}

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
  /** Il massimo assoluto su cui si scala la barra; null se non c'è nulla da disegnare. */
  massimo: number | null;
  /**
   * Il fondo della scala. È 0 quasi sempre; scende sotto zero quando ci sono
   * valori negativi (patrimonio netto, utile), e allora la barra parte dalla
   * linea dello zero e va a sinistra: senza il fondo, un patrimonio di −85.000
   * si disegnerebbe verso destra come se fosse un attivo.
   */
  minimo: number;
  barre: BarraGrafico[];
  /** Che cosa manca per avere anche il valore attualizzato, quando manca. */
  notaProspettico?: string;
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

/** Il valore più basso fra le barre, se è sotto zero: serve alla linea dello zero. */
const minimoDi = (barre: BarraGrafico[]): number => {
  const valori = barre.map((b) => b.valore).filter((v): v is number => v !== null && v < 0);
  return valori.length > 0 ? Math.min(...valori) : 0;
};

export interface GeometriaBarra {
  /** Dove cade lo zero, in percentuale della traccia. */
  zero: number;
  /** Dove inizia la barra: a sinistra dello zero quando il valore è negativo. */
  inizio: number;
  larghezza: number;
}

/**
 * Dove va disegnata una barra nella sua traccia. Sta nella lib e non nel
 * componente perché è la regola che rende leggibile un valore negativo: se la
 * scala non scende sotto zero, la barra parte dallo zero e non dal bordo.
 */
export function geometriaBarra(valore: number | null, massimo: number, minimo = 0): GeometriaBarra {
  const fondo = Math.min(0, minimo);
  const cima = Math.max(massimo, 1);
  const ampiezza = cima - fondo || 1;
  const posizione = (n: number) => ((n - fondo) / ampiezza) * 100;
  const zero = posizione(0);
  if (valore === null) return { zero, inizio: zero, larghezza: 0 };
  return {
    zero,
    inizio: posizione(Math.min(valore, 0)),
    larghezza: (Math.abs(valore) / ampiezza) * 100,
  };
}

const RISCONTRO: Record<DebitoInBilancio['stato'], string> = {
  CONTABILIZZATO: 'le voci di bilancio verso i creditori pubblici lo contengono',
  NON_CONTABILIZZATO: 'nessun riscontro nelle voci di bilancio: il debito non è contabilizzato',
  NON_VERIFICABILE: 'il confronto con il bilancio non è possibile',
};

function graficoA(dati: DatiIai, debito: DebitoInBilancio | null): GraficoDimensione | null {
  const soglie = dati.ente.soglie;
  if (soglie.length === 0 && !debito) return null;
  // LE DUE RIGHE DEL DEBITO (0.256.6): quello che l'ente ha accertato e quello
  // che l'azienda ne ha scritto in bilancio. Non è una somma né una differenza:
  // sono due fonti diverse sulla stessa posta, e la seconda può essere zero —
  // ed è proprio lo zero che va visto.
  const barre: BarraGrafico[] = [];
  if (debito && debito.esposizione !== null) {
    barre.push({
      etichetta: 'Debito amministrativo accertato',
      valore: debito.esposizione,
      testo: euro(debito.esposizione),
      riferimento: 'verifica amministrativa: l’importo che l’ente vanta',
      segnala: false,
    });
    // `inBilancio` è già 0 quando lo stato è «non contabilizzato»: lo zero qui
    // è un fatto accertato, non un dato mancante.
    const contabile = debito.inBilancio;
    barre.push({
      etichetta: 'Debito contabile iscritto in bilancio',
      valore: contabile,
      testo: contabile === null ? 'voce non letta' : euro(contabile),
      riferimento: RISCONTRO[debito.stato],
      segnala: gravitaDebito(debito) !== 'neutro',
    });
  }
  barre.push(
    ...soglie.map((s) => ({
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
    }))
  );
  return {
    dimensione: 'A',
    titolo: 'Quanto vale l’esposizione, ambito per ambito',
    lettura:
      'Ogni barra è l’esposizione di un ambito dell’art. 25-novies; il confronto dice quale ambito porta l’importo e dove i presupposti risultano integrati.',
    massimo: massimoDi(barre),
    minimo: minimoDi(barre),
    barre,
  };
}

function graficoB(
  dati: DatiIai,
  prospettico: ProspetticoBilancio | null
): GraficoDimensione | null {
  const b = dati.bilancio.corrente;
  if (!b) return null;
  // LA STRUTTURA, IN EURO (0.256.7). Prima erano due rapporti percentuali
  // scalati sul proprio massimo: 6,11% e 8,33% occupavano quasi tutta la barra
  // e sembravano grandezze, mentre dicono una frazione. In euro, patrimonio e
  // debiti si vedono per quello che sono — uno spesso strato e una fetta — e il
  // rapporto, che resta utile, va scritto accanto invece che disegnato.
  const barre: BarraGrafico[] = [];
  const quota = (n: number) => (b.totaleDebiti ? (n / b.totaleDebiti) * 100 : null);
  if (b.patrimonioNetto !== null) {
    const r = quota(b.patrimonioNetto);
    barre.push({
      etichetta: 'Patrimonio netto',
      valore: b.patrimonioNetto,
      testo: euro(b.patrimonioNetto),
      riferimento:
        r === null
          ? 'quota dei debiti non calcolabile: totale debiti non letto'
          : `pari al ${pct(r)} dei debiti totali${
              b.patrimonioNetto < 0 ? ' — il patrimonio è negativo' : ''
            }`,
      segnala: b.patrimonioNetto < 0,
    });
  }
  if (b.totaleDebiti !== null) {
    barre.push({
      etichetta: 'Totale debiti',
      valore: b.totaleDebiti,
      testo: euro(b.totaleDebiti),
      riferimento:
        b.ebitda !== null && b.ricavi
          ? `EBITDA ${pct((b.ebitda / b.ricavi) * 100)} dei ricavi`
          : 'EBITDA non calcolabile: ricavi o EBITDA non letti',
      segnala: false,
    });
  }
  // IL VALORE ATTUALIZZATO (0.256.6): patrimonio netto di bilancio e patrimonio
  // a fine orizzonte sulla stessa scala.
  if (prospettico && prospettico.patrimonioNetto !== null) {
    barre.push({
      etichetta: `Patrimonio netto a fine piano (${prospettico.anno})`,
      valore: prospettico.patrimonioNetto,
      testo: euro(prospettico.patrimonioNetto),
      riferimento: 'attualizzato: il piano di sviluppo dello scenario',
      segnala: prospettico.patrimonioNetto < 0,
    });
  }

  if (!barre.length) return null;
  return {
    dimensione: 'B',
    titolo: 'Come sta in piedi',
    lettura:
      'Patrimonio netto e debiti totali sulla stessa scala: la barra dice quanto pesa ciascuno, il rapporto accanto dice quanto patrimonio c’è per ogni euro di debito.',
    massimo: massimoDi(barre),
    minimo: minimoDi(barre),
    barre,
    notaProspettico: prospettico
      ? undefined
      : 'Il valore attualizzato si calcola quando lo scenario ha un piano di sviluppo: senza piano restano i valori di bilancio.',
  };
}

function graficoC(
  dati: DatiIai,
  prospettico: ProspetticoBilancio | null
): GraficoDimensione | null {
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

  // IL DIFFERENZIALE PROSPETTICO (0.256.6). Accanto alla coppia storica, la
  // stessa voce a fine piano e la sua differenza dal bilancio: è il numero che
  // dice se il piano cambia la direzione o la conferma.
  if (prospettico) {
    const futuro = (cosa: string, ora: number | null, dopo: number | null): BarraGrafico[] => {
      if (dopo === null) return [];
      const differenza = ora === null ? null : dopo - ora;
      return [
        {
          etichetta: `${cosa} a fine piano (${prospettico.anno})`,
          valore: dopo,
          testo: euro(dopo),
          riferimento:
            differenza === null
              ? null
              : `differenza ${differenza >= 0 ? '+' : ''}${euro(differenza)} sul bilancio`,
          segnala: dopo < 0 || (differenza !== null && differenza < 0),
        },
      ];
    };
    barre.push(
      ...futuro('Ricavi', c.ricavi, prospettico.ricavi),
      ...futuro('Utile', c.utile, prospettico.utile),
      ...futuro('Patrimonio netto', c.patrimonioNetto, prospettico.patrimonioNetto),
      ...futuro('Debito verso l’ente', null, prospettico.debitoEnte)
    );
  }

  return {
    dimensione: 'C',
    titolo: 'I due esercizi, accostati',
    lettura:
      'Ogni voce ha la barra dell’ultimo esercizio accanto a quella del precedente: la lunghezza dice il livello, la coppia dice la direzione.',
    massimo: massimoDi(barre),
    // SOTTO ZERO SI VA A SINISTRA. Utile e patrimonio netto possono essere
    // negativi: senza il fondo della scala la barra si disegnerebbe verso destra
    // come se fosse un valore positivo, e il segno resterebbe solo nella cifra.
    minimo: minimoDi(barre),
    barre,
    notaProspettico: prospettico
      ? undefined
      : 'Il differenziale prospettico si calcola quando lo scenario ha un piano di sviluppo: senza piano restano i due esercizi di bilancio.',
  };
}

function avvisoD(componenti: Componente[]): AvvisoAffidabilita | null {
  const d = componenti.find((c) => c.dimensione === 'D');
  if (!d) return null;
  const motivi = [...d.motivi, ...d.lacune];
  const avevaMotivi = motivi.length > 0;
  // UN AVVISO SENZA MOTIVI NON SI LEGGE. Quando l'intensità viene dalla quota
  // di dati dichiarati o non noti nel fascicolo — e non da un fatto singolo che
  // il motore possa nominare — lo si dice: meglio che un riquadro vuoto sotto
  // un titolo che parla di dati inaffidabili.
  if (motivi.length === 0) {
    motivi.push(
      'l’intensità viene dalla quota di dati dichiarati o non noti nel fascicolo, non da un fatto singolo: le voci che mancano sono elencate nella dimensione D'
    );
  }
  if (d.punteggio < 50 && !avevaMotivi) return null;
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
  // LE VARIAZIONI DELLA VISURA (0.256.6): capitale, compagine, oggetto,
  // rappresentante legale, sede, procedure in corso. Sono il motivo per cui la
  // visura si legge accanto al bilancio: dicono che cosa è cambiato nella
  // compagine e nella governance, che il conto economico non registra.
  for (const variazione of v.variazioni ?? []) {
    particolari.push({
      etichetta: variazione.etichetta,
      testo: variazione.testo,
      segnala: variazione.segnala,
    });
  }
  if (v.variazioni === undefined || v.variazioni === null) {
    particolari.push({
      etichetta: 'Variazioni di capitale, compagine e sede',
      testo:
        'la visura precaricata non porta estratte le variazioni: nessuna è dichiarata qui, e non si legge come «nessuna variazione».',
      segnala: false,
    });
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

export function componiIconografia(
  dati: DatiIai,
  componenti: Componente[],
  extra: ExtraIconografia = { debito: null, prospettico: null }
): IconografiaDimensioni {
  const grafici = [
    graficoA(dati, extra.debito),
    graficoB(dati, extra.prospettico),
    graficoC(dati, extra.prospettico),
  ].filter((g): g is GraficoDimensione => g !== null && g.massimo !== null);
  return {
    grafici,
    avvisoAffidabilita: avvisoD(componenti),
    visura: particolariE(dati),
  };
}
