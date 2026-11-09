import { describe, expect, it } from 'vitest';
import {
  LEVE_NEUTRE,
  applicaLeve,
  confrontoVoci,
  descrizioneLeve,
  normalizzaLeve,
  valutaRamo,
} from './rami';
import type { DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';

const base: DatiFinanziariPeriodo = {
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_100_000,
  costiProduzione: 1_000_000,
  ebit: 100_000,
  ammortamenti: 40_000,
  ebitda: 140_000,
  oneriFinanziari: 30_000,
  utileEsercizio: 70_000,
  totaleAttivo: 2_000_000,
  attivoCircolante: 900_000,
  disponibilitaLiquide: 50_000,
  immobilizzazioni: 1_100_000,
  patrimonioNetto: 300_000,
  totaleDebiti: 1_700_000,
  debitiBanche: 600_000,
  debitiFornitori: 500_000,
  debitiTributari: 200_000,
  debitiPrevidenziali: 300_000,
  passivoCorrente: 800_000,
  creditiClienti: 400_000,
};

const indice = (codice: string, esito: IndiceCcii['esito']): IndiceCcii => ({
  codice,
  nome: codice,
  valore: 1,
  soglia: '—',
  esito,
});

describe('normalizzaLeve', () => {
  it('limita le percentuali e non ammette debito negativo', () => {
    const l = normalizzaLeve({
      variazioneRicaviPct: 300,
      variazioneCostiPct: -300,
      debitoEnteEuro: -50,
      naturaDebitoEnte: 'tributario',
    });
    expect(l).toEqual({
      variazioneRicaviPct: 90,
      variazioneCostiPct: -90,
      debitoEnteEuro: 0,
      naturaDebitoEnte: 'tributario',
    });
  });

  it('le leve neutre non cambiano nulla', () => {
    expect(normalizzaLeve(LEVE_NEUTRE)).toEqual(LEVE_NEUTRE);
    expect(normalizzaLeve(null)).toEqual(LEVE_NEUTRE);
  });
});

describe('applicaLeve', () => {
  it('con leve neutre restituisce gli stessi numeri', () => {
    expect(applicaLeve(base, LEVE_NEUTRE)).toEqual(base);
  });

  it('riduce ricavi e valore della produzione, e l’EBIT con loro', () => {
    const sim = applicaLeve(base, { ...LEVE_NEUTRE, variazioneRicaviPct: -10 });
    expect(sim.ricaviVendite).toBe(900_000);
    expect(sim.valoreProduzione).toBe(990_000);
    expect(sim.costiProduzione).toBe(1_000_000);
    expect(sim.ebit).toBe(-10_000);
    expect(sim.ebitda).toBe(30_000);
    expect(sim.utileEsercizio).toBe(-40_000);
    // Il risultato muove il patrimonio netto del suo delta, non lo azzera.
    expect(sim.patrimonioNetto).toBe(190_000);
  });

  it('il debito dell’ente entra nel passivo senza toccare la liquidità', () => {
    const sim = applicaLeve(base, { ...LEVE_NEUTRE, debitoEnteEuro: 312_434 });
    expect(sim.totaleDebiti).toBe(2_012_434);
    expect(sim.passivoCorrente).toBe(1_112_434);
    expect(sim.debitiPrevidenziali).toBe(612_434);
    expect(sim.debitiTributari).toBe(200_000);
    expect(sim.disponibilitaLiquide).toBe(base.disponibilitaLiquide);
    expect(sim.ricaviVendite).toBe(base.ricaviVendite);
  });

  it('la natura tributaria sposta la quota sull’altro debito pubblico', () => {
    const sim = applicaLeve(base, {
      ...LEVE_NEUTRE,
      debitoEnteEuro: 100_000,
      naturaDebitoEnte: 'tributario',
    });
    expect(sim.debitiTributari).toBe(300_000);
    expect(sim.debitiPrevidenziali).toBe(300_000);
  });

  it('combinare ricavi e costi non lascia scarti di virgola', () => {
    const sim = applicaLeve(base, {
      ...LEVE_NEUTRE,
      variazioneRicaviPct: 7.5,
      variazioneCostiPct: 3,
    });
    expect(Number.isInteger(sim.ricaviVendite)).toBe(true);
    expect(sim.ricaviVendite).toBe(1_075_000);
    expect(sim.costiProduzione).toBe(1_030_000);
    // I ricavi alzano anche il valore della produzione: l'EBIT è la differenza.
    expect(sim.valoreProduzione).toBe(1_182_500);
    expect(sim.ebit).toBe(152_500);
  });
});

describe('valutaRamo', () => {
  it('è sostenibile con patrimonio positivo e nessun indice violato', () => {
    const v = valutaRamo(base, [indice('C1', 'OK'), indice('C2', 'OK')]);
    expect(v.livello).toBe('SOSTENIBILE');
    expect(v.punti).toHaveLength(1);
  });

  it('chiede approfondimento con uno o due indici oltre soglia', () => {
    const v = valutaRamo(base, [indice('C1', 'VIOLATO'), indice('C2', 'OK')]);
    expect(v.livello).toBe('DA_APPROFONDIRE');
    expect(v.punti[0]).toContain('C1');
  });

  it('non è sostenibile con tre indici oltre soglia o patrimonio non positivo', () => {
    expect(
      valutaRamo(base, [indice('C1', 'VIOLATO'), indice('C2', 'VIOLATO'), indice('C3', 'VIOLATO')])
        .livello
    ).toBe('NON_SOSTENIBILE');
    expect(valutaRamo({ ...base, patrimonioNetto: 0 }, []).livello).toBe('NON_SOSTENIBILE');
  });

  it('non è un giudizio: l’avvertenza lo dice', () => {
    expect(valutaRamo(base, []).avvertenza).toContain('non è un giudizio');
  });
});

describe('confrontoVoci', () => {
  it('calcola delta e variazione percentuale, senza dividere per zero', () => {
    const sim = applicaLeve(base, { ...LEVE_NEUTRE, variazioneRicaviPct: -10 });
    const voci = confrontoVoci(base, sim);
    const ricavi = voci.find((v) => v.etichetta === 'Ricavi delle vendite')!;
    expect(ricavi.delta).toBe(-100_000);
    expect(ricavi.deltaPct).toBe(-10);

    const zero = confrontoVoci({ ...base, ricaviVendite: 0 }, base);
    expect(zero.find((v) => v.etichetta === 'Ricavi delle vendite')!.deltaPct).toBeNull();
  });

  it('mette in fila le voci del prospetto e la PFN', () => {
    const voci = confrontoVoci(base, base);
    expect(voci.map((v) => v.etichetta)).toContain('Posizione finanziaria netta');
    expect(voci.find((v) => v.etichetta === 'Posizione finanziaria netta')!.base).toBe(550_000);
  });
});

describe('descrizioneLeve', () => {
  it('scrive le ipotesi in chiaro', () => {
    expect(
      descrizioneLeve({
        variazioneRicaviPct: -10,
        variazioneCostiPct: 5,
        debitoEnteEuro: 312_434,
        naturaDebitoEnte: 'previdenziale',
      })
    ).toBe('ricavi -10% · costi +5% · debito ente 312.434 € previdenziale');
  });

  it('dichiara il caso senza leve', () => {
    expect(descrizioneLeve(LEVE_NEUTRE)).toBe('nessuna leva: solo ricalcolo');
  });
});
