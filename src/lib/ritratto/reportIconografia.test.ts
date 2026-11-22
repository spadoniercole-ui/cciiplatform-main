import { describe, expect, it } from 'vitest';
import type { Componente } from '@/lib/iai/dimensioni';
import type { Attenzione } from '@/lib/screening/indicatore';
import type { StatoDirettrici } from '@/lib/verificaAzienda/direttrici';
import { componiEsitoVerifica } from '@/lib/verifica/esito';
import { componiRitratto, type FontiRitratto } from './ritratto';
import { componiReportIconografia } from './reportIconografia';

const ATTENZIONE: Attenzione = {
  esito: 'GIALLO',
  etichetta: 'Attenzione',
  fattoreDeterminante: 'Indici diagnostici di bilancio oltre la soglia di riferimento',
  accertato: ['Esposizione verso l’ente di 80.000 €: nessuna soglia di segnalazione superata.'],
  daAccertare: [],
  copertura: { determinate: 3, totali: 4 },
};

const DIMENSIONI: Componente[] = [
  { dimensione: 'A', punteggio: 25, motivi: ['soglie confrontate'], lacune: ['denunce non lette'] },
  { dimensione: 'B', punteggio: 0, motivi: [], lacune: [] },
  { dimensione: 'C', punteggio: 0, motivi: [], lacune: [] },
  { dimensione: 'D', punteggio: 80, motivi: ['visura regolare'], lacune: [] },
  { dimensione: 'E', punteggio: 40, motivi: ['patrimonio netto'], lacune: [] },
];

const DIRETTRICI: StatoDirettrici = {
  amministrativa: 'COMPLETO',
  contabile: 'COMPLETO',
  aziendale: 'COMPLETO',
};

function fonti(patch: Partial<FontiRitratto> = {}): FontiRitratto {
  return {
    anagrafica: {
      ragioneSociale: 'Tessitura Lario Demo S.p.A.',
      formaGiuridica: 'Società per azioni',
      partitaIva: '00000000102',
      codiceFiscale: '00000000102',
      sede: 'Como (CO)',
      attiva: true,
      identificativi: [{ etichetta: 'Matricola INPS', valore: '4412880091' }],
    },
    direttrici: DIRETTRICI,
    amministrativa: {
      verificataIl: '2026-10-15',
      debitoMemorizzato: 152000,
      debitoMemorizzatoIl: '2026-10-15',
    },
    contabile: { anniXbrl: 3, visuraIl: '2026-09-30', parametriPresenti: true, completa: true },
    esito: componiEsitoVerifica({ giudizio: ATTENZIONE, dimensioni: DIMENSIONI }),
    ...patch,
  };
}

const report = (patch: Partial<FontiRitratto> = {}) =>
  componiReportIconografia(componiRitratto(fonti(patch)), '22/11/2026');

describe('componiReportIconografia', () => {
  it('porta nell’intestazione impresa, verifica e debito come stanno nel ritratto', () => {
    const r = report();
    expect(r.titolo).toBe('Tessitura Lario Demo S.p.A.');
    expect(r.sottotitolo).toBe('Società per azioni · Como (CO)');
    expect(r.generatoIl).toBe('22/11/2026');
    expect(r.impresa).toEqual([
      { etichetta: 'Matricola INPS', valore: '4412880091' },
      { etichetta: 'Verifica amministrativa', valore: 'del 15/10/2026' },
      { etichetta: 'Debito memorizzato', valore: expect.stringContaining('152.000 €') },
    ]);
  });

  it('dice «nessun debito memorizzato» invece di lasciare la cella vuota', () => {
    const r = report({
      amministrativa: {
        verificataIl: '2026-10-15',
        debitoMemorizzato: null,
        debitoMemorizzatoIl: null,
      },
    });
    expect(r.impresa.find((x) => x.etichetta === 'Debito memorizzato')?.valore).toBe(
      'nessun debito memorizzato'
    );
  });

  it('riduce le tre direttrici a nome, stato e che cosa resta', () => {
    const r = report({
      direttrici: { amministrativa: 'COMPLETO', contabile: 'PARZIALE', aziendale: 'PARZIALE' },
      contabile: { anniXbrl: 0, visuraIl: null, parametriPresenti: false, completa: false },
    });
    expect(r.direttrici.map((d) => d.etichettaStato)).toEqual([
      'Fatta',
      'Cominciata',
      'Cominciata',
    ]);
    expect(r.direttrici.map((d) => d.stato)).toEqual(['COMPLETO', 'PARZIALE', 'PARZIALE']);
    expect(r.direttrici[1].richiede).toContain('visura storica');
    expect(r.direttriciNota).toContain('su 3');
  });

  it('costruisce il grafico delle dimensioni con le intensità del motore', () => {
    const r = report();
    expect(r.dimensioni.map((d) => [d.lettera, d.punteggio, d.tono])).toEqual([
      ['A', 25, 'parziale'],
      ['B', 0, 'letta'],
      ['C', 0, 'letta'],
      ['D', 80, 'letta'],
      ['E', 40, 'letta'],
    ]);
  });

  it('chiude l’intensità dentro 0-100, come la barra', () => {
    const fuoriScala: Componente[] = [
      { dimensione: 'A', punteggio: 140, motivi: [], lacune: [] },
      { dimensione: 'B', punteggio: -5, motivi: [], lacune: [] },
    ];
    const r = report({
      esito: componiEsitoVerifica({ giudizio: ATTENZIONE, dimensioni: fuoriScala }),
    });
    expect(r.dimensioni.map((d) => d.punteggio)).toEqual([100, 0]);
  });

  it('porta copertura e tono nel giudizio, con la percentuale del grafico', () => {
    const r = report();
    expect(r.giudizio?.tono).toBe('giallo');
    // «Attenzione» e «attenzione» sono la stessa parola: il semaforo non la ripete.
    expect(r.giudizio?.parola).toBeNull();
    expect(r.giudizio?.copertura).toEqual({
      determinate: 3,
      totali: 4,
      testo: '3 dimensioni su 4',
      limitata: true,
      percentuale: 75,
    });
  });

  it('non inventa un giudizio quando la posizione non è verificata', () => {
    const r = report({
      esito: null,
      amministrativa: null,
      contabile: null,
      direttrici: {
        amministrativa: 'MANCANTE',
        contabile: 'NON_DISPONIBILE',
        aziendale: 'NON_DISPONIBILE',
      },
    });
    expect(r.giudizio).toBeNull();
    expect(r.dimensioni).toEqual([]);
    expect(r.mancanze.length).toBeGreaterThan(0);
  });

  it('taglia gli elenchi lunghi e lo dichiara, invece di stamparne metà in silenzio', () => {
    const lunghissima = 'A'.repeat(400);
    const molte = ['prima voce', 'seconda voce', 'terza voce', lunghissima];
    const r = report({
      esito: componiEsitoVerifica({
        giudizio: { ...ATTENZIONE, accertato: molte },
        dimensioni: DIMENSIONI,
      }),
    });
    expect(r.giudizio?.accertato).toHaveLength(2);
    expect(r.giudizio?.accertatoOltre).toBe(2);
    expect(r.notaRiduzione).toContain('testo integrale');
    expect(r.giudizio?.accertato[0].ridotto).toBe(false);
  });

  it('dichiara che non ha ridotto nulla quando le voci stanno sul foglio', () => {
    const r = report();
    expect(r.notaRiduzione).toContain('Nessuna voce è stata ridotta');
    expect(r.giudizio?.accertatoOltre).toBe(0);
  });
});
