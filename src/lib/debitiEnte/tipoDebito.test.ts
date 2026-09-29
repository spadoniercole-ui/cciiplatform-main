import { describe, it, expect } from 'vitest';
import {
  etichettaTipoDebito,
  raggruppaPerTipoDebito,
  saldoRigaDebitoEnte,
  type RigaDebitoEnteConTipo,
} from './tipoDebito';

describe('saldoRigaDebitoEnte', () => {
  it('con importoVersato null il saldo coincide con l’importo', () => {
    expect(saldoRigaDebitoEnte({ importo: 1000, importoVersato: null })).toBe(1000);
  });

  it('con importoVersato 0 il saldo coincide con l’importo', () => {
    expect(saldoRigaDebitoEnte({ importo: 1000, importoVersato: 0 })).toBe(1000);
  });

  it('sottrae il versato dall’importo', () => {
    expect(saldoRigaDebitoEnte({ importo: 1000, importoVersato: 250 })).toBe(750);
  });

  it('versato pari all’importo → saldo zero', () => {
    expect(saldoRigaDebitoEnte({ importo: 1000, importoVersato: 1000 })).toBe(0);
  });

  it('versato maggiore dell’importo: il saldo è limitato a 0, non negativo', () => {
    expect(saldoRigaDebitoEnte({ importo: 1000, importoVersato: 1200 })).toBe(0);
  });

  it('riga a credito (importo negativo) resta invariata', () => {
    expect(saldoRigaDebitoEnte({ importo: -50, importoVersato: null })).toBe(-50);
    expect(saldoRigaDebitoEnte({ importo: -50, importoVersato: 0 })).toBe(-50);
    expect(saldoRigaDebitoEnte({ importo: -50, importoVersato: 20 })).toBe(-50);
  });
});

describe('etichettaTipoDebito', () => {
  it('senza codice restituisce "Non classificato"', () => {
    expect(etichettaTipoDebito(null)).toBe('Non classificato');
    expect(etichettaTipoDebito(undefined)).toBe('Non classificato');
    expect(etichettaTipoDebito('')).toBe('Non classificato');
  });

  it('l’etichetta personalizzata ha la precedenza sul fallback statico', () => {
    expect(etichettaTipoDebito('CLE', { CLE: 'Debito esigibile' })).toBe('Debito esigibile');
  });

  it('fallback statico per i quattro codici legacy', () => {
    expect(etichettaTipoDebito('CEA')).toBe('CEA — Certo, Esigibile, Agente della Riscossione');
  });

  it('codice sconosciuto senza etichetta → codice grezzo', () => {
    expect(etichettaTipoDebito('AVA')).toBe('AVA');
  });
});

describe('raggruppaPerTipoDebito', () => {
  const righe: RigaDebitoEnteConTipo[] = [
    { voce: 'Contributi 2022', importo: 1000, importoVersato: 200, tipo: 'DEBITO' },
    { voce: 'Avviso bonario', importo: 300, tipo: 'AVA' },
    { voce: 'Contributi 2023', importo: 500, importoVersato: null, tipo: 'DEBITO' },
    { voce: 'Legacy', importo: 50.5, importoVersato: 0.5, tipo: 'CLE' },
  ];

  it('raggruppa per codice in ordine di comparsa con conteggi e totali', () => {
    const esito = raggruppaPerTipoDebito(righe);
    expect(esito.map((e) => e.tipo)).toEqual(['DEBITO', 'AVA', 'CLE']);
    const debito = esito[0];
    expect(debito.numeroRighe).toBe(2);
    expect(debito.totale).toBe(1500);
    expect(debito.totaleSaldo).toBe(1300);
    expect(esito[1]).toMatchObject({ numeroRighe: 1, totale: 300, totaleSaldo: 300 });
    expect(esito[2].totale).toBeCloseTo(50.5, 10);
    expect(esito[2].totaleSaldo).toBeCloseTo(50, 10);
  });

  it('senza importoVersato su nessuna riga totaleSaldo coincide con totale', () => {
    const esito = raggruppaPerTipoDebito([
      { voce: 'a', importo: 10, tipo: 'X' },
      { voce: 'b', importo: 20, tipo: 'X' },
    ]);
    expect(esito).toHaveLength(1);
    expect(esito[0].totale).toBe(30);
    expect(esito[0].totaleSaldo).toBe(30);
  });

  it('applica le etichette personalizzate e ricade su statico/codice grezzo', () => {
    const esito = raggruppaPerTipoDebito(righe, { DEBITO: 'Debito contributivo' });
    expect(esito.find((e) => e.tipo === 'DEBITO')?.etichetta).toBe('Debito contributivo');
    expect(esito.find((e) => e.tipo === 'AVA')?.etichetta).toBe('AVA');
    expect(esito.find((e) => e.tipo === 'CLE')?.etichetta).toBe('CLE — Certo, Liquido, Esigibile');
  });

  it('ordineCodici impone l’ordine e fa comparire le categorie vuote elencate', () => {
    const esito = raggruppaPerTipoDebito(righe, undefined, ['AVA', 'NEUTRO', 'DEBITO']);
    expect(esito.map((e) => e.tipo)).toEqual(['AVA', 'NEUTRO', 'DEBITO', 'CLE']);
    expect(esito[1]).toMatchObject({ numeroRighe: 0, totale: 0, totaleSaldo: 0 });
  });

  it('nessuna riga e nessun ordine → elenco vuoto', () => {
    expect(raggruppaPerTipoDebito([])).toEqual([]);
  });

  it('versato maggiore dell’importo: la riga non riduce il saldo delle altre', () => {
    const esito = raggruppaPerTipoDebito([
      { voce: 'pagata in eccesso', importo: 100, importoVersato: 150, tipo: 'DEBITO' },
      { voce: 'aperta', importo: 300, importoVersato: null, tipo: 'DEBITO' },
    ]);
    expect(esito[0].totale).toBe(400);
    expect(esito[0].totaleSaldo).toBe(300);
  });
});
