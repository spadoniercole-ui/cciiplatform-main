// src/lib/xbrl/indici.ts
//
// UNICO punto di calcolo degli indici di allerta CCII/CNDCEC.
// Prima esistevano formule e soglie leggermente diverse in almeno 3 file
// (api/xbrl/parse/route.ts, lib/xbrlEngine.ts, backend Python): stesso
// bilancio, giudizio di crisi diverso a seconda della schermata aperta.
// Se le soglie ufficiali cambiano, si cambiano SOLO qui.
//
// Le soglie sotto sono quelle già in uso nella versione più recente della
// dashboard (api/xbrl/parse/route.ts) e vanno validate/aggiornate con il
// vostro riferimento normativo/CNDCEC di fiducia prima di usarle in un
// giudizio verso terzi: qui l'obiettivo primario era eliminare la
// duplicazione, non certificare i valori normativi.

import type { DatiFinanziariPeriodo, IndiceCcii, AlertSeverity } from './types';

function calcolaIndice(params: {
  codice: string;
  nome: string;
  numeratore: number;
  denominatore: number;
  soglia: string;
  verificaOk: (valore: number) => boolean;
}): IndiceCcii {
  const { codice, nome, numeratore, denominatore, soglia, verificaOk } = params;
  if (denominatore === 0) {
    return { codice, nome, valore: 'N/D', soglia, esito: 'NON_CALCOLABILE' };
  }
  const valore = Number((numeratore / denominatore).toFixed(2));
  return { codice, nome, valore, soglia, esito: verificaOk(valore) ? 'OK' : 'VIOLATO' };
}

/** Calcola i 5 indici CCII principali sul periodo corrente. */
export function calcolaIndiciCcii(dati: DatiFinanziariPeriodo): IndiceCcii[] {
  const debitiTributariPrevidenziali = dati.debitiTributari + dati.debitiPrevidenziali;

  return [
    calcolaIndice({
      codice: 'C1',
      nome: 'Sostenibilità dei debiti (Debiti / Ricavi)',
      numeratore: dati.totaleDebiti,
      denominatore: dati.ricaviVendite,
      soglia: '< 0.80',
      verificaOk: (v) => v < 0.8,
    }),
    calcolaIndice({
      codice: 'C2',
      nome: 'Adeguatezza patrimoniale (Patrimonio Netto / Debiti)',
      numeratore: dati.patrimonioNetto,
      denominatore: dati.totaleDebiti,
      soglia: '> 0.10',
      verificaOk: (v) => v > 0.1,
    }),
    calcolaIndice({
      codice: 'C3',
      nome: 'Ritorno di liquidità su ricavi',
      numeratore: dati.disponibilitaLiquide,
      denominatore: dati.ricaviVendite,
      soglia: '> 0.02',
      verificaOk: (v) => v > 0.02,
    }),
    calcolaIndice({
      codice: 'C4',
      nome: 'Copertura oneri finanziari (Valore Produzione / Oneri Finanziari)',
      numeratore: dati.valoreProduzione,
      denominatore: dati.oneriFinanziari,
      soglia: '> 2.00',
      verificaOk: (v) => v > 2,
    }),
    calcolaIndice({
      codice: 'C5',
      nome: 'Indebitamento tributario/previdenziale su totale debiti',
      numeratore: debitiTributariPrevidenziali,
      denominatore: dati.totaleDebiti,
      soglia: '< 0.30',
      verificaOk: (v) => v < 0.3,
    }),
  ];
}

/** Step 1 (patrimonio netto positivo) + Step 2 (indici oltre soglia) -> semaforo. */
export function calcolaSeverity(indici: IndiceCcii[], patrimonioNetto: number): AlertSeverity {
  const step1Superato = patrimonioNetto > 0;
  const indiciViolati = indici.filter((i) => i.esito === 'VIOLATO').length;

  if (!step1Superato || indiciViolati >= 3) return 'RED';
  if (indiciViolati > 0) return 'YELLOW';
  return 'GREEN';
}

/**
 * Indici supplementari, non normativi CCII ma di lettura economico-finanziaria
 * standard (ROE, ROI, rotazione attivo, incidenza indebitamento, autofinanziamento).
 * Nessun confronto con "medie di settore": qui niente dati inventati, solo
 * quello che si può calcolare con certezza dal bilancio caricato.
 */
export function calcolaAltriIndici(dati: DatiFinanziariPeriodo): IndiceCcii[] {
  return [
    calcolaIndice({
      codice: 'ROE',
      nome: 'Return on Equity (Utile / Patrimonio Netto)',
      numeratore: dati.utileEsercizio,
      denominatore: dati.patrimonioNetto,
      soglia: 'informativo',
      verificaOk: () => true,
    }),
    calcolaIndice({
      codice: 'ROI',
      nome: 'Return on Investment (EBIT / Totale Attivo)',
      numeratore: dati.ebit,
      denominatore: dati.totaleAttivo,
      soglia: 'informativo',
      verificaOk: () => true,
    }),
    calcolaIndice({
      codice: 'ROT-ATT',
      nome: "Rotazione dell'Attivo (Ricavi / Totale Attivo)",
      numeratore: dati.ricaviVendite,
      denominatore: dati.totaleAttivo,
      soglia: 'informativo',
      verificaOk: () => true,
    }),
    calcolaIndice({
      codice: 'INC-DEB',
      nome: "Incidenza dell'Indebitamento (Debiti / Totale Attivo)",
      numeratore: dati.totaleDebiti,
      denominatore: dati.totaleAttivo,
      soglia: '< 0.70',
      verificaOk: (v) => v < 0.7,
    }),
  ];
}

/**
 * Bundle completo (indici CCII + altri indici + severity + situazione
 * debitoria) da un solo periodo — la stessa logica che prima era
 * duplicata in src/lib/xbrl/index.ts (per l'anno corrente) e in
 * src/app/actions/xbrlAzienda.ts (per l'anno precedente, salvato come
 * riga di storico a sé). Un solo punto: se le soglie cambiano, cambia
 * qui e si propaga ovunque, non in tre punti che rischiano di
 * disallinearsi. Usata anche da Indici multi-periodo per calcolare la
 * Posizione Aggiornata con lo stesso motore, non un'approssimazione.
 */
export function costruisciBundleIndici(dati: DatiFinanziariPeriodo): {
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  severity: AlertSeverity;
  situazioneDebitoria: {
    debitiBanche: number;
    debitiFornitori: number;
    debitiTributari: number;
    debitiPrevidenziali: number;
    altriDebiti: number;
    totaleDebiti: number;
    disponibilitaLiquide: number;
    pfn: number;
  };
} {
  const indici = calcolaIndiciCcii(dati);
  const altriIndici = calcolaAltriIndici(dati);
  const severity = calcolaSeverity(indici, dati.patrimonioNetto);
  const altriDebiti = Math.max(
    0,
    dati.totaleDebiti -
      dati.debitiBanche -
      dati.debitiFornitori -
      dati.debitiTributari -
      dati.debitiPrevidenziali
  );
  return {
    indici,
    altriIndici,
    severity,
    situazioneDebitoria: {
      debitiBanche: dati.debitiBanche,
      debitiFornitori: dati.debitiFornitori,
      debitiTributari: dati.debitiTributari,
      debitiPrevidenziali: dati.debitiPrevidenziali,
      altriDebiti,
      totaleDebiti: dati.totaleDebiti,
      disponibilitaLiquide: dati.disponibilitaLiquide,
      pfn: dati.debitiBanche - dati.disponibilitaLiquide,
    },
  };
}
