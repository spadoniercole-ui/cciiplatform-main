// src/lib/triage/versioniParametri.ts
//
// I PARAMETRI DEGLI SCENARI A VERSIONI CON DECORRENZA (0.256.33).
//
// Le percentuali del triage non sono un valore solo: cambiano quando l'ente
// aggiorna la propria esperienza di recupero, e un documento chiuso non deve
// cambiare sotto mano perché oggi l'ente ha scritto un numero diverso.
//
// Quindi ogni insieme di percentuali è una VERSIONE con una data di decorrenza:
//
//  - i calcoli nuovi usano l'ultima versione già in vigore;
//  - le verifiche e i progetti già chiusi conservano la versione con cui sono
//    nati (un'istantanea dei valori, non un rimando: cancellare una versione
//    non deve poter cambiare un documento depositato).
//
// Logica pura, con i suoi test. Lettura e scrittura stanno in
// `letturaParametriScenari.ts`, perché parlano col database.

import { RANGHI, type ParametriScenari, type RangoCredito } from './scenari';

export interface VersioneParametri {
  id: number;
  /** Data di decorrenza, ISO `AAAA-MM-GG`. */
  validiDa: string;
  nota: string | null;
  parametri: ParametriScenari;
  /** Quando la versione è stata registrata, ISO `AAAA-MM-GG`. */
  creataIl: string | null;
}

/** I valori con cui un documento è stato chiuso: l'istantanea, non un rimando. */
export interface ParametriCongelati {
  /** La versione da cui vengono i valori, se allora ce n'era una. */
  versioneId: number | null;
  /** La decorrenza di quella versione. */
  validiDa: string | null;
  parametri: ParametriScenari;
  /** Il giorno in cui il documento è stato chiuso. */
  congelatiIl: string | null;
}

export type StatoVersione = 'IN_VIGORE' | 'PROGRAMMATA' | 'SUPERATA';

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

/** Una data ISO senza ora, oppure null: mai una data interpretata a metà. */
export function giornoIso(valore: string | Date | null | undefined): string | null {
  if (valore === null || valore === undefined) return null;
  if (valore instanceof Date) {
    if (Number.isNaN(valore.getTime())) return null;
    return valore.toISOString().slice(0, 10);
  }
  const testo = String(valore).slice(0, 10);
  if (!GIORNO.test(testo)) return null;
  const controlla = new Date(`${testo}T00:00:00Z`);
  if (Number.isNaN(controlla.getTime())) return null;
  return controlla.toISOString().slice(0, 10) === testo ? testo : null;
}

/** Il giorno di oggi in UTC: la stessa convenzione delle date salvate. */
export function oggiIso(adesso: Date = new Date()): string {
  return adesso.toISOString().slice(0, 10);
}

export function decorrenzaValida(giorno: string): boolean {
  return giornoIso(giorno) !== null;
}

/** Dal più recente: è l'ordine in cui si legge la scheda delle versioni. */
export function ordinamentoVersioni(a: VersioneParametri, b: VersioneParametri): number {
  if (a.validiDa !== b.validiDa) return a.validiDa < b.validiDa ? 1 : -1;
  return b.id - a.id;
}

/**
 * L'ultima versione già in vigore alla data di riferimento. Nessuna versione
 * con decorrenza fino a quel giorno = nessuna versione (chi legge decide il
 * ripiego: i parametri correnti, che sono l'impostazione storica dello spazio).
 */
export function versioneInVigore(
  versioni: VersioneParametri[],
  dataRiferimento: string | null
): VersioneParametri | null {
  const giorno = giornoIso(dataRiferimento);
  if (!giorno) return null;
  let scelta: VersioneParametri | null = null;
  for (const v of versioni) {
    if (v.validiDa > giorno) continue;
    if (!scelta) {
      scelta = v;
      continue;
    }
    if (v.validiDa > scelta.validiDa) scelta = v;
    else if (v.validiDa === scelta.validiDa && v.id > scelta.id) scelta = v;
  }
  return scelta;
}

/** In vigore, programmata (decorrenza nel futuro) o superata da una più recente. */
export function statoVersione(
  versione: VersioneParametri,
  versioni: VersioneParametri[],
  oggi: string
): StatoVersione {
  const giorno = giornoIso(oggi) ?? oggiIso();
  if (versione.validiDa > giorno) return 'PROGRAMMATA';
  const vigore = versioneInVigore(versioni, giorno);
  return vigore && vigore.id === versione.id ? 'IN_VIGORE' : 'SUPERATA';
}

/**
 * La decorrenza da proporre per una nuova versione: oggi, se oggi non ha già
 * una versione; altrimenti il giorno dopo l'ultima decorrenza registrata.
 */
export function propostaDecorrenza(versioni: VersioneParametri[], oggi: string): string {
  const giorno = giornoIso(oggi) ?? oggiIso();
  const occupate = new Set(versioni.map((v) => v.validiDa));
  if (!occupate.has(giorno)) return giorno;
  const ultima = versioni.reduce(
    (max, v) => (v.validiDa > max ? v.validiDa : max),
    versioni.length > 0 ? versioni[0].validiDa : giorno
  );
  const base = new Date(`${ultima}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

/** L'istantanea da salvare con un documento che si chiude adesso. */
export function congelaParametri(
  versione: VersioneParametri | null,
  giorno: string
): ParametriCongelati | null {
  if (!versione) return null;
  return {
    versioneId: versione.id,
    validiDa: versione.validiDa,
    parametri: {
      costiProceduraPct: versione.parametri.costiProceduraPct,
      ranghi: versione.parametri.ranghi.map((r) => ({ ...r })),
    },
    congelatiIl: giornoIso(giorno) ?? giorno,
  };
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * L'istantanea riletta da un JSON (colonna `parametri_versione`). Un JSON
 * scritto da una versione precedente o rovinato non deve far fallire un
 * documento: si restituisce null e chi legge ripiega sui parametri correnti.
 */
export function parametriCongelati(valore: unknown): ParametriCongelati | null {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null;
  const grezzo = valore as Record<string, unknown>;
  const p = grezzo.parametri;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const parametriGrezzi = p as Record<string, unknown>;
  const ranghiGrezzi = Array.isArray(parametriGrezzi.ranghi)
    ? (parametriGrezzi.ranghi as unknown[])
    : [];
  const perRango = new Map<string, Record<string, unknown>>();
  for (const r of ranghiGrezzi) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const riga = r as Record<string, unknown>;
    const codice = String(riga.rango ?? '');
    if (codice) perRango.set(codice, riga);
  }
  return {
    versioneId: numero(grezzo.versioneId),
    validiDa: giornoIso(typeof grezzo.validiDa === 'string' ? grezzo.validiDa : null),
    parametri: {
      costiProceduraPct: numero(parametriGrezzi.costiProceduraPct),
      // L'ordine è quello dei ranghi: un documento non cambia ordine di lettura.
      ranghi: RANGHI.map((r) => {
        const salvata = perRango.get(r.codice);
        return {
          rango: r.codice,
          tassoLiquidazionePct: numero(salvata?.tassoLiquidazionePct),
          cramDownPct: numero(salvata?.cramDownPct),
        };
      }),
    },
    congelatiIl: giornoIso(typeof grezzo.congelatiIl === 'string' ? grezzo.congelatiIl : null),
  };
}

const pct = (n: number | null): string =>
  n === null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

/** Es. «spese 20% · prededucibile 100% / 100% · …», per la scheda. */
export function riepilogoVersione(versione: VersioneParametri): string {
  const righe = RANGHI.map((r) => {
    const trovata = versione.parametri.ranghi.find((x) => x.rango === r.codice);
    return `${r.etichetta.toLowerCase()} ${pct(trovata?.tassoLiquidazionePct ?? null)} / ${pct(
      trovata?.cramDownPct ?? null
    )}`;
  });
  return [`spese ${pct(versione.parametri.costiProceduraPct)}`, ...righe].join(' · ');
}

/** La data come si legge in Italia: `01/01/2026`. */
export function dataItaliana(giorno: string | null): string {
  const iso = giornoIso(giorno);
  if (!iso) return '—';
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

/** I ranghi che nella versione non hanno nessun valore: la scheda lo dice. */
export function ranghiSenzaValori(versione: VersioneParametri): RangoCredito[] {
  return RANGHI.filter((r) => {
    const riga = versione.parametri.ranghi.find((x) => x.rango === r.codice);
    return !riga || (riga.tassoLiquidazionePct === null && riga.cramDownPct === null);
  }).map((r) => r.codice);
}
