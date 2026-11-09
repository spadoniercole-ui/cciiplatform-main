import { describe, expect, it } from 'vitest';
import { esitoSalvataggioVera } from './salvataggioVera';

describe('esitoSalvataggioVera', () => {
  it('dichiara il motivo del server e quante righe sono rimaste fuori', () => {
    const e = esitoSalvataggioVera(34, 'violazione del vincolo su azienda_id');
    expect(e.errore).toContain('34 righe');
    expect(e.errore).toContain('NON salvata');
    expect(e.errore).toContain('violazione del vincolo su azienda_id');
    expect(e.errore).toContain('Piano-ponte');
    expect(e.nota).toContain('34 righe lette restano fuori');
  });

  it('senza motivo dal server dice che manca, invece di lasciare il vuoto', () => {
    const e = esitoSalvataggioVera(2, null);
    expect(e.errore).toContain('il server non ha riportato il motivo.');
    expect(e.errore).toContain('2 righe');
  });

  it('usa il singolare quando la riga è una', () => {
    const e = esitoSalvataggioVera(1, undefined);
    expect(e.errore).toContain('(1 riga)');
    expect(e.nota).toContain('1 riga lette');
  });
});
