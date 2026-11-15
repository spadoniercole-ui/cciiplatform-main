// La proiezione contabile: la serie degli scarti sulla base, con i suoi casi.

import { describe, expect, it } from 'vitest';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { componiProiezione, passoSerie } from './proiezione';

function dati(parziale: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo {
  const base: DatiFinanziariPeriodo = {
    ricaviVendite: 100,
    valoreProduzione: 110,
    costiProduzione: 90,
    ebit: 20,
    ammortamenti: 5,
    ebitda: 25,
    oneriFinanziari: 2,
    utileEsercizio: 8,
    totaleAttivo: 300,
    attivoCircolante: 120,
    disponibilitaLiquide: 10,
    immobilizzazioni: 180,
    patrimonioNetto: 80,
    totaleDebiti: 220,
    debitiBanche: 90,
    debitiFornitori: 60,
    debitiTributari: 30,
    debitiPrevidenziali: 40,
    passivoCorrente: 100,
    creditiClienti: 70,
  };
  return { ...base, ...parziale };
}

describe('proiezione contabile', () => {
  it('parte dal 2022, conta gli scarti sulla base e li porta al 2026', () => {
    // L'esempio dichiarato: 2024 porta il 2023, il 2023 porta il 2022. La base
    // è il 2022, perché nessun file lo porta come anno precedente.
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ ricaviVendite: 100 }) },
        { anno: 2023, dati: dati({ ricaviVendite: 120 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 150 }) },
      ],
      annoVerifica: 2026,
    });

    expect(p.annoBase).toBe(2022);
    expect(p.anniArchivio).toEqual([2022, 2023, 2024]);
    expect(p.annualitaProiettate).toEqual([2025, 2026]);
    expect(p.avvertenze.join(' ')).toMatch(/La base è il 2022/);

    const ricavi = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    // Gli scarti sono sulla base: 2024 è +50, non +30 sul 2023.
    expect(ricavi.scarti).toEqual([
      { anno: 2023, valore: 120, scarto: 20 },
      { anno: 2024, valore: 150, scarto: 50 },
    ]);
    expect(ricavi.proiettabile).toBe(true);
    // Gli scarti sono a un anno di distanza: il passo è 50/20 = 2,5.
    expect(ricavi.passo).toBeCloseTo(2.5, 5);
    // 2025: 50 × 2,5 = 125 → 225; 2026: 50 × 6,25 = 312,5 → 412,5.
    expect(ricavi.proiezioni[0].valore).toBeCloseTo(225, 1);
    expect(ricavi.proiezioni[1].valore).toBeCloseTo(412.5, 1);
  });

  it('con un solo scarto non inventa un passo, e lo dichiara', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2023, dati: dati({ ricaviVendite: 100 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 130 }) },
      ],
      annoVerifica: 2026,
    });

    const ricavi = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    expect(ricavi.scarti).toHaveLength(1);
    expect(ricavi.passo).toBeNull();
    expect(ricavi.proiettabile).toBe(false);
    expect(ricavi.motivo).toMatch(/triennio/);
    // La voce resta ferma all'ultimo dato, e il prospetto lo dice.
    expect(p.vociTenuteFerme).toContain('Ricavi delle vendite');
    expect(p.avvertenze.join(' ')).toMatch(/Voci tenute ferme/);
    const ultimo = p.bilanciProiettati[p.bilanciProiettati.length - 1];
    expect(ultimo.anno).toBe(2026);
    expect(ultimo.dati.ricaviVendite).toBe(130);
  });

  it('non proietta una serie che cambia segno', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ utileEsercizio: 100 }) },
        { anno: 2023, dati: dati({ utileEsercizio: 120 }) },
        { anno: 2024, dati: dati({ utileEsercizio: 90 }) },
      ],
      annoVerifica: 2025,
    });
    const utile = p.voci.find((v) => v.chiave === 'utileEsercizio')!;
    expect(utile.passo).toBeNull();
    expect(utile.proiettabile).toBe(false);
    expect(utile.motivo).toMatch(/segno/);
  });

  it('non calcola nulla se la verifica cade dentro gli anni in archivio', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati() },
        { anno: 2023, dati: dati() },
        { anno: 2024, dati: dati() },
      ],
      annoVerifica: 2024,
    });
    expect(p.annualitaProiettate).toEqual([]);
    expect(p.avvertenze.join(' ')).toMatch(/dentro gli anni già in archivio/);
  });

  it('dichiara le voci senza punto di partenza', () => {
    const senza = dati();
    // @ts-expect-error — la voce manca davvero nel bilancio di base
    delete senza.patrimonioNetto;
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: senza },
        { anno: 2023, dati: dati({ patrimonioNetto: 90 }) },
        { anno: 2024, dati: dati({ patrimonioNetto: 95 }) },
      ],
      annoVerifica: 2025,
    });
    const voce = p.voci.find((v) => v.chiave === 'patrimonioNetto')!;
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/non è valorizzata/);
  });

  it('senza bilanci non finge una base', () => {
    const p = componiProiezione({ bilanci: [], annoVerifica: 2026 });
    expect(p.annoBase).toBeNull();
    expect(p.proiettabile).toBe(false);
    expect(p.avvertenze[0]).toMatch(/Carica i bilanci XBRL/);
  });

  it('il passo è la radice n-esima del rapporto fra ultimo e primo scarto', () => {
    expect(
      passoSerie([
        { anno: 2023, valore: 0, scarto: 10 },
        { anno: 2025, valore: 0, scarto: 40 },
      ])
    ).toBeCloseTo(2, 5);
    // Un solo scarto: niente passo.
    expect(passoSerie([{ anno: 2024, valore: 0, scarto: 30 }])).toBeNull();
  });
});
