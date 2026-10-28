import { describe, it, expect } from 'vitest';
import { codiceDaVoceVera, materiaPerRigaVera, type MateriaMinima } from './materiaVera';

const materie: MateriaMinima[] = [
  { id: 1, nome: 'FLUSSI UNIEMENS', codiciIndicativi: '27', stato: 'CONFERMATA' },
  { id: 2, nome: 'NOTE DI RETTIFICA', codiciIndicativi: '25', stato: 'CONFERMATA' },
  { id: 3, nome: 'Avvisi di addebito', codiciIndicativi: null, stato: 'PROPOSTA' },
  { id: 4, nome: 'VERBALI ISPETTIVI', codiciIndicativi: null, stato: 'CONFERMATA' },
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
    // La voce («Adr …») basta da sola: la sezione non ha deciso niente.
    expect(adr?.via).toBe('voce');
    expect(materiaPerRigaVera('Voce misteriosa', 'X', [], materie)).toBeNull();
  });

  // Il file mette i verbali nella stessa sezione dei flussi contributivi. Se a
  // decidere è il titolo di sezione, ogni posizione senza codice diventa
  // «flussi» — e l'ufficio di vigilanza non riceve più il suo verbale.
  it('la voce vince sul titolo della sezione', () => {
    const verbale = materiaPerRigaVera('Verbale Evasione', 'FLUSSI UNIEMENS', [], materie);
    expect(verbale?.nome).toBe('VERBALI ISPETTIVI');
    expect(verbale?.via).toBe('voce');
    // La sezione resta la via di ripiego quando la voce da sola non dice nulla,
    // e le due vie si distinguono: non valgono lo stesso.
    const interessi = materiaPerRigaVera('Interessi di mora', 'FLUSSI UNIEMENS', [], materie);
    expect(interessi?.nome).toBe('FLUSSI UNIEMENS');
    expect(interessi?.via).toBe('sezione');
  });
});
