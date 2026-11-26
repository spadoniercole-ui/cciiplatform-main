import { afterEach, describe, expect, it } from 'vitest';
import { accessoDemoSenzaMfa } from './demoAccesso';

// Il bypass è un interruttore di sicurezza: se una delle due variabili manca,
// l'MFA deve restare obbligatoria. Il test congela questa regola.
describe('accessoDemoSenzaMfa', () => {
  const salvate = {
    PORTABLE: process.env.PORTABLE,
    DEMO_SENZA_MFA: process.env.DEMO_SENZA_MFA,
  };

  afterEach(() => {
    for (const chiave of ['PORTABLE', 'DEMO_SENZA_MFA'] as const) {
      if (salvate[chiave] === undefined) delete process.env[chiave];
      else process.env[chiave] = salvate[chiave];
    }
  });

  it('richiede PORTABLE=1 e DEMO_SENZA_MFA=1 insieme', () => {
    delete process.env.PORTABLE;
    delete process.env.DEMO_SENZA_MFA;
    expect(accessoDemoSenzaMfa()).toBe(false);

    process.env.PORTABLE = '1';
    expect(accessoDemoSenzaMfa()).toBe(false);

    process.env.DEMO_SENZA_MFA = '1';
    expect(accessoDemoSenzaMfa()).toBe(true);

    process.env.PORTABLE = '0';
    expect(accessoDemoSenzaMfa()).toBe(false);
  });
});
