// src/lib/ponte/assunzioniAi.test.ts
//
// Il contratto AI del Ponte: il modello propone, il validatore dispone. Un
// valore fuori intervallo, una motivazione assente o un codice sconosciuto non
// entrano nel Ponte: vengono scartati e dichiarati, mai arrotondati in
// silenzio.

import { describe, expect, it } from 'vitest';
import { motivoPropostaVuota, validaPropostaAi } from './assunzioniAi';
import type { AssunzionePonte } from './types';

const base: AssunzionePonte[] = [
  {
    codice: 'crescitaRicavi',
    etichetta: 'Crescita annua dei ricavi',
    valore: 2,
    unita: '%',
    fonte: 'derivata',
    motivazione: 'Crescita storica dei ricavi.',
    intervallo: [-20, 20],
  },
  {
    codice: 'margineEbitda',
    etichetta: 'Margine EBITDA sui ricavi',
    valore: 12,
    unita: '%',
    fonte: 'derivata',
    motivazione: 'Margine implicito dell’ultimo bilancio.',
    intervallo: [0, 60],
  },
];

describe('validazione della proposta AI', () => {
  it('accetta un valore dentro l’intervallo e arrotonda a due decimali', () => {
    const p = validaPropostaAi(
      {
        assunzioni: [
          { codice: 'crescitaRicavi', valore: 1.23456, motivazione: 'Nota: ricavi stabili.' },
        ],
        sintesi: 'Proposta prudente.',
      },
      base
    );
    expect(p.assunzioni).toHaveLength(1);
    expect(p.assunzioni[0].valore).toBe(1.23);
    expect(p.assunzioni[0].fonte).toBe('stimata');
    expect(p.assunzioni[0].motivazione).toContain('ricavi stabili');
    expect(p.scartate).toEqual([]);
    expect(p.sintesi).toBe('Proposta prudente.');
  });

  it('scarta un valore fuori intervallo invece di limitarlo', () => {
    const p = validaPropostaAi(
      { assunzioni: [{ codice: 'crescitaRicavi', valore: 45, motivazione: 'Nota.' }] },
      base
    );
    expect(p.assunzioni).toEqual([]);
    expect(p.scartate.join(' ')).toContain("fuori dall'intervallo");
  });

  it('scarta un’assunzione senza motivazione', () => {
    const p = validaPropostaAi({ assunzioni: [{ codice: 'margineEbitda', valore: 10 }] }, base);
    expect(p.assunzioni).toEqual([]);
    expect(p.scartate.join(' ')).toContain('manca la motivazione');
  });

  it('scarta un codice che il motore non conosce', () => {
    const p = validaPropostaAi(
      { assunzioni: [{ codice: 'ricaviVendite', valore: 10, motivazione: 'Nota.' }] },
      base
    );
    expect(p.assunzioni).toEqual([]);
    expect(p.scartate.join(' ')).toContain('assunzione sconosciuta');
  });

  it('scarta un valore non numerico e tiene la prima proposta ripetuta', () => {
    const p = validaPropostaAi(
      {
        assunzioni: [
          { codice: 'crescitaRicavi', valore: 'tre', motivazione: 'Nota.' },
          { codice: 'margineEbitda', valore: 11, motivazione: 'Nota A.' },
          { codice: 'margineEbitda', valore: 15, motivazione: 'Nota B.' },
        ],
      },
      base
    );
    expect(p.assunzioni).toHaveLength(1);
    expect(p.assunzioni[0].valore).toBe(11);
    expect(p.scartate.join(' ')).toContain('valore non numerico');
    expect(p.scartate.join(' ')).toContain('proposta ripetuta');
  });

  it('una risposta che non è un oggetto non diventa una proposta', () => {
    const p = validaPropostaAi('testo libero', base);
    expect(p.assunzioni).toEqual([]);
    expect(p.sintesi).toContain('Nessuna sintesi');
    expect(p.datiMancanti).toEqual([]);
    expect(p.avvisi).toEqual([]);
  });

  it('una proposta senza assunzioni non è un successo, e dice perché', () => {
    const p = validaPropostaAi(
      {
        assunzioni: [{ codice: 'crescitaRicavi', valore: 45, motivazione: 'Nota.' }],
        sintesi: 'Il file non basta per stimare la crescita.',
      },
      base
    );
    const motivo = motivoPropostaVuota(p);
    expect(motivo).toContain('alcuna assunzione valida');
    expect(motivo).toContain("fuori dall'intervallo");
    expect(motivo).toContain('Il file non basta');
    expect(motivo).toContain('inserite a mano');
  });

  it('una risposta illeggibile dichiara che non c’era un elenco', () => {
    const motivo = motivoPropostaVuota(validaPropostaAi('testo libero', base));
    expect(motivo).toContain('elenco di assunzioni leggibile');
  });

  it('con almeno un’assunzione valida non c’è nessun motivo di errore', () => {
    const p = validaPropostaAi(
      { assunzioni: [{ codice: 'margineEbitda', valore: 10, motivazione: 'Nota.' }] },
      base
    );
    expect(motivoPropostaVuota(p)).toBeNull();
  });

  it('tiene il valore di intervallo dell’assunzione base, non quello del modello', () => {
    const p = validaPropostaAi(
      {
        assunzioni: [
          {
            codice: 'margineEbitda',
            valore: 15,
            motivazione: 'Nota.',
            intervallo: [0, 100],
          },
        ],
      },
      base
    );
    expect(p.assunzioni[0].intervallo).toEqual([0, 60]);
  });
});
