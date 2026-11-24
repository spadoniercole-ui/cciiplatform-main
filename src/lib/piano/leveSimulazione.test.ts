import { describe, expect, it } from 'vitest';
import {
  ETICHETTA_LEVA,
  LEVE,
  LEVE_PREDEFINITE,
  contaLeve,
  leveValide,
  misuraSuggerita,
  testoLeve,
} from './leveSimulazione';
import {
  PARAMETRI_CONTESTO_ESEMPIO,
  parametriContestoValidi,
  testoParametriContesto,
  validaParametriContesto,
  valoreContesto,
} from './parametriContesto';

describe('parametri del contesto', () => {
  it('gli esempi sono voci senza valori: la cifra la scrive l’ente', () => {
    expect(PARAMETRI_CONTESTO_ESEMPIO.length).toBeGreaterThanOrEqual(6);
    expect(PARAMETRI_CONTESTO_ESEMPIO.map((p) => p.descrizione)).toContain('Inflazione attesa');
    expect(PARAMETRI_CONTESTO_ESEMPIO.every((p) => p.valore === '')).toBe(true);
    expect(PARAMETRI_CONTESTO_ESEMPIO.some((p) => p.tipo === 'TENDENZA')).toBe(true);
  });

  it('butta le righe senza descrizione e tiene quelle con il valore vuoto', () => {
    const righe = parametriContestoValidi([
      { descrizione: '  Inflazione  ', valore: '2,1', tipo: 'PERCENTUALE' },
      { descrizione: '   ', valore: '10', tipo: 'IMPORTO' },
      { descrizione: 'Spread', valore: '', tipo: 'PERCENTUALE' },
      { descrizione: 'Tipo ignoto', valore: '3', tipo: 'ALTRO' },
    ]);
    expect(righe.map((r) => r.descrizione)).toEqual(['Inflazione', 'Spread', 'Tipo ignoto']);
    expect(righe[2].tipo).toBe('PERCENTUALE');
  });

  it('scrive il valore nella forma dichiarata, e «non indicato» quando manca', () => {
    expect(valoreContesto({ descrizione: 'x', valore: '2,1', tipo: 'PERCENTUALE' })).toBe('2,1%');
    expect(valoreContesto({ descrizione: 'x', valore: '2,1%', tipo: 'PERCENTUALE' })).toBe('2,1%');
    expect(valoreContesto({ descrizione: 'x', valore: '1,85', tipo: 'IMPORTO' })).toBe('1,85 €');
    expect(valoreContesto({ descrizione: 'x', valore: 'in aumento', tipo: 'TENDENZA' })).toBe(
      'in aumento'
    );
    expect(valoreContesto({ descrizione: 'x', valore: '', tipo: 'TENDENZA' })).toBe(
      'valore non indicato'
    );
  });

  it('il testo del prompt è vuoto senza voci, e le elenca quando ci sono', () => {
    expect(testoParametriContesto([])).toBe('');
    const testo = testoParametriContesto([
      { descrizione: 'Inflazione attesa', valore: '2,1', tipo: 'PERCENTUALE' },
      { descrizione: 'Tecnologia', valore: 'in crescita', tipo: 'TENDENZA' },
    ]);
    expect(testo).toContain('Inflazione attesa: 2,1% (percentuale)');
    expect(testo).toContain('Tecnologia: in crescita (previsione a tendere)');
  });

  it('rifiuta una riga senza descrizione e un tipo che non esiste', () => {
    const errori = validaParametriContesto([
      { descrizione: '', valore: '1', tipo: 'IMPORTO' },
      { descrizione: 'x', valore: '1', tipo: 'BO' },
    ]);
    expect(errori).toHaveLength(2);
    expect(validaParametriContesto([{ descrizione: 'ok', valore: '', tipo: 'TENDENZA' }])).toEqual(
      []
    );
  });
});

describe('leve della simulazione', () => {
  it('sono cinque, ognuna con la sua misura suggerita', () => {
    expect(LEVE).toHaveLength(5);
    expect(LEVE.map((l) => ETICHETTA_LEVA[l.id])).toEqual([
      'tagli del personale',
      'investimenti in tecnologia',
      'diversificazione della produzione',
      'diversificazione dei mercati',
      'cambio del target di clientela',
    ]);
    for (const l of LEVE) expect(l.suggeritaPct).toBeGreaterThan(0);
    expect(misuraSuggerita('PERSONALE')).toBe(10);
  });

  it('parte con tutte le leve spente e la misura suggerita pronta', () => {
    expect(contaLeve(LEVE_PREDEFINITE)).toBe(0);
    expect(LEVE_PREDEFINITE.PRODUZIONE).toEqual({ attiva: false, misura: 15 });
  });

  it('tiene la misura dentro 0-100 e ignora ciò che non è una scelta', () => {
    const l = leveValide({
      PERSONALE: { attiva: true, misura: 140 },
      MERCATI: { attiva: 'sì', misura: -3 },
      ALTRO: { attiva: true, misura: 99 },
    });
    expect(l.PERSONALE).toEqual({ attiva: true, misura: 100 });
    expect(l.MERCATI).toEqual({ attiva: false, misura: 0 });
    expect(l.TECNOLOGIA).toEqual({ attiva: false, misura: 5 });
  });

  it('nel prompt entrano solo le leve accese, con la misura', () => {
    expect(testoLeve(LEVE_PREDEFINITE)).toBe('');
    const testo = testoLeve(
      leveValide({ PERSONALE: { attiva: true, misura: 12 }, TECNOLOGIA: { attiva: false } })
    );
    expect(testo).toContain('Tagli del personale: SÌ, 12%');
    expect(testo).not.toContain('Investimenti in tecnologia');
    expect(testo).toContain('riduzione dell’organico');
  });
});
