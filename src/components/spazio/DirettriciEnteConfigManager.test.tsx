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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { RISCONTRO_VUOTO, type TitoloEnte } from '@/lib/titoliEnte/titoli';

vi.mock('@/app/actions/screeningAzienda', () => ({
  ottieniDirettriciEnte: vi.fn(),
  aggiornaDirettriciEnteAction: vi.fn(),
}));

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniTitoliEnteAction: vi.fn(),
}));

import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
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

    await waitFor(() => expect(screen.getByText('Gestione del credito')).toBeTruthy());

    const riga = screen.getByText('Gestione del credito').closest('tr');
    expect(riga).toBeTruthy();
    expect(
      within(riga as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Gestione del credito', '1', '1', '1']);

    const nonUsata = screen.getByText('Presidio dei flussi informativi').closest('tr');
    expect(
      within(nonUsata as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Presidio dei flussi informativi', 'nessuna', '0', '0']);
  });

  it('dice quale ufficio in uso non è una direttrice', async () => {
    render(<DirettriciEnteConfigManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() =>
      expect(screen.getByText(/Uffici in uso che non sono direttrici/)).toBeTruthy()
    );
    expect(screen.getByText(/Ufficio legale \(1 lavorazioni, 1 codici\)/)).toBeTruthy();
  });
});
