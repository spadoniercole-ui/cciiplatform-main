// LE LETTURE A CONFRONTO (0.242.0).
//
// Le quattro verifiche NON devono dire la stessa cosa: la check list è una
// dichiarazione, gli indici un fatto di bilancio, la fotografia una proiezione,
// gli scenari aritmetica sul credito. La 0.240.0 ha eliminato la divergenza
// finta (due motori che ricalcolavano la stessa cosa); questa è la divergenza
// vera, e va mostrata — perché il rischio non è che i numeri litighino, è che
// chi legge tenga in testa solo quello che gli conviene.
//
// Ogni divergenza qui è spiegata con la sua natura e con l'errore che evita.
// Non è un pareggio e non produce un esito nuovo: la decisione resta di chi
// firma.
//
// Logica pura, con i suoi test.

export type NaturaLettura = 'ACCERTATO' | 'DICHIARATO' | 'PROIEZIONE' | 'ARITMETICA';

export interface Lettura {
  nome: string;
  natura: NaturaLettura;
  esito: string;
  dettaglio: string;
}

export interface Divergenza {
  tema: string;
  /** Che cosa dice ciascuna lettura, in una riga. */
  letture: string[];
  perche: string;
  /** L'errore che questa divergenza, se non spiegata, produce. */
  rischio: string;
}

export interface ConfrontoLetture {
  letture: Lettura[];
  divergenze: Divergenza[];
  nota: string;
}

export const NATURA_ETICHETTA: Record<NaturaLettura, string> = {
  ACCERTATO: 'fatto accertato',
  DICHIARATO: 'dichiarazione',
  PROIEZIONE: 'proiezione',
  ARITMETICA: 'aritmetica',
};

import { formattaEuroONull as euro } from '@/lib/formato/numeri';

const parolaColore = (c: 'verde' | 'giallo' | 'rosso' | null): string =>
  c === 'rosso'
    ? 'sfavorevole'
    : c === 'giallo'
      ? 'da approfondire'
      : c === 'verde'
        ? 'favorevole'
        : 'non valutabile';

/**
 * Quanti indici diagnostici risultano oltre soglia, letto dalla riga
 * «accertato» dell'indicatore. È una lettura del testo che l'indicatore
 * produce già: se la formula cambia, il caso peggiore è null (nessuna
 * divergenza inventata).
 */
export function indiciDaAccertato(accertato: string[] | null | undefined): number | null {
  for (const riga of accertato ?? []) {
    const m = riga.match(/(\d+)\s+indice\s+diagnostico|(\d+)\s+indici\s+diagnostici/i);
    if (m) return Number(m[1] ?? m[2]);
    if (/indici\s+diagnostici\s+di\s+bilancio\s+oltre/i.test(riga)) return 0;
  }
  return null;
}

export function confrontoLetture(input: {
  amministrativa: {
    esito: string;
    etichetta: string;
    fattore: string;
    copertura: { determinate: number; totali: number };
  } | null;
  qualitativo: { colore: 'verde' | 'giallo' | 'rosso' | null; dettaglio: string | null };
  indiciViolati: number | null;
  fotografia: {
    capacita: 'INTEGRALE' | 'PARZIALE' | 'NON_CALCOLABILE';
    coperturaPct: number | null;
    dettaglio: string;
  } | null;
  scenari: {
    calcolabili: number;
    totali: number;
    liquidazione: number | null;
    cramDown: number | null;
    credito: number | null;
  };
}): ConfrontoLetture {
  const letture: Lettura[] = [];
  const divergenze: Divergenza[] = [];

  if (input.amministrativa) {
    letture.push({
      nome: 'Indicatore di attenzione',
      natura: 'ACCERTATO',
      esito: input.amministrativa.etichetta,
      dettaglio: `${input.amministrativa.fattore}; ${input.amministrativa.copertura.determinate}/${input.amministrativa.copertura.totali} dimensioni coperte.`,
    });
  }

  letture.push({
    nome: 'Check list',
    natura: 'DICHIARATO',
    esito: parolaColore(input.qualitativo.colore),
    dettaglio:
      input.qualitativo.dettaglio ??
      'Nessun quadro qualitativo: la check list non è compilata o è incompleta.',
  });

  if (input.fotografia) {
    letture.push({
      nome: 'Fotografia dell’azienda',
      natura: 'PROIEZIONE',
      esito:
        input.fotografia.capacita === 'INTEGRALE'
          ? 'la cassa copre il credito'
          : input.fotografia.capacita === 'PARZIALE'
            ? 'la cassa non copre il credito'
            : 'non calcolabile',
      dettaglio: input.fotografia.dettaglio,
    });
  }

  const recuperi = [input.scenari.liquidazione, input.scenari.cramDown].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  letture.push({
    nome: 'Scenari sul credito',
    natura: 'ARITMETICA',
    esito:
      input.scenari.totali === 0
        ? 'non calcolati'
        : `${input.scenari.calcolabili} su ${input.scenari.totali} calcolabili`,
    dettaglio:
      recuperi.length === 0
        ? 'Nessun recupero calcolabile: mancano le percentuali del rango o il credito vantato.'
        : `Liquidazione ${euro(input.scenari.liquidazione) ?? 'non calcolabile'}; cram down ${euro(input.scenari.cramDown) ?? 'non calcolabile'}; credito vantato ${euro(input.scenari.credito) ?? 'non accertato'}.`,
  });

  const colore = input.qualitativo.colore;
  const coloreParla = colore === 'rosso' || colore === 'giallo';

  if (coloreParla && input.indiciViolati === 0) {
    divergenze.push({
      tema: 'Il quadro qualitativo segnala, gli indici no',
      letture: [
        `Check list: ${parolaColore(colore)} (dichiarazione).`,
        'Indici diagnostici: nessuno oltre la soglia (fatto di bilancio).',
      ],
      perche:
        'Sono due nature diverse: la check list raccoglie ciò che l’azienda dichiara e l’operatore osserva, gli indici misurano il bilancio. Possono divergere senza che una delle due sia sbagliata.',
      rischio:
        'Citare il quadro come prova di un fatto, oppure scartarlo perché «non è un numero»: in entrambi i casi si perde l’informazione che porta.',
    });
  }

  if (!coloreParla && (input.indiciViolati ?? 0) > 0) {
    divergenze.push({
      tema: 'Gli indici segnalano, il quadro qualitativo no',
      letture: [
        `Check list: ${parolaColore(colore)}.`,
        `Indici diagnostici: ${input.indiciViolati} oltre la soglia di riferimento.`,
      ],
      perche:
        'Un quadro dichiarativo favorevole non annulla un indice oltre soglia: le risposte non sono un controllo di bilancio.',
      rischio:
        'Concludere che gli indici non contino perché l’azienda ha risposto bene: è l’errore che la logica non compensatoria dell’indicatore esiste per evitare.',
    });
  }

  const amministrativaRossa = input.amministrativa?.esito === 'ROSSO';
  const cassaCopre = input.fotografia?.capacita === 'INTEGRALE';

  if (cassaCopre && amministrativaRossa) {
    divergenze.push({
      tema: 'La cassa copre il credito, l’indicatore è rosso',
      letture: [
        `Fotografia: disponibilità liquide sufficienti${
          input.fotografia?.coperturaPct != null
            ? ` (${input.fotografia.coperturaPct}% del credito)`
            : ''
        }.`,
        'Indicatore: soglie o patrimonio netto oltre la soglia.',
      ],
      perche:
        'La fotografia guarda una data e una grandezza (la cassa); l’indicatore legge fatti giuridici e di bilancio che la cassa non cancella.',
      rischio:
        'Usare la cassa come motivo per non segnalare: il superamento di una soglia è un fatto, non un saldo.',
    });
  }

  const credito = input.scenari.credito;
  const migliore = recuperi.length > 0 ? Math.max(...recuperi) : null;
  if (cassaCopre && credito !== null && migliore !== null && migliore < credito) {
    divergenze.push({
      tema: 'L’accordo regge, la procedura rende meno',
      letture: [
        'Accordo: la cassa disponibile copre il credito vantato.',
        `Procedure: il miglior recupero calcolabile è ${euro(migliore)} su ${euro(credito)}.`,
      ],
      perche:
        'La capacità di risposta è una fotografia; il recupero in procedura è aritmetica su una percentuale del rango. Misurano due cose diverse dello stesso credito.',
      rischio:
        'Trattare la capacità di risposta come recupero: sono due numeri, e servono entrambi al tavolo.',
    });
  }

  return {
    letture,
    divergenze,
    nota:
      divergenze.length === 0
        ? 'Le letture non si contraddicono. Restano nature diverse: non si sommano e non si compensano.'
        : `${divergenze.length} ${divergenze.length === 1 ? 'divergenza' : 'divergenze'} fra letture di natura diversa. Nessuna delle due va spenta: va letta per quello che è.`,
  };
}
