import { describe, it, expect } from 'vitest';
import {
  applicaManopola,
  definizioniManopole,
  letturaManopola,
  storicoDaStatoAttuale,
} from './statoAttuale';
import type { EsercizioStorico } from './piano';
import { DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';

const es = (anno: number, ricavi: number): EsercizioStorico => ({
  anno,
  ricaviVendite: ricavi,
  valoreProduzione: ricavi,
  costiProduzione: ricavi * 0.9,
  ammortamenti: 10000,
  oneriFinanziari: 5000,
  utileEsercizio: 1000,
  immobilizzazioni: 50000,
  creditiClienti: 20000,
  disponibilitaLiquide: 5000,
  attivoCircolante: 40000,
  totaleAttivo: 90000,
  patrimonioNetto: 10000,
  debitiBanche: 30000,
  debitiFornitori: 20000,
  debitiTributari: 5000,
  debitiPrevidenziali: 8000,
  totaleDebiti: 70000,
});

describe('stato attuale del piano', () => {
  const storico = [es(2025, 1000000), es(2024, 900000)];

  it('senza posizione aggiornata parte dall’ultimo bilancio', () => {
    const r = storicoDaStatoAttuale(storico, null);
    expect(r.storico[0].anno).toBe(2025);
    expect(r.partenza.fonte).toBe('bilancio');
  });

  it('posizione infrannuale successiva: conto economico portato a 12 mesi, patrimoniale com’è', () => {
    const r = storicoDaStatoAttuale(storico, {
      dataRiferimento: '2026-06-30',
      dati: {
        ...DATI_VUOTI,
        ricaviVendite: 400000,
        costiProduzione: 380000,
        disponibilitaLiquide: 1200,
        patrimonioNetto: -5000,
      },
    });
    expect(r.partenza.fonte).toBe('posizione');
    expect(r.partenza.etichetta).toContain('30/06/2026');
    expect(r.storico[0].anno).toBe(2026);
    expect(r.storico[0].ricaviVendite).toBe(800000);
    expect(r.storico[0].costiProduzione).toBe(760000);
    expect(r.storico[0].disponibilitaLiquide).toBe(1200);
    expect(r.storico.map((s) => s.anno)).toEqual([2026, 2025, 2024]);
  });

  it('posizione al 31/12 dell’anno dell’ultimo bilancio la sostituisce', () => {
    const r = storicoDaStatoAttuale(storico, {
      dataRiferimento: '2025-12-31',
      dati: { ...DATI_VUOTI, ricaviVendite: 1100000, patrimonioNetto: 1 },
    });
    expect(r.storico.map((s) => s.anno)).toEqual([2025, 2024]);
    expect(r.storico[0].ricaviVendite).toBe(1100000);
  });

  it('posizione più vecchia dell’ultimo bilancio: si resta sul bilancio', () => {
    const r = storicoDaStatoAttuale(storico, {
      dataRiferimento: '2025-06-30',
      dati: { ...DATI_VUOTI, ricaviVendite: 1 },
    });
    expect(r.partenza.fonte).toBe('bilancio');
  });

  it('posizione con solo stato patrimoniale: conto economico dell’ultimo bilancio', () => {
    const r = storicoDaStatoAttuale(storico, {
      dataRiferimento: '2026-03-31',
      dati: { ...DATI_VUOTI, disponibilitaLiquide: 700, debitiBanche: 1000 },
    });
    expect(r.storico[0].ricaviVendite).toBe(1000000);
    expect(r.storico[0].disponibilitaLiquide).toBe(700);
    expect(r.partenza.etichetta).toContain('bilancio 2025');
  });
});

describe('manopole', () => {
  const defs = definizioniManopole(es(2025, 1000000), 27.9);
  const ricavi = defs.find((d) => d.riga === 'ricaviVendite')!;

  it('una manopola scrive lo stesso valore su tutti gli anni', () => {
    const ip = applicaManopola(ricavi, {}, 4, 3.5);
    expect(ip.ricaviVendite).toHaveLength(4);
    expect(ip.ricaviVendite!.every((x) => x?.tipo === 'pct' && x.valore === 3.5)).toBe(true);
    expect(letturaManopola(ricavi, ip, 4)).toMatchObject({ valore: 3.5, variaPerAnno: false });
  });

  it('valori diversi per anno: la manopola mostra la media e lo segnala', () => {
    const l = letturaManopola(
      ricavi,
      {
        ricaviVendite: [
          { tipo: 'pct', valore: 2, motivazione: 'x' },
          { tipo: 'pct', valore: 4 },
          null,
        ],
      },
      3
    );
    expect(l).toEqual({ valore: 2, variaPerAnno: true, daAi: true });
  });

  it('limiti rispettati e aliquota di riposo pari a quella di partenza', () => {
    const ip = applicaManopola(ricavi, {}, 3, 99);
    expect(ip.ricaviVendite![0]!.valore).toBe(30);
    const aliq = defs.find((d) => d.riga === 'aliquotaImposte')!;
    expect(letturaManopola(aliq, {}, 3).valore).toBe(28);
  });
});
