import { describe, it, expect } from 'vitest';
import { validaSezioniChecklist } from './validazione';

const domandaValida = {
  id: '1.1',
  domanda: 'Esiste un piano di tesoreria?',
  peso: 'STRUTTURALE',
  aCuraDi: 'imprenditore',
};
const sezioneValida = { numero: '1', titolo: 'Organizzazione', domande: [domandaValida] };

describe('validaSezioniChecklist', () => {
  it('accetta un array vuoto (modello "guscio")', () => {
    expect(validaSezioniChecklist([])).toBe(true);
  });

  it('accetta sezioni ben formate, anche senza domande', () => {
    expect(validaSezioniChecklist([sezioneValida])).toBe(true);
    expect(validaSezioniChecklist([{ numero: '2', titolo: 'Vuota', domande: [] }])).toBe(true);
  });

  it('accetta tutti i pesi e i due valori di aCuraDi', () => {
    for (const peso of ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE']) {
      for (const aCuraDi of ['imprenditore', 'esperto']) {
        const s = { ...sezioneValida, domande: [{ ...domandaValida, peso, aCuraDi }] };
        expect(validaSezioniChecklist([s])).toBe(true);
      }
    }
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['un oggetto', { sezioni: [] }],
    ['una stringa JSON', '[]'],
    ['un numero', 42],
  ])('rifiuta un valore che non è un array: %s', (_, valore) => {
    expect(validaSezioniChecklist(valore)).toBe(false);
  });

  it.each([
    ['sezione null', [null]],
    ['sezione stringa', ['1']],
    ['numero numerico', [{ ...sezioneValida, numero: 1 }]],
    ['titolo mancante', [{ numero: '1', domande: [] }]],
    ['domande non array', [{ ...sezioneValida, domande: {} }]],
    ['domande mancanti', [{ numero: '1', titolo: 'x' }]],
  ])('rifiuta una sezione malformata: %s', (_, valore) => {
    expect(validaSezioniChecklist(valore)).toBe(false);
  });

  it.each([
    ['domanda null', null],
    ['id numerico', { ...domandaValida, id: 11 }],
    ['testo mancante', { ...domandaValida, domanda: undefined }],
    ['peso sconosciuto', { ...domandaValida, peso: 'CRITICO' }],
    ['peso minuscolo', { ...domandaValida, peso: 'strutturale' }],
    ['peso numerico', { ...domandaValida, peso: 3 }],
    ['aCuraDi sconosciuto', { ...domandaValida, aCuraDi: 'revisore' }],
    ['aCuraDi mancante', { ...domandaValida, aCuraDi: undefined }],
  ])('rifiuta una domanda malformata: %s', (_, domanda) => {
    expect(validaSezioniChecklist([{ ...sezioneValida, domande: [domanda] }])).toBe(false);
  });

  it('basta una sezione invalida per rifiutare tutto', () => {
    expect(validaSezioniChecklist([sezioneValida, { numero: '2' }])).toBe(false);
  });

  it.todo(
    'id di domanda duplicati (due domande "1.1") sono accettati: le risposte, indicizzate per ' +
      'id, si sovrapporrebbero'
  );
  it.todo('id o testo di domanda vuoti ("") sono accettati');
});
