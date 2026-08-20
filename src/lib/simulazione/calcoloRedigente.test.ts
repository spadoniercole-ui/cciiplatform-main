import { describe, it, expect } from 'vitest';
import {
  calcolaRedigente,
  ALIQUOTE_PERSONALE_DEFAULT,
  type InputRedigente,
} from './calcoloRedigente';

function inputBase(overrides: Partial<InputRedigente> = {}): InputRedigente {
  return {
    valoreProduzione: 3650000,
    costiProduzioneAltri: 1825000,
    ammortamenti: 50000,
    personale: {
      operai: { numero: 10, retribuzioneLordaMensileMedia: 2000 },
      impiegati: { numero: 5, retribuzioneLordaMensileMedia: 2500 },
      quadri: { numero: 2, retribuzioneLordaMensileMedia: 4000 },
      dirigenti: { numero: 1, retribuzioneLordaMensileMedia: 8000 },
    },
    aliquotePersonale: ALIQUOTE_PERSONALE_DEFAULT,
    giorniMediIncassoClienti: 30,
    giorniMediPagamentoFornitori: 30,
    giorniBaseline: 30,
    aliquotaImposteSulReddito: 43,
    aliquotaIrap: 3.9,
    totaleDebitiProposta: 840000,
    numeroRateMedie: 84,
    totaleDebiti: 2000000,
    patrimonioNetto: 500000,
    ...overrides,
  };
}

describe('calcolaRedigente — costo del personale', () => {
  it('calcola il costo di una categoria: retribuzione lorda annua + contributi a carico azienda', () => {
    const risultato = calcolaRedigente(
      inputBase({
        personale: {
          operai: { numero: 1, retribuzioneLordaMensileMedia: 2000 },
          impiegati: { numero: 0, retribuzioneLordaMensileMedia: 0 },
          quadri: { numero: 0, retribuzioneLordaMensileMedia: 0 },
          dirigenti: { numero: 0, retribuzioneLordaMensileMedia: 0 },
        },
      })
    );
    expect(risultato.costoPersonaleTotale).toBeCloseTo(35040, 2);
  });

  it('somma correttamente le quattro categorie', () => {
    const risultato = calcolaRedigente(inputBase());
    const atteso =
      10 * 2000 * 12 * 1.46 +
      5 * 2500 * 12 * 1.4072 +
      2 * 4000 * 12 * 1.4272 +
      1 * 8000 * 12 * 1.4572;
    expect(risultato.costoPersonaleTotale).toBeCloseTo(atteso, 0);
  });
});

describe('calcolaRedigente — capitale circolante', () => {
  it('è zero se i giorni ipotizzati coincidono con la baseline', () => {
    const risultato = calcolaRedigente(inputBase());
    expect(risultato.variazioneCapitaleCircolante).toBe(0);
  });

  it('incassare più tardi della baseline assorbe cassa (segno negativo)', () => {
    const risultato = calcolaRedigente(inputBase({ giorniMediIncassoClienti: 60 }));
    expect(risultato.variazioneCapitaleCircolante).toBeCloseTo(-300000, 0);
  });

  it('pagare più tardi della baseline libera cassa (segno positivo)', () => {
    const risultato = calcolaRedigente(inputBase({ giorniMediPagamentoFornitori: 60 }));
    expect(risultato.variazioneCapitaleCircolante).toBeCloseTo(150000, 0);
  });

  it('i due effetti si combinano correttamente', () => {
    const risultato = calcolaRedigente(
      inputBase({ giorniMediIncassoClienti: 60, giorniMediPagamentoFornitori: 90 })
    );
    expect(risultato.variazioneCapitaleCircolante).toBeCloseTo(0, 0);
  });
});

describe('calcolaRedigente — imposte e DSCR', () => {
  it("non calcola imposte se l'EBIT è negativo o zero", () => {
    const risultato = calcolaRedigente(inputBase({ valoreProduzione: 1000000 }));
    expect(risultato.ebit).toBeLessThan(0);
    expect(risultato.imposte).toBe(0);
  });

  it("calcola le imposte come (aliquota reddito + IRAP) sull'EBIT positivo", () => {
    const risultato = calcolaRedigente(inputBase());
    if (risultato.ebit > 0) {
      expect(risultato.imposte).toBeCloseTo(risultato.ebit * 0.469, 0);
    }
  });

  it('il DSCR è viabile solo se >= 1', () => {
    const risultato = calcolaRedigente(inputBase({ totaleDebitiProposta: 100000000 }));
    expect(risultato.dscr).not.toBeNull();
    expect(risultato.dscr).toBeLessThan(1);
    expect(risultato.viabile).toBe(false);
  });

  it('ritorna dscr null se non ci sono rate (nessun debito da servire)', () => {
    const risultato = calcolaRedigente(inputBase({ totaleDebitiProposta: 0 }));
    expect(risultato.dscr).toBeNull();
    expect(risultato.viabile).toBe(false);
  });
});

describe('calcolaRedigente — indice Debiti/Capitale', () => {
  it('calcola il rapporto tra debiti totali e patrimonio netto', () => {
    const risultato = calcolaRedigente(
      inputBase({ totaleDebiti: 1000000, patrimonioNetto: 500000 })
    );
    expect(risultato.indiceDebitiCapitale).toBe(2);
  });

  it('ritorna null se il patrimonio netto è zero', () => {
    const risultato = calcolaRedigente(inputBase({ patrimonioNetto: 0 }));
    expect(risultato.indiceDebitiCapitale).toBeNull();
  });
});
