// LA DECISIONE CHE RESTA (0.247.0).
//
// Il report dell'azienda dice com'è l'azienda, quali strade esistono e che cosa
// le sostiene. Non diceva l'ultima cosa, quella che chi legge cerca: se lo
// scenario valutato sta in piedi, e se non sta in piedi quale strada lascia
// all'ente la perdita minore.
//
// Due fatti decidono:
//
//   1. IL PIANO. Se il piano dell'azienda non è in archivio, lo scenario non è
//      individuato fino in fondo: si sta valutando un accordo ipotizzato, non
//      un piano. Se c'è ma la contabile lo rende impraticabile — patrimonio
//      netto negativo, indici oltre soglia su più dimensioni — il piano esiste
//      sulla carta e non nei numeri.
//
//   2. LA PERDITA. Quando il piano non regge, restano due procedure, e non
//      sono equivalenti per l'ente: la liquidazione giudiziale e il cram down.
//      Qui si accostano i due recuperi già calcolati dalla verifica azienda
//      sulle percentuali dell'ente, e si dice quale delle due lascia la perdita
//      minore. Non si sceglie: si scrive il numero che rende la scelta
//      leggibile.
//
// LA DOCUMENTAZIONE PESA. Un giudizio dato senza il piano, senza i bilanci o
// senza il credito accertato non è lo stesso giudizio. I documenti mancanti si
// elencano con il loro peso, dichiarato qui e non nascosto in una nota: «alto»
// quando senza quel documento la conclusione cambia, «medio» quando la rende
// solo meno solida.
//
// Nessuna conclusione giuridica: il confronto è sui numeri configurati
// nell'ente, e la decisione resta dell'ente. Logica pura, con i suoi test.

import { SOGLIA_INDICI_GRAVI } from '@/lib/verificaAmministrativa/raccomandazione';

export type StatoPiano = 'PRESENTE' | 'ASSENTE' | 'NON_VALUTABILE';
export type PesoDocumento = 'ALTO' | 'MEDIO';

/** Un recupero calcolato dalla verifica azienda per una procedura. */
export interface ProceduraDecisione {
  recupero: number | null;
  perdita: number | null;
  calcolabile: boolean;
  motivo: string | null;
}

export interface DocumentoPesato {
  nome: string;
  peso: PesoDocumento;
  /** Perché manca e che cosa se ne perde. */
  perche: string;
}

export interface FonteDecisioneFinale {
  piano: StatoPiano;
  /** Il credito vantato: senza, la perdita non si misura. */
  credito: number | null;
  patrimonioNetto: number | null;
  indiciViolati: number | null;
  liquidazione: ProceduraDecisione | null;
  cramDown: ProceduraDecisione | null;
  documentiMancanti: DocumentoPesato[];
}

export interface ConfrontoProcedure {
  liquidazione: ProceduraDecisione | null;
  cramDown: ProceduraDecisione | null;
  /** Quale delle due lascia la perdita minore, quando entrambe si calcolano. */
  minorePerdita: 'LIQUIDAZIONE' | 'CRAM_DOWN' | null;
  /** Differenza fra le due perdite, in euro; null quando non si confrontano. */
  differenza: number | null;
  testo: string;
}

export interface EsitoDecisioneFinale {
  titolo: string;
  righe: string[];
  confronto: ConfrontoProcedure;
  pianoMancante: boolean;
  pianoImpraticabile: boolean;
  /** Il peso della documentazione mancante, in una riga. */
  pesoDocumenti: string;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

const etichettaProcedura = (codice: 'LIQUIDAZIONE' | 'CRAM_DOWN') =>
  codice === 'LIQUIDAZIONE' ? 'liquidazione giudiziale' : 'cram down';

/** «della liquidazione giudiziale», «del cram down»: l'articolo giusto. */
const conArticolo = (codice: 'LIQUIDAZIONE' | 'CRAM_DOWN') =>
  codice === 'LIQUIDAZIONE' ? 'della liquidazione giudiziale' : 'del cram down';

/**
 * Le due procedure rimaste, accostate. Non sceglie: indica quale perdita è
 * minore, e dice perché l'altra non si calcola quando manca.
 */
export function confrontaProcedure(
  liquidazione: ProceduraDecisione | null,
  cramDown: ProceduraDecisione | null
): ConfrontoProcedure {
  const pronte = (
    [
      ['LIQUIDAZIONE', liquidazione],
      ['CRAM_DOWN', cramDown],
    ] as const
  ).filter(
    (x): x is readonly ['LIQUIDAZIONE' | 'CRAM_DOWN', ProceduraDecisione] =>
      x[1] !== null && x[1].calcolabile && x[1].perdita !== null
  );

  if (pronte.length === 2) {
    const [prima, seconda] = pronte;
    const diff = Math.abs((prima[1].perdita as number) - (seconda[1].perdita as number));
    if (diff < 0.005) {
      return {
        liquidazione,
        cramDown,
        minorePerdita: null,
        differenza: 0,
        testo: `Liquidazione giudiziale e cram down lasciano all’ente la stessa perdita (${euro(prima[1].perdita as number)}): sul credito vantato il confronto non distingue le due strade.`,
      };
    }
    const minore = (prima[1].perdita as number) < (seconda[1].perdita as number) ? prima : seconda;
    const maggiore = minore === prima ? seconda : prima;
    return {
      liquidazione,
      cramDown,
      minorePerdita: minore[0],
      differenza: Math.round(diff * 100) / 100,
      testo:
        `Fra le due procedure rimaste, la perdita minore per l’ente è quella ${conArticolo(minore[0])}: ` +
        `recupero ${euro(minore[1].recupero ?? 0)} e perdita ${euro(minore[1].perdita as number)}, ` +
        `contro recupero ${euro(maggiore[1].recupero ?? 0)} e perdita ${euro(maggiore[1].perdita as number)} ${conArticolo(maggiore[0])} ` +
        `(differenza ${euro(diff)}).`,
    };
  }

  if (pronte.length === 1) {
    const [codice, proc] = pronte[0];
    const altra = codice === 'LIQUIDAZIONE' ? cramDown : liquidazione;
    const motivo = altra?.motivo
      ? ` Non si calcola: ${altra.motivo}`
      : ' Non è calcolabile con i parametri configurati.';
    return {
      liquidazione,
      cramDown,
      minorePerdita: null,
      differenza: null,
      testo:
        `Delle due procedure rimaste solo la ${etichettaProcedura(codice)} si calcola: recupero ${euro(proc.recupero ?? 0)} e perdita ${euro(proc.perdita as number)}. ` +
        `L’altra (${etichettaProcedura(codice === 'LIQUIDAZIONE' ? 'CRAM_DOWN' : 'LIQUIDAZIONE')}) non entra nel confronto.${motivo}`,
    };
  }

  const motivi = [liquidazione, cramDown]
    .map((p) => p?.motivo)
    .filter((m): m is string => Boolean(m));
  return {
    liquidazione,
    cramDown,
    minorePerdita: null,
    differenza: null,
    testo: `Nessuna delle due procedure rimaste si calcola con i parametri configurati nell’ente: la perdita non si confronta.${
      motivi.length > 0 ? ` ${motivi.join(' ')}` : ''
    }`,
  };
}

/**
 * Il blocco della decisione: piano, impraticabilità, confronto e documenti.
 *
 * Non si scrive mai «si deve»: si dice che cosa è accertato, che cosa manca e
 * quale numero è minore.
 */
export function componiDecisioneFinale(input: FonteDecisioneFinale): EsitoDecisioneFinale {
  const righe: string[] = [];
  const pnNegativo = input.patrimonioNetto !== null && input.patrimonioNetto < 0;
  const indiciGravi = input.indiciViolati !== null && input.indiciViolati >= SOGLIA_INDICI_GRAVI;
  const pianoImpraticabile = pnNegativo || indiciGravi;
  const pianoMancante = input.piano === 'ASSENTE';

  // 1. IL PIANO.
  if (input.piano === 'ASSENTE') {
    righe.push(
      'Il piano dell’azienda non è in archivio per questa posizione: si sta valutando un accordo ipotizzato, non un piano. Lo scenario, così, non è individuato fino in fondo.'
    );
  } else if (input.piano === 'NON_VALUTABILE') {
    righe.push(
      'Non è stato possibile stabilire se il piano dell’azienda sia in archivio: la lettura del piano non è disponibile, e questo va tenuto presente nel giudizio.'
    );
  } else if (!pianoImpraticabile) {
    righe.push(
      'Il piano dell’azienda è in archivio e, dai numeri della contabile, non risulta escluso: il confronto da valutare resta quello sull’accordo, con liquidazione e cram down come alternativa.'
    );
  }

  // 2. LA CONTABILE CHE RENDE IL PIANO DIFFICILE.
  if (pianoImpraticabile) {
    const cause: string[] = [];
    if (pnNegativo)
      cause.push(`patrimonio netto negativo (${euro(input.patrimonioNetto as number)})`);
    if (indiciGravi)
      cause.push(`${input.indiciViolati} indici di bilancio oltre la soglia di riferimento`);
    righe.push(
      `La situazione contabile rende un piano complicato, se non impossibile, da sostenere: ${cause.join(' e ')}. ` +
        'Il piano può esserci, ma non sta in piedi sui numeri depositati.'
    );
  }

  // 3. LE DUE PROCEDURE RIMASTE.
  const confronto = confrontaProcedure(input.liquidazione, input.cramDown);
  if (pianoMancante || pianoImpraticabile) {
    righe.push(confronto.testo);
  } else if (confronto.minorePerdita) {
    righe.push(
      `Se l’accordo non si chiudesse, ${confronto.testo.charAt(0).toLowerCase()}${confronto.testo.slice(1)}`
    );
  }

  // 4. LA DOCUMENTAZIONE CHE PESA.
  const pesoDocumenti =
    input.documentiMancanti.length === 0
      ? 'Documentazione fondamentale: da questa lettura non risulta mancare nulla.'
      : (() => {
          const alti = input.documentiMancanti.filter((d) => d.peso === 'ALTO').length;
          const medi = input.documentiMancanti.length - alti;
          const elenco = input.documentiMancanti
            .map((d) => `${d.nome} (peso ${d.peso === 'ALTO' ? 'alto' : 'medio'}: ${d.perche})`)
            .join('; ');
          return (
            `Mancano ${input.documentiMancanti.length} ${input.documentiMancanti.length === 1 ? 'documento fondamentale' : 'documenti fondamentali'} — ${elenco}. ` +
            `Pesano sul giudizio complessivo: ${alti > 0 ? `${alti} ${alti === 1 ? 'documento di peso alto cambia' : 'documenti di peso alto cambiano'} la conclusione` : 'nessun documento di peso alto'}` +
            `${medi > 0 ? `, ${medi} ${medi === 1 ? 'di peso medio toglie' : 'di peso medio tolgono'} forza alla lettura` : ''}.`
          );
        })();
  righe.push(pesoDocumenti);

  return {
    titolo: 'La decisione che resta',
    righe,
    confronto,
    pianoMancante,
    pianoImpraticabile,
    pesoDocumenti,
  };
}

/** Il limite dichiarato della lettura, accanto al blocco. */
export const NOTA_DECISIONE_FINALE =
  'Sui numeri configurati nello spazio, non una conclusione giuridica: la scelta resta all’ente, e il confronto è quello che i parametri dell’ente permettono di calcolare.';
