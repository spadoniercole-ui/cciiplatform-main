// src/lib/simulazione/calcolo.ts
//
// Cuore della Simulazione — deterministico, non l'AI: l'AI può solo
// suggerire i VALORI DI PARTENZA delle leve (vedi simulazioneAi.ts), il
// calcolo che verifica se quei valori bastano per la continuità
// aziendale è sempre questa formula, sempre la stessa a parità di input.
//
// Tre pezzi:
// 1. Traiettoria di ricavi a 3 scenari (ottimistico/neutrale/pessimistico),
//    ancorata al confronto tra il trend storico dell'azienda (XBRL +
//    Posizione Aggiornata) e il trend storico del settore (ISTAT) — non
//    tre percentuali arbitrarie.
// 2. Le leve operative (riduzione costi, riduzione personale, allungamento
//    piano di rientro) applicate sopra quella traiettoria.
// 3. Il DSCR proiettato anno per anno, per ciascuno scenario — la
//    continuità è verificata solo se regge in TUTTI i 3 anni, non in media.

export interface PuntoStoricoAzienda {
  ricaviVendite: number;
  ebitda: number;
  ebit: number;
  ammortamenti: number;
}

/**
 * Mesi coperti da un bilancino di verifica, dall'inizio dell'anno
 * fiscale (assunto gennaio) alla data di riferimento — un bilancino al
 * 30/06 copre 6 mesi, non un anno intero. Serve per NON confrontare un
 * trimestre/semestre con un anno pieno come se fossero la stessa cosa:
 * confrontare direttamente produce un crollo/crescita che non esiste
 * nella realtà, è solo l'effetto di periodi di lunghezza diversa.
 * Minimo 1 (evita divisione per zero su una data del 1° gennaio).
 */
export function calcolaMesiCoperti(dataRiferimento: string): number {
  const mese = Number(dataRiferimento.split('-')[1]);
  if (!Number.isFinite(mese) || mese < 1 || mese > 12) return 12;
  return mese;
}

/**
 * Annualizza le voci di FLUSSO (ricavi, costi, EBITDA...) di un punto
 * storico coperto da meno di 12 mesi — NON si applica alle voci di stato
 * patrimoniale (totale attivo, patrimonio netto...), che sono già un
 * dato puntuale a quella data e non vanno moltiplicate per nulla:
 * PuntoStoricoAzienda contiene solo voci di conto economico, quindi
 * l'intera struttura si annualizza allo stesso modo.
 */
export function annualizzaPuntoStorico(
  punto: PuntoStoricoAzienda,
  mesiCoperti: number
): PuntoStoricoAzienda {
  if (mesiCoperti >= 12) return punto;
  const fattore = 12 / mesiCoperti;
  return {
    ricaviVendite: punto.ricaviVendite * fattore,
    ebitda: punto.ebitda * fattore,
    ebit: punto.ebit * fattore,
    ammortamenti: punto.ammortamenti * fattore,
  };
}

export interface PuntoSerieIstatSemplice {
  periodo: string; // "YYYY-MM"
  valore: number;
}

export type ModalitaPropostaSemplice = 'UNICA_SOLUZIONE' | 'RATEALE';

export interface RigaPropostaPerSimulazione {
  importoDovuto: number;
  percentualeOfferta: number;
  modalita: ModalitaPropostaSemplice;
  numeroRate: number | null;
}

export interface LeveSimulazione {
  /** 0-100, percentuale di riduzione dei costi operativi totali. */
  riduzioneCostiPct: number;
  /** 0-100, percentuale di riduzione — stessa base di calcolo di riduzioneCostiPct: il bilancio XBRL non isola una voce "costo del personale", quindi le due leve insieme non possono ridurre i costi operativi oltre il 100%. */
  riduzionePersonalePct: number;
  /** Mesi aggiuntivi sommati al numero di rate di ogni riga Rateale della Proposta. */
  mesiAllungamentoRate: number;
  /** Se compilato (anche 0, per tenere i ricavi fermi), sostituisce la crescita derivata dal trend storico come base per i tre scenari — per i casi in cui l'operatore ha un'ipotesi propria sui ricavi futuri, diversa da quella che il solo storico suggerirebbe. Null/undefined = usa il trend storico, comportamento di sempre. */
  crescitaRicaviManuale?: number | null;
}

export const LEVE_VUOTE: LeveSimulazione = {
  riduzioneCostiPct: 0,
  riduzionePersonalePct: 0,
  mesiAllungamentoRate: 0,
  crescitaRicaviManuale: null,
};

const ALIQUOTA_FISCALE_STIMATA = 0.24; // semplificazione dichiarata, non un dato normativo
const SCARTO_MINIMO = 0.02; // 2 punti percentuali — evita scenari troppo ravvicinati se lo scarto storico è quasi zero
const SCARTO_MASSIMO = 0.15; // 15 punti percentuali — scelta di prudenza dichiarata: uno scarto storico estremo (tipico di un'azienda già in crisi) non deve tradursi linearmente in un ventaglio di scenari altrettanto estremo, che sarebbe più fuorviante che informativo
const SCARTO_DEFAULT_SENZA_SETTORE = 0.03; // usato solo se il confronto di settore non è disponibile

const ORIZZONTE_ANNI = 3;

/**
 * CAGR (tasso di crescita medio annuo composto) tra un valore iniziale e
 * uno finale su un certo numero di intervalli. Ritorna null se il
 * calcolo non è affidabile (valore iniziale non positivo — non si può
 * elevare a potenza frazionaria una base non positiva in modo
 * significativo).
 */
export function calcolaCagr(
  valoreIniziale: number,
  valoreFinale: number,
  intervalli: number
): number | null {
  if (valoreIniziale <= 0 || intervalli <= 0) return null;
  return Math.pow(valoreFinale / valoreIniziale, 1 / intervalli) - 1;
}

/**
 * Crescita storica dell'azienda sui punti disponibili (2 o 3: anno
 * precedente XBRL, anno corrente XBRL, Posizione Aggiornata) — usa il
 * primo e l'ultimo punto con dati reali (ricaviVendite > 0), quanti più
 * intervalli possibile.
 */
export function calcolaCrescitaStoricaAzienda(punti: PuntoStoricoAzienda[]): number | null {
  const validi = punti.filter((p) => p.ricaviVendite > 0);
  if (validi.length < 2) return null;
  const primo = validi[0];
  const ultimo = validi[validi.length - 1];
  return calcolaCagr(primo.ricaviVendite, ultimo.ricaviVendite, validi.length - 1);
}

/**
 * Crescita storica del settore dalla serie ISTAT (mensile) — aggrega per
 * anno (media dei mesi disponibili in quell'anno), poi CAGR tra il primo
 * e l'ultimo anno con almeno un punto. Null se la serie copre meno di 2
 * anni distinti.
 */
export function calcolaCrescitaStoricaSettore(punti: PuntoSerieIstatSemplice[]): number | null {
  const perAnno = new Map<string, number[]>();
  for (const p of punti) {
    const anno = p.periodo.slice(0, 4);
    if (!perAnno.has(anno)) perAnno.set(anno, []);
    perAnno.get(anno)!.push(p.valore);
  }
  const anniOrdinati = Array.from(perAnno.keys()).sort();
  if (anniOrdinati.length < 2) return null;

  const media = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const primo = media(perAnno.get(anniOrdinati[0])!);
  const ultimo = media(perAnno.get(anniOrdinati[anniOrdinati.length - 1])!);
  return calcolaCagr(primo, ultimo, anniOrdinati.length - 1);
}

export interface RataAnnuaCalcolata {
  /** Rata annua costante per gli anni successivi al primo (solo righe Rateale). */
  rataAnnuaCostante: number;
  /** Onere aggiuntivo concentrato nel primo anno (righe a Unica Soluzione — dovute per intero, non spalmabili). */
  onereAggiuntivoAnno1: number;
  /** Mesi delle rate ORIGINALI (prima dell'allungamento) — min e max tra le righe Rateale, per mostrare in interfaccia da quale base parte la leva. Null se non ci sono righe rateali. */
  mesiBaseMin: number | null;
  mesiBaseMax: number | null;
}

/**
 * Rata annua complessiva del piano di rientro dalla Proposta. Le righe
 * Rateale si spalmano (numeroRate è in mesi, si allunga con la leva); le
 * righe a Unica Soluzione sono per intero nell'anno 1 — semplificazione
 * dichiarata: non sappiamo, dai soli dati di Proposta, quando esattamente
 * nell'anno cade il pagamento.
 */
export function calcolaRataAnnua(
  righe: RigaPropostaPerSimulazione[],
  mesiAllungamentoRate: number
): RataAnnuaCalcolata {
  let rataAnnuaCostante = 0;
  let onereAggiuntivoAnno1 = 0;
  const mesiBaseTrovati: number[] = [];

  for (const riga of righe) {
    const importoOfferto = (riga.importoDovuto * riga.percentualeOfferta) / 100;
    if (riga.modalita === 'RATEALE' && riga.numeroRate && riga.numeroRate > 0) {
      mesiBaseTrovati.push(riga.numeroRate);
      const numeroRateEffettivo = riga.numeroRate + Math.max(mesiAllungamentoRate, 0);
      rataAnnuaCostante += (importoOfferto / numeroRateEffettivo) * 12;
    } else {
      onereAggiuntivoAnno1 += importoOfferto;
    }
  }

  return {
    rataAnnuaCostante,
    onereAggiuntivoAnno1,
    mesiBaseMin: mesiBaseTrovati.length > 0 ? Math.min(...mesiBaseTrovati) : null,
    mesiBaseMax: mesiBaseTrovati.length > 0 ? Math.max(...mesiBaseTrovati) : null,
  };
}

export interface EsitoAnnoSimulazione {
  anno: number;
  ricaviProiettati: number;
  ebitdaProiettato: number;
  imposteStimate: number;
  flussoDisponibile: number;
  rataAnno: number;
  dscr: number | null;
}

export interface EsitoScenarioSimulazione {
  nome: 'ottimistico' | 'neutrale' | 'pessimistico';
  tassoCrescitaRicavi: number;
  anni: EsitoAnnoSimulazione[];
  viabile: boolean;
}

export interface RisultatoSimulazione {
  crescitaStoricaAzienda: number | null;
  crescitaStoricaSettore: number | null;
  scarto: number | null;
  scartoUsatoDiDefault: boolean;
  /** true se lo scarto storico misurato superava il tetto massimo (15 punti) ed è stato ridotto — l'ampiezza mostrata NON è lo scarto misurato per intero. */
  ampiezzaLimitata: boolean;
  margineEbitdaStorico: number;
  /** Base del piano di rientro PRIMA dell'allungamento (mesi) — min e max tra le righe Rateale della Proposta, per dare un riferimento a quanto rappresenta la leva "allungamento". Null se non ci sono righe rateali. */
  mesiBaseMin: number | null;
  mesiBaseMax: number | null;
  /** true se è stata usata la crescita ricavi imputata manualmente invece di quella derivata dal trend storico. */
  crescitaManualeUsata: boolean;
  scenari: EsitoScenarioSimulazione[];
}

export interface InputSimulazione {
  puntiStoriciAzienda: PuntoStoricoAzienda[];
  puntiIstatSettore: PuntoSerieIstatSemplice[] | null;
  righeProposta: RigaPropostaPerSimulazione[];
  leve: LeveSimulazione;
}

export function calcolaSimulazione(input: InputSimulazione): RisultatoSimulazione {
  const ultimoPunto = input.puntiStoriciAzienda[input.puntiStoriciAzienda.length - 1];
  const margineEbitdaStorico =
    ultimoPunto && ultimoPunto.ricaviVendite > 0
      ? ultimoPunto.ebitda / ultimoPunto.ricaviVendite
      : 0;
  const ammortamentiStorici = ultimoPunto?.ammortamenti || 0;

  const crescitaStoricaAzienda = calcolaCrescitaStoricaAzienda(input.puntiStoriciAzienda);
  const crescitaStoricaSettore = input.puntiIstatSettore
    ? calcolaCrescitaStoricaSettore(input.puntiIstatSettore)
    : null;

  const scartoUsatoDiDefault = crescitaStoricaSettore === null;
  const scarto =
    crescitaStoricaAzienda !== null && crescitaStoricaSettore !== null
      ? crescitaStoricaAzienda - crescitaStoricaSettore
      : null;
  const ampiezzaMisurata = scarto !== null ? Math.abs(scarto) : SCARTO_DEFAULT_SENZA_SETTORE;
  const ampiezzaScostamento = Math.min(Math.max(ampiezzaMisurata, SCARTO_MINIMO), SCARTO_MASSIMO);
  const ampiezzaLimitata = ampiezzaMisurata > SCARTO_MASSIMO;

  const crescitaManualeUsata =
    input.leve.crescitaRicaviManuale !== undefined && input.leve.crescitaRicaviManuale !== null;
  const crescitaBase = crescitaManualeUsata
    ? (input.leve.crescitaRicaviManuale as number)
    : (crescitaStoricaAzienda ?? 0);
  const rataInfo = calcolaRataAnnua(input.righeProposta, input.leve.mesiAllungamentoRate);
  const { rataAnnuaCostante, onereAggiuntivoAnno1 } = rataInfo;

  // Il risparmio dev'essere una quota dei costi PROIETTATI per quell'anno
  // e scenario, non un valore fisso ancorato al livello storico: se i
  // ricavi proiettati si allontanano molto dal livello storico (in
  // particolare nello scenario pessimistico, dove possono crollare), un
  // risparmio "assoluto" resterebbe enorme rispetto alla nuova scala —
  // matematicamente coerente ma concettualmente sbagliato (una modifica
  // di un punto percentuale non deve spostare il flusso disponibile di
  // decine di migliaia di euro indipendentemente da quanto sono scesi i
  // ricavi). Riduzione costi + riduzione personale insieme non possono
  // superare il 100% dei costi proiettati.
  const pctRiduzioneTotale =
    Math.min(input.leve.riduzioneCostiPct + input.leve.riduzionePersonalePct, 100) / 100;

  const scenariDef: { nome: EsitoScenarioSimulazione['nome']; tasso: number }[] = [
    { nome: 'ottimistico', tasso: crescitaBase + ampiezzaScostamento },
    { nome: 'neutrale', tasso: crescitaBase },
    { nome: 'pessimistico', tasso: crescitaBase - ampiezzaScostamento },
  ];

  const ricaviBase = ultimoPunto?.ricaviVendite || 0;

  const scenari: EsitoScenarioSimulazione[] = scenariDef.map(({ nome, tasso }) => {
    const anni: EsitoAnnoSimulazione[] = [];
    for (let anno = 1; anno <= ORIZZONTE_ANNI; anno++) {
      const ricaviProiettati = ricaviBase * Math.pow(1 + tasso, anno);
      const costiProiettati = ricaviProiettati * (1 - margineEbitdaStorico);
      const risparmioCosti = costiProiettati * pctRiduzioneTotale;
      const ebitdaProiettato = ricaviProiettati * margineEbitdaStorico + risparmioCosti;
      const ebitProiettato = ebitdaProiettato - ammortamentiStorici;
      const imposteStimate = Math.max(ebitProiettato, 0) * ALIQUOTA_FISCALE_STIMATA;
      const flussoDisponibile = ebitdaProiettato - imposteStimate;
      const rataAnno = rataAnnuaCostante + (anno === 1 ? onereAggiuntivoAnno1 : 0);
      const dscr = rataAnno > 0 ? flussoDisponibile / rataAnno : null;
      anni.push({
        anno,
        ricaviProiettati,
        ebitdaProiettato,
        imposteStimate,
        flussoDisponibile,
        rataAnno,
        dscr,
      });
    }
    const viabile = anni.every((a) => a.dscr === null || a.dscr >= 1);
    return { nome, tassoCrescitaRicavi: tasso, anni, viabile };
  });

  return {
    crescitaStoricaAzienda,
    crescitaStoricaSettore,
    scarto,
    scartoUsatoDiDefault,
    ampiezzaLimitata,
    margineEbitdaStorico,
    mesiBaseMin: rataInfo.mesiBaseMin,
    mesiBaseMax: rataInfo.mesiBaseMax,
    crescitaManualeUsata,
    scenari,
  };
}
