// src/lib/ritratto/reportIconografia.ts
//
// IL REPORT DELL'ICONOGRAFIA — la stessa fotografia del ritratto, ridotta a un
// foglio A4: tabelle e due grafici, niente prosa.
//
// PERCHÉ NON RICALCOLA. Il report è una riduzione di `Ritratto`, non una
// seconda lettura: gli esiti, le date, le coperture e le intensità entrano ed
// escono identici. Se i due documenti divergessero, l'ente avrebbe due
// fotografie della stessa posizione e nessun modo di sapere quale credere.
//
// PERCHÉ TAGLIA. Un A4 non è una stampa di comodo: è il foglio che si allega,
// e deve stare su un foglio. Gli elenchi lunghi si riducono alle prime voci con
// il resto dichiarato in cifre — il taglio è scritto nel report, non silenzioso
// («e altre 3 voci»), e il testo integrale resta nell'iconografia a schermo.
//
// IL BUDGET DI RIGHE. Le lacune sono lunghe quanto la posizione è incompleta e
// non avevano tetto: bastava una posizione con molte mancanze perché il foglio
// sforasse in silenzio. Il modello ora conta le righe di ogni blocco contro
// `RIGHE_FOGLIO` e tiene le lacune finché il conto regge; le altre si contano
// (`mancanzeOltre`) e la pagina le dichiara. Il budget è una stima prudente, con
// le stesse unità per tabelle ed elenchi: impedisce la crescita senza fine, non
// centra il foglio al millimetro.
//
// Il modello non conosce i CSS: dà i toni (rosso/giallo/verde, letta/parziale)
// e le parole già decise, perché la pagina non li ricalcoli a mano.
//
// Funzione pura, con i suoi test.

import type { EsitoAttenzione } from '@/lib/screening/indicatore';
import type { Stadio } from '@/lib/verificaAzienda/direttrici';
import { ETICHETTA_BARRA_DEBITO } from './iconografia';
import type { Ritratto, StatoLettura } from './ritratto';

export interface RigaReport {
  etichetta: string;
  valore: string;
}

export interface RigaDirettriceReport {
  nome: string;
  /** Lo stadio come lo chiama il motore: la pagina sceglie il colore da qui. */
  stato: Stadio;
  /** «Fatta», «Cominciata»…: la parola da stampare. */
  etichettaStato: string;
  richiede: string | null;
}

export interface BarraDimensioneReport {
  lettera: string;
  nome: string;
  /** Intensità 0-100: la barra, non un voto. */
  punteggio: number;
  lettura: string;
  /** Per la classe CSS che colora la barra. */
  tono: 'letta' | 'parziale' | 'non-letta';
}

export interface RigaFattoReport {
  testo: string;
  /** true quando il testo è stato ridotto: il report lo dichiara. */
  ridotto: boolean;
}

export type TonoGiudizio = 'rosso' | 'giallo' | 'verde';

export interface GiudizioReport {
  etichetta: string;
  /** La parola del semaforo, solo quando aggiunge qualcosa all'etichetta. */
  parola: string | null;
  tono: TonoGiudizio;
  fattore: string | null;
  copertura: {
    determinate: number;
    totali: number;
    testo: string;
    /** true quando il giudizio vale solo su una parte delle dimensioni. */
    limitata: boolean;
    /** Percentuale intera, per l'arco del grafico. */
    percentuale: number;
  } | null;
  accertato: RigaFattoReport[];
  accertatoOltre: number;
  daAccertare: RigaFattoReport[];
  daAccertareOltre: number;
}

/**
 * IL DEBITO E LA STRUTTURA SUL FOGLIO (0.256.17). Il foglio portava solo le
 * cinque barre di intensità: il debito accertato/iscritto e il patrimonio sui
 * debiti restavano a schermo, e sono la prima cosa che si cerca su un allegato.
 * I valori non si ricalcolano: si ripescano dai grafici già composti (box A e
 * box B), riconoscendo le righe del debito dal loro nome.
 */
export interface RigaValoreReport {
  etichetta: string;
  /** Il valore già scritto: «152.000 €», «non letto». */
  testo: string;
  /** Che cosa significa: il riscontro, il rapporto sui debiti, o nulla. */
  riferimento: string | null;
}

export interface DebitoFoglioReport {
  righe: RigaValoreReport[];
  /** Il riscontro del debito iscritto: «contabilizzato solo in parte…». */
  riscontro: string | null;
}

export interface StrutturaFoglioReport {
  barre: (RigaValoreReport & {
    /** Lunghezza della barra sul massimo del grafico, 0-100. */
    larghezza: number;
    /** true quando il valore è sotto zero: si stampa in rosso, come a schermo. */
    negativo: boolean;
  })[];
  /** Che cosa mostra il grafico, come lo dice l'iconografia a schermo. */
  lettura: string;
}

/** Il conto delle righe: quanto costa il foglio e se qualcosa è rimasto fuori. */
export interface BudgetFoglioReport {
  /** Righe disponibili su un A4 con i margini di questo report. */
  disponibili: number;
  /** Righe che il contenuto occupa davvero. */
  usate: number;
  /** true quando una lacuna è stata lasciata fuori per stare sul foglio. */
  tagliato: boolean;
  /** true quando nemmeno il contenuto fisso sta: il foglio lo dichiara. */
  sfora: boolean;
}

export interface ReportIconografia {
  /** Il conto del foglio: righe disponibili, righe usate, se si è tagliato. */
  budget: BudgetFoglioReport;
  titolo: string;
  sottotitolo: string | null;
  attiva: boolean;
  generatoIl: string;
  /** Righe della tabella «L'impresa»: già etichettate come si stampano. */
  impresa: RigaReport[];
  direttrici: RigaDirettriceReport[];
  /** «3 verifiche fatte su 3», come lo dice il ritratto. */
  direttriciNota: string;
  giudizio: GiudizioReport | null;
  dimensioni: BarraDimensioneReport[];
  dimensioniNota: string;
  /** Il debito accertato e quello iscritto in bilancio, dal box A. */
  debito: DebitoFoglioReport | null;
  /** Il grafico della struttura (patrimonio, debiti), dal box B. */
  struttura: StrutturaFoglioReport | null;
  mancanze: string[];
  /** Lacune che non stanno sul foglio: si dichiarano in cifre. */
  mancanzeOltre: number;
  /** Che cosa è stato ridotto, e dove si legge per intero. */
  notaRiduzione: string;
}

const LETTURA: Record<StatoLettura, { testo: string; tono: BarraDimensioneReport['tono'] }> = {
  LETTA: { testo: 'letta', tono: 'letta' },
  PARZIALE: { testo: 'parziale', tono: 'parziale' },
  NON_LETTA: { testo: 'non misurata', tono: 'non-letta' },
};

const TONO: Record<EsitoAttenzione, TonoGiudizio> = {
  ROSSO: 'rosso',
  GIALLO: 'giallo',
  ATTENZIONE_MINIMA: 'verde',
};

/** Le voci che stanno su un foglio: oltre, il resto si conta. */
const MASSIMO_VOCI = 2;
const MASSIMO_CARATTERI = 190;

/**
 * Quante righe regge il foglio: i 279 mm utili di un A4 divisi per i 4,2 mm di
 * una riga media (tabella o elenco, interlinea compresa) danno 66 righe. Il
 * conto dei blocchi è prudente — ogni sezione paga anche il proprio titolo e i
 * propri margini — quindi se il modello dice che il contenuto sta, sul foglio
 * c'è posto. Non è un motore di impaginazione: impedisce la crescita senza
 * fine, non centra il foglio al millimetro.
 */
export const RIGHE_FOGLIO = 66;

/** Caratteri per riga: a tutta larghezza e in una colonna della griglia. */
const CARATTERI_RIGA = 108;
const CARATTERI_COLONNA = 48;

/** Quante righe occupa un testo alla larghezza data (almeno una). */
function righeDi(testo: string, caratteri = CARATTERI_RIGA): number {
  return Math.max(1, Math.ceil(testo.trim().length / caratteri));
}

/** Riduce un testo senza spezzare una parola a metà. */
function riduci(testo: string): RigaFattoReport {
  const pulito = testo.trim();
  if (pulito.length <= MASSIMO_CARATTERI) return { testo: pulito, ridotto: false };
  const tagliato = pulito.slice(0, MASSIMO_CARATTERI);
  const spazio = tagliato.lastIndexOf(' ');
  return { testo: `${spazio > 0 ? tagliato.slice(0, spazio) : tagliato}…`, ridotto: true };
}

function voci(vociTesto: string[]): { righe: RigaFattoReport[]; oltre: number } {
  const piene = vociTesto.filter((v) => v.trim().length > 0);
  return {
    righe: piene.slice(0, MASSIMO_VOCI).map((v) => riduci(v)),
    oltre: Math.max(0, piene.length - MASSIMO_VOCI),
  };
}

export function componiReportIconografia(
  ritratto: Ritratto,
  generatoIl: string
): ReportIconografia {
  const { testata, direttrici, giudizio, dimensioni, mancanze } = ritratto;

  const impresa: RigaReport[] = [...testata.identificativi];
  impresa.push({
    etichetta: 'Verifica amministrativa',
    valore: testata.verificataIl ? `del ${testata.verificataIl}` : 'mai eseguita',
  });
  impresa.push({
    etichetta: 'Debito memorizzato',
    valore: testata.debito
      ? `${testata.debito.testo}${testata.debito.il ? ` · ${testata.debito.il}` : ''}`
      : 'nessun debito memorizzato',
  });

  const accertato = voci(giudizio.accertato);
  const daAccertare = voci(giudizio.daAccertare);
  const etichetta = giudizio.etichetta ?? '';

  const giudizioReport: GiudizioReport | null = giudizio.presente
    ? {
        etichetta,
        parola: giudizio.parola?.toLowerCase() === etichetta.toLowerCase() ? null : giudizio.parola,
        tono: TONO[giudizio.esito ?? 'GIALLO'],
        fattore: giudizio.fattoreDeterminante,
        copertura: giudizio.copertura
          ? {
              ...giudizio.copertura,
              percentuale: Math.round(
                (giudizio.copertura.determinate / Math.max(1, giudizio.copertura.totali)) * 100
              ),
            }
          : null,
        accertato: accertato.righe,
        accertatoOltre: accertato.oltre,
        daAccertare: daAccertare.righe,
        daAccertareOltre: daAccertare.oltre,
      }
    : null;

  // IL DEBITO DEL BOX A. Le due righe si riconoscono dal nome: se il confronto
  // non c'è (nessun debito memorizzato) il blocco non compare, invece di
  // stampare due caselle vuote.
  const graficoA = ritratto.iconografia?.grafici.find((g) => g.dimensione === 'A') ?? null;
  const righeDebito: RigaValoreReport[] = (graficoA?.barre ?? [])
    .filter(
      (b) =>
        b.etichetta === ETICHETTA_BARRA_DEBITO.accertato ||
        b.etichetta === ETICHETTA_BARRA_DEBITO.iscritto
    )
    .map((b) => ({ etichetta: b.etichetta, testo: b.testo, riferimento: b.riferimento }));
  const debito: DebitoFoglioReport | null =
    righeDebito.length > 0
      ? {
          righe: righeDebito,
          riscontro:
            righeDebito.find((r) => r.etichetta === ETICHETTA_BARRA_DEBITO.iscritto)?.riferimento ??
            null,
        }
      : null;

  // LA STRUTTURA DEL BOX B: patrimonio netto e debiti totali sulla stessa scala,
  // con la lunghezza già calcolata qui (la pagina non fa conti).
  const graficoB = ritratto.iconografia?.grafici.find((g) => g.dimensione === 'B') ?? null;
  const massimoStruttura = graficoB?.massimo ?? null;
  const struttura: StrutturaFoglioReport | null =
    graficoB && graficoB.barre.length > 0
      ? {
          lettura: graficoB.lettura,
          barre: graficoB.barre.map((b) => ({
            etichetta: b.etichetta,
            testo: b.testo,
            riferimento: b.riferimento,
            larghezza:
              b.valore === null || !massimoStruttura
                ? 0
                : Math.min(100, (Math.abs(b.valore) / massimoStruttura) * 100),
            negativo: b.valore !== null && b.valore < 0,
          })),
        }
      : null;

  const ridotto = [...accertato.righe, ...daAccertare.righe].some((r) => r.ridotto)
    ? 'Le voci di «Accertato» e «Da accertare» sono ridotte per stare sul foglio: il testo integrale è nell’iconografia a schermo.'
    : 'Nessuna voce è stata ridotta: il foglio riporta il testo integrale.';

  // Il budget: prima i blocchi che ci sono sempre, poi le lacune una a una.
  // Una lacuna troppo lunga non blocca le successive: si prova la prossima,
  // così il foglio si riempie di ciò che ci sta invece di fermarsi al primo
  // scarto.
  // Ogni blocco paga titolo e margini oltre alle righe di testo: è il margine
  // che rende prudente il conto.
  const righeImpresa = 1 + impresa.reduce((n, r) => n + righeDi(r.valore, CARATTERI_COLONNA), 0);
  const righeGiudizio = giudizioReport ? 1 + 4 : 1;
  const righeDirettrici = 1 + 2 + direttrici.voci.length + 2;
  const righeDimensioni = dimensioni.voci.length > 0 ? 1 + dimensioni.voci.length * 2 + 4 : 1;
  const righeFatti = giudizioReport
    ? 1 + 2 + Math.max(giudizioReport.accertato.length, giudizioReport.daAccertare.length) + 2
    : 0;
  // I due blocchi nuovi pagano titolo e margini come gli altri: la riga del
  // riscontro e la didascalia della struttura sono righe, non decorazioni.
  const costoDebito = debito ? 1 + debito.righe.length + (debito.riscontro ? 1 : 0) + 1 : 0;
  const costoStruttura = struttura ? 1 + struttura.barre.length + 2 : 0;
  const righeFisse =
    6 +
    1 +
    Math.max(righeImpresa, righeGiudizio) +
    righeDirettrici +
    righeDimensioni +
    costoDebito +
    costoStruttura +
    righeFatti +
    2;

  const righeDisponibili = Math.max(0, RIGHE_FOGLIO - righeFisse);
  const mancanzeTenute: string[] = [];
  let mancanzeOltre = 0;
  let righeMancanze = 0;
  for (const testo of mancanze) {
    const costo = righeDi(testo);
    if (righeMancanze + costo <= righeDisponibili) {
      mancanzeTenute.push(testo);
      righeMancanze += costo;
    } else {
      mancanzeOltre += 1;
    }
  }

  return {
    titolo: testata.nome,
    sottotitolo: testata.sottotitolo,
    attiva: testata.attiva,
    generatoIl,
    impresa,
    direttrici: direttrici.voci.map((v) => ({
      nome: v.nome,
      stato: v.stato,
      etichettaStato: v.etichettaStato,
      richiede: v.richiede,
    })),
    direttriciNota: direttrici.nota,
    giudizio: giudizioReport,
    dimensioni: dimensioni.voci.map((v) => ({
      lettera: v.lettera,
      nome: v.nome,
      punteggio: Math.max(0, Math.min(100, v.punteggio)),
      lettura: LETTURA[v.stato].testo,
      tono: LETTURA[v.stato].tono,
    })),
    dimensioniNota: dimensioni.nota,
    debito,
    struttura,
    // Le mancanze entrano finché il budget del foglio le regge: quelle che
    // restano fuori si contano, e la pagina le dichiara.
    mancanze: mancanzeTenute,
    mancanzeOltre,
    budget: {
      disponibili: RIGHE_FOGLIO,
      usate: righeFisse + righeMancanze,
      tagliato: mancanzeOltre > 0,
      sfora: righeFisse > RIGHE_FOGLIO,
    },
    notaRiduzione: ridotto,
  };
}
