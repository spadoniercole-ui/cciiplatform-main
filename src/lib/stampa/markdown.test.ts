import { describe, it, expect } from 'vitest';
import { markdownInHtml } from './markdown';

describe('markdown per la stampa', () => {
  it('tabelle vere, non barre verticali', () => {
    const h = markdownInHtml(
      '| Indice | Valore | Esito |\n|---|---|---|\n| C1 | 1,35 | **VIOLATO** |\n| C3 | 0,04 | OK |'
    );
    expect(h).toContain('<table>');
    expect(h).toContain('<th>Indice</th>');
    expect(h).toContain('<td class="num">1,35</td>');
    expect(h).toContain('<strong>VIOLATO</strong>');
    expect(h).not.toContain('|');
  });

  it('titoli, elenchi, separatori e grassetto', () => {
    const h = markdownInHtml(
      '## 1. Sintesi\n\nTesto **forte** e *corsivo*.\n\n- uno\n- due\n\n---'
    );
    expect(h).toContain('<h3>1. Sintesi</h3>');
    expect(h).toContain('<strong>forte</strong>');
    expect(h).toContain('<em>corsivo</em>');
    expect(h).toContain('<ul><li>uno</li><li>due</li></ul>');
    expect(h).toContain('<hr>');
  });

  it('nessun HTML passa dal testo', () => {
    expect(markdownInHtml('<script>x</script>')).toContain('&lt;script&gt;');
  });
});
