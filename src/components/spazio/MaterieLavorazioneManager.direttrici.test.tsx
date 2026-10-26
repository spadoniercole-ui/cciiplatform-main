// @vitest-environment jsdom
//
// L'UFFICIO SI SCEGLIE TRA LE DIRETTRICI.
//
// Era il punto che faceva sdoppiare lo stesso ufficio in tre documenti: un campo
// di testo libero, scritto tre volte con tre grafie. Con le direttrici come
// primo anello della catena il campo diventa un elenco — e gli uffici già in uso
// che non sono (ancora) direttrici restano scegliibili, perché nessuno perda una
// configurazione che aveva. Senza direttrici il campo torna testo libero: una
// configurazione mancante non deve bloccare il lavoro.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
  salvaLavorazioneMateriaAction: vi.fn(),
  eliminaLavorazioneMateriaAction: vi.fn(),
}));

vi.mock('@/app/actions/screeningAzienda', () => ({
  ottieniDirettriciEnte: vi.fn(),
}));

// Il componente importa l'anteprima dei passi e il gestore delle materie dai
// titoli: le funzioni non servono qui, ma i moduli devono esistere.
vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniTitoliEnteAction: vi.fn(),
  ottieniMaterieEnteAction: vi.fn(),
  salvaTitoloEnteAction: vi.fn(),
  eliminaTitoloEnteAction: vi.fn(),
  importaAnagraficaCodiciAction: vi.fn(),
  riscontraTitoloAction: vi.fn(),
  salvaAttivitaRecuperoAction: vi.fn(),
  salvaDominioEnteAction: vi.fn(),
  assegnaMateriaCodiceAction: vi.fn(),
  suggerisciMaterieCodiciAction: vi.fn(),
  confermaMateriaEnteAction: vi.fn(),
  eliminaMateriaEnteAction: vi.fn(),
  ricercaMateriaAction: vi.fn(),
  salvaMateriaEnteAction: vi.fn(),
  avviaRicercaDifferitaAction: vi.fn(),
  verificaRicercaDifferitaAction: vi.fn(),
}));

import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
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

describe('lavorazioni delle materie: la dipendenza è una direttrice', () => {
  beforeEach(() => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
      success: true,
      materie: [materia(10, 'CONTABILIZZAZIONE DIFFIDE'), materia(11, 'Denunce Uniemens')],
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('propone le direttrici e lascia scegliere anche gli uffici già in uso', async () => {
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

    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText('Nuova lavorazione')).toBeTruthy());

    // Ogni campo dipendenza della pagina (la nuova lavorazione e quella già
    // configurata) propone le stesse scelte.
    const gruppiDirettrici = screen.getAllByRole('group', { name: 'Direttrici dell’ente' });
    expect(gruppiDirettrici.length).toBeGreaterThanOrEqual(2);
    for (const gruppo of gruppiDirettrici) {
      expect(within(gruppo).getByRole('option', { name: 'Gestione del credito' })).toBeTruthy();
      expect(
        within(gruppo).getByRole('option', { name: 'Presidio dei flussi informativi' })
      ).toBeTruthy();
    }

    // L'ufficio che non è una direttrice resta scegliibile: la configurazione
    // esistente non si perde.
    const gruppiAltri = screen.getAllByRole('group', { name: 'Altri uffici già in uso' });
    expect(gruppiAltri.length).toBeGreaterThanOrEqual(2);
    for (const gruppo of gruppiAltri) {
      expect(within(gruppo).getByRole('option', { name: 'Ufficio legale' })).toBeTruthy();
    }
    expect(screen.getByDisplayValue('Ufficio legale')).toBeTruthy();
  });

  it('senza direttrici il campo torna testo libero, con la strada per aggiungerle', async () => {
    vi.mocked(ottieniDirettriciEnte).mockResolvedValue({ success: true, direttrici: [] });

    render(<MaterieLavorazioneManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() =>
      expect(screen.getAllByText(/Nessuna direttrice configurata/).length).toBeGreaterThan(0)
    );
    expect(
      screen.getAllByPlaceholderText('Es. Ufficio Recupero Crediti — Sede di …').length
    ).toBeGreaterThan(0);
  });
});
