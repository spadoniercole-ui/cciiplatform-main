// src/lib/lavorazioni/reportUo.ts
//
// IL DOCUMENTO PER LE UNITÀ OPERATIVE, RAGGRUPPATO PER CODICE.
//
// Le due uscite che esistevano già rispondono a due domande diverse:
// `comunicazioni.ts` prepara il TESTO per un collega, `reparti.ts` il PDF con
// TUTTE le posizioni di quel reparto. A chi lavora la partita, però, serve una
// terza cosa: il codice di partita. È il codice — «TS 27», la cartella 18 —
// che dice all'ufficio quale istituto del credito si applica, quale procedura
// seguire e con quale esito; le posizioni sono il dettaglio che lo dimostra.
//
// Qui si raggruppa per DIPENDENZA (l'ufficio a cui si scrive) e, dentro, per
// CODICE di partita. Per ogni codice: la materia dell'ente, il totale, le
// inadempienze che lo compongono (voce, periodo, stato, importo) e le
// lavorazioni configurate sulla materia, nell'ordine in cui si eseguono.
//
// PERCHÉ NON SI RIUSA IL DESTINATARIO DI `lavorazioni_tipo_debito`. Quella
// tabella indirizza per CATEGORIA di calcolo (Contributi INPS, crediti
// dell'Agente…): raggruppa per natura del credito, non per ufficio. La
// dipendenza sta su `materie_lavorazione` e, in via prioritaria, sul singolo
// codice (`titoli_ente.dipendenza`): è la stessa regola che la scheda dei
// titoli mostra in colonna — il codice vince, la materia è la predefinita.
// Usare due modelli per dire «chi lavora cosa» significherebbe due risposte
// diverse alla stessa domanda.
//
// COSA RESTA FUORI, E SI DICE. Una posizione con trattamento «Ignora»
// (sospesa da un giudice) non si lavora e non entra nel totale. Una voce che
// non porta un codice di partita non si attribuisce a nessuno: si conta. Un
// codice senza dipendenza — né propria né della materia — non ha un ufficio a
// cui andare: si elenca a parte, perché è configurazione mancante, non un
// debito inesistente. Nessuna di queste assenze viene silenziata: il documento
// e la scheda le dichiarano.

import { codiceDaVoceVera } from '@/lib/titoliEnte/materiaVera';
import {
  dipendenzaEffettiva,
  lavorazioniDellaMateria,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import type { TitoloEnte } from '@/lib/titoliEnte/titoli';
import { ETICHETTE_TRATTAMENTO, type TrattamentoVera } from '@/lib/debitiEnte/veraImport';
import type { PosizioniEscluse } from './comunicazioni';

/** Una posizione del V.E.R.A. nella forma che serve al report. */
export interface RigaVeraReportUo {
  sezione: string;
  voce: string;
  /** Periodo di competenza («202506 - 202506»); vuoto quando la sezione non lo porta. */
  periodo?: string;
  stato: string;
  trattamento: TrattamentoVera;
  importo: number;
}

export interface MateriaReportUo {
  id: number;
  nome: string;
}

/** Una singola inadempienza: la riga che il codice comprende. */
export interface InadempienzaUo {
  sezione: string;
  voce: string;
  periodo: string | null;
  stato: string;
  trattamento: string;
  importo: number;
}

export interface LavorazioneUo {
  tipologia: string;
  /** I passi, così come sono configurati (un passo per riga). */
  procedura: string | null;
  /** Che cosa produce la lavorazione: «diffida», «procedura di recupero». */
  esito: string | null;
}

export interface CodiceUo {
  codice: string;
  /** La materia dell'ente in cui il codice cade; null se non ne ha una. */
  materia: string | null;
  importo: number;
  righe: number;
  inadempienze: InadempienzaUo[];
  /** Le lavorazioni della materia, in ordine; vuoto se non ne ha. */
  lavorazioni: LavorazioneUo[];
}

export interface DocumentoUo {
  /** L'ufficio a cui il documento è destinato. */
  dipendenza: string;
  oggetto: string;
  azienda: string;
  /** Data della verifica, AAAA-MM-GG. */
  dataVerifica: string;
  codici: CodiceUo[];
  righe: number;
  totale: number;
  /** Quante posizioni elencate non sono ancora contabilizzate, e per quanto. */
  posizioniDaContabilizzare: number;
  importoDaContabilizzare: number;
  posizioniEscluse: PosizioniEscluse;
  nomeFile: string;
  versione: string;
}

export interface CodiceSenzaDipendenza {
  codice: string;
  materia: string | null;
  righe: number;
  totale: number;
}

export interface EsitoReportUo {
  documenti: DocumentoUo[];
  /** Codici che nessuna dipendenza reclama: configurazione mancante. */
  senzaDipendenza: CodiceSenzaDipendenza[];
  /** Posizioni la cui voce non porta un codice di partita. */
  senzaCodice: { righe: number; totale: number };
  /** Fuori perimetro (trattamento «Ignora»): dichiarate, non elencate. */
  posizioniEscluse: PosizioniEscluse;
  /** Codici elencati in un documento ma senza lavorazioni configurate. */
  codiciSenzaLavorazione: number;
}

/**
 * Versione del formato del documento. Cambia quando cambia la struttura del
 * PDF (sezioni, colonne): due documenti con lo stesso contenuto ma impaginati
 * in modo diverso non devono risultare la stessa versione.
 */
export const FORMATO_REPORT_UO = '1';

/**
 * FNV-1a a 32 bit, in esadecimale.
 *
 * Stessa scelta del documento per reparto: l'impronta si calcola nel browser,
 * insieme al documento, e serve solo a distinguere due contenuti — non a
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
 * Versione del documento: formato + impronta di ciò che l'ufficio legge.
 *
 * Entra tutto quello che compare nel PDF — ufficio, azienda, data, codici,
 * inadempienze (anche il loro ordine), lavorazioni, totali — e nient'altro:
 * la data di generazione resta fuori, altrimenti lo stesso documento
 * scaricato due volte risulterebbe cambiato.
 */
export function versioneReportUo(d: Omit<DocumentoUo, 'versione' | 'nomeFile'>): string {
  const parti = [
    FORMATO_REPORT_UO,
    d.dipendenza,
    d.azienda,
    d.oggetto,
    d.dataVerifica,
    ...d.codici.map((c) =>
      [
        c.codice,
        c.materia ?? '',
        c.importo.toFixed(2),
        ...c.inadempienze.map((i) =>
          [i.sezione, i.voce, i.periodo ?? '', i.stato, i.trattamento, i.importo.toFixed(2)].join(
            '|'
          )
        ),
        ...c.lavorazioni.map((l) => [l.tipologia, l.procedura ?? '', l.esito ?? ''].join('|')),
      ].join('~')
    ),
    d.totale.toFixed(2),
    String(d.posizioniEscluse.righe),
    d.posizioniEscluse.totale.toFixed(2),
  ];
  return `${FORMATO_REPORT_UO}-${improntaContenuto(parti.join('\n'))}`;
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
 * Nome del file, con la versione in coda: due uffici con lo stesso nome dopo
 * la normalizzazione produrrebbero lo stesso file, e il secondo scaricamento
 * sovrascriverebbe il primo nella cartella dei download.
 */
export function nomeFileUo(azienda: string, dipendenza: string, versione?: string): string {
  const a = slug(azienda) || 'azienda';
  const d = slug(dipendenza) || 'ufficio';
  const impronta = versione?.split('-').pop()?.trim();
  const coda = impronta && /^[0-9a-f]{8}$/.test(impronta) ? `_${impronta}` : '';
  return `report_uo_${a}_${d}${coda}.pdf`;
}

const trattamenti = ETICHETTE_TRATTAMENTO as Record<string, string>;
const COLLATORE_IT = new Intl.Collator('it-IT');
// I codici sono numeri scritti come testo: «9» prima di «10», non dopo.
const COLLATORE_CODICI = new Intl.Collator('it-IT', { numeric: true });

/** Spazi compattati e bordi tolti: «Ufficio  legale » → «Ufficio legale». */
function unaRiga(testo: string): string {
  return testo.trim().replace(/\s+/g, ' ');
}

/**
 * I debiti raggruppati per dipendenza e, dentro, per codice di partita.
 *
 * `titoli` sono i codici dell'ente (con la loro materia e la loro dipendenza),
 * `materie` dà il nome da stampare, `lavorazioni` le procedure della materia.
 * Un codice che non compare in `titoli` non è un errore: la sua voce porta
 * comunque un codice, e senza materia non ha né dipendenza né lavorazioni —
 * finisce in `senzaDipendenza`, dove la configurazione mancante si vede.
 */
export function componiReportUo(input: {
  azienda: string;
  /** Data della verifica, AAAA-MM-GG. */
  dataVerifica: string;
  righe: RigaVeraReportUo[];
  titoli: Pick<TitoloEnte, 'codice' | 'materiaId' | 'dipendenza'>[];
  materie: MateriaReportUo[];
  lavorazioni: LavorazioneMateria[];
}): EsitoReportUo {
  const perCodiceTitolo = new Map<
    string,
    Pick<TitoloEnte, 'codice' | 'materiaId' | 'dipendenza'>
  >();
  for (const t of input.titoli) {
    const chiave = normalizzaCodice(t.codice);
    if (chiave && !perCodiceTitolo.has(chiave)) perCodiceTitolo.set(chiave, t);
  }
  const nomeMateria = (id: number | null | undefined) =>
    id === null || id === undefined ? null : (input.materie.find((m) => m.id === id)?.nome ?? null);

  const posizioniEscluse: PosizioniEscluse = { righe: 0, totale: 0 };
  const senzaCodice = { righe: 0, totale: 0 };
  // dipendenza (chiave senza maiuscole) → codice → righe
  const gruppi = new Map<
    string,
    {
      dipendenza: string;
      codici: Map<string, { codice: string; materia: string | null; righe: RigaVeraReportUo[] }>;
    }
  >();
  const orfani = new Map<
    string,
    { codice: string; materia: string | null; righe: RigaVeraReportUo[] }
  >();
  let codiciSenzaLavorazione = 0;

  for (const r of input.righe) {
    if (r.trattamento === 'ignora') {
      posizioniEscluse.righe += 1;
      posizioniEscluse.totale += r.importo;
      continue;
    }
    const codice = codiceDaVoceVera(r.voce);
    if (!codice) {
      senzaCodice.righe += 1;
      senzaCodice.totale += r.importo;
      continue;
    }
    const titolo = perCodiceTitolo.get(normalizzaCodice(codice));
    const materiaId = titolo?.materiaId ?? null;
    const materia = nomeMateria(materiaId);
    const dipendenza = unaRiga(
      dipendenzaEffettiva({ dipendenza: titolo?.dipendenza ?? null, materiaId }, input.lavorazioni)
        .valore ?? ''
    );

    // Senza dipendenza il codice non ha un ufficio a cui andare: si dichiara.
    if (!dipendenza) {
      const voce = orfani.get(codice) ?? { codice, materia, righe: [] };
      voce.righe.push(r);
      orfani.set(codice, voce);
      continue;
    }

    const chiaveGruppo = dipendenza.toLocaleLowerCase('it-IT');
    const gruppo = gruppi.get(chiaveGruppo) ?? { dipendenza, codici: new Map() };
    const voce = gruppo.codici.get(codice) ?? { codice, materia, righe: [] };
    voce.righe.push(r);
    gruppo.codici.set(codice, voce);
    gruppi.set(chiaveGruppo, gruppo);
  }

  const codiciOrdinati = (a: { codice: string }, b: { codice: string }) =>
    COLLATORE_CODICI.compare(a.codice, b.codice);

  const documenti: DocumentoUo[] = Array.from(gruppi.values())
    .map((g) => {
      const codici: CodiceUo[] = Array.from(g.codici.values())
        .map((c) => {
          const titolo = perCodiceTitolo.get(normalizzaCodice(c.codice));
          const materiaId = titolo?.materiaId ?? null;
          const lavorazioni = lavorazioniDellaMateria(input.lavorazioni, materiaId)
            .filter((l) => l.tipologia.trim() !== '')
            .map((l) => ({ tipologia: l.tipologia, procedura: l.procedura, esito: l.esito }));
          if (lavorazioni.length === 0) codiciSenzaLavorazione += 1;
          return {
            codice: c.codice,
            materia: c.materia,
            importo: c.righe.reduce((a, r) => a + r.importo, 0),
            righe: c.righe.length,
            inadempienze: c.righe
              .map((r) => ({
                sezione: r.sezione,
                voce: r.voce,
                periodo: r.periodo?.trim() ? r.periodo.trim() : null,
                stato: r.stato.trim(),
                trattamento: trattamenti[r.trattamento] ?? String(r.trattamento ?? ''),
                importo: r.importo,
              }))
              .sort(
                (a, b) =>
                  COLLATORE_IT.compare(a.sezione, b.sezione) ||
                  COLLATORE_IT.compare(a.voce, b.voce) ||
                  COLLATORE_IT.compare(a.periodo ?? '', b.periodo ?? '')
              ),
            lavorazioni,
          };
        })
        .sort(codiciOrdinati);

      const righeGruppo = Array.from(g.codici.values()).flatMap((c) => c.righe);
      const daContabilizzare = righeGruppo.filter((r) => r.trattamento === 'da_contabilizzare');
      const contenuto = {
        dipendenza: g.dipendenza,
        oggetto: `Posizione debitoria ${input.azienda} — debiti da lavorare per codice e unità operativa`,
        azienda: input.azienda,
        dataVerifica: input.dataVerifica,
        codici,
        righe: codici.reduce((a, c) => a + c.righe, 0),
        totale: codici.reduce((a, c) => a + c.importo, 0),
        posizioniDaContabilizzare: daContabilizzare.length,
        importoDaContabilizzare: daContabilizzare.reduce((a, r) => a + r.importo, 0),
        posizioniEscluse,
      };
      const versione = versioneReportUo(contenuto);
      return {
        ...contenuto,
        nomeFile: nomeFileUo(input.azienda, g.dipendenza, versione),
        versione,
      };
    })
    .sort((a, b) => COLLATORE_IT.compare(a.dipendenza, b.dipendenza));

  return {
    documenti,
    senzaDipendenza: Array.from(orfani.values())
      .map((o) => ({
        codice: o.codice,
        materia: o.materia,
        righe: o.righe.length,
        totale: o.righe.reduce((a, r) => a + r.importo, 0),
      }))
      .sort(codiciOrdinati),
    senzaCodice,
    posizioniEscluse,
    codiciSenzaLavorazione,
  };
}

/** «027» e «27» sono lo stesso codice: il confronto si fa sulla forma normalizzata. */
function normalizzaCodice(codice: string): string {
  return codice
    .trim()
    .replace(/^0+(?=\d)/, '')
    .toUpperCase();
}
