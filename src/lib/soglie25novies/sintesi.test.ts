import { describe, it, expect } from 'vitest';
import { sintetizzaSoglie } from './sintesi';

describe('sintesi di più soglie in un solo esito', () => {
  it('spazio ENTE, una riga sola: la sintesi è la riga', () => {
    expect(sintetizzaSoglie(1, 1, 0)).toBe(true);
    expect(sintetizzaSoglie(1, 0, 0)).toBe(false);
    expect(sintetizzaSoglie(1, 0, 1)).toBeNull();
  });

  it('REDIGENTE: una soglia superata vale anche con lacune altrove', () => {
    // È il difetto corretto: bastava una riga non determinabile perché
    // l'INTERO esito diventasse indeterminato, nascondendo una soglia
    // effettivamente superata dietro la mancanza di un dato che riguardava
    // un altro ente.
    expect(sintetizzaSoglie(4, 1, 2)).toBe(true);
  });

  it('nessuna superata ma dati mancanti: non si conclude', () => {
    // La risposta potrebbe stare proprio nel dato che manca.
    expect(sintetizzaSoglie(4, 0, 1)).toBeNull();
  });

  it('nessuna superata e tutto determinabile: esito negativo netto', () => {
    expect(sintetizzaSoglie(4, 0, 0)).toBe(false);
  });

  it('nessuna riga applicabile: niente da valutare', () => {
    expect(sintetizzaSoglie(0, 0, 0)).toBeNull();
    expect(sintetizzaSoglie(0, 0, 3)).toBeNull();
  });
});

describe('chi valuta quali soglie', () => {
  it('NON_PUBBLICO non filtra: le soglie pertinenti sono tutte', async () => {
    const { calcolaSoglie25Novies } = await import('./calcolo');
    const dati = {
      conLavoratori: true,
      contributiScaduti: 500_000,
      contributiDovutiAnnoPrecedente: 400_000,
      annoContributiDovuti: 2025,
      sanzioniPresunte: null,
      premiInail: 9_000,
      ivaScaduta: null,
      volumeAffari: null,
      creditiAffidati: null,
      formaAER: null,
      ritardoOltre90Giorni: null,
    };
    const tutte = calcolaSoglie25Novies(dati, 'NON_PUBBLICO');
    const soloInps = calcolaSoglie25Novies(dati, 'INPS');
    // Chi analizza vede anche la riga INAIL; l'INPS solo la propria.
    expect(tutte.righe.length).toBeGreaterThan(soloInps.righe.length);
    expect(tutte.superate.length).toBeGreaterThanOrEqual(2);
    expect(soloInps.superate).toHaveLength(1);
  });
});
