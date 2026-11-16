import { describe, expect, it } from 'vitest';
import { valutaProntezza, type IngressiProntezza } from './prontezza';

// «Posso decidere?» non è una media: un blocco ferma la posizione, una
// attenzione la lascia decidibile ma da leggere.

function ingressi(patch: Partial<IngressiProntezza> = {}): IngressiProntezza {
  return {
    amministrativa: {
      eseguita: true,
      esito: 'ATTENZIONE_MINIMA',
      copertura: { determinate: 4, totali: 4 },
    },
    contabile: { completa: true, mancanti: [] },
    azienda: { fotografata: true, motivo: null },
    scenari: { calcolabili: 2, totali: 2 },
    quadratura: 'COERENTE',
    validita: { stato: 'recente', etichetta: 'Oggi' },
    richiesteAperte: 0,
    ...patch,
  };
}

describe('prontezza della posizione', () => {
  it('tutto completo e coerente: pronta', () => {
    const p = valutaProntezza(ingressi());
    expect(p.grado).toBe('PRONTA');
    expect(p.decidibile).toBe(true);
    expect(p.prossimoAtto).toBeNull();
  });

  it('la verifica amministrativa mancante blocca, e il prossimo atto è quella', () => {
    const p = valutaProntezza(
      ingressi({ amministrativa: { eseguita: false, esito: null, copertura: null } })
    );
    expect(p.grado).toBe('BLOCCATA');
    expect(p.prossimoAtto?.pagina).toBe('amministrativa');
    expect(p.blocchi[0]).toContain('non è chiusa');
  });

  it('il credito divergente blocca prima della contabile', () => {
    const p = valutaProntezza(ingressi({ quadratura: 'DIVERGENTE' }));
    expect(p.decidibile).toBe(false);
    expect(p.prossimoAtto?.testo).toContain('Allineare il credito');
  });

  it('copertura incompleta e scenari parziali sono attenzioni, non blocchi', () => {
    const p = valutaProntezza(
      ingressi({
        amministrativa: {
          eseguita: true,
          esito: 'ROSSO',
          copertura: { determinate: 3, totali: 4 },
        },
        scenari: { calcolabili: 1, totali: 2 },
      })
    );
    expect(p.grado).toBe('QUASI');
    expect(p.decidibile).toBe(true);
    expect(p.attenzioni.join(' ')).toContain('3 dimensioni su 4');
    expect(p.attenzioni.join(' ')).toContain('1 scenario non è calcolabile');
  });

  it('la verifica da rivedere condiziona la decisione e diventa il prossimo atto', () => {
    const p = valutaProntezza(
      ingressi({ validita: { stato: 'da_rivedere', etichetta: 'Da rivedere — 7 mesi' } })
    );
    expect(p.grado).toBe('QUASI');
    expect(p.prossimoAtto?.pagina).toBe('amministrativa');
    expect(p.prossimoAtto?.testo).toContain('validità');
  });

  it('i documenti mancanti contano come attenzione, con il numero', () => {
    const p = valutaProntezza(ingressi({ richiesteAperte: 2 }));
    expect(p.grado).toBe('QUASI');
    expect(p.attenzioni.join(' ')).toContain('2 documenti mancano');
  });

  it('la fotografia che non si compone blocca, col motivo', () => {
    const p = valutaProntezza(
      ingressi({ azienda: { fotografata: false, motivo: 'Nessun bilancio XBRL leggibile.' } })
    );
    expect(p.grado).toBe('BLOCCATA');
    expect(p.blocchi.join(' ')).toContain('Nessun bilancio XBRL');
    expect(p.prossimoAtto?.pagina).toBe('azienda');
  });
});
