import { describe, expect, it } from 'vitest';
import {
  AZIENDE_PERCORSO_DEMO,
  DIRETTRICI_DEMO,
  PERCORSO_DEMO,
  TRIAGE_DEMO,
  bundleDemo,
} from './percorsoEnte';

describe('percorso demo dell’ente', () => {
  it('contiene due percorsi e una terza azienda ferma all’amministrativa', () => {
    // TRE AZIENDE, TRE TAPPE (0.256.0): la completa, quella che arriva alla
    // contabile e quella che si ferma alla verifica amministrativa.
    expect(PERCORSO_DEMO).toHaveLength(2);
    expect(AZIENDE_PERCORSO_DEMO).toBe(3);
    const tutte = [...PERCORSO_DEMO, TRIAGE_DEMO];
    expect(new Set(tutte.map((a) => a.ragioneSociale)).size).toBe(3);
    expect(new Set(tutte.map((a) => a.codiceFiscale)).size).toBe(3);
    for (const a of tutte) {
      expect(a.ragioneSociale).toContain('Demo');
      expect(a.pec).toContain('esempio.it');
    }
  });

  it('la terza azienda è ferma alla verifica amministrativa', () => {
    expect(TRIAGE_DEMO.ragioneSociale).toBe('Logistica Padana Demo S.r.l.');
    expect(TRIAGE_DEMO.profilo).toBe('ATTENZIONE_MINIMA');
    expect(TRIAGE_DEMO.dataVerifica).toMatch(/^2026-\d{2}-\d{2}$/);
    expect('screening' in TRIAGE_DEMO).toBe(false);
    expect('scenario' in TRIAGE_DEMO).toBe(false);
    expect(TRIAGE_DEMO.debiti.length).toBeGreaterThan(0);
    // Le posizioni portano la TS: senza, il triage non avrebbe una materia su
    // cui lavorare e la demo mostrerebbe un elenco muto.
    for (const d of TRIAGE_DEMO.debiti) {
      expect(d.categoria).toBeTruthy();
      expect(d.periodo).toBeTruthy();
    }
  });

  it('dichiara dove finisce ogni percorso', () => {
    expect(PERCORSO_DEMO.map((a) => a.profondita)).toEqual(['COMPLETA', 'CONTABILE']);
    // La contabile si ferma prima dello scenario: la sua verifica aziendale
    // non è ancora una base della proposta.
    expect(PERCORSO_DEMO[1].verifiche?.baseAziendale).toBe(false);
    expect(PERCORSO_DEMO[1].scenariAggiuntivi ?? []).toHaveLength(0);
  });

  it('copre i due esiti del semaforo con bilanci coerenti', () => {
    const esiti = PERCORSO_DEMO.map((a) => bundleDemo(a, 'corrente').severity);
    expect(esiti).toEqual(['RED', 'YELLOW']);
  });

  it('la soglia INPS è superata solo dalla prima posizione', () => {
    const soglia = (a: (typeof PERCORSO_DEMO)[number]) =>
      (a.soglie.contributiDovutiAnnoPrecedente * 30) / 100 + 15_000;
    expect(PERCORSO_DEMO[0].soglie.contributiScaduti).toBeGreaterThan(soglia(PERCORSO_DEMO[0]));
    expect(PERCORSO_DEMO[1].soglie.contributiScaduti).toBeLessThanOrEqual(soglia(PERCORSO_DEMO[1]));
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
    expect(new Set(PERCORSO_DEMO.map((a) => a.scenario)).size).toBe(2);
    for (const a of PERCORSO_DEMO) {
      expect(a.scenario).toContain('Demo');
      expect(a.dataDepositoProposta).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });

  it('tiene distinte le verifiche dell’azienda dalle nature degli scenari', () => {
    // La differenziazione sta sullo scenario: la Meccanica valuta l'accordo e,
    // in parallelo, il cram down — con le stesse verifiche già fatte.
    const conDue = PERCORSO_DEMO.filter((a) => (a.scenariAggiuntivi ?? []).length > 0);
    expect(conDue).toHaveLength(1);
    expect(conDue[0].tipoIstruttoria).toBe('PROPOSTA');
    expect(conDue[0].scenariAggiuntivi?.[0].tipoIstruttoria).toBe('CRAM_DOWN');

    // Il ritratto completo è uno solo: corredo della contabile e fotografia
    // come base della proposta.
    const conRitrattoCompleto = PERCORSO_DEMO.filter(
      (a) => a.verifiche?.corredoContabile && a.verifiche?.baseAziendale
    );
    expect(conRitrattoCompleto.map((a) => a.ragioneSociale)).toEqual([
      'Meccanica Valsesia Demo S.r.l.',
    ]);

    // La verifica amministrativa non si spegne mai: non esiste un campo per
    // farlo.
    for (const a of PERCORSO_DEMO) expect('amministrativa' in (a.verifiche ?? {})).toBe(false);
  });

  it('il confronto con l’anno precedente mostra il peggioramento della prima posizione', () => {
    expect(bundleDemo(PERCORSO_DEMO[0], 'precedente').severity).not.toBe('RED');
    expect(bundleDemo(PERCORSO_DEMO[1], 'precedente').severity).toBe('GREEN');
  });
});
