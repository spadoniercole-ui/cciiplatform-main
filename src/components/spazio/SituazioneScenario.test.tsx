// @vitest-environment jsdom

// LA SITUAZIONE NELLA SCHEDA: ATTIVA, CON QUELLO CHE VA RIVISTO E LA STORIA.
//
// Il cambio non cancella il lavoro fatto: lo scenario torna in bozza e la
// scheda dice quante righe di proposta e quante risposte di Check List vanno
// ricontrollate. Ogni cambio lascia una riga nella cronologia; l'Admin può
// annullare l'ultimo e la riga resta marcata «annullato». Lo scenario bloccato
// e la demo non si toccano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/app/actions/scenari', () => ({
  aggiornaSituazioneScenarioAction: vi.fn(),
  annullaUltimoCambioSituazioneAction: vi.fn(),
}));

import {
  aggiornaSituazioneScenarioAction,
  annullaUltimoCambioSituazioneAction,
} from '@/app/actions/scenari';
import { SituazioneScenario } from './SituazioneScenario';

const cambia = vi.mocked(aggiornaSituazioneScenarioAction);
const annulla = vi.mocked(annullaUltimoCambioSituazioneAction);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

const VOCE = {
  da: 'PROPOSTA',
  a: 'CRAM_DOWN',
  cambiataIl: '2026-11-10T08:00:00.000Z',
  autore: 'anna@alfa.it',
  annullatoIl: null,
  annullatoDa: null,
};

describe('SituazioneScenario', () => {
  it('mostra le tre situazioni, i passi compilati e la cronologia', () => {
    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="PROPOSTA"
        origine="Azienda"
        bloccato={false}
        cambiataIl="2026-11-09"
        rivedere={['Proposta: 2 righe di creditori da ricontrollare']}
        storico={[VOCE]}
      />
    );

    expect(screen.getByText('Accordo transattivo')).toBeTruthy();
    expect(screen.getByText('Liquidazione giudiziale')).toBeTruthy();
    expect(screen.getByText('Cram down')).toBeTruthy();
    expect(screen.getByText(/Situazione cambiata il/)).toBeTruthy();
    expect(screen.getByText(/2 righe di creditori da ricontrollare/)).toBeTruthy();
    expect(screen.getByText(/Cronologia della situazione \(1\)/)).toBeTruthy();
    expect(screen.getByText(/da Proposta a Dispositivo di cram down/)).toBeTruthy();
    // La traccia dice anche chi ha cambiato.
    expect(screen.getByText(/anna@alfa\.it/)).toBeTruthy();
    // Senza il permesso di annullare il comando non compare.
    expect(screen.queryByText('Annulla ultimo cambio')).toBeNull();
  });

  it('al cambio mostra cosa rivedere restituito dal server', async () => {
    cambia.mockResolvedValue({
      success: true,
      scenarioId: 4,
      rivedere: ['Check List: 5 risposte da riconfermare'],
    });

    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="PROPOSTA"
        origine="Azienda"
        bloccato={false}
      />
    );

    fireEvent.click(screen.getByText('Cram down'));

    await waitFor(() => expect(cambia).toHaveBeenCalledWith('tenant_test', 4, 'CRAM_DOWN'));
    expect(await screen.findByText(/5 risposte da riconfermare/)).toBeTruthy();
  });

  it('l’Admin annulla l’ultimo cambio e la traccia resta marcata', async () => {
    annulla.mockResolvedValue({
      success: true,
      scenarioId: 4,
      situazione: 'PROPOSTA',
      rivedere: [],
      storico: [{ ...VOCE, annullatoIl: '2026-11-10T09:00:00.000Z', annullatoDa: 'anna@alfa.it' }],
    });

    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="CRAM_DOWN"
        origine="Tribunale"
        bloccato={false}
        puoAnnullare
        cambiataIl="2026-11-10"
        storico={[VOCE]}
      />
    );

    fireEvent.click(screen.getByText('Annulla ultimo cambio'));

    await waitFor(() => expect(annulla).toHaveBeenCalledWith('tenant_test', 4));
    expect((await screen.findAllByText(/annullato da anna@alfa\.it/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ultimo cambio annullato/)).toBeTruthy();
  });

  it('su scenario bloccato l’Admin annulla solo dopo uno sblocco motivato', async () => {
    annulla.mockResolvedValue({
      success: true,
      scenarioId: 4,
      situazione: 'PROPOSTA',
      rivedere: [],
      storico: [{ ...VOCE, annullatoIl: '2026-11-10T09:30:00.000Z', annullatoDa: 'anna@alfa.it' }],
    });

    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="CRAM_DOWN"
        origine="Tribunale"
        bloccato
        puoAnnullare
        storico={[VOCE]}
      />
    );

    fireEvent.click(screen.getByText('Sblocca e annulla'));

    const motivo = screen.getByRole('textbox');
    fireEvent.change(motivo, { target: { value: 'Inquadramento errato' } });
    fireEvent.click(screen.getByText('Conferma sblocco e annulla'));

    await waitFor(() =>
      expect(annulla).toHaveBeenCalledWith('tenant_test', 4, 'Inquadramento errato')
    );
    expect(await screen.findByText(/Ultimo cambio annullato/)).toBeTruthy();
  });

  it('mostra gli sblocchi con motivo e autore e il link alla cronologia completa', () => {
    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="PROPOSTA"
        origine="Azienda"
        bloccato={false}
        codice="spazio1"
        storico={[VOCE]}
        sblocchi={[
          {
            motivo: 'Inquadramento errato, da riportare all’atto precedente',
            sbloccatoDa: 'anna@alfa.it',
            sbloccatoIl: '2026-11-10T09:30:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByText(/Sblocchi dello scenario \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Inquadramento errato/)).toBeTruthy();
    expect(screen.getAllByText(/anna@alfa\.it/).length).toBeGreaterThan(0);
    const link = screen.getByText('Tutta la cronologia').closest('a');
    expect(link?.getAttribute('href')).toBe('/spazio/spazio1/scenari/4/situazione');
  });

  it('uno scenario bloccato non si cambia', () => {
    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="CRAM_DOWN"
        origine="Tribunale"
        bloccato
      />
    );

    expect(screen.getByRole('button', { name: 'Accordo transattivo' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByText(/sola lettura/)).toBeTruthy();
  });

  it('in demo i percorsi restano predisposti', () => {
    render(
      <SituazioneScenario
        nomeSchema="tenant_demo"
        scenarioId={4}
        situazione="PROPOSTA"
        origine="Azienda"
        bloccato={false}
        demo
      />
    );

    expect(screen.getByRole('button', { name: 'Cram down' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/ambiente demo/)).toBeTruthy();
  });
});
