// @vitest-environment jsdom
//
// CREARE UNO SCENARIO: TITOLO E SITUAZIONE.
//
// Il campo «tipo proposta» e il campo «origine» erano due modi di chiedere la
// stessa cosa: che cosa si sta valutando. Il test guarda il form vero e
// controlla che restino solo titolo e situazione, e che la situazione scelta
// arrivi al server — con l'origine derivata dallo spazio, non scelta a mano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/components/spazio/DemoUploadProvider', () => ({ useDemo: () => false }));

vi.mock('@/app/actions/aziende', () => ({ ottieniAziende: vi.fn() }));

vi.mock('@/app/actions/scenari', () => ({
  ottieniScenari: vi.fn(),
  creaScenarioAction: vi.fn(),
  archiviaScenarioAction: vi.fn(),
  eliminaScenarioAction: vi.fn(),
}));

vi.mock('@/app/actions/verificheScenario', () => ({
  verificheDisponibiliAziendaAction: vi.fn(),
}));

import { ottieniAziende } from '@/app/actions/aziende';
import { creaScenarioAction, ottieniScenari } from '@/app/actions/scenari';
import { verificheDisponibiliAziendaAction } from '@/app/actions/verificheScenario';
import { ScenariManager } from './ScenariManager';

const crea = vi.mocked(creaScenarioAction);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ottieniAziende).mockResolvedValue({
    success: true,
    aziende: [{ id: 1, ragioneSociale: 'Alfa Srl', attiva: true }],
  } as never);
  vi.mocked(ottieniScenari).mockResolvedValue({ success: true, scenari: [] } as never);
  vi.mocked(verificheDisponibiliAziendaAction).mockResolvedValue({
    success: true,
    amministrativa: true,
    contabile: false,
    aggancio: { pronto: false },
  } as never);
  crea.mockResolvedValue({ success: true, scenarioId: 7 });
});

afterEach(cleanup);

async function apriForm(tipoSpazio: 'ENTE' | 'NON_ENTE') {
  render(<ScenariManager codiceSpazio="demo" nomeSchema="tenant_demo" tipoSpazio={tipoSpazio} />);
  fireEvent.click(await screen.findByText('Alfa Srl'));
  fireEvent.click(await screen.findByRole('button', { name: /Nuovo Scenario/i }));
  await screen.findByText('Situazione da valutare');
}

describe('ScenariManager — creazione scenario', () => {
  it('chiede solo titolo e situazione, senza tipo proposta né origine', async () => {
    await apriForm('ENTE');

    expect(screen.getByText('Accordo transattivo')).toBeTruthy();
    expect(screen.getByText('Liquidazione giudiziale')).toBeTruthy();
    expect(screen.getByText('Cram down')).toBeTruthy();
    expect(screen.queryByText('Tipo proposta')).toBeNull();
    expect(screen.queryByText('Origine')).toBeNull();
  });

  it('per uno spazio ENTE la liquidazione porta origine Tribunale al server', async () => {
    await apriForm('ENTE');

    fireEvent.click(screen.getByText('Liquidazione giudiziale'));
    fireEvent.change(screen.getByPlaceholderText(/Nome scenario/), {
      target: { value: 'Ipotesi liquidazione' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(crea).toHaveBeenCalledWith(
        'tenant_demo',
        1,
        'Ipotesi liquidazione',
        'RICEVUTA',
        'Tribunale',
        false,
        { amministrativa: true, contabile: false },
        'DECRETO_LIQUIDAZIONE'
      )
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/spazio/demo/scenari/7'));
  });

  it('per un redigente l’accordo transattivo resta origine Studio', async () => {
    await apriForm('NON_ENTE');

    fireEvent.click(screen.getByText('Accordo transattivo'));
    fireEvent.change(screen.getByPlaceholderText(/Nome scenario/), {
      target: { value: 'Accordo 2027' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(crea).toHaveBeenCalledWith(
        'tenant_demo',
        1,
        'Accordo 2027',
        'DA_DEFINIRE',
        'Studio',
        true,
        { amministrativa: true, contabile: false },
        'PROPOSTA'
      )
    );
  });
});
