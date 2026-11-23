import { describe, expect, it } from 'vitest';
import { NUMERI_POSIZIONE_DEMO } from './numeriPosizioneDemo';
import { PERCORSO_DEMO } from './percorsoEnte';

// La demo e i test non possono divergere: i numeri che la composizione della
// Posizione usa sono questi, e qui si verifica che restino coerenti con
// l'azienda demo e con le sue posizioni.

describe('numeri della posizione demo', () => {
  const tessitura = PERCORSO_DEMO.find(
    (a) => a.ragioneSociale === NUMERI_POSIZIONE_DEMO.ragioneSociale
  );

  it('l’azienda esiste nel percorso demo, con il credito delle sue posizioni', () => {
    expect(tessitura).toBeDefined();
    // La certificazione è la fonte a monte: la somma delle posizioni demo.
    const totale = tessitura!.debiti.reduce((somma, d) => somma + d.importo, 0);
    expect(NUMERI_POSIZIONE_DEMO.certificazione).toBe(totale);
    expect(NUMERI_POSIZIONE_DEMO.credito).toBe(NUMERI_POSIZIONE_DEMO.certificazione);
  });

  it('lo scoperto è il credito meno la cassa, e il recupero minimo non lo supera', () => {
    expect(NUMERI_POSIZIONE_DEMO.scoperto).toBe(
      NUMERI_POSIZIONE_DEMO.credito - NUMERI_POSIZIONE_DEMO.disponibilita
    );
    expect(NUMERI_POSIZIONE_DEMO.recuperoMinimo).toBeLessThan(NUMERI_POSIZIONE_DEMO.credito);
    expect(NUMERI_POSIZIONE_DEMO.recuperoMinimo).toBeGreaterThan(0);
  });
});
