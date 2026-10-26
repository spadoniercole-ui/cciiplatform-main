// src/lib/lavorazioni/comunicazioni.ts
//
// DAL V.E.R.A. ALLA COMUNICAZIONE AL COLLEGA.
//
// Il file V.E.R.A. dice quali posizioni esistono, di che natura sono, in che
// stato e per quale periodo. La tabella «Lavorazioni» dice, per ogni
// tipologia di debito, che cosa va fatto e a chi va chiesto. Questo modulo
// unisce le due cose e produce un testo pronto da inviare.
//
// PERCHÉ IL TESTO SI COMPONE QUI E NON NEL COMPONENTE. Le regole sono
// verificabili e devono restare stabili: una posizione senza categoria non
// riceve una categoria inventata; una categoria senza lavorazione non
// produce una comunicazione muta; una lavorazione disattivata non viene
// usata. Sono tutte decisioni di dominio, non di impaginazione.
//
// COSA NON FA. Non invia nulla e non conosce indirizzi: l'invio è personale,
// come richiesto. Non qualifica la posizione giuridicamente e non promette
// esiti: si limita a mettere in fila i dati del file e la lavorazione
// configurata.
//
// Il raggruppamento è per DESTINATARIO, non per categoria: un collega che
// segue più tipologie riceve una sola comunicazione con le lavorazioni
// distinte, invece di tre messaggi parziali. Se la stessa tipologia è
// assegnata a due colleghi, la posizione compare in entrambe le
// comunicazioni — sono due competenze, non un doppione.
//
// IL RAGGRUPPAMENTO È UNO SOLO. `raggruppaPerReparto` è la definizione
// condivisa da due uscite: il testo da copiare (questo modulo) e i PDF per
// reparto (`reparti.ts`). Se ognuna avesse la propria copia, una riga senza
// categoria o una tipologia senza lavorazione finirebbe fuori da un'uscita e
// dentro l'altra, e nessuno saprebbe quale delle due dice il vero.
//
// FUORI PERIMETRO ≠ DIMENTICATE. Le posizioni con trattamento `ignora`
// (tipicamente le partite sospese da un giudice) non si lavorano e non si
// contabilizzano: entrare in un elenco intitolato «debiti da lavorare» e
// soprattutto nel suo totale le renderebbe un debito da versare, e la stessa
// azienda avrebbe due esposizioni diverse a seconda della scheda guardata (il
// triage, per le soglie, le esclude già — vedi `totaliVera`). Restano però
// contate e dichiarate, con il loro importo: un'esclusione silenziosa è
// indistinguibile da una riga persa.

import { ETICHETTE_TRATTAMENTO, type TrattamentoVera } from '@/lib/debitiEnte/veraImport';
// L'ufficio si riconosce dalla sua chiave, non dalla grafia: lo stesso
// destinatario scritto con maiuscole, spazi o accenti diversi resta UNO.
import { chiaveDipendenza, nomeDipendenza } from './dipendenze';

export interface LavorazioneConfig {
  categoria: string;
  lavorazione: string;
  destinatario: string;
  /** Le lavorazioni spente restano in tabella ma non generano comunicazioni. */
  attivo?: boolean;
}

export interface RigaVeraComunicazione {
  sezione: string;
  voce: string;
  importo: number;
  categoria: string;
  stato: string;
  trattamento: TrattamentoVera;
  periodo?: string;
}

export interface ComunicazioneStandard {
  destinatario: string;
  oggetto: string;
  corpo: string;
  categorie: string[];
  lavorazioni: string[];
  righe: number;
  totale: number;
}

export interface CategoriaSenzaLavorazione {
  categoria: string;
  etichetta: string;
  righe: number;
  totale: number;
}

export interface PosizioniEscluse {
  righe: number;
  /** Somma degli importi esclusi: si dichiara, non si conta nei totali. */
  totale: number;
}

export interface EsitoComunicazioniVera {
  comunicazioni: ComunicazioneStandard[];
  /** Tipologie presenti nel V.E.R.A. per cui nessuna lavorazione è configurata. */
  categorieSenzaLavorazione: CategoriaSenzaLavorazione[];
  /** Posizioni V.E.R.A. senza categoria: sezioni non mappate. Restano fuori. */
  righeSenzaCategoria: number;
  /** Posizioni fuori perimetro (trattamento `ignora`): dichiarate, non elencate. */
  posizioniEscluse: PosizioniEscluse;
}

// Un formatter solo per tutti gli importi. `toLocaleString` ne costruisce uno
// nuovo a ogni chiamata: su un V.E.R.A. grande la differenza è di un ordine di
// grandezza, e questa funzione gira una volta per posizione in ogni
// comunicazione e di nuovo nel PDF. Il formato è lo stesso.
const FORMATTER_EURO = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // `auto` (il default) in italiano NON raggruppa i numeri di quattro
  // cifre: 1.200 diventerebbe «1200,00». In un documento che si invia a un
  // collega la differenza si vede, e sembra un refuso.
  useGrouping: true,
});

// Come per gli importi: un collatore riusato al posto di uno costruito a ogni
// confronto (l'ordinamento è O(n log n), i confronti sono molti).
const COLLATORE_IT = new Intl.Collator('it-IT');

export function formattaImportoEuro(importo: number): string {
  if (!Number.isFinite(importo) || Math.abs(importo) < 0.005) return 'importo non determinato';
  return `${FORMATTER_EURO.format(importo)} €`;
}

function dataItaliana(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dataIso;
  return d.toLocaleDateString('it-IT', { timeZone: 'UTC' });
}

interface GruppoDestinatario {
  destinatario: string;
  righe: Set<RigaVeraComunicazione>;
  /** lavorazione → categorie a cui si applica. */
  lavorazioni: Map<string, Set<string>>;
}

/** Un destinatario con le sue posizioni e le sue lavorazioni, già ordinate. */
export interface GruppoReparto {
  destinatario: string;
  righe: RigaVeraComunicazione[];
  lavorazioni: { lavorazione: string; categorie: string[] }[];
  categorie: string[];
  totale: number;
}

export interface RaggruppamentoPerReparto {
  gruppi: GruppoReparto[];
  categorieSenzaLavorazione: CategoriaSenzaLavorazione[];
  righeSenzaCategoria: number;
  posizioniEscluse: PosizioniEscluse;
}

export interface InputRaggruppamento {
  righe: RigaVeraComunicazione[];
  lavorazioni: LavorazioneConfig[];
  /** codice categoria → etichetta mostrata (fallback: il codice). */
  etichette: Record<string, string>;
}

/**
 * Righe del V.E.R.A. raggruppate per DESTINATARIO (il reparto o il collega che
 * deve lavorare il debito).
 *
 * Le regole, in un posto solo: la lavorazione spenta, la categoria vuota e la
 * tipologia senza lavorazione non producono un gruppo; una posizione senza
 * categoria non viene attribuita a nessuno e viene contata; lo stesso debito
 * che cade su due lavorazioni dello stesso destinatario compare una volta
 * sola ma con entrambe le attività.
 */
export function raggruppaPerReparto(input: InputRaggruppamento): RaggruppamentoPerReparto {
  const etichetta = (codice: string) => input.etichette[codice]?.trim() || codice;

  const attive = input.lavorazioni.filter(
    (l) =>
      l.attivo !== false &&
      l.categoria.trim() !== '' &&
      l.lavorazione.trim() !== '' &&
      l.destinatario.trim() !== ''
  );

  // La chiave della tipologia è normalizzata anche in LETTURA, non solo in
  // scrittura: una lavorazione salvata con uno spazio di troppo (import,
  // ripristino, configurazione scritta a mano) incontrerebbe altrimenti zero
  // posizioni, e la sua tipologia risulterebbe «senza lavorazione» pur
  // essendo configurata — un'assenza che nessuno andrebbe a cercare.
  const perCategoria = new Map<string, LavorazioneConfig[]>();
  for (const l of attive) {
    const chiave = l.categoria.trim();
    const lista = perCategoria.get(chiave) ?? [];
    lista.push(l);
    perCategoria.set(chiave, lista);
  }

  const gruppi = new Map<string, GruppoDestinatario>();
  const senzaLavorazione = new Map<string, { righe: number; totale: number }>();
  let righeSenzaCategoria = 0;
  const posizioniEscluse: PosizioniEscluse = { righe: 0, totale: 0 };

  for (const r of input.righe) {
    // Fuori perimetro: non si elenca e non si somma, ma si dichiara.
    if (r.trattamento === 'ignora') {
      posizioniEscluse.righe += 1;
      posizioniEscluse.totale += r.importo;
      continue;
    }
    const categoria = r.categoria.trim();
    if (!categoria) {
      righeSenzaCategoria += 1;
      continue;
    }
    const lavorazioni = perCategoria.get(categoria);
    if (!lavorazioni || lavorazioni.length === 0) {
      const voce = senzaLavorazione.get(categoria) ?? { righe: 0, totale: 0 };
      voce.righe += 1;
      voce.totale += r.importo;
      senzaLavorazione.set(categoria, voce);
      continue;
    }
    for (const l of lavorazioni) {
      const destinatario = nomeDipendenza(l.destinatario);
      const chiave = chiaveDipendenza(destinatario);
      const gruppo = gruppi.get(chiave) ?? {
        destinatario,
        righe: new Set<RigaVeraComunicazione>(),
        lavorazioni: new Map<string, Set<string>>(),
      };
      gruppo.righe.add(r);
      const categorie = gruppo.lavorazioni.get(l.lavorazione.trim()) ?? new Set<string>();
      categorie.add(categoria);
      gruppo.lavorazioni.set(l.lavorazione.trim(), categorie);
      gruppi.set(chiave, gruppo);
    }
  }

  const raggruppamento: RaggruppamentoPerReparto = {
    gruppi: Array.from(gruppi.values())
      .map((g) => {
        const righe = Array.from(g.righe).sort(
          (a, b) =>
            COLLATORE_IT.compare(a.sezione, b.sezione) ||
            COLLATORE_IT.compare(a.voce, b.voce) ||
            COLLATORE_IT.compare(a.periodo ?? '', b.periodo ?? '')
        );
        const lavorazioni = Array.from(g.lavorazioni.entries())
          .map(([lavorazione, categorie]) => ({
            lavorazione,
            categorie: Array.from(categorie).sort((a, b) =>
              COLLATORE_IT.compare(etichetta(a), etichetta(b))
            ),
          }))
          .sort((a, b) => COLLATORE_IT.compare(a.lavorazione, b.lavorazione));

        const categorie = Array.from(new Set(lavorazioni.flatMap((l) => l.categorie))).sort(
          (a, b) => COLLATORE_IT.compare(etichetta(a), etichetta(b))
        );

        return {
          destinatario: g.destinatario,
          righe,
          lavorazioni,
          categorie,
          totale: righe.reduce((a, r) => a + r.importo, 0),
        };
      })
      .sort((a, b) => COLLATORE_IT.compare(a.destinatario, b.destinatario)),
    categorieSenzaLavorazione: Array.from(senzaLavorazione.entries())
      .map(([categoria, v]) => ({
        categoria,
        etichetta: etichetta(categoria),
        righe: v.righe,
        totale: v.totale,
      }))
      .sort((a, b) => COLLATORE_IT.compare(a.etichetta, b.etichetta)),
    righeSenzaCategoria,
    posizioniEscluse,
  };

  return raggruppamento;
}

export function componiComunicazioniVera(
  input: {
    azienda: string;
    /** Data della verifica in formato AAAA-MM-GG. */
    dataVerifica: string;
    righe: RigaVeraComunicazione[];
    lavorazioni: LavorazioneConfig[];
    /** codice categoria → etichetta mostrata (fallback: il codice). */
    etichette: Record<string, string>;
  },
  /**
   * Raggruppamento già calcolato. Le due uscite condividono lo stesso: senza,
   * ogni chiamata rifà il lavoro dell'altra e i due documenti potrebbero
   * partire da due letture diverse degli stessi dati.
   */
  raggruppamentoPronto?: RaggruppamentoPerReparto
): EsitoComunicazioniVera {
  const etichetta = (codice: string) => input.etichette[codice]?.trim() || codice;
  const data = dataItaliana(input.dataVerifica);
  const { gruppi: gruppiOrdinati, ...resto } = raggruppamentoPronto ?? raggruppaPerReparto(input);
  const notaEscluse =
    resto.posizioniEscluse.righe > 0
      ? `Non sono elencate ${resto.posizioniEscluse.righe} ${
          resto.posizioniEscluse.righe === 1 ? 'posizione' : 'posizioni'
        } per ${formattaImportoEuro(resto.posizioniEscluse.totale)}: sono sospese o fuori perimetro (trattamento «Ignora») e non vanno contabilizzate. Non entrano nel totale.`
      : null;
  const comunicazioni: ComunicazioneStandard[] = gruppiOrdinati.map((g) => {
    const righe = g.righe;
    const lavorazioni = g.lavorazioni;
    const categorie = g.categorie;
    const totale = g.totale;

    const elencoLavorazioni = lavorazioni
      .map((l) => `- ${l.lavorazione} — ${l.categorie.map(etichetta).join(', ')}`)
      .join('\n');

    const elencoRighe = righe
      .map((r) => {
        const periodo = r.periodo ? ` (periodo ${r.periodo})` : '';
        const stato = r.stato.trim() ? `; stato V.E.R.A.: ${r.stato.trim()}` : '';
        return `- ${r.sezione} — ${r.voce}${periodo}: ${formattaImportoEuro(r.importo)}; ${
          ETICHETTE_TRATTAMENTO[r.trattamento] ?? r.trattamento
        }${stato}`;
      })
      .join('\n');

    const corpo = [
      'Buongiorno,',
      `in esito alla verifica della posizione debitoria di ${input.azienda} al ${data}, per le posizioni di tua competenza risultano i dati seguenti.`,
      `Lavorazioni richieste:\n${elencoLavorazioni}`,
      `Posizioni:\n${elencoRighe}`,
      `Totale delle posizioni elencate: ${formattaImportoEuro(totale)}.`,
      notaEscluse,
      "Ti chiedo di svolgere la lavorazione indicata e di confermarmi l'esito.",
      'Grazie.',
    ]
      .filter((parte): parte is string => Boolean(parte))
      .join('\n\n');

    return {
      destinatario: g.destinatario,
      oggetto:
        lavorazioni.length === 1
          ? `Posizione debitoria ${input.azienda} — richiesta di lavorazione`
          : `Posizione debitoria ${input.azienda} — richieste di lavorazione`,
      corpo,
      categorie,
      lavorazioni: lavorazioni.map((l) => l.lavorazione),
      righe: righe.length,
      totale,
    };
  });

  return { comunicazioni, ...resto };
}
