// src/lib/piano/rettifiche.ts
//
// RICEVENTE — le manopole partono dal PIANO DELL'AZIENDA (regola di Ercole,
// 02/10/2026: «il punto di partenza è la base aziendale»). Chi riceve una
// proposta non costruisce un piano suo: mette alla prova quello che ha
// ricevuto. Ogni manopola è una RETTIFICA percentuale della riga del piano
// dell'azienda, uguale per tutti gli anni: −10% sui ricavi = ogni anno il
// 10% in meno di quanto l'azienda dichiara. A manopole ferme il cruscotto
// mostra il piano dell'azienda così com'è, con gli stessi numeri del
// confronto con il riferimento: un solo schema, non due.
//
// Le righe che il piano dell'azienda non contiene restano sulle manopole
// ordinarie (crescita dallo stato attuale). Logica pura.

import type { Ipotesi, IpotesiPiano, RigaInput } from './piano';
import type { DefinizioneManopola } from './statoAttuale';

export type Rettifiche = Partial<Record<RigaInput, { valore: number; motivazione?: string }>>;

export const LIMITE_RETTIFICA = 60;

/** Righe presenti nelle ipotesi tratte dal piano dell'azienda (almeno un anno valorizzato). */
export function righeDelPianoAzienda(ipAzienda: IpotesiPiano): Set<RigaInput> {
  return new Set(
    (Object.entries(ipAzienda) as [RigaInput, (Ipotesi | null)[]][])
      .filter(([, arr]) => (arr ?? []).some(Boolean))
      .map(([r]) => r)
  );
}

/**
 * Ipotesi effettive: righe del piano dell'azienda rettificate, le altre
 * dalle ipotesi ordinarie. I valori dell'azienda sono assoluti per anno.
 */
export function applicaRettifiche(
  ipAzienda: IpotesiPiano,
  rettifiche: Rettifiche,
  ipotesiOrdinarie: IpotesiPiano
): IpotesiPiano {
  const righe = righeDelPianoAzienda(ipAzienda);
  const out: IpotesiPiano = {};
  for (const [r, arr] of Object.entries(ipotesiOrdinarie) as [RigaInput, (Ipotesi | null)[]][])
    if (!righe.has(r)) out[r] = arr;
  for (const r of righe) {
    const k = rettifiche[r]?.valore ?? 0;
    const fattore = 1 + Math.max(-LIMITE_RETTIFICA, Math.min(LIMITE_RETTIFICA, k)) / 100;
    // Si scalano i valori assoluti. Un'ipotesi in % (gli anni oltre il piano
    // dell'azienda, che crescono con il settore) resta com'è: parte dal
    // valore dell'anno prima, già rettificato, e lo spostamento si conserva.
    out[r] = (ipAzienda[r] ?? []).map((ip) =>
      ip
        ? ip.tipo === 'abs'
          ? { tipo: ip.tipo, valore: Math.round(ip.valore * fattore * 100) / 100 }
          : { ...ip }
        : null
    );
  }
  return out;
}

/** Definizione della manopola di rettifica per una riga del piano dell'azienda. */
export function definizioneRettifica(base: DefinizioneManopola): DefinizioneManopola {
  return {
    ...base,
    tipo: 'pct',
    min: -50,
    max: 50,
    passo: 1,
    neutro: 0,
    unita: '% sul piano azienda',
    aiuto: `Rettifica della riga del piano dell’azienda, uguale per ogni anno: −10 = il 10% in meno di quanto dichiara l’azienda.`,
  };
}

/** Pulizia delle rettifiche arrivate dal client o dall'AI. */
export function rettifichePulite(v: unknown): Rettifiche {
  const out: Rettifiche = {};
  if (!v || typeof v !== 'object') return out;
  for (const [r, x] of Object.entries(v as Record<string, unknown>)) {
    const o = (x && typeof x === 'object' ? x : { valore: x }) as Record<string, unknown>;
    const n = Number(o.valore);
    if (!Number.isFinite(n)) continue;
    out[r as RigaInput] = {
      valore: Math.round(Math.max(-LIMITE_RETTIFICA, Math.min(LIMITE_RETTIFICA, n)) * 10) / 10,
      ...(typeof o.motivazione === 'string' && o.motivazione.trim()
        ? { motivazione: o.motivazione.trim().slice(0, 300) }
        : {}),
    };
  }
  return out;
}
