import { describe, expect, it } from 'vitest';
import { componiReportUo, nomeFileUo, versioneReportUo, type RigaVeraReportUo } from './reportUo';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import { RISCONTRO_VUOTO, type TitoloEnte } from '@/lib/titoliEnte/titoli';

const riga = (over: Partial<RigaVeraReportUo> = {}): RigaVeraReportUo => ({
  sezione: 'FLUSSI UNIEMENS',
  voce: 'TS 27 flusso Uniemens non versato',
  periodo: '202506 - 202506',
  stato: 'Aperto',
  trattamento: 'da_contabilizzare',
  importo: 1_200,
  ...over,
});

const lav = (over: Partial<LavorazioneMateria> = {}): LavorazioneMateria => ({
  id: 1,
  materiaId: 10,
  tipologia: 'Verifica del flusso',
  dipendenza: 'Ufficio contributi',
  procedura: 'Estrarre il flusso\nConfrontare con il versato',
  esito: 'Diffida',
  ordine: 0,
  ...over,
});

const titolo = (over: Partial<TitoloEnte> = {}): TitoloEnte => ({
  id: 1,
  codice: '27',
  atto: 'Flusso Uniemens',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  attivitaRecupero: null,
  dipendenza: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
  materiaId: 10,
  ...over,
});

const base = {
  azienda: 'Alfa Srl',
  dataVerifica: '2026-10-19',
  titoli: [titolo()],
  materie: [{ id: 10, nome: 'Flussi Uniemens' }],
  lavorazioni: [lav()],
};

describe('componiReportUo', () => {
  it('raggruppa per dipendenza e, dentro, per codice: lavorazioni e inadempienze', () => {
    const esito = componiReportUo({
      ...base,
      righe: [
        riga(),
        riga({
          voce: 'TS 27 flusso Uniemens non versato',
          periodo: '202507 - 202507',
          importo: 800,
        }),
        riga({ voce: 'TS 18 verbale di accertamento', importo: 500 }),
      ],
    });

    expect(esito.documenti).toHaveLength(1);
    const d = esito.documenti[0];
    expect(d.dipendenza).toBe('Ufficio contributi');
    // Il codice 18 non è fra i titoli dell'ente e non ha una materia: nessuna
    // dipendenza lo reclama, quindi resta fuori dal documento e si dichiara.
    expect(d.codici.map((c) => c.codice)).toEqual(['27']);
    expect(d.righe).toBe(2);
    expect(d.totale).toBe(2_000);
    expect(d.posizioniDaContabilizzare).toBe(2);
    expect(d.importoDaContabilizzare).toBe(2_000);
    expect(esito.senzaDipendenza).toEqual([
      { codice: '18', materia: null, materiaId: null, righe: 1, totale: 500 },
    ]);

    const c27 = d.codici.find((c) => c.codice === '27')!;
    expect(c27.materia).toBe('Flussi Uniemens');
    expect(c27.righe).toBe(2);
    expect(c27.importo).toBe(2_000);
    expect(c27.inadempienze[0].periodo).toBe('202506 - 202506');
    expect(c27.inadempienze.map((i) => i.trattamento)).toEqual([
      'Da contabilizzare',
      'Da contabilizzare',
    ]);
    expect(c27.lavorazioni).toEqual([
      {
        tipologia: 'Verifica del flusso',
        procedura: 'Estrarre il flusso\nConfrontare con il versato',
        esito: 'Diffida',
      },
    ]);
  });

  it('la dipendenza del codice vince su quella della materia', () => {
    const esito = componiReportUo({
      ...base,
      titoli: [titolo({ dipendenza: 'Ufficio legale' })],
      righe: [riga()],
    });
    expect(esito.documenti.map((d) => d.dipendenza)).toEqual(['Ufficio legale']);
  });

  it('un codice senza dipendenza si dichiara, non si attribuisce a un ufficio inventato', () => {
    const esito = componiReportUo({
      ...base,
      titoli: [],
      lavorazioni: [],
      righe: [riga()],
    });
    expect(esito.documenti).toHaveLength(0);
    expect(esito.senzaDipendenza).toEqual([
      { codice: '27', materia: null, materiaId: null, righe: 1, totale: 1_200 },
    ]);
  });

  // Un importo accessorio («interessi di mora») non porta un codice di partita,
  // ma la sezione e la descrizione dicono a quale materia appartiene: resta
  // nello stesso foglio del suo ufficio, sotto la materia e con le sue
  // lavorazioni. Prima spariva dal documento e finiva in un conteggio a parte.
  it('una voce senza codice entra sotto la materia, con le sue lavorazioni', () => {
    const esito = componiReportUo({
      ...base,
      righe: [riga(), riga({ voce: 'Interessi di mora', importo: 40 })],
    });
    const d = esito.documenti[0];
    expect(esito.senzaCodice).toEqual({ righe: 0, totale: 0 });
    expect(d.totale).toBe(1_240);
    expect(d.codici.map((c) => c.codice)).toEqual(['27', null]);

    const senzaCodice = d.codici.find((c) => c.codice === null)!;
    expect(senzaCodice.materia).toBe('Flussi Uniemens');
    expect(senzaCodice.importo).toBe(40);
    expect(senzaCodice.righe).toBe(1);
    expect(senzaCodice.inadempienze[0].voce).toBe('Interessi di mora');
    expect(senzaCodice.lavorazioni.map((l) => l.tipologia)).toEqual(['Verifica del flusso']);
  });

  it('una voce senza codice e senza materia riconoscibile resta fuori e si conta', () => {
    const esito = componiReportUo({
      ...base,
      righe: [riga({ sezione: 'DATI ACCESSORI', voce: 'Interessi di mora', importo: 40 }), riga()],
    });
    expect(esito.senzaCodice).toEqual({ righe: 1, totale: 40 });
    expect(esito.documenti[0].totale).toBe(1_200);
  });

  it('una voce senza codice in una materia senza ufficio si dichiara, non si inventa', () => {
    const esito = componiReportUo({
      ...base,
      materie: [{ id: 11, nome: 'Note di rettifica' }],
      lavorazioni: [],
      righe: [riga({ sezione: 'NOTE', voce: 'Note di rettifica non versate', importo: 300 })],
    });
    expect(esito.documenti).toHaveLength(0);
    expect(esito.senzaDipendenza).toEqual([
      { codice: null, materia: 'Note di rettifica', materiaId: 11, righe: 1, totale: 300 },
    ]);
  });

  it('le posizioni sospese non entrano nei totali ma sono dichiarate', () => {
    const esito = componiReportUo({
      ...base,
      righe: [riga(), riga({ stato: 'Sospeso', trattamento: 'ignora', importo: 9_000 })],
    });
    expect(esito.posizioniEscluse).toEqual({ righe: 1, totale: 9_000 });
    expect(esito.documenti[0].totale).toBe(1_200);
    expect(esito.documenti[0].posizioniEscluse).toEqual({ righe: 1, totale: 9_000 });
  });

  // Il report chiede all'ufficio di lavorare delle partite: quelle già in
  // contabilità non sono lavoro, e il foglio ne dichiara solo l'importo.
  it('le posizioni già contabilizzate restano fuori dall’elenco e sono dichiarate', () => {
    const esito = componiReportUo({
      ...base,
      righe: [
        riga(),
        riga({
          voce: 'F24 non presentato',
          stato: '',
          trattamento: 'contabilizzato',
          importo: 4_000,
        }),
        riga({
          voce: 'TS 25 nota di rettifica',
          stato: '',
          trattamento: 'contabilizzato',
          importo: 600,
        }),
      ],
    });

    const d = esito.documenti[0];
    expect(d.righe).toBe(1);
    expect(d.totale).toBe(1_200);
    expect(d.codici.map((c) => c.codice)).toEqual(['27']);
    expect(d.codici[0].inadempienze).toHaveLength(1);
    expect(d.contabilizzate).toEqual({ righe: 2, totale: 4_600 });
    expect(d.contabilizzateAdr).toEqual({ righe: 1, totale: 600 });
    expect(d.codiciAdr).toEqual(['25']);
    expect(esito.contabilizzate).toEqual({ righe: 2, totale: 4_600 });
  });

  it('un ufficio che ha solo posizioni già contabilizzate non riceve un report', () => {
    const esito = componiReportUo({
      ...base,
      righe: [riga({ stato: '', trattamento: 'contabilizzato', importo: 4_000 })],
    });
    expect(esito.documenti).toHaveLength(0);
    expect(esito.senzaDipendenza).toHaveLength(0);
    expect(esito.contabilizzate).toEqual({ righe: 1, totale: 4_000 });
  });

  // Il codice della natura non contraddice il file: una TS 27 che il V.E.R.A.
  // segna ancora da contabilizzare si lavora.
  it('una TS 27 da contabilizzare resta nel report', () => {
    const esito = componiReportUo({ ...base, righe: [riga()] });
    expect(esito.documenti[0].righe).toBe(1);
    expect(esito.contabilizzate).toEqual({ righe: 0, totale: 0 });
    expect(esito.contabilizzateAdr.righe).toBe(0);
  });

  it('elenca le lavorazioni della materia in ordine e conta i codici senza', () => {
    const esito = componiReportUo({
      ...base,
      // Il codice 18 ha dipendenza propria e una materia senza lavorazioni.
      titoli: [
        titolo(),
        titolo({ id: 2, codice: '18', materiaId: 99, dipendenza: 'Ufficio contributi' }),
      ],
      lavorazioni: [
        lav({ id: 2, tipologia: 'Contabilizzazione', ordine: 1, procedura: null, esito: null }),
        lav({ id: 1, tipologia: 'Verifica del flusso', ordine: 0 }),
      ],
      righe: [riga(), riga({ voce: 'TS 18 verbale', importo: 100 })],
    });
    const d = esito.documenti[0];
    expect(d.codici.find((c) => c.codice === '27')!.lavorazioni.map((l) => l.tipologia)).toEqual([
      'Verifica del flusso',
      'Contabilizzazione',
    ]);
    // Il codice 18 ha una materia (99) che non ha lavorazioni configurate.
    expect(esito.codiciSenzaLavorazione).toBe(1);
  });

  it('due uffici diversi producono due documenti', () => {
    const esito = componiReportUo({
      ...base,
      titoli: [titolo(), titolo({ id: 2, codice: '18', dipendenza: 'Ufficio legale' })],
      righe: [riga(), riga({ voce: 'TS 18 verbale', importo: 100 })],
    });
    expect(esito.documenti.map((d) => d.dipendenza)).toEqual([
      'Ufficio contributi',
      'Ufficio legale',
    ]);
    expect(esito.documenti.every((d) => d.codici.length === 1)).toBe(true);
  });

  it('la versione cambia con il contenuto e non con il nome del file', () => {
    const a = componiReportUo({ ...base, righe: [riga()] }).documenti[0];
    const b = componiReportUo({ ...base, righe: [riga({ importo: 1_201 })] }).documenti[0];
    const c = componiReportUo({ ...base, righe: [riga()] }).documenti[0];

    expect(a.versione).toBe(c.versione);
    expect(a.versione).not.toBe(b.versione);
    expect(a.versione).toMatch(/^3-[0-9a-f]{8}$/);

    const { versione, nomeFile: _nomeFile, ...contenuto } = a;
    expect(versioneReportUo(contenuto)).toBe(versione);
  });

  it('lo stesso ufficio scritto con maiuscole e spazi diversi resta un documento solo', () => {
    const esito = componiReportUo({
      ...base,
      titoli: [titolo(), titolo({ id: 2, codice: '25', materiaId: 11 })],
      materie: [
        { id: 10, nome: 'Flussi Uniemens' },
        { id: 11, nome: 'Gestione separata' },
      ],
      lavorazioni: [
        lav(),
        lav({
          id: 2,
          materiaId: 11,
          tipologia: 'Verifica della posizione',
          dipendenza: 'UFFICIO   CONTRIBUTI',
        }),
      ],
      righe: [riga(), riga({ voce: 'TS 25 gestione separata', importo: 300 })],
    });

    expect(esito.documenti).toHaveLength(1);
    expect(esito.documenti[0].dipendenza).toBe('Ufficio contributi');
    expect(esito.documenti[0].codici.map((c) => c.codice)).toEqual(['25', '27']);
    expect(esito.documenti[0].righe).toBe(2);
    expect(esito.documenti[0].totale).toBe(1_500);
  });

  it('il nome del file porta azienda, ufficio e versione', () => {
    expect(nomeFileUo('Alfa Srl', 'Ufficio contributi', '1-3f9a1c2b')).toBe(
      'report_uo_alfa_srl_ufficio_contributi_3f9a1c2b.pdf'
    );
    // Due uffici diversi non si sovrascrivono; due nomi uguali dopo la
    // normalizzazione sì, ed è la versione a distinguerli.
    expect(nomeFileUo('Alfa Srl', 'Città', '1-0000aaaa')).not.toBe(
      nomeFileUo('Alfa Srl', 'Citta', '1-0000bbbb')
    );
  });
});

describe('report UO: le sospese e la mappatura delle sezioni', () => {
  it('una posizione sospesa resta fuori dai totali ma va sul foglio del suo ufficio', () => {
    const esito = componiReportUo({
      ...base,
      righe: [
        riga(),
        riga({
          stato: 'Sospeso',
          trattamento: 'sospeso',
          importo: 6_990.45,
          periodo: '202601 - 202601',
        }),
      ],
    });

    const d = esito.documenti[0];
    expect(d.righe).toBe(1);
    expect(d.totale).toBe(1_200);
    expect(d.sospese).toHaveLength(1);
    expect(d.sospese[0].importo).toBe(6_990.45);
    expect(d.sospese[0].stato).toBe('Sospeso');
    expect(d.sospese[0].periodo).toBe('202601 - 202601');
    expect(esito.sospese).toEqual({ righe: 1, totale: 6_990.45 });
  });

  it('la mappatura su una categoria di debito manda la voce all’ufficio di quella categoria', () => {
    const esito = componiReportUo({
      azienda: 'Alfa Srl',
      dataVerifica: '2026-10-19',
      titoli: [],
      materie: [],
      lavorazioni: [],
      categorie: [
        { codice: 'CONTRIBUTI', dipendenza: 'Ufficio contributi', etichetta: 'Contributi INPS' },
      ],
      righe: [
        riga({
          sezione: 'Gestione artisti',
          voce: 'Compensi non versati',
          categoria: 'CONTRIBUTI',
          importo: 830,
        }),
      ],
    });

    expect(esito.documenti).toHaveLength(1);
    const d = esito.documenti[0];
    expect(d.dipendenza).toBe('Ufficio contributi');
    expect(d.codici[0].codice).toBeNull();
    expect(d.codici[0].materia).toBe('Contributi INPS');
    expect(d.totale).toBe(830);
    // La via è la categoria, non la materia: la scheda lo dice con questa parola.
    expect(d.codici[0].origini[0]).toMatchObject({
      voce: 'Compensi non versati',
      motivo: 'categoria',
    });
    expect(esito.senzaCodice).toEqual({ righe: 0, totale: 0 });
  });

  it('mappare una sezione non porta via i documenti degli uffici che non ne avevano bisogno', () => {
    const titoli = [
      titolo({ id: 1, codice: '27', materiaId: 10 }),
      titolo({ id: 2, codice: '18', materiaId: 11 }),
    ];
    const materie = [
      { id: 10, nome: 'Flussi Uniemens' },
      { id: 11, nome: 'Verbali ispettivi' },
      { id: 12, nome: 'Vidimazione contratti' },
    ];
    const lavorazioni = [
      lav({ id: 1, materiaId: 10, dipendenza: 'Ufficio contributi' }),
      lav({ id: 2, materiaId: 11, dipendenza: 'Ufficio vigilanza', tipologia: 'Verbale' }),
      lav({ id: 3, materiaId: 12, dipendenza: 'Ufficio contratti', tipologia: 'Vidimazione' }),
    ];
    const righe: RigaVeraReportUo[] = [
      riga(),
      riga({ sezione: 'VERBALI', voce: 'TS 18 verbale di accertamento', importo: 500 }),
      riga({
        sezione: 'Gestione artisti',
        voce: 'Compensi non versati',
        categoria: '',
        importo: 830,
      }),
    ];

    // Prima della mappatura la sezione non ha né un codice né una materia: la
    // sua posizione non arriva a nessun ufficio, e i due uffici che la materia
    // ce l'hanno producono i loro documenti.
    const prima = componiReportUo({ ...base, titoli, materie, lavorazioni, righe });
    expect(prima.documenti.map((d) => d.dipendenza)).toEqual([
      'Ufficio contributi',
      'Ufficio vigilanza',
    ]);
    expect(prima.senzaCodice).toEqual({ righe: 1, totale: 830 });

    // Dopo la mappatura si aggiunge il terzo documento: i due che c'erano
    // restano, con le loro posizioni e il loro totale.
    const dopo = componiReportUo({
      ...base,
      titoli,
      materie,
      lavorazioni,
      righe: righe.map((r) =>
        r.sezione === 'Gestione artisti' ? { ...r, categoria: 'MATERIA:12' } : r
      ),
    });
    expect(dopo.documenti.map((d) => d.dipendenza)).toEqual([
      'Ufficio contratti',
      'Ufficio contributi',
      'Ufficio vigilanza',
    ]);
    const contributi = dopo.documenti.find((d) => d.dipendenza === 'Ufficio contributi');
    expect(contributi?.righe).toBe(1);
    expect(contributi?.totale).toBe(1_200);
    const vigilanza = dopo.documenti.find((d) => d.dipendenza === 'Ufficio vigilanza');
    expect(vigilanza?.righe).toBe(1);
    expect(vigilanza?.totale).toBe(500);
    expect(dopo.senzaCodice).toEqual({ righe: 0, totale: 0 });
  });

  // IL CASO DEL FILE VERO. La gestione contributiva contiene anche i verbali
  // («Verbale Evasione»): mappando la sezione sui flussi — la scelta che sembra
  // ovvia, il titolo parla di Uniemens — i verbali finivano sul foglio del
  // presidio e l'ufficio di vigilanza non riceveva più il suo documento. La
  // mappatura è un ripiego: vale per ciò che la voce non identifica.
  it('la sezione mappata non si porta via le posizioni che la voce identifica', () => {
    const esito = componiReportUo({
      azienda: 'Aretusea Detergenti S.r.l.',
      dataVerifica: '2026-10-28',
      titoli: [],
      materie: [
        { id: 10, nome: 'Flussi Uniemens' },
        { id: 11, nome: 'Verbali ispettivi' },
      ],
      lavorazioni: [
        lav({ id: 1, materiaId: 10, dipendenza: 'Presidio dei flussi informativi' }),
        lav({
          id: 2,
          materiaId: 11,
          dipendenza: 'Vigilanza documentale',
          tipologia: 'Acquisizione del verbale',
        }),
      ],
      righe: [
        ...[
          ['202005 - 202005', 4_959.16],
          ['202006 - 202006', 6_694.63],
          ['202006 - 202006', 4_230.24],
          ['202007 - 202007', 5_859.87],
          ['202007 - 202007', 4_482.89],
        ].map(([periodo, importo]) =>
          riga({
            sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
            voce: 'Verbale Evasione',
            periodo: periodo as string,
            stato: 'Verificata',
            importo: importo as number,
            categoria: 'MATERIA:10',
          })
        ),
        riga({
          sezione: 'FLUSSI UNIEMENS',
          voce: 'Denunce non trasmesse',
          stato: 'Da Verificare',
          importo: 191.47,
          categoria: 'MATERIA:10',
        }),
      ],
    });

    const perUfficio = new Map(esito.documenti.map((d) => [d.dipendenza, d]));
    expect(Array.from(perUfficio.keys()).sort()).toEqual([
      'Presidio dei flussi informativi',
      'Vigilanza documentale',
    ]);
    const vigilanza = perUfficio.get('Vigilanza documentale')!;
    expect(vigilanza.righe).toBe(5);
    expect(vigilanza.totale).toBeCloseTo(26_226.79, 2);
    expect(vigilanza.codici[0].materia).toBe('Verbali ispettivi');
    // La mappatura resta utile dove la voce non basta.
    expect(perUfficio.get('Presidio dei flussi informativi')!.totale).toBeCloseTo(191.47, 2);
  });
});

describe('report UO: le voci assegnate a ogni ufficio, e perché', () => {
  const materie = [
    { id: 10, nome: 'Flussi Uniemens' },
    { id: 11, nome: 'Verbali ispettivi' },
  ];
  const lavorazioni = [
    lav({ id: 1, materiaId: 10, dipendenza: 'Presidio dei flussi informativi' }),
    lav({
      id: 2,
      materiaId: 11,
      dipendenza: 'Vigilanza documentale',
      tipologia: 'Acquisizione del verbale',
    }),
  ];

  // IL CASO CHE SI DEVE VEDERE A COLPO D'OCCHIO. La sezione dei verbali è
  // mappata sui flussi; la voce però si riconduce da sé, quindi il verbale va
  // alla vigilanza e la mappatura non sposta niente. Senza questa traccia la
  // scheda mostrerebbe solo i due documenti giusti, e chi ha mappato non
  // saprebbe che la sua scelta è stata scavalcata.
  it('dice da quale voce arriva ogni posizione, e quale mappatura non ha spostato nulla', () => {
    const esito = componiReportUo({
      azienda: 'Aretusea Detergenti S.r.l.',
      dataVerifica: '2026-10-28',
      titoli: [],
      materie,
      lavorazioni,
      righe: [
        riga({
          sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
          voce: 'Verbale Evasione',
          importo: 4_959.16,
          categoria: 'MATERIA:10',
        }),
        riga({
          sezione: 'Gestione artisti',
          voce: 'Compensi non versati',
          importo: 830,
          categoria: 'MATERIA:10',
        }),
      ],
    });

    const vigilanza = esito.documenti.find((d) => d.dipendenza === 'Vigilanza documentale')!;
    expect(vigilanza.codici[0].origini).toEqual([
      {
        sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
        voce: 'Verbale Evasione',
        motivo: 'voce',
        righe: 1,
        importo: 4_959.16,
      },
    ]);

    const presidio = esito.documenti.find(
      (d) => d.dipendenza === 'Presidio dei flussi informativi'
    )!;
    expect(presidio.codici[0].origini).toEqual([
      {
        sezione: 'Gestione artisti',
        voce: 'Compensi non versati',
        motivo: 'mappatura',
        righe: 1,
        importo: 830,
      },
    ]);

    // Solo la mappatura scavalcata si dichiara inerte: quella che ha deciso i
    // «Compensi non versati» ha fatto il suo lavoro.
    expect(esito.mappatureSenzaEffetto).toEqual([
      {
        sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
        destinazione: 'Flussi Uniemens',
        righe: 1,
        totale: 4_959.16,
      },
    ]);
  });

  it('distingue il codice di partita dal titolo della sezione', () => {
    const esito = componiReportUo({
      ...base,
      righe: [riga(), riga({ voce: 'Interessi di mora', importo: 40 })],
    });
    const d = esito.documenti[0];
    expect(d.codici.find((c) => c.codice === '27')!.origini).toEqual([
      {
        sezione: 'FLUSSI UNIEMENS',
        voce: 'TS 27 flusso Uniemens non versato',
        motivo: 'codice',
        righe: 1,
        importo: 1_200,
      },
    ]);
    // «Interessi di mora» da sola non dice niente: la materia arriva dal
    // titolo della sezione, e la scheda lo dichiara diversamente dal codice.
    expect(d.codici.find((c) => c.codice === null)!.origini[0]).toMatchObject({
      voce: 'Interessi di mora',
      motivo: 'sezione',
    });
    expect(esito.mappatureSenzaEffetto).toEqual([]);
  });

  it('senza mappature salvate non c’è nessuna mappatura inerte da dichiarare', () => {
    expect(componiReportUo({ ...base, righe: [riga()] }).mappatureSenzaEffetto).toEqual([]);
  });
});

// LA SCELTA SULLA VOCE. Quando la deduzione automatica manda la posizione
// all'ufficio sbagliato, l'operatore corregge la materia della voce dal report.
// La scelta è una decisione, non una lettura: vince su tutto e lo dice.
describe('report UO: la materia scelta su una voce', () => {
  const materie = [
    { id: 10, nome: 'Flussi Uniemens' },
    { id: 11, nome: 'Verbali ispettivi' },
  ];
  const lavorazioni = [
    lav({ id: 1, materiaId: 10, dipendenza: 'Presidio dei flussi informativi' }),
    lav({
      id: 2,
      materiaId: 11,
      dipendenza: 'Vigilanza documentale',
      tipologia: 'Acquisizione del verbale',
    }),
  ];
  const unaRiga = (over: Partial<RigaVeraReportUo>) =>
    riga({
      sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
      voce: 'Verbale Evasione',
      importo: 500,
      ...over,
    });

  it('la scelta porta la voce dove dice l’operatore, e si dichiara come scelta', () => {
    const esito = componiReportUo({
      azienda: 'Alfa Srl',
      dataVerifica: '2026-10-28',
      titoli: [],
      materie,
      lavorazioni,
      righe: [unaRiga({ materiaId: 10 })],
    });
    const presidio = esito.documenti.find(
      (d) => d.dipendenza === 'Presidio dei flussi informativi'
    );
    expect(presidio).toBeTruthy();
    expect(presidio!.codici[0].origini[0].motivo).toBe('scelto');
    expect(esito.documenti.some((d) => d.dipendenza === 'Vigilanza documentale')).toBe(false);
  });

  it('senza scelta vale la lettura della voce', () => {
    const esito = componiReportUo({
      azienda: 'Alfa Srl',
      dataVerifica: '2026-10-28',
      titoli: [],
      materie,
      lavorazioni,
      righe: [unaRiga({})],
    });
    const vigilanza = esito.documenti.find((d) => d.dipendenza === 'Vigilanza documentale');
    expect(vigilanza).toBeTruthy();
    expect(vigilanza!.codici[0].origini[0].motivo).toBe('voce');
  });
});
