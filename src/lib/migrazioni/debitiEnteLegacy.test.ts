import { describe, it, expect } from 'vitest';
import { deveRinominareInLegacy } from './debitiEnteLegacy';

describe('migrazione debiti_ente -> legacy', () => {
  it('database MAI migrato: si rinomina', () => {
    // Vecchia tabella per scenario, nessun archivio: è il caso per cui la
    // migrazione è stata scritta.
    expect(deveRinominareInLegacy(true, false)).toBe(true);
  });

  it('database GIÀ migrato: NON si rinomina, anche se scenario_id è tornato', () => {
    // È il difetto reale. Dalla 0.109.58 `scenario_id` esiste di nuovo,
    // perché la Situazione Debitoria è tornata nello scenario: la sua
    // presenza non è più il segnale che la migrazione serva. La tabella
    // legacy è la prova che è già avvenuta.
    expect(deveRinominareInLegacy(true, true)).toBe(false);
  });

  it('nessuna colonna scenario_id: niente da migrare', () => {
    expect(deveRinominareInLegacy(false, false)).toBe(false);
    expect(deveRinominareInLegacy(false, true)).toBe(false);
  });

  it('la migrazione è idempotente: rieseguirla non fa nulla', () => {
    // Prima esecuzione: rinomina. Da allora la legacy esiste, quindi
    // qualunque riesecuzione è un no-op — che è ciò che ci si aspetta da un
    // provisioning chiamato a ogni richiesta.
    const prima = deveRinominareInLegacy(true, false);
    const dopo = deveRinominareInLegacy(true, prima);
    expect(prima).toBe(true);
    expect(dopo).toBe(false);
  });
});
