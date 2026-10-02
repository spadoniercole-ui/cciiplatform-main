// src/lib/piano/statoAttuale.ts
//
// PUNTO DI PARTENZA del piano e MANOPOLE — regole di Ercole (02/10/2026):
//   - le manopole modificano partendo dallo stato attuale: non ha senso
//     modificare il passato. Lo stato attuale è la posizione aggiornata
//     più recente, se è successiva all'ultimo bilancio depositato;
//     altrimenti l'ultimo bilancio;
//   - da lì il piano si proietta in avanti su 3-5 anni, a scelta.
//
// La posizione aggiornata infrannuale (es. al 30/06) ha il conto economico
// di pochi mesi: per partire da un anno intero lo si porta a dodici mesi in
// proporzione. Lo stato patrimoniale si prende così com'è.
// Logica pura.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import type { EsercizioStorico, Ipotesi, IpotesiPiano, RigaInput } from './piano';

export interface PartenzaPiano {
  fonte: 'bilancio' | 'posizione';
  /** Testo breve per l'intestazione della colonna di partenza. */
  etichetta: string;
  /** Mesi di conto economico della posizione (12 se bilancio o al 31/12). */
  mesi: number;
}

const VOCI_ECONOMICHE: (keyof EsercizioStorico)[] = [
  'ricaviVendite',
  'valoreProduzione',
  'costiProduzione',
  'ammortamenti',
  'oneriFinanziari',
  'utileEsercizio',
];

/**
 * Sceglie lo stato attuale e lo restituisce in forma di esercizio, in testa
 * allo storico (gli esercizi XBRL dello stesso anno o successivi lasciano il
 * posto alla posizione aggiornata).
 */
export function storicoDaStatoAttuale(
  storicoXbrl: EsercizioStorico[], // dal più recente
  posizione: { dataRiferimento: string | null; dati: DatiFinanziariPeriodo } | null
): { storico: EsercizioStorico[]; partenza: PartenzaPiano } {
  const ultimo = storicoXbrl[0] ?? null;
  const daBilancio = {
    storico: storicoXbrl,
    partenza: {
      fonte: 'bilancio' as const,
      etichetta: ultimo ? `Bilancio ${ultimo.anno}` : 'Nessun bilancio',
      mesi: 12,
    },
  };
  if (!posizione?.dataRiferimento || !/^\d{4}-\d{2}-\d{2}/.test(posizione.dataRiferimento))
    return daBilancio;
  const anno = Number(posizione.dataRiferimento.slice(0, 4));
  const mese = Number(posizione.dataRiferimento.slice(5, 7));
  // Più vecchia dell'ultimo bilancio: lo stato attuale resta il bilancio.
  if (ultimo && (anno < ultimo.anno || (anno === ultimo.anno && mese < 12))) return daBilancio;
  const d = posizione.dati;
  const vuota = Object.values(d).every((v) => !v);
  if (vuota) return daBilancio;

  const mesi = mese >= 1 && mese <= 12 ? mese : 12;
  const fattore = 12 / mesi;
  const economicoPresente = VOCI_ECONOMICHE.some(
    (k) => (d as unknown as Record<string, number>)[k]
  );
  const e: EsercizioStorico = {
    anno,
    ricaviVendite: d.ricaviVendite,
    valoreProduzione: d.valoreProduzione || d.ricaviVendite,
    costiProduzione: d.costiProduzione,
    ammortamenti: d.ammortamenti,
    oneriFinanziari: d.oneriFinanziari,
    utileEsercizio: d.utileEsercizio,
    immobilizzazioni: d.immobilizzazioni,
    creditiClienti: d.creditiClienti,
    disponibilitaLiquide: d.disponibilitaLiquide,
    attivoCircolante: d.attivoCircolante || (ultimo?.attivoCircolante ?? 0),
    totaleAttivo: d.totaleAttivo || (ultimo?.totaleAttivo ?? 0),
    patrimonioNetto: d.patrimonioNetto,
    debitiBanche: d.debitiBanche,
    debitiFornitori: d.debitiFornitori,
    debitiTributari: d.debitiTributari,
    debitiPrevidenziali: d.debitiPrevidenziali,
    totaleDebiti:
      d.totaleDebiti ||
      d.debitiBanche + d.debitiFornitori + d.debitiTributari + d.debitiPrevidenziali,
  };
  let nota: string;
  if (!economicoPresente && ultimo) {
    // Solo stato patrimoniale nella posizione: il conto economico è quello dell'ultimo bilancio.
    for (const k of VOCI_ECONOMICHE) (e as unknown as Record<string, number>)[k] = ultimo[k];
    nota = `conto economico del bilancio ${ultimo.anno}`;
  } else if (fattore !== 1) {
    for (const k of VOCI_ECONOMICHE)
      (e as unknown as Record<string, number>)[k] = Math.round(e[k] * fattore * 100) / 100;
    nota = `conto economico di ${mesi} mesi portato a 12`;
  } else nota = '';
  const data = posizione.dataRiferimento.slice(0, 10).split('-').reverse().join('/');
  return {
    storico: [e, ...storicoXbrl.filter((s) => s.anno < anno)],
    partenza: {
      fonte: 'posizione',
      etichetta: `Posizione al ${data}${nota ? ` (${nota})` : ''}`,
      mesi,
    },
  };
}

// ---------------------------------------------------------------------------
// Manopole: una per macro-voce, stesso valore su tutti gli anni del piano.
// ---------------------------------------------------------------------------

export interface DefinizioneManopola {
  riga: RigaInput;
  etichetta: string;
  gruppo: 'Ricavi' | 'Costi' | 'Circolante' | 'Finanza';
  tipo: 'pct' | 'abs';
  min: number;
  max: number;
  passo: number;
  /** Valore di riposo (doppio clic): nessun cambiamento. */
  neutro: number;
  unita: string;
  aiuto: string;
}

const arrotondaScala = (n: number) => {
  if (n <= 0) return 10000;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
};

export function definizioniManopole(
  partenza: EsercizioStorico,
  aliquotaPartenza: number
): DefinizioneManopola[] {
  const pct = (
    riga: RigaInput,
    etichetta: string,
    gruppo: DefinizioneManopola['gruppo'],
    ampiezza: number,
    aiuto: string
  ): DefinizioneManopola => ({
    riga,
    etichetta,
    gruppo,
    tipo: 'pct',
    min: -ampiezza,
    max: ampiezza,
    passo: 0.5,
    neutro: 0,
    unita: '% l’anno',
    aiuto,
  });
  const maxInvestimenti = arrotondaScala(
    Math.max(partenza.ammortamenti * 3, partenza.ricaviVendite * 0.15)
  );
  const maxApporti = arrotondaScala(
    Math.max(partenza.ricaviVendite * 0.2, Math.abs(Math.min(0, partenza.patrimonioNetto)))
  );
  return [
    pct('ricaviVendite', 'Ricavi', 'Ricavi', 30, 'Crescita annua dei ricavi delle vendite.'),
    pct('altriRicavi', 'Altri ricavi', 'Ricavi', 50, 'Contributi, proventi diversi.'),
    pct(
      'costiOperativi',
      'Costi operativi',
      'Costi',
      30,
      'Costi della produzione senza ammortamenti, personale compreso.'
    ),
    pct('ammortamenti', 'Ammortamenti', 'Costi', 50, 'Variazione annua degli ammortamenti.'),
    pct('oneriFinanziari', 'Oneri finanziari', 'Costi', 50, 'Variazione annua degli interessi.'),
    {
      riga: 'aliquotaImposte',
      etichetta: 'Aliquota imposte',
      gruppo: 'Costi',
      tipo: 'abs',
      min: 0,
      max: 50,
      passo: 0.5,
      neutro: Math.round(aliquotaPartenza * 2) / 2,
      unita: '%',
      aiuto: 'Imposte sull’utile ante imposte, se positivo.',
    },
    pct(
      'creditiClienti',
      'Crediti clienti',
      'Circolante',
      50,
      'Variazione annua dei crediti a fine anno: in su assorbe cassa.'
    ),
    pct(
      'debitiFornitori',
      'Debiti fornitori',
      'Circolante',
      50,
      'Variazione annua dei debiti verso fornitori: in su libera cassa.'
    ),
    pct(
      'debitiBanche',
      'Debiti bancari',
      'Finanza',
      50,
      'Variazione annua del debito bancario: in giù è rimborso, assorbe cassa.'
    ),
    {
      riga: 'investimenti',
      etichetta: 'Investimenti',
      gruppo: 'Finanza',
      tipo: 'abs',
      min: 0,
      max: maxInvestimenti,
      passo: arrotondaScala(maxInvestimenti / 200),
      neutro: 0,
      unita: '€ l’anno',
      aiuto: 'Acquisti di immobilizzazioni in ogni anno del piano.',
    },
    {
      riga: 'apportiSoci',
      etichetta: 'Apporti dei soci',
      gruppo: 'Finanza',
      tipo: 'abs',
      min: 0,
      max: maxApporti,
      passo: arrotondaScala(maxApporti / 200),
      neutro: 0,
      unita: '€ l’anno',
      aiuto: 'Versamenti dei soci in ogni anno del piano.',
    },
  ];
}

/** Stato della manopola per una riga: valore unico, oppure media se le ipotesi variano per anno. */
export function letturaManopola(
  def: DefinizioneManopola,
  ipotesi: IpotesiPiano,
  orizzonte: number
): { valore: number; variaPerAnno: boolean; daAi: boolean } {
  const arr = (ipotesi[def.riga] ?? []).slice(0, orizzonte);
  const valori: number[] = [];
  let tipoDiverso = false;
  for (let i = 0; i < orizzonte; i++) {
    const ip = arr[i];
    if (!ip) valori.push(def.neutro);
    else if (ip.tipo !== def.tipo) {
      tipoDiverso = true;
      valori.push(def.neutro);
    } else valori.push(ip.valore);
  }
  const media = valori.reduce((a, b) => a + b, 0) / Math.max(1, valori.length);
  const variaPerAnno = tipoDiverso || valori.some((v) => Math.abs(v - valori[0]) > 1e-9);
  return {
    valore: Math.round(media * 100) / 100,
    variaPerAnno,
    daAi: arr.some((ip) => !!ip?.motivazione),
  };
}

/** Scrive il valore della manopola su tutti gli anni del piano. */
export function applicaManopola(
  def: DefinizioneManopola,
  ipotesi: IpotesiPiano,
  orizzonte: number,
  valore: number
): IpotesiPiano {
  const v = Math.max(def.min, Math.min(def.max, valore));
  const ip: Ipotesi = { tipo: def.tipo, valore: Math.round(v * 100) / 100 };
  return { ...ipotesi, [def.riga]: Array.from({ length: orizzonte }, () => ({ ...ip })) };
}
