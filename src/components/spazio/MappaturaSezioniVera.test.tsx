// @vitest-environment jsdom
//
// LA FINESTRA CHE MAPPA LE SEZIONI V.E.R.A.
//
// La sezione del file che non si riconduce a una materia non ha un ufficio a
// cui andare, quindi le sue posizioni restano fuori dai documenti. La scelta
// non è dell'azienda ma dello spazio: qui si prova che la finestra la salva su
// `vera_titoli` (sezione, etichetta, destinazione) e la riporta a chi l'ha
// aperta, che è il punto in cui le righe già lette vengono agganciate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/app/actions/posizioneVera', () => ({
  salvaMappaturaTitoliVeraAction: vi.fn(),
}));

vi.mock('@/app/actions/categorieTipoDebito', () => ({
  ottieniCategorieTipoDebito: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniMaterieEnteAction: vi.fn(),
}));

import { salvaMappaturaTitoliVeraAction } from '@/app/actions/posizioneVera';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { MappaturaSezioniVera, type SezioneDaMappare } from './MappaturaSezioniVera';

const SEZIONI: SezioneDaMappare[] = [
  { norm: 'gestione artisti', titolo: 'Gestione artisti', righe: 2, totale: 1830 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
    success: true,
    materie: [
      {
        id: 7,
        nome: 'Flussi Uniemens',
        codiciIndicativi: '27',
        presuppostoGiuridico: null,
        riferimentiInterni: null,
        proposta: null,
        stato: 'CONFERMATA',
        confermataDa: null,
        confermataIl: null,
        esitoRicerca: null,
      },
    ],
  });
  vi.mocked(ottieniCategorieTipoDebito).mockResolvedValue({
    success: true,
    categorie: [
      {
        codice: 'CONTRIBUTI',
        etichetta: 'Contributi INPS',
        descrizione: null,
        ordine: 1,
        attivo: true,
        contribuisce: true,
      },
    ],
  });
  vi.mocked(salvaMappaturaTitoliVeraAction).mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
});

describe('mappatura delle sezioni V.E.R.A.', () => {
  it('salva sezione, etichetta e destinazione, e le riporta a chi ha aperto la finestra', async () => {
    const onSalvate = vi.fn();
    const onChiudi = vi.fn();
    render(
      <MappaturaSezioniVera
        nomeSchema="tenant_prova"
        sezioni={SEZIONI}
        onChiudi={onChiudi}
        onSalvate={onSalvate}
      />
    );

    // Le destinazioni si leggono all'apertura: la sezione compare con le sue
    // posizioni e il suo importo, così si mappa guardando che cosa c'è dentro e
    // non un titolo nudo.
    const scelta = await screen.findByLabelText(/Destinazione di Gestione artisti/i);
    expect(screen.getByText('Gestione artisti')).toBeTruthy();
    expect(screen.getByText(/2 posizioni/)).toBeTruthy();

    fireEvent.change(scelta, { target: { value: 'MATERIA:7' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva e aggancia/i }));

    await waitFor(() =>
      expect(salvaMappaturaTitoliVeraAction).toHaveBeenCalledWith('tenant_prova', [
        { norm: 'gestione artisti', label: 'Gestione artisti', categoria: 'MATERIA:7' },
      ])
    );
    // Al chiamante torna la scelta, non una promessa: è con questa che le
    // righe già lette vengono riagganciate subito.
    expect(onSalvate).toHaveBeenCalledWith({ 'gestione artisti': 'MATERIA:7' });
    expect(onChiudi).not.toHaveBeenCalled();
  });

  it('una sezione senza destinazione non si salva, e lo dice', async () => {
    const onSalvate = vi.fn();
    render(
      <MappaturaSezioniVera
        nomeSchema="tenant_prova"
        sezioni={SEZIONI}
        onChiudi={vi.fn()}
        onSalvate={onSalvate}
      />
    );

    await screen.findByLabelText(/Destinazione di Gestione artisti/i);
    fireEvent.click(screen.getByRole('button', { name: /Salva e aggancia/i }));

    expect(
      await screen.findByText(
        /non ha ancora una destinazione: senza, le sue posizioni restano fuori/i
      )
    ).toBeTruthy();
    expect(salvaMappaturaTitoliVeraAction).not.toHaveBeenCalled();
    expect(onSalvate).not.toHaveBeenCalled();
  });

  it('un salvataggio rifiutato dal server non chiude la finestra', async () => {
    vi.mocked(salvaMappaturaTitoliVeraAction).mockResolvedValue({
      success: false,
      error: 'Sezione non salvata: prova a ripetere.',
    });
    const onSalvate = vi.fn();
    render(
      <MappaturaSezioniVera
        nomeSchema="tenant_prova"
        sezioni={SEZIONI}
        onChiudi={vi.fn()}
        onSalvate={onSalvate}
      />
    );

    const scelta = await screen.findByLabelText(/Destinazione di Gestione artisti/i);
    fireEvent.change(scelta, { target: { value: 'CONTRIBUTI' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva e aggancia/i }));

    const finestra = screen.getByRole('dialog');
    await waitFor(() => expect(within(finestra).getByText(/Sezione non salvata/)).toBeTruthy());
    expect(onSalvate).not.toHaveBeenCalled();
  });
});
