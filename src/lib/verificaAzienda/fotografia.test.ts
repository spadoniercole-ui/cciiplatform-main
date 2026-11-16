// La verifica azienda è una fotografia: colonne del prospetto contabile, poi
// tre scenari sul credito vantato. I test che contano sono due — che non si
// inventi una colonna, e che la perdita sia credito − recupero con le
// percentuali dell'ente, dichiarata non calcolabile quando una manca.

import { describe, expect, it } from 'vitest';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { componiProiezione } from '@/lib/contabile/proiezione';
import type { ParametriScenari } from '@/lib/triage/scenari';
import { capacitaRisposta, colonneFotografia, componiFotografia } from './fotografia';

function dati(parziale: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo {
  const base: DatiFinanziariPeriodo = {
    ricaviVendite: 1000,
    valoreProduzione: 1100,
    costiProduzione: 900,
    ebit: 200,
    ammortamenti: 50,
    ebitda: 250,
    oneriFinanziari: 20,
    utileEsercizio: 100,
    totaleAttivo: 3000,
    attivoCircolante: 1200,
    disponibilitaLiquide: 100,
    immobilizzazioni: 1800,
    patrimonioNetto: 800,
    totaleDebiti: 2200,
    debitiBanche: 900,
    debitiFornitori: 600,
    debitiTributari: 300,
    debitiPrevidenziali: 400,
    passivoCorrente: 1000,
    creditiClienti: 700,
  };
  return { ...base, ...parziale };
}

/**
 * Due bilanci depositati e la verifica nel 2024: due colonne, entrambe
 * depositate. Serve alle prove sulla capacità di risposta, che si misurano
 * sull'ultima colonna — quella che la contabile non ha costruito.
 */
function proiezione(ultima: Partial<DatiFinanziariPeriodo> = {}, annoVerifica = 2024) {
  return componiProiezione({
    bilanci: [
      { anno: 2023, dati: dati({ disponibilitaLiquide: 80, utileEsercizio: 90 }) },
      {
        anno: 2024,
        dati: dati({ disponibilitaLiquide: 100, utileEsercizio: 100, ...ultima }),
      },
    ],
    annoVerifica,
  });
}

function parametri(parziale: Partial<ParametriScenari> = {}): ParametriScenari {
  return {
    costiProceduraPct: 10,
    ranghi: [
      { rango: 'PREDEDUCIBILE', tassoLiquidazionePct: 90, cramDownPct: 100 },
      { rango: 'PRIVILEGIATO', tassoLiquidazionePct: 60, cramDownPct: 50 },
      { rango: 'CHIROGRAFARIO', tassoLiquidazionePct: 30, cramDownPct: 20 },
      { rango: 'POSTERGATO', tassoLiquidazionePct: 0, cramDownPct: 0 },
    ],
    ...parziale,
  };
}

describe('fotografia della verifica azienda', () => {
  it('porta le colonne del prospetto contabile, con l’etichetta di ogni anno', () => {
    const colonne = colonneFotografia(proiezione({}, 2025));
    expect(colonne.map((c) => c.anno)).toEqual([2023, 2024, 2025]);
    expect(colonne.map((c) => c.tipo)).toEqual(['STORICO', 'STORICO', 'CALCOLATO']);
    // Gli indici arrivano dallo stesso motore del resto della piattaforma.
    expect(colonne[0].indici.length).toBeGreaterThan(0);
  });

  it('la capacità di risposta è integrale quando la cassa copre il credito', () => {
    const anni = colonneFotografia(proiezione({ disponibilitaLiquide: 500 }));
    const c = capacitaRisposta(anni, 400);
    expect(c.esito).toBe('INTEGRALE');
    expect(c.coperturaPct).toBeCloseTo(125, 2);
    expect(c.scoperto).toBe(0);
    expect(c.dettaglio).toContain('basta a coprirlo');
  });

  it('dice di quanto resta corta, e in quante annualità si colma', () => {
    const anni = colonneFotografia(proiezione({ disponibilitaLiquide: 100 }));
    const c = capacitaRisposta(anni, 1000);
    expect(c.esito).toBe('PARZIALE');
    expect(c.scoperto).toBe(900);
    expect(c.flusso).toBe(100);
    expect(c.anniCopertura).toBe(9);
    expect(c.dettaglio).toContain('scoperti');
  });

  it('senza credito vantato non si misura nulla: niente zero inventati', () => {
    const anni = colonneFotografia(proiezione());
    const c = capacitaRisposta(anni, null);
    expect(c.esito).toBe('NON_CALCOLABILE');
    expect(c.coperturaPct).toBeNull();
    expect(c.dettaglio).toContain('non è accertato');
  });

  it('i tre scenari partono dalla fotografia e dal credito vantato', () => {
    const f = componiFotografia({
      proiezione: proiezione({ disponibilitaLiquide: 100 }),
      credito: 1000,
      rango: 'CHIROGRAFARIO',
      parametri: parametri(),
    });
    expect(f.motivo).toBeNull();
    expect(f.anni.map((a) => a.anno)).toEqual([2023, 2024]);
    expect(f.scenari.map((s) => s.codice)).toEqual(['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN']);

    const [accordo, liquidazione, cram] = f.scenari;
    // L'accordo non è un recupero: è la capacità di risposta.
    expect(accordo.recupero).toBeNull();
    expect(accordo.perdita).toBeNull();
    expect(accordo.calcolabile).toBe(true);

    // 1000 × 30% = 300 lordi, meno il 10% di spese = 270 netti.
    expect(liquidazione.recupero).toBeCloseTo(270, 2);
    expect(liquidazione.perdita).toBeCloseTo(730, 2);
    // 1000 × 20% = 200, senza costi: la percentuale è già l'esito.
    expect(cram.recupero).toBeCloseTo(200, 2);
    expect(cram.perdita).toBeCloseTo(800, 2);
    expect(f.confronto?.differenza).toBeCloseTo(70, 2);
  });

  it('una percentuale mancante rende lo scenario non calcolabile, non perdita zero', () => {
    const f = componiFotografia({
      proiezione: proiezione(),
      credito: 1000,
      rango: 'CHIROGRAFARIO',
      parametri: {
        costiProceduraPct: null,
        ranghi: [{ rango: 'CHIROGRAFARIO', tassoLiquidazionePct: null, cramDownPct: 20 }],
      },
    });
    const [accordo, liquidazione, cram] = f.scenari;
    expect(accordo.calcolabile).toBe(true);
    expect(liquidazione.calcolabile).toBe(false);
    expect(liquidazione.recupero).toBeNull();
    expect(liquidazione.perdita).toBeNull();
    expect(liquidazione.motivo).toContain('spese di procedura');
    // Il cram down non dipende dalle spese di procedura: resta calcolabile.
    expect(cram.calcolabile).toBe(true);
    expect(cram.perdita).toBeCloseTo(800, 2);
  });

  it('senza rango non si applica nessuna percentuale per rango', () => {
    const f = componiFotografia({
      proiezione: proiezione(),
      credito: 1000,
      rango: null,
      parametri: parametri(),
    });
    expect(f.scenari[1].calcolabile).toBe(false);
    expect(f.scenari[2].calcolabile).toBe(false);
    expect(f.avvertenze.join(' ')).toContain('Rango del credito non scelto');
  });

  it('una proiezione senza bilanci non produce colonne né scenari', () => {
    const vuota = componiProiezione({ bilanci: [], annoVerifica: 2025 });
    const f = componiFotografia({
      proiezione: vuota,
      credito: 1000,
      rango: 'CHIROGRAFARIO',
      parametri: parametri(),
    });
    expect(f.anni).toEqual([]);
    expect(f.scenari).toEqual([]);
    expect(f.motivo).toContain('Nessun bilancio XBRL leggibile');
  });
});
