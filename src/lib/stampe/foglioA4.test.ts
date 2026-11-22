import { describe, expect, it } from 'vitest';
import { stileFoglioA4 } from './foglioA4';

describe('stileFoglioA4', () => {
  it('stampa sempre su A4, con i margini della pagina fisica che riceve', () => {
    expect(stileFoglioA4()).toContain('@page { size: A4; margin: 9mm 10mm; }');
    expect(stileFoglioA4({ marginePagina: '24mm 18mm 20mm' })).toContain(
      '@page { size: A4; margin: 24mm 18mm 20mm; }'
    );
  });

  it('a stampa toglie il riempimento del foglio: i margini li dà @page', () => {
    const css = stileFoglioA4({ riempimento: '22mm 18mm 20mm' });
    expect(css).toContain('padding: 22mm 18mm 20mm;');
    expect(css).toContain('.foglio { width: auto; min-height: 0; margin: 0; padding: 0;');
  });

  it('ripete testata e piede solo se il documento li ha', () => {
    expect(stileFoglioA4()).not.toContain('.foglio-testata { display: flex');
    const css = stileFoglioA4({ ricorrenti: { sopra: '-18mm', sotto: '-14mm' } });
    expect(css).toContain('top: -18mm');
    expect(css).toContain('bottom: -14mm');
  });

  it('mette le regole di stampa della pagina dentro @media print', () => {
    const css = stileFoglioA4({ stampa: '.prova { break-after: avoid; }' });
    expect(css.indexOf('.prova')).toBeGreaterThan(css.indexOf('@media print'));
  });
});
