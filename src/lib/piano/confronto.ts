// src/lib/piano/confronto.ts
//
// CONFRONTO tra il piano dell'azienda e il piano automatico (settore), riga
// per riga e anno per anno, con semafori che tengono conto della DIREZIONE
// (scelta di Ercole):
//   - lo scostamento nella direzione prudente è sempre verde (ricavi più
//     bassi, costi più alti del riferimento: l'azienda si è tenuta larga);
//   - nella direzione ottimistica: verde fino alla soglia verde (10%),
//     giallo fino alla soglia gialla (25%), rosso oltre;
//   - le soglie sono dell'ente, in Parametri di Spazio.
// I semafori non sono un giudizio sul piano: dicono dove l'azienda si
// discosta dal riferimento in senso favorevole, cioè dove chiedere conto
// delle ipotesi.

import type { AnnoPiano, IpotesiPiano, RigaInput } from './piano';

export interface SoglieConfronto {
  verde: number; // % entro cui l'ottimismo resta verde
  giallo: number; // % entro cui l'ottimismo resta giallo
}

export const SOGLIE_PREDEFINITE: SoglieConfronto = { verde: 10, giallo: 25 };

export function soglieValide(s: Partial<SoglieConfronto> | null | undefined): SoglieConfronto {
  const verde = Number(s?.verde);
  const giallo = Number(s?.giallo);
  const v = Number.isFinite(verde) && verde >= 0 && verde <= 100 ? verde : SOGLIE_PREDEFINITE.verde;
  const g =
    Number.isFinite(giallo) && giallo > v && giallo <= 200
      ? giallo
      : Math.max(v + 1, SOGLIE_PREDEFINITE.giallo);
  return { verde: v, giallo: g };
}

export type Luce = 'verde' | 'giallo' | 'rosso' | 'nc';

/** 'alto' = un valore più alto è l'ipotesi più favorevole all'azienda. */
export type DirezioneOttimistica = 'alto' | 'basso';

export interface RigaConfronto {
  chiave: keyof AnnoPiano;
  etichetta: string;
  direzione: DirezioneOttimistica;
  /** Riga d'ipotesi da cui dipende (se l'azienda non l'ha indicata, il confronto non è significativo). */
  ipotesi?: RigaInput;
}

export const RIGHE_CONFRONTO: RigaConfronto[] = [
  {
    chiave: 'ricaviVendite',
    etichetta: 'Ricavi delle vendite',
    direzione: 'alto',
    ipotesi: 'ricaviVendite',
  },
  { chiave: 'valoreProduzione', etichetta: 'Valore della produzione', direzione: 'alto' },
  {
    chiave: 'costiOperativi',
    etichetta: 'Costi della produzione (senza ammortamenti)',
    direzione: 'basso',
    ipotesi: 'costiOperativi',
  },
  { chiave: 'ebitda', etichetta: 'EBITDA', direzione: 'alto' },
  {
    chiave: 'oneriFinanziari',
    etichetta: 'Oneri finanziari',
    direzione: 'basso',
    ipotesi: 'oneriFinanziari',
  },
  { chiave: 'utile', etichetta: 'Risultato d’esercizio', direzione: 'alto' },
  { chiave: 'flussoGestione', etichetta: 'Flusso di cassa della gestione', direzione: 'alto' },
  {
    chiave: 'creditiClienti',
    etichetta: 'Crediti verso clienti',
    direzione: 'basso',
    ipotesi: 'creditiClienti',
  },
  {
    chiave: 'debitiFornitori',
    etichetta: 'Debiti verso fornitori',
    direzione: 'alto',
    ipotesi: 'debitiFornitori',
  },
  {
    chiave: 'disponibilitaLiquide',
    etichetta: 'Disponibilità liquide (fine anno)',
    direzione: 'alto',
  },
];

export interface CellaConfronto {
  anno: number;
  automatico: number;
  azienda: number;
  /** Scostamento % verso l'ottimismo: positivo = l'azienda è più ottimista del riferimento. null = non confrontabile. */
  ottimismo: number | null;
  luce: Luce;
}

export interface EsitoRigaConfronto {
  riga: RigaConfronto;
  celle: CellaConfronto[];
  peggiore: Luce;
  /** true se l'azienda non ha indicato la riga d'ipotesi: il valore è il riporto dell'anno prima. */
  nonIndicata: boolean;
}

export interface EsitoConfronto {
  righe: EsitoRigaConfronto[];
  conteggio: Record<Luce, number>;
  sintesi: string;
}

const ORDINE: Record<Luce, number> = { nc: 0, verde: 1, giallo: 2, rosso: 3 };

/** Semaforo di una cella. Riferimento nullo o quasi: confronto non significativo. */
export function semaforo(
  automatico: number,
  azienda: number,
  direzione: DirezioneOttimistica,
  soglie: SoglieConfronto
): { ottimismo: number | null; luce: Luce } {
  const base = Math.abs(automatico);
  if (base < 1) {
    if (Math.abs(azienda) < 1) return { ottimismo: 0, luce: 'verde' };
    return { ottimismo: null, luce: 'nc' };
  }
  const scarto = ((azienda - automatico) / base) * 100;
  const ottimismo = Math.round((direzione === 'alto' ? scarto : -scarto) * 10) / 10;
  if (ottimismo <= soglie.verde) return { ottimismo, luce: 'verde' };
  if (ottimismo <= soglie.giallo) return { ottimismo, luce: 'giallo' };
  return { ottimismo, luce: 'rosso' };
}

export function confrontaPiani(
  automatico: AnnoPiano[],
  azienda: AnnoPiano[],
  /** null = piano dell'operatore (Redigente): ogni riga conta, anche se riporta l'anno prima. */
  ipotesiAzienda: IpotesiPiano | null,
  soglie: SoglieConfronto,
  /** Anni in cui l'azienda ha indicato almeno un valore: gli altri anni non si confrontano. */
  anniConDati?: Set<number>,
  /** Ultima frase della sintesi: cosa farne (Ricevente: chiederne conto; Redigente: documentarle). */
  chiusura = 'Sono le ipotesi su cui chiedere conto all’azienda.'
): EsitoConfronto {
  const conteggio: Record<Luce, number> = { verde: 0, giallo: 0, rosso: 0, nc: 0 };
  const righe = RIGHE_CONFRONTO.map((riga) => {
    const nonIndicata =
      ipotesiAzienda && riga.ipotesi ? !(ipotesiAzienda[riga.ipotesi] ?? []).some(Boolean) : false;
    const celle: CellaConfronto[] = automatico.map((a, i) => {
      const z = azienda[i];
      const va = Number(a[riga.chiave] ?? 0);
      const vz = Number(z?.[riga.chiave] ?? 0);
      const cellaVuota =
        nonIndicata ||
        (anniConDati !== undefined && !anniConDati.has(a.anno)) ||
        (ipotesiAzienda !== null &&
          riga.ipotesi !== undefined &&
          !ipotesiAzienda[riga.ipotesi]?.[i]);
      const s = cellaVuota
        ? { ottimismo: null, luce: 'nc' as Luce }
        : semaforo(va, vz, riga.direzione, soglie);
      conteggio[s.luce]++;
      return { anno: a.anno, automatico: va, azienda: vz, ...s };
    });
    const peggiore = celle.reduce<Luce>((p, c) => (ORDINE[c.luce] > ORDINE[p] ? c.luce : p), 'nc');
    return { riga, celle, peggiore, nonIndicata };
  });
  const rosse = righe
    .filter((r) => r.peggiore === 'rosso')
    .map((r) => r.riga.etichetta.toLowerCase());
  const gialle = righe
    .filter((r) => r.peggiore === 'giallo')
    .map((r) => r.riga.etichetta.toLowerCase());
  const sintesi =
    rosse.length === 0 && gialle.length === 0
      ? `Il piano dell’azienda resta entro il ${soglie.verde}% dal riferimento in senso favorevole su tutte le voci confrontate.`
      : [
          rosse.length
            ? `Oltre il ${soglie.giallo}% in senso favorevole all’azienda: ${rosse.join(', ')}.`
            : '',
          gialle.length
            ? `Tra il ${soglie.verde}% e il ${soglie.giallo}%: ${gialle.join(', ')}.`
            : '',
          chiusura,
        ]
          .filter(Boolean)
          .join(' ');
  return { righe, conteggio, sintesi };
}
