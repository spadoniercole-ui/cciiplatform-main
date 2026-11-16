import { describe, expect, it } from 'vitest';
import { pianoInEssere, type FlussoPerPiano } from './pianoInEssere';

// Il piano che l'azienda sta già eseguendo non diventa uno scenario numerico:
// diventa un'avvertenza accanto all'accordo.

const flusso = (patch: Partial<FlussoPerPiano> = {}): FlussoPerPiano => ({
  ente: 'INPS',
  flusso: 'Contributi',
  attesi: 12,
  senzaDenuncia: 0,
  senzaDelega: 0,
  sospesi: 0,
  completo: true,
  ...patch,
});

describe('piano in essere', () => {
  it('tutti i periodi coperti: rispettato, senza avvertenza', () => {
    const p = pianoInEssere({ esiti: [flusso()] });
    expect(p.stato).toBe('RISPETTATO');
    expect(p.avvertenza).toBeNull();
    expect(p.dettaglio).toContain('12 periodi attesi');
  });

  it('periodi senza denuncia o senza delega: in ritardo, con i numeri', () => {
    const p = pianoInEssere({
      esiti: [flusso({ senzaDenuncia: 2, senzaDelega: 1, completo: false })],
    });
    expect(p.stato).toBe('IN_RITARDO');
    expect(p.dettaglio).toContain('2 periodi senza denuncia');
    expect(p.dettaglio).toContain('1 periodo senza delega');
    expect(p.avvertenza).toContain('non risulta rispettato');
  });

  it('matricola sospesa senza ritardi: sospeso, e i periodi esclusi non dimostrano nulla', () => {
    const p = pianoInEssere({ esiti: [flusso()], sospensioniAttive: 2 });
    expect(p.stato).toBe('SOSPESO');
    expect(p.avvertenza).toContain('non dimostrano');
  });

  it('nessun flusso configurato: non disponibile, non «rispettato»', () => {
    const p = pianoInEssere({ esiti: [] });
    expect(p.stato).toBe('NON_DISPONIBILE');
    expect(p.avvertenza).toBeNull();
    expect(p.dettaglio).toContain('Nessun flusso');
  });

  it('più flussi: somma i periodi e conta quanti sono completi', () => {
    const p = pianoInEssere({
      esiti: [flusso(), flusso({ ente: 'INAIL', attesi: 4, senzaDelega: 1, completo: false })],
    });
    expect(p.stato).toBe('IN_RITARDO');
    expect(p.dettaglio).toContain('16 periodi attesi');
    expect(p.dettaglio).toContain('1/2 flussi completi');
  });
});
