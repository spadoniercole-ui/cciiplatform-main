import { describe, it, expect } from 'vitest';
import {
  classificaDocumenti,
  elencoDaSalvato,
  ruoliDaDocumenti,
  tipoDaNomeFile,
} from './documentiRicevuti';

const doc = (nome: string) => ({ nome, url: `u/${nome}` });

describe('documenti ricevuti in un unico caricamento', () => {
  it('usa la classificazione della lettura, poi il nome del file', () => {
    const el = classificaDocumenti(
      [
        doc('01_Lettera_di_trasmissione_INPS.pdf'),
        doc('02_Proposta_accordo_e_transazione_art57_63.pdf'),
        doc('04_Relazione_di_attestazione.pdf'),
        doc('06_Situazione_patrimoniale_30-06-2026_ed_elenco_creditori.pdf'),
      ],
      [{ documento: '01_Lettera_di_trasmissione_INPS', tipo: 'ALTRO' }]
    );
    expect(el.map((d) => d.tipo)).toEqual([
      'ALTRO',
      'PROPOSTA',
      'ATTESTAZIONE',
      'SITUAZIONE_CONTABILE',
    ]);
    const r = ruoliDaDocumenti(el);
    expect(r.proposta?.nome).toContain('Proposta');
    expect(r.situazioneContabile?.nome).toContain('Situazione');
    expect(r.altri.map((d) => d.nome)).toEqual(['01_Lettera_di_trasmissione_INPS.pdf']);
  });

  it('un solo documento è la proposta; senza proposta riconosciuta se ne sceglie una', () => {
    expect(classificaDocumenti([doc('x.pdf')], [])[0].tipo).toBe('PROPOSTA');
    const el = classificaDocumenti([doc('a.pdf'), doc('b.pdf')], []);
    expect(el.filter((d) => d.tipo === 'PROPOSTA')).toHaveLength(1);
  });

  it('il formato a tre scomparti si legge ancora', () => {
    const el = elencoDaSalvato({
      propostaCramDown: { nome: 'p.pdf', url: 'u1' },
      asseverazione: null,
      pianoSviluppo: { nome: 'pi.pdf', url: 'u2' },
    });
    expect(el).toEqual([
      { nome: 'p.pdf', url: 'u1', tipo: 'PROPOSTA' },
      { nome: 'pi.pdf', url: 'u2', tipo: 'PIANO' },
    ]);
    expect(tipoDaNomeFile('03_Piano_di_risanamento.pdf')).toBe('PIANO');
  });
});
