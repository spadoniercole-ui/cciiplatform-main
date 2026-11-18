import { describe, expect, it } from 'vitest';
import {
  componiDecisioneFinale,
  confrontaProcedure,
  type FonteDecisioneFinale,
  type ProceduraDecisione,
} from './decisioneFinale';

const proc = (p: Partial<ProceduraDecisione> = {}): ProceduraDecisione => ({
  recupero: 40_000,
  perdita: 60_000,
  calcolabile: true,
  motivo: null,
  ...p,
});

const fonte = (f: Partial<FonteDecisioneFinale> = {}): FonteDecisioneFinale => ({
  piano: 'PRESENTE',
  credito: 100_000,
  patrimonioNetto: 20_000,
  indiciViolati: 0,
  liquidazione: proc(),
  cramDown: proc({ recupero: 45_000, perdita: 55_000 }),
  documentiMancanti: [],
  ...f,
});

describe('confrontaProcedure', () => {
  it('indica la perdita minore fra le due procedure', () => {
    const c = confrontaProcedure(proc(), proc({ recupero: 45_000, perdita: 55_000 }));
    expect(c.minorePerdita).toBe('CRAM_DOWN');
    expect(c.differenza).toBe(5_000);
    expect(c.testo).toMatch(/cram down/);
    expect(c.testo).toMatch(/55\.000/);
  });

  it('dice che le due strade lasciano la stessa perdita', () => {
    const c = confrontaProcedure(proc(), proc());
    expect(c.minorePerdita).toBeNull();
    expect(c.differenza).toBe(0);
    expect(c.testo).toMatch(/stessa perdita/);
  });

  it('quando una sola si calcola, dice perché l’altra no', () => {
    const c = confrontaProcedure(
      proc(),
      proc({
        calcolabile: false,
        recupero: null,
        perdita: null,
        motivo: 'percentuale del rango non configurata',
      })
    );
    expect(c.minorePerdita).toBeNull();
    expect(c.testo).toMatch(/solo la liquidazione giudiziale si calcola/);
    expect(c.testo).toMatch(/percentuale del rango non configurata/);
  });

  it('senza procedure calcolabili non inventa un confronto', () => {
    const c = confrontaProcedure(
      proc({ calcolabile: false, recupero: null, perdita: null, motivo: 'tasso non configurato' }),
      null
    );
    expect(c.minorePerdita).toBeNull();
    expect(c.differenza).toBeNull();
    expect(c.testo).toMatch(/Nessuna delle due procedure/);
  });
});

describe('componiDecisioneFinale', () => {
  it('se il piano manca lo dice e confronta comunque le due procedure', () => {
    const e = componiDecisioneFinale(fonte({ piano: 'ASSENTE' }));
    expect(e.pianoMancante).toBe(true);
    expect(e.righe[0]).toMatch(/piano dell’azienda non è in archivio/);
    expect(e.righe.some((r) => r.includes('perdita minore'))).toBe(true);
  });

  it('se la contabile rende il piano impraticabile lo dice, con i numeri', () => {
    const e = componiDecisioneFinale(fonte({ patrimonioNetto: -120_000, indiciViolati: 4 }));
    expect(e.pianoImpraticabile).toBe(true);
    expect(e.righe.join(' ')).toMatch(/patrimonio netto negativo/);
    expect(e.righe.join(' ')).toMatch(/4 indici di bilancio oltre la soglia/);
  });

  it('se piano e numeri stanno in piedi non spinge verso la procedura', () => {
    const e = componiDecisioneFinale(fonte());
    expect(e.pianoMancante).toBe(false);
    expect(e.pianoImpraticabile).toBe(false);
    expect(e.righe.join(' ')).toMatch(/confronto da valutare resta quello sull’accordo/);
    // Anche quando il piano regge, le due procedure restano l’alternativa:
    // il documento le accosta come «se l’accordo non si chiudesse».
    expect(e.righe.join(' ')).toMatch(/Se l’accordo non si chiudesse/);
    expect(e.righe.join(' ')).toMatch(/perdita minore/);
  });

  it('pesa la documentazione mancante, alto e medio', () => {
    const e = componiDecisioneFinale(
      fonte({
        documentiMancanti: [
          {
            nome: 'Piano dell’azienda',
            peso: 'ALTO',
            perche: 'senza, resta un accordo ipotizzato',
          },
          { nome: 'Nota integrativa', peso: 'MEDIO', perche: 'continuità e piani non si leggono' },
        ],
      })
    );
    expect(e.pesoDocumenti).toMatch(/Mancano 2 documenti fondamentali/);
    expect(e.pesoDocumenti).toMatch(/1 documento di peso alto cambia la conclusione/);
    expect(e.pesoDocumenti).toMatch(/1 di peso medio toglie forza alla lettura/);
  });

  it('senza documenti mancanti lo dichiara', () => {
    const e = componiDecisioneFinale(fonte());
    expect(e.pesoDocumenti).toMatch(/non risulta mancare nulla/);
  });

  it('un piano non leggibile non è un piano mancante', () => {
    const e = componiDecisioneFinale(fonte({ piano: 'NON_VALUTABILE' }));
    expect(e.pianoMancante).toBe(false);
    expect(e.righe[0]).toMatch(/Non è stato possibile stabilire/);
  });
});
