import { describe, it, expect } from 'vitest';
import { htmlRiferimentiEMetodo } from './riferimentiHtml';
import { revisionaTesto } from '@/lib/revisore/revisore';

describe('allegato «Riferimenti e metodo»', () => {
  it('riunisce perimetro, documenti, fonti del registro (dal motore e dal testo), materie, basi e revisione', () => {
    const testo =
      'Ai sensi dell’art. 25-novies CCII i presupposti risultano rilevati. L’obbligo Uniemens discende dal D.M. 26 ottobre 2009.';
    const h = htmlRiferimentiEMetodo({
      fase: 'SCREENING',
      documenti: [
        {
          tipo: 'VISURA',
          nomeFile: 'visura.pdf',
          impronta: 'a'.repeat(64),
          caricatoIl: '2026-09-23T10:00:00Z',
        },
      ],
      fontiUsate: ['CCII-25novies-c1-a'],
      testo,
      materie: [
        {
          nome: 'Denunce Uniemens',
          presupposto: 'D.L. 269/2003, art. 44, c. 9',
          riferimenti: 'circolare …',
          confermataDa: 'ercole',
          confermataIl: '2026-09-23T10:00:00Z',
          codici: ['27', '10'],
        },
      ],
      revisione: revisionaTesto(testo, 'RELAZIONE_SCREENING'),
    });
    for (const atteso of [
      '1. Perimetro',
      '2. Documenti di origine',
      'aaaaaaaaaaaa…',
      '3. Fonti normative',
      'CCII-25novies-c1-a',
      'non presenti nel registro',
      'D.M. 26 ottobre 2009',
      '4. Titoli di credito',
      'Denunce Uniemens',
      '27, 10',
      '5. Basi metodologiche',
      'Altman',
      '6. Revisione automatica',
    ]) {
      expect(h).toContain(atteso);
    }
    // I pesi dell'indice composito non si dichiarano più: non esistono.
    expect(h).not.toContain('Pesi delle dimensioni');
    expect(h).not.toContain('Vincoli di non compensabilità');
    expect(h).not.toContain('a'.repeat(20));
  });
});
