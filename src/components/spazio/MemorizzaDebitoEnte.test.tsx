// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
const aggiorna = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock('@/app/actions/debitiEnteMemorizzati', () => ({
  aggiornaDebitoEnteMemorizzatoAction: (...args: unknown[]) => aggiorna(...args),
}));

import { MemorizzaDebitoEnte } from './MemorizzaDebitoEnte';

describe('memorizza debito ente', () => {
  beforeEach(() => {
    refresh.mockReset();
    aggiorna.mockReset();
  });
  afterEach(() => cleanup());

  it('scrive la cifra e ricarica la lista', async () => {
    aggiorna.mockResolvedValue({ success: true, debito: { totale: 12_000 } });

    render(<MemorizzaDebitoEnte nomeSchema="tenant_alfa" aziendaId={7} />);
    fireEvent.click(screen.getByText('Memorizza debito'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aggiorna).toHaveBeenCalledWith('tenant_alfa', 7);
  });

  it('se non c’è nulla da memorizzare lo dice, senza ricaricare', async () => {
    aggiorna.mockResolvedValue({
      success: false,
      error:
        'Nessun debito da memorizzare: mancano certificazione dei debiti e posizioni del triage.',
    });

    render(<MemorizzaDebitoEnte nomeSchema="tenant_alfa" aziendaId={7} />);
    fireEvent.click(screen.getByText('Memorizza debito'));

    expect(await screen.findByText(/Nessun debito da memorizzare/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
