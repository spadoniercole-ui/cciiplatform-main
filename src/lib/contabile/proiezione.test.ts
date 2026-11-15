// La proiezione contabile: differenziali sulla base, applicati all'ultimo
// bilancio utile, con la loro etichetta (storico / calcolato).

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
  it('conta i differenziali sulla base e li applica ai valori del 2024 fino al 2026', () => {
    // L'esempio dichiarato: 2024 porta il 2023, il 2023 porta il 2022. La base
    // è il 2022, perché nessun file lo porta come anno precedente. I
    // differenziali si contano sulla base e si applicano al 2024.
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ ricaviVendite: 100 }) },
        { anno: 2023, dati: dati({ ricaviVendite: 120 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 150 }) },
      ],
      annoVerifica: 2026,
    });

    expect(p.annoBase).toBe(2022);
    expect(p.annoUltimoBilancio).toBe(2024);
    expect(p.anniArchivio).toEqual([2022, 2023, 2024]);
    expect(p.annualitaCalcolate).toEqual([2025, 2026]);
    expect(p.avvertenze.join(' ')).toMatch(/La base è il 2022/);
    expect(p.avvertenze.join(' ')).toMatch(/applicati ai valori del 2024/);

    const ricavi = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    // I differenziali sono sulla base: il 2024 è +50 punti, non +30 sul 2023.
    expect(ricavi.valoreBase).toBe(100);
    expect(ricavi.valoreUltimo).toBe(150);
    expect(ricavi.differenziali).toEqual([
      { anno: 2023, valore: 120, scarto: 20, differenziale: 0.2 },
      { anno: 2024, valore: 150, scarto: 50, differenziale: 0.5 },
    ]);
    expect(ricavi.proiettabile).toBe(true);
    // Un solo anno fra i due differenziali: il passo è 0,5 / 0,2 = 2,5.
    expect(ricavi.passo).toBeCloseTo(2.5, 4);
    // 2025: 150 × (1 + 0,5 × 2,5) = 337,5.
    expect(ricavi.proiezioni[0]).toMatchObject({ anno: 2025, differenziale: 1.25, valore: 337.5 });
    // 2026: 150 × (1 + 0,5 × 6,25) = 618,75.
    expect(ricavi.proiezioni[1].valore).toBeCloseTo(618.75, 2);
  });

  it('battezza ogni annualità: storico il depositato, calcolato il costruito', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati() },
        { anno: 2023, dati: dati({ ricaviVendite: 120 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 150 }) },
      ],
      annoVerifica: 2025,
    });

    expect(p.bilanciProiettati.map((b) => [b.anno, b.tipo])).toEqual([
      [2022, 'STORICO'],
      [2023, 'STORICO'],
      [2024, 'STORICO'],
      [2025, 'CALCOLATO'],
    ]);
    // L'anno calcolato porta il dato costruito, non quello dell'anno prima.
    const ricavi = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    expect(p.bilanciProiettati[3].dati.ricaviVendite).toBe(ricavi.proiezioni[0].valore);
  });

  it('con un solo differenziale non inventa un passo, e lo dichiara', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2023, dati: dati({ ricaviVendite: 100 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 130 }) },
      ],
      annoVerifica: 2026,
    });

    const ricavi = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    expect(ricavi.differenziali).toHaveLength(1);
    expect(ricavi.passo).toBeNull();
    expect(ricavi.proiettabile).toBe(false);
    expect(ricavi.motivo).toMatch(/triennio/);
    // La voce resta ferma all'ultimo dato, e il prospetto lo dice.
    expect(p.vociTenuteFerme).toContain('Ricavi delle vendite');
    expect(p.avvertenze.join(' ')).toMatch(/Voci tenute ferme/);
    const ultimo = p.bilanciProiettati[p.bilanciProiettati.length - 1];
    expect(ultimo.anno).toBe(2026);
    expect(ultimo.dati.ricaviVendite).toBe(130);
    expect(ultimo.tipo).toBe('CALCOLATO');
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
    expect(p.annualitaCalcolate).toEqual([]);
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

  it('con base zero il differenziale percentuale non si calcola', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ disponibilitaLiquide: 0 }) },
        { anno: 2023, dati: dati({ disponibilitaLiquide: 40 }) },
        { anno: 2024, dati: dati({ disponibilitaLiquide: 60 }) },
      ],
      annoVerifica: 2025,
    });
    const voce = p.voci.find((v) => v.chiave === 'disponibilitaLiquide')!;
    expect(voce.differenziali.every((d) => d.differenziale === null)).toBe(true);
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/base è zero/);
  });

  it('non porta avanti una voce il cui ultimo valore non è positivo', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ utileEsercizio: 100 }) },
        { anno: 2023, dati: dati({ utileEsercizio: -120 }) },
        { anno: 2024, dati: dati({ utileEsercizio: -90 }) },
      ],
      annoVerifica: 2025,
    });
    const voce = p.voci.find((v) => v.chiave === 'utileEsercizio')!;
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/non positiva/);
    expect(voce.proiezioni).toEqual([]);
  });

  it('si ferma quando il differenziale porterebbe il valore a zero o sotto', () => {
    const p = componiProiezione({
      bilanci: [
        { anno: 2022, dati: dati({ ricaviVendite: 100 }) },
        { anno: 2023, dati: dati({ ricaviVendite: 40 }) },
        { anno: 2024, dati: dati({ ricaviVendite: 20 }) },
      ],
      annoVerifica: 2025,
    });
    const voce = p.voci.find((v) => v.chiave === 'ricaviVendite')!;
    expect(voce.proiettabile).toBe(false);
    expect(voce.motivo).toMatch(/zero o sotto/);
    expect(p.vociTenuteFerme).toContain('Ricavi delle vendite');
  });

  it('senza bilanci non finge una base', () => {
    const p = componiProiezione({ bilanci: [], annoVerifica: 2026 });
    expect(p.annoBase).toBeNull();
    expect(p.proiettabile).toBe(false);
    expect(p.avvertenze[0]).toMatch(/Carica i bilanci XBRL/);
  });

  it('il passo è la radice n-esima del rapporto fra ultimo e primo differenziale', () => {
    const punto = (anno: number, differenziale: number) => ({
      anno,
      valore: 0,
      scarto: 0,
      differenziale,
    });
    expect(passoSerie([punto(2023, 0.1), punto(2025, 0.4)])).toBeCloseTo(2, 5);
    // Un solo differenziale: niente passo.
    expect(passoSerie([punto(2024, 0.3)])).toBeNull();
    // Serie che cambia segno: non è geometrica.
    expect(passoSerie([punto(2023, 0.2), punto(2024, -0.1)])).toBeNull();
  });
});
