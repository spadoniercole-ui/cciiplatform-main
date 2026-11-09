import { describe, expect, it } from 'vitest';
import { AGGANGIO_VUOTO, aggancioContabile, debitoContabile } from './aggancioContabile';
import type { SnapshotDebitoEnte } from '@/lib/ponte/debitoEnte';

const visura = { presente: true, nomeFile: 'VISURA.pdf', caricataIl: '2026-11-09' };

const certificazione = (dati: Partial<SnapshotDebitoEnte> = {}): SnapshotDebitoEnte => ({
  totale: 100,
  contabilizzato: 70,
  daContabilizzare: 30,
  segnalato: 0,
  contributi: 100,
  sanzioni: 0,
  creditiAgente: 0,
  righe: 4,
  righeSegnalate: 0,
  fonte: 'certificazione dei debiti',
  ...dati,
});

describe('debitoContabile', () => {
  it('usa la base certa e dichiara la ripartizione', () => {
    const d = debitoContabile(certificazione(), null);
    expect(d).toMatchObject({
      contabilizzato: 70,
      daContabilizzare: 30,
      totale: 100,
      ripartito: true,
      fonte: 'certificazione dei debiti',
    });
  });

  it('ripiega sulle posizioni del triage quando la base certa è zero, senza ripartizione', () => {
    const d = debitoContabile(
      certificazione({ totale: 0, contabilizzato: 0, daContabilizzare: 0 }),
      {
        totale: 312_434,
        contributi: 312_434,
        sanzioni: 0,
        sanzioniNonDistinte: true,
        creditiAgente: 0,
        righe: 3,
        fonte: 'Posizioni del triage',
      }
    );
    expect(d).toMatchObject({ totale: 312_434, ripartito: false, fonte: 'Posizioni del triage' });
    expect(d?.contabilizzato).toBe(0);
  });

  it('usa le posizioni segnalate, dichiarandole come stima', () => {
    const d = debitoContabile(
      certificazione({
        totale: 0,
        contabilizzato: 0,
        daContabilizzare: 0,
        segnalato: 90_000,
        righeSegnalate: 8,
      }),
      null
    );
    expect(d?.totale).toBe(90_000);
    expect(d?.ripartito).toBe(false);
    expect(d?.fonte).toContain('stima');
  });

  it('non inventa un debito quando non c’è nulla', () => {
    expect(debitoContabile(null, null)).toBeNull();
    expect(
      debitoContabile(certificazione({ totale: 0, contabilizzato: 0, daContabilizzare: 0 }), null)
    ).toBeNull();
  });
});

describe('aggancioContabile', () => {
  it('è pronto solo con visura, debito e bilancio', () => {
    const a = aggancioContabile({
      visura,
      certificazione: certificazione(),
      triage: null,
      anniBilancio: [2024, 2023],
    });
    expect(a.pronto).toBe(true);
    expect(a.mancanti).toEqual([]);
    expect(a.anniBilancio).toEqual([2024, 2023]);
  });

  it('elenca i mancanti in ordine: prima l’amministrativa, poi il bilancio', () => {
    const a = aggancioContabile({
      visura: { presente: false, nomeFile: null, caricataIl: null },
      certificazione: null,
      triage: null,
      anniBilancio: [],
    });
    expect(a.pronto).toBe(false);
    expect(a.mancanti).toEqual([
      'visura dell’ente',
      'debito dell’ente (contabilizzato e da contabilizzare)',
      'bilancio XBRL',
    ]);
  });

  it('regge anche il debito dal solo triage: aggancio pronto ma ripartizione assente', () => {
    const a = aggancioContabile({
      visura,
      certificazione: null,
      triage: {
        totale: 312_434,
        contributi: 312_434,
        sanzioni: 0,
        sanzioniNonDistinte: true,
        creditiAgente: 0,
        righe: 3,
        fonte: 'Posizioni del triage',
      },
      anniBilancio: [2024],
    });
    expect(a.pronto).toBe(true);
    expect(a.debito?.ripartito).toBe(false);
    expect(a.debito?.totale).toBe(312_434);
  });

  it('ordina gli anni dal più recente e scarta i doppioni', () => {
    const a = aggancioContabile({
      visura,
      certificazione: certificazione(),
      triage: null,
      anniBilancio: [2022, 2024, 2024],
    });
    expect(a.anniBilancio).toEqual([2024, 2022]);
  });

  it('il valore vuoto è già «manca tutto»', () => {
    expect(AGGANGIO_VUOTO.pronto).toBe(false);
    expect(AGGANGIO_VUOTO.mancanti).toHaveLength(3);
  });
});
