import { describe, expect, it } from 'vitest';
import { riepilogaSoglieTriage } from './triage';
import { calcolaSoglie25Novies, type EsitoSoglie, type RigaSoglia } from './calcolo';

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

const esito = (righe: RigaSoglia[], nonApplicabiliPerDatiMancanti = 0): EsitoSoglie => ({
  righe,
  superate: righe.filter((r) => r.applicabile && r.esito === 'sopra'),
  nonDeterminabili: righe.filter((r) => r.applicabile && r.esito === 'non_determinabile'),
  nonApplicabiliPerDatiMancanti,
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

  it('una soglia non applicata per un dato mancante non diventa «sotto soglia»', () => {
    // Le due righe INPS restano fuori dal confronto quando «con lavoratori»
    // non è dichiarato: dire «nessun parametro oltre soglia» sarebbe una
    // conclusione favorevole su una soglia che nessuno ha confrontato.
    const r = riepilogaSoglieTriage(
      esito([riga(true, 'sotto', 'INAIL'), riga(true, 'sotto', 'AGENZIA_ENTRATE')], 2)
    );
    expect(r.stato).toBe('non_determinabile');
    expect(r.titolo).toContain('sui dati disponibili');
    expect(r.dettaglio).toContain('non sono state confrontate');
    expect(r.dettaglio).toContain('presenza di lavoratori');
  });
});

describe('nonApplicabiliPerDatiMancanti', () => {
  const base = {
    conLavoratori: null,
    contributiScaduti: 40_000,
    contributiDovutiAnnoPrecedente: 50_000,
    annoContributiDovuti: 2025,
    sanzioniPresunte: null,
    premiInail: null,
    ivaScaduta: null,
    volumeAffari: null,
    creditiAffidati: null,
    formaAER: null,
    ritardoOltre90Giorni: null,
  } as const;

  it('conta le due INPS e le tre dell’Agente quando i dati che le scelgono mancano', () => {
    expect(calcolaSoglie25Novies(base).nonApplicabiliPerDatiMancanti).toBe(5);
  });

  it('le conta solo per l’ente che si sta guardando', () => {
    expect(calcolaSoglie25Novies(base, 'INPS').nonApplicabiliPerDatiMancanti).toBe(2);
    expect(calcolaSoglie25Novies(base, 'INAIL').nonApplicabiliPerDatiMancanti).toBe(0);
    expect(calcolaSoglie25Novies(base, 'AGENZIA_RISCOSSIONE').nonApplicabiliPerDatiMancanti).toBe(
      3
    );
  });

  it('con i dati dichiarati non resta fuori nessuna soglia', () => {
    const completo = {
      ...base,
      conLavoratori: true,
      formaAER: 'ALTRE_SOCIETA',
      ritardoOltre90Giorni: false,
    } as const;
    expect(calcolaSoglie25Novies(completo).nonApplicabiliPerDatiMancanti).toBe(0);
  });
});
