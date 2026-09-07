import { describe, it, expect } from 'vitest';
import {
  calcolaRedigente,
  ALIQUOTE_PERSONALE_DEFAULT,
  type InputRedigente,
} from './calcoloRedigente';
import { calcolaRaccomandazioniRedigente } from './raccomandazioniRedigente';

// Impresa con margini ampi: pochi costi rispetto al valore della
// produzione, così il flusso è nettamente positivo e i test sulle leve
// hanno numeri sensati.
function inputSano(overrides: Partial<InputRedigente> = {}): InputRedigente {
  return {
    valoreProduzione: 1000000,
    costiProduzioneAltri: 400000,
    ammortamenti: 20000,
    personale: {
      operai: { numero: 0, retribuzioneLordaMensileMedia: 0 },
      impiegati: { numero: 0, retribuzioneLordaMensileMedia: 0 },
      quadri: { numero: 0, retribuzioneLordaMensileMedia: 0 },
      dirigenti: { numero: 0, retribuzioneLordaMensileMedia: 0 },
    },
    aliquotePersonale: ALIQUOTE_PERSONALE_DEFAULT,
    giorniMediIncassoClienti: 30,
    giorniMediPagamentoFornitori: 30,
    giorniBaseline: 30,
    aliquotaImposteSulReddito: 24,
    aliquotaIrap: 4,
    totaleDebitiProposta: 5000000,
    numeroRateMedie: 12,
    totaleDebiti: 3000000,
    patrimonioNetto: 500000,
    ...overrides,
  };
}

describe('calcolaRaccomandazioniRedigente', () => {
  it('piano già sostenibile: nessuna raccomandazione', () => {
    const input = inputSano({ totaleDebitiProposta: 100000, numeroRateMedie: 120 });
    const risultato = calcolaRedigente(input);
    expect(risultato.viabile).toBe(true);
    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    expect(esito.viabile).toBe(true);
    expect(esito.raccomandazioni).toHaveLength(0);
  });

  it('dati incompleti: senza debito/rate segnala i dati mancanti, non le leve', () => {
    const input = inputSano({ totaleDebitiProposta: 0, numeroRateMedie: 0 });
    const risultato = calcolaRedigente(input);
    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    expect(esito.raccomandazioni).toHaveLength(1);
    expect(esito.raccomandazioni[0].leva).toBe('DATI_INCOMPLETI');
  });

  it('flusso positivo ma rata troppo alta: la dilazione-obiettivo riporta DSCR a 1', () => {
    const input = inputSano();
    const risultato = calcolaRedigente(input);
    expect(risultato.viabile).toBe(false);
    expect(risultato.flussoDisponibile).toBeGreaterThan(0);

    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    const dilazione = esito.raccomandazioni.find((r) => r.leva === 'DILAZIONE');
    expect(dilazione).toBeDefined();
    expect(dilazione!.realizzabileDaSola).toBe(true);

    // Applicando il numero di mesi suggerito, il piano diventa viabile.
    const mesiSuggeriti = Math.ceil(
      (input.totaleDebitiProposta * 12) / risultato.flussoDisponibile
    );
    const rigenerato = calcolaRedigente({ ...input, numeroRateMedie: mesiSuggeriti });
    expect(rigenerato.viabile).toBe(true);
  });

  it('entità del debito: portandolo al valore suggerito il piano regge', () => {
    const input = inputSano();
    const risultato = calcolaRedigente(input);
    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    const entita = esito.raccomandazioni.find((r) => r.leva === 'ENTITA_DEBITO');
    expect(entita).toBeDefined();

    const debitoSostenibile = (risultato.flussoDisponibile * input.numeroRateMedie) / 12;
    const rigenerato = calcolaRedigente({ ...input, totaleDebitiProposta: debitoSostenibile });
    expect(rigenerato.dscr).not.toBeNull();
    expect(rigenerato.dscr!).toBeCloseTo(1, 5);
  });

  it('flusso non positivo: la dilazione da sola non basta (obiettivo nullo)', () => {
    // Costi che divorano il valore della produzione → flusso ≤ 0.
    const input = inputSano({ costiProduzioneAltri: 1200000 });
    const risultato = calcolaRedigente(input);
    expect(risultato.flussoDisponibile).toBeLessThanOrEqual(0);

    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    const dilazione = esito.raccomandazioni.find((r) => r.leva === 'DILAZIONE');
    expect(dilazione!.realizzabileDaSola).toBe(false);
    expect(dilazione!.valoreObiettivo).toBeNull();
  });

  it('costi operativi: la riduzione suggerita porta il flusso a coprire la rata', () => {
    const input = inputSano();
    const risultato = calcolaRedigente(input);
    const esito = calcolaRaccomandazioniRedigente(input, risultato);
    const costi = esito.raccomandazioni.find((r) => r.leva === 'COSTI');
    expect(costi).toBeDefined();

    if (costi!.realizzabileDaSola) {
      const t = (input.aliquotaImposteSulReddito + input.aliquotaIrap) / 100;
      const gap = risultato.rataAnnua - risultato.flussoDisponibile;
      const riduzione = gap / (1 - t);
      // La riduzione ricade sui "costi altri" (una delle componenti dei costi operativi).
      const rigenerato = calcolaRedigente({
        ...input,
        costiProduzioneAltri: input.costiProduzioneAltri - riduzione,
      });
      expect(rigenerato.flussoDisponibile).toBeGreaterThanOrEqual(risultato.rataAnnua - 1);
    }
  });
});
