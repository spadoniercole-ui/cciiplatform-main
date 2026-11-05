import { describe, expect, it } from 'vitest';
import { PARAMETRI_DEMO } from './parametriEnte';

describe('parametri del percorso demo', () => {
  it('porta la soglia dell’ente e il riscontro della proposta', () => {
    const soglie = PARAMETRI_DEMO.tabelle.parametri_soglie_25novies.righe[0];
    const limiti = PARAMETRI_DEMO.tabelle.limiti_ricevibilita.righe[0];

    expect(soglie.inps_percentuale).toBe('0.30');
    expect(soglie.inps_importo_con_lavoratori).toBe('15000');
    expect(limiti.categoria_creditore).toBe('__ENTE__');
    expect(limiti.percentuale_minima).toBe(100);
    expect(limiti.ente_25novies).toBe('INPS');
  });

  it('porta le ipotesi degli scenari per rango e le schede XBRL', () => {
    const ranghi = PARAMETRI_DEMO.tabelle.parametri_scenari_rango.righe;
    const abilitate = PARAMETRI_DEMO.tabelle.xbrl_tab_abilitate.righe;

    expect(ranghi).toHaveLength(4);
    expect(ranghi.find((r) => r.rango === 'PRIVILEGIATO')).toMatchObject({
      tasso_liquidazione_pct: '30.5',
      cram_down_pct: '50',
    });
    expect(ranghi.find((r) => r.rango === 'CHIROGRAFARIO')).toMatchObject({
      tasso_liquidazione_pct: '6.4',
      cram_down_pct: '20',
    });
    expect(abilitate.every((t) => t.abilitato === true)).toBe(true);
    expect(PARAMETRI_DEMO.tabelle.parametri_scenari.righe[0].costi_procedura_pct).toBe('20');
  });
});
