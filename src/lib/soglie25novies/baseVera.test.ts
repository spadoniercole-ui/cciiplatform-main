import { describe, expect, it } from 'vitest';
import { baseInpsDaVera, GIORNI_RITARDO_SOGLIA_INPS } from './baseVera';

const riga = (over: Partial<Parameters<typeof baseInpsDaVera>[0][number]> = {}) => ({
  voce: 'Denunce non trasmesse',
  periodo: '03/2026',
  importo: 1_000,
  stato: '',
  trattamento: 'contabilizzato',
  contributi: 1_000,
  ambito: 'INPS',
  ...over,
});

// Verifica del 29/10/2026: il versamento di 03/2026 scade il 16/04/2026, cioè
// 196 giorni prima — oltre la soglia. Quello di 09/2026 scade il 16/10, 13
// giorni prima: la denuncia è in ritardo, ma non oltre i 90 giorni.
const VERIFICA = '2026-10-29';

describe('baseInpsDaVera', () => {
  it('separa il debito scaduto da oltre 90 giorni da quello recente', () => {
    const b = baseInpsDaVera(
      [
        riga({ periodo: '03/2026', contributi: 11_859.71, importo: 11_859.71 }),
        riga({ periodo: '09/2026', contributi: 4_878.74, importo: 4_878.74 }),
      ],
      VERIFICA
    );
    expect(b.misurabile).toBe(true);
    expect(b.scadutiOltre90).toBeCloseTo(11_859.71, 2);
    expect(b.partiteOltre90).toBe(1);
    expect(b.periodiOltre90).toEqual(['2026/03']);
    expect(b.recenti).toBeCloseTo(4_878.74, 2);
  });

  it('la soglia è quella dell’art. 25-novies: oltre 90 giorni, non 30', () => {
    expect(GIORNI_RITARDO_SOGLIA_INPS).toBe(90);
    // 16/07/2026 → 29/10/2026 = 105 giorni: oltre i 90, dentro la soglia.
    const b = baseInpsDaVera([riga({ periodo: '06/2026' })], VERIFICA);
    expect(b.scadutiOltre90).toBe(1_000);
  });

  it('senza quota di contributi vale l’importo della riga', () => {
    const b = baseInpsDaVera([riga({ contributi: null, importo: 750.01 })], VERIFICA);
    expect(b.scadutiOltre90).toBeCloseTo(750.01, 2);
  });

  it('le sanzioni, i ruoli, le sospese e gli importi ignoti restano fuori', () => {
    const b = baseInpsDaVera(
      [
        riga({ contributi: 0, importo: 400 }), // riga senza contributi: non forma la base
        riga({ ambito: 'AGENTE_RISCOSSIONE', importo: 23_600 }),
        riga({ trattamento: 'ignora', importo: 6_990.45 }),
        riga({ trattamento: 'sospeso', importo: 3_000 }),
      ],
      VERIFICA
    );
    expect(b.scadutiOltre90).toBe(0);
    expect(b.partiteOltre90).toBe(0);
  });

  it('le partite senza periodo si dichiarano a parte, non si datano a caso', () => {
    const b = baseInpsDaVera(
      [riga({ periodo: '03/2026' }), riga({ periodo: '', importo: 500, contributi: null })],
      VERIFICA
    );
    expect(b.scadutiOltre90).toBe(1_000);
    expect(b.partiteSenzaPeriodo).toBe(1);
    expect(b.senzaPeriodo).toBe(500);
  });

  it('senza periodi nel file il ritardo non è misurabile', () => {
    const b = baseInpsDaVera([riga({ periodo: '' })], VERIFICA);
    expect(b.misurabile).toBe(false);
    expect(b.scadutiOltre90).toBe(0);
  });

  it('il periodo scritto come data ISO si legge lo stesso', () => {
    const b = baseInpsDaVera([riga({ periodo: '2026-03-01' })], VERIFICA);
    expect(b.scadutiOltre90).toBe(1_000);
    expect(b.periodiOltre90).toEqual(['2026/03']);
  });
});
