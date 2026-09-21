import { describe, it, expect } from 'vitest';
import {
  annoDa,
  estraiRighe,
  firmaIntestazioni,
  proponiMappatura,
  type MappaturaProspetto,
} from './mappatura';

const anni = { corrente: 2026, precedente: 2025, meno2: 2024 };

describe('la firma di un tracciato', () => {
  it('ignora gli anni: lo stesso tracciato resta riconoscibile l’anno dopo', () => {
    // Con gli anni dentro la firma, un riepilogo "2026|2025|2024" e il suo
    // successore "2027|2026|2025" sembrerebbero tracciati diversi, e la
    // mappatura salvata non servirebbe mai.
    expect(firmaIntestazioni(['Voce', '2026', '2025', '2024'])).toBe(
      firmaIntestazioni(['Voce', '2027', '2026', '2025'])
    );
  });

  it('ignora maiuscole, spazi e punteggiatura', () => {
    expect(firmaIntestazioni(['Periodo comp.', 'Saldo'])).toBe(
      firmaIntestazioni(['PERIODO COMP', 'saldo'])
    );
  });

  it('distingue tracciati davvero diversi', () => {
    expect(firmaIntestazioni(['Voce', 'Importo'])).not.toBe(
      firmaIntestazioni(['Voce', 'Data', 'Importo'])
    );
  });
});

describe('lettura dell’anno, qualunque sia la forma', () => {
  it.each([
    ['16/02/2025', 2025],
    ['2025-02-16', 2025],
    ['2024/09', 2024],
    ['09/2024', 2024],
    ['2023', 2023],
  ])('%s → %i', (v, atteso) => {
    expect(annoDa(v)).toBe(atteso);
  });

  it('legge il numero seriale di Excel invece di prenderlo per un anno', () => {
    // 45703 è il 16/02/2025 nel calendario di Excel. Letto come numero
    // darebbe un "anno" di cinque cifre.
    expect(annoDa(45703)).toBe(2025);
  });

  it('una data illeggibile torna null, non un anno inventato', () => {
    expect(annoDa('fine esercizio')).toBeNull();
  });
});

describe('forma RIEPILOGO — una colonna per anno', () => {
  const foglio = [
    ['Voce', '2026', '2025', '2024', '2023'],
    ['Contributi INPS', '98.928', '418.709', '385.200', '300.000'],
    ['Premi INAIL', 4100, 12300, 11800, 9000],
  ];

  it('la proposta riconosce la forma dalle colonne con un anno', () => {
    expect(proponiMappatura(foglio).forma).toBe('RIEPILOGO');
  });

  it('estrae i tre anni del triage e dichiara quelli fuori', () => {
    const m: MappaturaProspetto = {
      ...proponiMappatura(foglio),
      categoriaFile: 'PREVIDENZIALE',
    };
    const e = estraiRighe(foglio, m, anni, 7, 'prospetto.xlsx');
    expect(e.righe).toHaveLength(2);
    expect(e.righe[0].importoAnnoPrecedente).toBe(418_709);
    expect(e.righe[0].prospettoId).toBe(7);
    // Il 2023 non si perde in silenzio.
    expect(e.anniFuoriFinestra).toEqual([2023]);
  });

  it('una riga senza categoria viene scartata e dichiarata', () => {
    const m = proponiMappatura(foglio); // categoriaFile resta null
    const e = estraiRighe(foglio, m, anni, null, 'x');
    expect(e.righe).toHaveLength(0);
    expect(e.scartate[0].motivo).toContain('categoria');
  });
});

describe('forma DETTAGLIO — righe con una data, sommate per anno', () => {
  const foglio = [
    ['Causale', 'Data', 'Importo'],
    ['Contributi gennaio', '16/02/2025', '35.253'],
    ['Contributi febbraio', '16/03/2025', '34.800'],
    ['Contributi gennaio', '16/02/2026', '30.000'],
    ['Contributi dicembre', '16/01/2023', '99.999'],
    ['riga senza data', '', '10'],
  ];

  it('la proposta riconosce la forma e le colonne dai nomi', () => {
    const p = proponiMappatura(foglio);
    expect(p.forma).toBe('DETTAGLIO');
    expect(p.colData).toBe(1);
    expect(p.colImporto).toBe(2);
  });

  it('somma per anno invece di produrre una riga per movimento', () => {
    // Raggruppare per causale darebbe una riga per mese: inutile. Il
    // raggruppamento naturale di un dettaglio è la categoria.
    const m: MappaturaProspetto = { ...proponiMappatura(foglio), categoriaFile: 'PREVIDENZIALE' };
    const e = estraiRighe(foglio, m, anni, null, 'estratto.xlsx');
    expect(e.righe).toHaveLength(1);
    expect(e.righe[0].importoAnnoPrecedente).toBe(70_053);
    expect(e.righe[0].importoAnnoCorrente).toBe(30_000);
  });

  it('dichiara gli anni fuori finestra e le date illeggibili', () => {
    const m: MappaturaProspetto = { ...proponiMappatura(foglio), categoriaFile: 'PREVIDENZIALE' };
    const e = estraiRighe(foglio, m, anni, null, 'x');
    expect(e.anniFuoriFinestra).toEqual([2023]);
    expect(e.scartate.some((s) => s.motivo.includes('data'))).toBe(true);
  });

  it('la categoria può venire da una colonna, riga per riga', () => {
    const misto = [
      ['Natura', 'Data', 'Importo'],
      ['INPS', '16/02/2025', 1000],
      ['IVA', '16/03/2025', 500],
      ['Fornitori', '16/03/2025', 200],
    ];
    const m: MappaturaProspetto = {
      ...proponiMappatura(misto),
      colCategoria: 0,
      mappaCategorie: { inps: 'PREVIDENZIALE', iva: 'FISCALE', fornitori: 'COMMERCIALE' },
    };
    const e = estraiRighe(misto, m, anni, null, 'x');
    expect(e.righe).toHaveLength(3);
    const prev = e.righe.find((r) => r.categoria === 'PREVIDENZIALE');
    expect(prev?.importoAnnoPrecedente).toBe(1000);
  });

  it('senza colonna di data o di importo non estrae nulla, e lo dice', () => {
    const m: MappaturaProspetto = {
      ...proponiMappatura(foglio),
      categoriaFile: 'PREVIDENZIALE',
      colImporto: null,
    };
    const e = estraiRighe(foglio, m, anni, null, 'x');
    expect(e.righe).toHaveLength(0);
    expect(e.scartate[0].motivo).toContain('importo');
  });
});

describe('importi all’italiana', () => {
  it.each([
    ['418.709', 418_709],
    ['1.213.831', 1_213_831],
    ['418.709,50', 418_709.5],
    ['35,25', 35.25],
    ['35.25', 35.25],
    ['1.234', 1_234],
    ['98928', 98_928],
  ])('%s → %f', async (v, atteso) => {
    const { leggiImportoItaliano } = await import('./mappatura');
    expect(leggiImportoItaliano(v)).toBe(atteso);
  });
});

describe('forma SALDO — residui aperti a oggi', () => {
  const ruoli = [
    ['ID Cartella', 'Data Stato', 'Residuo'],
    ['A', '19/01/2026', 45434.52],
    ['B', '29/06/2022', 6484.48],
    ['C', '03/11/2021', 11668.26],
    ['D', '02/10/2019', 4712.89],
  ];

  it('somma TUTTI i residui, qualunque sia la data', () => {
    // Trattata come dettaglio, questa lista scartava 2019, 2021 e 2022 come
    // "fuori dal triage": ma una cartella ancora aperta è debito di OGGI.
    const m: MappaturaProspetto = {
      ...proponiMappatura(ruoli),
      forma: 'SALDO',
      colImporto: 2,
      categoriaFile: 'PREVIDENZIALE',
    };
    const e = estraiRighe(ruoli, m, anni, null, 'ruoli.xlsx');
    expect(e.righe).toHaveLength(1);
    expect(Math.round((e.righe[0].importoAnnoCorrente ?? 0) * 100) / 100).toBe(68_300.15);
    expect(e.anniFuoriFinestra).toEqual([]);
  });

  it('gli anni precedenti restano vuoti: una fotografia di oggi non dice il passato', () => {
    const m: MappaturaProspetto = {
      ...proponiMappatura(ruoli),
      forma: 'SALDO',
      colImporto: 2,
      categoriaFile: 'PREVIDENZIALE',
    };
    const e = estraiRighe(ruoli, m, anni, null, 'ruoli.xlsx');
    expect(e.righe[0].importoAnnoPrecedente).toBeNull();
    expect(e.righe[0].importoAnnoMeno2).toBeNull();
  });
});

describe('categoria proposta dall’ente', () => {
  it('un credito di un ente non è mai commerciale', async () => {
    const { categoriaDaEnte } = await import('./mappatura');
    expect(categoriaDaEnte('INPS')).toBe('PREVIDENZIALE');
    expect(categoriaDaEnte('INAIL')).toBe('ASSICURATIVO');
    // L'Agente della Riscossione incassa per conto d'altri: non si propone
    // una categoria, perché sarebbe indovinare di chi è il credito.
    expect(categoriaDaEnte('AGENZIA_RISCOSSIONE')).toBeNull();
    expect(categoriaDaEnte('ALTRO')).toBeNull();
  });
});

describe('categoria riga per riga: niente ricadute silenziose', () => {
  it('un valore non tradotto viene SCARTATO, non attribuito alla categoria del file', () => {
    // L'interfaccia mostra "non usare" per i valori non tradotti. Con la
    // ricaduta sulla categoria del file, un'IVA non tradotta finiva in
    // "previdenziale": il contrario di quanto mostrato.
    const foglio = [
      ['Natura', 'Data', 'Importo'],
      ['INPS', '16/02/2025', 1000],
      ['IVA', '16/03/2025', 500],
    ];
    const m: MappaturaProspetto = {
      ...proponiMappatura(foglio),
      colCategoria: 0,
      categoriaFile: 'PREVIDENZIALE',
      mappaCategorie: { inps: 'PREVIDENZIALE' }, // IVA non tradotta
    };
    const e = estraiRighe(foglio, m, anni, null, 'x');
    expect(e.righe).toHaveLength(1);
    expect(e.righe[0].importoAnnoPrecedente).toBe(1000); // l'IVA non c'è
    expect(e.scartate[0].motivo).toContain('categoria');
  });
});
