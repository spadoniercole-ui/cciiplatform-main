import { describe, expect, it } from 'vitest';
import {
  chiaveDipendenza,
  dipendenzeSosia,
  grafiaGiaUsata,
  nomeDipendenza,
  registroDipendenze,
} from './dipendenze';

describe('chiaveDipendenza', () => {
  it('maiuscole, spazi, accenti e punteggiatura non distinguono due uffici', () => {
    const attesa = chiaveDipendenza('Presidio flussi informativi');
    expect(chiaveDipendenza('PRESIDIO  FLUSSI INFORMATIVI')).toBe(attesa);
    expect(chiaveDipendenza('  Presidio flussi informativi  ')).toBe(attesa);
    expect(chiaveDipendenza('Presidio qualità flussi informativi')).toBe(
      chiaveDipendenza('PRESIDIO QUALITA FLUSSI INFORMATIVI')
    );
    expect(chiaveDipendenza("Ufficio dell'ente")).toBe(chiaveDipendenza('Ufficio dell ente'));
  });

  it('due uffici diversi restano diversi', () => {
    expect(chiaveDipendenza('Presidio flussi informativi')).not.toBe(
      chiaveDipendenza('Presidio qualità flussi informativi')
    );
    expect(chiaveDipendenza('')).toBe('');
    expect(chiaveDipendenza(null)).toBe('');
  });
});

describe('nomeDipendenza', () => {
  it('compatta gli spazi e toglie i bordi', () => {
    expect(nomeDipendenza('  Ufficio   legale ')).toBe('Ufficio legale');
    expect(nomeDipendenza(null)).toBe('');
  });
});

describe('registroDipendenze', () => {
  it('tiene una grafia sola per ufficio, la prima incontrata, in ordine', () => {
    const registro = registroDipendenze([
      'Presidio flussi informativi',
      'PRESIDIO FLUSSI INFORMATIVI',
      'Ufficio legale',
      null,
      '   ',
      'presidio  flussi  informativi',
    ]);
    expect(registro.map((r) => r.nome)).toEqual(['Presidio flussi informativi', 'Ufficio legale']);
  });

  it('la grafia già usata si ritrova anche scritta diversamente', () => {
    const registro = registroDipendenze(['Ufficio Legale', 'Presidio qualità flussi']);
    expect(grafiaGiaUsata('ufficio legale', registro)).toBe('Ufficio Legale');
    expect(grafiaGiaUsata('  UFFICIO   LEGALE ', registro)).toBe('Ufficio Legale');
    expect(grafiaGiaUsata('Ufficio contenzioso', registro)).toBeNull();
    expect(grafiaGiaUsata(null, registro)).toBeNull();
  });
});

describe('dipendenzeSosia', () => {
  it('riconosce lo stesso ufficio scritto con e senza articoli', () => {
    const gruppi = dipendenzeSosia([
      'Presidio dei flussi informativi',
      'PRESIDIO FLUSSI INFORMATIVI',
      'Ufficio legale',
    ]);
    expect(gruppi).toEqual([['Presidio dei flussi informativi', 'PRESIDIO FLUSSI INFORMATIVI']]);
  });

  it('segnala anche il nome che aggiunge una parola, senza unire nulla', () => {
    const gruppi = dipendenzeSosia([
      'Presidio flussi informativi',
      'Presidio qualità flussi informativi',
      'Gestione del credito',
    ]);
    expect(gruppi).toEqual([
      ['Presidio flussi informativi', 'Presidio qualità flussi informativi'],
    ]);
  });

  it('un nome solo o di una parola non fa gruppo', () => {
    expect(dipendenzeSosia(['Presidio', 'Ufficio legale'])).toEqual([]);
    expect(dipendenzeSosia(['Ufficio'])).toEqual([]);
    expect(dipendenzeSosia([])).toEqual([]);
  });

  it('due uffici davvero distinti non finiscono insieme', () => {
    expect(dipendenzeSosia(['Ufficio legale', 'Gestione credito'])).toEqual([]);
  });
});
