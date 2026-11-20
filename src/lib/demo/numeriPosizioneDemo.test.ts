import { describe, expect, it } from 'vitest';
import { NUMERI_POSIZIONE_DEMO } from './numeriPosizioneDemo';
import { PERCORSO_DEMO } from './percorsoEnte';

// La demo e i test non possono divergere: i numeri che la pagina della
// Posizione mostra sono questi, e qui si verifica che restino coerenti con
// l'azienda demo e fra loro.

describe('numeri della posizione demo', () => {
  const tessitura = PERCORSO_DEMO.find(
    (a) => a.ragioneSociale === NUMERI_POSIZIONE_DEMO.ragioneSociale
  );

  it('l’azienda esiste nel percorso demo, con il credito dell’ente', () => {
    expect(tessitura).toBeDefined();
    const rigaEnte = tessitura!.propostaCreditori?.find((r) => r.rilevanteEnte);
    expect(rigaEnte?.dovuto).toBe(NUMERI_POSIZIONE_DEMO.credito);
    // La certificazione è la fonte a monte: nella demo coincide col credito.
    expect(NUMERI_POSIZIONE_DEMO.certificazione).toBe(NUMERI_POSIZIONE_DEMO.credito);
  });

  it('lo scoperto è il credito meno la cassa, e il recupero minimo non lo supera', () => {
    expect(NUMERI_POSIZIONE_DEMO.scoperto).toBe(
      NUMERI_POSIZIONE_DEMO.credito - NUMERI_POSIZIONE_DEMO.disponibilita
    );
    expect(NUMERI_POSIZIONE_DEMO.recuperoMinimo).toBeLessThan(NUMERI_POSIZIONE_DEMO.credito);
    expect(NUMERI_POSIZIONE_DEMO.recuperoMinimo).toBeGreaterThan(0);
  });
});
