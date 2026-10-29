// src/lib/soglie25novies/baseVera.ts
//
// IL DEBITO CHE CONTA PER LA SOGLIA INPS, MISURATO SUL V.E.R.A.
//
// L'art. 25-novies, comma 1, lett. a) non chiede quanto l'azienda deve
// all'Istituto: chiede il debito per contributi SCADUTO DA OLTRE 90 GIORNI, e
// lo confronta con il 30% dei contributi dovuti nell'anno precedente e con
// 15.000 euro. Il confronto è fra due cose precise, e il primo dei due non è
// l'esposizione complessiva.
//
// Perché serve questo modulo. Quando la Lista Inadempienze c'è, la parte
// scaduta da oltre 90 giorni si ricava da lì (partita per partita, con la sua
// scadenza). Quando non c'è, la piattaforma ripiegava sull'esposizione del
// V.E.R.A. così com'è: contributi di tutti i periodi, compresi quelli appena
// scaduti e quelli che scadranno. Su un'azienda con quattro anni di denunce
// non trasmesse il numero risultava gonfiato — e un requisito che si dichiara
// superato quando non lo è fa partire una segnalazione che non andava fatta.
//
// Il V.E.R.A. però il periodo lo scrive, riga per riga, e il contributo di un
// periodo si versa entro il 16 del mese successivo. La distanza da quel
// termine alla data della verifica si calcola (vedi `scopertura.ts`), e da lì
// la parte oltre i 90 giorni si separa dal resto: nessun dato in più da
// chiedere, nessuna stima.
//
// COSA RESTA FUORI, E SI DICHIARA.
//
// - le sanzioni, che non concorrono alla soglia e non stanno in `contributi`;
// - i crediti già affidati all'Agente della Riscossione: per l'Istituto sono
//   partite chiuse, e valgono per la soglia dell'Agente (lett. d);
// - le posizioni «Ignora» e le sospese, che non sono debito accertato;
// - le righe senza periodo leggibile: non si inventa un'anzianità, si contano
//   a parte — il totale attribuito al ritardo vale su ciò che si è potuto
//   datare, e chi legge lo sa.

import { periodoDaVera } from '@/lib/debitiEnte/veraImport';

/** Il requisito temporale dell'art. 25-novies, comma 1, lett. a). */
export const GIORNI_RITARDO_SOGLIA_INPS = 90;

/** Il minimo che serve a misurare: la riga del V.E.R.A. come esce dal file. */
export interface RigaVeraSoglia {
  voce: string;
  periodo?: string;
  importo: number;
  stato?: string;
  trattamento: string;
  /** La quota di contributi: se c'è, è questa la base; altrimenti l'importo. */
  contributi?: number | null;
  /** «INPS», «INAIL», «AGENTE_RISCOSSIONE»… */
  ambito?: string;
}

export interface BaseInpsVera {
  /** false = il file non porta periodi leggibili: il ritardo da qui non si misura. */
  misurabile: boolean;
  /** Contributi delle partite scadute da oltre 90 giorni alla data della verifica. */
  scadutiOltre90: number;
  partiteOltre90: number;
  /** I periodi che formano quella cifra, dal più vecchio. */
  periodiOltre90: string[];
  /** Contributi di partite scadute da meno di 90 giorni: dichiarati, non sommati. */
  recenti: number;
  /** Contributi di partite senza periodo databile: dichiarati, non sommati. */
  senzaPeriodo: number;
  partiteSenzaPeriodo: number;
}

const MEZZO_CENTESIMO = 0.005;

function baseContributiva(r: RigaVeraSoglia): number {
  const contributi = r.contributi ?? null;
  return contributi === null ? r.importo : contributi;
}

/**
 * Separa, dentro il V.E.R.A., la parte del debito scaduta da oltre 90 giorni.
 *
 * `dataVerifica` è un giorno civile (AAAA-MM-GG): la stessa data che il foglio
 * dell'ufficio dichiara, così il ritardo non dipende dal fuso di chi guarda.
 */
export function baseInpsDaVera(righe: RigaVeraSoglia[], dataVerifica: string): BaseInpsVera {
  const verifica = new Date(`${(dataVerifica ?? '').trim()}T00:00:00Z`);
  const out: BaseInpsVera = {
    misurabile: false,
    scadutiOltre90: 0,
    partiteOltre90: 0,
    periodiOltre90: [],
    recenti: 0,
    senzaPeriodo: 0,
    partiteSenzaPeriodo: 0,
  };
  if (Number.isNaN(verifica.getTime())) return out;

  for (const r of righe) {
    // Ciò che non è debito accertato non entra nella base della soglia.
    if (r.trattamento === 'ignora' || r.trattamento === 'sospeso') continue;
    if ((r.ambito ?? '').toUpperCase() === 'AGENTE_RISCOSSIONE') continue;
    const base = baseContributiva(r);
    if (!Number.isFinite(base) || base <= MEZZO_CENTESIMO) continue;

    const periodo = periodoDaVera(r.periodo ?? '');
    if (!periodo) {
      out.senzaPeriodo += base;
      out.partiteSenzaPeriodo += 1;
      continue;
    }
    out.misurabile = true;
    // Il contributo di un mese si versa entro il 16 del mese successivo:
    // `Date.UTC(anno, mese, 16)` è già quel giorno, perché il mese di
    // `periodoDaVera` è 1-based e `Date.UTC` 0-based.
    const scadenza = Date.UTC(periodo.anno, periodo.mese, 16);
    const giorni = Math.floor((verifica.getTime() - scadenza) / 86_400_000);
    if (giorni > GIORNI_RITARDO_SOGLIA_INPS) {
      out.scadutiOltre90 += base;
      out.partiteOltre90 += 1;
      const p = `${periodo.anno}/${String(periodo.mese).padStart(2, '0')}`;
      if (!out.periodiOltre90.includes(p)) out.periodiOltre90.push(p);
    } else {
      out.recenti += base;
    }
  }

  out.periodiOltre90.sort();
  return out;
}
