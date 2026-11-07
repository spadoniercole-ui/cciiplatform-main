// src/lib/demo/percorsoEnte.ts
//
// IL PERCORSO DEMO DI UNO SPAZIO ENTE (0.172.0): quattro percorsi completi,
// dal triage allo scenario, e una quinta posizione ferma al triage.
//
// PERCHÉ PARTE DAL TRIAGE E NON DAL PROVVEDIMENTO. Il set della 0.171.0
// mostrava la fine della storia: un decreto già emesso e i documenti allegati.
// Qui la storia si vede dall'inizio, nell'ordine in cui la vede un funzionario:
// si apre la verifica di salute di un'impresa, si legge la fotografia
// (esposizione, soglie, indici), si consulta lo screening già risposto e si
// arriva allo scenario aperto. È lo stesso percorso del prodotto, non una
// scorciatoia.
//
// I TRE PROFILI SONO DIVERSI DI PROPOSITO:
//   ROSSO              — soglia di segnalazione superata e tre indici oltre
//                        soglia: il caso in cui l'ente deve agire;
//   GIALLO             — esposizione sotto soglia, un indice fuori parametro:
//                        il caso da seguire senza allarme;
//   ATTENZIONE_MINIMA  — nessuna soglia superata e nessun indice violato:
//                        il caso in cui la risposta può essere «nulla da
//                        rilevare con i dati disponibili».
//
// UNA SOLA FONTE. Gli stessi numeri generano i debiti verso l'ente, la scheda
// soglie, il bilancio XBRL, gli indici e il testo dello screening. Scritti due
// volte, la demo mostrerebbe contraddizioni che non sono nel prodotto.
//
// Logica pura: nessun database e nessun React. Il caricamento sta in
// caricaPercorsoEnte.ts.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import type { SezioneChecklist, PesoDomanda } from '@/lib/checklist/ministeriale';
import type { FattiVisura } from '@/lib/visura/fatti';
import type { RangoCredito } from '@/lib/triage/scenari';
import type { TipoIstruttoria } from '@/lib/giudice/lettura';
import { costruisciBundleIndici } from '@/lib/xbrl/indici';

export type ProfiloDemo = 'ROSSO' | 'GIALLO' | 'ATTENZIONE_MINIMA';

export const ETICHETTA_PROFILO: Record<ProfiloDemo, string> = {
  ROSSO: 'Soglia superata e bilancio critico',
  GIALLO: 'Esposizione sotto soglia e un indice fuori parametro',
  ATTENZIONE_MINIMA: 'Nessuna criticità rilevata con i dati disponibili',
};

export interface DebitoPercorsoDemo {
  voce: string;
  importo: number;
  /** Categoria della posizione debitoria dell'ente. */
  tipo: string;
  nota?: string;
}

export interface SogliePercorsoDemo {
  conLavoratori: boolean;
  contributiScaduti: number;
  contributiDovutiAnnoPrecedente: number;
  annoContributiDovuti: number;
  volumeAffari: number;
  ritardoOltre90Giorni: boolean;
  periodiInRitardo: number;
}

export interface DomandaPercorsoDemo {
  id: string;
  domanda: string;
  risposta: boolean;
  peso?: PesoDomanda;
  nota?: string;
}

export interface DirettricePercorsoDemo {
  nome: string;
  prodotti: string[];
}

export interface ScreeningPercorsoDemo {
  sezioni: SezioneChecklist[];
  risposte: { domandaId: string; risposta: boolean; note: string | null }[];
  relazione: string;
}

export interface AziendaPercorsoDemo {
  ragioneSociale: string;
  codiceFiscale: string;
  partitaIva: string;
  codiceAteco: string;
  formaGiuridica: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  cap: string;
  capitaleSociale: number;
  rappresentante: string;
  ruoloRappresentante: string;
  numeroRea: string;
  pec: string;
  annoCostituzione: number;
  dataVerifica: string;
  profilo: ProfiloDemo;
  finanziario: {
    anno: number;
    corrente: DatiFinanziariPeriodo;
    precedente: DatiFinanziariPeriodo;
  };
  debiti: DebitoPercorsoDemo[];
  soglie: SogliePercorsoDemo;
  screening: ScreeningPercorsoDemo;
  visura: FattiVisura;
  rango: RangoCredito;
  /** Percorso dello scenario: proposta, decreto di liquidazione, cram down o ancora da scegliere. */
  tipoIstruttoria: TipoIstruttoria;
  /** La quarta azienda resta volutamente senza percorso precostituito. */
  aperta?: boolean;
  scenario: string;
  /** Nome usato prima della 0.174.0, per rinominare senza duplicare. */
  scenarioPrecedente?: string;
  dataDepositoProposta: string;
}

/**
 * La quinta posizione del set demo: resta ferma al TRIAGE.
 *
 * Non è una posizione incompleta per caso. È il punto che rende visibile il
 * passaggio prima dello screening: anagrafica, soglie e posizioni ci sono, ma
 * non c'è ancora né lo screening né lo scenario. La dashboard la mostra fra le
 * «Aziende da verificare» e da lì si riapre la verifica di salute, con la
 * decisione (procedere o archiviare) ancora da prendere.
 *
 * Il tipo è un sottoinsieme di `AziendaPercorsoDemo`: chi la carica non deve
 * poterla spacciare per un percorso già concluso.
 */
export type AziendaTriageDemo = Pick<
  AziendaPercorsoDemo,
  | 'ragioneSociale'
  | 'codiceFiscale'
  | 'partitaIva'
  | 'codiceAteco'
  | 'formaGiuridica'
  | 'indirizzo'
  | 'citta'
  | 'provincia'
  | 'cap'
  | 'capitaleSociale'
  | 'rappresentante'
  | 'ruoloRappresentante'
  | 'numeroRea'
  | 'pec'
  | 'annoCostituzione'
  | 'dataVerifica'
  | 'profilo'
  | 'debiti'
  | 'soglie'
>;

/** Le direttrici su cui lo spazio demo genera le domande dello screening. */
export const DIRETTRICI_DEMO: DirettricePercorsoDemo[] = [
  { nome: 'Gestione del credito', prodotti: ['DURC', 'Rateizzazione'] },
  { nome: 'Vigilanza documentale', prodotti: ['Bilanci', 'Visura'] },
];

const dati = (parziale: Partial<DatiFinanziariPeriodo>): DatiFinanziariPeriodo => ({
  ricaviVendite: 0,
  valoreProduzione: 0,
  costiProduzione: 0,
  ebit: 0,
  ammortamenti: 0,
  ebitda: 0,
  oneriFinanziari: 0,
  utileEsercizio: 0,
  totaleAttivo: 0,
  attivoCircolante: 0,
  disponibilitaLiquide: 0,
  immobilizzazioni: 0,
  patrimonioNetto: 0,
  totaleDebiti: 0,
  debitiBanche: 0,
  debitiFornitori: 0,
  debitiTributari: 0,
  debitiPrevidenziali: 0,
  passivoCorrente: 0,
  creditiClienti: 0,
  ...parziale,
});

/**
 * Compone sezioni e risposte dallo stesso elenco di domande.
 *
 * Le due cose non possono divergere: una domanda senza risposta renderebbe il
 * quadro «non valutabile», e la demo sembrerebbe rotta mentre sta solo
 * mostrando i dati a metà.
 */
function screening(
  gruppi: { numero: string; titolo: string; domande: DomandaPercorsoDemo[] }[],
  relazione: string
): ScreeningPercorsoDemo {
  return {
    sezioni: gruppi.map((g) => ({
      numero: g.numero,
      titolo: g.titolo,
      domande: g.domande.map((d) => ({
        id: d.id,
        aCuraDi: 'imprenditore' as const,
        peso: d.peso ?? 'RILEVANTE',
        domanda: d.domanda,
        ...(d.nota ? { indicazioneSeNo: d.nota } : {}),
      })),
    })),
    risposte: gruppi.flatMap((g) =>
      g.domande.map((d) => ({
        domandaId: d.id,
        risposta: d.risposta,
        note: d.nota ?? null,
      }))
    ),
    relazione,
  };
}

function visura(
  a: Pick<
    AziendaPercorsoDemo,
    | 'ragioneSociale'
    | 'codiceFiscale'
    | 'formaGiuridica'
    | 'indirizzo'
    | 'citta'
    | 'provincia'
    | 'cap'
    | 'capitaleSociale'
    | 'annoCostituzione'
    | 'rappresentante'
    | 'ruoloRappresentante'
  >,
  oggettoSociale: string,
  addetti: number
): FattiVisura {
  return {
    denominazione: a.ragioneSociale,
    codiceFiscale: a.codiceFiscale,
    formaGiuridica: a.formaGiuridica,
    sedeLegale: `${a.indirizzo}, ${a.cap} ${a.citta} (${a.provincia})`,
    dataCostituzione: `${a.annoCostituzione}-01-15`,
    durata: '31/12/2050',
    statoAttivita: 'ATTIVA',
    capitaleSociale: a.capitaleSociale,
    addetti: { numero: addetti, riferimento: 'Visura camerale, sezione addetti' },
    oggettoSociale,
    amministratori: [{ nome: a.rappresentante, carica: a.ruoloRappresentante }],
    procedureConcorsuali: [],
    trasferimentiSede: [],
    attiRilevanti: [],
    dataVisura: '2026-09-30',
  };
}

// ---------------------------------------------------------------------------
// I QUATTRO PERCORSI COMPLETI
// ---------------------------------------------------------------------------

export const PERCORSO_DEMO: AziendaPercorsoDemo[] = [
  {
    ragioneSociale: 'Meccanica Valsesia Demo S.r.l.',
    codiceFiscale: '00000000101',
    partitaIva: '00000000101',
    codiceAteco: '25.62.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via delle Officine 18',
    citta: 'Vigevano',
    provincia: 'PV',
    cap: '27029',
    capitaleSociale: 100_000,
    rappresentante: 'Paolo Esempio',
    ruoloRappresentante: 'Amministratore unico',
    numeroRea: 'PV-001101',
    pec: 'meccanica.valsesia.demo@pec.esempio.it',
    annoCostituzione: 2008,
    dataVerifica: '2026-09-30',
    profilo: 'ROSSO',
    finanziario: {
      anno: 2025,
      corrente: dati({
        ricaviVendite: 1_200_000,
        valoreProduzione: 1_350_000,
        costiProduzione: 1_290_000,
        ebit: 60_000,
        ammortamenti: 40_000,
        ebitda: 100_000,
        oneriFinanziari: 55_000,
        utileEsercizio: 5_000,
        totaleAttivo: 1_100_000,
        attivoCircolante: 600_000,
        disponibilitaLiquide: 10_000,
        immobilizzazioni: 500_000,
        patrimonioNetto: 55_000,
        totaleDebiti: 900_000,
        debitiBanche: 350_000,
        debitiFornitori: 360_000,
        debitiTributari: 150_000,
        debitiPrevidenziali: 140_000,
        passivoCorrente: 700_000,
        creditiClienti: 400_000,
      }),
      precedente: dati({
        ricaviVendite: 1_350_000,
        valoreProduzione: 1_500_000,
        costiProduzione: 1_420_000,
        ebit: 80_000,
        ammortamenti: 45_000,
        ebitda: 125_000,
        oneriFinanziari: 50_000,
        utileEsercizio: 15_000,
        totaleAttivo: 1_200_000,
        attivoCircolante: 700_000,
        disponibilitaLiquide: 20_000,
        immobilizzazioni: 500_000,
        patrimonioNetto: 100_000,
        totaleDebiti: 880_000,
        debitiBanche: 330_000,
        debitiFornitori: 370_000,
        debitiTributari: 120_000,
        debitiPrevidenziali: 130_000,
        passivoCorrente: 680_000,
        creditiClienti: 430_000,
      }),
    },
    debiti: [
      {
        voce: 'Contributi previdenziali scaduti',
        importo: 210_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
      {
        voce: 'Sanzioni civili contributive',
        importo: 35_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
    ],
    soglie: {
      conLavoratori: true,
      contributiScaduti: 210_000,
      contributiDovutiAnnoPrecedente: 300_000,
      annoContributiDovuti: 2025,
      volumeAffari: 1_350_000,
      ritardoOltre90Giorni: true,
      periodiInRitardo: 6,
    },
    screening: screening(
      [
        {
          numero: '1',
          titolo: 'Gestione del credito',
          domande: [
            {
              id: 'D1.1',
              domanda:
                'L’impresa ha definito un piano di rientro per la posizione debitoria verso l’ente?',
              risposta: false,
              nota: 'Nessun piano depositato alla data della verifica.',
            },
            {
              id: 'D1.2',
              domanda: 'Le rate scadute sono state versate nei termini?',
              risposta: false,
              nota: 'Sei periodi non versati oltre i 90 giorni.',
            },
            {
              id: 'D1.3',
              domanda: 'La posizione debitoria è stata riconciliata con l’ente?',
              risposta: true,
            },
          ],
        },
        {
          numero: '2',
          titolo: 'Vigilanza documentale',
          domande: [
            {
              id: 'D2.1',
              domanda: 'I bilanci degli ultimi tre esercizi risultano depositati?',
              risposta: true,
            },
            {
              id: 'D2.2',
              domanda: 'La visura non riporta procedure concorsuali in corso?',
              risposta: true,
            },
            {
              id: 'D2.3',
              domanda: 'Le comunicazioni verso l’ente risultano aggiornate?',
              risposta: false,
              nota: 'Ultima comunicazione ricevuta nel 2024.',
            },
          ],
        },
      ],
      `L’impresa presenta un’esposizione contributiva di 210.000 euro, superiore alla soglia di segnalazione applicabile, e un ritardo di oltre 90 giorni su sei periodi. Il bilancio 2025 mostra un patrimonio netto di 55.000 euro e tre indici diagnostici oltre la soglia di riferimento.\n\nNon risulta un piano di rientro depositato. Le comunicazioni verso l’ente non sono aggiornate dal 2024. Il quadro richiede l’avvio del percorso di regolazione e la verifica della documentazione aggiornata prima di ogni decisione.`
    ),
    visura: visura(
      {
        ragioneSociale: 'Meccanica Valsesia Demo S.r.l.',
        codiceFiscale: '00000000101',
        formaGiuridica: 'Società a responsabilità limitata',
        indirizzo: 'Via delle Officine 18',
        citta: 'Vigevano',
        provincia: 'PV',
        cap: '27029',
        capitaleSociale: 100_000,
        annoCostituzione: 2008,
        rappresentante: 'Paolo Esempio',
        ruoloRappresentante: 'Amministratore unico',
      },
      'Lavorazione meccanica di precisione per conto terzi.',
      24
    ),
    rango: 'PRIVILEGIATO',
    tipoIstruttoria: 'PROPOSTA',
    scenario: 'Proposta di concordato — Meccanica Valsesia Demo',
    dataDepositoProposta: '2026-09-18',
  },
  {
    ragioneSociale: 'Tessitura Lario Demo S.p.A.',
    codiceFiscale: '00000000102',
    partitaIva: '00000000102',
    codiceAteco: '13.20.00',
    formaGiuridica: 'Società per azioni',
    indirizzo: 'Via del Setificio 7',
    citta: 'Como',
    provincia: 'CO',
    cap: '22100',
    capitaleSociale: 500_000,
    rappresentante: 'Laura Esempio',
    ruoloRappresentante: 'Amministratrice delegata',
    numeroRea: 'CO-001102',
    pec: 'tessitura.lario.demo@pec.esempio.it',
    annoCostituzione: 1998,
    dataVerifica: '2026-10-15',
    profilo: 'GIALLO',
    finanziario: {
      anno: 2025,
      corrente: dati({
        ricaviVendite: 2_000_000,
        valoreProduzione: 2_200_000,
        costiProduzione: 2_100_000,
        ebit: 100_000,
        ammortamenti: 60_000,
        ebitda: 160_000,
        oneriFinanziari: 40_000,
        utileEsercizio: 30_000,
        totaleAttivo: 1_800_000,
        attivoCircolante: 900_000,
        disponibilitaLiquide: 30_000,
        immobilizzazioni: 900_000,
        patrimonioNetto: 400_000,
        totaleDebiti: 1_400_000,
        debitiBanche: 600_000,
        debitiFornitori: 600_000,
        debitiTributari: 60_000,
        debitiPrevidenziali: 70_000,
        passivoCorrente: 900_000,
        creditiClienti: 500_000,
      }),
      precedente: dati({
        ricaviVendite: 1_900_000,
        valoreProduzione: 2_100_000,
        costiProduzione: 2_000_000,
        ebit: 100_000,
        ammortamenti: 55_000,
        ebitda: 155_000,
        oneriFinanziari: 38_000,
        utileEsercizio: 45_000,
        totaleAttivo: 1_750_000,
        attivoCircolante: 850_000,
        disponibilitaLiquide: 70_000,
        immobilizzazioni: 900_000,
        patrimonioNetto: 370_000,
        totaleDebiti: 1_380_000,
        debitiBanche: 590_000,
        debitiFornitori: 600_000,
        debitiTributari: 55_000,
        debitiPrevidenziali: 65_000,
        passivoCorrente: 880_000,
        creditiClienti: 480_000,
      }),
    },
    debiti: [
      {
        voce: 'Contributi previdenziali scaduti',
        importo: 80_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
      {
        voce: 'Sanzioni civili contributive',
        importo: 12_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
    ],
    soglie: {
      conLavoratori: true,
      contributiScaduti: 80_000,
      contributiDovutiAnnoPrecedente: 400_000,
      annoContributiDovuti: 2025,
      volumeAffari: 2_200_000,
      ritardoOltre90Giorni: false,
      periodiInRitardo: 0,
    },
    screening: screening(
      [
        {
          numero: '1',
          titolo: 'Gestione del credito',
          domande: [
            {
              id: 'D1.1',
              domanda:
                'L’impresa ha definito un piano di rientro per la posizione debitoria verso l’ente?',
              risposta: true,
            },
            {
              id: 'D1.2',
              domanda: 'Le rate scadute sono state versate nei termini?',
              risposta: false,
              nota: 'Due rate versate oltre la scadenza, senza ritardo oltre i 90 giorni.',
            },
            {
              id: 'D1.3',
              domanda: 'La posizione debitoria è stata riconciliata con l’ente?',
              risposta: true,
            },
          ],
        },
        {
          numero: '2',
          titolo: 'Vigilanza documentale',
          domande: [
            {
              id: 'D2.1',
              domanda: 'I bilanci degli ultimi tre esercizi risultano depositati?',
              risposta: true,
            },
            {
              id: 'D2.2',
              domanda: 'La visura non riporta procedure concorsuali in corso?',
              risposta: true,
            },
            {
              id: 'D2.3',
              domanda: 'Le comunicazioni verso l’ente risultano aggiornate?',
              risposta: true,
            },
          ],
        },
      ],
      `L’esposizione contributiva di 80.000 euro resta sotto la soglia di segnalazione applicabile. Il ritardo non supera i 90 giorni.\n\nIl bilancio 2025 chiude con un patrimonio netto di 400.000 euro; un indice diagnostico risulta oltre la soglia di riferimento per effetto della riduzione delle disponibilità liquide. Il piano di rientro è stato depositato e le comunicazioni sono aggiornate.`
    ),
    visura: visura(
      {
        ragioneSociale: 'Tessitura Lario Demo S.p.A.',
        codiceFiscale: '00000000102',
        formaGiuridica: 'Società per azioni',
        indirizzo: 'Via del Setificio 7',
        citta: 'Como',
        provincia: 'CO',
        cap: '22100',
        capitaleSociale: 500_000,
        annoCostituzione: 1998,
        rappresentante: 'Laura Esempio',
        ruoloRappresentante: 'Amministratrice delegata',
      },
      'Tessitura e nobilitazione di filati per l’abbigliamento.',
      62
    ),
    rango: 'CHIROGRAFARIO',
    tipoIstruttoria: 'DECRETO_LIQUIDAZIONE',
    scenario: 'Decreto di liquidazione — Tessitura Lario Demo',
    scenarioPrecedente: 'Proposta di piano attestato — Tessitura Lario Demo',
    dataDepositoProposta: '2026-10-06',
  },
  {
    ragioneSociale: 'Logistica Padana Demo S.r.l.',
    codiceFiscale: '00000000103',
    partitaIva: '00000000103',
    codiceAteco: '52.29.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via della Logistica 41',
    citta: 'Piacenza',
    provincia: 'PC',
    cap: '29122',
    capitaleSociale: 150_000,
    rappresentante: 'Chiara Esempio',
    ruoloRappresentante: 'Amministratrice unica',
    numeroRea: 'PC-001103',
    pec: 'logistica.padana.demo@pec.esempio.it',
    annoCostituzione: 2015,
    dataVerifica: '2026-10-28',
    profilo: 'ATTENZIONE_MINIMA',
    finanziario: {
      anno: 2025,
      corrente: dati({
        ricaviVendite: 900_000,
        valoreProduzione: 950_000,
        costiProduzione: 880_000,
        ebit: 70_000,
        ammortamenti: 30_000,
        ebitda: 100_000,
        oneriFinanziari: 10_000,
        utileEsercizio: 40_000,
        totaleAttivo: 700_000,
        attivoCircolante: 300_000,
        disponibilitaLiquide: 90_000,
        immobilizzazioni: 400_000,
        patrimonioNetto: 300_000,
        totaleDebiti: 400_000,
        debitiBanche: 100_000,
        debitiFornitori: 200_000,
        debitiTributari: 20_000,
        debitiPrevidenziali: 25_000,
        passivoCorrente: 300_000,
        creditiClienti: 180_000,
      }),
      precedente: dati({
        ricaviVendite: 850_000,
        valoreProduzione: 900_000,
        costiProduzione: 840_000,
        ebit: 60_000,
        ammortamenti: 28_000,
        ebitda: 88_000,
        oneriFinanziari: 9_000,
        utileEsercizio: 35_000,
        totaleAttivo: 670_000,
        attivoCircolante: 280_000,
        disponibilitaLiquide: 75_000,
        immobilizzazioni: 390_000,
        patrimonioNetto: 260_000,
        totaleDebiti: 410_000,
        debitiBanche: 110_000,
        debitiFornitori: 200_000,
        debitiTributari: 22_000,
        debitiPrevidenziali: 24_000,
        passivoCorrente: 310_000,
        creditiClienti: 170_000,
      }),
    },
    debiti: [
      {
        voce: 'Contributi previdenziali scaduti',
        importo: 12_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
      {
        voce: 'Sanzioni civili contributive',
        importo: 1_500,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
    ],
    soglie: {
      conLavoratori: true,
      contributiScaduti: 12_000,
      contributiDovutiAnnoPrecedente: 250_000,
      annoContributiDovuti: 2025,
      volumeAffari: 950_000,
      ritardoOltre90Giorni: false,
      periodiInRitardo: 0,
    },
    screening: screening(
      [
        {
          numero: '1',
          titolo: 'Gestione del credito',
          domande: [
            {
              id: 'D1.1',
              domanda:
                'L’impresa ha definito un piano di rientro per la posizione debitoria verso l’ente?',
              risposta: true,
            },
            {
              id: 'D1.2',
              domanda: 'Le rate scadute sono state versate nei termini?',
              risposta: true,
            },
            {
              id: 'D1.3',
              domanda: 'La posizione debitoria è stata riconciliata con l’ente?',
              risposta: true,
            },
          ],
        },
        {
          numero: '2',
          titolo: 'Vigilanza documentale',
          domande: [
            {
              id: 'D2.1',
              domanda: 'I bilanci degli ultimi tre esercizi risultano depositati?',
              risposta: true,
            },
            {
              id: 'D2.2',
              domanda: 'La visura non riporta procedure concorsuali in corso?',
              risposta: true,
            },
            {
              id: 'D2.3',
              domanda: 'Le comunicazioni verso l’ente risultano aggiornate?',
              risposta: true,
            },
          ],
        },
      ],
      `L’esposizione contributiva di 12.000 euro resta ampiamente sotto la soglia di segnalazione applicabile e non risultano ritardi oltre i 90 giorni.\n\nIl bilancio 2025 mostra un patrimonio netto di 300.000 euro e nessun indice diagnostico oltre la soglia di riferimento. Il piano di rientro è rispettato e la documentazione è aggiornata. Con i dati disponibili non emergono criticità.`
    ),
    visura: visura(
      {
        ragioneSociale: 'Logistica Padana Demo S.r.l.',
        codiceFiscale: '00000000103',
        formaGiuridica: 'Società a responsabilità limitata',
        indirizzo: 'Via della Logistica 41',
        citta: 'Piacenza',
        provincia: 'PC',
        cap: '29122',
        capitaleSociale: 150_000,
        annoCostituzione: 2015,
        rappresentante: 'Chiara Esempio',
        ruoloRappresentante: 'Amministratrice unica',
      },
      'Trasporto merci conto terzi e gestione di magazzini.',
      31
    ),
    rango: 'PRIVILEGIATO',
    tipoIstruttoria: 'CRAM_DOWN',
    scenario: 'Cram down — Logistica Padana Demo',
    scenarioPrecedente: 'Proposta di accordo di ristrutturazione — Logistica Padana Demo',
    dataDepositoProposta: '2026-10-21',
  },
  {
    // La quarta posizione è quella che l'utente ha chiesto: un'azienda
    // completa nei dati ma senza un percorso già deciso. Serve a mostrare
    // che la piattaforma non riconosce solo i tre casi preparati: chiede
    // che cosa ha in mano l'azienda e si adatta alla risposta.
    ragioneSociale: 'Cantieri Brianza Demo S.r.l.',
    codiceFiscale: '00000000104',
    partitaIva: '00000000104',
    codiceAteco: '41.20.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via del Lambro 22',
    citta: 'Monza',
    provincia: 'MB',
    cap: '20900',
    capitaleSociale: 200_000,
    rappresentante: 'Marco Esempio',
    ruoloRappresentante: 'Amministratore unico',
    numeroRea: 'MB-001104',
    pec: 'cantieri.brianza.demo@pec.esempio.it',
    annoCostituzione: 2011,
    dataVerifica: '2026-11-02',
    profilo: 'GIALLO',
    finanziario: {
      anno: 2025,
      corrente: dati({
        ricaviVendite: 1_600_000,
        valoreProduzione: 1_750_000,
        costiProduzione: 1_680_000,
        ebit: 70_000,
        ammortamenti: 40_000,
        ebitda: 110_000,
        oneriFinanziari: 45_000,
        utileEsercizio: 10_000,
        totaleAttivo: 1_300_000,
        attivoCircolante: 700_000,
        disponibilitaLiquide: 25_000,
        immobilizzazioni: 600_000,
        patrimonioNetto: 120_000,
        totaleDebiti: 1_180_000,
        debitiBanche: 500_000,
        debitiFornitori: 450_000,
        debitiTributari: 90_000,
        debitiPrevidenziali: 140_000,
        passivoCorrente: 800_000,
        creditiClienti: 450_000,
      }),
      precedente: dati({
        ricaviVendite: 1_720_000,
        valoreProduzione: 1_880_000,
        costiProduzione: 1_780_000,
        ebit: 100_000,
        ammortamenti: 38_000,
        ebitda: 138_000,
        oneriFinanziari: 42_000,
        utileEsercizio: 30_000,
        totaleAttivo: 1_350_000,
        attivoCircolante: 740_000,
        disponibilitaLiquide: 60_000,
        immobilizzazioni: 610_000,
        patrimonioNetto: 150_000,
        totaleDebiti: 1_200_000,
        debitiBanche: 480_000,
        debitiFornitori: 470_000,
        debitiTributari: 85_000,
        debitiPrevidenziali: 135_000,
        passivoCorrente: 810_000,
        creditiClienti: 480_000,
      }),
    },
    debiti: [
      {
        voce: 'Contributi previdenziali scaduti',
        importo: 60_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
      {
        voce: 'Sanzioni civili contributive',
        importo: 10_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa del triage',
      },
    ],
    soglie: {
      conLavoratori: true,
      contributiScaduti: 60_000,
      contributiDovutiAnnoPrecedente: 350_000,
      annoContributiDovuti: 2025,
      volumeAffari: 1_750_000,
      ritardoOltre90Giorni: false,
      periodiInRitardo: 0,
    },
    screening: screening(
      [
        {
          numero: '1',
          titolo: 'Gestione del credito',
          domande: [
            {
              id: 'D1.1',
              domanda:
                'L’impresa ha definito un piano di rientro per la posizione debitoria verso l’ente?',
              risposta: true,
            },
            {
              id: 'D1.2',
              domanda: 'Le rate scadute sono state versate nei termini?',
              risposta: false,
              nota: 'Una rata è stata versata in ritardo, senza superare i 90 giorni.',
            },
            {
              id: 'D1.3',
              domanda: 'La posizione debitoria è stata riconciliata con l’ente?',
              risposta: true,
            },
          ],
        },
        {
          numero: '2',
          titolo: 'Vigilanza documentale',
          domande: [
            {
              id: 'D2.1',
              domanda: 'I bilanci degli ultimi tre esercizi risultano depositati?',
              risposta: true,
            },
            {
              id: 'D2.2',
              domanda: 'La visura non riporta procedure concorsuali in corso?',
              risposta: true,
            },
            {
              id: 'D2.3',
              domanda: 'Le comunicazioni verso l’ente risultano aggiornate?',
              risposta: false,
              nota: 'L’ultima comunicazione documentata risale al primo semestre 2026.',
            },
          ],
        },
      ],
      `L’impresa edile presenta un’esposizione contributiva di 60.000 euro, sotto la soglia di segnalazione applicabile, e un ritardo non superiore a 90 giorni. Il bilancio 2025 mostra un patrimonio netto di 120.000 euro in riduzione rispetto all’esercizio precedente e un indice diagnostico oltre la soglia di riferimento.\n\nNon risultano procedure concorsuali in corso. La posizione è ancora aperta: la documentazione disponibile non basta a dire se l’azienda stia seguendo una proposta, una liquidazione o un’altra soluzione. Il percorso va chiesto e verificato con i documenti che l’azienda depositerà.`
    ),
    visura: visura(
      {
        ragioneSociale: 'Cantieri Brianza Demo S.r.l.',
        codiceFiscale: '00000000104',
        formaGiuridica: 'Società a responsabilità limitata',
        indirizzo: 'Via del Lambro 22',
        citta: 'Monza',
        provincia: 'MB',
        cap: '20900',
        capitaleSociale: 200_000,
        annoCostituzione: 2011,
        rappresentante: 'Marco Esempio',
        ruoloRappresentante: 'Amministratore unico',
      },
      'Costruzione di edifici residenziali e commerciali.',
      38
    ),
    rango: 'CHIROGRAFARIO',
    tipoIstruttoria: 'DA_CHIEDERE',
    scenario: 'Valutazione aperta — Cantieri Brianza Demo',
    dataDepositoProposta: '2026-11-02',
    aperta: true,
  },
];

/**
 * La quinta azienda del set demo, ferma alla verifica di salute.
 *
 * I dati bastano a riaprire il triage e a leggere l'indicatore: anagrafica
 * completa, contributi e sanzioni, soglie dichiarate. Mancano di proposito lo
 * screening, il bilancio XBRL e lo scenario — sono i passi che l'operatore deve
 * ancora decidere se affrontare.
 */
export const TRIAGE_DEMO: AziendaTriageDemo = {
  ragioneSociale: 'Impianti Adriatica Demo S.r.l.',
  codiceFiscale: '00000000105',
  partitaIva: '00000000105',
  codiceAteco: '43.21.01',
  formaGiuridica: 'Società a responsabilità limitata',
  indirizzo: 'Via del Porto 12',
  citta: 'Pescara',
  provincia: 'PE',
  cap: '65122',
  capitaleSociale: 80_000,
  rappresentante: 'Giulia Esempio',
  ruoloRappresentante: 'Amministratrice unica',
  numeroRea: 'PE-001105',
  pec: 'impianti.adriatica.demo@pec.esempio.it',
  annoCostituzione: 2013,
  dataVerifica: '2026-11-05',
  profilo: 'ATTENZIONE_MINIMA',
  debiti: [
    {
      voce: 'Contributi previdenziali scaduti',
      importo: 45_000,
      tipo: 'DEBITO',
      nota: 'Posizione dimostrativa del triage',
    },
    {
      voce: 'Sanzioni civili contributive',
      importo: 6_000,
      tipo: 'DEBITO',
      nota: 'Posizione dimostrativa del triage',
    },
  ],
  soglie: {
    conLavoratori: true,
    contributiScaduti: 45_000,
    contributiDovutiAnnoPrecedente: 280_000,
    annoContributiDovuti: 2025,
    volumeAffari: 1_050_000,
    ritardoOltre90Giorni: false,
    periodiInRitardo: 0,
  },
};

/** Quante aziende servono, come minimo, perché il set demo sia completo. */
export const AZIENDE_PERCORSO_DEMO = PERCORSO_DEMO.length + 1;

/** Il bundle di indici di un periodo: usato dai test e dal caricamento. */
export function bundleDemo(azienda: AziendaPercorsoDemo, periodo: 'corrente' | 'precedente') {
  return costruisciBundleIndici(azienda.finanziario[periodo]);
}
