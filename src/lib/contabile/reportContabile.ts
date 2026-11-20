// I TRE REPORT DI TABELLA DELLA VERIFICA CONTABILE E IL REPORT UNICO.
//
// La verifica contabile produce tre tabelle che dicono cose diverse: il
// prospetto (il dato depositato), i differenziali (gli scarti di ogni anno
// dalla base, con il passo che se ne ricava) e la simulazione (i valori anno
// per anno, storico e calcolato). Ognuna chiede una spiegazione: perché quel
// numero, che cosa lo ha mosso, se la serie è rappresentativa. Il report unico
// le mette in fila con le note integrative del bilancio, che sono il testo con
// cui l'azienda spiega quei numeri.
//
// Qui c'è solo la composizione: colonne, righe e testi, con i valori già
// formattati. Nessun accesso al database, nessun HTML: le pagine rendono, i
// test provano.
//
// REGOLA: nessun valore inventato. Una voce che il motore ha tenuto ferma lo
// dichiara accanto al nome; una tabella senza dati dice che cosa manca invece
// di mostrare zeri.

import type { FactTestuale } from '@/lib/xbrl/types';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { selezionaNote, type SezioneNota } from '@/lib/xbrl/note';
import type { ProiezioneContabile } from './proiezione';

export type ChiaveTabella = 'PROSPETTO' | 'DIFFERENZIALI' | 'SIMULAZIONE';

export const CHIAVI_TABELLE: ChiaveTabella[] = ['PROSPETTO', 'DIFFERENZIALI', 'SIMULAZIONE'];

export interface BilancioReport {
  anno: number;
  dati: DatiFinanziariPeriodo;
}

export interface ColonnaTabella {
  etichetta: string;
  /** «storico» / «calcolato»: da dove viene la colonna. */
  sotto: string | null;
}

export interface CellaTabella {
  principale: string;
  dettaglio: string | null;
}

export interface RigaTabella {
  etichetta: string;
  /** «derivata», «ferma», «oltre soglia»…: la qualifica che il lettore deve vedere. */
  qualifica: string | null;
  /** Le righe da leggere (grassetto): EBITDA, EBIT, risultato, patrimonio. */
  forte: boolean;
  celle: CellaTabella[];
}

export interface TabellaReport {
  colonne: ColonnaTabella[];
  righe: RigaTabella[];
  /** Che cosa significano i numeri, secondo il motore che li ha prodotti. */
  nota: string | null;
  /** Perché la tabella non ha righe, se non ne ha. */
  vuota: string | null;
}

export interface SchedaTabella {
  chiave: ChiaveTabella;
  titolo: string;
  introduzione: string;
  /** Le domande a cui la spiegazione deve rispondere, una per riga. */
  domande: string[];
}

export const SCHEDE: Record<ChiaveTabella, SchedaTabella> = {
  PROSPETTO: {
    chiave: 'PROSPETTO',
    titolo: 'Prospetto a scalare',
    introduzione:
      'Le voci dei bilanci depositati, una colonna per annualità, nell’ordine del prospetto e senza riclassifiche. In grassetto EBITDA, EBIT, risultato d’esercizio e patrimonio netto: sono le righe da cui si leggono l’equilibrio e gli indici.',
    domande: [
      'Che cosa spiegano i valori dell’ultimo anno rispetto al precedente?',
      'Quali voci hanno cambiato il quadro (margine, patrimonio, debiti, cassa) e per quale ragione?',
    ],
  },
  DIFFERENZIALI: {
    chiave: 'DIFFERENZIALI',
    titolo: 'Differenziali',
    introduzione:
      'Lo scarto di ogni anno dalla base, in euro e in punti della base, per le voci che hanno una serie propria. Il passo è la ragione geometrica fra primo e ultimo differenziale: è quello che, applicato ai valori dell’ultimo bilancio, costruisce gli anni della simulazione.',
    domande: [
      'Che cosa ha prodotto lo scarto di ogni anno: volume, prezzi, costi, una voce straordinaria?',
      'La serie è rappresentativa del periodo, o un anno la rende non utilizzabile come passo?',
    ],
  },
  SIMULAZIONE: {
    chiave: 'SIMULAZIONE',
    titolo: 'Simulazione alla data della verifica',
    introduzione:
      'I valori anno per anno: gli anni depositati («storico») e quelli costruiti applicando i differenziali all’ultimo bilancio fino all’anno della verifica («calcolato»). Le voci derivate si ricavano dalle motrici; quelle segnate «ferma» non hanno una serie utilizzabile e restano all’ultimo dato.',
    domande: [
      'Le annualità calcolate sono plausibili alla data della verifica?',
      'Che cosa potrebbe cambiare la traiettoria (commesse, finanziamenti, personale, mercato)?',
    ],
  },
};

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : '—';

const punti = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? `${n > 0 ? '+' : ''}${(n * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
    : '—';

const passo = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
    : '—';

/** Le voci del prospetto, nell'ordine in cui si leggono (come in schermata). */
const VOCI_PROSPETTO: {
  etichetta: string;
  chiave: keyof DatiFinanziariPeriodo;
  forte?: boolean;
}[] = [
  { etichetta: 'Ricavi delle vendite', chiave: 'ricaviVendite' },
  { etichetta: 'Valore della produzione', chiave: 'valoreProduzione' },
  { etichetta: 'Costi della produzione', chiave: 'costiProduzione' },
  { etichetta: 'EBITDA', chiave: 'ebitda', forte: true },
  { etichetta: 'Ammortamenti', chiave: 'ammortamenti' },
  { etichetta: 'EBIT', chiave: 'ebit', forte: true },
  { etichetta: 'Oneri finanziari', chiave: 'oneriFinanziari' },
  { etichetta: 'Risultato d’esercizio', chiave: 'utileEsercizio', forte: true },
  { etichetta: 'Patrimonio netto', chiave: 'patrimonioNetto', forte: true },
  { etichetta: 'Totale debiti', chiave: 'totaleDebiti' },
  { etichetta: 'Disponibilità liquide', chiave: 'disponibilitaLiquide' },
];

/** PFN = debiti verso banche − disponibilità liquide; null se una delle due manca. */
const pfn = (d: DatiFinanziariPeriodo): number | null =>
  typeof d.debitiBanche === 'number' && typeof d.disponibilitaLiquide === 'number'
    ? d.debitiBanche - d.disponibilitaLiquide
    : null;

export function tabellaProspetto(bilanci: BilancioReport[]): TabellaReport {
  const ordinati = [...bilanci]
    .filter((b) => Number.isInteger(b.anno))
    .sort((a, b) => a.anno - b.anno);

  if (ordinati.length === 0) {
    return {
      colonne: [],
      righe: [],
      nota: null,
      vuota: 'Nessun bilancio XBRL in archivio: il prospetto non ha colonne da mostrare.',
    };
  }

  const righe: RigaTabella[] = VOCI_PROSPETTO.map((v) => ({
    etichetta: v.etichetta,
    qualifica: null,
    forte: Boolean(v.forte),
    celle: ordinati.map((b) => ({
      principale: euro(b.dati[v.chiave] as number | undefined),
      dettaglio: null,
    })),
  }));
  righe.push({
    etichetta: 'Posizione finanziaria netta',
    qualifica: null,
    forte: true,
    celle: ordinati.map((b) => ({ principale: euro(pfn(b.dati)), dettaglio: null })),
  });

  return {
    colonne: ordinati.map((b) => ({ etichetta: String(b.anno), sotto: null })),
    righe,
    nota: 'Le voci sono quelle dei bilanci XBRL in archivio, senza riclassifiche. La posizione finanziaria netta è debiti verso banche meno disponibilità liquide; quando una delle due voci non è valorizzata la riga resta «—», non uno zero.',
    vuota: null,
  };
}

export function tabellaDifferenziali(proiezione: ProiezioneContabile | null): TabellaReport {
  if (!proiezione) {
    return {
      colonne: [],
      righe: [],
      nota: null,
      vuota:
        'Proiezione non disponibile: senza un bilancio depositato non c’è una base da cui contare i differenziali.',
    };
  }
  if (proiezione.anniArchivio.length === 0) {
    return { colonne: [], righe: [], nota: proiezione.metodo, vuota: null };
  }

  const motrici = proiezione.voci.filter((v) => v.natura === 'MOTRICE');
  const anniScarto = motrici[0]?.differenziali.map((d) => d.anno) ?? [];

  const righe: RigaTabella[] = motrici.map((voce) => ({
    etichetta: voce.etichetta,
    qualifica: voce.proiettabile ? null : 'ferma',
    forte: false,
    celle: [
      { principale: euro(voce.valoreBase), dettaglio: null },
      ...anniScarto.map((anno) => {
        const d = voce.differenziali.find((x) => x.anno === anno);
        return {
          principale: d ? euro(d.scarto) : '—',
          dettaglio: d ? (d.differenziale === null ? 'base zero' : punti(d.differenziale)) : null,
        };
      }),
      { principale: passo(voce.passo), dettaglio: null },
    ],
  }));

  return {
    colonne: [
      { etichetta: `Base ${proiezione.annoBase ?? ''}`.trim(), sotto: null },
      ...anniScarto.map((anno) => ({ etichetta: String(anno), sotto: 'scarto' })),
      { etichetta: 'Passo', sotto: 'ragione' },
    ],
    righe,
    nota: 'Lo scarto è la differenza fra l’anno e la base, in euro; sotto, la stessa differenza in punti della base. Il passo è la ragione geometrica fra primo e ultimo differenziale: con un biennio non si ricava, e la voce resta «ferma».',
    vuota:
      righe.length === 0
        ? 'Nessuna voce motrice nel prospetto: non ci sono differenziali da contare.'
        : null,
  };
}

export function tabellaSimulazione(proiezione: ProiezioneContabile | null): TabellaReport {
  if (!proiezione) {
    return {
      colonne: [],
      righe: [],
      nota: null,
      vuota: 'Proiezione non disponibile: senza il dato depositato non c’è una serie da costruire.',
    };
  }
  if (proiezione.anniArchivio.length === 0) {
    return { colonne: [], righe: [], nota: proiezione.metodo, vuota: null };
  }

  const anniCalcolati = proiezione.annualitaCalcolate;
  const righe: RigaTabella[] = proiezione.voci.map((voce) => ({
    etichetta: voce.etichetta,
    qualifica: voce.natura === 'DERIVATA' ? 'derivata' : voce.proiettabile ? null : 'ferma',
    forte: voce.natura === 'DERIVATA',
    celle: [
      ...voce.storico.map((s) => ({
        principale: s.valore === null ? '—' : euro(s.valore),
        dettaglio: null,
      })),
      ...anniCalcolati.map((anno) => {
        const punto = voce.proiezioni.find((x) => x.anno === anno);
        return { principale: punto ? euro(punto.valore) : '—', dettaglio: null };
      }),
    ],
  }));

  return {
    colonne: [
      ...proiezione.anniArchivio.map((anno) => ({ etichetta: String(anno), sotto: 'storico' })),
      ...anniCalcolati.map((anno) => ({ etichetta: String(anno), sotto: 'calcolato' })),
    ],
    righe,
    nota:
      anniCalcolati.length > 0
        ? `«Calcolato» non è «previsto»: valore della produzione, costi, oneri e debiti seguono la stessa ragione geometrica dei differenziali, applicata ai valori del ${proiezione.annoUltimoBilancio} fino al ${proiezione.annoVerifica}; le voci derivate si ricavano da quelle. «Storico» è il dato depositato, così com’è.`
        : proiezione.metodo,
    vuota:
      righe.length === 0
        ? 'Nessuna voce nel prospetto: la simulazione non ha valori da mostrare.'
        : null,
  };
}

/** Le tre tabelle, ciascuna con la sua scheda: è la materia del report unico. */
export function componiTabelleReport(input: {
  bilanci: BilancioReport[];
  proiezione: ProiezioneContabile | null;
}): { scheda: SchedaTabella; tabella: TabellaReport }[] {
  return [
    { scheda: SCHEDE.PROSPETTO, tabella: tabellaProspetto(input.bilanci) },
    { scheda: SCHEDE.DIFFERENZIALI, tabella: tabellaDifferenziali(input.proiezione) },
    { scheda: SCHEDE.SIMULAZIONE, tabella: tabellaSimulazione(input.proiezione) },
  ];
}

const NOME_SEZIONE: Record<SezioneNota, string> = {
  CONTINUITA: 'Continuità aziendale',
  FATTI_RILIEVO: 'Fatti di rilievo',
  IMPEGNI: 'Impegni e passività potenziali',
  PARTI_CORRELATE: 'Parti correlate',
  EVENTI_STRAORDINARI: 'Eventi straordinari',
  PIANI: 'Piani e prospettive',
  CRITERI: 'Criteri di valutazione',
  ALTRO: 'Altre note',
};

export interface NotaReport {
  sezione: SezioneNota;
  titolo: string;
  testo: string;
}

/**
 * LE NOTE INTEGRATIVE, come testo da mettere accanto ai numeri.
 *
 * Si leggono con `selezionaNote`, la stessa lettura della verifica azienda:
 * testi ripuliti, sezioni rilevanti, tetto dichiarato. Non si convertono in
 * un tasso e non si riassumono con l'AI: sono il documento, non una sintesi.
 */
export function noteIntegrativeReport(fatti: FactTestuale[] | null): {
  note: NotaReport[];
  troncate: boolean;
} {
  if (!fatti || fatti.length === 0) return { note: [], troncate: false };
  const lette = selezionaNote(fatti);
  const perSezione = new Map<SezioneNota, string[]>();
  for (const fatto of lette.fatti) {
    const elenco = perSezione.get(fatto.sezione) ?? [];
    elenco.push(fatto.testo);
    perSezione.set(fatto.sezione, elenco);
  }
  const ordine: SezioneNota[] = [
    'CONTINUITA',
    'PIANI',
    'FATTI_RILIEVO',
    'EVENTI_STRAORDINARI',
    'IMPEGNI',
    'PARTI_CORRELATE',
    'CRITERI',
    'ALTRO',
  ];
  const note: NotaReport[] = ordine
    .filter((s) => (perSezione.get(s)?.length ?? 0) > 0)
    .map((s) => ({
      sezione: s,
      titolo: NOME_SEZIONE[s],
      testo: (perSezione.get(s) ?? []).join('\n\n'),
    }));
  return { note, troncate: lette.troncate };
}
