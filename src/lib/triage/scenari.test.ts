import { describe, it, expect } from 'vitest';
import {
  calcolaScenari,
  PARAMETRI_VUOTI,
  rigaPerRango,
  validaParametri,
  type ParametriScenari,
} from './scenari';

const parametri = (over: Partial<ParametriScenari> = {}): ParametriScenari => ({
  costiProceduraPct: 10,
  ranghi: [
    { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 60, cramDownPct: 40 },
    { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 20, cramDownPct: 15 },
    { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: null, cramDownPct: null },
    { rango: 'POSTERGATO', tassoLiquidazionePct: null, cramDownPct: null },
  ],
  ...over,
});

describe('parametri degli scenari', () => {
  it('rifiuta percentuali fuori scala e accetta lo zero', () => {
    expect(validaParametri(parametri())).toEqual([]);
    expect(validaParametri(parametri({ costiProceduraPct: 120 }))[0]).toContain(
      'spese di procedura'
    );
    expect(
      validaParametri({
        costiProceduraPct: 0,
        ranghi: [{ rango: 'CHIROGRAFARIO', tassoLiquidazionePct: -1, cramDownPct: 0 }],
      })[0]
    ).toContain('tasso di realizzo');
    expect(rigaPerRango(parametri(), 'POSTERGATO')?.tassoLiquidazionePct).toBeNull();
    expect(rigaPerRango(PARAMETRI_VUOTI, 'PRIVILEGIATO')).not.toBeNull();
  });
});

describe('confronto fra le due ipotesi', () => {
  it('la liquidazione sottrae le spese, il cram down no', () => {
    const esito = calcolaScenari({
      credito: 100_000,
      rango: 'PRIVILEGIATO',
      parametri: parametri(),
    });
    // 100.000 × 60% = 60.000; spese 10% = 6.000; netto 54.000.
    expect(esito.liquidazione.lordo).toBe(60_000);
    expect(esito.liquidazione.costi).toBe(6_000);
    expect(esito.liquidazione.netto).toBe(54_000);
    expect(esito.cramDown.netto).toBe(40_000);
    expect(esito.cramDown.costi).toBeNull();
    expect(esito.confronto?.differenza).toBe(14_000);
    expect(esito.confronto?.testo).toContain('liquidazione restituirebbe');
  });

  it('senza le spese di procedura la liquidazione non si calcola, e lo dice', () => {
    const esito = calcolaScenari({
      credito: 100_000,
      rango: 'CHIROGRAFARIO',
      parametri: parametri({ costiProceduraPct: null }),
    });
    expect(esito.liquidazione.calcolabile).toBe(false);
    expect(esito.liquidazione.netto).toBeNull();
    expect(esito.liquidazione.motivo).toContain('spese di procedura');
    expect(esito.cramDown.calcolabile).toBe(true);
    expect(esito.confronto).toBeNull();
    expect(esito.calcolabile).toBe(false);
  });

  it('un rango senza percentuali non diventa zero: resta non calcolabile', () => {
    const esito = calcolaScenari({ credito: 50_000, rango: 'POSTERGATO', parametri: parametri() });
    expect(esito.liquidazione.calcolabile).toBe(false);
    expect(esito.liquidazione.percentuale).toBeNull();
    expect(esito.cramDown.calcolabile).toBe(false);
    expect(esito.mancanti.join(' ')).toContain('cram down');
  });

  it('senza credito o senza rango nessuna ipotesi si inventa', () => {
    const senzaCredito = calcolaScenari({
      credito: null,
      rango: 'PRIVILEGIATO',
      parametri: parametri(),
    });
    expect(senzaCredito.calcolabile).toBe(false);
    expect(senzaCredito.mancanti[0]).toContain('esposizione');

    const senzaRango = calcolaScenari({ credito: 1_000, rango: null, parametri: parametri() });
    expect(senzaRango.calcolabile).toBe(false);
    expect(senzaRango.mancanti.join(' ')).toContain('rango');
  });

  it('una percentuale dello zero per cento è un valore, non un dato mancante', () => {
    const esito = calcolaScenari({
      credito: 10_000,
      rango: 'CHIROGRAFARIO',
      parametri: parametri({
        ranghi: [{ rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 0, cramDownPct: 0 }],
      }),
    });
    expect(esito.liquidazione.calcolabile).toBe(true);
    expect(esito.liquidazione.netto).toBe(0);
    expect(esito.cramDown.calcolabile).toBe(true);
    expect(esito.cramDown.netto).toBe(0);
    expect(esito.confronto?.differenza).toBe(0);
  });
});
