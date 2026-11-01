import { describe, it, expect } from 'vitest';
import { riepilogoCheckList } from './checkListRiepilogo';

const sezioni = [
  {
    numero: '1',
    titolo: 'Posizione contributiva',
    domande: [
      { id: '1.1', domanda: 'La posizione è priva di versamenti scaduti?' },
      { id: '1.2', domanda: 'Le deleghe di pagamento risultano attive?' },
    ],
  },
  {
    numero: '2',
    titolo: 'Documenti',
    domande: [{ id: '2.1', domanda: 'Il DURC risulta regolare?' }],
  },
];

describe('check list nel riepilogo del triage', () => {
  it('porta le domande con la risposta data, sezione per sezione', () => {
    const r = riepilogoCheckList({
      sezioni,
      risposte: [
        { domandaId: '1.1', risposta: false },
        { domandaId: '1.2', risposta: true },
      ],
    });
    expect(r).not.toBeNull();
    expect(r?.totali).toBe(3);
    expect(r?.risposte).toBe(2);
    expect(r?.sezioni[0].titolo).toBe('Posizione contributiva');
    expect(r?.sezioni[0].domande[0]).toEqual({
      id: '1.1',
      testo: 'La posizione è priva di versamenti scaduti?',
      risposta: false,
    });
  });

  it('una domanda senza risposta resta senza risposta, non diventa un «no»', () => {
    const r = riepilogoCheckList({
      sezioni,
      risposte: [{ domandaId: '2.1', risposta: true }],
    });
    const prima = r?.sezioni[0].domande.find((d) => d.id === '1.1');
    expect(prima?.risposta).toBeNull();
    expect(r?.risposte).toBe(1);
    expect(r?.totali).toBe(3);
  });

  it('l’esito e la data della generazione passano al foglio quando ci sono', () => {
    const r = riepilogoCheckList({
      sezioni,
      risposte: [],
      esito: { etichetta: 'Attenzione moderata', punteggio: -2.5 },
      generatoIl: '2026-10-30T08:12:00.000Z',
    });
    expect(r?.esito?.etichetta).toBe('Attenzione moderata');
    expect(r?.esito?.punteggio).toBe(-2.5);
    expect(r?.generataIl).toBe('2026-10-30T08:12:00.000Z');
  });

  it('senza domande non c’è sezione da stampare', () => {
    expect(riepilogoCheckList({ sezioni: [], risposte: [] })).toBeNull();
    expect(
      riepilogoCheckList({
        sezioni: [{ numero: '1', titolo: 'Vuota', domande: [{ id: '1.1', domanda: '   ' }] }],
        risposte: [],
      })
    ).toBeNull();
  });
});
