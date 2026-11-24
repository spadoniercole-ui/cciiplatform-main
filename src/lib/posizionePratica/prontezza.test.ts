import { describe, expect, it } from 'vitest';
import { valutaProntezza, type IngressiProntezza } from './prontezza';

// «A che punto è la lettura?» non è una media: un blocco ferma la posizione,
// un'attenzione la lascia leggibile ma con qualcosa da tenere presente.

function ingressi(patch: Partial<IngressiProntezza> = {}): IngressiProntezza {
  return {
    amministrativa: {
      eseguita: true,
      esito: 'ATTENZIONE_MINIMA',
      copertura: { determinate: 4, totali: 4 },
    },
    contabile: { completa: true, mancanti: [] },
    azienda: { fotografata: true, motivo: null },
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

  it('una copertura incompleta è un’attenzione, non un blocco', () => {
    const p = valutaProntezza(
      ingressi({
        amministrativa: {
          eseguita: true,
          esito: 'ROSSO',
          copertura: { determinate: 3, totali: 4 },
        },
      })
    );
    expect(p.grado).toBe('QUASI');
    expect(p.decidibile).toBe(true);
    expect(p.attenzioni.join(' ')).toContain('3 dimensioni su 4');
  });

  it('non anticipa gli scenari: sono l’ultimo passo, non un difetto di questo', () => {
    const p = valutaProntezza(ingressi());
    expect(p.attenzioni.join(' ')).not.toContain('scenario');
    expect(p.dettaglio).not.toContain('scenario');
    expect(p.prossimoAtto).toBeNull();
  });

  it('il testo dice a che punto è la lettura, non che cosa si può fare', () => {
    const completa = valutaProntezza(ingressi());
    expect(completa.dettaglio).not.toMatch(/decidibile|firmare/i);
    const conAttenzione = valutaProntezza(ingressi({ richiesteAperte: 1 }));
    expect(conAttenzione.dettaglio).not.toMatch(/decidibile|firmare/i);
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
