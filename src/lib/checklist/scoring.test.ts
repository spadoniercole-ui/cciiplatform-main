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

describe('calcolaQuadroQualitativo — soglie dell’etichetta', () => {
  // Pesi personalizzati per ottenere percentuali esatte: una domanda No di peso
  // `pctNo` e una Sì di peso 100 - pctNo → criticità pctNo%.
  const sezioniSoglie: SezioneChecklist[] = [
    {
      numero: '1',
      titolo: 'Soglie',
      domande: [
        { id: 'no', aCuraDi: 'esperto', domanda: 'No', peso: 'STRUTTURALE' },
        { id: 'si', aCuraDi: 'esperto', domanda: 'Sì', peso: 'RILEVANTE' },
      ],
    },
  ];
  const risposteSoglie = {
    no: { domandaId: 'no', risposta: false },
    si: { domandaId: 'si', risposta: true },
  };
  const conPercentuale = (pctNo: number) =>
    calcolaQuadroQualitativo(sezioniSoglie, risposteSoglie, {
      STRUTTURALE: pctNo,
      RILEVANTE: 100 - pctNo,
      DOCUMENTALE: 1,
    });

  it.each([
    [1, 'verde', 'Criticità contenute, alcune aree di attenzione'],
    [20, 'verde', 'Criticità contenute, alcune aree di attenzione'],
    [21, 'giallo', 'Piano da rafforzare su più punti'],
    [50, 'giallo', 'Piano da rafforzare su più punti'],
    [51, 'rosso', 'Criticità strutturali rilevanti'],
    [100, 'rosso', 'Criticità strutturali rilevanti'],
  ])('criticità %d%% → %s', (pct, colore, etichetta) => {
    const q = conPercentuale(pct);
    expect(q.percentualeCriticitaComplessiva).toBe(pct);
    expect(q.coloreEtichetta).toBe(colore);
    expect(q.etichetta).toBe(etichetta);
  });

  it('criticità 0% → "Nessuna criticità rilevata"', () => {
    const q = conPercentuale(0);
    expect(q.percentualeCriticitaComplessiva).toBe(0);
    expect(q.etichetta).toBe('Nessuna criticità rilevata');
    expect(q.coloreEtichetta).toBe('verde');
  });

  it('la percentuale è arrotondata prima del confronto con la soglia (20,4% → 20 → verde)', () => {
    // 0,204 × 100 = 20,4 → arrotondato a 20
    const q = calcolaQuadroQualitativo(sezioniSoglie, risposteSoglie, {
      STRUTTURALE: 204,
      RILEVANTE: 796,
      DOCUMENTALE: 1,
    });
    expect(q.percentualeCriticitaComplessiva).toBe(20);
    expect(q.coloreEtichetta).toBe('verde');
  });

  it('le soglie sono personalizzabili', () => {
    const q = calcolaQuadroQualitativo(
      sezioniSoglie,
      risposteSoglie,
      { STRUTTURALE: 30, RILEVANTE: 70, DOCUMENTALE: 1 },
      { solido: 10, daRafforzare: 30 }
    );
    expect(q.coloreEtichetta).toBe('giallo');
  });

  it('sezione senza domande → percentuale di sezione null', () => {
    const q = calcolaQuadroQualitativo([{ numero: '9', titolo: 'Vuota', domande: [] }], {});
    expect(q.sezioni[0].percentualeCriticita).toBeNull();
    expect(q.percentualeCriticitaComplessiva).toBeNull();
  });
});
