// @vitest-environment jsdom
//
// LA CATENA VISTA DALL'INTERFACCIA.
//
// Le direttrici sono il primo anello: il loro nome è il nome dell'ufficio che le
// lavorazioni delle materie scelgono e che i titoli di credito ereditano. Il
// test di `direttrici.test.ts` verifica i conteggi; questo guarda che il
// riquadro li mostri davvero — una direttrice che nessuno usa, gli uffici
// rimasti fuori elenco, i codici che arrivano a ciascuna — perché è quello che
// dice a chi configura se la catena è chiusa.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RISCONTRO_VUOTO, type TitoloEnte } from '@/lib/titoliEnte/titoli';

vi.mock('@/app/actions/screeningAzienda', () => ({
  ottieniDirettriciEnte: vi.fn(),
  aggiornaDirettriciEnteAction: vi.fn(),
}));

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
  riallineaUfficioAllaDirettriceAction: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniTitoliEnteAction: vi.fn(),
}));

import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import {
  ottieniLavorazioniMateria,
  riallineaUfficioAllaDirettriceAction,
} from '@/app/actions/materieLavorazione';
import { ottieniTitoliEnteAction } from '@/app/actions/titoliEnte';
import { DirettriciEnteConfigManager } from './DirettriciEnteConfigManager';

const titolo = (p: Partial<TitoloEnte>): TitoloEnte => ({
  id: 1,
  codice: '27',
  atto: 'Flusso Uniemens',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  dipendenza: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
  materiaId: 10,
  ...p,
});

describe('direttrici: la catena fino ai titoli', () => {
  beforeEach(() => {
    vi.mocked(ottieniDirettriciEnte).mockResolvedValue({
      success: true,
      direttrici: [
        { nome: 'Gestione del credito', prodotti: ['Diffide'] },
        { nome: 'Presidio dei flussi informativi', prodotti: ['DURC'] },
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
        {
          id: 2,
          materiaId: 11,
          tipologia: 'Verifica del flusso',
          dipendenza: 'Ufficio legale',
          procedura: null,
          esito: null,
          ordine: 1,
        },
      ],
    });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: null,
      titoli: [
        // eredita la dipendenza della materia 10
        titolo({ id: 1, codice: '27', materiaId: 10 }),
        // ufficio che non è una direttrice, scritto sul codice
        titolo({ id: 2, codice: '74', materiaId: 11, dipendenza: 'Ufficio legale' }),
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('dice a ogni direttrice quante lavorazioni, materie e codici arrivano', async () => {
    render(<DirettriciEnteConfigManager nomeSchema="tenant_prova" codice="prova" />);

    // Il nome compare anche tra le destinazioni proposte sotto: qui interessa
    // la riga della tabella della catena.
    await waitFor(() =>
      expect(screen.getByText('Gestione del credito', { selector: 'td' })).toBeTruthy()
    );

    const riga = screen.getByText('Gestione del credito', { selector: 'td' }).closest('tr');
    expect(riga).toBeTruthy();
    expect(
      within(riga as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Gestione del credito', '1', '1', '1']);

    const nonUsata = screen
      .getByText('Presidio dei flussi informativi', { selector: 'td' })
      .closest('tr');
    expect(
      within(nonUsata as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Presidio dei flussi informativi', 'nessuna', '0', '0']);
  });

  it('dice quale ufficio in uso non è una direttrice, e con quanto ci arriva', async () => {
    render(<DirettriciEnteConfigManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() =>
      expect(screen.getByText(/Uffici in uso che non sono direttrici/)).toBeTruthy()
    );
    expect(screen.getByText('Ufficio legale')).toBeTruthy();
    expect(screen.getByText('1 lavorazione · 1 codice')).toBeTruthy();
  });

  // Il comando che chiude la catena: un ufficio che non è una direttrice si
  // riporta su una direttrice scelta, e della vecchia grafia non resta niente —
  // né nelle lavorazioni delle materie (che le ricevono da qui) né nei titoli
  // che la dichiaravano. Il riquadro si riaggiorna da solo e l'ufficio sparisce
  // dall'elenco: è quello che dice all'utente che il clic ha fatto qualcosa.
  it('riporta l’ufficio fuori elenco alla direttrice scelta, in un clic', async () => {
    vi.mocked(riallineaUfficioAllaDirettriceAction).mockResolvedValue({
      success: true,
      destinazione: 'Gestione del credito',
      lavorazioni: 1,
      codici: 1,
    });

    render(<DirettriciEnteConfigManager nomeSchema="tenant_prova" codice="prova" />);
    await waitFor(() => expect(screen.getByText('Ufficio legale')).toBeTruthy());

    // Dopo il comando la catena è già riallineata: è quello che rileggono le
    // azioni finte quando il componente ricarica.
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
        {
          id: 2,
          materiaId: 11,
          tipologia: 'Verifica del flusso',
          dipendenza: 'Gestione del credito',
          procedura: null,
          esito: null,
          ordine: 1,
        },
      ],
    });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: null,
      titoli: [
        titolo({ id: 1, codice: '27', materiaId: 10 }),
        titolo({ id: 2, codice: '74', materiaId: 11 }),
      ],
    });

    const scelta = screen.getByLabelText('Direttrice a cui riportare Ufficio legale');
    fireEvent.change(scelta, { target: { value: 'Gestione del credito' } });
    fireEvent.click(screen.getByRole('button', { name: /Riporta/ }));

    await waitFor(() =>
      expect(vi.mocked(riallineaUfficioAllaDirettriceAction)).toHaveBeenCalledWith(
        'tenant_prova',
        'Ufficio legale',
        'Gestione del credito'
      )
    );
    await waitFor(() => expect(screen.getByText(/ora è «Gestione del credito»/)).toBeTruthy());
    expect(screen.getByText(/una lavorazione e un codice riportati/)).toBeTruthy();
    // L'ufficio non è più fuori elenco: il riquadro dice che non c'è più niente da fare.
    await waitFor(() => expect(screen.queryByText('Ufficio legale')).toBeNull());
  });

  it('mostra il rifiuto dell’azione senza togliere l’ufficio dall’elenco', async () => {
    vi.mocked(riallineaUfficioAllaDirettriceAction).mockResolvedValue({
      success: false,
      error: 'Scegli come destinazione una delle direttrici configurate (e salva prima le nuove).',
    });

    render(<DirettriciEnteConfigManager nomeSchema="tenant_prova" codice="prova" />);
    await waitFor(() => expect(screen.getByText('Ufficio legale')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Direttrice a cui riportare Ufficio legale'), {
      target: { value: 'Presidio dei flussi informativi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Riporta/ }));

    await waitFor(() => expect(screen.getByText(/salva prima le nuove/)).toBeTruthy());
    expect(screen.getByText('Ufficio legale')).toBeTruthy();
  });
});
