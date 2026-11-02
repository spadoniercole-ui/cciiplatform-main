// @vitest-environment jsdom
//
// L'UFFICIO DI UNA TL SI SCEGLIE TRA LE DIRETTRICI (0.157.0).
//
// Era il punto che faceva sdoppiare lo stesso ufficio in tre documenti: un
// campo di testo libero, scritto tre volte con tre grafie. Con le direttrici
// come primo anello il campo diventa un elenco — e un ufficio già scritto che
// non è più una direttrice resta scegliibile, perché nessuno perda la
// configurazione che aveva. Senza direttrici torna testo libero: una
// configurazione mancante non deve bloccare il lavoro.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/materieLavorazione', () => ({
  salvaTlProdottoAction: vi.fn(),
  eliminaTlProdottoAction: vi.fn(),
}));

vi.mock('@/components/spazio/TitoliEnteManager', () => ({
  AnteprimaPassi: () => null,
}));

import { TlDelProdotto } from './TlDelProdotto';

const apri = () => fireEvent.click(screen.getByRole('button', { name: /Aggiungi TL/ }));

describe('la TL di un prodotto', () => {
  afterEach(() => cleanup());

  it('con le direttrici configurate l’ufficio è un elenco', () => {
    render(
      <TlDelProdotto
        nomeSchema="tenant_prova"
        direttrice="Gestione del credito"
        prodotto="Diffide"
        voci={[]}
        uffici={['Gestione del credito', 'Presidio dei flussi informativi']}
        onCambia={() => {}}
      />
    );
    apri();

    expect(screen.getByRole('combobox', { name: /Ufficio che la esegue/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Presidio dei flussi informativi' })).toBeTruthy();
  });

  it('senza direttrici il campo torna testo libero', () => {
    render(
      <TlDelProdotto
        nomeSchema="tenant_prova"
        direttrice=""
        prodotto="Diffide"
        voci={[]}
        uffici={[]}
        onCambia={() => {}}
      />
    );
    apri();

    expect(screen.getByRole('textbox', { name: /Ufficio che la esegue/ })).toBeTruthy();
  });

  it('la TL esistente si apre in modifica con il suo ufficio', () => {
    render(
      <TlDelProdotto
        nomeSchema="tenant_prova"
        direttrice="Gestione del credito"
        prodotto="Diffide"
        voci={[
          {
            id: 7,
            direttrice: 'Gestione del credito',
            prodotto: 'Diffide',
            tipologia: 'Emissione diffida',
            dipendenza: 'Ufficio legale',
            procedura: null,
            esito: null,
            ordine: 1,
            rilevantePerimetro: false,
            versoPerimetro: null,
            materie: 0,
          },
        ]}
        uffici={['Gestione del credito']}
        onCambia={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Modifica Emissione diffida/ }));

    // L'ufficio fuori elenco non si perde: compare fra le scelte.
    expect(screen.getByRole('option', { name: 'Ufficio legale' })).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: /Ufficio che la esegue/ }) as HTMLSelectElement).value
    ).toBe('Ufficio legale');
  });
});
