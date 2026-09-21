import { describe, it, expect } from 'vitest';
import {
  anniDelTriage,
  andamento,
  esposizioneQualificata,
  riferimentoDi,
  totalePerCategoria,
  type RigaDebitoTriage,
} from './modello';

const riga = (p: Partial<RigaDebitoTriage>): RigaDebitoTriage => ({
  descrizione: 'x',
  categoria: 'PREVIDENZIALE',
  importoAnnoCorrente: null,
  importoAnnoPrecedente: null,
  importoAnnoMeno2: null,
  riferimentoAnnoPrecedente: null,
  prospettoId: null,
  ...p,
});

describe('i tre anni si ricavano dalla data di verifica', () => {
  it('non c’è nulla da chiedere all’operatore', () => {
    expect(anniDelTriage(new Date(Date.UTC(2026, 8, 16)))).toEqual({
      corrente: 2026,
      precedente: 2025,
      meno2: 2024,
    });
  });
});

describe('cosa concorre al test dell’art. 25-novies', () => {
  const righe = [
    riga({ categoria: 'PREVIDENZIALE', importoAnnoCorrente: 100_000 }),
    riga({ categoria: 'ASSICURATIVO', importoAnnoCorrente: 8_000 }),
    riga({ categoria: 'FISCALE', importoAnnoCorrente: 50_000 }),
    riga({ categoria: 'COMMERCIALE', importoAnnoCorrente: 300_000 }),
    riga({ categoria: 'ALTRO', importoAnnoCorrente: 20_000 }),
  ];

  it('commerciali e altri NON entrano nella soglia', () => {
    // Includerli significherebbe misurare una soglia di legge su debiti che
    // la legge non considera.
    const q = esposizioneQualificata(righe);
    expect(q.COMMERCIALE).toBe(0);
    expect(q.ALTRO).toBe(0);
    expect(q.PREVIDENZIALE).toBe(100_000);
  });

  it('ma restano nel totale, che serve agli indici e ai rapporti', () => {
    const t = totalePerCategoria(righe, 'corrente');
    expect(t.COMMERCIALE).toBe(300_000);
    const tot = Object.values(t).reduce((s, v) => s + v, 0);
    expect(tot).toBe(478_000);
  });

  it('previdenziale e assicurativo restano DISTINTI', () => {
    // Il bilancio li accorpa nella voce D.13; la soglia no.
    const q = esposizioneQualificata(righe);
    expect(q.PREVIDENZIALE).toBe(100_000);
    expect(q.ASSICURATIVO).toBe(8_000);
  });
});

describe('il termine di paragone della soglia', () => {
  it('si somma fra più posizioni della stessa categoria', () => {
    // Un'azienda può avere più gestioni previdenziali: il dovuto è la somma.
    const righe = [
      riga({ riferimentoAnnoPrecedente: 300_000 }),
      riga({ riferimentoAnnoPrecedente: 118_709 }),
    ];
    expect(riferimentoDi(righe, 'PREVIDENZIALE')).toBe(418_709);
  });

  it('se nessuna riga lo porta torna NULL, non zero', () => {
    // Zero darebbe una soglia del 30% pari a zero, e renderebbe "oltre
    // soglia" qualunque importo, anche un euro.
    expect(riferimentoDi([riga({ importoAnnoCorrente: 5 })], 'PREVIDENZIALE')).toBeNull();
  });

  it('non si mescola fra categorie diverse', () => {
    const righe = [
      riga({ categoria: 'PREVIDENZIALE', riferimentoAnnoPrecedente: 400_000 }),
      riga({ categoria: 'FISCALE', riferimentoAnnoPrecedente: 900_000 }),
    ];
    expect(riferimentoDi(righe, 'PREVIDENZIALE')).toBe(400_000);
    expect(riferimentoDi(righe, 'FISCALE')).toBe(900_000);
  });
});

describe('andamento sui tre anni', () => {
  it('calcola la variazione rispetto all’anno precedente', () => {
    const righe = [
      riga({ importoAnnoCorrente: 120, importoAnnoPrecedente: 100, importoAnnoMeno2: 80 }),
    ];
    const a = andamento(righe);
    expect(a.variazionePercentuale).toBe(20);
  });

  it('senza anno precedente la variazione è NULL, non zero', () => {
    // Zero direbbe "stabile", che è un'affermazione; qui non si sa.
    const a = andamento([riga({ importoAnnoCorrente: 120 })]);
    expect(a.variazionePercentuale).toBeNull();
  });
});

describe('dalla tabella al test delle soglie', () => {
  it('ogni categoria alimenta il proprio valore', async () => {
    const { valoriSoglieDaPosizioni } = await import('./modello');
    const v = valoriSoglieDaPosizioni([
      riga({
        categoria: 'PREVIDENZIALE',
        importoAnnoCorrente: 496_544,
        riferimentoAnnoPrecedente: 418_709,
      }),
      riga({ categoria: 'ASSICURATIVO', importoAnnoCorrente: 9_000 }),
      riga({
        categoria: 'IVA',
        importoAnnoCorrente: 30_000,
        riferimentoAnnoPrecedente: 900_000,
      }),
      riga({ categoria: 'COMMERCIALE', importoAnnoCorrente: 300_000 }),
    ]);
    expect(v.contributiScaduti).toBe(496_544);
    expect(v.contributiDovutiAnnoPrecedente).toBe(418_709);
    expect(v.premiInail).toBe(9_000);
    expect(v.ivaScaduta).toBe(30_000);
    expect(v.volumeAffari).toBe(900_000);
  });

  it('i commerciali non entrano in nessun valore di soglia', async () => {
    const { valoriSoglieDaPosizioni } = await import('./modello');
    const v = valoriSoglieDaPosizioni([
      riga({ categoria: 'COMMERCIALE', importoAnnoCorrente: 999_999 }),
    ]);
    expect(v.contributiScaduti).toBeNull();
    expect(v.ivaScaduta).toBeNull();
  });

  it('una categoria assente torna NULL, non zero', async () => {
    // Zero trasformerebbe un'assenza in "debito zero", e la soglia
    // risulterebbe non superata per mancanza di dati.
    const { valoriSoglieDaPosizioni } = await import('./modello');
    const v = valoriSoglieDaPosizioni([]);
    expect(v.contributiScaduti).toBeNull();
    expect(v.premiInail).toBeNull();
  });
});

describe('sovrapposizioni fra documenti', () => {
  it('due saldi dello stesso ente fermano la conferma', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni(
      [],
      [
        { nome: 'ruoli.xlsx', ente: 'INPS', forma: 'SALDO' },
        { nome: 'estratto.xlsx', ente: 'INPS', forma: 'SALDO' },
      ],
      []
    );
    expect(s).toHaveLength(1);
    expect(s[0].scelte.map((x) => x.valore)).toEqual(['PRIMO', 'SECONDO', 'ENTRAMBI']);
  });

  it('due saldi di enti DIVERSI non sono una sovrapposizione', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni(
      [],
      [
        { nome: 'inps.xlsx', ente: 'INPS', forma: 'SALDO' },
        { nome: 'inail.xlsx', ente: 'INAIL', forma: 'SALDO' },
      ],
      []
    );
    expect(s).toHaveLength(0);
  });

  it('tabella previdenziale + fogli dell’istituto: si deve scegliere', async () => {
    // Senza questa domanda la tabella avrebbe la precedenza in silenzio, e i
    // fogli verrebbero ignorati senza che nessuno lo sappia.
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni(
      [riga({ categoria: 'PREVIDENZIALE', importoAnnoCorrente: 47_233 })],
      [],
      ['INADEMPIENZE']
    );
    expect(s.map((x) => x.chiave)).toEqual(['prev:fogli']);
  });

  it('tabella solo commerciale + fogli INPS: nessuna sovrapposizione', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni(
      [riga({ categoria: 'COMMERCIALE', importoAnnoCorrente: 300_000 })],
      [],
      ['INADEMPIENZE', 'RUOLI']
    );
    expect(s).toHaveLength(0);
  });
});

describe('V.E.R.A. insieme agli elenchi dell’Istituto', () => {
  // Fino alla 0.109.76 non era segnalato: gli elenchi finivano nel non
  // versato, letto prima del V.E.R.A., e il V.E.R.A. spariva in silenzio.
  it('V.E.R.A. + inadempienze: si chiede di scegliere', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni([], [], ['VERA', 'INADEMPIENZE']);
    expect(s.some((x) => x.chiave === 'vera:elenchi')).toBe(true);
  });

  it('V.E.R.A. + ruoli: si chiede di scegliere', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni([], [], ['VERA', 'RUOLI']);
    expect(s.some((x) => x.chiave === 'vera:elenchi')).toBe(true);
  });

  it('il solo V.E.R.A. non richiede scelte', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    expect(trovaSovrapposizioni([], [], ['VERA'])).toHaveLength(0);
  });

  it('inadempienze + ruoli senza V.E.R.A.: si riconciliano da soli, nessuna scelta', async () => {
    const { trovaSovrapposizioni } = await import('./modello');
    const s = trovaSovrapposizioni([], [], ['INADEMPIENZE', 'RUOLI']);
    expect(s.some((x) => x.chiave === 'vera:elenchi')).toBe(false);
  });
});

describe('IVA separata dagli altri tributi', () => {
  // La soglia dell'Agenzia delle Entrate riguarda solo l'IVA da LIPE: con
  // un'unica categoria "Fiscale", anche IRES o IRAP finivano nella soglia.
  it('IRES e IRAP non entrano nella soglia IVA', async () => {
    const { valoriSoglieDaPosizioni } = await import('./modello');
    const v = valoriSoglieDaPosizioni([
      riga({
        categoria: 'FISCALE',
        importoAnnoCorrente: 80_000,
        riferimentoAnnoPrecedente: 900_000,
      }),
    ]);
    expect(v.ivaScaduta).toBeNull();
    expect(v.volumeAffari).toBeNull();
  });

  it('gli altri tributi restano nel totale, fuori soglia', async () => {
    const { esposizioneQualificata, totalePerCategoria } = await import('./modello');
    const righe = [riga({ categoria: 'FISCALE', importoAnnoCorrente: 80_000 })];
    expect(totalePerCategoria(righe, 'corrente').FISCALE).toBe(80_000);
    expect(esposizioneQualificata(righe).FISCALE).toBe(0);
  });
});
