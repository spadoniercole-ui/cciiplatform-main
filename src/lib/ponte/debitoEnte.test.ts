import { describe, expect, it } from 'vitest';
import { importoRigaVera, snapshotDebitoEnte } from './debitoEnte';
import type { RigaVera } from '@/lib/debitiEnte/veraImport';

function riga(p: Partial<RigaVera>): RigaVera {
  return {
    sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
    ambito: 'INPS',
    voce: 'Denunce non trasmesse',
    importo: 0,
    categoria: '',
    stato: '',
    trattamento: 'contabilizzato',
    contributi: null,
    sanzioni: null,
    ...p,
  };
}

describe('snapshotDebitoEnte', () => {
  it('separa contabilizzato e da contabilizzare, e li somma nel totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 1000, trattamento: 'contabilizzato', stato: '' }),
      riga({ importo: 500, trattamento: 'da_contabilizzare', stato: 'CALCOLATI' }),
    ]);
    expect(s.contabilizzato).toBe(1000);
    expect(s.daContabilizzare).toBe(500);
    expect(s.totale).toBe(1500);
    expect(s.righe).toBe(2);
  });

  it('una riga con l’importo solo nella composizione non vale zero', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 0, contributi: 1200, sanzioni: 300, trattamento: 'da_contabilizzare' }),
    ]);
    expect(s.totale).toBe(1500);
    expect(s.contributi).toBe(1200);
    expect(s.sanzioni).toBe(300);
  });

  it('le posizioni segnalate si dichiarano e restano fuori dal totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 800, trattamento: 'contabilizzato' }),
      riga({ importo: 0, voce: 'Verbale Evasione', trattamento: 'potenziale' }),
      riga({ importo: 0, voce: 'F24 non presentato', trattamento: 'potenziale' }),
    ]);
    expect(s.totale).toBe(800);
    expect(s.righe).toBe(1);
    expect(s.righeSegnalate).toBe(2);
    expect(s.segnalato).toBe(0);
  });

  it('una segnalata con importo noto non entra comunque nel totale', () => {
    const s = snapshotDebitoEnte([riga({ importo: 400, trattamento: 'potenziale' })]);
    expect(s.totale).toBe(0);
    expect(s.segnalato).toBe(400);
    expect(s.righeSegnalate).toBe(1);
  });

  it('ignorate e sospese restano fuori; i crediti dell’Agente hanno il loro totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 700, trattamento: 'ignora' }),
      riga({ importo: 900, trattamento: 'sospeso' }),
      riga({ importo: 600, ambito: 'AGENTE_RISCOSSIONE', trattamento: 'contabilizzato' }),
    ]);
    expect(s.totale).toBe(600);
    expect(s.creditiAgente).toBe(600);
    expect(s.contributi).toBe(0);
    expect(s.righe).toBe(1);
  });

  it('un debito senza posizioni conteggiabili resta zero, ma senza inventare righe', () => {
    const s = snapshotDebitoEnte([]);
    expect(s.totale).toBe(0);
    expect(s.righe).toBe(0);
    expect(s.righeSegnalate).toBe(0);
  });
});

describe('importoRigaVera', () => {
  it('preferisce l’importo esplicito alla composizione', () => {
    expect(importoRigaVera({ importo: 1000, contributi: 900, sanzioni: 100 })).toBe(1000);
  });

  it('usa la composizione quando l’importo è assente', () => {
    expect(importoRigaVera({ importo: 0, contributi: 900, sanzioni: 100 })).toBe(1000);
  });
});
