import { describe, it, expect } from 'vitest';
import {
  cercaPiano,
  notaRicerca,
  passiRaggruppati,
  ricercaDaSalvare,
  ricercaPulita,
} from './ricercaPiano';
import { LEVE_PREDEFINITE } from './leveSimulazione';
import { calcolaPianoConLeve } from './levePiano';
import type { EsercizioStorico, IpotesiPiano } from './piano';

const BASE: EsercizioStorico = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_000_000,
  costiProduzione: 900_000,
  costiPersonale: 300_000,
  ammortamenti: 50_000,
  oneriFinanziari: 20_000,
  utileEsercizio: 20_000,
  immobilizzazioni: 200_000,
  creditiClienti: 150_000,
  disponibilitaLiquide: 120_000,
  attivoCircolante: 300_000,
  totaleAttivo: 500_000,
  patrimonioNetto: 200_000,
  debitiBanche: 50_000,
  debitiFornitori: 100_000,
  debitiTributari: 0,
  debitiPrevidenziali: 30_000,
  totaleDebiti: 200_000,
};

const PIATTE: IpotesiPiano = {
  ricaviVendite: [{ tipo: 'pct', valore: 0 }],
  costiOperativi: [{ tipo: 'pct', valore: 0 }],
};

const RATE = { ente: [200_000], altri: [] };

const input = (extra: Partial<Parameters<typeof cercaPiano>[0]> = {}) => ({
  storico: BASE,
  orizzonte: 5,
  rate: RATE,
  ipotesiIniziali: PIATTE,
  leveIniziali: LEVE_PREDEFINITE,
  variazioneMassimaPct: 30,
  ...extra,
});

describe('ricerca del piano', () => {
  it('gira le manopole dei ricavi per coprire le rate e non lascia il piano fermo', () => {
    const r = cercaPiano(input());
    expect(r.passi.length).toBeGreaterThan(0);
    expect(r.ricavi.ultimo).toBeGreaterThan(r.ricavi.primo);
    // La crescita si muove, o entra una linea nuova: i ricavi non restano fermi.
    expect(
      r.passi.some((p) => p.manopola.startsWith('Crescita dei ricavi')) ||
        r.leve.PRODUZIONE.attiva ||
        r.leve.MERCATI.attiva ||
        r.leve.CLIENTELA.attiva
    ).toBe(true);
    expect(r.tentativi).toBeGreaterThan(1);
    // Ogni passo dice da che cosa a che cosa e perché.
    for (const p of r.passi) {
      expect(p.perche).toContain('restava aperto');
      expect(p.da).not.toBe(p.a);
    }
  });

  it('senza un vincolo documentato i ricavi non restano fermi, anche senza rate', () => {
    const r = cercaPiano(input({ rate: { ente: [0], altri: [] } }));
    expect(r.soddisfatto).toBe(true);
    expect(r.ricaviFermiConsentiti).toBe(false);
    expect(r.ricavi.ultimo).toBeGreaterThan(r.ricavi.primo);
    expect(r.passi).toHaveLength(1);
  });

  it('con un vincolo documentato i ricavi possono restare fermi', () => {
    const r = cercaPiano(
      input({
        rate: { ente: [0], altri: [] },
        vincoliDocumentati: ['Il contratto di fornitura blocca i volumi fino al 2029.'],
      })
    );
    expect(r.ricaviFermiConsentiti).toBe(true);
    expect(r.passi).toHaveLength(0);
    expect(r.soddisfatto).toBe(true);
    expect(r.ricavi.ultimo).toBe(r.ricavi.primo);
  });

  it('rispetta il tetto dello spazio alla variazione annua', () => {
    const r = cercaPiano(input({ variazioneMassimaPct: 6 }));
    for (const cella of r.ipotesi.ricaviVendite ?? []) {
      if (cella?.tipo === 'pct') expect(Math.abs(cella.valore)).toBeLessThanOrEqual(6);
    }
  });

  it('non tocca le leve quando le ha scelte l’operatore', () => {
    const leve = {
      ...LEVE_PREDEFINITE,
      PERSONALE: { attiva: true, misura: 10 },
    };
    const r = cercaPiano(input({ leveIniziali: leve, leveBloccate: true }));
    expect(r.leve.PERSONALE).toEqual({ attiva: true, misura: 10 });
    expect(r.passi.some((p) => p.manopola === 'Tagli del personale')).toBe(false);
  });

  it('accende le leve quando da sole servono, e dichiara le rate che restano scoperte', () => {
    const r = cercaPiano(
      input({ rate: { ente: [400_000, 400_000, 400_000, 400_000, 400_000], altri: [] } })
    );
    expect(r.leve.PERSONALE.attiva).toBe(true);
    expect(r.soddisfatto).toBe(false);
    expect(r.aperti.length).toBeGreaterThan(0);
    // Un piano che non arriva lo dice, invece di gonfiare i numeri oltre i limiti.
    expect(notaRicerca(r)).toContain('Restano aperti');
  });

  it('comincia dalla manopola che rende di più, non sempre dai ricavi', () => {
    const r = cercaPiano(input({ rate: { ente: [150_000], altri: [] } }));
    // Le leve costano meno di un punto di crescita: a parità di resa vanno
    // prima, e i ricavi restano fermi finché serve.
    expect(r.passi[0].manopola).not.toMatch(/^Crescita dei ricavi/);
  });

  it('arriva al piano in poche mosse e non alza i ricavi oltre il necessario', () => {
    const rate = { ente: [150_000], altri: [] };
    const r = cercaPiano(input({ rate }));
    expect(r.soddisfatto).toBe(true);
    // Con gli scatti fissi servivano dodici mosse; il passo adattivo ne basta tre.
    expect(r.passi.length).toBeLessThanOrEqual(4);
    // L'ultimo scatto è rifinito: abbassare la crescita di 0,4 punti riapre i
    // vincoli, quindi il piano non è stato arrotondato al rialzo.
    const meno = (r.ipotesi.ricaviVendite ?? []).map((x) =>
      x && x.tipo === 'pct' ? { ...x, valore: Math.round((x.valore - 0.4) * 100) / 100 } : x
    );
    const { esito } = calcolaPianoConLeve({
      storico: BASE,
      orizzonte: 5,
      ipotesi: { ...r.ipotesi, ricaviVendite: meno },
      leve: r.leve,
      rate,
      capitaleSociale: null,
    });
    expect(esito.vincoli.length).toBeGreaterThan(0);
  });

  it('è deterministica', () => {
    expect(cercaPiano(input())).toEqual(cercaPiano(input()));
  });

  it('un piano che sta già in piedi non si tocca', () => {
    const ipotesi: IpotesiPiano = {
      ricaviVendite: [{ tipo: 'pct', valore: 3, motivazione: 'settore in crescita' }],
      costiOperativi: [{ tipo: 'pct', valore: 1 }],
    };
    const r = cercaPiano(input({ rate: { ente: [0], altri: [] }, ipotesiIniziali: ipotesi }));
    expect(r.passi).toHaveLength(0);
    expect(r.ipotesi.ricaviVendite?.[0]).toEqual({
      tipo: 'pct',
      valore: 3,
      motivazione: 'settore in crescita',
    });
  });

  it('dice in nota che cosa ha girato, e che cosa resta aperto', () => {
    const r = cercaPiano(input({ orizzonte: 5, variazioneMassimaPct: 0.5, leveBloccate: true }));
    expect(r.soddisfatto).toBe(false);
    expect(r.aperti.length).toBeGreaterThan(0);
    expect(notaRicerca(r)).toContain('Restano aperti');
  });

  it('la nota ha una riga per manopola, dal valore di partenza a quello finale', () => {
    const r = cercaPiano(input({ orizzonte: 5, variazioneMassimaPct: 0.5, leveBloccate: true }));
    const nota = notaRicerca(r);
    const passi = passiRaggruppati(r.passi);
    // Testa, una riga per manopola, chiusura sui vincoli: il dettaglio delle
    // singole mosse non entra nella nota.
    expect(nota.split('\n')).toHaveLength(passi.length + 2);
    for (const p of passi) expect(nota).toContain(`${p.manopola}: ${p.da} → ${p.a}`);
    expect(nota).not.toContain('passaggi');
    expect(nota).not.toContain('restava aperto');
  });

  it('la ricerca salvata si rilegge ripulita', () => {
    const r = cercaPiano(input());
    const salvata = ricercaDaSalvare(r);
    expect(ricercaPulita(salvata)).toEqual(salvata);
    expect(ricercaPulita(null)).toBeNull();
    expect(ricercaPulita({ passi: [{ manopola: 'x' }], tentativi: -3 })).toEqual({
      passi: [{ manopola: 'x', da: '', a: '', perche: '' }],
      tentativi: 0,
      aperti: [],
      soddisfatto: false,
      ricaviFermiConsentiti: false,
      ricavi: null,
    });
  });
});
