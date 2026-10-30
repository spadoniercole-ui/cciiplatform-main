import { describe, expect, it } from 'vitest';
import {
  etichettaFonte,
  filtraVistaContributi,
  filtroVistaDaParam,
  riepilogoVistaContributi,
  vistaContributiSpazio,
} from './vistaSpazio';

const azienda = (
  id: number,
  nome: string,
  anni: Parameters<typeof vistaContributiSpazio>[0][0]['anni'],
  origine: 'file' | 'posizioni' | 'valori' = 'file'
) => ({
  aziendaId: id,
  ragioneSociale: nome,
  anni,
  origine,
  ricostruitaIl: null,
});

describe('vistaContributiSpazio', () => {
  it('riconosce la crescita tra la prima e l’ultima quota calcolabile', () => {
    const [riga] = vistaContributiSpazio([
      azienda(1, 'ARETUSEA', [
        { anno: 2023, dovuti: 50_840, scaduti: 15_200, oltre90: 15_200 },
        { anno: 2024, dovuti: 41_820, scaduti: 17_000, oltre90: 17_000 },
        { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: 44_471 },
      ]),
    ]);
    expect(riga.inCrescita).toBe(true);
    expect(riga.prima).toEqual({ anno: 2023, quota: 15_200 / 50_840 });
    expect(riga.variazionePunti).toBeCloseTo(62.02, 1);
    expect(riga.oltre90).toBe(76_671);
    expect(riga.anniConRitardo).toEqual([2023, 2024, 2025]);
  });

  it('una quota che scende non è una crescita', () => {
    const [riga] = vistaContributiSpazio([
      azienda(2, 'IN CALO', [
        { anno: 2023, dovuti: 40_000, scaduti: 30_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 12_000 },
      ]),
    ]);
    expect(riga.inCrescita).toBe(false);
    expect(riga.variazionePunti).toBeCloseTo(-51, 5);
  });

  it('con una sola quota non c’è crescita: c’è un dato', () => {
    const [riga] = vistaContributiSpazio([
      azienda(3, 'UNA SOLA', [{ anno: 2025, dovuti: 48_380, scaduti: 44_471 }]),
    ]);
    expect(riga.quote).toHaveLength(1);
    expect(riga.variazionePunti).toBeNull();
    expect(riga.inCrescita).toBe(false);
  });

  it('salta gli anni senza rapporto, invece di trattarli come zero', () => {
    const [riga] = vistaContributiSpazio([
      azienda(4, 'BUCHI', [
        { anno: 2022, dovuti: 100_000, scaduti: null },
        { anno: 2023, dovuti: 50_000, scaduti: 10_000 },
        { anno: 2024, dovuti: null, scaduti: 30_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 20_000 },
      ]),
    ]);
    expect(riga.quote.map((q) => q.anno)).toEqual([2023, 2025]);
    expect(riga.inCrescita).toBe(true);
    expect(riga.variazionePunti).toBeCloseTo(20, 5);
  });

  it('distingue il ritardo misurato a zero dal ritardo non misurato', () => {
    const [zero, nonMisurato] = vistaContributiSpazio([
      azienda(
        5,
        'MISURATO ZERO',
        [
          { anno: 2024, dovuti: 50_000, scaduti: 10_000, oltre90: 0 },
          { anno: 2025, dovuti: 50_000, scaduti: 12_000, oltre90: 0 },
        ],
        'file'
      ),
      azienda(
        6,
        'NON MISURATO',
        [
          { anno: 2024, dovuti: 50_000, scaduti: 10_000 },
          { anno: 2025, dovuti: 50_000, scaduti: 12_000 },
        ],
        'posizioni'
      ),
    ]);
    expect(zero.oltre90).toBe(0);
    expect(zero.anniConRitardo).toEqual([]);
    expect(nonMisurato.oltre90).toBeNull();
    expect(nonMisurato.anniConRitardo).toEqual([]);
  });

  it('ordina prima le crescite più forti, poi le altre per nome', () => {
    const righe = vistaContributiSpazio([
      azienda(1, 'ZETA', [{ anno: 2023, dovuti: 50_000, scaduti: 5_000 }]),
      azienda(2, 'DEBOLE', [
        { anno: 2023, dovuti: 50_000, scaduti: 10_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 12_000 },
      ]),
      azienda(3, 'FORTE', [
        { anno: 2023, dovuti: 50_000, scaduti: 5_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 40_000 },
      ]),
      azienda(4, 'ALFA', [
        { anno: 2023, dovuti: 50_000, scaduti: 20_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 10_000 },
      ]),
    ]);
    expect(righe.map((r) => r.ragioneSociale)).toEqual(['FORTE', 'DEBOLE', 'ALFA', 'ZETA']);
  });
});

describe('riepilogoVistaContributi', () => {
  it('conta le aziende, le crescite e chi ha un ritardo misurato positivo', () => {
    const righe = vistaContributiSpazio([
      azienda(1, 'CRESCE CON RITARDO', [
        { anno: 2023, dovuti: 50_000, scaduti: 10_000, oltre90: 9_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 30_000, oltre90: 28_000 },
      ]),
      azienda(2, 'CRESCE SENZA RITARDO', [
        { anno: 2023, dovuti: 50_000, scaduti: 10_000, oltre90: 0 },
        { anno: 2025, dovuti: 50_000, scaduti: 12_000, oltre90: 0 },
      ]),
      azienda(3, 'SCENDE NON MISURATO', [
        { anno: 2023, dovuti: 50_000, scaduti: 20_000 },
        { anno: 2025, dovuti: 50_000, scaduti: 10_000 },
      ]),
    ]);
    expect(riepilogoVistaContributi(righe)).toEqual({
      aziende: 3,
      inCrescita: 2,
      conRitardo: 1,
      oltre90Totale: 37_000,
    });
  });

  it('senza ritardo misurato il totale resta null, non zero', () => {
    const righe = vistaContributiSpazio([
      azienda(1, 'SENZA MISURA', [{ anno: 2025, dovuti: 50_000, scaduti: 20_000 }]),
    ]);
    expect(riepilogoVistaContributi(righe).oltre90Totale).toBeNull();
  });
});

describe('filtroVistaDaParam', () => {
  it('accetta i filtri previsti e ricade su «tutte» per il resto', () => {
    expect(filtroVistaDaParam('crescita')).toBe('crescita');
    expect(filtroVistaDaParam(['ritardo', 'crescita'])).toBe('ritardo');
    expect(filtroVistaDaParam('interessanti')).toBe('interessanti');
    expect(filtroVistaDaParam('boh')).toBe('tutte');
    expect(filtroVistaDaParam(undefined)).toBe('tutte');
  });
});

describe('filtraVistaContributi', () => {
  // Tre aziende, una per caso: chi cresce, chi ha solo il ritardo misurato,
  // chi non ha né l'uno né l'altro.
  const righe = vistaContributiSpazio([
    azienda(1, 'CRESCE', [
      { anno: 2023, dovuti: 50_000, scaduti: 10_000, oltre90: 0 },
      { anno: 2025, dovuti: 50_000, scaduti: 30_000, oltre90: 0 },
    ]),
    azienda(2, 'RITARDO', [
      { anno: 2023, dovuti: 50_000, scaduti: 20_000, oltre90: 18_000 },
      { anno: 2025, dovuti: 50_000, scaduti: 10_000, oltre90: 9_000 },
    ]),
    azienda(3, 'NESSUNA DELLE DUE', [{ anno: 2025, dovuti: 50_000, scaduti: 20_000 }]),
  ]);

  it('«crescita» e «ritardo» non si sovrappongono', () => {
    expect(filtraVistaContributi(righe, 'crescita').map((r) => r.ragioneSociale)).toEqual([
      'CRESCE',
    ]);
    expect(filtraVistaContributi(righe, 'ritardo').map((r) => r.ragioneSociale)).toEqual([
      'RITARDO',
    ]);
  });

  it('«interessanti» tiene la crescita O il ritardo, e scarta il resto', () => {
    expect(filtraVistaContributi(righe, 'interessanti').map((r) => r.ragioneSociale)).toEqual([
      'CRESCE',
      'RITARDO',
    ]);
  });

  it('il ritardo a zero o non misurato non entra nel filtro', () => {
    // La terza azienda ha il rapporto calcolabile ma nessun ritardo misurato:
    // «non lo so» non è «sì».
    expect(filtraVistaContributi(righe, 'ritardo')).toHaveLength(1);
    expect(filtraVistaContributi(righe, 'interessanti')).toHaveLength(2);
  });

  it('«tutte» conserva l’ordine della vista', () => {
    expect(filtraVistaContributi(righe, 'tutte')).toEqual(righe);
  });
});

describe('etichettaFonte', () => {
  const riga = (anni: Parameters<typeof vistaContributiSpazio>[0][0]['anni']) =>
    vistaContributiSpazio([
      { aziendaId: 1, ragioneSociale: 'X', anni, origine: 'file', ricostruitaIl: null },
    ])[0];

  it('dichiara entrambi i file solo se entrambi hanno dato un anno', () => {
    expect(etichettaFonte(riga([{ anno: 2024, dovuti: 50_000, scaduti: 20_000 }]))).toBe(
      'DM10 / inadempienze'
    );
  });

  it('con un solo lato non nomina l’altro file', () => {
    expect(etichettaFonte(riga([{ anno: 2024, dovuti: null, scaduti: 20_000 }]))).toBe(
      'lista inadempienze'
    );
    expect(etichettaFonte(riga([{ anno: 2024, dovuti: 50_000, scaduti: null }]))).toBe(
      'DM10 (denunce)'
    );
    expect(etichettaFonte(riga([{ anno: 2024, dovuti: null, scaduti: null }]))).toBe(
      'file senza importi'
    );
  });
});
