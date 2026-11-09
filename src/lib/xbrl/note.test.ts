import { describe, expect, it } from 'vitest';
import type { FactTestuale } from './types';
import { prioritaSezione, selezionaNote, sezioneNota, testoSemplice } from './note';

function nota(tagPulito: string, testo: string, ordine: number): FactTestuale {
  return {
    tagPulito,
    tagOriginale: `itcc-ci:${tagPulito}`,
    contextRef: 'c0_i',
    testo,
    lingua: 'it',
    ordine,
  };
}

const PARAGRAFO = (t: string) =>
  `&lt;p style=&quot;margin:0cm;text-align:justify;font-size:10.0pt;&quot;&gt;${t}&lt;/p&gt;`;

describe('testoSemplice', () => {
  it('toglie i tag HTML e risolve le entità, anche quando sono codificate due volte', () => {
    const grezzo = PARAGRAFO(
      'Signori Soci, la presente &amp;nbsp;nota &amp;amp; parte integrante.'
    );
    expect(testoSemplice(grezzo)).toBe('Signori Soci, la presente nota & parte integrante.');
  });

  it('risolve le entità numeriche e compatta gli spazi', () => {
    expect(testoSemplice('Totale&#160;&#160;1.000 &amp; oltre')).toBe('Totale 1.000 & oltre');
  });

  it('un testo già pulito resta com’è', () => {
    expect(testoSemplice('Nessun fatto di rilievo dopo la chiusura.')).toBe(
      'Nessun fatto di rilievo dopo la chiusura.'
    );
  });
});

describe('sezioneNota', () => {
  it('riconosce le sezioni dal tag della tassonomia ITCC-CI', () => {
    expect(sezioneNota(nota('IntroduzioneNotaIntegrativa', 'x', 0))).toBe('CRITERI');
    expect(sezioneNota(nota('CommentoPrincipiRedazione', 'x', 0))).toBe('CRITERI');
    expect(sezioneNota(nota('ContinuitaAziendale', 'x', 0))).toBe('CONTINUITA');
    expect(sezioneNota(nota('ImpegniEPassivitaPotenziali', 'x', 0))).toBe('IMPEGNI');
    expect(sezioneNota(nota('PartiCorrelate', 'x', 0))).toBe('PARTI_CORRELATE');
    expect(sezioneNota(nota('FattiDiRilievoDopoLaChiusura', 'x', 0))).toBe('FATTI_RILIEVO');
    expect(sezioneNota(nota('PianiEIntenzioni', 'x', 0))).toBe('PIANI');
    expect(sezioneNota(nota('EventiStraordinari', 'x', 0))).toBe('EVENTI_STRAORDINARI');
  });

  it('usa anche il testo quando il tag è generico, senza inventare sezioni', () => {
    expect(
      sezioneNota(nota('AltreInformazioni', 'Il presupposto della continuità aziendale è…', 0))
    ).toBe('CONTINUITA');
    expect(sezioneNota(nota('AltreInformazioni', 'Tabella delle immobilizzazioni.', 0))).toBe(
      'ALTRO'
    );
  });

  it('la priorità mette la continuità davanti a tutto e «altro» in fondo', () => {
    expect(prioritaSezione('CONTINUITA')).toBeLessThan(prioritaSezione('CRITERI'));
    expect(prioritaSezione('CRITERI')).toBeLessThan(prioritaSezione('ALTRO'));
  });
});

describe('selezionaNote', () => {
  it('scarta le etichette brevi e i duplicati, tenendo l’ordine di lettura', () => {
    const lungo = 'A'.repeat(120) + ' continuità aziendale valutata positivamente.';
    const esito = selezionaNote([
      nota('ContinuitaAziendale', lungo, 0),
      nota('Denominazione', 'ARETUSEA DETERGENTI S.R.L.', 1),
      nota('AltroTag', lungo, 2),
    ]);
    expect(esito.fatti).toHaveLength(1);
    expect(esito.fatti[0].sezione).toBe('CONTINUITA');
    expect(esito.scartati).toBe(2);
  });

  it('quando il tetto taglia, tiene prima le sezioni che cambiano le assunzioni', () => {
    // Il testo va scritto per intero: gli spazi di riempimento collassano
    // nella pulizia, e una frase corta verrebbe scartata come etichetta.
    const testo = (t: string) =>
      PARAGRAFO(
        `${t} La nota si riferisce al bilancio chiuso al 31/12/2025 e alle valutazioni degli amministratori.`
      );
    const esito = selezionaNote(
      [
        nota('CommentoPrincipiRedazione', testo('Criterio di redazione del bilancio.'), 0),
        nota('ContinuitaAziendale', testo('Presupposto della continuità aziendale.'), 1),
        nota('PianiEIntenzioni', testo('Piano industriale approvato dal consiglio.'), 2),
      ],
      { massimoFatti: 2 }
    );
    expect(esito.troncate).toBe(true);
    expect(esito.fatti.map((f) => f.sezione)).toEqual(['CONTINUITA', 'PIANI']);
    // L’ordine restituito è quello del file: la citazione resta al suo posto.
    expect(esito.fatti.map((f) => f.ordine)).toEqual([1, 2]);
  });

  it('dichiara il taglio quando supera i caratteri totali o per singolo testo', () => {
    const lungo = 'B'.repeat(500) + ' continuità aziendale.';
    const esito = selezionaNote([nota('ContinuitaAziendale', lungo, 0)], {
      caratteriPerFatto: 300,
    });
    expect(esito.troncate).toBe(true);
    expect(esito.fatti[0].testo).toHaveLength(300);

    const stretto = selezionaNote(
      [
        nota('ContinuitaAziendale', 'C'.repeat(200) + ' continuità.', 0),
        nota('ImpegniEPassivitaPotenziali', 'D'.repeat(200) + ' impegni.', 1),
      ],
      { caratteriTotali: 250 }
    );
    expect(stretto.troncate).toBe(true);
    expect(stretto.fatti).toHaveLength(1);
    expect(stretto.fatti[0].sezione).toBe('CONTINUITA');
  });

  it('conta le sezioni conservate, per poterlo dire nel report', () => {
    const esito = selezionaNote([
      nota(
        'ContinuitaAziendale',
        PARAGRAFO(
          'Continuità aziendale: il presupposto è stato verificato e non emergono incertezze significative sulla capacità di continuare l’attività.'
        ),
        0
      ),
      nota(
        'ImpegniEPassivitaPotenziali',
        PARAGRAFO(
          'Fideiussioni rilasciate a favore di terzi per 100.000 euro, oltre a una garanzia ipotecaria su un immobile strumentale.'
        ),
        1
      ),
    ]);
    expect(esito.sezioni.map((s) => s.sezione)).toEqual(['CONTINUITA', 'IMPEGNI']);
    expect(esito.sezioni[0].fatti).toBe(1);
    expect(esito.caratteri).toBe(esito.fatti.reduce((n, f) => n + f.testo.length, 0));
  });

  it('un file senza note non produce nulla e non dichiara tagli', () => {
    const esito = selezionaNote([]);
    expect(esito.fatti).toEqual([]);
    expect(esito.troncate).toBe(false);
    expect(esito.caratteri).toBe(0);
  });
});
