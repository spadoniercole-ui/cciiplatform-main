import { describe, expect, it } from 'vitest';
import { parametriElaborazione, valoreIpotesi } from './riepilogoElaborazione';
import type { IpotesiPiano } from './piano';

describe('valoreIpotesi', () => {
  it('scrive percentuali con il segno, aliquote e importi con la loro unità', () => {
    expect(valoreIpotesi('ricaviVendite', { tipo: 'pct', valore: 3 })).toBe('+3%');
    expect(valoreIpotesi('costiOperativi', { tipo: 'pct', valore: -2.5 })).toBe('-2,5%');
    expect(valoreIpotesi('aliquotaImposte', { tipo: 'abs', valore: 27.9 })).toBe('27,9%');
    expect(valoreIpotesi('investimenti', { tipo: 'abs', valore: 25000 })).toBe('25.000 €');
  });
});

describe('parametriElaborazione', () => {
  it('scrive il percorso anno per anno quando il valore cambia', () => {
    const ipotesi: IpotesiPiano = {
      ricaviVendite: [
        { tipo: 'pct', valore: 3, motivazione: 'crescita del settore' },
        { tipo: 'pct', valore: 4 },
        { tipo: 'pct', valore: 4 },
      ],
    };
    const [p] = parametriElaborazione(ipotesi, 3, 2027);
    expect(p.riga).toBe('ricaviVendite');
    expect(p.etichetta).toBe('Ricavi delle vendite e delle prestazioni');
    expect(p.percorso).toBe('2027 +3% · 2028 +4% · 2029 +4%');
    expect(p.motivazione).toBe('crescita del settore');
  });

  it('riassume in una riga il valore uguale per tutti gli anni', () => {
    const ipotesi: IpotesiPiano = {
      costiOperativi: [
        { tipo: 'pct', valore: 1 },
        { tipo: 'pct', valore: 1 },
        { tipo: 'pct', valore: 1 },
      ],
    };
    expect(parametriElaborazione(ipotesi, 3, 2027)[0].percorso).toBe(
      '+1% in tutti gli anni del piano'
    );
  });

  it('salta le righe senza valori e rispetta l’orizzonte', () => {
    const ipotesi: IpotesiPiano = {
      ricaviVendite: [{ tipo: 'pct', valore: 2 }, null, { tipo: 'pct', valore: 5 }],
      debitiBanche: [null, null, null],
    };
    const out = parametriElaborazione(ipotesi, 3, 2027);
    expect(out.map((p) => p.riga)).toEqual(['ricaviVendite']);
    expect(out[0].percorso).toBe('2027 +2% · 2029 +5%');
    expect(parametriElaborazione(ipotesi, 1, 2027)[0].percorso).toBe(
      '+2% in tutti gli anni del piano'
    );
  });

  it('mette in coda il costo del personale, che non è una manopola', () => {
    const ipotesi: IpotesiPiano = {
      costiPersonale: [{ tipo: 'abs', valore: 360000 }],
      ricaviVendite: [{ tipo: 'pct', valore: 2 }],
    };
    const out = parametriElaborazione(ipotesi, 1, 2027);
    expect(out.map((p) => p.riga)).toEqual(['ricaviVendite', 'costiPersonale']);
  });
});
