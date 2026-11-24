import { describe, it, expect } from 'vitest';
import { componiIconografia, geometriaBarra } from './iconografia';
import { confrontaDebitoInBilancio } from '@/lib/verifica/debitoInBilancio';
import type { Componente, DatiIai } from '@/lib/iai/dimensioni';

const dati: DatiIai = {
  ente: {
    soglie: [
      { ambito: 'INPS', esito: 'sopra', esposizione: 120000 },
      { ambito: 'AGENZIA_ENTRATE', esito: 'sotto', esposizione: 15000 },
    ],
    importiNonNoti: 0,
    denunceAssenti: false,
    addetti: 12,
  },
  bilancio: {
    corrente: {
      anno: 2024,
      ricavi: 550000,
      ebitda: -22000,
      utile: -40000,
      totaleAttivo: 800000,
      attivoCircolante: 300000,
      patrimonioNetto: -30000,
      totaleDebiti: 700000,
      debitiNonDisaggregati: true,
    },
    precedente: { ricavi: 620000, utile: 10000, patrimonioNetto: 5000 },
  },
  fascicolo: { totale: 3, titoloEnte: 1, dichiarato: 0, nonNoti: 1 },
  visura: {
    disponibile: true,
    proceduraPendente: 'Concordato preventivo del 12/03/2025',
    statoAttivitaAnomalo: null,
    giorniVisura: 120,
    capitaleSociale: 10000,
  },
};

const componenti: Componente[] = [
  { dimensione: 'A', punteggio: 100, motivi: ['INPS: presupposti oggettivi rilevati'], lacune: [] },
  { dimensione: 'B', punteggio: 70, motivi: ['patrimonio netto negativo'], lacune: [] },
  { dimensione: 'C', punteggio: 60, motivi: ['ricavi -11%'], lacune: [] },
  {
    dimensione: 'D',
    punteggio: 70,
    motivi: ['1 importi non noti nel fascicolo'],
    lacune: [],
  },
  { dimensione: 'E', punteggio: 100, motivi: ['procedura concorsuale'], lacune: [] },
];

describe('componiIconografia', () => {
  it('costruisce un grafico comparativo per A, B e C e niente per D ed E', () => {
    const ico = componiIconografia(dati, componenti);
    expect(ico.grafici.map((g) => g.dimensione)).toEqual(['A', 'B', 'C']);
  });

  it('A confronta le esposizioni degli ambiti, in euro', () => {
    const a = componiIconografia(dati, componenti).grafici.find((g) => g.dimensione === 'A');
    expect(a?.massimo).toBe(120000);
    expect(a?.barre).toHaveLength(2);
    expect(a?.barre[0].riferimento).toMatch(/presupposti oggettivi/);
  });

  it('B mette patrimonio e debiti sulla stessa scala, col rapporto scritto accanto', () => {
    const b = componiIconografia(dati, componenti).grafici.find((g) => g.dimensione === 'B');
    // In euro, non in percentuale: due rapporti scalati sul proprio massimo
    // facevano sembrare grandezze il 6% e l'8%.
    expect(b?.barre).toHaveLength(2);
    expect(b?.barre[0].etichetta).toBe('Patrimonio netto');
    expect(b?.barre[0].segnala).toBe(true);
    expect(b?.barre[0].riferimento).toMatch(/% dei debiti/);
    expect(b?.barre[1].etichetta).toBe('Totale debiti');
  });

  it('A mette il debito accertato e quello iscritto in bilancio prima degli ambiti', () => {
    const debito = confrontaDebitoInBilancio({
      esposizione: 120000,
      vociBilancio: { tributari: 0, previdenziali: 0 },
      ente25novies: 'INPS',
      bilancioLetto: true,
      alias: ['INPS'],
    });
    const a = componiIconografia(dati, componenti, { debito, prospettico: null }).grafici.find(
      (g) => g.dimensione === 'A'
    );
    expect(a?.barre[0].etichetta).toBe('Debito amministrativo accertato');
    expect(a?.barre[1].testo).toBe('0 €');
    expect(a?.barre.filter((x) => x.etichetta === 'INPS')).toHaveLength(1);
  });

  it('segnala la scala sotto zero quando un valore è negativo', () => {
    const c = componiIconografia(dati, componenti).grafici.find((g) => g.dimensione === 'C');
    expect(c?.minimo).toBeLessThan(0);
  });

  it('C accosta i due esercizi voce per voce', () => {
    const c = componiIconografia(dati, componenti).grafici.find((g) => g.dimensione === 'C');
    const ricavi = c?.barre.filter((x) => x.etichetta.startsWith('Ricavi')) ?? [];
    expect(ricavi).toHaveLength(2);
    expect(ricavi[0].valore).toBe(550000);
    expect(ricavi[1].valore).toBe(620000);
    // I ricavi calano: la barra dell'esercizio in corso è segnalata.
    expect(ricavi[0].segnala).toBe(true);
  });

  it('D produce un avviso forte quando l’affidabilità è bassa', () => {
    const ico = componiIconografia(dati, componenti);
    expect(ico.avvisoAffidabilita?.titolo).toMatch(/non sono tutti affidabili/);
    expect(ico.avvisoAffidabilita?.motivi.join(' ')).toMatch(/importi non noti/);
  });

  it('D senza lacune non produce nessun avviso', () => {
    const puliti: Componente[] = [{ dimensione: 'D', punteggio: 0, motivi: [], lacune: [] }];
    expect(componiIconografia(dati, puliti).avvisoAffidabilita).toBeNull();
  });

  it('E elenca le particolarità della visura, comprese le più scomode', () => {
    const e = componiIconografia(dati, componenti).visura;
    expect(e.disponibile).toBe(true);
    const testi = e.particolari.map((p) => p.testo).join(' ');
    expect(testi).toMatch(/Concordato preventivo/);
    expect(testi).toMatch(/sotto il capitale/);
    expect(testi).toMatch(/120 giorni fa/);
    expect(e.particolari.filter((p) => p.segnala).length).toBeGreaterThanOrEqual(2);
  });

  it('senza visura lo dice, invece di disegnare un quadro procedurale vuoto', () => {
    const senza = { ...dati, visura: { ...dati.visura, disponibile: false } };
    const e = componiIconografia(senza, componenti).visura;
    expect(e.disponibile).toBe(false);
    expect(e.particolari[0].testo).toMatch(/non sono stati estratti/);
  });
});

describe('geometriaBarra', () => {
  it('un valore positivo parte dallo zero, non dal bordo', () => {
    expect(geometriaBarra(500, 1000)).toEqual({ zero: 0, inizio: 0, larghezza: 50 });
  });

  it('un valore negativo cresce a sinistra dello zero', () => {
    // Scala da −100 a 1000: lo zero cade a 100/1100 della traccia.
    const g = geometriaBarra(-100, 1000, -100);
    expect(g.zero).toBeCloseTo(9.09, 1);
    expect(g.inizio).toBe(0);
    expect(g.larghezza).toBeCloseTo(9.09, 1);
  });

  it('un valore positivo con fondo sotto zero parte dallo zero', () => {
    const g = geometriaBarra(500, 1000, -100);
    expect(g.inizio).toBeCloseTo(9.09, 1);
    expect(g.larghezza).toBeCloseTo(45.45, 1);
  });

  it('un dato non letto non disegna nulla, ma lo zero resta al suo posto', () => {
    const g = geometriaBarra(null, 1000, -100);
    expect(g.larghezza).toBe(0);
    expect(g.inizio).toBe(g.zero);
  });
});
