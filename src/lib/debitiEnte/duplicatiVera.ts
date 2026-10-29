// src/lib/debitiEnte/duplicatiVera.ts
//
// LO STESSO DEBITO SCRITTO DUE VOLTE.
//
// Nel V.E.R.A. la stessa obbligazione può comparire su due righe: il versamento
// non eseguito («F24 non presentato», con la cifra nelle colonne Contributi e
// Sanzioni) e la denuncia non trasmessa («Denunce non trasmesse», con il totale
// nella colonna dell'importo). Sono due facce dello stesso inadempimento — se
// la denuncia non è stata trasmessa, quel versamento non è stato pagato — e il
// file le riporta entrambe, ciascuna con la propria cifra.
//
// Sommarle nell'esposizione conta due volte lo stesso debito verso l'ente. Non
// si può però scartarne una in silenzio: sono due righe distinte, con due stati
// distinti, e la seconda dice qualcosa che la prima non dice (la denuncia va
// trasmessa). Quindi la cifra si conta una volta sola e l'ambiguità si
// dichiara: chi legge deve sapere che quel numero è stato scontato, non
// scoprire da sé che il totale non torna.
//
// IL CRITERIO È STRETTO DI PROPOSITO: stesso periodo di competenza, stesso
// importo al centesimo, e natura «F24» da una parte e «denunce» dall'altra.
// Non è un'euristica sull'ordine delle righe né sulla vicinanza. Senza periodo
// non c'è accoppiamento: senza il periodo non c'è prova che sia lo stesso
// debito, e scontarne una a caso toglierebbe dall'esposizione un debito vero.
//
// QUALE DELLE DUE SI SCONTA. Si tiene la riga «Denunce non trasmesse» e si
// sconta l'F24: la cifra è la stessa al centesimo (è il criterio
// dell'accoppiamento), quindi nulla cambia nei totali, ma la posizione che
// resta in elenco è quella che l'ufficio deve lavorare. L'F24 dice quanto e per
// quale periodo quel versamento è scoperto; la denuncia dice cosa manca — la
// trasmissione — ed è l'unica delle due che ha un ufficio a cui andare. Prima
// si teneva l'F24 e si scontava la denuncia, e la posizione che arrivava a
// «Presidio dei flussi informativi» spariva dal foglio: restava la misura
// finanziaria del debito, senza l'adempimento che lo riguarda.
//
// La riga F24 resta comunque nel file e nel conteggio dell'esposizione — è il
// file, non questa funzione, a decidere quali tipi di riga formano la base
// della soglia — ma non è lei a intitolare la posizione nel documento.
//
// LA SCELTA DELL'OPERATORE VINCE SUL CRITERIO. Il riconoscimento automatico
// può sbagliare: due righe identiche per periodo e importo possono descrivere
// due obbligazioni diverse. Chi lavora la posizione decide (`StatoDuplicatoVera`),
// la decisione si registra sulla riga denunce e da lì si rilegge — la verifica
// riaperta rifà i conti con la scelta già fatta.

import { periodoDaVera } from './veraImport';

/**
 * LA DECISIONE DELL'OPERATORE su una riga «denunce» riconosciuta come ripetizione.
 *
 * Il riconoscimento automatico è un criterio, non una verità: il file può
 * contenere due righe identiche per periodo e importo che descrivono però due
 * obbligazioni diverse (un versamento e una denuncia di periodi diversi letti
 * male, per esempio). Chi lavora la posizione lo sa meglio del criterio, e la
 * sua scelta vale più del riconoscimento: `NEGATO` tiene le due cifre distinte,
 * `CONFERMATO` le conta una volta sola dichiarandolo. Vuoto = vale il criterio.
 */
export type StatoDuplicatoVera = 'CONFERMATO' | 'NEGATO';

/** Il minimo che serve per riconoscere la coppia. */
export interface RigaPerDuplicati {
  voce: string;
  periodo?: string;
  importo: number;
  /** La scelta dell'operatore su questa riga; vuoto = automatico. */
  duplicatoStato?: StatoDuplicatoVera | '';
}

/** Una coppia riconosciuta: due righe, un periodo, una cifra. */
export interface CoppiaDuplicati {
  /** Indici delle due righe nell'ordine in cui sono state ricevute. */
  f24: number;
  denunce: number;
  /** Periodo di competenza condiviso, AAAA-MM. */
  periodo: string;
  /** L'importo della riga denunce, cioè la cifra in gioco. */
  importo: number;
  /** La scelta dell'operatore sulla riga denunce; vuoto = automatico. */
  decisione: StatoDuplicatoVera | '';
  /** true quando la cifra è contata una volta sola. */
  scontata: boolean;
}

export interface DuplicatiVera {
  /**
   * Gli indici — nell'ordine delle righe ricevute — delle righe «F24» da non
   * sommare: la stessa cifra è già dichiarata dalla riga «Denunce non
   * trasmesse», che è quella che porta l'adempimento e il suo ufficio.
   */
  indiciDaNonSommare: number[];
  righe: number;
  totale: number;
  /** I periodi in cui la doppia scrittura compare (AAAA-MM), in ordine. */
  periodi: string[];
  /**
   * Le coppie riconosciute, comprese quelle che l'operatore ha dichiarato
   * distinte: servono a mostrarle e a poter tornare sulla scelta.
   */
  coppie: CoppiaDuplicati[];
}

const QUASI_ZERO = 0.005;

function eF24(voce: string): boolean {
  return /f24/i.test(voce);
}

function eDenunce(voce: string): boolean {
  return /denunc/i.test(voce);
}

function centesimi(importo: number): number {
  return Math.round(importo * 100);
}

/** La chiave dell'accoppiamento: anno e mese di competenza. */
function chiavePeriodo(r: RigaPerDuplicati): string | null {
  const p = r.periodo ? periodoDaVera(r.periodo) : null;
  if (!p) return null;
  return `${p.anno}-${String(p.mese).padStart(2, '0')}`;
}

/**
 * Le righe «denunce» che ripetono un «F24 non presentato» dello stesso periodo
 * e dello stesso importo.
 *
 * L'accoppiamento è uno a uno: due F24 identici e una sola denuncia scontano
 * una denuncia, non due. Restituisce indici, non righe, perché le righe sono
 * oggetti diversi a seconda di chi chiama (triage, documento per reparto,
 * report per unità operativa) e vanno escluse senza essere ricostruite.
 */
/**
 * Le cifre F24 disponibili, periodo per periodo: ogni voce sa da quale riga
 * viene, così la coppia si può mostrare indicando le due righe esatte (con più
 * F24 dello stesso periodo, «la prima» non sarebbe una risposta).
 */
function cifreF24(
  righe: readonly RigaPerDuplicati[]
): Map<string, { indice: number; quota: number }[]> {
  const disponibili = new Map<string, { indice: number; quota: number }[]>();
  righe.forEach((r, indice) => {
    if (!eF24(r.voce) || eDenunce(r.voce)) return;
    const chiave = chiavePeriodo(r);
    const quota = centesimi(r.importo);
    if (chiave === null || quota <= QUASI_ZERO) return;
    const elenco = disponibili.get(chiave) ?? [];
    elenco.push({ indice, quota });
    disponibili.set(chiave, elenco);
  });
  return disponibili;
}

/** La riga è una denuncia accoppiabile (natura giusta, periodo e importo noti)? */
function denunciaAccoppiabile(r: RigaPerDuplicati): boolean {
  return (
    eDenunce(r.voce) &&
    !eF24(r.voce) &&
    chiavePeriodo(r) !== null &&
    centesimi(r.importo) > QUASI_ZERO
  );
}

function chiaveDenuncia(r: RigaPerDuplicati): string {
  return chiavePeriodo(r) ?? '';
}

/** L'indice della riga F24 che fa coppia con questa denuncia, se c'è. */
function trovaPartner(
  r: RigaPerDuplicati,
  disponibili: Map<string, { indice: number; quota: number }[]>
): number | null {
  const elenco = disponibili.get(chiaveDenuncia(r));
  if (!elenco) return null;
  const pos = elenco.findIndex((x) => x.quota === centesimi(r.importo));
  if (pos < 0) return null;
  const [trovata] = elenco.splice(pos, 1);
  return trovata.indice;
}

export function denunceDuplicateVera(righe: readonly RigaPerDuplicati[]): DuplicatiVera {
  const indiciDaNonSommare: number[] = [];
  const periodi: string[] = [];
  const coppie: CoppiaDuplicati[] = [];
  let totale = 0;

  // PRIMA LE COPPIE CHE SI SCONTANO. Una denuncia dichiarata «distinta»
  // dall'operatore non deve consumare la cifra F24 di un'altra denuncia che
  // invece è una ripetizione: le due passate sono separate apposta.
  const disponibili = cifreF24(righe);
  righe.forEach((r, i) => {
    if (!denunciaAccoppiabile(r) || r.duplicatoStato === 'NEGATO') return;
    const partner = trovaPartner(r, disponibili);
    if (partner === null) return;
    // Si sconta l'F24, non la denuncia: vedi «QUALE DELLE DUE SI SCONTA».
    indiciDaNonSommare.push(partner);
    totale += r.importo;
    const chiave = chiaveDenuncia(r);
    if (!periodi.includes(chiave)) periodi.push(chiave);
    coppie.push({
      f24: partner,
      denunce: i,
      periodo: chiave,
      importo: r.importo,
      decisione: r.duplicatoStato ?? '',
      scontata: true,
    });
  });

  // POI QUELLE DICHIARATE DISTINTE: restano in elenco — la scelta si deve poter
  // cambiare — ma non si scontano, e non consumano nulla.
  const perElenco = cifreF24(righe);
  righe.forEach((r, i) => {
    if (!denunciaAccoppiabile(r) || r.duplicatoStato !== 'NEGATO') return;
    const partner = trovaPartner(r, perElenco);
    if (partner === null) return;
    coppie.push({
      f24: partner,
      denunce: i,
      periodo: chiaveDenuncia(r),
      importo: r.importo,
      decisione: 'NEGATO',
      scontata: false,
    });
  });

  periodi.sort();
  coppie.sort((a, b) => a.denunce - b.denunce);
  return { indiciDaNonSommare, righe: indiciDaNonSommare.length, totale, periodi, coppie };
}

/** Gli indici come insieme: `righe.filter((_, i) => !esclusi.has(i))`. */
export function insiemeEsclusi(duplicati: DuplicatiVera): Set<number> {
  return new Set(duplicati.indiciDaNonSommare);
}
