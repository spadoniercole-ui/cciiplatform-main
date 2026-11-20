import { describe, expect, it } from 'vitest';
import {
  CHIAVI_TABELLE,
  SCHEDE,
  componiTabelleReport,
  noteIntegrativeReport,
  tabellaDifferenziali,
  tabellaProspetto,
  tabellaSimulazione,
} from './reportContabile';
import { componiProiezione } from './proiezione';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import type { FactTestuale } from '@/lib/xbrl/types';

const dati = (over: Partial<DatiFinanziariPeriodo> = {}): DatiFinanziariPeriodo => ({
  ricaviVendite: 1000,
  valoreProduzione: 1100,
  costiProduzione: 900,
  ebitda: 250,
  ammortamenti: 50,
  ebit: 200,
  oneriFinanziari: 20,
  utileEsercizio: 130,
  totaleAttivo: 1400,
  attivoCircolante: 900,
  disponibilitaLiquide: 100,
  immobilizzazioni: 500,
  patrimonioNetto: 400,
  totaleDebiti: 800,
  debitiBanche: 300,
  debitiFornitori: 200,
  debitiTributari: 100,
  debitiPrevidenziali: 80,
  passivoCorrente: 600,
  creditiClienti: 350,
  ...over,
});

const bilanci = [
  { anno: 2023, dati: dati({ ricaviVendite: 800, utileEsercizio: 90 }) },
  { anno: 2024, dati: dati({ ricaviVendite: 1000, utileEsercizio: 130 }) },
];

const proiezione = componiProiezione({
  bilanci: [
    { anno: 2023, dati: dati({ ricaviVendite: 800, valoreProduzione: 880 }) },
    { anno: 2024, dati: dati({ ricaviVendite: 1000, valoreProduzione: 1100 }) },
  ],
  annoVerifica: 2026,
  debitoEnte: null,
});

describe('SCHEDE', () => {
  it('ogni tabella ha titolo, introduzione e domande per la spiegazione', () => {
    expect(CHIAVI_TABELLE).toEqual(['PROSPETTO', 'DIFFERENZIALI', 'SIMULAZIONE']);
    for (const chiave of CHIAVI_TABELLE) {
      const scheda = SCHEDE[chiave];
      expect(scheda.titolo.length).toBeGreaterThan(3);
      expect(scheda.introduzione.length).toBeGreaterThan(20);
      expect(scheda.domande.length).toBeGreaterThan(0);
    }
  });
});

describe('tabellaProspetto', () => {
  it('porta una colonna per annualità e i valori depositati', () => {
    const t = tabellaProspetto(bilanci);
    expect(t.colonne.map((c) => c.etichetta)).toEqual(['2023', '2024']);
    const ricavi = t.righe.find((r) => r.etichetta === 'Ricavi delle vendite')!;
    // La locale italiana non separa le quattro cifre (vedi 0.243.0).
    expect(ricavi.celle.map((c) => c.principale)).toEqual(['800 €', '1000 €']);
  });

  it('la posizione finanziaria netta è debiti verso banche meno cassa', () => {
    const t = tabellaProspetto(bilanci);
    const pfn = t.righe.find((r) => r.etichetta === 'Posizione finanziaria netta')!;
    expect(pfn.celle[0].principale).toBe('200 €');
  });

  it('senza bilanci dice che cosa manca, invece di mostrare zeri', () => {
    const t = tabellaProspetto([]);
    expect(t.righe).toEqual([]);
    expect(t.vuota).toContain('Nessun bilancio');
  });
});

describe('tabellaDifferenziali', () => {
  it('conta lo scarto sulla base e porta il passo per ogni voce motrice', () => {
    const t = tabellaDifferenziali(proiezione);
    expect(t.colonne[0].etichetta).toBe('Base 2023');
    expect(t.colonne[t.colonne.length - 1].etichetta).toBe('Passo');
    // Il valore della produzione è la motrice: base 880, scarto 220 (+25,0%).
    const produzione = t.righe.find((r) => r.etichetta === 'Valore della produzione')!;
    expect(produzione.celle[0].principale).toBe('880 €');
    expect(produzione.celle[1].principale).toBe('220 €');
    expect(produzione.celle[1].dettaglio).toBe('+25%');
    // Con due sole annualità il passo non si ricava: la voce resta ferma e il
    // documento lo dichiara invece di inventare una crescita.
    expect(produzione.qualifica).toBe('ferma');
    expect(produzione.celle[produzione.celle.length - 1].principale).toBe('—');
  });

  it('senza proiezione dichiara la mancanza della base', () => {
    const t = tabellaDifferenziali(null);
    expect(t.righe).toEqual([]);
    expect(t.vuota).toContain('base');
  });
});

describe('tabellaSimulazione', () => {
  it('affianca gli anni storici a quelli calcolati', () => {
    const t = tabellaSimulazione(proiezione);
    expect(t.colonne.filter((c) => c.sotto === 'storico').length).toBe(2);
    expect(t.colonne.filter((c) => c.sotto === 'calcolato').length).toBe(2);
    const derivata = t.righe.find((r) => r.qualifica === 'derivata');
    expect(derivata).toBeTruthy();
  });
});

describe('componiTabelleReport', () => {
  it('mette le tre tabelle nell’ordine del documento', () => {
    const sezioni = componiTabelleReport({ bilanci, proiezione });
    expect(sezioni.map((s) => s.scheda.chiave)).toEqual([
      'PROSPETTO',
      'DIFFERENZIALI',
      'SIMULAZIONE',
    ]);
  });
});

describe('noteIntegrativeReport', () => {
  const fatto = (testo: string, tag: string, ordine: number): FactTestuale => ({
    tagPulito: tag,
    tagOriginale: `itcc-ci:${tag}`,
    contextRef: 'C2024',
    testo,
    lingua: 'it',
    ordine,
  });

  it('raggruppa le note per sezione, continuità per prima', () => {
    const { note } = noteIntegrativeReport([
      fatto(
        'Non si ravvisano elementi che facciano venir meno la continuità aziendale: la società opera in un mercato stabile e non ha procedure in corso.',
        'continuita',
        0
      ),
      fatto(
        'Sono stati concessi impegni di fideiussione e garanzie a favore di terzi per complessivi 120.000 euro, oltre a un pegno su quote societarie.',
        'impegni',
        1
      ),
    ]);
    expect(note[0].sezione).toBe('CONTINUITA');
    expect(note.map((n) => n.sezione)).toContain('IMPEGNI');
  });

  it('senza note non inventa sezioni', () => {
    expect(noteIntegrativeReport(null)).toEqual({ note: [], troncate: false });
    expect(noteIntegrativeReport([]).note).toEqual([]);
  });
});
