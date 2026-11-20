import { describe, expect, it } from 'vitest';
import {
  interpolaVerifiche,
  type LetturaAmministrativa,
  type LetturaContabile,
} from './interpolazione';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

const dati = (over: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo =>
  ({
    ricaviVendite: 1000,
    valoreProduzione: 1100,
    costiProduzione: 900,
    ebitda: 250,
    ammortamenti: 50,
    ebit: 200,
    oneriFinanziari: 20,
    utileEsercizio: 130,
    totaleAttivo: 1400,
    attivoCircolante: 900,
    disponibilitaLiquide: 100,
    immobilizzazioni: 500,
    patrimonioNetto: 400,
    totaleDebiti: 800,
    debitiBanche: 300,
    debitiFornitori: 200,
    debitiTributari: 100,
    debitiPrevidenziali: 80,
    passivoCorrente: 600,
    creditiClienti: 350,
    ...over,
  }) as DatiFinanziariPeriodo;

const amministrativa = (over: Partial<LetturaAmministrativa> = {}): LetturaAmministrativa => ({
  esito: 'ROSSO',
  etichetta: 'Criticità rilevante',
  fattore: 'Soglie dell’art. 25-novies superate',
  copertura: { determinate: 4, totali: 4 },
  credito: 152_000,
  debitoIl: '2026-11-17',
  accertato: ['4 indici diagnostici di bilancio oltre la soglia di riferimento'],
  daAccertare: [],
  ...over,
});

const contabile = (over: Partial<LetturaContabile> = {}): LetturaContabile => ({
  anni: [
    { anno: 2023, tipo: 'STORICO', dati: dati({ patrimonioNetto: 500 }) },
    { anno: 2024, tipo: 'STORICO', dati: dati({ patrimonioNetto: 400 }) },
    { anno: 2026, tipo: 'CALCOLATO', dati: dati({ patrimonioNetto: 250 }) },
  ],
  indiciViolati: 4,
  annoVerifica: 2026,
  capacita: {
    esito: 'PARZIALE',
    coperturaPct: 30,
    scoperto: 106_400,
    disponibilita: 45_600,
    dettaglio: 'Al 2026 la cassa copre il 30% del credito: restano scoperti 106.400 €.',
  },
  ponte: { debitoContabileUltimo: 120_000, debitoVerificato: 152_000, differenza: 32_000 },
  nota: {
    continuita: 'Gli amministratori ritengono sussistere la continuità aziendale.',
    sezioni: ['CONTINUITA'],
  },
  ...over,
});

describe('interpolaVerifiche', () => {
  it('concorda quando l’amministrativa è rossa e gli indici segnalano', () => {
    const f = interpolaVerifiche({ amministrativa: amministrativa(), contabile: contabile() });
    const segnali = f.incroci.find((i) => i.codice === 'SEGNALI')!;
    expect(segnali.natura).toBe('CONCORDE');
    expect(segnali.rischio).toBeNull();
    expect(f.concordanze).toBeGreaterThan(0);
  });

  it('diverge quando l’amministrativa segnala e il bilancio sta in soglia', () => {
    const f = interpolaVerifiche({
      amministrativa: amministrativa(),
      contabile: contabile({ indiciViolati: 0 }),
    });
    const segnali = f.incroci.find((i) => i.codice === 'SEGNALI')!;
    expect(segnali.natura).toBe('DIVERGENTE');
    expect(segnali.lettura).toContain('fatti che il bilancio non misura');
    expect(f.divergenze).toBeGreaterThan(0);
  });

  it('con il credito coperto dal bilancio dichiara la divergenza, non la crescita', () => {
    const f = interpolaVerifiche({
      amministrativa: amministrativa({ credito: 100_000 }),
      contabile: contabile(),
    });
    const credito = f.incroci.find((i) => i.codice === 'CREDITO')!;
    expect(credito.natura).toBe('DIVERGENTE');
    expect(credito.lettura).toContain('non aggiunge nulla');
  });

  it('con il credito che supera il dichiarato legge la crescita del periodo', () => {
    const f = interpolaVerifiche({ amministrativa: amministrativa(), contabile: contabile() });
    const credito = f.incroci.find((i) => i.codice === 'CREDITO')!;
    expect(credito.natura).toBe('CONCORDE');
    expect(credito.lettura).toContain('crescita del debito');
  });

  it('la continuità dichiarata e il patrimonio negativo divergono', () => {
    const f = interpolaVerifiche({
      amministrativa: amministrativa(),
      contabile: contabile({
        anni: [{ anno: 2026, tipo: 'CALCOLATO', dati: dati({ patrimonioNetto: -30_000 }) }],
      }),
    });
    const continuita = f.incroci.find((i) => i.codice === 'CONTINUITA')!;
    expect(continuita.natura).toBe('DIVERGENTE');
    expect(continuita.rischio).toContain('dichiara');
  });

  it('senza contabile la posizione resta sulla sola amministrativa, con la lacuna dichiarata', () => {
    const f = interpolaVerifiche({ amministrativa: amministrativa(), contabile: null });
    expect(f.incroci.every((i) => i.natura === 'SOLO_AMMINISTRATIVA')).toBe(true);
    expect(f.lacune.join(' ')).toContain('Verifica contabile non eseguita');
    expect(f.daRilasciare.some((b) => b.titolo.includes('Ciò che l’ente vanta'))).toBe(true);
  });

  it('dialoga con il dato mancante senza inventare valori', () => {
    const f = interpolaVerifiche({ amministrativa: null, contabile: null });
    expect(f.sintesi).toContain('non hanno ancora elementi');
    expect(f.incroci).toEqual([]);
  });

  it('la sintesi e ciò che si rilascia seguono le due letture', () => {
    const f = interpolaVerifiche({
      amministrativa: amministrativa({ copertura: { determinate: 3, totali: 4 } }),
      contabile: contabile(),
    });
    expect(f.sintesi).toContain('Credito vantato');
    expect(f.sintesi).toContain('patrimonio netto');
    expect(f.daRilasciare.map((b) => b.titolo)).toEqual(
      expect.arrayContaining([
        'Ciò che l’ente vanta',
        'Ciò che dicono i numeri',
        'Ciò che l’azienda può rispondere',
        'Dove le due letture divergono',
      ])
    );
    expect(f.lacune.join(' ')).toContain('dimensione amministrativa non determinata');
  });
});
