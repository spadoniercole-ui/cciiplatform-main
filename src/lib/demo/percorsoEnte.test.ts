import { describe, expect, it } from 'vitest';
import {
  AZIENDE_PERCORSO_DEMO,
  DIRETTRICI_DEMO,
  PERCORSO_DEMO,
  TRIAGE_DEMO,
  bundleDemo,
} from './percorsoEnte';

describe('percorso demo dell’ente', () => {
  it('contiene quattro percorsi completi e una quinta azienda in triage', () => {
    expect(PERCORSO_DEMO).toHaveLength(4);
    expect(AZIENDE_PERCORSO_DEMO).toBe(5);
    const tutte = [...PERCORSO_DEMO, TRIAGE_DEMO];
    expect(new Set(tutte.map((a) => a.ragioneSociale)).size).toBe(5);
    expect(new Set(tutte.map((a) => a.codiceFiscale)).size).toBe(5);
    for (const a of tutte) {
      expect(a.ragioneSociale).toContain('Demo');
      expect(a.pec).toContain('esempio.it');
    }
  });

  it('la quinta azienda è ferma al triage: niente screening né scenario', () => {
    expect(TRIAGE_DEMO.ragioneSociale).toBe('Impianti Adriatica Demo S.r.l.');
    expect(TRIAGE_DEMO.profilo).toBe('ROSSO');
    expect(TRIAGE_DEMO.dataVerifica).toMatch(/^2026-\d{2}-\d{2}$/);
    expect('screening' in TRIAGE_DEMO).toBe(false);
    expect('scenario' in TRIAGE_DEMO).toBe(false);
    expect(TRIAGE_DEMO.debiti.length).toBeGreaterThan(0);
  });

  it('copre i tre esiti del semaforo con bilanci coerenti', () => {
    const esiti = PERCORSO_DEMO.slice(0, 3).map((a) => bundleDemo(a, 'corrente').severity);
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
    expect(new Set(PERCORSO_DEMO.map((a) => a.scenario)).size).toBe(4);
    for (const a of PERCORSO_DEMO) {
      expect(a.scenario).toContain('Demo');
      expect(a.dataDepositoProposta).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });

  it('differenzia i percorsi fissi e lascia aperta la quarta azienda', () => {
    expect(PERCORSO_DEMO.map((a) => a.tipoIstruttoria)).toEqual([
      'PROPOSTA',
      'DECRETO_LIQUIDAZIONE',
      'CRAM_DOWN',
      'DA_CHIEDERE',
    ]);
    expect(PERCORSO_DEMO[1].scenario).toContain('Decreto di liquidazione');
    expect(PERCORSO_DEMO[2].scenario).toContain('Cram down');
    expect(PERCORSO_DEMO[3].scenario).toContain('Valutazione aperta');
    expect(PERCORSO_DEMO[3].aperta).toBe(true);
  });

  it('il confronto con l’anno precedente mostra il peggioramento dei primi due profili', () => {
    expect(bundleDemo(PERCORSO_DEMO[0], 'precedente').severity).not.toBe('RED');
    expect(bundleDemo(PERCORSO_DEMO[1], 'precedente').severity).toBe('GREEN');
  });

  it('tiene distinte le verifiche dell’azienda dalle nature degli scenari', () => {
    // Le nature sono tutte e quattro rappresentate: accordo, liquidazione,
    // cram down e il caso ancora da chiedere.
    const nature = PERCORSO_DEMO.map((a) => a.tipoIstruttoria);
    expect(new Set(nature)).toEqual(
      new Set(['PROPOSTA', 'DECRETO_LIQUIDAZIONE', 'CRAM_DOWN', 'DA_CHIEDERE'])
    );

    // Tre aziende valutano due atti diversi con le stesse verifiche: è la prova
    // che la differenziazione sta sullo scenario e non sull'azienda. L'accordo
    // è il primo atto per la Meccanica, il secondo per Tessitura e Logistica.
    const conDue = PERCORSO_DEMO.filter((a) => (a.scenariAggiuntivi ?? []).length > 0);
    expect(conDue).toHaveLength(3);
    const accordoPrimo = conDue.filter((a) => a.tipoIstruttoria === 'PROPOSTA');
    const accordoSecondo = conDue.filter((a) =>
      (a.scenariAggiuntivi ?? []).some((s) => s.tipoIstruttoria === 'PROPOSTA')
    );
    expect(accordoPrimo).toHaveLength(1);
    expect(accordoSecondo).toHaveLength(2);

    // Le verifiche sono dell'azienda, non dell'atto: chi dichiara corredo
    // della contabile e base della proposta lo fa una volta per l'azienda, e
    // nella demo è una sola posizione — quella con il ritratto completo.
    const conRitrattoCompleto = conDue.filter(
      (a) => a.verifiche?.corredoContabile && a.verifiche?.baseAziendale
    );
    expect(conRitrattoCompleto.map((a) => a.ragioneSociale)).toEqual([
      'Tessitura Lario Demo S.p.A.',
    ]);

    // La verifica amministrativa non si spegne mai: non esiste un campo per
    // farlo. Le altre due sì, e una azienda della demo ne resta senza.
    const senzaFacoltative = PERCORSO_DEMO.filter(
      (a) => a.verifiche?.contabile === false || a.verifiche?.aziendale === false
    );
    expect(senzaFacoltative).toHaveLength(1);
    for (const a of PERCORSO_DEMO) expect('amministrativa' in (a.verifiche ?? {})).toBe(false);
  });
});
