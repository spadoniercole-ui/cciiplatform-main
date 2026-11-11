import { describe, expect, it } from 'vitest';
import {
  componiReport,
  htmlReport,
  normalizzaInclusioni,
  type FontiReport,
  type InclusioniReport,
} from '@/lib/reportAzienda/report';

const inclusioniTutte: InclusioniReport = {
  analisi: 'RIUSA',
  questionario: true,
  riscontri: true,
  riferimenti: true,
};

function fonti(extra: Partial<FontiReport> = {}): FontiReport {
  return {
    ragioneSociale: 'SANMICHELE S.R.L.',
    partitaIva: '08823480960',
    codiceFiscale: '08823480960',
    identificativi: [{ etichetta: 'MATRICOLA', valore: '4982185281' }],
    amministrativa: {
      etichetta: 'Attenzione alta',
      esito: 'ROSSO',
      copertura: '9/10',
      verificataIl: '2026-11-10',
      debitoTotale: 925272,
      debitoFonte: 'certificazione dei debiti',
      debitoIl: '2026-11-10',
    },
    contabile: {
      anniXbrl: 2,
      visuraIl: '2026-11-09',
      parametriPresenti: true,
      completa: true,
    },
    screening: {
      esiste: true,
      generatoIl: '2026-11-10T09:00:00.000Z',
      relazioneTesto: '## Inquadramento\nLa posizione è **in tensione**.',
      impronta: 'abc123def4567890',
      nomeFileVisura: 'visura.pdf',
      validita: 'Oggi',
      fatti: null,
    },
    prospetto: null,
    riscontri: null,
    soglie25: null,
    mappa: null,
    questionario: null,
    ...extra,
  };
}

describe('normalizzaInclusioni', () => {
  it('accetta solo le scelte ammesse e riporta il resto al default', () => {
    expect(normalizzaInclusioni(undefined)).toEqual({
      analisi: 'RIUSA',
      questionario: false,
      riscontri: true,
      riferimenti: true,
    });
    expect(normalizzaInclusioni({ analisi: 'QUALCOSA', questionario: 'sì' })).toEqual({
      analisi: 'RIUSA',
      questionario: false,
      riscontri: true,
      riferimenti: true,
    });
    expect(normalizzaInclusioni({ analisi: 'ESCLUDI', riscontri: false })).toEqual({
      analisi: 'ESCLUDI',
      questionario: false,
      riscontri: false,
      riferimenti: true,
    });
  });
});

describe('componiReport', () => {
  it('porta il debito dell’ente e l’esito amministrativo in sola lettura', () => {
    const { sezioni, avvisi } = componiReport(fonti(), inclusioniTutte);
    const amm = sezioni.find((s) => s.id === 'amministrativa');
    expect(amm?.tipo).toBe('voci');
    if (amm?.tipo !== 'voci') throw new Error('sezione amministrativa assente');
    expect(
      amm.voci.some((v) => v.etichetta === 'Debito dell’ente' && v.valore === '925.272 €')
    ).toBe(true);
    expect(amm.nota).toMatch(/sola lettura/i);
    expect(avvisi.some((a) => /non ha consegnato un debito/i.test(a))).toBe(false);
  });

  it('senza verifica amministrativa lo dice e non iscrive alcun debito', () => {
    const { sezioni, avvisi } = componiReport(fonti({ amministrativa: null }), inclusioniTutte);
    expect(avvisi.some((a) => /amministrativa non è ancora stata eseguita/i.test(a))).toBe(true);
    const amm = sezioni.find((s) => s.id === 'amministrativa');
    if (amm?.tipo !== 'voci') throw new Error('sezione amministrativa assente');
    expect(amm.voci).toHaveLength(0);
    expect(amm.nota).toMatch(/Non disponibile/);
  });

  it('senza analisi disponibile avvisa e lascia la sezione vuota', () => {
    const { sezioni, avvisi } = componiReport(
      fonti({ screening: { ...fonti().screening!, relazioneTesto: null } }),
      inclusioniTutte
    );
    expect(avvisi.some((a) => /Nessuna analisi disponibile/i.test(a))).toBe(true);
    const analisi = sezioni.find((s) => s.id === 'analisi');
    if (analisi?.tipo !== 'testo') throw new Error('sezione analisi assente');
    expect(analisi.testo).toBe('');
  });

  it('rispetta le inclusioni: analisi esclusa e questionario spento', () => {
    const { sezioni, avvisi } = componiReport(
      fonti({
        questionario: [
          {
            titolo: 'Direttrice A',
            domande: [{ id: '1.1', domanda: 'DURC in regola?', risposta: 'Sì' }],
          },
        ],
      }),
      { ...inclusioniTutte, analisi: 'ESCLUDI', questionario: false }
    );
    expect(sezioni.some((s) => s.id === 'analisi')).toBe(false);
    expect(sezioni.some((s) => s.id === 'questionario')).toBe(false);
    expect(avvisi.some((a) => /analisi di inquadramento è stata esclusa/i.test(a))).toBe(true);
  });

  it('allega il questionario quando richiesto, con le risposte', () => {
    const { sezioni } = componiReport(
      fonti({
        questionario: [
          {
            titolo: 'Direttrice A',
            domande: [
              { id: '1.1', domanda: 'DURC in regola?', risposta: 'Sì' },
              { id: '1.2', domanda: 'Posizione sospesa?', risposta: null },
            ],
          },
        ],
      }),
      inclusioniTutte
    );
    const q = sezioni.find((s) => s.id === 'questionario');
    if (q?.tipo !== 'elenco') throw new Error('allegato questionario assente');
    expect(q.voci[0].valore).toContain('DURC in regola? — Sì');
    expect(q.voci[0].valore).toContain('Posizione sospesa? — senza risposta');
  });

  it('il prospetto entra solo quando ci sono i bilanci', () => {
    const senza = componiReport(fonti(), inclusioniTutte);
    expect(senza.sezioni.some((s) => s.id === 'prospetto')).toBe(false);
    const con = componiReport(
      fonti({
        prospetto: {
          anni: [2024],
          righe: [{ etichetta: 'Ricavi delle vendite', valori: [7050112], forte: false }],
          indici: [],
        },
      }),
      inclusioniTutte
    );
    expect(con.sezioni.some((s) => s.id === 'prospetto')).toBe(true);
  });

  it('la stampa escapa i dati e converte solo il markdown dell’analisi', () => {
    const { sezioni, avvisi } = componiReport(
      fonti({ ragioneSociale: '<script>alert(1)</script>' }),
      inclusioniTutte
    );
    const html = htmlReport({
      ragioneSociale: '<script>alert(1)</script>',
      generatoIl: '2026-11-11T10:00:00.000Z',
      versione: '0.200.0',
      impronta: 'abcdef0123456789',
      inclusioni: inclusioniTutte,
      avvisi,
      sezioni,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>in tensione</strong>');
  });

  it('porta la mappa salvata come base, con il debito come «di cui» dei costi', () => {
    const { sezioni } = componiReport(
      fonti({
        mappa: {
          profilo: 'Standard',
          annualita: 3,
          debitoEnte: 925272,
          crescitaStoricaPct: 4.2,
          crescitaApplicataPct: 4.2,
          avvertenze: [],
          salvataIl: '2026-11-10T10:00:00.000Z',
          colonne: [
            {
              anno: 2024,
              tipo: 'STORICO',
              valori: { ricaviVendite: 7050112, costiProduzione: 6000000 },
              debitoEnteInserito: 0,
              indici: [],
            },
            {
              anno: 2025,
              tipo: 'PROIEZIONE',
              valori: { ricaviVendite: 7300000, costiProduzione: 6400000 },
              debitoEnteInserito: 925272,
              indici: [],
            },
          ],
        },
      }),
      inclusioniTutte
    );
    const mappa = sezioni.find((s) => s.id === 'mappa');
    if (mappa?.tipo !== 'mappa') throw new Error('sezione mappa assente');
    expect(mappa.anni).toEqual([2024, 2025]);
    expect(mappa.tipi).toEqual(['STORICO', 'PROIEZIONE']);
    expect(mappa.debitiInseriti).toEqual([0, 925272]);
    expect(mappa.righe.find((r) => r.etichetta === 'Costi della produzione')?.valori).toEqual([
      6000000, 6400000,
    ]);
    expect(mappa.nota).toMatch(/di cui/i);
    expect(mappa.nota).toMatch(/2025/);
  });

  it('senza base salvata lo dichiara invece di mostrare una mappa vuota', () => {
    const { sezioni, avvisi } = componiReport(fonti(), inclusioniTutte);
    expect(sezioni.some((s) => s.id === 'mappa')).toBe(false);
    expect(avvisi.some((a) => /Nessuna simulazione è salvata come base/i.test(a))).toBe(true);
  });

  it('porta le righe dell’art. 25-novies nei riscontri, con la qualificazione', () => {
    const { sezioni } = componiReport(
      fonti({
        riscontri: {
          soglie: [],
          indicatori: [],
          articoli: [],
          datiMancanti: [],
          impresaMinore: null,
        },
        soglie25: {
          righe: [
            {
              ambito: 'INPS',
              descrizione: 'Contributi scaduti',
              esposizione: 30000,
              esito: 'sopra',
              motivo: 'Oltre la soglia del 30% dei contributi dovuti',
              fonte: 'Certificazione dei debiti',
              applicabile: true,
            },
          ],
          datiMancanti: [],
          nonApplicabiliPerDatiMancanti: 0,
        },
      }),
      inclusioniTutte
    );
    const riscontri = sezioni.find((s) => s.id === 'riscontri');
    if (riscontri?.tipo !== 'elenco') throw new Error('sezione riscontri assente');
    expect(
      riscontri.voci.some(
        (v) => v.etichetta === 'Art. 25-novies — INPS' && v.valore.includes('30.000 €')
      )
    ).toBe(true);
    expect(riscontri.nota).toMatch(/non accerta lo stato di crisi/i);
  });
});
