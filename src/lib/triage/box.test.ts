import { describe, it, expect } from 'vitest';
import { htmlBox, htmlBoxes, numerazioneCoerente, type BoxTriage } from './box';

const box = (n: number, over: Partial<BoxTriage> = {}): BoxTriage => ({
  numero: n,
  titolo: `Titolo ${n}`,
  sintesi: 'Una sintesi.',
  numeri: [{ etichetta: 'Esposizione', valore: '10.000 €' }],
  spiegazione: 'Spiegazione <tecnica> & verifica.',
  riferimenti: [{ fonte: 'CCII, art. 84', dettaglio: 'soddisfacimento non inferiore' }],
  avvertenze: ['Non è un giudizio di convenienza.'],
  ...over,
});

describe('cornice numerata', () => {
  it('porta il numero, i numeri, i riferimenti e il limite della verifica', () => {
    const h = htmlBox(box(1));
    expect(h).toContain('<div class="triage-box-num" aria-hidden="true">1</div>');
    expect(h).toContain('Titolo 1');
    expect(h).toContain('triage-box-num');
    expect(h).toContain('Esposizione');
    expect(h).toContain('10.000 €');
    expect(h).toContain('CCII, art. 84');
    expect(h).toContain('Non è un giudizio di convenienza');
  });

  it('esce escapato: il testo non diventa markup', () => {
    const h = htmlBox(box(2));
    expect(h).toContain('Spiegazione &lt;tecnica&gt; &amp; verifica.');
    expect(h).not.toContain('<tecnica>');
  });

  it('una pagina per box: il salto sta fra un box e l’altro, non dopo l’ultimo', () => {
    const html = htmlBoxes([box(1), box(2), box(3)]);
    expect(html.match(/page-break-after:always/g)).toHaveLength(2);
    expect(htmlBoxes([box(1)]).match(/page-break-after/g)).toBeNull();
  });

  it('un riferimento non riscontrato è dichiarato, e il link solo se ufficiale', () => {
    const h = htmlBox(
      box(4, {
        riferimenti: [
          { fonte: 'Art. 112 CCII', daVerificare: true },
          { fonte: 'Circolare INPS 12/2026', url: 'https://www.inps.it/x' },
          { fonte: 'Fonte finta', url: 'javascript:alert(1)' },
        ],
      })
    );
    expect(h).toContain('da verificare sul testo');
    expect(h).toContain('href="https://www.inps.it/x"');
    expect(h).not.toContain('javascript:');
  });

  it('la numerazione si può controllare prima di stampare', () => {
    expect(numerazioneCoerente([box(1), box(2)])).toBe(true);
    expect(numerazioneCoerente([box(1), box(3)])).toBe(false);
  });
});
