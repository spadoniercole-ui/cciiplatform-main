import { describe, it, expect } from 'vitest';
import { contestoRelazioneRicevente } from './contestoRicevente';
import { DATI_VUOTI } from '@/lib/posizioneAggiornata/schemaCampi';

describe('contesto della relazione di chiusura (Ricevente)', () => {
  it('confronta posizione aggiornata e bilancio e cita solo gli indici che cambiano esito', () => {
    const t = contestoRelazioneRicevente({
      screeningDel: '2026-09-21T10:00:00Z',
      ultimoBilancio: {
        anno: 2025,
        dati: { ...DATI_VUOTI, patrimonioNetto: -330000, totaleDebiti: 1513471 },
        indici: [
          { codice: 'C3', nome: 'C3', valore: 0.04, soglia: '> 0.02', esito: 'OK' },
          { codice: 'C1', nome: 'C1', valore: 1.35, soglia: '< 0.80', esito: 'VIOLATO' },
        ],
      },
      posizioneAggiornata: {
        data: '2026-06-30',
        dati: { ...DATI_VUOTI, patrimonioNetto: -354000, totaleDebiti: 1570147 },
        indici: [
          { codice: 'C3', nome: 'C3', valore: 0.01, soglia: '> 0.02', esito: 'VIOLATO' },
          { codice: 'C1', nome: 'C1', valore: 3.1, soglia: '< 0.80', esito: 'VIOLATO' },
        ],
      },
      debitoEnteVera: 41993.33,
      esito: { etichetta: 'Coerente', motivazione: 'offerta 100% sul capitale' },
      letturaCritica: 'testo',
      crescitaSettore: -0.4,
      crescitaAzienda: -7.6,
      sintesiPiano: null,
    });
    expect(t).toContain('AL 30/06/2026');
    expect(t).toContain('| Patrimonio netto | € -330.000 | € -354.000 | € -24.000 |');
    expect(t).toContain('C3: da entro soglia');
    expect(t).not.toContain('C1: da');
    expect(t).toContain('€ 41.993');
    expect(t).toContain('non messo alla prova');
  });

  it('senza posizione aggiornata lo dichiara', () => {
    const t = contestoRelazioneRicevente({
      screeningDel: null,
      ultimoBilancio: null,
      posizioneAggiornata: null,
      debitoEnteVera: null,
      esito: null,
      letturaCritica: null,
      crescitaSettore: null,
      crescitaAzienda: null,
      sintesiPiano: null,
    });
    expect(t).toContain('non pervenuta');
  });
});
