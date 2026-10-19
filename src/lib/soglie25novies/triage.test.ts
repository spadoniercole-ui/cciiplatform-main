import { describe, expect, it } from 'vitest';
import { riepilogaSoglieTriage } from './triage';
import type { EsitoSoglie, RigaSoglia } from './calcolo';

const riga = (applicabile: boolean, esito: RigaSoglia['esito'], ente: RigaSoglia['ente']) =>
  ({
    ente,
    ambito: `Soglia ${ente}`,
    descrizione: 'descrizione',
    valore: '> 5.000 €',
    applicabile,
    esito,
    motivo: 'motivo',
    esposizione: 10_000,
  }) satisfies RigaSoglia;

const esito = (righe: RigaSoglia[]): EsitoSoglie => ({
  righe,
  superate: righe.filter((r) => r.applicabile && r.esito === 'sopra'),
  nonDeterminabili: righe.filter((r) => r.applicabile && r.esito === 'non_determinabile'),
  datiMancanti: [],
  inpsSopraSoloConSanzioni: false,
});

describe('riepilogaSoglieTriage', () => {
  it('una soglia superata è un fatto, anche con altre non determinabili', () => {
    const r = riepilogaSoglieTriage(
      esito([riga(true, 'sopra', 'INPS'), riga(true, 'non_determinabile', 'INAIL')])
    );
    expect(r.stato).toBe('superate');
    expect(r.superate).toHaveLength(1);
    expect(r.nonDeterminabili).toBe(1);
    expect(r.titolo).toContain('Un parametro');
    expect(r.dettaglio).toContain('Non equivale a un obbligo di segnalazione');
  });

  it('nessuna riga applicabile non è un esito favorevole', () => {
    const r = riepilogaSoglieTriage(
      esito([riga(false, 'non_determinabile', 'AGENZIA_RISCOSSIONE')])
    );
    expect(r.stato).toBe('non_applicabile');
    expect(r.titolo).toContain('Nessuna soglia applicabile');
  });

  it('nessun superamento ma dati mancanti: non si conclude', () => {
    const r = riepilogaSoglieTriage(
      esito([riga(true, 'sotto', 'INPS'), riga(true, 'non_determinabile', 'INAIL')])
    );
    expect(r.stato).toBe('non_determinabile');
    expect(r.titolo).toContain('sui dati disponibili');
  });

  it('tutte le soglie confrontate e sotto: nessun superamento', () => {
    const r = riepilogaSoglieTriage(
      esito([riga(true, 'sotto', 'INPS'), riga(true, 'sotto', 'INAIL')])
    );
    expect(r.stato).toBe('nessuna_superata');
    expect(r.applicabili).toBe(2);
    expect(r.nonDeterminabili).toBe(0);
  });

  it('le righe non applicabili non contano come dati mancanti', () => {
    const r = riepilogaSoglieTriage(
      esito([riga(true, 'sotto', 'INPS'), riga(false, 'sopra', 'AGENZIA_RISCOSSIONE')])
    );
    expect(r.stato).toBe('nessuna_superata');
    expect(r.superate).toHaveLength(0);
  });
});
