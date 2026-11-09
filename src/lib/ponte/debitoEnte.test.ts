import { describe, expect, it } from 'vitest';
import {
  debitoEnteConRipiego,
  importoRigaVera,
  snapshotDebitoEnte,
  snapshotDebitoEnteDaTriage,
} from './debitoEnte';
import type { RigaVera } from '@/lib/debitiEnte/veraImport';

function riga(p: Partial<RigaVera>): RigaVera {
  return {
    sezione: 'GESTIONE LAVORATORI DIPENDENTI PRIVATI',
    ambito: 'INPS',
    voce: 'Denunce non trasmesse',
    importo: 0,
    categoria: '',
    stato: '',
    trattamento: 'contabilizzato',
    contributi: null,
    sanzioni: null,
    ...p,
  };
}

describe('snapshotDebitoEnte', () => {
  it('separa contabilizzato e da contabilizzare, e li somma nel totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 1000, trattamento: 'contabilizzato', stato: '' }),
      riga({ importo: 500, trattamento: 'da_contabilizzare', stato: 'CALCOLATI' }),
    ]);
    expect(s.contabilizzato).toBe(1000);
    expect(s.daContabilizzare).toBe(500);
    expect(s.totale).toBe(1500);
    expect(s.righe).toBe(2);
  });

  it('una riga con l’importo solo nella composizione non vale zero', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 0, contributi: 1200, sanzioni: 300, trattamento: 'da_contabilizzare' }),
    ]);
    expect(s.totale).toBe(1500);
    expect(s.contributi).toBe(1200);
    expect(s.sanzioni).toBe(300);
  });

  it('le posizioni segnalate si dichiarano e restano fuori dal totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 800, trattamento: 'contabilizzato' }),
      riga({ importo: 0, voce: 'Verbale Evasione', trattamento: 'potenziale' }),
      riga({ importo: 0, voce: 'F24 non presentato', trattamento: 'potenziale' }),
    ]);
    expect(s.totale).toBe(800);
    expect(s.righe).toBe(1);
    expect(s.righeSegnalate).toBe(2);
    expect(s.segnalato).toBe(0);
  });

  it('una segnalata con importo noto non entra comunque nel totale', () => {
    const s = snapshotDebitoEnte([riga({ importo: 400, trattamento: 'potenziale' })]);
    expect(s.totale).toBe(0);
    expect(s.segnalato).toBe(400);
    expect(s.righeSegnalate).toBe(1);
  });

  it('ignorate e sospese restano fuori; i crediti dell’Agente hanno il loro totale', () => {
    const s = snapshotDebitoEnte([
      riga({ importo: 700, trattamento: 'ignora' }),
      riga({ importo: 900, trattamento: 'sospeso' }),
      riga({ importo: 600, ambito: 'AGENTE_RISCOSSIONE', trattamento: 'contabilizzato' }),
    ]);
    expect(s.totale).toBe(600);
    expect(s.creditiAgente).toBe(600);
    expect(s.contributi).toBe(0);
    expect(s.righe).toBe(1);
  });

  it('un debito senza posizioni conteggiabili resta zero, ma senza inventare righe', () => {
    const s = snapshotDebitoEnte([]);
    expect(s.totale).toBe(0);
    expect(s.righe).toBe(0);
    expect(s.righeSegnalate).toBe(0);
  });
});

describe('snapshotDebitoEnteDaTriage', () => {
  it('somma le categorie qualificate e dichiara il triage come fonte', () => {
    const d = snapshotDebitoEnteDaTriage([
      { categoria: 'PREVIDENZIALE', descrizione: 'Contributi', importo: 300_000 },
      { categoria: 'ASSICURATIVO', descrizione: 'Premi', importo: 12_000 },
      { categoria: 'IVA', descrizione: 'LIPE', importo: 8_000 },
    ]);
    expect(d?.totale).toBe(320_000);
    expect(d?.contributi).toBe(300_000);
    expect(d?.righe).toBe(3);
    expect(d?.fonte).toContain('triage');
    expect(d?.sanzioniNonDistinte).toBe(true);
    // Il triage non ha i tre stati: non si inventa una ripartizione.
    expect(d?.contabilizzato).toBeUndefined();
    expect(d?.daContabilizzare).toBeUndefined();
  });

  it('le posizioni commerciali e gli altri tributi restano fuori, e si dichiarano', () => {
    const d = snapshotDebitoEnteDaTriage([
      { categoria: 'PREVIDENZIALE', descrizione: 'Contributi', importo: 1_000 },
      { categoria: 'COMMERCIALE', descrizione: 'Fornitori', importo: 500_000 },
      { categoria: 'FISCALE', descrizione: 'IRES', importo: 40_000 },
    ]);
    expect(d?.totale).toBe(1_000);
    expect(d?.righe).toBe(1);
    expect(d?.fonte).toContain('2 posizioni non qualificate restano fuori');
  });

  it('senza importi non si produce un debito: resta non disponibile', () => {
    expect(
      snapshotDebitoEnteDaTriage([
        { categoria: 'PREVIDENZIALE', descrizione: 'Contributi', importo: null },
        { categoria: 'COMMERCIALE', descrizione: 'Fornitori', importo: 5_000 },
      ])
    ).toBeNull();
    expect(snapshotDebitoEnteDaTriage([])).toBeNull();
  });
});

describe('importoRigaVera', () => {
  it('preferisce l’importo esplicito alla composizione', () => {
    expect(importoRigaVera({ importo: 1000, contributi: 900, sanzioni: 100 })).toBe(1000);
  });

  it('usa la composizione quando l’importo è assente', () => {
    expect(importoRigaVera({ importo: 0, contributi: 900, sanzioni: 100 })).toBe(1000);
  });
});

describe('debitoEnteConRipiego', () => {
  const certificazioneSenzaCerte = {
    totale: 0,
    contabilizzato: 0,
    daContabilizzare: 0,
    segnalato: 1200,
    contributi: 0,
    sanzioni: 0,
    creditiAgente: 0,
    righe: 0,
    righeSegnalate: 1,
    fonte: 'certificazione dei debiti',
  };

  it('tiene la base certa quando c’è', () => {
    const scelto = debitoEnteConRipiego({ ...certificazioneSenzaCerte, totale: 10 }, null);
    expect(scelto?.totale).toBe(10);
  });

  it('se la base certa è zero usa il triage e lo dichiara', () => {
    const triage = snapshotDebitoEnteDaTriage([
      { categoria: 'PREVIDENZIALE', descrizione: 'INPS', importo: 312_434 },
    ]);
    const scelto = debitoEnteConRipiego(certificazioneSenzaCerte, triage);
    expect(scelto?.totale).toBe(312_434);
    expect(scelto?.fonte).toContain('triage');
  });

  it('senza triage usa le segnalate, dichiarandole come stima', () => {
    const scelto = debitoEnteConRipiego(certificazioneSenzaCerte, null);
    expect(scelto?.totale).toBe(1200);
    expect(scelto?.fonte).toContain('segnalate');
  });

  it('senza nulla il debito è non disponibile, non zero', () => {
    expect(debitoEnteConRipiego(null, null)).toBeNull();
    expect(debitoEnteConRipiego({ ...certificazioneSenzaCerte, segnalato: 0 }, null)).toBeNull();
  });
});
