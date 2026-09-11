import { describe, it, expect } from 'vitest';
import { statoRichiestaDocumenti } from './documentiGiaPresenti';

describe('chiedere i documenti o chiedere se aggiornarli', () => {
  it('senza nulla di pregresso si chiedono, come sempre', () => {
    // "Vuoi aggiornare?" a chi non ha caricato niente sarebbe peggio del
    // problema che si voleva risolvere.
    expect(statoRichiestaDocumenti(false, 0, null)).toBe('chiedi_documenti');
  });

  it('la sola visura del triage basta a far scattare la domanda', () => {
    expect(statoRichiestaDocumenti(true, 0, null)).toBe('chiedi_se_aggiornare');
  });

  it('i soli bilanci bastano a far scattare la domanda', () => {
    expect(statoRichiestaDocumenti(false, 2, null)).toBe('chiedi_se_aggiornare');
  });

  it('al "sì" compaiono i caricamenti', () => {
    expect(statoRichiestaDocumenti(true, 2, true)).toBe('mostra_caricamenti');
  });

  it('al "no" si procede con quel che c’è, senza caricamenti', () => {
    expect(statoRichiestaDocumenti(true, 2, false)).toBe('procedi_con_esistenti');
  });

  it('senza pregresso la risposta non conta: si chiedono comunque', () => {
    // Caso di confine: se i documenti vengono eliminati fra una schermata e
    // l'altra, una risposta data prima non deve nascondere i caricamenti.
    expect(statoRichiestaDocumenti(false, 0, false)).toBe('chiedi_documenti');
    expect(statoRichiestaDocumenti(false, 0, true)).toBe('chiedi_documenti');
  });
});
