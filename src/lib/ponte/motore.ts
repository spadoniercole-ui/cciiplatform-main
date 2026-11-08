// src/lib/ponte/motore.ts
//
// IL MOTORE DEL PONTE — logica pura, deterministica, senza database e senza AI.
//
// L'AI può proporre le assunzioni; qui si applicano e si calcolano i numeri.
// Ogni passaggio lascia una traccia riconciliabile: il patrimonio netto parte
// dal bilancio e arriva al Ponte con l'utile prodotto; il debito parte dal
// bilancio, si rettifica per il perimetro del debito ente e arriva al totale
// stimato; la cassa parte dal saldo di bilancio e arriva alla Data verifica.
//
// Regole deliberate:
//   - niente plug: una cassa negativa è fabbisogno, non debito creato a tavolino;
//   - il debito ente non si somma due volte: la rettifica è una voce esplicita;
//   - il comparativo XBRL è storico, non un'ipotesi;
//   - nessuna conclusione giuridica: il motore misura, non qualifica.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import type {
  AnnoPonte,
  AssunzionePonte,
  AvvisoPonte,
  CoperturaPonte,
  EsercizioPonte,
  EsitoPonte,
  FonteAssunzione,
  InputPonte,
  MesePonte,
  ProiezionePonte,
  RiconciliazionePonte,
} from './types';
import { sintesiIntegrata } from './sintesi';

export const VERSIONE_MOTORE = 'ponte-1.0.0';
const ORIZZONTE_MASSIMO_MESI = 60;
const R2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export class ErrorePonte extends Error {
  codice: string;
  constructor(codice: string, messaggio: string) {
    super(messaggio);
    this.name = 'ErrorePonte';
    this.codice = codice;
  }
}

interface ScenarioMod {
  moltiplicatoreRicavi: number;
  deltaMargine: number;
  deltaGiorniIncasso: number;
  deltaGiorniPagamento: number;
}

const BASE: ScenarioMod = {
  moltiplicatoreRicavi: 1,
  deltaMargine: 0,
  deltaGiorniIncasso: 0,
  deltaGiorniPagamento: 0,
};

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function dati(d: DatiFinanziariPeriodo | undefined): DatiFinanziariPeriodo {
  return {
    ricaviVendite: numero(d?.ricaviVendite),
    valoreProduzione: numero(d?.valoreProduzione) || numero(d?.ricaviVendite),
    costiProduzione: numero(d?.costiProduzione),
    ebit: numero(d?.ebit),
    ammortamenti: numero(d?.ammortamenti),
    ebitda: numero(d?.ebitda),
    oneriFinanziari: numero(d?.oneriFinanziari),
    utileEsercizio: numero(d?.utileEsercizio),
    totaleAttivo: numero(d?.totaleAttivo),
    attivoCircolante: numero(d?.attivoCircolante),
    disponibilitaLiquide: numero(d?.disponibilitaLiquide),
    immobilizzazioni: numero(d?.immobilizzazioni),
    patrimonioNetto: numero(d?.patrimonioNetto),
    totaleDebiti: numero(d?.totaleDebiti),
    debitiBanche: numero(d?.debitiBanche),
    debitiFornitori: numero(d?.debitiFornitori),
    debitiTributari: numero(d?.debitiTributari),
    debitiPrevidenziali: numero(d?.debitiPrevidenziali),
    passivoCorrente: numero(d?.passivoCorrente),
    creditiClienti: numero(d?.creditiClienti),
  };
}

function eserciziOrdinati(esercizi: EsercizioPonte[]): EsercizioPonte[] {
  return [...esercizi]
    .filter((e) => Number.isInteger(e.anno) && e.dati)
    .map((e) => ({ ...e, dati: dati(e.dati) }))
    .sort((a, b) => a.anno - b.anno);
}

function crescitaAziendale(
  esercizi: EsercizioPonte[]
): { tasso: number; dal: number; al: number } | null {
  if (esercizi.length < 2) return null;
  const primo = esercizi[0];
  const ultimo = esercizi[esercizi.length - 1];
  const anni = ultimo.anno - primo.anno;
  const a = primo.dati.ricaviVendite;
  const b = ultimo.dati.ricaviVendite;
  if (anni <= 0 || a <= 0 || b <= 0) return null;
  return {
    tasso: (Math.pow(b / a, 1 / anni) - 1) * 100,
    dal: primo.anno,
    al: ultimo.anno,
  };
}

function intervallo(codice: AssunzionePonte['codice'], base: number): [number, number] {
  switch (codice) {
    case 'crescitaRicavi':
      return [-20, 20];
    case 'margineEbitda':
      return [-20, 60];
    case 'giorniIncasso':
    case 'giorniPagamento':
      return [0, 180];
    case 'investimentiMantenimento':
      return [0, Math.max(1, base * 2)];
    case 'aliquotaImposte':
      return [0, 60];
    case 'costoDebito':
      return [0, 30];
    case 'debitoEnte':
      return [0, Math.max(1, base * 3)];
  }
}

function validaAssunzione(a: AssunzionePonte): AssunzionePonte {
  if (!Number.isFinite(a.valore)) {
    throw new ErrorePonte(
      'ASSUNZIONE_NON_VALIDA',
      `L’assunzione «${a.etichetta}» non è un numero.`
    );
  }
  if (a.intervallo) {
    const [min, max] = a.intervallo;
    if (a.valore < min || a.valore > max) {
      throw new ErrorePonte(
        'ASSUNZIONE_FUORI_INTERVALLO',
        `L’assunzione «${a.etichetta}» vale ${a.valore}, fuori dall’intervallo ammesso ${min}–${max}.`
      );
    }
  }
  return a;
}

function assunzione(
  codice: AssunzionePonte['codice'],
  etichetta: string,
  valore: number,
  unita: AssunzionePonte['unita'],
  fonte: FonteAssunzione,
  motivazione: string,
  basePerIntervallo = Math.abs(valore)
): AssunzionePonte {
  return {
    codice,
    etichetta,
    valore: R2(valore),
    unita,
    fonte,
    motivazione,
    intervallo: intervallo(codice, basePerIntervallo),
  };
}

/**
 * Costruisce le assunzioni centrali. Quelle fornite dall'AI o dall'operatore
 * vincono sul default, ma passano dalla stessa validazione: il motore non
 * accetta un numero fuori scala solo perché arriva da un modello.
 */
export function costruisciAssunzioni(
  input: InputPonte,
  esercizi = eserciziOrdinati(input.esercizi)
): AssunzionePonte[] {
  const ultimo = esercizi[esercizi.length - 1];
  if (!ultimo) throw new ErrorePonte('XBRL_ASSENTE', 'Nessun bilancio utilizzabile per il Ponte.');
  const s = ultimo.dati;
  const ricavi = s.ricaviVendite || s.valoreProduzione;
  const valore = s.valoreProduzione || ricavi;
  const costiOperativi = Math.max(0, s.costiProduzione - s.ammortamenti);
  const ebit = valore - s.costiProduzione;
  const anteImposte = ebit - s.oneriFinanziari;
  const imposteImplicite = anteImposte > 0 ? anteImposte - s.utileEsercizio : null;
  const aliquota =
    imposteImplicite !== null && imposteImplicite >= 0
      ? clamp((imposteImplicite / anteImposte) * 100, 0, 60)
      : 27.9;
  const margine = valore > 0 ? ((valore - costiOperativi) / valore) * 100 : 0;
  const giorniIncasso = ricavi > 0 ? (s.creditiClienti / ricavi) * 365 : 0;
  const giorniPagamento = costiOperativi > 0 ? (s.debitiFornitori / costiOperativi) * 365 : 0;
  const costoDebito = s.debitiBanche > 0 ? (s.oneriFinanziari / s.debitiBanche) * 100 : 0;
  const crescitaAzienda = crescitaAziendale(esercizi);
  const crescita =
    input.settore.fonte === 'settore'
      ? input.settore.tasso
      : input.settore.fonte === 'azienda'
        ? input.settore.tasso
        : (crescitaAzienda?.tasso ?? 0);
  const fonteCrescita: FonteAssunzione =
    input.settore.fonte === 'settore'
      ? 'settore'
      : input.settore.fonte === 'azienda'
        ? 'azienda'
        : crescitaAzienda
          ? 'derivata'
          : 'stimata';
  const motivazioneCrescita =
    input.settore.fonte !== 'nessuna'
      ? input.settore.descrizione
      : crescitaAzienda
        ? `Dati di settore non disponibili: crescita annua composta dei ricavi dell’azienda ${crescitaAzienda.dal}–${crescitaAzienda.al}, ${R2(crescitaAzienda.tasso)}%, limitata all’intervallo del modello.`
        : 'Né dati di settore né almeno due bilanci: crescita prudenziale pari a zero.';

  const base: AssunzionePonte[] = [
    assunzione(
      'crescitaRicavi',
      'Crescita annua dei ricavi',
      clamp(crescita, -20, 20),
      '%',
      fonteCrescita,
      motivazioneCrescita
    ),
    assunzione(
      'margineEbitda',
      'Margine EBITDA sui ricavi',
      margine,
      '%',
      'derivata',
      `Margine implicito dell’ultimo bilancio: (valore della produzione − costi operativi) / valore della produzione.`
    ),
    assunzione(
      'giorniIncasso',
      'Giorni medi di incasso',
      clamp(giorniIncasso, 0, 180),
      'giorni',
      'derivata',
      'Crediti verso clienti / ricavi delle vendite × 365, dall’ultimo bilancio.'
    ),
    assunzione(
      'giorniPagamento',
      'Giorni medi di pagamento',
      clamp(giorniPagamento, 0, 180),
      'giorni',
      'derivata',
      'Debiti verso fornitori / costi operativi × 365, dall’ultimo bilancio.'
    ),
    assunzione(
      'investimentiMantenimento',
      'Investimenti di mantenimento annui',
      Math.max(0, s.ammortamenti),
      'EUR',
      'derivata',
      'Pari agli ammortamenti dell’ultimo bilancio: ipotesi di mantenimento, non di crescita.'
    ),
    assunzione(
      'aliquotaImposte',
      'Aliquota d’imposta sull’utile ante imposte',
      aliquota,
      '%',
      imposteImplicite !== null ? 'derivata' : 'stimata',
      imposteImplicite !== null
        ? 'Aliquota implicita dell’ultimo bilancio, limitata al 60%.'
        : 'Aliquota non ricavabile dal bilancio: applicato il riferimento IRES + IRAP del 27,9%.'
    ),
    assunzione(
      'costoDebito',
      'Costo annuo del debito bancario',
      clamp(costoDebito, 0, 30),
      '%',
      'derivata',
      'Oneri finanziari / debiti verso banche, dall’ultimo bilancio; zero se il debito bancario è assente.'
    ),
  ];

  const debitoEnte = input.debitoEnte
    ? assunzione(
        'debitoEnte',
        'Debito ente certo',
        Math.max(0, input.debitoEnte.totale),
        'EUR',
        'certa',
        `Esposizione della Verifica amministrativa: ${input.debitoEnte.righe} posizioni, al netto di duplicati, sospese e posizioni ignorate.`,
        Math.max(1, input.debitoEnte.totale)
      )
    : assunzione(
        'debitoEnte',
        'Debito ente certo',
        0,
        'EUR',
        input.debitoEnteDichiaratoZero ? 'certa' : 'stimata',
        input.debitoEnteDichiaratoZero
          ? 'L’operatore ha dichiarato espressamente che il debito verso l’ente è zero.'
          : 'Nessuna certificazione del debito ente: il Ponte non lo presume zero e lo lascia fuori dalla rettifica.',
        1
      );

  const perCodice = new Map((input.assunzioni ?? []).map((a) => [a.codice, a]));
  const tutte = [...base, debitoEnte].map((a) => {
    const sostituta = perCodice.get(a.codice);
    if (!sostituta) return a;
    return validaAssunzione({
      ...a,
      ...sostituta,
      intervallo: sostituta.intervallo ?? a.intervallo,
      motivazione: sostituta.motivazione || a.motivazione,
    });
  });
  // Le assunzioni sconosciute non entrano nel calcolo: il contratto è chiuso.
  return tutte;
}

function ultimoGiornoMese(anno: number, mese: number): number {
  return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
}

function frazioneMese(anno: number, mese: number, dataRif: Date): number {
  const stessoMese = dataRif.getUTCFullYear() === anno && dataRif.getUTCMonth() + 1 === mese;
  return stessoMese ? dataRif.getUTCDate() / ultimoGiornoMese(anno, mese) : 1;
}

function proietta(
  input: InputPonte,
  assunzioni: AssunzionePonte[],
  mod: ScenarioMod
): ProiezionePonte {
  const esercizi = eserciziOrdinati(input.esercizi);
  const ultimo = esercizi[esercizi.length - 1];
  if (!ultimo) throw new ErrorePonte('XBRL_ASSENTE', 'Nessun bilancio utilizzabile per il Ponte.');
  const s = ultimo.dati;
  const dataRif = new Date(`${input.dataRiferimento}T00:00:00Z`);
  if (Number.isNaN(dataRif.getTime())) {
    throw new ErrorePonte('DATA_VERIFICA_NON_VALIDA', 'Data verifica non valida.');
  }
  const fineBilancio = Date.UTC(ultimo.anno, 11, 31);
  if (dataRif.getTime() <= fineBilancio) {
    throw new ErrorePonte(
      'PONTE_NON_NECESSARIO',
      `L’ultimo bilancio (${ultimo.anno}) arriva già alla Data verifica: il Ponte non serve.`
    );
  }
  const inizioAnno = ultimo.anno + 1;
  const mesi = (dataRif.getUTCFullYear() - inizioAnno) * 12 + (dataRif.getUTCMonth() + 1);
  if (mesi <= 0) {
    throw new ErrorePonte(
      'PONTE_NON_NECESSARIO',
      'La Data verifica non è successiva all’ultimo bilancio.'
    );
  }
  const massimo = input.parametri?.orizzonteMassimoMesi ?? ORIZZONTE_MASSIMO_MESI;
  if (mesi > massimo) {
    throw new ErrorePonte(
      'GAP_TROPPO_LUNGO',
      `Il Ponte coprirebbe ${mesi} mesi, oltre il limite di ${massimo}: serve una conferma esplicita o un bilancio più recente.`
    );
  }

  const a = new Map(assunzioni.map((x) => [x.codice, x]));
  const crescita = a.get('crescitaRicavi')?.valore ?? 0;
  const margine = clamp((a.get('margineEbitda')?.valore ?? 0) + mod.deltaMargine, -50, 90);
  const giorniIncasso = clamp(
    (a.get('giorniIncasso')?.valore ?? 0) + mod.deltaGiorniIncasso,
    0,
    365
  );
  const giorniPagamento = clamp(
    (a.get('giorniPagamento')?.valore ?? 0) + mod.deltaGiorniPagamento,
    0,
    365
  );
  const investimentiAnnui = Math.max(0, a.get('investimentiMantenimento')?.valore ?? 0);
  const aliquota = clamp(a.get('aliquotaImposte')?.valore ?? 27.9, 0, 60);
  const costoDebito = clamp(a.get('costoDebito')?.valore ?? 0, 0, 30);
  const debitoEnteCerto = input.debitoEnte?.totale ?? (input.debitoEnteDichiaratoZero ? 0 : null);

  const ricaviAnnui = s.ricaviVendite || s.valoreProduzione;
  const altriAnnui = Math.max(0, s.valoreProduzione - s.ricaviVendite);
  const altriDebiti = Math.max(
    0,
    s.totaleDebiti - s.debitiBanche - s.debitiFornitori - s.debitiTributari - s.debitiPrevidenziali
  );
  const altroAttivoCircolante = Math.max(
    0,
    s.attivoCircolante - s.creditiClienti - s.disponibilitaLiquide
  );
  const debitoEnteNelBilancio =
    debitoEnteCerto === null ? null : Math.max(0, s.debitiTributari + s.debitiPrevidenziali);
  const rettificaDebitoEnte =
    debitoEnteCerto === null ? 0 : debitoEnteCerto - (debitoEnteNelBilancio ?? 0);

  let cassa = s.disponibilitaLiquide;
  let crediti = s.creditiClienti;
  let fornitori = s.debitiFornitori;
  let immobilizzazioni = s.immobilizzazioni;
  let patrimonio = s.patrimonioNetto;
  const mesiCalcolati: MesePonte[] = [];

  for (let i = 0; i < mesi; i++) {
    const anno = inizioAnno + Math.floor(i / 12);
    const meseNumero = (i % 12) + 1;
    const frazione = frazioneMese(anno, meseNumero, dataRif);
    const fattore = Math.pow(1 + crescita / 100, i / 12);
    const moltiplicatore = mod.moltiplicatoreRicavi;

    const ricaviMese = (ricaviAnnui / 12) * fattore * moltiplicatore * frazione;
    const altriMese = (altriAnnui / 12) * fattore * moltiplicatore * frazione;
    const valoreProduzione = ricaviMese + altriMese;
    const costiOperativi = valoreProduzione * (1 - margine / 100);
    const ebitda = valoreProduzione - costiOperativi;
    const ammortamenti = (s.ammortamenti / 12) * frazione;
    const ebit = ebitda - ammortamenti;
    const oneriFinanziari =
      s.debitiBanche > 0
        ? ((s.debitiBanche * costoDebito) / 100 / 12) * frazione
        : (s.oneriFinanziari / 12) * frazione;
    const imposte = Math.max(0, ebit - oneriFinanziari) * (aliquota / 100);
    const utile = ebit - oneriFinanziari - imposte;

    // Il circolante si ancora al run-rate: nel mese parziale non si finge un
    // mese intero, ma i giorni di incasso restano quelli annui dichiarati.
    const runRateRicavi = frazione > 0 ? (ricaviMese / frazione) * 12 : 0;
    const runRateCosti = frazione > 0 ? (costiOperativi / frazione) * 12 : 0;
    const nuoviCrediti = (runRateRicavi * giorniIncasso) / 365;
    const nuoviFornitori = (runRateCosti * giorniPagamento) / 365;
    const deltaCrediti = nuoviCrediti - crediti;
    const deltaFornitori = nuoviFornitori - fornitori;

    const investimenti = (investimentiAnnui / 12) * frazione;
    const flussoCassa =
      ebitda - oneriFinanziari - imposte - deltaCrediti + deltaFornitori - investimenti;
    cassa += flussoCassa;
    crediti = nuoviCrediti;
    fornitori = nuoviFornitori;
    immobilizzazioni = Math.max(0, immobilizzazioni + investimenti - ammortamenti);
    patrimonio += utile;

    const totaleDebiti = Math.max(
      0,
      s.debitiBanche +
        fornitori +
        s.debitiTributari +
        s.debitiPrevidenziali +
        altriDebiti +
        rettificaDebitoEnte
    );
    const totaleAttivo = immobilizzazioni + crediti + Math.max(0, cassa) + altroAttivoCircolante;
    const fabbisogno = Math.max(0, -cassa);

    mesiCalcolati.push({
      mese: `${anno}-${String(meseNumero).padStart(2, '0')}`,
      anno,
      meseNumero,
      frazione: R2(frazione),
      ricaviVendite: R2(ricaviMese),
      altriRicavi: R2(altriMese),
      valoreProduzione: R2(valoreProduzione),
      costiOperativi: R2(costiOperativi),
      ammortamenti: R2(ammortamenti),
      ebitda: R2(ebitda),
      ebit: R2(ebit),
      oneriFinanziari: R2(oneriFinanziari),
      imposte: R2(imposte),
      utile: R2(utile),
      creditiClienti: R2(crediti),
      debitiFornitori: R2(fornitori),
      debitiBanche: R2(s.debitiBanche),
      debitiTributari: R2(s.debitiTributari),
      debitiPrevidenziali: R2(s.debitiPrevidenziali),
      altriDebiti: R2(altriDebiti),
      rettificaDebitoEnte: R2(rettificaDebitoEnte),
      totaleDebiti: R2(totaleDebiti),
      disponibilitaLiquide: R2(cassa),
      immobilizzazioni: R2(immobilizzazioni),
      patrimonioNetto: R2(patrimonio),
      totaleAttivo: R2(totaleAttivo),
      flussoCassa: R2(flussoCassa),
      fabbisognoSenzaFinanziamento: R2(fabbisogno),
    });
  }

  const perAnno = new Map<number, MesePonte[]>();
  for (const m of mesiCalcolati) {
    const elenco = perAnno.get(m.anno) ?? [];
    elenco.push(m);
    perAnno.set(m.anno, elenco);
  }
  const anni: AnnoPonte[] = [...perAnno.entries()].map(([anno, lista]) => {
    const ultimoMese = lista[lista.length - 1];
    const somma = (campo: keyof MesePonte) =>
      R2(lista.reduce((n, m) => n + (m[campo] as number), 0));
    return {
      anno,
      mesi: lista.length,
      ricaviVendite: somma('ricaviVendite'),
      altriRicavi: somma('altriRicavi'),
      valoreProduzione: somma('valoreProduzione'),
      costiOperativi: somma('costiOperativi'),
      ammortamenti: somma('ammortamenti'),
      ebitda: somma('ebitda'),
      ebit: somma('ebit'),
      oneriFinanziari: somma('oneriFinanziari'),
      imposte: somma('imposte'),
      utile: somma('utile'),
      flussoCassa: somma('flussoCassa'),
      creditiClienti: ultimoMese.creditiClienti,
      debitiFornitori: ultimoMese.debitiFornitori,
      debitiBanche: ultimoMese.debitiBanche,
      debitiTributari: ultimoMese.debitiTributari,
      debitiPrevidenziali: ultimoMese.debitiPrevidenziali,
      altriDebiti: ultimoMese.altriDebiti,
      rettificaDebitoEnte: ultimoMese.rettificaDebitoEnte,
      totaleDebiti: ultimoMese.totaleDebiti,
      disponibilitaLiquide: ultimoMese.disponibilitaLiquide,
      immobilizzazioni: ultimoMese.immobilizzazioni,
      patrimonioNetto: ultimoMese.patrimonioNetto,
      totaleAttivo: ultimoMese.totaleAttivo,
    };
  });

  const cassaMinima = mesiCalcolati.reduce((n, m) => Math.min(n, m.disponibilitaLiquide), Infinity);
  const ultimoMese = mesiCalcolati[mesiCalcolati.length - 1];
  return {
    mesi: mesiCalcolati,
    anni,
    cassaMinima: Number.isFinite(cassaMinima) ? R2(cassaMinima) : 0,
    cassaFinale: ultimoMese?.disponibilitaLiquide ?? 0,
    debitoFinale: ultimoMese?.totaleDebiti ?? 0,
    utileTotale: R2(mesiCalcolati.reduce((n, m) => n + m.utile, 0)),
    fabbisognoSenzaFinanziamento: cassaMinima < 0 ? R2(-cassaMinima) : 0,
  };
}

function componentiCopertura(input: InputPonte, esercizi: EsercizioPonte[]): CoperturaPonte {
  const ultimo = esercizi[esercizi.length - 1]?.dati;
  const xbrlCompleto =
    esercizi.length >= 2 &&
    !!ultimo &&
    ultimo.totaleAttivo > 0 &&
    (ultimo.ricaviVendite > 0 || ultimo.valoreProduzione > 0);
  const xbrlParziale =
    esercizi.length > 0 && !!ultimo && (ultimo.totaleAttivo > 0 || ultimo.valoreProduzione > 0);
  const debito = input.debitoEnte ? 1 : input.debitoEnteDichiaratoZero ? 1 : 0;
  const note = input.note.length >= 2 ? 1 : input.note.length > 0 ? 0.5 : 0;
  const visura = input.visura ? 1 : 0;
  const settore = input.settore.fonte !== 'nessuna' ? 1 : 0;
  const componenti = [
    {
      codice: 'XBRL' as const,
      etichetta: 'Bilanci XBRL',
      peso: 0.35,
      valore: xbrlCompleto ? 1 : xbrlParziale ? 0.5 : 0,
      determinato: xbrlParziale,
      dettaglio: xbrlCompleto
        ? `${esercizi.length} esercizi con stato patrimoniale e conto economico.`
        : xbrlParziale
          ? 'Un solo esercizio o dati parziali: il Ponte parte, ma il trend è più fragile.'
          : 'Nessun bilancio utilizzabile.',
    },
    {
      codice: 'DEBITO_ENTE' as const,
      etichetta: 'Debito ente',
      peso: 0.25,
      valore: debito,
      determinato: debito > 0,
      dettaglio: input.debitoEnte
        ? `Snapshot di ${input.debitoEnte.righe} posizioni per ${euro(input.debitoEnte.totale)}.`
        : input.debitoEnteDichiaratoZero
          ? 'Dichiarato zero dall’operatore.'
          : 'Nessuna certificazione e nessuna dichiarazione di zero.',
    },
    {
      codice: 'NOTE' as const,
      etichetta: 'Note integrative',
      peso: 0.2,
      valore: note,
      determinato: note > 0,
      dettaglio:
        input.note.length > 0
          ? `${input.note.length} testi letti dal bilancio.`
          : 'Nessun fact testuale letto: il Ponte resta sui numeri.',
    },
    {
      codice: 'VISURA' as const,
      etichetta: 'Visura',
      peso: 0.1,
      valore: visura,
      determinato: visura > 0,
      dettaglio: input.visura
        ? 'Fatti della visura disponibili.'
        : 'Visura non disponibile: si usa la sola anagrafica.',
    },
    {
      codice: 'SETTORE' as const,
      etichetta: 'Settore',
      peso: 0.1,
      valore: settore,
      determinato: settore > 0,
      dettaglio: input.settore.descrizione,
    },
  ];
  const punteggio = R2(componenti.reduce((n, c) => n + c.peso * c.valore, 0));
  return {
    punteggio,
    livello: punteggio >= 0.8 ? 'ALTA' : punteggio >= 0.5 ? 'MEDIA' : 'BASSA',
    componenti,
  };
}

function avvisi(
  input: InputPonte,
  esercizi: EsercizioPonte[],
  proiezione: ProiezionePonte,
  copertura: CoperturaPonte,
  mesi: number
): AvvisoPonte[] {
  const out: AvvisoPonte[] = [];
  if (input.note.length === 0) {
    out.push({
      codice: 'NOTE_ASSENTI',
      testo:
        'Nessuna nota integrativa testuale letta dal file XBRL: criteri di valutazione, eventi successivi e continuità non sono stati verificati.',
    });
  } else if (input.note.length === 1) {
    out.push({
      codice: 'NOTE_PARZIALI',
      testo: 'Una sola nota integrativa letta: la copertura qualitativa è parziale.',
    });
  }
  if (!input.visura) {
    out.push({
      codice: 'VISURA_ASSENTE',
      testo:
        'Visura non disponibile: il Ponte usa l’anagrafica e i dati contabili, non i fatti camerali.',
    });
  }
  if (input.settore.fonte === 'nessuna') {
    out.push({
      codice: 'SETTORE_ASSENTE',
      testo: 'Nessun dato di settore utilizzabile: la crescita è stimata dai bilanci o resta zero.',
    });
  }
  if (!input.debitoEnte && !input.debitoEnteDichiaratoZero) {
    out.push({
      codice: 'DEBITO_ENTE_ASSENTE',
      testo:
        'Debito ente non disponibile: non è stato assunto zero e la rettifica del debito totale resta fuori. Serve una dichiarazione esplicita.',
    });
  }
  if (mesi > 36) {
    out.push({
      codice: 'GAP_LUNGO',
      testo: `Il Ponte copre ${mesi} mesi: oltre i 36 mesi l’affidabilità della proiezione diminuisce e il report lo dichiara.`,
    });
  }
  if (esercizi.length === 1) {
    out.push({
      codice: 'BILANCIO_UNICO',
      testo:
        'Un solo esercizio disponibile: non c’è un trend storico su cui verificare le assunzioni.',
    });
  }
  if (proiezione.cassaMinima < 0) {
    out.push({
      codice: 'CASSA_NEGATIVA',
      testo: `La cassa minima del Ponte è negativa per ${euro(-proiezione.cassaMinima)}: è fabbisogno finanziario, non debito creato automaticamente.`,
    });
  }
  if (copertura.livello === 'BASSA') {
    out.push({
      codice: 'COPERTURA_BASSA',
      testo: `Copertura dei dati bassa (${Math.round(copertura.punteggio * 100)}%): il risultato va letto come ordine di grandezza, non come previsione.`,
    });
  }
  return out;
}

function riconciliazione(
  input: InputPonte,
  esercizi: EsercizioPonte[],
  proiezione: ProiezionePonte
): RiconciliazionePonte {
  const ultimo = esercizi[esercizi.length - 1];
  const s = ultimo.dati;
  const ultimoMese = proiezione.mesi[proiezione.mesi.length - 1];
  const debitoEnteCerto = input.debitoEnte?.totale ?? (input.debitoEnteDichiaratoZero ? 0 : null);
  const debitoEnteNelBilancio =
    debitoEnteCerto === null ? null : Math.max(0, s.debitiTributari + s.debitiPrevidenziali);
  const rettifica = ultimoMese?.rettificaDebitoEnte ?? 0;
  // L'utile della riconciliazione è quello che il patrimonio netto ha
  // effettivamente incorporato, non la somma dei mesi arrotondati: così
  // l'identità di bilancio non si perde per un centesimo di visualizzazione.
  const utilePonte = R2((ultimoMese?.patrimonioNetto ?? s.patrimonioNetto) - s.patrimonioNetto);
  const voci = [
    {
      codice: 'PATRIMONIO',
      etichetta: 'Patrimonio netto di bilancio',
      importo: s.patrimonioNetto,
    },
    {
      codice: 'UTILE',
      etichetta: 'Utile prodotto nel Ponte',
      importo: utilePonte,
    },
    {
      codice: 'PATRIMONIO_PONTE',
      etichetta: 'Patrimonio netto alla Data verifica',
      importo: ultimoMese?.patrimonioNetto ?? s.patrimonioNetto,
    },
    {
      codice: 'DEBITO_BILANCIO',
      etichetta: 'Debito totale di bilancio',
      importo: s.totaleDebiti,
    },
    {
      codice: 'DEBITO_ENTE',
      etichetta: 'Debito ente certo',
      importo: debitoEnteCerto ?? 0,
    },
    {
      codice: 'RETTIFICA_ENTE',
      etichetta: 'Rettifica per perimetro debito ente',
      importo: rettifica,
    },
    {
      codice: 'DEBITO_PONTE',
      etichetta: 'Debito totale stimato alla Data verifica',
      importo: ultimoMese?.totaleDebiti ?? s.totaleDebiti,
    },
    {
      codice: 'CASSA',
      etichetta: 'Cassa alla Data verifica',
      importo: proiezione.cassaFinale,
    },
    {
      codice: 'FABBISOGNO',
      etichetta: 'Fabbisogno senza finanziamento',
      importo: proiezione.fabbisognoSenzaFinanziamento,
    },
  ];
  return {
    patrimonioNettoBilancio: s.patrimonioNetto,
    utilePonte,
    patrimonioNettoPonte: ultimoMese?.patrimonioNetto ?? s.patrimonioNetto,
    debitoTotaleBilancio: s.totaleDebiti,
    debitoEnteCerto,
    debitoEnteNelBilancio,
    rettificaDebitoEnte: rettifica,
    debitoTotalePonte: ultimoMese?.totaleDebiti ?? s.totaleDebiti,
    cassaBilancio: s.disponibilitaLiquide,
    cassaPonte: proiezione.cassaFinale,
    fabbisognoSenzaFinanziamento: proiezione.fabbisognoSenzaFinanziamento,
    voci,
  };
}

function sintesi(
  input: InputPonte,
  proiezione: ProiezionePonte,
  copertura: CoperturaPonte
): string {
  const ultimo = proiezione.mesi[proiezione.mesi.length - 1];
  const scenari = proiezione.anni
    .map((a) => `${a.anno}: ${euro(a.disponibilitaLiquide)}`)
    .join('; ');
  return [
    `Ponte al ${input.dataRiferimento.split('-').reverse().join('/')}.`,
    ultimo
      ? `Cassa stimata ${euro(proiezione.cassaFinale)}, debito totale stimato ${euro(proiezione.debitoFinale)}, utile cumulato ${euro(proiezione.utileTotale)}.`
      : 'Nessun mese proiettato.',
    proiezione.fabbisognoSenzaFinanziamento > 0
      ? `Fabbisogno senza finanziamento: ${euro(proiezione.fabbisognoSenzaFinanziamento)}.`
      : 'Nessun fabbisogno negativo nel periodo.',
    scenari ? `Saldi di cassa per anno: ${scenari}.` : '',
    `Copertura dei dati: ${copertura.livello} (${Math.round(copertura.punteggio * 100)}%).`,
    'Il Ponte misura una traiettoria contabile: non qualifica la crisi e non decide il cram down.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function calcolaPonte(input: InputPonte): EsitoPonte {
  const esercizi = eserciziOrdinati(input.esercizi);
  if (esercizi.length === 0) {
    throw new ErrorePonte('XBRL_ASSENTE', 'Serve almeno un bilancio XBRL per calcolare il Ponte.');
  }
  if (!input.dataRiferimento) {
    throw new ErrorePonte('DATA_VERIFICA_ASSENTE', 'La Data verifica è obbligatoria.');
  }
  const assunzioni = costruisciAssunzioni(input, esercizi);
  const base = proietta(input, assunzioni, BASE);
  const favorevole = proietta(input, assunzioni, {
    moltiplicatoreRicavi: 1.1,
    deltaMargine: 2,
    deltaGiorniIncasso: -15,
    deltaGiorniPagamento: 15,
  });
  const sfavorevole = proietta(input, assunzioni, {
    moltiplicatoreRicavi: 0.9,
    deltaMargine: -2,
    deltaGiorniIncasso: 15,
    deltaGiorniPagamento: -15,
  });
  const copertura = componentiCopertura(input, esercizi);
  const mesi =
    (new Date(input.dataRiferimento).getUTCFullYear() - esercizi[esercizi.length - 1].anno - 1) *
      12 +
    (new Date(input.dataRiferimento).getUTCMonth() + 1);
  const limiti = [
    'Proiezione mensile semplificata: nessuna stagionalità, nessun dettaglio per commessa, cliente o singolo rapporto.',
    'I costi operativi seguono il margine EBITDA dichiarato; il circolante segue giorni medi di incasso e pagamento.',
    'Il debito ente è un’esposizione aggregata: la rettifica riconcilia il perimetro, non accerta la natura o l’esigibilità del credito.',
    'Il Ponte non decide la sostenibilità, non formula una proposta e non qualifica la crisi: questi passaggi restano allo Scenario e al professionista.',
    'I dati gestionali aggiornati dell’azienda non entrano nel Ponte: lo Scenario li confronta separatamente.',
    'Il recupero documentato non si sottrae al debito: credito dell’ente, debito totale stimato e recupero sono termini di paragone, non una compensazione.',
  ];
  // La Sintesi integrata sta nell'output perché nasce dagli stessi input: se i
  // parametri dell'ente cambiano, cambia la versione, non solo lo schermo.
  const sintesiFinale = sintesiIntegrata({
    creditoEnte: input.debitoEnte?.totale ?? (input.debitoEnteDichiaratoZero ? 0 : null),
    debitoTotaleStimato: base.debitoFinale,
    cassaFinale: base.cassaFinale,
    rangoCredito: input.rangoCredito ?? null,
    parametriScenari: input.parametriScenari ?? null,
  });
  return {
    ...base,
    versioneMotore: VERSIONE_MOTORE,
    dataRiferimento: input.dataRiferimento,
    esercizioPartenza: esercizi[esercizi.length - 1].anno,
    assunzioni,
    riconciliazione: riconciliazione(input, esercizi, base),
    scenari: { favorevole, sfavorevole },
    copertura,
    sintesiIntegrata: sintesiFinale,
    avvisi: avvisi(input, esercizi, base, copertura, mesi),
    limiti,
    sintesi: sintesi(input, base, copertura),
  };
}
