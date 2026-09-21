import { describe, it, expect } from 'vitest';
import {
  STRUMENTI_PROPOSTA,
  calcolaQuotaAltriAderenti,
  componiQuota,
  inquadraProposta,
  dataIsoValida,
  enteCreditoreDaEnteSpazio,
  nomeIndicaCreditorePubblico,
  type RigaPerQuota,
} from './inquadramento';

const riga = (
  categoriaCreditore: string,
  importoDovuto: number,
  adesione: RigaPerQuota['adesione'],
  importoAderente: number | null = null
): RigaPerQuota => ({ categoriaCreditore, importoDovuto, adesione, importoAderente });

// 1.000.000 di indebitamento: 400k pubblico, 600k altri.
const RIGHE: RigaPerQuota[] = [
  riga('INPS', 250_000, 'PUBBLICO'),
  riga('Agenzia delle Entrate', 150_000, 'PUBBLICO'),
  riga('Banche', 300_000, 'ADERENTE'),
  riga('Fornitori', 300_000, 'ADERENTE', 50_000),
];

describe('quota degli altri aderenti, calcolata dalle righe', () => {
  it('somma solo gli altri creditori aderenti, sul totale di tutte le righe', () => {
    const q = calcolaQuotaAltriAderenti(RIGHE);
    expect(q.calcolabile).toBe(true);
    expect(q.numeratore).toBe(350_000);
    expect(q.denominatore).toBe(1_000_000);
    expect(q.quota).toBeCloseTo(0.35, 10);
  });

  it('il creditore pubblico non entra mai nel numeratore, anche se "aderisce"', () => {
    const q = calcolaQuotaAltriAderenti([
      riga('INPS', 900_000, 'PUBBLICO'),
      riga('Fornitori', 100_000, 'NON_ADERENTE'),
    ]);
    expect(q.quota).toBe(0);
  });

  it('una riga puo’ aderire solo in parte, mai oltre il dovuto', () => {
    const q = calcolaQuotaAltriAderenti([riga('Fornitori', 100_000, 'ADERENTE', 250_000)]);
    expect(q.numeratore).toBe(100_000);
    expect(q.quota).toBe(1);
  });

  it('voti incompleti ai due lati del 25%: il calcolo si ferma, nessun default silenzioso', () => {
    // certi 5% (50k), potenziali 5% + 40% non espressi
    const q = calcolaQuotaAltriAderenti([
      riga('INPS', 550_000, 'PUBBLICO'),
      riga('Fornitori', 50_000, 'ADERENTE'),
      riga('Banche', 400_000, null),
    ]);
    expect(q.calcolabile).toBe(false);
    expect(q.quota).toBeNull();
    expect(q.quotaCerta).toBeCloseTo(0.05, 10);
    expect(q.quotaPotenziale).toBeCloseTo(0.45, 10);
    expect(q.righeSenzaAdesione).toEqual(['Banche']);
  });

  it('voti incompleti ma dallo stesso lato del 25%: la soglia e’ gia’ determinata', () => {
    const q = calcolaQuotaAltriAderenti([...RIGHE, riga('Leasing', 40_000, null)]);
    expect(q.calcolabile).toBe(true);
    expect(q.quota).toBeCloseTo(350_000 / 1_040_000, 10);
    expect(q.quotaPotenziale).toBeCloseTo(390_000 / 1_040_000, 10);
  });

  it('senza righe o con totale zero non e’ calcolabile', () => {
    expect(calcolaQuotaAltriAderenti([]).calcolabile).toBe(false);
    expect(calcolaQuotaAltriAderenti([riga('X', 0, 'ADERENTE')]).calcolabile).toBe(false);
  });

  it('il valore a mano prevale, e lo scostamento dal calcolo resta visibile', () => {
    const q = componiQuota(RIGHE, 0.2);
    expect(q.valore).toBe(0.2);
    expect(q.origine).toBe('MANUALE');
    expect(q.scostamento).toBe(true);
    // 20% a mano contro 35% calcolato: ai due lati del 25%.
    expect(q.scostamentoCambiaSoglia).toBe(true);
    expect(componiQuota(RIGHE, null).origine).toBe('CALCOLATA');
    expect(componiQuota(RIGHE, 0.4).scostamentoCambiaSoglia).toBe(false);
  });
});

describe('inquadramento della proposta', () => {
  const base = {
    quotaManuale: null,
    righe: RIGHE,
    percorso: 'RICEVENTE' as const,
    enteSpazio: 'INPS' as const,
  };

  it('senza strumento non mostra nessun parametro', () => {
    const r = inquadraProposta({ ...base, strumento: null, dataDeposito: '2026-03-01' });
    expect(r.stato).toBe('DA_COMPILARE');
    expect(r.cramDown).toBeNull();
  });

  it('accordo dopo il 28/09/2024, aderenti al 35%: parametro 50%', () => {
    const r = inquadraProposta({ ...base, strumento: 'ADR_57', dataDeposito: '2026-03-01' });
    expect(r.stato).toBe('DETERMINATO');
    expect(r.cramDown?.percentualeMinima).toBe(50);
    expect(r.cramDown?.dilazioneMassimaAnni).toBeNull();
    expect(r.fonti.map((f) => f.id)).toContain('CCII-63-c4');
    expect(r.fonti.every((f) => f.sostieneEsito)).toBe(true);
  });

  it('stessa proposta, quota a mano al 10%: 60% e dieci anni, con avviso sul cambio di soglia', () => {
    const r = inquadraProposta({
      ...base,
      strumento: 'ADR_61',
      dataDeposito: '2026-03-01',
      quotaManuale: 0.1,
    });
    expect(r.cramDown?.percentualeMinima).toBe(60);
    expect(r.cramDown?.dilazioneMassimaAnni).toBe(10);
    expect(r.avvisi.some((a) => a.includes('ai due lati del 25%'))).toBe(true);
  });

  it('le due formule sono diverse: il Ricevente esamina, il Redigente costruisce', () => {
    const ric = inquadraProposta({ ...base, strumento: 'ADR_57', dataDeposito: '2026-03-01' });
    const red = inquadraProposta({
      ...base,
      percorso: 'REDIGENTE',
      strumento: 'ADR_57',
      dataDeposito: '2026-03-01',
    });
    expect(ric.formula).not.toBe(red.formula);
    expect(ric.formula).toContain('lo valuta il tribunale');
    expect(red.formula).toContain('condizione minima');
  });

  it('regime transitorio: parametro riportato, fonte dichiarata non consolidata', () => {
    const r = inquadraProposta({ ...base, strumento: 'ADR_57', dataDeposito: '2024-05-10' });
    expect(r.cramDown?.regime).toBe('transitorio');
    expect(r.cramDown?.percentualeMinima).toBe(30);
    expect(r.fonti.some((f) => !f.sostieneEsito)).toBe(true);
    expect(r.avvisi[0]).toContain('non ancora riscontrata');
  });

  it('senza data, o senza quota calcolabile, la regola si blocca e dice perche’', () => {
    const senzaData = inquadraProposta({ ...base, strumento: 'ADR_57', dataDeposito: null });
    expect(senzaData.stato).toBe('BLOCCATO');
    expect(senzaData.formula).toContain('data di deposito');

    const senzaQuotaRicevente = inquadraProposta({
      ...base,
      strumento: 'ADR_57',
      dataDeposito: '2026-03-01',
      righe: [riga('INPS', 100_000, null)],
    });
    expect(senzaQuotaRicevente.stato).toBe('BLOCCATO');
    expect(senzaQuotaRicevente.avvisi.some((a) => a.includes('attestazione'))).toBe(true);

    const senzaQuota = inquadraProposta({
      ...base,
      percorso: 'REDIGENTE',
      strumento: 'ADR_57',
      dataDeposito: '2026-03-01',
      righe: [riga('INPS', 100_000, null)],
    });
    expect(senzaQuota.stato).toBe('BLOCCATO');
    expect(senzaQuota.cramDown).toBeNull();
    expect(senzaQuota.avvisi.some((a) => a.includes('Intenzione di voto non espressa'))).toBe(true);
  });

  it('composizione negoziata in uno spazio INPS: fuori perimetro, nessun cram down', () => {
    const r = inquadraProposta({ ...base, strumento: 'CN_23_2BIS', dataDeposito: '2026-03-01' });
    expect(r.stato).toBe('DETERMINATO');
    expect(r.cramDown).toBeNull();
    expect(r.perimetro).toHaveLength(1);
    expect(r.perimetro[0].ammesso).toBe(false);
    expect(r.formula).toContain('Non va istruito come transazione contributiva');
  });

  it('composizione negoziata per il Redigente: quattro enti, due dentro e due fuori', () => {
    const r = inquadraProposta({
      ...base,
      percorso: 'REDIGENTE',
      enteSpazio: null,
      strumento: 'CN_23_2BIS',
      dataDeposito: null,
    });
    expect(r.perimetro.filter((p) => p.ammesso).map((p) => p.ente)).toEqual([
      'AGENZIA_ENTRATE',
      'AGENZIA_RISCOSSIONE',
    ]);
    expect(r.perimetro.filter((p) => !p.ammesso).map((p) => p.ente)).toEqual(['INPS', 'INAIL']);
  });

  it('composizione negoziata, Ricevente senza ente dello spazio: bloccato', () => {
    const r = inquadraProposta({
      ...base,
      enteSpazio: null,
      strumento: 'CN_23_2BIS',
      dataDeposito: '2026-03-01',
    });
    expect(r.stato).toBe('BLOCCATO');
  });

  it('strumenti senza regola collaudata: avviso, mai un parametro', () => {
    for (const s of STRUMENTI_PROPOSTA.filter((x) => x.regola === null)) {
      const r = inquadraProposta({ ...base, strumento: s.valore, dataDeposito: '2026-03-01' });
      expect(r.stato).toBe('REGOLA_NON_IN_REGISTRO');
      expect(r.cramDown).toBeNull();
      expect(r.perimetro).toEqual([]);
      expect(r.formula).toContain('Regola non ancora nel registro delle fonti');
    }
  });
});

describe('utilita’', () => {
  it('riconosce solo date esistenti', () => {
    expect(dataIsoValida('2026-02-28')).toBe(true);
    expect(dataIsoValida('2026-02-30')).toBe(false);
    expect(dataIsoValida('28/02/2026')).toBe(false);
  });

  it('dal nome propone "pubblico" solo per fisco e previdenza, non per i privati', () => {
    for (const n of [
      'INPS',
      'Erario - Agenzia delle Entrate',
      'Agenzia Entrate-Riscossione',
      'Debiti tributari',
      'Enti previdenziali',
    ])
      expect(nomeIndicaCreditorePubblico(n)).toBe(true);
    for (const n of [
      'Banca Ipotecaria S.p.A.',
      'Fornitori chirografari',
      'Assicurazioni Generali',
      'Leader S.r.l.',
    ])
      expect(nomeIndicaCreditorePubblico(n)).toBe(false);
  });

  it('uno spazio non pubblico non ha un ente creditore', () => {
    expect(enteCreditoreDaEnteSpazio('NON_PUBBLICO')).toBeNull();
    expect(enteCreditoreDaEnteSpazio('INAIL')).toBe('INAIL');
  });
});
