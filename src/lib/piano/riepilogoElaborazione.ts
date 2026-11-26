// src/lib/piano/riepilogoElaborazione.ts
//
// I PARAMETRI CHE L'ANALISI HA USATO (0.256.41).
//
// Il piano dell'analisi non è una scatola nera: accanto alle manopole si legge
// con quali ipotesi — anno per anno — è arrivata a quei numeri, e con quale
// motivazione. È la materia che l'operatore può cambiare, sapendo che il piano
// non è più quello scelto dall'analisi.
//
// Logica pura di formattazione, con i suoi test.

import {
  ETICHETTA_RIGA,
  RIGHE_INPUT,
  type Ipotesi,
  type IpotesiPiano,
  type RigaIpotesi,
} from './piano';

export interface ParametroElaborazione {
  riga: RigaIpotesi;
  etichetta: string;
  /** Il percorso in una riga: «+3% in tutti gli anni» oppure «2027 +3% · 2028 +4%». */
  percorso: string;
  /** Perché l'analisi ha scelto quei valori, quando lo ha scritto. */
  motivazione?: string;
}

const numero = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

const euro0 = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/** Un valore d'ipotesi come si legge accanto alla manopola. */
export function valoreIpotesi(riga: RigaIpotesi, ip: Ipotesi): string {
  if (riga === 'aliquotaImposte') return `${numero(ip.valore)}%`;
  if (riga === 'investimenti' || riga === 'apportiSoci') return euro0(ip.valore);
  return `${ip.valore > 0 ? '+' : ''}${numero(ip.valore)}%`;
}

/**
 * Le ipotesi salvate, una voce per riga, nell'ordine delle manopole. Le righe
 * senza alcun valore non compaiono: un elenco di zeri non è un parametro.
 */
export function parametriElaborazione(
  ipotesi: IpotesiPiano,
  orizzonte: number,
  primoAnno: number
): ParametroElaborazione[] {
  const righe: RigaIpotesi[] = [...RIGHE_INPUT, 'costiPersonale'];
  const out: ParametroElaborazione[] = [];
  for (const riga of righe) {
    const celle = (ipotesi[riga] ?? []).slice(0, Math.max(0, orizzonte));
    const presenti = celle
      .map((ip, i) => ({ ip, anno: primoAnno + i }))
      .filter((c): c is { ip: Ipotesi; anno: number } => !!c.ip);
    if (presenti.length === 0) continue;
    const testi = presenti.map((c) => valoreIpotesi(riga, c.ip));
    const tuttiUguali = presenti.length === celle.length && testi.every((t) => t === testi[0]);
    const percorso = tuttiUguali
      ? `${testi[0]} in tutti gli anni del piano`
      : presenti.map((c, i) => `${c.anno} ${testi[i]}`).join(' · ');
    const motivazioni = Array.from(
      new Set(presenti.map((c) => c.ip.motivazione?.trim()).filter((m): m is string => !!m))
    );
    out.push({
      riga,
      etichetta: ETICHETTA_RIGA[riga],
      percorso,
      ...(motivazioni.length ? { motivazione: motivazioni.join(' — ') } : {}),
    });
  }
  return out;
}
