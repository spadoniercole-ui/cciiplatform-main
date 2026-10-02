import { describe, it, expect } from 'vitest';
import { codiceDaVoceVera, materiaPerRigaVera, type MateriaMinima } from './materiaVera';

const materie: MateriaMinima[] = [
  { id: 1, nome: 'FLUSSI UNIEMENS', codiciIndicativi: '27', stato: 'CONFERMATA' },
  { id: 2, nome: 'NOTE DI RETTIFICA', codiciIndicativi: '25', stato: 'CONFERMATA' },
  { id: 3, nome: 'Avvisi di addebito', codiciIndicativi: null, stato: 'PROPOSTA' },
];

describe('materia di una riga V.E.R.A.', () => {
  it('legge il codice dalla natura', () => {
    expect(codiceDaVoceVera('TS 27 flusso Uniemens non versato')).toBe('27');
    expect(codiceDaVoceVera('18 - Verbale Evasione')).toBe('18');
    expect(codiceDaVoceVera('Adr - Gestione Datori di lavoro')).toBeNull();
  });

  it('il codice porta alla materia, dal titolo o dai codici indicativi', () => {
    expect(materiaPerRigaVera('TS 27 flusso Uniemens non versato', '', [], materie)?.nome).toBe(
      'FLUSSI UNIEMENS'
    );
    const viaTitolo = materiaPerRigaVera(
      'TS 25 nota di rettifica',
      '',
      [{ codice: '025', materiaId: 2 }],
      materie
    );
    expect(viaTitolo).toEqual({
      id: 2,
      nome: 'NOTE DI RETTIFICA',
      confermata: true,
      via: 'codice',
    });
  });

  it('senza codice si propone per descrizione; altrimenti nulla', () => {
    const adr = materiaPerRigaVera(
      'Adr - Gestione Datori di lavoro',
      "CREDITI AFFIDATI PER IL RECUPERO ALL'AGENTE DELLA RISCOSSIONE",
      [],
      materie
    );
    expect(adr?.nome).toBe('Avvisi di addebito');
    expect(adr?.via).toBe('descrizione');
    expect(materiaPerRigaVera('Voce misteriosa', 'X', [], materie)).toBeNull();
  });
});
