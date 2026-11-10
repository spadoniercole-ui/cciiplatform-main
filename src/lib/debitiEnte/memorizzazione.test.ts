import { describe, expect, it } from 'vitest';
import { debitoDaMemorizzare, descrizioneMemorizzazione } from './memorizzazione';
import type { SnapshotDebitoEnte } from '@/lib/ponte/debitoEnte';
import type { DebitoEntePonte } from '@/lib/ponte/types';

const certificazione = (p: Partial<SnapshotDebitoEnte> = {}): SnapshotDebitoEnte => ({
  totale: 300_000,
  contabilizzato: 200_000,
  daContabilizzare: 100_000,
  segnalato: 40_000,
  contributi: 250_000,
  sanzioni: 50_000,
  creditiAgente: 0,
  righe: 12,
  righeSegnalate: 3,
  fonte: 'certificazione dei debiti',
  ...p,
});

const triage = (p: Partial<DebitoEntePonte> = {}): DebitoEntePonte => ({
  totale: 120_000,
  contributi: 120_000,
  sanzioni: 0,
  creditiAgente: 0,
  righe: 4,
  sanzioniNonDistinte: true,
  fonte: 'Posizioni del triage, categorie qualificate.',
  ...p,
});

describe('debitoDaMemorizzare', () => {
  it('prende la certificazione quando la base certa è positiva, con i tre stati', () => {
    const d = debitoDaMemorizzare(certificazione(), null);
    expect(d).not.toBeNull();
    expect(d!.totale).toBe(300_000);
    expect(d!.contabilizzato).toBe(200_000);
    expect(d!.daContabilizzare).toBe(100_000);
    expect(d!.segnalato).toBe(40_000);
    expect(d!.fonteTipo).toBe('certificazione');
    expect(d!.ripartito).toBe(true);
  });

  it('memorizza il triage quando la certificazione ha totale zero', () => {
    const d = debitoDaMemorizzare(certificazione({ totale: 0 }), triage());
    expect(d!.totale).toBe(120_000);
    expect(d!.fonteTipo).toBe('triage');
    expect(d!.ripartito).toBe(false);
    expect(d!.contabilizzato).toBe(0);
    expect(d!.daContabilizzare).toBe(0);
    expect(d!.sanzioniNonDistinte).toBe(true);
  });

  it('ripiega sulle posizioni segnalate quando non c’è né base certa né triage', () => {
    const d = debitoDaMemorizzare(
      certificazione({ totale: 0, contabilizzato: 0, daContabilizzare: 0, segnalato: 55_000 }),
      null
    );
    expect(d!.totale).toBe(55_000);
    expect(d!.segnalato).toBe(55_000);
    expect(d!.fonteTipo).toBe('segnalato');
    expect(d!.ripartito).toBe(false);
  });

  it('non memorizza nulla quando non c’è alcun debito', () => {
    expect(debitoDaMemorizzare(null, null)).toBeNull();
    expect(debitoDaMemorizzare(certificazione({ totale: 0, segnalato: 0 }), null)).toBeNull();
    expect(debitoDaMemorizzare(null, triage({ totale: 0 }))).toBeNull();
  });

  it('arrotonda al centesimo, senza scarti di virgola', () => {
    const d = debitoDaMemorizzare(
      certificazione({ totale: 100.005, contabilizzato: 100.005 }),
      null
    );
    expect(d!.totale).toBe(100.01);
    expect(d!.contabilizzato).toBe(100.01);
  });

  it('conserva la fonte dichiarata, così la cifra non è anonima', () => {
    const d = debitoDaMemorizzare(certificazione(), null);
    expect(d!.fonte).toBe('certificazione dei debiti');
  });
});

describe('descrizioneMemorizzazione', () => {
  it('dichiara i tre stati quando il dato è ripartito', () => {
    const testo = descrizioneMemorizzazione(
      debitoDaMemorizzare(certificazione(), null)!,
      '2026-11-10'
    );
    expect(testo).toContain('2026-11-10');
    expect(testo).toContain('contabilizzato');
    expect(testo).toContain('da contabilizzare');
  });

  it('dichiara che il triage non distingue gli stati', () => {
    const testo = descrizioneMemorizzazione(debitoDaMemorizzare(null, triage())!, null);
    expect(testo).toContain('triage');
    expect(testo).toContain('non distingue');
  });

  it('dichiara che le posizioni segnalate sono una stima', () => {
    const testo = descrizioneMemorizzazione(
      debitoDaMemorizzare(certificazione({ totale: 0, segnalato: 55_000 }), null)!,
      null
    );
    expect(testo).toContain('stima');
  });
});
