import { describe, expect, it } from 'vitest';
import type { Componente } from '@/lib/iai/dimensioni';
import type { Attenzione } from '@/lib/screening/indicatore';
import type { StatoDirettrici } from '@/lib/verificaAzienda/direttrici';
import { componiEsitoVerifica } from '@/lib/verifica/esito';
import { componiRitratto, type FontiRitratto } from './ritratto';

const ATTENZIONE: Attenzione = {
  esito: 'ROSSO',
  etichetta: 'Criticità rilevante',
  fattoreDeterminante: 'Soglia di segnalazione superata',
  accertato: ['Art. 25-novies — INPS: soglia superata di 12.345 €.'],
  daAccertare: ['Ritardo di oltre 90 giorni nel versamento: serve l’Elenco Deleghe (F24).'],
  copertura: { determinate: 3, totali: 4 },
};

const DIMENSIONI: Componente[] = [
  {
    dimensione: 'A',
    punteggio: 100,
    motivi: ['INPS: presupposti oggettivi rilevati'],
    lacune: [],
  },
  {
    dimensione: 'B',
    punteggio: 60,
    motivi: ['patrimonio netto esiguo: 4% dei debiti'],
    lacune: ['Z’’-score non calcolabile: manca una voce di bilancio'],
  },
  {
    dimensione: 'C',
    punteggio: 0,
    motivi: [],
    lacune: ['serve un secondo esercizio per misurare la dinamica'],
  },
  {
    dimensione: 'D',
    punteggio: 0,
    motivi: [],
    lacune: [],
  },
  {
    dimensione: 'E',
    punteggio: 0,
    motivi: [],
    lacune: ['visura non disponibile'],
  },
];

const DIRETTRICI_FATTE: StatoDirettrici = {
  amministrativa: 'COMPLETO',
  contabile: 'COMPLETO',
  aziendale: 'COMPLETO',
};

function fonti(patch: Partial<FontiRitratto> = {}): FontiRitratto {
  return {
    anagrafica: {
      ragioneSociale: 'Tessitura Lario Demo S.p.A.',
      formaGiuridica: 'S.p.A.',
      partitaIva: '01234567890',
      codiceFiscale: '01234567890',
      sede: 'Lecco (LC)',
      attiva: true,
      identificativi: [{ etichetta: 'Codice ente', valore: 'ENTE-0002' }],
    },
    direttrici: DIRETTRICI_FATTE,
    amministrativa: {
      verificataIl: '2026-03-12',
      debitoMemorizzato: 16756.4,
      debitoMemorizzatoIl: '2026-03-11T09:30:00.000Z',
    },
    contabile: {
      anniXbrl: 3,
      visuraIl: '2026-02-01',
      parametriPresenti: true,
      completa: true,
    },
    esito: componiEsitoVerifica({ giudizio: ATTENZIONE, dimensioni: DIMENSIONI }),
    ...patch,
  };
}

describe('componiRitratto', () => {
  it('compone la testata dall’anagrafica, senza toccare i valori', () => {
    const r = componiRitratto(fonti());
    expect(r.testata).toEqual({
      nome: 'Tessitura Lario Demo S.p.A.',
      sottotitolo: 'S.p.A. · Lecco (LC)',
      identificativi: [{ etichetta: 'Codice ente', valore: 'ENTE-0002' }],
      attiva: true,
      debito: {
        importo: 16756.4,
        testo: expect.stringContaining('€'),
        il: '11/03/2026',
      },
      verificataIl: '12/03/2026',
    });
  });

  it('legge le tre direttrici da statoDirettrici, senza rifare i verdi', () => {
    const r = componiRitratto(fonti());
    expect(r.direttrici.fatte).toBe(3);
    expect(r.direttrici.voci.map((v) => v.etichettaStato)).toEqual(['Fatta', 'Fatta', 'Fatta']);
    expect(r.direttrici.voci.every((v) => v.richiede === null)).toBe(true);
  });

  it('dice che cosa manca alla contabile e alla aziendale quando non sono fatte', () => {
    const r = componiRitratto(
      fonti({
        direttrici: { amministrativa: 'COMPLETO', contabile: 'PARZIALE', aziendale: 'PARZIALE' },
        contabile: {
          anniXbrl: 0,
          visuraIl: '2026-02-01',
          parametriPresenti: false,
          completa: false,
        },
      })
    );
    const contabile = r.direttrici.voci.find((v) => v.id === 'contabile');
    const aziendale = r.direttrici.voci.find((v) => v.id === 'aziendale');
    expect(contabile?.richiede).toBe('Mancano i parametri dell’ente e un bilancio XBRL.');
    expect(aziendale?.richiede).toContain('manca la fotografia salvata');
    expect(r.direttrici.fatte).toBe(1);
  });

  it('porta nel giudizio esito, copertura e le due liste come stanno', () => {
    const r = componiRitratto(fonti());
    expect(r.giudizio.presente).toBe(true);
    expect(r.giudizio.esito).toBe('ROSSO');
    expect(r.giudizio.parola).toBe('attenzione alta');
    expect(r.giudizio.copertura).toEqual({
      determinate: 3,
      totali: 4,
      testo: '3 dimensioni su 4',
      limitata: true,
    });
    expect(r.giudizio.accertato).toEqual(ATTENZIONE.accertato);
    expect(r.giudizio.daAccertare).toEqual(ATTENZIONE.daAccertare);
    expect(r.giudizio.determinanti.map((d) => d.dimensione)).toEqual(['A', 'B']);
    expect(r.giudizio.sintesi).toBe(
      'Criticità rilevante · attenzione alta · copertura 3/4 · verificata il 12/03/2026'
    );
  });

  it('dichiara una posizione mai verificata invece di mostrare un verde', () => {
    const r = componiRitratto(
      fonti({
        esito: null,
        amministrativa: null,
        contabile: null,
        direttrici: {
          amministrativa: 'MANCANTE',
          contabile: 'NON_DISPONIBILE',
          aziendale: 'NON_DISPONIBILE',
        },
      })
    );
    expect(r.giudizio.presente).toBe(false);
    expect(r.giudizio.sintesi).toContain('Nessuna verifica registrata');
    expect(r.dimensioni.presente).toBe(false);
    expect(r.mancanze).toEqual([
      'Nessuna verifica della posizione: mancano il giudizio, la copertura e le cinque dimensioni.',
      'Verifica amministrativa non eseguita: il debito e l’esito dell’ente non sono nel ritratto.',
      'Verifica contabile non leggibile da questo accesso: il ritratto non ne cita i dati.',
      'Verifica aziendale non leggibile da questo accesso: il ritratto non cita una proiezione.',
    ]);
  });

  it('classifica ogni dimensione come letta, parziale o non letta', () => {
    const r = componiRitratto(fonti());
    expect(r.dimensioni.voci.map((v) => [v.lettera, v.stato])).toEqual([
      ['A', 'LETTA'],
      ['B', 'PARZIALE'],
      ['C', 'NON_LETTA'],
      ['D', 'LETTA'],
      ['E', 'NON_LETTA'],
    ]);
    expect(r.dimensioni.lette).toBe(2);
    expect(r.dimensioni.nota).toContain('non è un voto');
    expect(r.mancanze).toEqual([
      'Dimensioni non misurate: C, E. Il giudizio vale entro i dati disponibili e la copertura lo dichiara.',
    ]);
  });

  it('non produce alcun totale: i riquadri sono quelli dichiarati', () => {
    const r = componiRitratto(fonti());
    expect(Object.keys(r)).toEqual([
      'testata',
      'direttrici',
      'giudizio',
      'dimensioni',
      // L'iconografia è un modo di mostrare le stesse dimensioni, non un
      // riquadro nuovo: i quattro riquadri restano quattro.
      'iconografia',
      'mancanze',
    ]);
    // Senza i dati grezzi non ci sono grafici: il ritratto resta quello di prima.
    expect(r.iconografia).toBeNull();
  });

  it('mette in chiaro la posizione disabilitata senza fingere una contabile letta', () => {
    const r = componiRitratto(
      fonti({
        anagrafica: { ...fonti().anagrafica, attiva: false },
        contabile: null,
        direttrici: {
          amministrativa: 'COMPLETO',
          contabile: 'NON_DISPONIBILE',
          aziendale: 'NON_DISPONIBILE',
        },
      })
    );
    expect(r.testata.attiva).toBe(false);
    expect(r.direttrici.voci[1].richiede).toContain('non legge la verifica contabile');
    expect(r.mancanze.some((m) => m.startsWith('Verifica contabile incompleta'))).toBe(false);
    expect(r.mancanze).toContain(
      'Verifica contabile non leggibile da questo accesso: il ritratto non ne cita i dati.'
    );
  });
});
