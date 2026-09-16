import { describe, it, expect } from 'vitest';
import {
  anniDelTriage,
  andamento,
  esposizioneQualificata,
  riferimentoDi,
  totalePerCategoria,
  type RigaDebitoTriage,
} from './modello';

const riga = (p: Partial<RigaDebitoTriage>): RigaDebitoTriage => ({
  descrizione: 'x',
  categoria: 'PREVIDENZIALE',
  importoAnnoCorrente: null,
  importoAnnoPrecedente: null,
  importoAnnoMeno2: null,
  riferimentoAnnoPrecedente: null,
  prospettoId: null,
  ...p,
});

describe('i tre anni si ricavano dalla data di verifica', () => {
  it('non c’è nulla da chiedere all’operatore', () => {
    expect(anniDelTriage(new Date(Date.UTC(2026, 8, 16)))).toEqual({
      corrente: 2026,
      precedente: 2025,
      meno2: 2024,
    });
  });
});

describe('cosa concorre al test dell’art. 25-novies', () => {
  const righe = [
    riga({ categoria: 'PREVIDENZIALE', importoAnnoCorrente: 100_000 }),
    riga({ categoria: 'ASSICURATIVO', importoAnnoCorrente: 8_000 }),
    riga({ categoria: 'FISCALE', importoAnnoCorrente: 50_000 }),
    riga({ categoria: 'COMMERCIALE', importoAnnoCorrente: 300_000 }),
    riga({ categoria: 'ALTRO', importoAnnoCorrente: 20_000 }),
  ];

  it('commerciali e altri NON entrano nella soglia', () => {
    // Includerli significherebbe misurare una soglia di legge su debiti che
    // la legge non considera.
    const q = esposizioneQualificata(righe);
    expect(q.COMMERCIALE).toBe(0);
    expect(q.ALTRO).toBe(0);
    expect(q.PREVIDENZIALE).toBe(100_000);
  });

  it('ma restano nel totale, che serve agli indici e ai rapporti', () => {
    const t = totalePerCategoria(righe, 'corrente');
    expect(t.COMMERCIALE).toBe(300_000);
    const tot = Object.values(t).reduce((s, v) => s + v, 0);
    expect(tot).toBe(478_000);
  });

  it('previdenziale e assicurativo restano DISTINTI', () => {
    // Il bilancio li accorpa nella voce D.13; la soglia no.
    const q = esposizioneQualificata(righe);
    expect(q.PREVIDENZIALE).toBe(100_000);
    expect(q.ASSICURATIVO).toBe(8_000);
  });
});

describe('il termine di paragone della soglia', () => {
  it('si somma fra più posizioni della stessa categoria', () => {
    // Un'azienda può avere più gestioni previdenziali: il dovuto è la somma.
    const righe = [
      riga({ riferimentoAnnoPrecedente: 300_000 }),
      riga({ riferimentoAnnoPrecedente: 118_709 }),
    ];
    expect(riferimentoDi(righe, 'PREVIDENZIALE')).toBe(418_709);
  });

  it('se nessuna riga lo porta torna NULL, non zero', () => {
    // Zero darebbe una soglia del 30% pari a zero, e renderebbe "oltre
    // soglia" qualunque importo, anche un euro.
    expect(riferimentoDi([riga({ importoAnnoCorrente: 5 })], 'PREVIDENZIALE')).toBeNull();
  });

  it('non si mescola fra categorie diverse', () => {
    const righe = [
      riga({ categoria: 'PREVIDENZIALE', riferimentoAnnoPrecedente: 400_000 }),
      riga({ categoria: 'FISCALE', riferimentoAnnoPrecedente: 900_000 }),
    ];
    expect(riferimentoDi(righe, 'PREVIDENZIALE')).toBe(400_000);
    expect(riferimentoDi(righe, 'FISCALE')).toBe(900_000);
  });
});

describe('andamento sui tre anni', () => {
  it('calcola la variazione rispetto all’anno precedente', () => {
    const righe = [
      riga({ importoAnnoCorrente: 120, importoAnnoPrecedente: 100, importoAnnoMeno2: 80 }),
    ];
    const a = andamento(righe);
    expect(a.variazionePercentuale).toBe(20);
  });

  it('senza anno precedente la variazione è NULL, non zero', () => {
    // Zero direbbe "stabile", che è un'affermazione; qui non si sa.
    const a = andamento([riga({ importoAnnoCorrente: 120 })]);
    expect(a.variazionePercentuale).toBeNull();
  });
});
