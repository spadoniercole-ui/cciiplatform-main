import { describe, it, expect } from 'vitest';
import { calcolaPiano, type EsercizioStorico, type IpotesiPiano } from './piano';
import { ipotesiAutomatiche } from './automatico';
import {
  conflittoOrizzonte,
  cercaSoluzioneVerde,
  differenzeSoluzione,
  estendiConTrend,
  ipotesiAssoluteDa,
  luceManopola,
  pianoVerde,
  rateDaPianoRientro,
} from './ricevente';

const S: EsercizioStorico = {
  anno: 2026,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_000_000,
  costiProduzione: 950_000,
  ammortamenti: 20_000,
  oneriFinanziari: 10_000,
  utileEsercizio: 20_000,
  immobilizzazioni: 200_000,
  creditiClienti: 300_000,
  disponibilitaLiquide: 30_000,
  attivoCircolante: 400_000,
  totaleAttivo: 600_000,
  patrimonioNetto: 50_000,
  debitiBanche: 100_000,
  debitiFornitori: 200_000,
  debitiTributari: 50_000,
  debitiPrevidenziali: 150_000,
  totaleDebiti: 550_000,
};

const ipAz: IpotesiPiano = {
  ricaviVendite: [1_100_000, 1_200_000, 1_300_000].map((v) => ({
    tipo: 'abs' as const,
    valore: v,
  })),
  costiOperativi: [1_000_000, 1_060_000, 1_120_000].map((v) => ({
    tipo: 'abs' as const,
    valore: v,
  })),
  creditiClienti: [320_000, 330_000, 340_000].map((v) => ({ tipo: 'abs' as const, valore: v })),
};

describe('piano del Ricevente', () => {
  it('oltre gli anni dell’azienda ricavi e costi seguono il settore', () => {
    const e = estendiConTrend(ipAz, 5, 2);
    expect(e.ricaviVendite?.length).toBe(5);
    expect(e.ricaviVendite?.[3]).toEqual({ tipo: 'pct', valore: 2 });
    expect(e.ricaviVendite?.[2]).toEqual({ tipo: 'abs', valore: 1_300_000 });
  });

  it('piano di rientro: anticipo e rate sul totale, ente e altri in proporzione', () => {
    const r = rateDaPianoRientro(
      { ente: 100_000, altri: 300_000 },
      { modalita: 'RATEALE', mesi: 24, anticipoPct: 10 },
      5
    );
    // 40.000 subito + 360.000 in 24 mesi: 180.000 il primo anno, 180.000 il secondo.
    expect(r.ente[0] + r.altri[0]).toBeCloseTo(220_000, 0);
    expect(r.ente[1] + r.altri[1]).toBeCloseTo(180_000, 0);
    expect(r.ente[0] / (r.ente[0] + r.altri[0])).toBeCloseTo(0.25, 5);
    expect(r.ente[2]).toBe(0);
    const unica = rateDaPianoRientro(
      { ente: 100, altri: 0 },
      { modalita: 'UNICA', mesi: 0, anticipoPct: 0 },
      3
    );
    expect(unica.ente).toEqual([100, 0, 0]);
  });

  it('ammortamento più lungo del piano: conflitto, allungabile fino a 10 anni', () => {
    expect(conflittoOrizzonte({ modalita: 'RATEALE', mesi: 60, anticipoPct: 0 }, 5)).toBeNull();
    expect(conflittoOrizzonte({ modalita: 'RATEALE', mesi: 84, anticipoPct: 0 }, 5)).toEqual({
      mesi: 84,
      orizzonte: 5,
      anniNecessari: 7,
      allungabile: true,
    });
    expect(
      conflittoOrizzonte({ modalita: 'RATEALE', mesi: 144, anticipoPct: 0 }, 5)?.allungabile
    ).toBe(false);
  });

  it('luce della manopola: ricavi dell’azienda molto sopra il settore = rosso; rettificati, verde', () => {
    const rif = calcolaPiano(S, 3, ipotesiAutomatiche(S, 3, 0), { ente: [], altri: [] });
    const az = calcolaPiano(S, 3, ipAz, { ente: [], altri: [] });
    expect(luceManopola(az.anni, rif.anni, 'ricaviVendite', { verde: 10, giallo: 25 })).toBe(
      'rosso'
    );
    const sis = calcolaPiano(S, 3, ipotesiAssoluteDa(rif.anni, ['ricaviVendite']), {
      ente: [],
      altri: [],
    });
    expect(luceManopola(sis.anni, rif.anni, 'ricaviVendite', { verde: 10, giallo: 25 })).toBe(
      'verde'
    );
    expect(luceManopola(az.anni, rif.anni, 'apportiSoci', { verde: 10, giallo: 25 })).toBe('nc');
  });

  it('soluzione verde: trova la combinazione e resta vicina al piano dell’azienda', () => {
    const rate = rateDaPianoRientro(
      { ente: 150_000, altri: 150_000 },
      { modalita: 'RATEALE', mesi: 36, anticipoPct: 0 },
      3
    );
    const ing = {
      storico: S,
      orizzonte: 3,
      ipAzienda: ipAz,
      ipOrdinarie: {},
      rate,
      capitaleSociale: null,
    };
    const partenza = calcolaPiano(S, 3, ipAz, rate);
    expect(pianoVerde(partenza)).toBe(false);
    const sol = cercaSoluzioneVerde(ing);
    expect(sol.verde).toBe(true);
    expect(sol.residui).toEqual([]);
    // Determinismo: stessa entrata, stessa soluzione.
    expect(cercaSoluzioneVerde(ing)).toEqual(sol);
    // Le differenze dichiarano solo le righe mosse.
    const rif = calcolaPiano(S, 3, ipotesiAutomatiche(S, 3, 0), rate);
    const diff = differenzeSoluzione(sol, rif.anni);
    for (const d of diff) expect(d.suAzienda).not.toBe(0);
  });

  it('se il verde non è raggiungibile dichiara i vincoli residui', () => {
    const rate = { ente: [5_000_000, 0, 0], altri: [0, 0, 0] };
    const sol = cercaSoluzioneVerde({
      storico: S,
      orizzonte: 3,
      ipAzienda: ipAz,
      ipOrdinarie: {},
      rate,
      capitaleSociale: null,
    });
    expect(sol.verde).toBe(false);
    expect(sol.residui.length).toBeGreaterThan(0);
  });
});
