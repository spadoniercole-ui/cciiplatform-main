import { describe, expect, it } from 'vitest';
import { AZIENDE_PERCORSO_DEMO, DIRETTRICI_DEMO, PERCORSO_DEMO, bundleDemo } from './percorsoEnte';

describe('percorso demo dell’ente', () => {
  it('contiene tre aziende distinte, riconoscibili come demo', () => {
    expect(PERCORSO_DEMO).toHaveLength(3);
    expect(AZIENDE_PERCORSO_DEMO).toBe(3);
    expect(new Set(PERCORSO_DEMO.map((a) => a.ragioneSociale)).size).toBe(3);
    expect(new Set(PERCORSO_DEMO.map((a) => a.codiceFiscale)).size).toBe(3);
    for (const a of PERCORSO_DEMO) {
      expect(a.ragioneSociale).toContain('Demo');
      expect(a.pec).toContain('esempio.it');
    }
  });

  it('copre i tre esiti del semaforo con bilanci coerenti', () => {
    const esiti = PERCORSO_DEMO.map((a) => bundleDemo(a, 'corrente').severity);
    expect(esiti).toEqual(['RED', 'YELLOW', 'GREEN']);
  });

  it('la soglia INPS è superata solo dalla prima posizione', () => {
    const soglia = (a: (typeof PERCORSO_DEMO)[number]) =>
      (a.soglie.contributiDovutiAnnoPrecedente * 30) / 100 + 15_000;
    expect(PERCORSO_DEMO[0].soglie.contributiScaduti).toBeGreaterThan(soglia(PERCORSO_DEMO[0]));
    expect(PERCORSO_DEMO[1].soglie.contributiScaduti).toBeLessThanOrEqual(soglia(PERCORSO_DEMO[1]));
    expect(PERCORSO_DEMO[2].soglie.contributiScaduti).toBeLessThanOrEqual(soglia(PERCORSO_DEMO[2]));
  });

  it('ogni screening è completo: sezioni, domande e risposte coincidono', () => {
    for (const a of PERCORSO_DEMO) {
      expect(a.screening.sezioni).toHaveLength(DIRETTRICI_DEMO.length);
      const domande = a.screening.sezioni.flatMap((s) => s.domande);
      expect(domande.length).toBeGreaterThan(0);
      expect(a.screening.risposte.map((r) => r.domandaId).sort()).toEqual(
        domande.map((d) => d.id).sort()
      );
      for (const r of a.screening.risposte) {
        expect(typeof r.risposta).toBe('boolean');
      }
      expect(a.screening.relazione.length).toBeGreaterThan(120);
    }
  });

  it('la visura riporta gli stessi identificativi dell’anagrafica', () => {
    for (const a of PERCORSO_DEMO) {
      expect(a.visura.denominazione).toBe(a.ragioneSociale);
      expect(a.visura.codiceFiscale).toBe(a.codiceFiscale);
      expect(a.visura.capitaleSociale).toBe(a.capitaleSociale);
    }
  });

  it('gli scenari hanno nomi distinti e una data di deposito valida', () => {
    expect(new Set(PERCORSO_DEMO.map((a) => a.scenario)).size).toBe(3);
    for (const a of PERCORSO_DEMO) {
      expect(a.scenario).toContain('Demo');
      expect(a.dataDepositoProposta).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });

  it('il confronto con l’anno precedente mostra il peggioramento dei primi due profili', () => {
    expect(bundleDemo(PERCORSO_DEMO[0], 'precedente').severity).not.toBe('RED');
    expect(bundleDemo(PERCORSO_DEMO[1], 'precedente').severity).toBe('GREEN');
  });
});
