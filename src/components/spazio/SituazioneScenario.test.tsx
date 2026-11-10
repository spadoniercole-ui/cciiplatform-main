// @vitest-environment jsdom

// LA SITUAZIONE NELLA SCHEDA: ATTIVA, CON QUELLO CHE VA RIVISTO.
//
// Il cambio non cancella il lavoro fatto: lo scenario torna in bozza e la
// scheda dice quante righe di proposta e quante risposte di Check List vanno
// ricontrollate. Lo scenario bloccato e la demo non si toccano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/app/actions/scenari', () => ({ aggiornaSituazioneScenarioAction: vi.fn() }));

import { aggiornaSituazioneScenarioAction } from '@/app/actions/scenari';
import { SituazioneScenario } from './SituazioneScenario';

const cambia = vi.mocked(aggiornaSituazioneScenarioAction);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('SituazioneScenario', () => {
  it('mostra le tre situazioni e segnala i passi già compilati', async () => {
    render(
      <SituazioneScenario
        nomeSchema="tenant_test"
        scenarioId={4}
        situazione="PROPOSTA"
        origine="Azienda"
        bloccato={false}
        cambiataIl="2026-11-09"
        rivedere={['Proposta: 2 righe di creditori da ricontrollare']}
      />
    );

    expect(screen.getByText('Accordo transattivo')).toBeTruthy();
    expect(screen.getByText('Liquidazione giudiziale')).toBeTruthy();
    expect(screen.getByText('Cram down')).toBeTruthy();
    expect(screen.getByText(/Situazione cambiata il 2026-11-09/)).toBeTruthy();
    expect(screen.getByText(/2 righe di creditori da ricontrollare/)).toBeTruthy();
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
