// src/lib/migrazioni/catalogoTl.test.ts
//
// Il piano della migrazione, senza database: che cosa entra nel catalogo, che
// cosa si scarta, quando l'ufficio si aggancia da solo a una direttrice.

import { describe, expect, it } from 'vitest';
import { chiaveCategoria, pianificaCatalogoTl } from './catalogoTl';

const DIRETTRICI = [
  { nome: 'Gestione del credito', prodotti: ['Diffide'] },
  { nome: 'Presidio dei flussi informativi', prodotti: ['DURC'] },
];

const riga = (patch: Partial<Parameters<typeof pianificaCatalogoTl>[0]['storiche'][0]>) => ({
  id: 1,
  categoria: 'DEBITO',
  lavorazione: 'Contabilizzare',
  destinatario: 'Gestione del credito',
  attivo: true,
  ordine: 1,
  ...patch,
});

describe('pianificaCatalogoTl', () => {
  it('lo stesso codice può produrre più TL: la chiave è la coppia', () => {
    const piano = pianificaCatalogoTl({
      storiche: [
        riga({ id: 1, lavorazione: 'Contabilizzare' }),
        riga({ id: 2, lavorazione: 'Emissione diffida' }),
      ],
      esistenti: [],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe.map((r) => r.descrizione)).toEqual(['Contabilizzare', 'Emissione diffida']);
    expect(new Set(piano.righe.map((r) => r.codice))).toEqual(new Set(['DEBITO']));
  });

  it('aggancia l’ufficio alla direttrice, in qualunque grafia', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({ destinatario: '  GESTIONE  del Credito ' })],
      esistenti: [],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe[0].direttrice).toBe('Gestione del credito');
    expect(piano.fuoriElenco).toEqual([]);
  });

  it('un ufficio fuori elenco non si corregge e non si perde', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({ destinatario: 'Ufficio  Legale ' })],
      esistenti: [],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe[0].direttrice).toBe('Ufficio Legale');
    expect(piano.fuoriElenco).toEqual(['Ufficio Legale']);
  });

  it('non ricopia una TL già in catalogo', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({})],
      esistenti: [{ codice: 'debito', descrizione: 'contabilizzare' }],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe).toEqual([]);
    expect(piano.giaPresenti).toBe(1);
  });

  it('non fa tornare una TL di una categoria cancellata', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({ categoria: 'CANCELLATA' })],
      esistenti: [],
      direttrici: DIRETTRICI,
      categorieValide: ['DEBITO', 'AVA', 'NEUTRO'],
    });

    expect(piano.righe).toEqual([]);
    expect(piano.scartate).toEqual([{ id: 1, motivo: 'categoria non più esistente' }]);
  });

  it('salva il codice nella grafia canonica della categoria', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({ categoria: ' debito ' })],
      esistenti: [],
      direttrici: DIRETTRICI,
      categorieValide: ['DEBITO'],
    });

    expect(piano.righe[0].codice).toBe('DEBITO');
  });

  it('scarta — e dichiara — le righe che non possono diventare una TL', () => {
    const piano = pianificaCatalogoTl({
      storiche: [
        riga({ id: 1, lavorazione: '   ' }),
        riga({ id: 2, destinatario: '' }),
        riga({ id: 3, attivo: false }),
      ],
      esistenti: [],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe).toHaveLength(1);
    expect(piano.righe[0].attivo).toBe(false);
    expect(piano.scartate).toEqual([
      { id: 1, motivo: 'senza descrizione' },
      { id: 2, motivo: 'senza destinatario' },
    ]);
  });

  it('due righe storiche identiche diventano una sola TL', () => {
    const piano = pianificaCatalogoTl({
      storiche: [riga({ id: 1 }), riga({ id: 2 })],
      esistenti: [],
      direttrici: DIRETTRICI,
    });

    expect(piano.righe).toHaveLength(1);
    expect(piano.giaPresenti).toBe(1);
  });
});

describe('chiaveCategoria', () => {
  it('maiuscole e spazi non fanno due categorie', () => {
    expect(chiaveCategoria(' debito ')).toBe('DEBITO');
    expect(chiaveCategoria('Debito')).toBe('DEBITO');
    expect(chiaveCategoria('DEBITO')).toBe('DEBITO');
  });
});
