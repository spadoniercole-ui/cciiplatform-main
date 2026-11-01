import { describe, expect, it } from 'vitest';
import { htmlCheckPerimetro } from './perimetroHtml';
import type { VocePerimetro } from './perimetro';

function voce(patch: Partial<VocePerimetro> = {}): VocePerimetro {
  return {
    lavorazioneId: 1,
    tipologia: 'Diffida',
    materia: 'Contributi',
    dipendenza: 'Ufficio legale',
    verso: 'COLLABORATIVA',
    codici: ['TS27'],
    prodotti: [],
    codiciDallaMateria: true,
    stato: 'RISCONTRATA',
    natura: null,
    nota: null,
    ...patch,
  };
}

describe('htmlCheckPerimetro', () => {
  it('senza voci non stampa nulla: non è una sezione mancante', () => {
    expect(htmlCheckPerimetro([])).toBe('');
  });

  it('stampa la parte obbligatoria: la TL e l’esito dichiarato', () => {
    const html = htmlCheckPerimetro([voce({ stato: 'NON_RISCONTRATA', natura: 'MODUS_OPERANDI' })]);
    expect(html).toContain('Diffida');
    expect(html).toContain('Contributi');
    expect(html).toContain('TS27');
    expect(html).toContain('Non riscontrata');
    expect(html).toContain('Modus operandi');
  });

  it('una voce senza risposta si dichiara «da verificare», non si omette', () => {
    const html = htmlCheckPerimetro([voce({ stato: null })]);
    expect(html).toContain('Da verificare');
  });

  it('la nota facoltativa compare solo se scritta, e non lascia avvisi quando manca', () => {
    const senza = htmlCheckPerimetro([voce()]);
    expect(senza).not.toContain('nota');
    expect(senza).not.toContain('non indicata');

    const con = htmlCheckPerimetro([voce({ nota: 'tre solleciti senza risposta' })]);
    expect(con).toContain('tre solleciti senza risposta');
  });

  it('stampa il prodotto da cui nasce la verifica, quando c’è', () => {
    expect(htmlCheckPerimetro([voce()])).not.toContain('Prodotti');
    const html = htmlCheckPerimetro([
      voce({ prodotti: ['Ticket licenziamento'], codiciDallaMateria: false }),
    ]);
    expect(html).toContain('Prodotti: Ticket licenziamento');
  });

  it('mette in sicurezza il testo proveniente dalle configurazioni', () => {
    const html = htmlCheckPerimetro([voce({ tipologia: '<script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
