import { describe, expect, it } from 'vitest';
import { breakEvenAccordo } from './breakEven';

// Due conti, nessuna previsione: il recupero minimo sotto il quale l'accordo
// è peggiore della procedura, e lo scoperto di cassa da colmare.

describe('punto di pareggio dell’accordo', () => {
  it('il recupero minimo è il migliore fra le procedure calcolabili', () => {
    const b = breakEvenAccordo({
      credito: 80_000,
      disponibilita: 30_000,
      flusso: 10_000,
      liquidazioneNetta: 12_000,
      cramDownNetto: 24_000,
    });
    expect(b.recuperoMinimo).toBe(24_000);
    expect(b.proceduraConfronto).toBe('CRAM_DOWN');
    expect(b.scoperto).toBe(50_000);
    expect(b.flussoNecessario).toBe(50_000);
    expect(b.sostenibile).toBe(false);
  });

  it('cassa che copre: scoperto zero e flusso necessario zero', () => {
    const b = breakEvenAccordo({
      credito: 80_000,
      disponibilita: 90_000,
      flusso: 5_000,
      liquidazioneNetta: 12_000,
      cramDownNetto: 24_000,
    });
    expect(b.scoperto).toBe(0);
    expect(b.flussoNecessario).toBe(0);
    expect(b.sostenibile).toBe(true);
    expect(b.dettaglio).toContain('lo scoperto è zero');
  });

  it('una sola procedura calcolabile basta per il confronto', () => {
    const b = breakEvenAccordo({
      credito: 80_000,
      disponibilita: 10_000,
      flusso: null,
      liquidazioneNetta: 12_000,
      cramDownNetto: null,
    });
    expect(b.recuperoMinimo).toBe(12_000);
    expect(b.proceduraConfronto).toBe('LIQUIDAZIONE');
  });

  it('una percentuale che supera il credito è un dato da rivedere: il confronto si ferma al credito', () => {
    const b = breakEvenAccordo({
      credito: 80_000,
      disponibilita: 10_000,
      flusso: 5_000,
      liquidazioneNetta: 100_000,
      cramDownNetto: null,
    });
    expect(b.recuperoMinimo).toBe(80_000);
    expect(b.dettaglio).toContain('più del credito');
  });

  it('senza credito accertato non calcola nulla, e dice perché', () => {
    const b = breakEvenAccordo({
      credito: null,
      disponibilita: 30_000,
      flusso: 10_000,
      liquidazioneNetta: 12_000,
      cramDownNetto: 24_000,
    });
    expect(b.recuperoMinimo).toBeNull();
    expect(b.scoperto).toBeNull();
    expect(b.dettaglio).toContain('non è accertato');
  });

  it('senza cassa lo scoperto non si calcola, ma il recupero minimo sì', () => {
    const b = breakEvenAccordo({
      credito: 80_000,
      disponibilita: null,
      flusso: 10_000,
      liquidazioneNetta: 12_000,
      cramDownNetto: 24_000,
    });
    expect(b.scoperto).toBeNull();
    expect(b.recuperoMinimo).toBe(24_000);
    expect(b.dettaglio).toContain('non è nota');
    expect(b.dettaglio).toContain('recupero');
  });
});
