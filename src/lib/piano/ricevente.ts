// src/lib/piano/ricevente.ts
//
// PIANO DEL RICEVENTE — l'ordine dei fattori voluto da Ercole (04/10/2026):
//
//   1. si parte dal PIANO DELL'AZIENDA, caricato sulle manopole, con i colori
//      dello scostamento dal riferimento di settore: prima di tutto si vede se
//      ciò che l'azienda propone trova riscontro nel suo sviluppo;
//   2. accanto si può caricare la VARIANTE DI SISTEMA, cioè il riferimento di
//      settore calcolato dal motore: una manopola rettifica entrambe le serie
//      e ogni manopola mostra due fasce, una per l'azienda e una per il
//      sistema;
//   3. il PIANO DI RIENTRO si fissa con poche domande che il piano non dice
//      (unica soluzione o rate, quanti mesi, quota in anticipo), sul totale
//      offerto a tutti i creditori; se l'ammortamento esce dall'orizzonte del
//      piano si sceglie quale dei due adeguare;
//   4. la SOLUZIONE: il motore cerca la combinazione di manopole più vicina al
//      piano dell'azienda con cui il piano è «verde» — cassa mai negativa,
//      rate coperte dal flusso di gestione, patrimonio netto non negativo — e
//      dichiara la differenza con il piano dell'azienda e con quello di
//      sistema.
//
// Logica pura e deterministica: la stessa combinazione dà sempre lo stesso
// risultato. L'AI, se disponibile, ne scrive la lettura; non sposta numeri.

import {
  calcolaPiano,
  type AnnoPiano,
  type EsitoPiano,
  type EsercizioStorico,
  type Ipotesi,
  type IpotesiPiano,
  type RatePiano,
  type RigaInput,
  type VincoloPiano,
} from './piano';
import { RIGHE_CONFRONTO, semaforo, type Luce, type SoglieConfronto } from './confronto';
import { applicaRettifiche, righeDelPianoAzienda, type Rettifiche } from './rettifiche';

/** Orizzonte massimo del piano (anni), anche per rateazioni lunghe. */
export const ORIZZONTE_MASSIMO = 10;

// ---------------------------------------------------------------------------
// Serie dell'azienda oltre gli anni dichiarati
// ---------------------------------------------------------------------------

/** Righe che crescono con il settore quando l'azienda non dice più nulla. */
const RIGHE_CON_TREND: RigaInput[] = [
  'ricaviVendite',
  'costiOperativi',
  'creditiClienti',
  'debitiFornitori',
];

/**
 * Allunga il piano dell'azienda fino all'orizzonte: dopo l'ultimo anno
 * dichiarato ricavi, costi, crediti e fornitori seguono la crescita di
 * settore; le altre righe restano al valore dell'ultimo anno.
 */
export function estendiConTrend(
  ipAzienda: IpotesiPiano,
  orizzonte: number,
  tassoSettore: number
): IpotesiPiano {
  const out: IpotesiPiano = {};
  for (const [r, arr0] of Object.entries(ipAzienda) as [RigaInput, (Ipotesi | null)[]][]) {
    const arr = [...(arr0 ?? [])].slice(0, orizzonte);
    let ultimo = -1;
    arr.forEach((ip, i) => {
      if (ip) ultimo = i;
    });
    if (ultimo < 0) continue;
    while (arr.length < orizzonte) arr.push(null);
    for (let i = ultimo + 1; i < orizzonte; i++) {
      arr[i] = RIGHE_CON_TREND.includes(r)
        ? { tipo: 'pct', valore: tassoSettore }
        : { tipo: arr[ultimo]!.tipo, valore: arr[ultimo]!.valore };
    }
    out[r] = arr;
  }
  return out;
}

/** Righe che una rettifica percentuale può spostare (valori in livello). */
const RIGHE_LIVELLO: RigaInput[] = [
  'ricaviVendite',
  'altriRicavi',
  'costiOperativi',
  'ammortamenti',
  'oneriFinanziari',
  'investimenti',
  'creditiClienti',
  'debitiFornitori',
  'debitiBanche',
];

/**
 * La variante di sistema in valori assoluti per anno, così che la stessa
 * rettifica (−15% = ogni anno il 15% in meno) valga uguale sulle due serie.
 */
export function ipotesiAssoluteDa(anni: AnnoPiano[], righe: RigaInput[]): IpotesiPiano {
  const out: IpotesiPiano = {};
  for (const r of righe.filter((x) => RIGHE_LIVELLO.includes(x)))
    out[r] = anni.map((a) => ({
      tipo: 'abs' as const,
      valore: Number((a as unknown as Record<string, number>)[r] ?? 0),
    }));
  return out;
}

// ---------------------------------------------------------------------------
// Colori delle manopole
// ---------------------------------------------------------------------------

const ORDINE: Record<Luce, number> = { nc: 0, verde: 1, giallo: 2, rosso: 3 };

/**
 * Luce di una manopola: lo scostamento, nella direzione favorevole
 * all'azienda, della serie rettificata dal riferimento di settore (il caso
 * peggiore sugli anni). 'nc' per le righe che il confronto non misura.
 */
export function luceManopola(
  serie: AnnoPiano[],
  riferimento: AnnoPiano[],
  riga: RigaInput,
  soglie: SoglieConfronto
): Luce {
  const rc = RIGHE_CONFRONTO.find((x) => x.ipotesi === riga);
  if (!rc) return 'nc';
  let peggiore: Luce = 'nc';
  serie.forEach((a, i) => {
    const rif = riferimento[i];
    if (!rif) return;
    const s = semaforo(
      Number(rif[rc.chiave] ?? 0),
      Number(a[rc.chiave] ?? 0),
      rc.direzione,
      soglie
    );
    if (ORDINE[s.luce] > ORDINE[peggiore]) peggiore = s.luce;
  });
  return peggiore;
}

// ---------------------------------------------------------------------------
// Piano di rientro
// ---------------------------------------------------------------------------

export interface PianoRientro {
  modalita: 'UNICA' | 'RATEALE';
  /** Mesi dell'ammortamento (rateale). */
  mesi: number;
  /** Quota pagata subito, in % del totale offerto. */
  anticipoPct: number;
  /**
   * Totale offerto scritto dall'utente quando la proposta non lo dice (o per
   * correggerlo): all'ente e agli altri creditori. Se assente vale quello
   * letto dalla proposta.
   */
  offerto?: TotaleOfferto;
}

export interface TotaleOfferto {
  /** Offerto all'ente dello spazio. */
  ente: number;
  /** Offerto a tutti gli altri creditori della proposta. */
  altri: number;
}

/**
 * Rate annue dal piano di rientro scelto, sul totale offerto a tutti i
 * creditori; ente e altri conservano la proporzione della proposta. La
 * quota in anticipo e l'unica soluzione cadono nel primo anno.
 */
export function rateDaPianoRientro(
  offerto: TotaleOfferto,
  piano: PianoRientro,
  orizzonte: number
): RatePiano {
  const o = piano.offerto ?? offerto;
  const totale = o.ente + o.altri;
  const anni = new Array(orizzonte).fill(0);
  if (totale > 0 && orizzonte > 0) {
    const anticipo = (totale * Math.max(0, Math.min(100, piano.anticipoPct))) / 100;
    const resto = totale - anticipo;
    anni[0] += anticipo;
    if (piano.modalita === 'UNICA' || piano.mesi <= 1) anni[0] += resto;
    else {
      const mesi = Math.round(piano.mesi);
      for (let m = 0; m < mesi; m++) {
        const a = Math.floor(m / 12);
        if (a < orizzonte) anni[a] += resto / mesi;
      }
    }
  }
  const quotaEnte = totale > 0 ? o.ente / totale : 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ente: anni.map((v) => r2(v * quotaEnte)),
    altri: anni.map((v) => r2(v * (1 - quotaEnte))),
  };
}

export interface ConflittoOrizzonte {
  mesi: number;
  orizzonte: number;
  /** Anni che servirebbero al piano per contenere l'ammortamento. */
  anniNecessari: number;
  /** true se allungare il piano è possibile (entro ORIZZONTE_MASSIMO). */
  allungabile: boolean;
}

/** L'ammortamento sta dentro l'orizzonte del piano? Se no, che cosa si può fare. */
export function conflittoOrizzonte(
  piano: PianoRientro,
  orizzonte: number
): ConflittoOrizzonte | null {
  if (piano.modalita !== 'RATEALE' || piano.mesi <= orizzonte * 12) return null;
  const anniNecessari = Math.ceil(piano.mesi / 12);
  return {
    mesi: piano.mesi,
    orizzonte,
    anniNecessari,
    allungabile: anniNecessari <= ORIZZONTE_MASSIMO,
  };
}

// ---------------------------------------------------------------------------
// Soluzione verde
// ---------------------------------------------------------------------------

/** Vincoli che rendono il piano non verde (la perdita d'esercizio si segnala ma non blocca). */
export const VINCOLI_BLOCCANTI: VincoloPiano['codice'][] = [
  'CASSA_NEGATIVA',
  'RATE_NON_COPERTE',
  'PATRIMONIO_NEGATIVO',
];

export function pianoVerde(esito: EsitoPiano): boolean {
  return !esito.vincoli.some((v) => VINCOLI_BLOCCANTI.includes(v.codice));
}

/** Leve che la soluzione può muovere, con il verso che aiuta e il «costo» di un passo. */
export interface Leva {
  riga: RigaInput | 'apportoIniziale';
  /** +1: aumentare aiuta il piano; −1: diminuire aiuta. */
  verso: 1 | -1;
  /** Penalità per passo: più alta = leva da usare solo se le altre non bastano. */
  peso: number;
}

export const LEVE: Leva[] = [
  { riga: 'creditiClienti', verso: -1, peso: 1 },
  { riga: 'debitiFornitori', verso: 1, peso: 1 },
  { riga: 'investimenti', verso: -1, peso: 1 },
  { riga: 'oneriFinanziari', verso: -1, peso: 1.5 },
  { riga: 'costiOperativi', verso: -1, peso: 2 },
  { riga: 'ricaviVendite', verso: 1, peso: 3 },
  { riga: 'altriRicavi', verso: 1, peso: 3 },
  { riga: 'apportoIniziale', verso: 1, peso: 1.5 },
];

/** Limite di una rettifica percentuale nella ricerca della soluzione. */
export const LIMITE_LEVA = 50;

export interface IngressoSoluzione {
  storico: EsercizioStorico;
  orizzonte: number;
  /** Piano dell'azienda (già esteso all'orizzonte). */
  ipAzienda: IpotesiPiano;
  /** Ipotesi delle righe che il piano dell'azienda non contiene. */
  ipOrdinarie: IpotesiPiano;
  rate: RatePiano;
  capitaleSociale: number | null;
}

export interface Soluzione {
  verde: boolean;
  /** Rettifiche % sulle righe del piano dell'azienda. */
  rettifiche: Rettifiche;
  /** Versamento dei soci nel primo anno (€), 0 se non serve. */
  apportoIniziale: number;
  esito: EsitoPiano;
  /** Vincoli che restano se il verde non si raggiunge entro i limiti delle leve. */
  residui: VincoloPiano[];
}

/** Ipotesi complete con rettifiche e apporto iniziale. */
export function ipotesiConLeve(
  ing: IngressoSoluzione,
  rettifiche: Rettifiche,
  apportoIniziale: number
): IpotesiPiano {
  const ip = applicaRettifiche(ing.ipAzienda, rettifiche, ing.ipOrdinarie);
  if (apportoIniziale > 0) {
    const arr = [...(ip.apportiSoci ?? [])];
    while (arr.length < ing.orizzonte) arr.push(null);
    const primo = arr[0];
    arr[0] = { tipo: 'abs', valore: (primo?.valore ?? 0) + apportoIniziale };
    ip.apportiSoci = arr;
  }
  return ip;
}

/** Quanto manca al verde, in euro: cassa sotto zero, rate scoperte, patrimonio sotto il minimo. */
function mancanza(esito: EsitoPiano, capitale: number | null): number {
  let m = 0;
  for (const a of esito.anni) {
    if (a.disponibilitaLiquide < 0) m += -a.disponibilitaLiquide;
    const servizio = a.rateEnte + a.rateAltri;
    if (a.coperturaRate !== null && a.coperturaRate < 1 && servizio > 0)
      m += servizio * (1 - a.coperturaRate);
    const minimo = capitale !== null ? Math.max(0, capitale) : 0;
    if (a.patrimonioNetto < minimo) m += minimo - a.patrimonioNetto;
  }
  return m;
}

/**
 * Cerca la combinazione di leve più vicina al piano dell'azienda con cui il
 * piano è verde. Ricerca a passi: a ogni passo muove la leva che riduce di
 * più la mancanza per unità di «costo»; raggiunto il verde, riporta indietro
 * ogni leva finché il piano resta verde. Se il verde non si raggiunge entro i
 * limiti delle leve, restituisce la combinazione migliore e i vincoli residui.
 */
export function cercaSoluzioneVerde(ing: IngressoSoluzione): Soluzione {
  const righeAz = righeDelPianoAzienda(ing.ipAzienda);
  const leve = LEVE.filter((l) => l.riga === 'apportoIniziale' || righeAz.has(l.riga));
  const passoApporto = Math.max(
    1000,
    Math.round(Math.abs(ing.storico.ricaviVendite) / 100 / 1000) * 1000
  );
  const maxApporto = Math.max(
    passoApporto * 10,
    Math.round(Math.max(ing.storico.ricaviVendite * 0.3, -ing.storico.patrimonioNetto) / 1000) *
      1000
  );

  const stato: Record<string, number> = Object.fromEntries(leve.map((l) => [l.riga, 0]));
  const calcola = (s: Record<string, number>) => {
    const rett: Rettifiche = {};
    for (const l of leve)
      if (l.riga !== 'apportoIniziale' && s[l.riga]) rett[l.riga] = { valore: s[l.riga] };
    const ip = ipotesiConLeve(ing, rett, s.apportoIniziale ?? 0);
    const esito = calcolaPiano(ing.storico, ing.orizzonte, ip, ing.rate, ing.capitaleSociale);
    return { rett, esito, m: mancanza(esito, ing.capitaleSociale), verde: pianoVerde(esito) };
  };
  const passo = (l: Leva) => (l.riga === 'apportoIniziale' ? passoApporto : 1);
  const limite = (l: Leva) => (l.riga === 'apportoIniziale' ? maxApporto : LIMITE_LEVA);

  let corrente = calcola(stato);
  for (let giro = 0; giro < 400 && !corrente.verde; giro++) {
    let migliore: { l: Leva; ris: ReturnType<typeof calcola>; guadagno: number } | null = null;
    for (const l of leve) {
      const nuovo = stato[l.riga] + l.verso * passo(l);
      if (Math.abs(nuovo) > limite(l)) continue;
      const ris = calcola({ ...stato, [l.riga]: nuovo });
      const guadagno = (corrente.m - ris.m) / l.peso + (ris.verde ? 1e12 : 0);
      if (guadagno > 0 && (!migliore || guadagno > migliore.guadagno))
        migliore = { l, ris, guadagno };
    }
    if (!migliore) break;
    stato[migliore.l.riga] += migliore.l.verso * passo(migliore.l);
    corrente = migliore.ris;
  }

  if (corrente.verde) {
    // Riporta indietro ogni leva finché resta verde: la soluzione più vicina
    // al piano dell'azienda, non la prima trovata.
    let cambiato = true;
    while (cambiato) {
      cambiato = false;
      for (const l of [...leve].sort((a, b) => b.peso - a.peso)) {
        if (!stato[l.riga]) continue;
        const prova = { ...stato, [l.riga]: stato[l.riga] - l.verso * passo(l) };
        const ris = calcola(prova);
        if (ris.verde) {
          Object.assign(stato, prova);
          corrente = ris;
          cambiato = true;
        }
      }
    }
  }

  return {
    verde: corrente.verde,
    rettifiche: corrente.rett,
    apportoIniziale: stato.apportoIniziale ?? 0,
    esito: corrente.esito,
    residui: corrente.esito.vincoli.filter((v) => VINCOLI_BLOCCANTI.includes(v.codice)),
  };
}

// ---------------------------------------------------------------------------
// Differenze della soluzione dai due piani
// ---------------------------------------------------------------------------

export interface DifferenzaRiga {
  riga: RigaInput;
  /** Rettifica della soluzione sul piano dell'azienda (%). */
  suAzienda: number;
  /** Scostamento medio della soluzione dal piano di sistema (%), null se non confrontabile. */
  suSistema: number | null;
}

/** Per ogni riga mossa: di quanto la soluzione si discosta dal piano dell'azienda e da quello di sistema. */
export function differenzeSoluzione(soluzione: Soluzione, sistema: AnnoPiano[]): DifferenzaRiga[] {
  return (Object.entries(soluzione.rettifiche) as [RigaInput, { valore: number }][])
    .filter(([, v]) => v.valore !== 0)
    .map(([riga, v]) => {
      const scarti = soluzione.esito.anni
        .map((a, i) => {
          const s = Number((sistema[i] as unknown as Record<string, number> | undefined)?.[riga]);
          const x = Number((a as unknown as Record<string, number>)[riga]);
          return Number.isFinite(s) && Math.abs(s) >= 1 ? ((x - s) / Math.abs(s)) * 100 : null;
        })
        .filter((n): n is number => n !== null);
      return {
        riga,
        suAzienda: v.valore,
        suSistema: scarti.length
          ? Math.round((scarti.reduce((a, b) => a + b, 0) / scarti.length) * 10) / 10
          : null,
      };
    });
}
