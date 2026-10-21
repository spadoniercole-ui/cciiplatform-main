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
// data e la fonte, e non promette che il numero sia definitivo.

import { ETICHETTE_TRATTAMENTO } from '@/lib/debitiEnte/veraImport';
import {
  raggruppaPerReparto,
  type CategoriaSenzaLavorazione,
  type LavorazioneConfig,
  type RigaVeraComunicazione,
} from './comunicazioni';

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
  /** Nome del file da scaricare, già sicuro per il filesystem. */
  nomeFile: string;
}

export interface EsitoDocumentiReparto {
  documenti: DocumentoReparto[];
  /** Tipologie presenti nel V.E.R.A. senza lavorazione: nessun reparto. */
  categorieSenzaLavorazione: CategoriaSenzaLavorazione[];
  /** Posizioni senza categoria: non attribuibili, restano fuori. */
  righeSenzaCategoria: number;
}

/** Nome file leggibile e senza caratteri che il browser o il sistema rifiutano. */
function slug(testo: string): string {
  return (testo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function nomeFileReparto(azienda: string, reparto: string): string {
  const a = slug(azienda) || 'azienda';
  const r = slug(reparto) || 'reparto';
  return `comunica_reparti_${a}_${r}.pdf`;
}

const trattamenti = ETICHETTE_TRATTAMENTO as Record<string, string>;

/**
 * Un documento per reparto: le posizioni da lavorare, le attività di
 * contabilizzazione configurate per le loro tipologie, i totali.
 */
export function preparaDocumentiReparto(input: {
  azienda: string;
  /** Data della verifica, AAAA-MM-GG. */
  dataVerifica: string;
  righe: RigaVeraComunicazione[];
  lavorazioni: LavorazioneConfig[];
  /** codice categoria → etichetta mostrata (fallback: il codice). */
  etichette: Record<string, string>;
}): EsitoDocumentiReparto {
  const etichetta = (codice: string) => input.etichette[codice]?.trim() || codice;
  const raggruppamento = raggruppaPerReparto(input);

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

    return {
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
      nomeFile: nomeFileReparto(input.azienda, g.destinatario),
    };
  });

  return {
    documenti,
    categorieSenzaLavorazione: raggruppamento.categorieSenzaLavorazione,
    righeSenzaCategoria: raggruppamento.righeSenzaCategoria,
  };
}
