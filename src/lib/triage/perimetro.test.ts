import { describe, it, expect } from 'vitest';
import {
  applicaRisposte,
  codiciDeiProdotti,
  completa,
  mancanze,
  sintesiPerimetro,
  vociObbligatorie,
  type LavorazionePerimetro,
  type MateriaPerimetro,
  type ProdottoPerimetro,
  type TitoloPerimetro,
} from './perimetro';

const lavorazione = (over: Partial<LavorazionePerimetro> = {}): LavorazionePerimetro => ({
  id: 1,
  materiaId: 10,
  materia: 'Diffide',
  tipologia: 'Emissione diffida',
  dipendenza: 'Ufficio legale',
  rilevantePerimetro: true,
  versoPerimetro: 'RESISTENZA',
  ...over,
});

const titolo = (codice: string, materiaId: number | null): TitoloPerimetro => ({
  codice,
  materiaId,
});

describe('voci della check di perimetro', () => {
  it('una voce per ogni TL rilevante, con i codici della sua materia', () => {
    const voci = vociObbligatorie(
      [titolo('B02', 10), titolo('A01', 10), titolo('C03', 20), titolo('D04', null)],
      [
        lavorazione(),
        lavorazione({ id: 2, materiaId: 20, materia: 'Dilazioni', tipologia: 'Dilazione' }),
      ]
    );
    expect(voci).toHaveLength(2);
    expect(voci.map((v) => v.codici)).toEqual([['A01', 'B02'], ['C03']]);
    expect(voci[0].stato).toBeNull();
  });

  it('senza contrassegno nessuna voce: la check non inventa domande', () => {
    const voci = vociObbligatorie(
      [titolo('A01', 10)],
      [lavorazione({ rilevantePerimetro: false })]
    );
    expect(voci).toEqual([]);
    expect(sintesiPerimetro(voci).etichetta).toContain('Nessuna TL rilevante');
  });

  it('le risposte salvate si riapplicano per id, non per posizione', () => {
    const voci = vociObbligatorie([titolo('A01', 10)], [lavorazione()]);
    const applicate = applicaRisposte(voci, [
      {
        lavorazioneId: 1,
        stato: 'NON_RISCONTRATA',
        natura: 'MODUS_OPERANDI',
        nota: 'tre solleciti',
      },
    ]);
    expect(applicate[0].stato).toBe('NON_RISCONTRATA');
    expect(applicate[0].natura).toBe('MODUS_OPERANDI');
    expect(applicate[0].codici).toEqual(['A01']);
  });
});

// IL LEGAME PRODOTTO → TL (0.157.0).
//
// La voce nasce dalla lavorazione giusta e i codici sono quelli delle procedure
// che la richiamano, non quelli di tutta la materia in cui la TL vive: la 81 non
// porta più con sé i crediti di 74/76/CIG solo perché stanno nella stessa
// materia.
describe('i codici di una voce vengono dal legame prodotto → TL', () => {
  const materie: MateriaPerimetro[] = [
    { id: 10, nome: 'Diffide' },
    { id: 20, nome: 'Ticket licenziamento' },
    { id: 21, nome: 'Sgravi' },
  ];
  const prodotto = (nome: string, lavorazioneIds: number[]): ProdottoPerimetro => ({
    nome,
    lavorazioneIds,
  });

  it('una TL con un prodotto prende i codici della materia di quel prodotto', () => {
    const voci = vociObbligatorie(
      [titolo('A01', 10), titolo('B02', 10), titolo('C03', 20)],
      [lavorazione()], // TL 1 nella materia 10, che raccoglie più procedure
      [prodotto('Ticket licenziamento', [1])],
      materie
    );
    expect(voci[0].codici).toEqual(['C03']);
    expect(voci[0].prodotti).toEqual(['Ticket licenziamento']);
    expect(voci[0].codiciDallaMateria).toBe(false);
  });

  it('più prodotti sulla stessa TL uniscono i codici delle loro materie', () => {
    const voci = vociObbligatorie(
      [titolo('A01', 10), titolo('C03', 20), titolo('D04', 21)],
      [lavorazione()],
      [prodotto('Ticket licenziamento', [1]), prodotto('Sgravi', [1])],
      materie
    );
    expect(voci[0].codici).toEqual(['C03', 'D04']);
    expect(voci[0].prodotti).toEqual(['Sgravi', 'Ticket licenziamento']);
  });

  it('il nome del prodotto si riconosce per chiave, non per grafia', () => {
    const voci = vociObbligatorie(
      [titolo('C03', 20)],
      [lavorazione()],
      [prodotto('TICKET   licenziamento', [1])],
      materie
    );
    expect(voci[0].codici).toEqual(['C03']);
  });

  it('un prodotto che non è una materia non inventa codici, e la voce lo dice', () => {
    const voci = vociObbligatorie(
      [titolo('A01', 10)],
      [lavorazione()],
      [prodotto('Cassa integrazione', [1])],
      materie
    );
    expect(voci[0].codici).toEqual([]);
    expect(voci[0].prodotti).toEqual(['Cassa integrazione']);
    expect(voci[0].codiciDallaMateria).toBe(false);
  });

  it('senza prodotti che la nominano la voce riprende la materia e lo dichiara', () => {
    const voci = vociObbligatorie([titolo('A01', 10), titolo('B02', 10)], [lavorazione()]);
    expect(voci[0].codici).toEqual(['A01', 'B02']);
    expect(voci[0].prodotti).toEqual([]);
    expect(voci[0].codiciDallaMateria).toBe(true);
  });

  it('due TL della stessa materia non si scambiano i codici', () => {
    const voci = vociObbligatorie(
      [titolo('A01', 10), titolo('C03', 20), titolo('D04', 21)],
      [
        lavorazione(), // TL 1
        lavorazione({ id: 2, materiaId: 10, materia: 'Diffide', tipologia: 'Sollecito' }),
      ],
      [prodotto('Ticket licenziamento', [1]), prodotto('Sgravi', [2])],
      materie
    );
    const perId = new Map(voci.map((v) => [v.lavorazioneId, v.codici]));
    expect(perId.get(1)).toEqual(['C03']);
    expect(perId.get(2)).toEqual(['D04']);
  });

  it('codiciDeiProdotti dice «nessun legame» quando nessuno nomina la TL', () => {
    expect(codiciDeiProdotti(9, [prodotto('Sgravi', [2])], materie, [])).toEqual({
      prodotti: [],
      codici: null,
    });
  });
});

describe('completezza della check', () => {
  it('una voce senza stato blocca il triage', () => {
    const voci = vociObbligatorie([titolo('A01', 10)], [lavorazione()]);
    expect(completa(voci)).toBe(false);
    expect(mancanze(voci)[0]).toContain('indicare se la lavorazione è stata riscontrata');
  });

  it('«non riscontrata» senza natura non basta: manca che cosa è successo', () => {
    const voci = applicaRisposte(vociObbligatorie([titolo('A01', 10)], [lavorazione()]), [
      { lavorazioneId: 1, stato: 'NON_RISCONTRATA', natura: null, nota: null },
    ]);
    expect(mancanze(voci)[0]).toContain('modus operandi');
    expect(completa(voci)).toBe(false);
  });

  it('«non applicabile» non chiede la natura: la domanda non ha oggetto', () => {
    const voci = applicaRisposte(vociObbligatorie([titolo('A01', 10)], [lavorazione()]), [
      { lavorazioneId: 1, stato: 'NON_APPLICABILE', natura: null, nota: null },
    ]);
    expect(mancanze(voci)).toEqual([]);
    expect(completa(voci)).toBe(true);
  });
});

describe('sintesi del perimetro', () => {
  it('separa i codici strutturali da quelli incidentali e non li somma', () => {
    const voci = applicaRisposte(
      vociObbligatorie(
        [titolo('A01', 10), titolo('B02', 10), titolo('C03', 20)],
        [
          lavorazione(),
          lavorazione({ id: 2, materiaId: 20, materia: 'Dilazioni', tipologia: 'Dilazione' }),
        ]
      ),
      [
        { lavorazioneId: 1, stato: 'NON_RISCONTRATA', natura: 'MODUS_OPERANDI', nota: null },
        { lavorazioneId: 2, stato: 'NON_RISCONTRATA', natura: 'MOMENTANEO', nota: null },
      ]
    );
    const s = sintesiPerimetro(voci);
    expect(s.codiciStrutturali).toEqual(['A01', 'B02']);
    expect(s.codiciIncidentali).toEqual(['C03']);
    expect(s.codiciDaAttenzionare).toEqual(['A01', 'B02']);
    expect(s.etichetta).toBe('Perimetro: condotta strutturale da presidiare');
    expect(s.dettaglio).toContain('modus operandi');
  });

  it('una TL di resistenza non riscontrata resta da attenzionare anche senza natura', () => {
    const voci = applicaRisposte(vociObbligatorie([titolo('A01', 10)], [lavorazione()]), [
      { lavorazioneId: 1, stato: 'NON_RISCONTRATA', natura: null, nota: null },
    ]);
    const s = sintesiPerimetro(voci);
    expect(s.codiciDaAttenzionare).toEqual(['A01']);
    expect(s.daCompilare).toBe(1);
    expect(s.etichetta).toBe('Check di perimetro incompleta');
  });
});
