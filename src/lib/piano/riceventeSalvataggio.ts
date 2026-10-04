// src/lib/piano/riceventeSalvataggio.ts
//
// Forma salvata del piano di rientro e della soluzione verde del Ricevente,
// con la pulizia di ciò che arriva dal browser o dal database. Modulo puro.

import type { EsitoPiano, RigaInput } from './piano';
import { ETICHETTA_RIGA, euro } from './piano';
import type { DifferenzaRiga, PianoRientro, Soluzione } from './ricevente';
import { ORIZZONTE_MASSIMO } from './ricevente';

export interface IndicatoriPiano {
  cassaMinima: number;
  patrimonioFinale: number;
  /** Copertura minima delle rate (flusso / rate), null se non ci sono rate. */
  coperturaMinima: number | null;
  vincoli: number;
}

export interface SoluzioneSalvata {
  verde: boolean;
  /** Rettifiche % della soluzione sulle righe del piano dell'azienda. */
  rettifiche: Partial<Record<RigaInput, number>>;
  apportoIniziale: number;
  differenze: DifferenzaRiga[];
  indicatori: {
    azienda: IndicatoriPiano;
    sistema: IndicatoriPiano | null;
    soluzione: IndicatoriPiano;
  };
  /** Testo della soluzione scritto dal motore (deterministico). */
  testo: string;
  /** Lettura dell'AI, se disponibile. */
  commentoAi: string | null;
  calcolataIl: string;
}

const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function pianoRientroPulito(v: unknown): PianoRientro | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const modalita = o.modalita === 'RATEALE' ? 'RATEALE' : o.modalita === 'UNICA' ? 'UNICA' : null;
  if (!modalita) return null;
  return {
    modalita,
    mesi:
      modalita === 'RATEALE'
        ? Math.max(1, Math.min(ORIZZONTE_MASSIMO * 12 * 2, Math.round(n(o.mesi, 1))))
        : 0,
    anticipoPct: Math.max(0, Math.min(100, Math.round(n(o.anticipoPct) * 10) / 10)),
    ...(o.offerto && typeof o.offerto === 'object'
      ? {
          offerto: {
            ente: Math.max(0, n((o.offerto as Record<string, unknown>).ente)),
            altri: Math.max(0, n((o.offerto as Record<string, unknown>).altri)),
          },
        }
      : {}),
  };
}

export function indicatori(e: EsitoPiano): IndicatoriPiano {
  const cop = e.anni.map((a) => a.coperturaRate).filter((c): c is number => c !== null);
  return {
    cassaMinima: e.cassaMinima,
    patrimonioFinale: e.anni[e.anni.length - 1]?.patrimonioNetto ?? 0,
    coperturaMinima: cop.length ? Math.min(...cop) : null,
    vincoli: e.vincoli.length,
  };
}

function indicatoriPuliti(v: unknown): IndicatoriPiano | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    cassaMinima: n(o.cassaMinima),
    patrimonioFinale: n(o.patrimonioFinale),
    coperturaMinima: typeof o.coperturaMinima === 'number' ? o.coperturaMinima : null,
    vincoli: Math.round(n(o.vincoli)),
  };
}

export function soluzionePulita(v: unknown): SoluzioneSalvata | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ind = (o.indicatori ?? {}) as Record<string, unknown>;
  const az = indicatoriPuliti(ind.azienda);
  const so = indicatoriPuliti(ind.soluzione);
  if (!az || !so) return null;
  const rett: Partial<Record<RigaInput, number>> = {};
  for (const [k, x] of Object.entries((o.rettifiche ?? {}) as Record<string, unknown>))
    if (k in ETICHETTA_RIGA && typeof x === 'number' && Number.isFinite(x))
      rett[k as RigaInput] = Math.max(-60, Math.min(60, x));
  const diff = Array.isArray(o.differenze)
    ? (o.differenze as Record<string, unknown>[])
        .filter((d) => d && typeof d.riga === 'string' && d.riga in ETICHETTA_RIGA)
        .map((d) => ({
          riga: d.riga as RigaInput,
          suAzienda: n(d.suAzienda),
          suSistema: typeof d.suSistema === 'number' ? d.suSistema : null,
        }))
    : [];
  return {
    verde: o.verde === true,
    rettifiche: rett,
    apportoIniziale: Math.max(0, n(o.apportoIniziale)),
    differenze: diff,
    indicatori: { azienda: az, sistema: indicatoriPuliti(ind.sistema), soluzione: so },
    testo: String(o.testo ?? '').slice(0, 4000),
    commentoAi: typeof o.commentoAi === 'string' ? o.commentoAi.slice(0, 6000) : null,
    calcolataIl: String(o.calcolataIl ?? new Date().toISOString()),
  };
}

const pct = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

function descriviRientro(p: PianoRientro | null): string {
  if (!p) return 'piano di rientro come da proposta';
  if (p.modalita === 'UNICA')
    return `pagamento in unica soluzione${p.anticipoPct ? ` (anticipo ${p.anticipoPct}%)` : ''}`;
  return `${p.mesi} rate mensili${p.anticipoPct ? `, con il ${p.anticipoPct}% subito` : ''}`;
}

/** Testo della soluzione, deterministico: lo stesso che leggono la Relazione e l'AI. */
export function testoSoluzione(
  sol: Soluzione,
  differenze: DifferenzaRiga[],
  ind: SoluzioneSalvata['indicatori'],
  rientro: PianoRientro | null,
  orizzonte: number,
  totaleOfferto?: number
): string {
  const righe: string[] = [];
  righe.push(
    `Piano su ${orizzonte} anni, ${descriviRientro(rientro)}, sul totale offerto a tutti i creditori${totaleOfferto !== undefined ? ` (${euro(totaleOfferto)})` : ''}.`
  );
  righe.push(
    `Piano dell’azienda: cassa minima ${euro(ind.azienda.cassaMinima)}, patrimonio netto finale ${euro(ind.azienda.patrimonioFinale)}, ${ind.azienda.vincoli} vincoli.` +
      (ind.sistema
        ? ` Piano di sistema (riferimento di settore): cassa minima ${euro(ind.sistema.cassaMinima)}, patrimonio netto finale ${euro(ind.sistema.patrimonioFinale)}, ${ind.sistema.vincoli} vincoli.`
        : '')
  );
  const mosse = differenze.map(
    (d) =>
      `${ETICHETTA_RIGA[d.riga].split(' (')[0].toLowerCase()} ${pct(d.suAzienda)} sul piano dell’azienda${d.suSistema !== null ? ` (${pct(d.suSistema)} sul piano di sistema)` : ''}`
  );
  if (sol.apportoIniziale > 0)
    mosse.push(`apporto dei soci di ${euro(sol.apportoIniziale)} nel primo anno`);
  if (sol.verde) {
    righe.push(
      mosse.length
        ? `Combinazione più vicina al piano dell’azienda con cui il piano resta verde (cassa mai negativa, rate coperte, patrimonio netto non negativo): ${mosse.join('; ')}.`
        : 'Il piano dell’azienda è già verde: nessuna rettifica necessaria.'
    );
  } else {
    righe.push(
      `Entro i limiti delle leve (±50% per riga) il piano non diventa verde${mosse.length ? `; la combinazione migliore è: ${mosse.join('; ')}` : ''}. Restano: ${sol.residui
        .slice(0, 4)
        .map((v) => v.testo)
        .join(' ')}`
    );
  }
  righe.push(
    `Con la soluzione: cassa minima ${euro(ind.soluzione.cassaMinima)}, patrimonio netto finale ${euro(ind.soluzione.patrimonioFinale)}${ind.soluzione.coperturaMinima !== null ? `, copertura minima delle rate ${ind.soluzione.coperturaMinima.toFixed(2)}×` : ''}.`
  );
  return righe.join('\n');
}
