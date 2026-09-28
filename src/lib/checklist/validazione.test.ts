import { describe, it, expect } from 'vitest';
import { erroreSezioniChecklist, validaSezioniChecklist } from './validazione';

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

  it('rifiuta id di domanda duplicati, anche in sezioni diverse', () => {
    const doppia = [sezioneValida, { ...sezioneValida, numero: '2' }];
    expect(validaSezioniChecklist(doppia)).toBe(false);
    expect(erroreSezioniChecklist(doppia)).toMatch(/"1\.1" è usato più volte/);
    const stessaSezione = [{ ...sezioneValida, domande: [domandaValida, domandaValida] }];
    expect(validaSezioniChecklist(stessaSezione)).toBe(false);
  });

  it.each([
    ['id vuoto', { ...domandaValida, id: '' }, /senza id/],
    ['id solo spazi', { ...domandaValida, id: '  ' }, /senza id/],
    ['testo vuoto', { ...domandaValida, domanda: '' }, /"1\.1" non ha testo/],
    ['testo solo spazi', { ...domandaValida, domanda: ' ' }, /non ha testo/],
  ])('rifiuta %s con un messaggio chiaro', (_, domanda, messaggio) => {
    const sezioni = [{ ...sezioneValida, domande: [domanda] }];
    expect(validaSezioniChecklist(sezioni)).toBe(false);
    expect(erroreSezioniChecklist(sezioni)).toMatch(messaggio);
  });

  it('nessun errore per una struttura valida', () => {
    expect(erroreSezioniChecklist([sezioneValida])).toBeNull();
  });
});
