import { describe, expect, it } from 'vitest';
import {
  SET_DEMO,
  confrontoDaDemo,
  documentiPer,
  letturaDaDemo,
  nomeScenarioDemo,
  setDemoValido,
} from './setGiudice';

describe('set demo per decreto e cram down', () => {
  it('ha due set da tre aziende, tutti diversi', () => {
    expect(setDemoValido('LIQUIDAZIONE')).toBe(true);
    expect(setDemoValido('CRAM_DOWN')).toBe(true);
    expect(setDemoValido('PROPOSTA')).toBe(false);
    expect(SET_DEMO.LIQUIDAZIONE).toHaveLength(3);
    expect(SET_DEMO.CRAM_DOWN).toHaveLength(3);

    const tutte = [...SET_DEMO.LIQUIDAZIONE, ...SET_DEMO.CRAM_DOWN];
    expect(new Set(tutte.map((a) => a.ragioneSociale)).size).toBe(6);
    expect(new Set(tutte.map((a) => a.codiceFiscale)).size).toBe(6);
    expect(tutte.every((a) => a.ragioneSociale.includes('Demo'))).toBe(true);
  });

  it('ogni azienda ha debiti, crediti e percentuali plausibili', () => {
    for (const a of [...SET_DEMO.LIQUIDAZIONE, ...SET_DEMO.CRAM_DOWN]) {
      expect(a.debiti.length).toBeGreaterThan(0);
      expect(a.atto.crediti.length).toBeGreaterThan(0);
      expect(a.atto.speseProceduraPct).toBeGreaterThanOrEqual(0);
      expect(a.atto.speseProceduraPct).toBeLessThanOrEqual(100);
      expect(a.atto.tempiMesi).toBeGreaterThan(0);
      for (const c of a.atto.crediti) {
        expect(c.importo).toBeGreaterThan(0);
        expect(c.percentualeRealizzo).toBeGreaterThanOrEqual(0);
        expect(c.percentualeRealizzo).toBeLessThanOrEqual(100);
      }
      for (const d of a.debiti) expect(d.importo).toBeGreaterThan(0);
    }
  });

  it('la lettura demo riporta gli stessi crediti del provvedimento', () => {
    for (const a of [...SET_DEMO.LIQUIDAZIONE, ...SET_DEMO.CRAM_DOWN]) {
      const lettura = letturaDaDemo(a);
      expect(lettura.crediti).toHaveLength(a.atto.crediti.length);
      expect(lettura.dataAtto).toBe(a.atto.data);
      expect(lettura.speseProceduraPct).toBe(a.atto.speseProceduraPct);
      expect(lettura.crediti[0].documento).toMatch(/\.pdf$/);
    }
  });

  it('almeno un caso per set produce una contestazione, e almeno uno no', () => {
    for (const tipo of ['LIQUIDAZIONE', 'CRAM_DOWN'] as const) {
      const confronti = SET_DEMO[tipo].map(confrontoDaDemo);
      expect(confronti.some((c) => c.elementiContestabili.length > 0)).toBe(true);
      expect(confronti.some((c) => c.perditaTotale !== null)).toBe(true);
    }
    // Il caso Agroalimentare è quello senza difformità: serve a mostrare che
    // il percorso sa dire anche «conforme».
    const agro = SET_DEMO.CRAM_DOWN.find((a) => a.ragioneSociale.includes('Agroalimentare'));
    expect(agro).toBeTruthy();
    expect(confrontoDaDemo(agro!).elementiContestabili).toHaveLength(0);
  });

  it('ogni azienda ha tre documenti PDF distinti e non vuoti', () => {
    for (const tipo of ['LIQUIDAZIONE', 'CRAM_DOWN'] as const) {
      for (const a of SET_DEMO[tipo]) {
        const documenti = documentiPer(a, tipo);
        expect(documenti).toHaveLength(3);
        expect(new Set(documenti.map((d) => d.nome)).size).toBe(3);
        for (const d of documenti) {
          expect(d.nome).toMatch(/\.pdf$/);
          expect(d.righe.length).toBeGreaterThan(5);
          expect(d.righe.join(' ')).toContain('DOCUMENTO DEMO');
          expect(d.righe.join(' ')).toContain(a.ragioneSociale);
        }
      }
    }
  });

  it('il nome dello scenario dice il percorso e l’azienda', () => {
    const a = SET_DEMO.LIQUIDAZIONE[0];
    expect(nomeScenarioDemo(a)).toContain('Liquidazione giudiziale');
    expect(nomeScenarioDemo(a)).toContain(a.ragioneSociale);
    expect(nomeScenarioDemo(SET_DEMO.CRAM_DOWN[0])).toContain('Cram down');
  });
});
