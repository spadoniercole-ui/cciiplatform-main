// src/lib/lavorazioni/daLavorare.ts
//
// CIÒ CHE SI SCRIVE E CIÒ CHE NON SI SCRIVE.
//
// La comunicazione al collega, il documento per reparto e il report per unità
// operativa non sono l'elenco del V.E.R.A.: sono una richiesta di fare
// qualcosa. Elencare anche le posizioni già in contabilità le fa sembrare
// lavoro da fare, allunga il foglio e — soprattutto — diluisce l'unica cosa
// che chi legge deve vedere: le posizioni su cui si deve ancora intervenire.
//
// LA REGOLA È DEL FILE, NON NOSTRA. Nel V.E.R.A. la colonna «Stato» distingue
// i debiti già contabilizzati (cella vuota) da quelli certi ma non ancora
// esigibili (cella valorizzata: «Calcolati», «Da Verificare», «Verificata»).
// Quindi:
//
// - stato vuoto → contabilizzato: non c'è nulla da contabilizzare;
// - stato valorizzato → da lavorare: è qui che si interviene;
// - importo ignoto (natura senza importo, es. «Denunce non trasmesse») →
//   potenziale: non è contabilizzato e non è quantificato, va accertato.
//
// LE TIPOLOGIE GIÀ CONTABILIZZATE PER NATURA (TS 25, 27 e 81). Sono i flussi
// — nota di rettifica, flusso Uniemens non versato — che l'ente porta già in
// contabilità. Per queste l'unica decisione ancora aperta è se affidarle
// all'Agente della Riscossione: un passaggio che sposta la stessa partita da
// una colonna all'altra e non cambia lo stato complessivo della posizione.
// Non è quindi un intervento da chiedere all'ufficio, e va dichiarato a parte
// perché chi legge non si chieda dove sia finito l'importo.
//
// L'eccezione vale solo a file concorde: se il V.E.R.A. segna una di queste
// voci come ancora da contabilizzare, vince il file e la posizione si lavora.
// Il codice della natura non è una scorciatoia per contraddire il documento
// che l'ente ha prodotto.
//
// FUORI PERIMETRO resta fuori da entrambi gli elenchi (sospese da un giudice):
// non è «già contabilizzata», è una partita che non si contabilizza affatto.
//
// LA STESSA CIFRA UNA VOLTA SOLA. Quando il file descrive lo stesso debito due
// volte — «F24 non presentato» e «Denunce non trasmesse» dello stesso periodo e
// dello stesso importo (vedi `duplicatiVera.ts`) — la dichiarazione delle già
// contabilizzate conta la cifra una volta sola, e dice che l'ha fatto. Altrimenti
// l'importo dichiarato sarebbe più alto del debito vero, e chi confronta i
// numeri non avrebbe modo di capire perché.

import { codiceDaVoceVera } from '@/lib/titoliEnte/materiaVera';
import {
  denunceDuplicateVera,
  insiemeEsclusi,
  type StatoDuplicatoVera,
} from '@/lib/debitiEnte/duplicatiVera';
import type { TrattamentoVera } from '@/lib/debitiEnte/veraImport';

/** I codici «TS» che il V.E.R.A. porta già in contabilità. */
export const CODICI_TS_CONTABILIZZATI_ADR = ['25', '27', '81'] as const;

/** Il minimo che serve a decidere: la riga del V.E.R.A. e il suo stato. */
export interface RigaConStatoVera {
  voce: string;
  stato: string;
  importo: number;
  trattamento: TrattamentoVera;
  /** Periodo di competenza: serve a riconoscere la doppia scrittura del file. */
  periodo?: string;
  /** La scelta dell'operatore sulla doppia scrittura; vuoto = automatico. */
  duplicatoStato?: StatoDuplicatoVera | '';
}

export interface RiepilogoRighe {
  righe: number;
  totale: number;
}

export type SortaRigaVera =
  'DA_LAVORARE' | 'CONTABILIZZATA_ADR' | 'CONTABILIZZATA' | 'SOSPESA' | 'FUORI_PERIMETRO';

/**
 * Che cosa è questa riga per i documenti che chiedono di intervenire.
 *
 * `contabilizzato` non è un dato che si possa dedurre dall'importo: un debito
 * già in contabilità ha importo pieno quanto uno da contabilizzare. Lo dice
 * solo lo stato del V.E.R.A., ed è per questo che la classificazione parte da
 * lì.
 */
export function sortaRigaVera(r: RigaConStatoVera): SortaRigaVera {
  if (r.trattamento === 'ignora') return 'FUORI_PERIMETRO';
  if (r.trattamento === 'sospeso') return 'SOSPESA';
  if (r.trattamento === 'contabilizzato') {
    const codice = codiceDaVoceVera(r.voce);
    return codice !== null && (CODICI_TS_CONTABILIZZATI_ADR as readonly string[]).includes(codice)
      ? 'CONTABILIZZATA_ADR'
      : 'CONTABILIZZATA';
  }
  // `da_contabilizzare` e `potenziale`: c'è un intervento da chiedere, che sia
  // di contabilizzazione o di quantificazione.
  return 'DA_LAVORARE';
}

export interface RipartizioneRighe<R extends RigaConStatoVera> {
  /** Le sole righe che i documenti elencano. */
  daLavorare: R[];
  /** Già contabilizzate: nessun intervento. Si dichiarano, non si elencano. */
  contabilizzate: RiepilogoRighe;
  /** Già contabilizzate, con la sola decisione dell'invio ad AdR ancora aperta. */
  contabilizzateAdr: RiepilogoRighe;
  /** I codici TS fra le righe di cui sopra, in ordine numerico e senza ripetizioni. */
  codiciAdr: string[];
  /** Fuori perimetro: dichiarate a parte, non contabilizzate. */
  fuoriPerimetro: RiepilogoRighe;
  /**
   * Sospese da un provvedimento: non contabilizzate, fuori dai totali, ma con
   * un ufficio che le segue. Si dichiarano e — a differenza delle fuori
   * perimetro — si intestano al loro ufficio, perché una sospensione che cade
   * va ripresa da qualcuno, e quel qualcuno deve sapere di averla.
   */
  sospese: RiepilogoRighe;
  /** Le stesse righe, per intestarle all'ufficio che le segue. */
  righeSospese: R[];
  /**
   * Le posizioni scontate perché il file le scrive due volte (F24 e denunce
   * dello stesso periodo): la cifra è quella della riga F24, già dichiarata.
   */
  duplicati: RiepilogoRighe;
}

function aggiungi(riepilogo: RiepilogoRighe, importo: number): void {
  riepilogo.righe += 1;
  riepilogo.totale += importo;
}

/**
 * Divide le righe del V.E.R.A. fra ciò che si lavora e ciò che si dichiara.
 *
 * Una sola funzione per tutte e tre le uscite: se ognuna decidesse per conto
 * proprio, il testo al collega, il documento per reparto e il report per unità
 * operativa potrebbero elencare posizioni diverse partendo dagli stessi dati.
 */
export function ripartisciRigheVera<R extends RigaConStatoVera>(righe: R[]): RipartizioneRighe<R> {
  const ripartizione: RipartizioneRighe<R> = {
    daLavorare: [],
    contabilizzate: { righe: 0, totale: 0 },
    contabilizzateAdr: { righe: 0, totale: 0 },
    codiciAdr: [],
    fuoriPerimetro: { righe: 0, totale: 0 },
    sospese: { righe: 0, totale: 0 },
    righeSospese: [],
    duplicati: { righe: 0, totale: 0 },
  };
  // La doppia scrittura si sconta solo dove è una dichiarazione di importo:
  // una riga da lavorare resta in elenco anche se la cifra è ripetuta, perché
  // l'intervento da chiedere (trasmettere la denuncia) è comunque suo.
  const doppie = insiemeEsclusi(denunceDuplicateVera(righe));

  for (const [i, r] of righe.entries()) {
    const sorta = sortaRigaVera(r);
    if (doppie.has(i) && (sorta === 'CONTABILIZZATA' || sorta === 'CONTABILIZZATA_ADR')) {
      aggiungi(ripartizione.duplicati, r.importo);
      continue;
    }
    switch (sorta) {
      case 'FUORI_PERIMETRO':
        aggiungi(ripartizione.fuoriPerimetro, r.importo);
        break;
      case 'SOSPESA':
        aggiungi(ripartizione.sospese, r.importo);
        ripartizione.righeSospese.push(r);
        break;
      case 'CONTABILIZZATA':
        aggiungi(ripartizione.contabilizzate, r.importo);
        break;
      case 'CONTABILIZZATA_ADR': {
        aggiungi(ripartizione.contabilizzate, r.importo);
        aggiungi(ripartizione.contabilizzateAdr, r.importo);
        const codice = codiceDaVoceVera(r.voce);
        if (codice && !ripartizione.codiciAdr.includes(codice)) {
          ripartizione.codiciAdr.push(codice);
        }
        break;
      }
      default:
        ripartizione.daLavorare.push(r);
    }
  }

  ripartizione.codiciAdr.sort((a, b) => Number(a) - Number(b));
  return ripartizione;
}

/** «TS 25, 27 e 81»: l'elenco dei codici come si legge in una frase. */
export function elencoCodiciTs(codici: string[]): string {
  if (codici.length === 0) return '';
  const distinti = Array.from(new Set(codici));
  if (distinti.length === 1) return `TS ${distinti[0]}`;
  return `TS ${distinti.slice(0, -1).join(', ')} e ${distinti[distinti.length - 1]}`;
}

function conto(righe: number): string {
  return `${righe} ${righe === 1 ? 'posizione' : 'posizioni'}`;
}

export interface TestiContabilizzate {
  /** Paragrafo per la comunicazione al collega; null se non ce ne sono. */
  collegiale: string | null;
  /** Riga compatta per il PDF; null se non ce ne sono. */
  documento: string | null;
}

/**
 * Le due frasi con cui si dichiara ciò che i documenti non elencano.
 *
 * Il formattatore degli importi arriva da fuori: questo modulo non deve
 * dipendere da quello delle comunicazioni, che a sua volta dipende da qui.
 */
export function testiContabilizzate(
  ripartizione: Pick<
    RipartizioneRighe<RigaConStatoVera>,
    'contabilizzate' | 'contabilizzateAdr' | 'codiciAdr'
  > & { duplicati?: RiepilogoRighe },
  euro: (importo: number) => string
): TestiContabilizzate {
  const { contabilizzate, contabilizzateAdr, codiciAdr } = ripartizione;
  const duplicati = ripartizione.duplicati ?? { righe: 0, totale: 0 };
  if (contabilizzate.righe === 0) return { collegiale: null, documento: null };

  // Il file scrive due volte lo stesso debito (F24 non presentato e denunce
  // dello stesso periodo): la cifra è contata una volta, e va detto — altrimenti
  // chi somma le righe del file trova un totale più alto e pensa a un errore.
  const ripetute =
    duplicati.righe > 0
      ? ` ${conto(duplicati.righe)} per ${euro(
          duplicati.totale
        )} sono lo stesso debito scritto due volte nel file (come «F24 non presentato» e come «Denunce non trasmesse», stesso periodo e stesso importo): la cifra è contata una volta sola.`
      : '';

  const adr =
    contabilizzateAdr.righe > 0
      ? ` Di queste, ${conto(contabilizzateAdr.righe)} per ${euro(
          contabilizzateAdr.totale
        )} sono ${elencoCodiciTs(codiciAdr)}: l’unica decisione ancora aperta è se affidarle all’Agente della Riscossione, un passaggio che sposta la stessa partita e non cambia lo stato complessivo.`
      : '';

  const collegiale =
    `Già contabilizzate, e per questo non elencate: ${conto(contabilizzate.righe)} per ${euro(
      contabilizzate.totale
    )}. Non richiedono di essere contabilizzate — l’importo è già in contabilità.` +
    ripetute +
    adr;

  const documento =
    `Già contabilizzate e non elencate: ${conto(contabilizzate.righe)} per ${euro(
      contabilizzate.totale
    )}` +
    (contabilizzateAdr.righe > 0
      ? ` (di cui ${elencoCodiciTs(codiciAdr)}: ${conto(contabilizzateAdr.righe)} per ${euro(
          contabilizzateAdr.totale
        )}, con la sola decisione dell’invio all’Agente della Riscossione (AdR), che non cambia lo stato complessivo)`
      : '') +
    (duplicati.righe > 0
      ? `; ${conto(duplicati.righe)} per ${euro(
          duplicati.totale
        )} sono lo stesso debito scritto due volte nel file («F24 non presentato» e «Denunce non trasmesse»), contato una volta sola`
      : '') +
    '.';

  return { collegiale, documento };
}
