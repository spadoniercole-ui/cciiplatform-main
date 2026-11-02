import { describe, it, expect } from 'vitest';
import {
  applicaRisposte,
  completa,
  mancanze,
  sintesiPerimetro,
  vociObbligatorie,
  type LavorazionePerimetro,
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
  it('una voce per ogni TS rilevante, con i codici della sua materia', () => {
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
    expect(sintesiPerimetro(voci).etichetta).toContain('Nessuna TS rilevante');
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

  it('una TS di resistenza non riscontrata resta da attenzionare anche senza natura', () => {
    const voci = applicaRisposte(vociObbligatorie([titolo('A01', 10)], [lavorazione()]), [
      { lavorazioneId: 1, stato: 'NON_RISCONTRATA', natura: null, nota: null },
    ]);
    const s = sintesiPerimetro(voci);
    expect(s.codiciDaAttenzionare).toEqual(['A01']);
    expect(s.daCompilare).toBe(1);
    expect(s.etichetta).toBe('Check di perimetro incompleta');
  });
});
