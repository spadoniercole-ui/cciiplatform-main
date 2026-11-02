// @vitest-environment jsdom
//
// IL PASSO 2: LA MATERIA APPLICA UNA TL (0.159.0).
//
// La TL non si scrive più qui, e non sta più dentro il prodotto: vive nel
// catalogo (codice, descrizione, flag). La materia la applica a una direttrice
// e a un prodotto, e scrive il processo. Il test guarda le due cose che si
// romperebbero in silenzio: l'associazione già fatta compare con prodotto e
// direttrice, e quella nuova si salva con la materia giusta.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
  ottieniCatalogoTl: vi.fn(),
  salvaAssociazioneTlAction: vi.fn(),
  scollegaTlMateriaAction: vi.fn(),
}));

vi.mock('@/app/actions/screeningAzienda', () => ({
  ottieniDirettriciEnte: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniMaterieEnteAction: vi.fn(),
}));

import {
  ottieniCatalogoTl,
  ottieniLavorazioniMateria,
  salvaAssociazioneTlAction,
} from '@/app/actions/materieLavorazione';
import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
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
    vi.mocked(ottieniDirettriciEnte).mockResolvedValue({
      success: true,
      direttrici: [
        { nome: 'Gestione del credito', prodotti: ['Diffide'] },
        { nome: 'Presidio dei flussi informativi', prodotti: ['DURC'] },
      ],
    });
    vi.mocked(ottieniCatalogoTl).mockResolvedValue({
      success: true,
      tl: [
        {
          id: 1,
          codice: '81',
          descrizione: 'Diffida M400',
          checkList: false,
          versoCheckList: null,
          ordine: 1,
          materie: 1,
        },
        {
          id: 2,
          codice: '76',
          descrizione: 'CISOA',
          checkList: true,
          versoCheckList: 'COLLABORATIVA',
          ordine: 2,
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
          codice: '81',
          tipologia: 'Diffida M400',
          direttrice: 'Gestione del credito',
          prodotto: 'Diffide',
          dipendenza: 'Gestione del credito',
          procedura: null,
          esito: null,
          ordine: 1,
        },
      ],
    });
    vi.mocked(salvaAssociazioneTlAction).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mostra la TL applicata con prodotto e direttrice, e applica quella libera', async () => {
    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText(/Diffida M400/)).toBeTruthy());
    // La provenienza si legge accanto alla TL: prodotto · direttrice.
    expect(screen.getByText(/Diffide · Gestione del credito/)).toBeTruthy();

    const intestazione = screen.getByRole('heading', { name: 'Denunce Uniemens' });
    const card = intestazione.parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Applica una TL/ }));

    const select = within(card).getByLabelText(/TL da applicare a Denunce Uniemens/);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.change(within(card).getByLabelText('Direttrice'), {
      target: { value: 'Gestione del credito' },
    });
    fireEvent.change(within(card).getByLabelText('Prodotto'), {
      target: { value: 'Diffide' },
    });
    fireEvent.click(within(card).getByRole('button', { name: /^Salva$/ }));

    await waitFor(() =>
      expect(salvaAssociazioneTlAction).toHaveBeenCalledWith(
        'tenant_prova',
        expect.objectContaining({
          materiaId: 11,
          tlId: 2,
          direttrice: 'Gestione del credito',
          prodotto: 'Diffide',
        })
      )
    );
  });

  it('una materia senza TL lo dice, invece di restare muta', async () => {
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({ success: true, lavorazioni: [] });

    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getAllByText(/Nessuna TL applicata/).length).toBe(2));
  });
});
