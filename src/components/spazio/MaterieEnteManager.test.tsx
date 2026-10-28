// @vitest-environment jsdom
//
// TOGLIERE O CORREGGERE LA CONFERMA, DALLA PAGINA DELLE MATERIE.
//
// Una materia «Confermata» copre i codici che vi cadono: la riga di ogni codice
// legge il suo presupposto e il suo riscontro. Finché la conferma non si poteva
// ritirare, un verde dato per errore restava appeso ai codici per sempre. Qui si
// guarda la pagina vera: i due comandi ci sono, chiamano l'azione con i valori
// giusti, e — la parte che conta — ricaricano le materie notificando il
// genitore, che è quello che fa aggiornare subito la tabella dei codici senza
// ricaricare la pagina.
//
// Le server action sono finte: non c'è database, e non serve. Ciò che si
// verifica è il percorso dal clic alla ricarica; che il server faccia la cosa
// giusta lo dice il test sulla logica pura (`materie.test.ts`) e quello sul
// riscontro revocato (`riscontroMateria.test.ts`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';

vi.mock('@/app/actions/titoliEnte', () => ({
  annullaConfermaMateriaEnteAction: vi.fn(),
  confermaMateriaEnteAction: vi.fn(),
  eliminaMateriaEnteAction: vi.fn(),
  ottieniMaterieEnteAction: vi.fn(),
  ricercaMateriaAction: vi.fn(),
  salvaMateriaEnteAction: vi.fn(),
  avviaRicercaDifferitaAction: vi.fn(),
  verificaRicercaDifferitaAction: vi.fn(),
}));

vi.mock('@/components/FinestreApp', () => ({ confermaApp: vi.fn(async () => true) }));

import {
  annullaConfermaMateriaEnteAction,
  confermaMateriaEnteAction,
  ottieniMaterieEnteAction,
} from '@/app/actions/titoliEnte';
import { confermaApp } from '@/components/FinestreApp';
import { MaterieEnteManager } from './MaterieEnteManager';

const materia = (p: Partial<MateriaEnte> = {}): MateriaEnte => ({
  id: 10,
  nome: 'Variazioni flussi VIG',
  codiciIndicativi: '11, 18',
  presuppostoGiuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
  riferimentiInterni: 'circolare n. 162 del 27-12-2010',
  proposta: {
    presupposti: [
      {
        norma: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
        url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1995-08-08;335',
        estratto: null,
      },
    ],
    riferimenti: [],
    sintesi: null,
    generataIl: '2026-09-23',
    conFonteUfficiale: true,
  },
  stato: 'CONFERMATA',
  confermataDa: 'anna@alfa.it',
  confermataIl: '2026-09-23T10:00:00.000Z',
  esitoRicerca: null,
  ...p,
});

const monta = (onCambiate = vi.fn()) => {
  render(
    <MaterieEnteManager
      nomeSchema="tenant_prova"
      codice="prova"
      dominioEnte="inps.it"
      onCambiate={onCambiate}
    />
  );
  return onCambiate;
};

describe('materie: la conferma si toglie e si corregge', () => {
  beforeEach(() => {
    vi.mocked(confermaApp).mockResolvedValue(true);
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({ success: true, materie: [materia()] });
    vi.mocked(annullaConfermaMateriaEnteAction).mockResolvedValue({
      success: true,
      stato: 'PROPOSTA',
      codici: 2,
    });
    vi.mocked(confermaMateriaEnteAction).mockResolvedValue({
      success: true,
      corretta: true,
      codici: 2,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('togliere la conferma la chiede, la esegue e ricarica i codici che vi cadono', async () => {
    const onCambiate = monta();

    const togli = await screen.findByRole('button', { name: /Togli la conferma/i });
    // Una ricarica c'è già stata al montaggio.
    await waitFor(() => expect(onCambiate).toHaveBeenCalledTimes(1));

    togli.click();

    await waitFor(() => expect(annullaConfermaMateriaEnteAction).toHaveBeenCalledWith('prova', 10));
    // La revoca è distruttiva per i codici: si chiede, non si esegue al clic.
    expect(confermaApp).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(confermaApp).mock.calls[0][0])).toContain('Variazioni flussi VIG');

    // La conseguenza si legge: quanti codici smettono di essere coperti.
    await waitFor(() =>
      expect(screen.getByText(/Conferma tolta: 2 codici non risultano più coperti/)).toBeTruthy()
    );
    // E il genitore è stato avvisato una seconda volta: è così che la tabella
    // dei titoli smette di mostrare il verde «dalla materia».
    expect(onCambiate).toHaveBeenCalledTimes(2);
  });

  it('correggere la conferma riapre i due campi e salva il testo corretto', async () => {
    monta();

    const correggi = await screen.findByRole('button', { name: /Correggi la conferma/i });
    correggi.click();

    // I campi partono dal testo confermato: si corregge, non si riscrive.
    const presupposto = await screen.findByDisplayValue(
      'Art. 2, comma 18, legge 8 agosto 1995, n. 335'
    );
    fireEvent.change(presupposto, {
      target: { value: 'Art. 3, comma 1, legge 8 agosto 1995, n. 335' },
    });

    screen.getByRole('button', { name: /^Confermo$/ }).click();

    await waitFor(() =>
      expect(confermaMateriaEnteAction).toHaveBeenCalledWith(
        'prova',
        10,
        'Art. 3, comma 1, legge 8 agosto 1995, n. 335',
        'circolare n. 162 del 27-12-2010'
      )
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Conferma corretta: 2 codici leggono ora il presupposto nuovo/)
      ).toBeTruthy()
    );
  });

  it('una materia non confermata non offre di togliere una conferma che non c’è', async () => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
      success: true,
      materie: [materia({ stato: 'PROPOSTA', confermataDa: null, confermataIl: null })],
    });
    monta();

    await screen.findByText('Variazioni flussi VIG');
    expect(screen.queryByRole('button', { name: /Togli la conferma/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Correggi la conferma/i })).toBeNull();
    // La strada che resta è quella di sempre: rivedere la proposta e confermare.
    expect(screen.getByRole('button', { name: /Rivedi e conferma/i })).toBeTruthy();
  });
});
