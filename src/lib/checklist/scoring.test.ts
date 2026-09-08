import { describe, it, expect } from 'vitest';
import { calcolaQuadroQualitativo } from './scoring';
import type { SezioneChecklist } from './ministeriale';

const sezioniProva: SezioneChecklist[] = [
  {
    numero: '1',
    titolo: 'Sezione di prova',
    domande: [
      { id: '1.1', aCuraDi: 'imprenditore', domanda: 'Domanda strutturale', peso: 'STRUTTURALE' },
      { id: '1.2', aCuraDi: 'imprenditore', domanda: 'Domanda rilevante', peso: 'RILEVANTE' },
      { id: '1.3', aCuraDi: 'imprenditore', domanda: 'Domanda documentale', peso: 'DOCUMENTALE' },
    ],
  },
];

describe('calcolaQuadroQualitativo', () => {
  it('restituisce "non ancora valutabile" se nessuna domanda ha risposta', () => {
    const risultato = calcolaQuadroQualitativo(sezioniProva, {});
    expect(risultato.percentualeCriticitaComplessiva).toBeNull();
    expect(risultato.coloreEtichetta).toBe('grigio');
  });

  it('nessuna criticità se tutte le risposte sono Sì', () => {
    const risultato = calcolaQuadroQualitativo(sezioniProva, {
      '1.1': { domandaId: '1.1', risposta: true },
      '1.2': { domandaId: '1.2', risposta: true },
      '1.3': { domandaId: '1.3', risposta: true },
    });
    expect(risultato.percentualeCriticitaComplessiva).toBe(0);
    expect(risultato.coloreEtichetta).toBe('verde');
    expect(risultato.criticitaStrutturaliAperte).toHaveLength(0);
  });

  it('un "No" su una domanda strutturale finisce tra le criticità strutturali aperte', () => {
    const risultato = calcolaQuadroQualitativo(sezioniProva, {
      '1.1': { domandaId: '1.1', risposta: false },
      '1.2': { domandaId: '1.2', risposta: true },
    });
    expect(risultato.criticitaStrutturaliAperte).toHaveLength(1);
    expect(risultato.criticitaStrutturaliAperte[0].id).toBe('1.1');
    // Solo le due domande risposte contano: peso 3 (strutturale, No) su
    // punti massimi 3+2=5 → 60% di criticità sulle domande valutate finora.
    expect(risultato.percentualeCriticitaComplessiva).toBe(60);
  });

  it('le domande non ancora risposte non contribuiscono al punteggio', () => {
    const risultato = calcolaQuadroQualitativo(sezioniProva, {
      '1.1': { domandaId: '1.1', risposta: true },
    });
    expect(risultato.sezioni[0].domandeRisposte).toBe(1);
    expect(risultato.percentualeCriticitaComplessiva).toBe(0);
  });
});
