// src/lib/demo/percorsoEnte.ts
//
// IL PERCORSO DEMO DI UNO SPAZIO ENTE (0.256.0): TRE AZIENDE, TRE TAPPE.
//
//   Meccanica Valsesia — completa: amministrativa, contabile e aziendale,
//                        con lo scenario dell'accordo e quello del cram down;
//   Tessitura Lario    — si ferma alla contabile: bilanci, visura e parametri,
//                        nessuno scenario e nessuna verifica aziendale;
//   Logistica Padana   — si ferma all'amministrativa: anagrafica, posizioni,
//                        soglie, e nient'altro (vedi TRIAGE_DEMO).
//
// Prima erano cinque: le altre due mostravano varianti che non aggiungevano
// un passo nuovo e rendevano ambiguo dove finisse ogni percorso.
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
  /** Categoria di lavorazione: dice al triage quale reparto deve agire. */
  categoria?: string;
  /** Periodo di competenza nella forma della certificazione dei debiti. */
  periodo?: string;
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
  /**
   * FIN DOVE ARRIVA LA DEMO PER QUESTA AZIENDA (0.256.0).
   *
   * Tre aziende, tre tappe: una completa (verifiche e scenari), una che si
   * ferma alla contabile, una che si ferma all'amministrativa. Il caricamento
   * legge questo campo e non crea i passi che non ci sono: una demo che finge
   * di aver fatto la contabile senza bilanci sarebbe la confusione che si
   * vuole togliere.
   */
  profondita?: 'COMPLETA' | 'CONTABILE';
  scenario: string;
  /** Nome usato prima della 0.174.0, per rinominare senza duplicare. */
  scenarioPrecedente?: string;
  dataDepositoProposta: string;
  /**
   * LE VERIFICHE DELL’AZIENDA (0.230.0).
   *
   * La verifica amministrativa è obbligatoria: c’è sempre, su ogni azienda,
   * perché è quella che dice quanto l’ente vanta. La contabile e l’aziendale
   * sono facoltative, e la demo ne mostra una senza per far vedere che il
   * documento lo dichiara invece di inventare una sezione. NON dipendono dalla
   * natura dello scenario: quella sta sullo scenario, e un’azienda può
   * valutare due atti diversi con le stesse verifiche già fatte.
   */
  verifiche?: {
    contabile?: boolean;
    aziendale?: boolean;
    /**
     * IL CORREDO DELLA CONTABILE (0.255.0).
     *
     * Visura storica e parametri dell'ente non sono la verifica: sono ciò che
     * la rende possibile. Senza, la contabile resta «in corso» anche quando i
     * bilanci ci sono, e nessuna azienda della demo arriva mai al ritratto
     * completo. Si dichiara qui, azienda per azienda, perché la demo mostra
     * anche posizioni a metà: il corredo non è un difetto di tutte.
     */
    corredoContabile?: { idEnte: string; campi: string[] };
    /**
     * LA FOTOGRAFIA È BASE DELLA PROPOSTA (0.255.0).
     *
     * È il segnale con cui si chiude la verifica aziendale. Prima il seed lo
     * deduceva dalla natura dello scenario: la posizione con l'accordo era
     * «fatta», quella con il decreto no, anche con le stesse due verifiche
     * pronte. Qui è un dato dell'azienda, dichiarato dove serve.
     */
    baseAziendale?: boolean;
  };
  /**
   * GLI ALTRI SCENARI DELLA STESSA AZIENDA (0.230.0).
   *
   * La differenziazione fra accordo, liquidazione e cram down è dello
   * scenario, non dell’azienda: un’impresa può valutare l’accordo e, in
   * parallelo, la liquidazione. La demo lo mostra su un’azienda, così
   * l’impostazione del sistema si vede e non si deduce.
   */
  scenariAggiuntivi?: { nome: string; tipoIstruttoria: TipoIstruttoria }[];
  /**
   * LE RIGHE DELLA PROPOSTA DELL'ACCORDO (0.233.0).
   *
   * Senza righe l'atto di accordo resta senza numeri: il report può dire che
   * esiste, non quanto offre all'ente. Le righe sono quelle che l'ente
   * leggerebbe davvero — una sola «rilevante per l'ente», la sua — e le altre
   * servono a mostrare il resto della proposta.
   */
  propostaCreditori?: {
    categoria: string;
    dovuto: number;
    offerta: number;
    modalita: 'UNICA_SOLUZIONE' | 'RATEALE';
    rate: number | null;
    rango: string;
    rilevanteEnte: boolean;
  }[];
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

const dati = (parziale: Partial<DatiFinanziariPeriodo>): DatiFinanziariPeriodo => {
  // IL COSTO DEL PERSONALE NELLA DEMO (0.239.2). I bilanci dimostrativi
  // dichiarano il personale come quota dei costi della produzione — 34%, di cui
  // salari e stipendi 26,5% e oneri sociali 7,5% — così la scomposizione del
  // B.9 si vede anche nella demo senza inventare un organico che non c’è. La
  // somma delle due voci è il totale del personale, al centesimo.
  const costi = parziale.costiProduzione ?? 0;
  const costiPersonale = Math.round(costi * 0.34);
  const salariStipendi = Math.round(costi * 0.265);
  return {
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
    costiPersonale,
    salariStipendi,
    oneriSociali: costiPersonale - salariStipendi,
    ...parziale,
  };
};

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
    profondita: 'COMPLETA',
    // La posizione completa ha il ritratto intero: corredo della contabile e
    // fotografia come base della proposta.
    verifiche: {
      corredoContabile: {
        idEnte: 'INPS',
        campi: ['3412880091', 'GS-0011401', '11301', 'PV-2026-0001', 'Vigevano'],
      },
      baseAziendale: true,
    },
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
    // Stessa azienda, stesse verifiche, un secondo atto in valutazione: è il
    // punto che la demo deve rendere visibile.
    scenariAggiuntivi: [
      { nome: 'Cram down — alternativa alla proposta', tipoIstruttoria: 'CRAM_DOWN' },
    ],
    // L'accordo offre all'ente il 55% di 245.000 euro (contributi più
    // sanzioni): 134.750 euro in cinque rate annuali. Il cram down, nello
    // stesso set, ammette 150.000 euro di contributi al 71,4% e 14.000 di
    // sanzioni al 40%, cioè 112.700 euro all'ente. Il confronto del report ha
    // così due termini veri, non due caselle vuote.
    propostaCreditori: [
      {
        categoria: 'INPS',
        dovuto: 245000,
        offerta: 55,
        modalita: 'RATEALE',
        rate: 5,
        rango: 'PRIVILEGIATO_GENERALE',
        rilevanteEnte: true,
      },
      {
        categoria: 'Banca Ipotecaria S.p.A.',
        dovuto: 300000,
        offerta: 100,
        modalita: 'UNICA_SOLUZIONE',
        rate: null,
        rango: 'PRIVILEGIATO_IPOTECA',
        rilevanteEnte: false,
      },
      {
        categoria: 'Fornitori chirografari',
        dovuto: 250000,
        offerta: 25,
        modalita: 'RATEALE',
        rate: 6,
        rango: 'CHIROGRAFARIO',
        rilevanteEnte: false,
      },
    ],
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
    // Arriva alla contabile e si ferma: niente scenario, niente verifica
    // aziendale. La tappa successiva è quella che l'operatore deve scegliere.
    profondita: 'CONTABILE',
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
      {
        // La crescita del credito dell’ente nel periodo che la contabile
        // ricostruisce: è quello che il ponte legge per differenza fra debito
        // dichiarato nel bilancio e debito accertato alla data (0.239.2).
        voce: 'Contributi 2026 maturati e non versati',
        importo: 60_000,
        tipo: 'DEBITO',
        nota: 'Posizione dimostrativa: la crescita del debito nel periodo ricostruito',
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
    // Tessitura arriva alla contabile e lì si ferma: ha la visura del
    // fascicolo demo e i parametri INPS, non la fotografia e non uno scenario.
    // È la tappa di mezzo, e il documento che si legge lo dice invece di
    // riempire le sezioni che mancano.
    verifiche: {
      corredoContabile: {
        idEnte: 'INPS',
        // Matricola INPS, posizione Gestione Separata, codice CSC, codice
        // autorizzazione (CA), sede competente: le etichette configurate
        // nello spazio demo.
        campi: ['4412880091', 'GS-0011442', '11305', 'CO-2026-0004', 'Como'],
      },
      baseAziendale: false,
    },
    rango: 'CHIROGRAFARIO',
    tipoIstruttoria: 'DA_CHIEDERE',
    scenario: 'Valutazione — Tessitura Lario Demo',
    dataDepositoProposta: '2026-10-06',
  },
];

/**
 * Le materie e le TS che rendono operativo il triage demo.
 *
 * Non sono un riempitivo: senza una materia reale, un titolo che la collega al
 * codice di partita e una lavorazione con un ufficio, il report per unità
 * operativa non ha dove andare. I codici 27, 25 e 81 e il loro significato
 * seguono il DettaglioRichiesta INPS (flusso Uniemens, note di rettifica,
 * verbali di evasione), così la demo mostra lo stesso percorso dei file veri.
 */
export interface TsTriageDemo {
  categoria: string;
  codice: string;
  descrizione: string;
  direttrice: string;
  prodotto: string;
  dipendenza: string;
  procedura: string;
  esito: string;
}

export interface MateriaTriageDemo {
  nome: string;
  codiciIndicativi: string;
  presuppostoGiuridico: string;
  ts: TsTriageDemo[];
}

export const MATERIE_TRIAGE_DEMO: MateriaTriageDemo[] = [
  {
    nome: 'Flussi Uniemens',
    codiciIndicativi: '27',
    presuppostoGiuridico:
      'Contributi previdenziali dichiarati nei flussi Uniemens e non versati nei termini.',
    ts: [
      {
        categoria: 'CONTRIBUTI',
        codice: '27',
        descrizione: 'Recupero contributi da flusso Uniemens non versato',
        direttrice: 'Gestione del credito',
        prodotto: 'Recupero contributi',
        dipendenza: 'Unità operativa contributi',
        procedura:
          'Verifica il flusso Uniemens, quantifica contributi e sanzioni, emetti la diffida e cura il recupero.',
        esito: 'Diffida e recupero',
      },
    ],
  },
  {
    nome: 'Note di rettifica',
    codiciIndicativi: '25',
    presuppostoGiuridico:
      'Rettifica dei flussi contributivi dichiarati e ricostruzione della posizione debitoria.',
    ts: [
      {
        categoria: 'CONTRIBUTI',
        codice: '25',
        descrizione: 'Lavorazione delle note di rettifica',
        direttrice: 'Gestione del credito',
        prodotto: 'Note di rettifica',
        dipendenza: 'Unità operativa contributi',
        procedura:
          'Acquisisci la nota di rettifica, ricostruisci il debito e aggiorna la posizione contributiva.',
        esito: 'Posizione rettificata',
      },
    ],
  },
  {
    nome: 'Verbali e vigilanza',
    codiciIndicativi: '81',
    presuppostoGiuridico:
      'Sanzioni civili e recupero delle somme accertate con verbale di evasione.',
    ts: [
      {
        categoria: 'SANZIONI',
        codice: '81',
        descrizione: 'Verbali di evasione e vigilanza',
        direttrice: 'Gestione del credito',
        prodotto: 'Vigilanza e sanzioni',
        dipendenza: 'Unità operativa vigilanza',
        procedura:
          'Esamina il verbale, contesta l’evasione, applica le sanzioni e cura il recupero.',
        esito: 'Provvedimento sanzionatorio',
      },
    ],
  },
];

/**
 * LA TERZA AZIENDA: FERMA ALLA VERIFICA AMMINISTRATIVA (0.256.0).
 *
 * Logistica Padana è la posizione che si apre e si ferma lì: anagrafica,
 * contributi e sanzioni con le TS che il triage sa lavorare, soglie
 * dichiarate. Mancano di proposito lo screening, il bilancio XBRL e lo
 * scenario, così il percorso mostra il primo passo concluso e i successivi
 * ancora da decidere. Non è una demo incompleta: è la tappa che il prodotto
 * deve saper dire.
 */
export const TRIAGE_DEMO: AziendaTriageDemo = {
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
  // Sotto soglia e senza ritardo oltre i 90 giorni: la verifica amministrativa
  // si chiude con «nessuna criticità», ed è il caso in cui la demo mostra che
  // l'ente può anche archiviare. Le tre posizioni restano instradate a due
  // uffici, così il triage non ha vuoti.
  profilo: 'ATTENZIONE_MINIMA',
  debiti: [
    {
      voce: 'TS 27 flusso Uniemens non versato',
      importo: 9_000,
      tipo: 'DEBITO',
      categoria: 'CONTRIBUTI',
      periodo: '202506 - 202512',
      nota: 'Posizione dimostrativa del triage — sotto soglia',
    },
    {
      voce: 'TS 25 nota di rettifica',
      importo: 3_000,
      tipo: 'DEBITO',
      categoria: 'CONTRIBUTI',
      periodo: '202506 - 202506',
      nota: 'Posizione dimostrativa del triage — rettifica dei flussi',
    },
    {
      voce: 'TS 81 Verbale evasione',
      importo: 1_500,
      tipo: 'DEBITO',
      categoria: 'SANZIONI',
      periodo: '2025',
      nota: 'Posizione dimostrativa del triage — segnalazione alla vigilanza',
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
};

/** Quante aziende servono, come minimo, perché il set demo sia completo. */
export const AZIENDE_PERCORSO_DEMO = PERCORSO_DEMO.length + 1;

/** Il bundle di indici di un periodo: usato dai test e dal caricamento. */
export function bundleDemo(azienda: AziendaPercorsoDemo, periodo: 'corrente' | 'precedente') {
  return costruisciBundleIndici(azienda.finanziario[periodo]);
}
