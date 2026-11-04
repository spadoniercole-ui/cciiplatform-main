// src/lib/demo/setGiudice.ts
//
// I DUE SET DEMO PER IL PROVVEDIMENTO DEL GIUDICE (0.171.0): tre aziende
// per la liquidazione giudiziale, tre per il cram down. Sono dati inventati,
// e devono restare riconoscibili come tali: ragioni sociali con «Demo»,
// identificativi fittizi, tribunali e numeri di ruolo marcati «esempio».
//
// UNA SOLA FONTE. Lo stesso oggetto genera le righe della posizione
// debitoria, i crediti del provvedimento, il testo dei PDF e il confronto
// già calcolato. Se i numeri del decreto e quelli dell'ente venissero
// scritti due volte, la demo mostrerebbe difformità casuali e l'analisi
// sembrerebbe sbagliata mentre sta solo leggendo due documenti che non si
// parlano. Le difformità qui sono volute e dichiarate: ogni azienda ne ha
// una diversa, per mostrare i casi che il percorso deve saper trattare.
//
// Logica pura, nessun database e nessun React.

import type { RangoCredito } from '@/lib/triage/scenari';
import type { TipoAttoGiudice, LetturaProvvedimento } from '@/lib/giudice/lettura';
import { confrontaProvvedimento, type ConfrontoProvvedimento } from '@/lib/giudice/confronto';

export type TipoSetDemo = 'LIQUIDAZIONE' | 'CRAM_DOWN';

export const ETICHETTA_SET: Record<TipoSetDemo, string> = {
  LIQUIDAZIONE: 'Liquidazione giudiziale',
  CRAM_DOWN: 'Cram down',
};

export const DESCRIZIONE_SET: Record<TipoSetDemo, string> = {
  LIQUIDAZIONE:
    'Tre aziende con decreto di apertura, stato passivo e relazione del curatore: crediti ammessi in parte, uno non ammesso e un rango da chiarire.',
  CRAM_DOWN:
    'Tre aziende con dispositivo di omologazione, attestazione e piano: percentuali di soddisfacimento diverse, un caso senza difformità e uno con un credito in più.',
};

export interface DebitoDemo {
  voce: string;
  importo: number;
  /** Categoria della posizione debitoria dell'ente. */
  tipo: string;
}

export interface CreditoDemo {
  voce: string;
  importo: number;
  rango: RangoCredito;
  privilegio: string | null;
  /** Percentuale di realizzo (liquidazione) o di soddisfacimento (cram down). */
  percentualeRealizzo: number;
}

export interface AttoDemo {
  tipo: Exclude<TipoAttoGiudice, 'PROPOSTA'>;
  numero: string;
  tribunale: string;
  sezione: string;
  data: string;
  giudice: string;
  ausiliario: string;
  crediti: CreditoDemo[];
  speseProceduraPct: number;
  tempiMesi: number;
  note: string[];
}

export interface AziendaDemo {
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
  debiti: DebitoDemo[];
  atto: AttoDemo;
}

export interface DocumentoDemo {
  nome: string;
  titolo: string;
  righe: string[];
}

const eur = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

const rigaCredito = (c: CreditoDemo, tipo: AttoDemo['tipo']) =>
  `${c.voce} — ${eur(c.importo)} — ${c.rango}${c.privilegio ? ` (${c.privilegio})` : ''} — ${
    tipo === 'DECRETO_LIQUIDAZIONE' ? 'realizzo previsto' : 'soddisfacimento'
  } ${c.percentualeRealizzo}%`;

const intestazione = (a: AziendaDemo): string[] => [
  'DOCUMENTO DEMO — NON VALIDO AI FINI DI LEGGE',
  'Documento di esempio generato dalla piattaforma per collaudare il percorso.',
  `${a.atto.tribunale} — ${a.atto.sezione}`,
  `RG n. ${a.atto.numero} (esempio) — data ${a.atto.data.split('-').reverse().join('/')}`,
  `Giudice delegato: ${a.atto.giudice}`,
  `${a.atto.tipo === 'DECRETO_LIQUIDAZIONE' ? 'Curatore' : 'Commissario giudiziale'}: ${a.atto.ausiliario}`,
  `Impresa: ${a.ragioneSociale} — C.F. ${a.codiceFiscale} — P.IVA ${a.partitaIva}`,
  '',
];

/**
 * I documenti che l'azienda allega al provvedimento. Sono tre per ogni
 * azienda, con lo stesso contenuto numerico del modello: il decreto o il
 * dispositivo, l'atto che lo correda e la relazione dell'ausiliario.
 */
export function documentiPer(a: AziendaDemo, tipo: TipoSetDemo): DocumentoDemo[] {
  const base = intestazione(a);
  const crediti = a.atto.crediti.map((c) => rigaCredito(c, a.atto.tipo));

  if (tipo === 'LIQUIDAZIONE') {
    return [
      {
        nome: `01_decreto_apertura_${a.codiceFiscale}.pdf`,
        titolo: 'Decreto di apertura della liquidazione giudiziale',
        righe: [
          ...base,
          'IL TRIBUNALE',
          'Visto il ricorso depositato e la documentazione allegata, dichiara aperta la liquidazione giudiziale.',
          `Nomina curatore ${a.atto.ausiliario} e fissa in ${a.atto.tempiMesi} mesi la durata stimata della procedura.`,
          `Le spese di procedura sono stimate nella misura del ${a.atto.speseProceduraPct}% del realizzo lordo.`,
          '',
          'CREDITI AMMESSI AL PASSIVO',
          ...crediti,
          '',
          'Il presente decreto è un documento di esempio: non è stato emesso da alcuna autorità.',
        ],
      },
      {
        nome: `02_stato_passivo_${a.codiceFiscale}.pdf`,
        titolo: 'Stato passivo — elenco dei crediti ammessi',
        righe: [
          ...base,
          'ELENCO DEI CREDITI AMMESSI',
          'Voce — importo ammesso — rango — realizzo previsto',
          ...crediti,
          '',
          `Totale crediti ammessi: ${eur(a.atto.crediti.reduce((s, c) => s + c.importo, 0))}`,
          `Spese di procedura: ${a.atto.speseProceduraPct}% del realizzo lordo.`,
          '',
          ...a.atto.note.map((n) => `Nota: ${n}`),
        ],
      },
      {
        nome: `03_relazione_curatore_${a.codiceFiscale}.pdf`,
        titolo: 'Relazione del curatore — attivo e realizzo',
        righe: [
          ...base,
          'RELAZIONE DEL CURATORE',
          `L’attivo stimato è compatibile con un realizzo del ${a.atto.crediti[0]?.percentualeRealizzo ?? 0}% per i crediti privilegiati e del ${a.atto.crediti[1]?.percentualeRealizzo ?? 0}% per i chirografari.`,
          `La procedura dovrebbe chiudersi in circa ${a.atto.tempiMesi} mesi.`,
          '',
          'CREDITI E PROSPETTIVE DI RECUPERO',
          ...crediti,
          '',
          'La relazione è redatta a soli fini dimostrativi e non descrive una procedura reale.',
        ],
      },
    ];
  }

  return [
    {
      nome: `01_dispositivo_omologazione_${a.codiceFiscale}.pdf`,
      titolo: 'Dispositivo di omologazione del cram down',
      righe: [
        ...base,
        'IL TRIBUNALE',
        'Visto il piano e l’attestazione del professionista, omologa l’accordo di ristrutturazione con efficacia estesa.',
        `La soddisfazione dei creditori è prevista in ${a.atto.tempiMesi} mesi.`,
        `Le spese di procedura sono stimate nella misura del ${a.atto.speseProceduraPct}% del realizzo lordo.`,
        '',
        'CREDITI RICONOSCIUTI E PERCENTUALI DI SODDISFACIMENTO',
        ...crediti,
        '',
        'Il presente dispositivo è un documento di esempio: non è stato emesso da alcuna autorità.',
      ],
    },
    {
      nome: `02_attestazione_professionista_${a.codiceFiscale}.pdf`,
      titolo: 'Attestazione del professionista',
      righe: [
        ...base,
        'ATTESTAZIONE',
        `Il professionista attesta che il piano è fattibile e che ai creditori è offerto un trattamento non deteriore rispetto alla liquidazione.`,
        `Le percentuali di soddisfacimento sono quelle indicate nel dispositivo: ${a.atto.crediti.map((c) => `${c.voce} ${c.percentualeRealizzo}%`).join('; ')}.`,
        '',
        'CONFRONTO CON LA LIQUIDAZIONE',
        ...crediti,
        '',
        ...a.atto.note.map((n) => `Nota: ${n}`),
      ],
    },
    {
      nome: `03_piano_ristrutturazione_${a.codiceFiscale}.pdf`,
      titolo: 'Piano di ristrutturazione — sintesi',
      righe: [
        ...base,
        'SINTESI DEL PIANO',
        `Il piano prevede il pagamento dei crediti secondo le percentuali omologate in ${a.atto.tempiMesi} mesi.`,
        `Le spese di procedura assorbono il ${a.atto.speseProceduraPct}% del realizzo lordo.`,
        '',
        'TRATTAMENTO DEI CREDITI',
        ...crediti,
        '',
        'Il piano è un documento di esempio e non rappresenta una situazione aziendale reale.',
      ],
    },
  ];
}

/** La lettura che la piattaforma avrebbe prodotto sui documenti demo. */
export function letturaDaDemo(a: AziendaDemo): LetturaProvvedimento {
  return {
    crediti: a.atto.crediti.map((c) => ({
      voce: c.voce,
      importo: c.importo,
      rango: c.rango,
      privilegio: c.privilegio,
      percentualeRealizzo: c.percentualeRealizzo,
      documento:
        documentiPer(a, a.atto.tipo === 'DECRETO_LIQUIDAZIONE' ? 'LIQUIDAZIONE' : 'CRAM_DOWN')[0]
          ?.nome ?? null,
      passo: null,
    })),
    speseProceduraPct: a.atto.speseProceduraPct,
    tempiMesi: a.atto.tempiMesi,
    dataAtto: a.atto.data,
    note: a.atto.note,
  };
}

/** Il confronto già calcolato: la schermata demo si apre senza chiamare l'AI. */
export function confrontoDaDemo(a: AziendaDemo): ConfrontoProvvedimento {
  return confrontaProvvedimento(
    a.debiti.map((d) => ({ voce: d.voce, importo: d.importo })),
    letturaDaDemo(a),
    a.atto.tipo
  );
}

export function nomeScenarioDemo(a: AziendaDemo): string {
  return `${
    a.atto.tipo === 'DECRETO_LIQUIDAZIONE' ? 'Liquidazione giudiziale' : 'Cram down'
  } — ${a.ragioneSociale}`;
}

// ---------------------------------------------------------------------------
// I SEI CASI
// ---------------------------------------------------------------------------

const LIQUIDAZIONE: AziendaDemo[] = [
  {
    ragioneSociale: 'Calzaturificio Brenta Demo S.r.l.',
    codiceFiscale: '00000000001',
    partitaIva: '00000000001',
    codiceAteco: '15.20.10',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via delle Industrie 14',
    citta: 'Vigevano',
    provincia: 'PV',
    cap: '27029',
    capitaleSociale: 120_000,
    rappresentante: 'Mario Esempio',
    ruoloRappresentante: 'Amministratore unico',
    numeroRea: 'PV-000001',
    pec: 'brenta.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali 2023', importo: 48_000, tipo: 'DEBITO' },
      { voce: 'Sanzioni civili contributive', importo: 9_500, tipo: 'DEBITO' },
      { voce: 'Contributi in contenzioso 2022', importo: 22_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'DECRETO_LIQUIDAZIONE',
      numero: '101/2026',
      tribunale: 'Tribunale di Vigevano',
      sezione: 'Sezione civile e crisi d’impresa (esempio)',
      data: '2026-09-18',
      giudice: 'Dott.ssa Anna Esempio',
      ausiliario: 'Dott. Paolo Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 40_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale art. 2751-bis c.c.',
          percentualeRealizzo: 35,
        },
        {
          voce: 'Sanzioni civili contributive',
          importo: 9_500,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 10,
        },
      ],
      speseProceduraPct: 12,
      tempiMesi: 42,
      note: ['Lo stato passivo non riporta il credito in contenzioso 2022.'],
    },
  },
  {
    ragioneSociale: 'Tessitura Serica Comasca Demo S.p.A.',
    codiceFiscale: '00000000002',
    partitaIva: '00000000002',
    codiceAteco: '13.20.00',
    formaGiuridica: 'Società per azioni',
    indirizzo: 'Via Setificio 8',
    citta: 'Como',
    provincia: 'CO',
    cap: '22100',
    capitaleSociale: 500_000,
    rappresentante: 'Laura Esempio',
    ruoloRappresentante: 'Amministratrice delegata',
    numeroRea: 'CO-000002',
    pec: 'tessitura.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali 2022', importo: 65_000, tipo: 'DEBITO' },
      { voce: 'Premi assicurativi INAIL', importo: 12_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'DECRETO_LIQUIDAZIONE',
      numero: '204/2026',
      tribunale: 'Tribunale di Como',
      sezione: 'Sezione crisi d’impresa (esempio)',
      data: '2026-08-07',
      giudice: 'Dott. Luca Esempio',
      ausiliario: 'Dott.ssa Sara Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 65_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale',
          percentualeRealizzo: 28,
        },
        {
          voce: 'Premi assicurativi INAIL',
          importo: 12_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio speciale',
          percentualeRealizzo: 28,
        },
        {
          voce: 'Rivalsa spese di procedura',
          importo: 3_000,
          rango: 'PREDEDUCIBILE',
          privilegio: null,
          percentualeRealizzo: 100,
        },
      ],
      speseProceduraPct: 10,
      tempiMesi: 36,
      note: ['Il credito per rivalsa non risulta nella posizione dell’ente.'],
    },
  },
  {
    ragioneSociale: 'Costruzioni Adriatica Demo S.r.l.',
    codiceFiscale: '00000000003',
    partitaIva: '00000000003',
    codiceAteco: '41.20.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via del Porto 52',
    citta: 'Pescara',
    provincia: 'PE',
    cap: '65100',
    capitaleSociale: 90_000,
    rappresentante: 'Giuseppe Esempio',
    ruoloRappresentante: 'Amministratore unico',
    numeroRea: 'PE-000003',
    pec: 'adriatica.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali', importo: 30_000, tipo: 'DEBITO' },
      { voce: 'Sanzioni civili', importo: 6_000, tipo: 'DEBITO' },
      { voce: 'Contributi 2021', importo: 14_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'DECRETO_LIQUIDAZIONE',
      numero: '77/2026',
      tribunale: 'Tribunale di Pescara',
      sezione: 'Sezione fallimentare (esempio)',
      data: '2026-10-02',
      giudice: 'Dott.ssa Elena Esempio',
      ausiliario: 'Dott. Franco Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 34_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale',
          percentualeRealizzo: 30,
        },
        {
          voce: 'Sanzioni civili',
          importo: 6_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 8,
        },
      ],
      speseProceduraPct: 15,
      tempiMesi: 48,
      note: ['Il credito contributivo 2021 non è stato ammesso.'],
    },
  },
];

const CRAM_DOWN: AziendaDemo[] = [
  {
    ragioneSociale: 'Officine Meccaniche Venete Demo S.r.l.',
    codiceFiscale: '00000000004',
    partitaIva: '00000000004',
    codiceAteco: '25.62.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via dell’Artigianato 3',
    citta: 'Vicenza',
    provincia: 'VI',
    cap: '36100',
    capitaleSociale: 200_000,
    rappresentante: 'Chiara Esempio',
    ruoloRappresentante: 'Amministratrice unica',
    numeroRea: 'VI-000004',
    pec: 'officine.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali', importo: 120_000, tipo: 'DEBITO' },
      { voce: 'Sanzioni civili', importo: 25_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'CRAM_DOWN',
      numero: '315/2026',
      tribunale: 'Tribunale di Vicenza',
      sezione: 'Sezione crisi d’impresa (esempio)',
      data: '2026-09-29',
      giudice: 'Dott. Roberto Esempio',
      ausiliario: 'Dott.ssa Marta Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 100_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale',
          percentualeRealizzo: 55,
        },
        {
          voce: 'Sanzioni civili',
          importo: 20_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 20,
        },
      ],
      speseProceduraPct: 8,
      tempiMesi: 60,
      note: ['Il dispositivo riduce il credito contributivo rispetto alla posizione dell’ente.'],
    },
  },
  {
    ragioneSociale: 'Agroalimentare Salento Demo S.r.l.',
    codiceFiscale: '00000000005',
    partitaIva: '00000000005',
    codiceAteco: '10.30.00',
    formaGiuridica: 'Società a responsabilità limitata',
    indirizzo: 'Via degli Ulivi 21',
    citta: 'Lecce',
    provincia: 'LE',
    cap: '73100',
    capitaleSociale: 150_000,
    rappresentante: 'Antonio Esempio',
    ruoloRappresentante: 'Amministratore unico',
    numeroRea: 'LE-000005',
    pec: 'agro.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali', importo: 54_000, tipo: 'DEBITO' },
      { voce: 'Sanzioni civili', importo: 18_000, tipo: 'DEBITO' },
      { voce: 'Contributi in contenzioso', importo: 7_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'CRAM_DOWN',
      numero: '88/2026',
      tribunale: 'Tribunale di Lecce',
      sezione: 'Sezione crisi d’impresa (esempio)',
      data: '2026-07-15',
      giudice: 'Dott.ssa Paola Esempio',
      ausiliario: 'Dott. Sergio Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 54_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale',
          percentualeRealizzo: 40,
        },
        {
          voce: 'Sanzioni civili',
          importo: 18_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 15,
        },
        {
          voce: 'Contributi in contenzioso',
          importo: 7_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 5,
        },
      ],
      speseProceduraPct: 9,
      tempiMesi: 54,
      note: [],
    },
  },
  {
    ragioneSociale: 'Logistica Tirrena Demo S.p.A.',
    codiceFiscale: '00000000006',
    partitaIva: '00000000006',
    codiceAteco: '52.29.00',
    formaGiuridica: 'Società per azioni',
    indirizzo: 'Via del Molo 9',
    citta: 'Livorno',
    provincia: 'LI',
    cap: '57100',
    capitaleSociale: 800_000,
    rappresentante: 'Francesca Esempio',
    ruoloRappresentante: 'Amministratrice delegata',
    numeroRea: 'LI-000006',
    pec: 'logistica.demo@pec.esempio.it',
    debiti: [
      { voce: 'Contributi previdenziali', importo: 88_000, tipo: 'DEBITO' },
      { voce: 'Sanzioni civili', importo: 11_000, tipo: 'DEBITO' },
    ],
    atto: {
      tipo: 'CRAM_DOWN',
      numero: '142/2026',
      tribunale: 'Tribunale di Livorno',
      sezione: 'Sezione crisi d’impresa (esempio)',
      data: '2026-08-22',
      giudice: 'Dott. Marco Esempio',
      ausiliario: 'Dott.ssa Ilaria Esempio',
      crediti: [
        {
          voce: 'Contributi previdenziali',
          importo: 80_000,
          rango: 'PRIVILEGIATO',
          privilegio: 'privilegio generale',
          percentualeRealizzo: 45,
        },
        {
          voce: 'Sanzioni civili',
          importo: 11_000,
          rango: 'CHIROGRAFARIO',
          privilegio: null,
          percentualeRealizzo: 25,
        },
        {
          voce: 'Rimborso spese di procedura',
          importo: 2_500,
          rango: 'PREDEDUCIBILE',
          privilegio: null,
          percentualeRealizzo: 100,
        },
      ],
      speseProceduraPct: 7,
      tempiMesi: 48,
      note: ['Il rimborso spese non risulta nella posizione dell’ente.'],
    },
  },
];

export const SET_DEMO: Record<TipoSetDemo, AziendaDemo[]> = {
  LIQUIDAZIONE,
  CRAM_DOWN,
};

export function setDemoValido(valore: unknown): valore is TipoSetDemo {
  return valore === 'LIQUIDAZIONE' || valore === 'CRAM_DOWN';
}
