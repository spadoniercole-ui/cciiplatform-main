import { describe, expect, it } from 'vitest';
import {
  componiComunicazioniVera,
  formattaImportoEuro,
  type RigaVeraComunicazione,
} from './comunicazioni';

const riga = (over: Partial<RigaVeraComunicazione> = {}): RigaVeraComunicazione => ({
  sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
  voce: 'F24 non presentato',
  importo: 12_000,
  categoria: 'DEBITO',
  stato: '',
  trattamento: 'contabilizzato',
  periodo: '202506 - 202506',
  ...over,
});

const etichette = { DEBITO: 'Debito', AVA: 'Affidato alla Riscossione', NEUTRO: 'Neutro' };

describe('formattaImportoEuro', () => {
  it('formatta in italiano e non trasforma lo zero in un importo', () => {
    expect(formattaImportoEuro(12_345.6)).toBe('12.345,60 €');
    expect(formattaImportoEuro(0)).toBe('importo non determinato');
    expect(formattaImportoEuro(-1_200)).toBe('-1.200,00 €');
  });
});

describe('componiComunicazioniVera', () => {
  it('raggruppa per destinatario e mette la lavorazione nel testo', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Alfa Srl',
      dataVerifica: '2026-10-19',
      righe: [riga(), riga({ voce: 'Denunce non trasmesse', importo: 3_000, periodo: undefined })],
      lavorazioni: [
        {
          categoria: 'DEBITO',
          lavorazione: 'Verificare e trasmettere le denunce',
          destinatario: 'Mario Rossi',
        },
      ],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(1);
    const c = esito.comunicazioni[0];
    expect(c.destinatario).toBe('Mario Rossi');
    expect(c.righe).toBe(2);
    expect(c.totale).toBe(15_000);
    expect(c.oggetto).toContain('Alfa Srl');
    expect(c.corpo).toContain('Verificare e trasmettere le denunce');
    expect(c.corpo).toContain('12.000,00 €');
    expect(c.corpo).toContain('3.000,00 €');
    expect(c.corpo).toContain('Debito');
    expect(esito.categorieSenzaLavorazione).toHaveLength(0);
    expect(esito.righeSenzaCategoria).toBe(0);
  });

  it('un collega che segue due tipologie riceve una comunicazione sola', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Beta Srl',
      dataVerifica: '2026-10-19',
      righe: [riga(), riga({ categoria: 'AVA', sezione: 'ADR', voce: 'Cartella', importo: 900 })],
      lavorazioni: [
        { categoria: 'DEBITO', lavorazione: 'Contabilizzare', destinatario: 'Anna Bianchi' },
        { categoria: 'AVA', lavorazione: 'Verificare il ruolo', destinatario: 'Anna Bianchi' },
      ],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(1);
    expect(esito.comunicazioni[0].lavorazioni).toHaveLength(2);
    expect(esito.comunicazioni[0].categorie).toEqual(['AVA', 'DEBITO']);
    expect(esito.comunicazioni[0].righe).toBe(2);
  });

  it('una tipologia senza lavorazione non produce un messaggio muto', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Gamma Srl',
      dataVerifica: '2026-10-19',
      righe: [riga()],
      lavorazioni: [],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(0);
    expect(esito.categorieSenzaLavorazione).toEqual([
      { categoria: 'DEBITO', etichetta: 'Debito', righe: 1, totale: 12_000 },
    ]);
  });

  it('le posizioni senza categoria restano fuori e vengono contate', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Delta Srl',
      dataVerifica: '2026-10-19',
      righe: [riga({ categoria: '' }), riga({ categoria: '   ' })],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(0);
    expect(esito.righeSenzaCategoria).toBe(2);
  });

  it('una lavorazione disattivata non genera comunicazioni', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Epsilon Srl',
      dataVerifica: '2026-10-19',
      righe: [riga()],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y', attivo: false }],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(0);
    expect(esito.categorieSenzaLavorazione).toHaveLength(1);
  });

  it('un importo ignoto resta ignoto, non diventa zero euro', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Zeta Srl',
      dataVerifica: '2026-10-19',
      righe: [riga({ importo: 0, trattamento: 'potenziale' })],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    expect(esito.comunicazioni[0].corpo).toContain('importo non determinato');
    expect(esito.comunicazioni[0].corpo).not.toContain('0,00 €');
  });

  it('le posizioni sospese restano fuori dal testo e dal totale, ma sono dichiarate', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Iota Srl',
      dataVerifica: '2026-10-19',
      righe: [
        riga(),
        riga({ importo: 4_000, stato: 'Sospeso', trattamento: 'ignora', voce: 'F24 sospeso' }),
      ],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    const c = esito.comunicazioni[0];
    expect(c.righe).toBe(1);
    expect(c.totale).toBe(12_000);
    expect(c.corpo).not.toContain('F24 sospeso');
    expect(c.corpo).toContain('1 posizione per 4.000,00 €');
    expect(c.corpo).toContain('Non entrano nel totale');
    expect(esito.posizioniEscluse).toEqual({ righe: 1, totale: 4_000 });
  });

  it('una posizione sospesa non finisce fra le tipologie senza lavorazione', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Kappa Srl',
      dataVerifica: '2026-10-19',
      righe: [riga({ categoria: 'SANZIONI', trattamento: 'ignora' })],
      lavorazioni: [],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(0);
    expect(esito.categorieSenzaLavorazione).toHaveLength(0);
    expect(esito.posizioniEscluse.righe).toBe(1);
  });

  it('porta il periodo nel testo quando la riga ce l’ha', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Lambda Srl',
      dataVerifica: '2026-10-19',
      righe: [riga(), riga({ voce: 'Denunce', periodo: '' })],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    expect(esito.comunicazioni[0].corpo).toContain('(periodo 202506 - 202506)');
    expect(esito.comunicazioni[0].corpo).not.toContain('(periodo )');
  });

  it('una lavorazione con la tipologia scritta con spazi in più trova lo stesso le sue posizioni', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Mi Srl',
      dataVerifica: '2026-10-19',
      righe: [riga()],
      lavorazioni: [{ categoria: ' DEBITO ', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(1);
    expect(esito.categorieSenzaLavorazione).toHaveLength(0);
  });

  it('senza posizioni sospese non dichiara nulla di escluso', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Nu Srl',
      dataVerifica: '2026-10-19',
      righe: [riga()],
      lavorazioni: [{ categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Y' }],
      etichette,
    });

    expect(esito.posizioniEscluse).toEqual({ righe: 0, totale: 0 });
    expect(esito.comunicazioni[0].corpo).not.toContain('fuori perimetro');
  });

  it('separa i destinatari e li ordina', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Eta Srl',
      dataVerifica: '2026-10-19',
      righe: [
        riga({ categoria: 'DEBITO' }),
        riga({ categoria: 'AVA', sezione: 'ADR', voce: 'Cartella', importo: 900 }),
      ],
      lavorazioni: [
        { categoria: 'DEBITO', lavorazione: 'X', destinatario: 'Zeno' },
        { categoria: 'AVA', lavorazione: 'Y', destinatario: 'Aldo' },
      ],
      etichette,
    });

    expect(esito.comunicazioni.map((c) => c.destinatario)).toEqual(['Aldo', 'Zeno']);
  });

  it('la stessa posizione assegnata a due lavorazioni dello stesso collega compare una volta', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Theta Srl',
      dataVerifica: '2026-10-19',
      righe: [riga()],
      lavorazioni: [
        { categoria: 'DEBITO', lavorazione: 'Prima', destinatario: 'Collega' },
        { categoria: 'DEBITO', lavorazione: 'Seconda', destinatario: 'Collega' },
      ],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(1);
    expect(esito.comunicazioni[0].righe).toBe(1);
    expect(esito.comunicazioni[0].lavorazioni).toEqual(['Prima', 'Seconda']);
  });

  it('lo stesso ufficio scritto con maiuscole e spazi diversi resta una comunicazione sola', () => {
    const esito = componiComunicazioniVera({
      azienda: 'Iota Srl',
      dataVerifica: '2026-10-19',
      righe: [riga(), riga({ categoria: 'AVA', sezione: 'ADR', voce: 'Cartella', importo: 900 })],
      lavorazioni: [
        {
          categoria: 'DEBITO',
          lavorazione: 'Contabilizzare',
          destinatario: 'Presidio  dei flussi informativi',
        },
        {
          categoria: 'AVA',
          lavorazione: 'Verificare il ruolo',
          destinatario: 'PRESIDIO DEI FLUSSI INFORMATIVI',
        },
      ],
      etichette,
    });

    expect(esito.comunicazioni).toHaveLength(1);
    expect(esito.comunicazioni[0].destinatario).toBe('Presidio dei flussi informativi');
    expect(esito.comunicazioni[0].righe).toBe(2);
    expect(esito.comunicazioni[0].lavorazioni).toEqual(['Contabilizzare', 'Verificare il ruolo']);
  });
});
