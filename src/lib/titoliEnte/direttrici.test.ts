import { describe, it, expect } from 'vitest';
import { componiCatenaDirettrici, direttriceConfigurata, nomiDirettrici } from './direttrici';
import type { LavorazioneMateria } from './lavorazioniMateria';

const lav = (p: Partial<LavorazioneMateria> & { id: number }): LavorazioneMateria => ({
  materiaId: 1,
  tipologia: 'Lavorazione',
  dipendenza: null,
  procedura: null,
  esito: null,
  ordine: 0,
  ...p,
});

const direttrici = (...nomi: string[]) => nomi.map((nome) => ({ nome }));

describe('direttrici dell’ente: i nomi degli uffici', () => {
  it('tiene l’ordine scritto dall’ente e scarta i vuoti', () => {
    expect(
      nomiDirettrici(direttrici('Vigilanza documentale', '  ', 'Gestione del credito'))
    ).toEqual(['Vigilanza documentale', 'Gestione del credito']);
  });

  it('lo stesso nome scritto due volte è una direttrice sola', () => {
    expect(
      nomiDirettrici(
        direttrici('Presidio dei flussi informativi', 'presidio  dei flussi informativi')
      )
    ).toEqual(['Presidio dei flussi informativi']);
  });

  it('riconosce la direttrice anche quando il nome è scritto con altre maiuscole', () => {
    expect(direttriceConfigurata('gestione del credito', direttrici('Gestione del credito'))).toBe(
      'Gestione del credito'
    );
  });

  it('un ufficio che non è una direttrice resta fuori, e non viene inventato', () => {
    expect(direttriceConfigurata('Ufficio legale', direttrici('Gestione del credito'))).toBeNull();
    expect(direttriceConfigurata(null, direttrici('Gestione del credito'))).toBeNull();
  });
});

describe('catena direttrici → lavorazioni → titoli', () => {
  const base = {
    direttrici: direttrici('Gestione del credito', 'Presidio dei flussi informativi'),
    titoli: [],
  };

  it('conta le lavorazioni e le materie che usano una direttrice', () => {
    const esito = componiCatenaDirettrici({
      ...base,
      lavorazioni: [
        lav({ id: 1, materiaId: 1, dipendenza: 'Gestione del credito' }),
        lav({ id: 2, materiaId: 2, dipendenza: 'gestione del credito' }),
        lav({ id: 3, materiaId: 2, dipendenza: 'Presidio dei flussi informativi' }),
      ],
    });
    expect(esito.voci[0]).toMatchObject({
      nome: 'Gestione del credito',
      lavorazioni: 2,
      materie: 2,
    });
    expect(esito.voci[1]).toMatchObject({
      nome: 'Presidio dei flussi informativi',
      lavorazioni: 1,
      materie: 1,
    });
  });

  it('i codici contano la dipendenza effettiva: quella del codice o quella della materia', () => {
    const lavorazioni = [
      lav({ id: 1, materiaId: 10, dipendenza: 'Gestione del credito' }),
      lav({ id: 2, materiaId: 10, dipendenza: 'Presidio dei flussi informativi' }),
    ];
    const esito = componiCatenaDirettrici({
      ...base,
      lavorazioni,
      titoli: [
        // eredita la prima lavorazione della materia 10
        { materiaId: 10, dipendenza: null },
        // ha una sua dipendenza: prevale sulla materia
        { materiaId: 10, dipendenza: 'Presidio dei flussi informativi' },
        // nessuna materia e nessuna dipendenza
        { materiaId: null, dipendenza: null },
      ],
    });
    expect(esito.voci[0]).toMatchObject({ codici: 1, codiciPropri: 0 });
    expect(esito.voci[1]).toMatchObject({ codici: 1, codiciPropri: 1 });
    expect(esito.codiciSenzaUfficio).toBe(1);
  });

  it('dice quale direttrice nessuna lavorazione usa ancora', () => {
    const esito = componiCatenaDirettrici({
      ...base,
      lavorazioni: [lav({ id: 1, dipendenza: 'Gestione del credito' })],
    });
    expect(esito.senzaLavorazioni).toEqual(['Presidio dei flussi informativi']);
  });

  it('dice quale ufficio in uso non è una direttrice', () => {
    const esito = componiCatenaDirettrici({
      ...base,
      lavorazioni: [
        lav({ id: 1, dipendenza: 'Gestione del credito' }),
        lav({ id: 2, dipendenza: 'Ufficio legale' }),
      ],
    });
    expect(esito.fuoriElenco).toEqual([{ nome: 'Ufficio legale', lavorazioni: 1, codici: 0 }]);
  });

  it('conta le lavorazioni rimaste senza ufficio', () => {
    const esito = componiCatenaDirettrici({
      ...base,
      lavorazioni: [lav({ id: 1, dipendenza: null }), lav({ id: 2, dipendenza: '   ' })],
    });
    expect(esito.lavorazioniSenzaUfficio).toBe(2);
    expect(esito.voci.map((v) => v.lavorazioni)).toEqual([0, 0]);
  });

  it('senza direttrici configurate ogni ufficio in uso è fuori elenco', () => {
    const esito = componiCatenaDirettrici({
      direttrici: [],
      lavorazioni: [lav({ id: 1, dipendenza: 'Ufficio legale' })],
      titoli: [{ materiaId: null, dipendenza: 'Ufficio legale' }],
    });
    expect(esito.voci).toEqual([]);
    expect(esito.fuoriElenco).toEqual([{ nome: 'Ufficio legale', lavorazioni: 1, codici: 1 }]);
  });
});
