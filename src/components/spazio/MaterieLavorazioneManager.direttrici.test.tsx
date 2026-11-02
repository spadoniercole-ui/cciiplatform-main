// @vitest-environment jsdom
//
// IL PASSO 2: LA MATERIA EREDITA LE TL DEL CATALOGO (0.157.0).
//
// Le TL non si scrivono più qui: si scelgono fra quelle del prodotto e la
// materia le associa ai propri codici. Il test guarda le due cose che si
// romperebbero in silenzio: la TL già associata compare con prodotto e
// direttrice, e quella libera si può associare chiamando l'azione con la
// materia giusta.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
  ottieniCatalogoTl: vi.fn(),
  collegaTlMateriaAction: vi.fn(),
  scollegaTlMateriaAction: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniMaterieEnteAction: vi.fn(),
}));

import {
  collegaTlMateriaAction,
  ottieniCatalogoTl,
  ottieniLavorazioniMateria,
} from '@/app/actions/materieLavorazione';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { MaterieLavorazioneManager } from './MaterieLavorazioneManager';

const materia = (id: number, nome: string) => ({
  id,
  nome,
  codiciIndicativi: null,
  presuppostoGiuridico: null,
  riferimentiInterni: null,
  proposta: null,
  stato: 'CONFERMATA' as const,
  confermataDa: null,
  confermataIl: null,
  esitoRicerca: null,
});

describe('materie e TL', () => {
  beforeEach(() => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
      success: true,
      materie: [materia(10, 'CONTABILIZZAZIONE DIFFIDE'), materia(11, 'Denunce Uniemens')],
    });
    vi.mocked(ottieniCatalogoTl).mockResolvedValue({
      success: true,
      tl: [
        {
          id: 1,
          direttrice: 'Gestione del credito',
          prodotto: 'Diffide',
          tipologia: 'Emissione diffida',
          dipendenza: 'Gestione del credito',
          procedura: null,
          esito: 'diffida notificata',
          ordine: 1,
          rilevantePerimetro: false,
          versoPerimetro: null,
          materie: 1,
        },
        {
          id: 2,
          direttrice: 'Presidio dei flussi informativi',
          prodotto: 'DURC',
          tipologia: 'Verifica del flusso',
          dipendenza: 'Presidio dei flussi informativi',
          procedura: null,
          esito: null,
          ordine: 1,
          rilevantePerimetro: true,
          versoPerimetro: 'COLLABORATIVA',
          materie: 0,
        },
      ],
    });
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({
      success: true,
      lavorazioni: [
        {
          id: 1,
          materiaId: 10,
          tipologia: 'Emissione diffida',
          dipendenza: 'Gestione del credito',
          procedura: null,
          esito: null,
          ordine: 1,
        },
      ],
    });
    vi.mocked(collegaTlMateriaAction).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mostra la TL ereditata con prodotto e direttrice, e associa quella libera', async () => {
    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText('Emissione diffida')).toBeTruthy());
    // La provenienza si legge accanto alla TL: prodotto · direttrice.
    expect(screen.getByText(/Diffide · Gestione del credito/)).toBeTruthy();

    const intestazione = screen.getByRole('heading', { name: 'Denunce Uniemens' });
    const card = intestazione.parentElement?.parentElement as HTMLElement;
    const select = within(card).getByLabelText(/TL da associare a Denunce Uniemens/);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(within(card).getByRole('button', { name: /Associa/ }));

    await waitFor(() => expect(collegaTlMateriaAction).toHaveBeenCalledWith('tenant_prova', 11, 2));
  });

  it('una materia senza TL lo dice, invece di restare muta', async () => {
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({ success: true, lavorazioni: [] });

    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getAllByText(/Nessuna TL associata/).length).toBe(2));
  });
});
