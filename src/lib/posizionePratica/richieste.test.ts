import { describe, expect, it } from 'vitest';
import { richiesteDa, testoRichiesta } from './richieste';

// Le lacune diventano documenti da chiedere, con la frase che dicono di
// sbloccare. Nessuna richiesta duplicata, nessun giudizio nel testo.

describe('richieste all’azienda', () => {
  it('riconosce i documenti che la piattaforma chiede davvero', () => {
    const r = richiesteDa({
      daAccertare: ['Serve l’Elenco Deleghe (F24), che porta la data di versamento.'],
      mancanzeChecklist: ['Risulta regolare il DURC? (prodotto DURC)'],
    });
    expect(r.map((x) => x.documento)).toEqual([
      'DURC aggiornato',
      'Elenco Deleghe (F24) con le date di versamento',
    ]);
    expect(r[0].da).toBe('AZIENDA');
    expect(r[1].da).toBe('ENTE');
  });

  it('lo stesso documento chiesto da due fonti resta una richiesta sola', () => {
    const r = richiesteDa({
      daAccertare: ['Manca il DURC aggiornato.'],
      mancanzeChecklist: ['Il DURC risulta regolare?'],
    });
    expect(r).toHaveLength(1);
    expect(r[0].chiude).toContain('Manca il DURC');
    expect(r[0].chiude).toContain('risulta regolare');
  });

  it('ciò che non riconosce lo lascia com’è, senza inventare un documento', () => {
    const r = richiesteDa({ daAccertare: ['Manca la dichiarazione del sindaco.'] });
    expect(r[0].documento).toBe('Manca la dichiarazione del sindaco.');
  });

  it('i flussi aggiungono denunce e deleghe con i numeri', () => {
    const r = richiesteDa({ flussi: { senzaDenuncia: 2, senzaDelega: 1 } });
    expect(r.map((x) => x.documento).join(' ')).toContain('Denunce contributive mancanti');
    expect(r.map((x) => x.chiude).join(' ')).toContain('2 periodi');
  });

  it('le dimensioni scoperte portano il motivo quando c’è', () => {
    const r = richiesteDa({
      dimensioniScoperte: [{ nome: 'Indici', motivo: 'manca il bilancio XBRL' }],
    });
    expect(r[0].chiude).toContain('Indici: manca il bilancio XBRL');
    expect(r[0].documento).toBe('Ultimo bilancio depositato (XBRL)');
  });

  it('il testo è una richiesta di documentazione, non un giudizio', () => {
    const richieste = richiesteDa({ mancanzeChecklist: ['DURC non regolare'] });
    const testo = testoRichiesta({
      ragioneSociale: 'Tessitura Lario S.p.A.',
      richieste,
      data: '2026-11-16',
    });
    expect(testo).toContain('richiesta di documentazione — Tessitura Lario S.p.A.');
    expect(testo).toContain('1. DURC aggiornato');
    expect(testo).toContain('Serve a:');
    expect(testo).toContain('non contiene valutazioni giuridiche');
  });

  it('senza lacune il testo lo dice, invece di lasciare il vuoto', () => {
    const testo = testoRichiesta({ ragioneSociale: 'Azienda', richieste: [] });
    expect(testo).toContain('Non risultano documenti mancanti');
  });
});
