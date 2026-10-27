// src/lib/lavorazioni/reparti.ts
//
// DAL V.E.R.A. AI DOCUMENTI PER I REPARTI.
//
// Il triage finisce con i debiti dell'azienda in fila e con la domanda che
// viene dopo: chi li deve lavorare, e che cosa deve fare perché il debito
// sia contabilizzato. Il testo da copiare (`comunicazioni.ts`) risponde a
// un collega preciso; qui si prepara un documento per REPARTO, da allegare
// a una comunicazione ufficiale: elenca i debiti da lavorare e le attività
// di contabilizzazione, con i totali.
//
// PERCHÉ UN DOCUMENTO PER REPARTO E NON UNO SOLO. Ogni reparto riceve solo
// ciò che gli compete: un PDF unico costringerebbe chi lo riceve a
// distinguere le proprie posizioni da quelle degli altri, e a ogni reparto
// arriverebbero i debiti degli altri. Il raggruppamento è lo stesso delle
// comunicazioni — di cui questo modulo è la seconda uscita — così non
// esistono due verità su chi segue cosa.
//
// COSA NON FA. Non invia nulla, non conosce indirizzi e non sceglie per
// l'ufficio: i file si scaricano, l'invio è a cura di chi li scarica.
// Non blocca né sostituisce la presa in carico: è una funzione accanto.
//
// QUANTO VALE IL TOTALE. È la somma delle posizioni elencate: i debiti che
// risultano dai documenti dell'ente alla data della verifica. Non è un
// accertamento della singola partita — per questo il documento dichiara la
// data e la fonte, e non promette che il numero sia definitivo. E non è il
// totale del V.E.R.A.: le posizioni già contabilizzate non si elencano (non
// c'è nulla da fare) e il documento ne dichiara numero e importo, con la
// quota di TS 25/27/81 dove resta solo la decisione dell'invio ad AdR.
// La regola sta in `daLavorare.ts`, condivisa con la comunicazione al
// collega e con il report per unità operativa.
//
// LA VERSIONE. Ogni documento porta un'impronta del proprio contenuto
// (`versione`): è stampata sul PDF e finisce nel registro delle consegne, così
// si può dire se il reparto ha in mano la versione che si sta guardando o una
// precedente. Senza, «consegnato il 12 ottobre» non direbbe consegnato COSA.

import { ETICHETTE_TRATTAMENTO } from '@/lib/debitiEnte/veraImport';
import {
  raggruppaPerReparto,
  type CategoriaSenzaLavorazione,
  type LavorazioneConfig,
  type PosizioniEscluse,
  type RaggruppamentoPerReparto,
  type RigaVeraComunicazione,
} from './comunicazioni';
import type { RiepilogoRighe } from './daLavorare';

export interface PosizioneReparto {
  /** Tipologia di debito, con l'etichetta dello spazio. */
  categoria: string;
  sezione: string;
  voce: string;
  periodo: string | null;
  stato: string;
  /** Contabilizzato / Da contabilizzare / … */
  trattamento: string;
  importo: number;
}

export interface AttivitaReparto {
  /** Il compito configurato per la tipologia. */
  lavorazione: string;
  /** Tipologie a cui si applica, con l'etichetta dello spazio. */
  categorie: string[];
}

export interface DocumentoReparto {
  /** Il reparto o il collega a cui il documento è destinato. */
  reparto: string;
  oggetto: string;
  azienda: string;
  /** Data della verifica, AAAA-MM-GG. */
  dataVerifica: string;
  posizioni: PosizioneReparto[];
  attivita: AttivitaReparto[];
  righe: number;
  totale: number;
  /** Quante posizioni non sono ancora contabilizzate, e per quanto. */
  posizioniDaContabilizzare: number;
  importoDaContabilizzare: number;
  /**
   * Posizioni fuori perimetro (sospese, trattamento «Ignora»): non sono
   * elencate e non entrano nel totale. Si dichiarano perché chi riceve il
   * documento sappia che il file ne conteneva altre, e per quanto.
   */
  posizioniEscluse: PosizioniEscluse;
  /**
   * Posizioni già contabilizzate: non si elencano, perché non c'è nulla da
   * fare. Si dichiarano — con la quota di TS 25/27/81, dove resta la sola
   * decisione dell'invio ad AdR — perché il totale del documento non è il
   * totale del V.E.R.A. e chi confronta i due numeri deve trovare la
   * spiegazione sul foglio, non doverla dedurre.
   */
  contabilizzate: RiepilogoRighe;
  contabilizzateAdr: RiepilogoRighe;
  codiciAdr: string[];
  /**
   * Lo stesso debito scritto due volte nel file («F24 non presentato» e
   * «Denunce non trasmesse»): scontato dalla dichiarazione qui sopra, e detto
   * sul foglio perché il conto torni a chi somma le righe del V.E.R.A.
   */
  duplicati?: RiepilogoRighe;
  /** Nome del file da scaricare, già sicuro per il filesystem. */
  nomeFile: string;
  /**
   * Impronta del contenuto, stampata sul PDF e nel registro delle consegne.
   * Identifica IL documento consegnato: se le posizioni cambiano, cambia.
   */
  versione: string;
}

export interface EsitoDocumentiReparto {
  documenti: DocumentoReparto[];
  /** Tipologie presenti nel V.E.R.A. senza lavorazione: nessun reparto. */
  categorieSenzaLavorazione: CategoriaSenzaLavorazione[];
  /** Posizioni senza categoria: non attribuibili, restano fuori. */
  righeSenzaCategoria: number;
  /** Posizioni fuori perimetro: dichiarate, non elencate. */
  posizioniEscluse: PosizioniEscluse;
  /** Posizioni già contabilizzate: dichiarate, non elencate. */
  contabilizzate: RiepilogoRighe;
  contabilizzateAdr: RiepilogoRighe;
  codiciAdr: string[];
  duplicati: RiepilogoRighe;
}

/** Nome file leggibile e senza caratteri che il browser o il sistema rifiutano. */
/**
 * Versione del formato del documento. Cambia quando cambia la struttura del
 * PDF (sezioni, colonne): due documenti con la stessa impronta di contenuto ma
 * impaginati in modo diverso non devono risultare la stessa versione.
 */
export const FORMATO_DOCUMENTO_REPARTI = '2';

/**
 * FNV-1a a 32 bit, in esadecimale: un'impronta corta del contenuto.
 *
 * Perché non SHA-256: questa versione si calcola nel BROWSER, insieme al
 * documento, e deve essere disponibile in modo sincrono per stamparla sul PDF
 * e registrarla nello stesso istante. `crypto.subtle` è asincrono e non
 * esiste su ogni contesto; qui serve solo distinguere due contenuti, non
 * resistere a un attacco.
 */
function improntaContenuto(testo: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i += 1) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Versione del documento: formato + impronta di ciò che il reparto legge.
 *
 * Conta tutto quello che compare nel PDF — intestazione, posizioni (anche
 * l'ordine), attività, totali, posizioni dichiarate fuori perimetro — e
 * nient'altro: la data di generazione non entra, altrimenti lo stesso
 * documento consegnato due volte risulterebbe cambiato. Serve a rispondere a
 * una domanda sola: «il reparto ha in mano la versione che vedo adesso?».
 *
 * Il nome del file resta fuori: è un'etichetta di scaricamento, non un
 * contenuto, e cambiarlo non cambia ciò che il reparto legge.
 */
export function versioneDocumentoReparto(
  d: Omit<DocumentoReparto, 'versione' | 'nomeFile'>
): string {
  const parti = [
    FORMATO_DOCUMENTO_REPARTI,
    d.azienda,
    d.reparto,
    d.oggetto,
    d.dataVerifica,
    ...d.posizioni.map((p) =>
      [p.categoria, p.sezione, p.voce, p.periodo ?? '', p.trattamento, p.importo.toFixed(2)].join(
        '|'
      )
    ),
    ...d.attivita.map((a) => [a.lavorazione, a.categorie.join(',')].join('|')),
    d.totale.toFixed(2),
    String(d.posizioniDaContabilizzare),
    d.importoDaContabilizzare.toFixed(2),
    String(d.posizioniEscluse.righe),
    d.posizioniEscluse.totale.toFixed(2),
    String(d.contabilizzate.righe),
    d.contabilizzate.totale.toFixed(2),
    String(d.contabilizzateAdr.righe),
    d.contabilizzateAdr.totale.toFixed(2),
    d.codiciAdr.join(','),
  ];
  return `${FORMATO_DOCUMENTO_REPARTI}-${improntaContenuto(parti.join('\n'))}`;
}

function slug(testo: string): string {
  return (testo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Nome del file, con la versione in coda quando c'è.
 *
 * Due destinatari con slug uguale («Città» e «Citta») produrrebbero lo stesso
 * nome, e il secondo scaricamento sovrascriverebbe il primo nella cartella dei
 * download: la versione rende il nome unico proprio dove serve, cioè tra due
 * documenti diversi.
 */
export function nomeFileReparto(azienda: string, reparto: string, versione?: string): string {
  const a = slug(azienda) || 'azienda';
  const r = slug(reparto) || 'reparto';
  const impronta = versione?.split('-').pop()?.trim();
  const coda = impronta && /^[0-9a-f]{8}$/.test(impronta) ? `_${impronta}` : '';
  return `comunica_reparti_${a}_${r}${coda}.pdf`;
}

const trattamenti = ETICHETTE_TRATTAMENTO as Record<string, string>;

/**
 * Un documento per reparto: le posizioni da lavorare, le attività di
 * contabilizzazione configurate per le loro tipologie, i totali.
 */
export function preparaDocumentiReparto(
  input: {
    azienda: string;
    /** Data della verifica, AAAA-MM-GG. */
    dataVerifica: string;
    righe: RigaVeraComunicazione[];
    lavorazioni: LavorazioneConfig[];
    /** codice categoria → etichetta mostrata (fallback: il codice). */
    etichette: Record<string, string>;
  },
  /** Raggruppamento già calcolato, condiviso con le comunicazioni. */
  raggruppamentoPronto?: RaggruppamentoPerReparto
): EsitoDocumentiReparto {
  const etichetta = (codice: string) => input.etichette[codice]?.trim() || codice;
  const raggruppamento = raggruppamentoPronto ?? raggruppaPerReparto(input);

  const documenti = raggruppamento.gruppi.map((g) => {
    const posizioni: PosizioneReparto[] = g.righe.map((r) => ({
      categoria: etichetta(r.categoria),
      sezione: r.sezione,
      voce: r.voce,
      periodo: r.periodo?.trim() ? r.periodo.trim() : null,
      stato: r.stato.trim(),
      trattamento: trattamenti[r.trattamento] ?? String(r.trattamento ?? '').trim(),
      importo: r.importo,
    }));

    const daContabilizzare = g.righe.filter((r) => r.trattamento === 'da_contabilizzare');

    const contenuto = {
      reparto: g.destinatario,
      oggetto: `Posizione debitoria ${input.azienda} — debiti da lavorare e attività di contabilizzazione`,
      azienda: input.azienda,
      dataVerifica: input.dataVerifica,
      posizioni,
      attivita: g.lavorazioni.map((l) => ({
        lavorazione: l.lavorazione,
        categorie: l.categorie.map(etichetta),
      })),
      righe: posizioni.length,
      totale: g.totale,
      posizioniDaContabilizzare: daContabilizzare.length,
      importoDaContabilizzare: daContabilizzare.reduce((a, r) => a + r.importo, 0),
      posizioniEscluse: raggruppamento.posizioniEscluse,
      contabilizzate: raggruppamento.contabilizzate,
      contabilizzateAdr: raggruppamento.contabilizzateAdr,
      codiciAdr: raggruppamento.codiciAdr,
      duplicati: raggruppamento.duplicati,
    };

    const versione = versioneDocumentoReparto(contenuto);

    return {
      ...contenuto,
      nomeFile: nomeFileReparto(input.azienda, g.destinatario, versione),
      versione,
    };
  });

  return {
    documenti,
    categorieSenzaLavorazione: raggruppamento.categorieSenzaLavorazione,
    righeSenzaCategoria: raggruppamento.righeSenzaCategoria,
    posizioniEscluse: raggruppamento.posizioniEscluse,
    contabilizzate: raggruppamento.contabilizzate,
    contabilizzateAdr: raggruppamento.contabilizzateAdr,
    codiciAdr: raggruppamento.codiciAdr,
    duplicati: raggruppamento.duplicati,
  };
}
