import { describe, expect, it } from 'vitest';
import { segnalazioniAmministrative } from './segnalazioni';

describe('segnalazioni della verifica amministrativa', () => {
  it('parla solo della check list e del debito, mai del bilancio', () => {
    const s = segnalazioniAmministrative({
      checklist: { totale: 20, risposte: 20, mancanti: 0 },
      debito: { totale: 120000, memorizzatoIl: '2026-11-16' },
    });
    expect(s.map((x) => x.stato)).toEqual(['OK', 'OK']);
    expect(s[0].testo).toContain('completa, 20 risposte su 20');
    expect(s[1].testo).toContain('120.000 €');
    const tutto = s.map((x) => x.testo).join(' ');
    expect(tutto).not.toMatch(/bilancio|indici/i);
  });

  it('la percentuale pesata si aggiunge quando c’è; se manca non si scrive', () => {
    const con = segnalazioniAmministrative({
      checklist: { totale: 10, risposte: 10, mancanti: 0 },
      debito: null,
      percentualeCriticita: 35,
    });
    expect(con[0].testo).toContain('Criticità pesata al 35%.');
    const senza = segnalazioniAmministrative({
      checklist: { totale: 10, risposte: 10, mancanti: 0 },
      debito: null,
    });
    expect(senza[0].testo).not.toContain('pesata');
  });

  it('le lacune sono attenzione, non silenzio', () => {
    const s = segnalazioniAmministrative({
      checklist: { totale: 20, risposte: 17, mancanti: 3 },
      debito: null,
    });
    expect(s[0].stato).toBe('ATTENZIONE');
    expect(s[0].testo).toContain('mancano 3 risposte su 20');
    expect(s[1].stato).toBe('MANCANTE');
    expect(s[1].testo).toContain('non è ancora accertato');
  });

  it('senza check list non si dice «completa»: la dimensione è assente', () => {
    const senza = segnalazioniAmministrative({ checklist: null, debito: null });
    expect(senza[0].stato).toBe('MANCANTE');
    const vuota = segnalazioniAmministrative({
      checklist: { totale: 0, risposte: 0, mancanti: 0 },
      debito: null,
    });
    expect(vuota[0].stato).toBe('MANCANTE');
    expect(vuota[0].testo).toContain('nessuna domanda');
  });
});
