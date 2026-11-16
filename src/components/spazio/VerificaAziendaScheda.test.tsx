// @vitest-environment jsdom
//
// LA VERIFICA AZIENDA, GUARDATA DAVVERO (0.240.0).
//
// La scheda non ha più un flag da accendere né un profilo da scegliere: apre la
// fotografia da sola, mostra le colonne del prospetto contabile e i tre scenari
// sul credito. Il test guarda proprio questo — che le annualità arrivino dal
// server, che i numeri degli scenari si leggano e che uno scenario senza
// parametri si dichiari non calcolabile invece di mostrare zero.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/actions/verificaAzienda', () => ({
  calcolaVerificaAziendaAction: vi.fn(),
  salvaSimulazioneBaseAction: vi.fn(),
  ottieniSimulazioneBaseAction: vi.fn(),
}));

import {
  calcolaVerificaAziendaAction,
  ottieniSimulazioneBaseAction,
  salvaSimulazioneBaseAction,
} from '@/app/actions/verificaAzienda';
import { VerificaAziendaScheda } from './VerificaAziendaScheda';

const calcola = vi.mocked(calcolaVerificaAziendaAction);
const base = vi.mocked(ottieniSimulazioneBaseAction);
const salvaBase = vi.mocked(salvaSimulazioneBaseAction);

const dati = (ricavi: number, liquidita: number) => ({
  ricaviVendite: ricavi,
  valoreProduzione: ricavi * 1.1,
  costiProduzione: ricavi * 0.9,
  ebit: ricavi * 0.2,
  ebitda: ricavi * 0.25,
  utileEsercizio: ricavi * 0.08,
  patrimonioNetto: ricavi * 0.4,
  totaleDebiti: ricavi * 0.8,
  disponibilitaLiquide: liquidita,
});

const risultato = {
  success: true,
  fotografiaId: 42,
  debito: { totale: 120_000, memorizzatoIl: '2026-11-16', fonte: 'Verifica amministrativa' },
  asse: {
    annoBase: 2022,
    annoUltimoBilancio: 2023,
    annoVerifica: 2024,
    annualitaCalcolate: [2024],
  },
  nota: null,
  fotografia: {
    anni: [
      {
        anno: 2023,
        tipo: 'STORICO' as const,
        dati: dati(500_000, 30_000),
        indici: [],
        altriIndici: [],
        severity: 'OK' as const,
      },
      {
        anno: 2024,
        tipo: 'CALCOLATO' as const,
        dati: dati(550_000, 20_000),
        indici: [],
        altriIndici: [],
        severity: 'OK' as const,
      },
    ],
    annoVerifica: 2024,
    annoUltimoBilancio: 2023,
    credito: 120_000,
    rango: 'CHIROGRAFARIO' as const,
    capacita: {
      credito: 120_000,
      disponibilita: 20_000,
      flusso: 44_000,
      coperturaPct: 16.67,
      scoperto: 100_000,
      anniCopertura: 3,
      esito: 'PARZIALE' as const,
      dettaglio: 'Al 2024 l’azienda ha 20.000 € di disponibilità liquide a fronte di 120.000 €.',
    },
    scenari: [
      {
        codice: 'ACCORDO' as const,
        nome: 'Accordo transattivo',
        percentuale: null,
        recupero: null,
        perdita: null,
        calcolabile: true,
        motivo: null,
        dettaglio: 'Al 2024 l’azienda ha 20.000 € di disponibilità liquide a fronte di 120.000 €.',
      },
      {
        codice: 'LIQUIDAZIONE' as const,
        nome: 'Liquidazione giudiziale',
        percentuale: 30,
        recupero: 32_400,
        perdita: 87_600,
        calcolabile: true,
        motivo: null,
        dettaglio: 'Realizzo lordo 36.000 €, meno le spese di procedura.',
      },
      {
        codice: 'CRAM_DOWN' as const,
        nome: 'Cram down omologato',
        percentuale: null,
        recupero: null,
        perdita: null,
        calcolabile: false,
        motivo: 'manca la percentuale di cram down per il rango',
        dettaglio: 'Non calcolabile.',
      },
    ],
    confronto: null,
    avvertenze: [],
    motivo: null,
  },
};

const amministrativa = {
  etichetta: 'Giallo',
  esito: 'GIALLO',
  copertura: '2/3',
  verificataIl: '2026-11-16',
  debitoTotale: 120_000,
  debitoFonte: 'Verifica amministrativa',
  debitoIl: '2026-11-16',
};

beforeEach(() => {
  calcola.mockResolvedValue(risultato as never);
  base.mockResolvedValue({ success: true, base: null });
  salvaBase.mockResolvedValue({ success: true, simulazioneId: 42 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VerificaAziendaScheda — fotografia e tre scenari', () => {
  it('legge la fotografia all’apertura, senza flag né profili', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_demo"
        aziendaId={7}
        ragioneSociale="Tessitura Lario Demo S.p.A."
        amministrativa={amministrativa}
      />
    );
    await waitFor(() => expect(calcola).toHaveBeenCalledWith('tenant_demo', 7));
    expect(await screen.findByText('2023')).toBeTruthy();
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('storico')).toBeTruthy();
    expect(screen.getByText('calcolato')).toBeTruthy();
    // Il vecchio motore non c'è più: niente profili da scegliere.
    expect(screen.queryByText('Peggiorativo')).toBeNull();
    expect(screen.queryByText('Annualità oltre la verifica')).toBeNull();
  });

  it('mostra recupero e perdita degli scenari, e il motivo quando manca', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_demo"
        aziendaId={7}
        ragioneSociale="Tessitura Lario Demo S.p.A."
      />
    );
    expect(await screen.findByText('Liquidazione giudiziale')).toBeTruthy();
    // 32.400 € di recupero e 87.600 € di perdita sul credito di 120.000 €.
    expect(screen.getByText('32.400 €')).toBeTruthy();
    expect(screen.getByText('87.600 €')).toBeTruthy();
    expect(screen.getByText(/Non calcolabile: manca la percentuale di cram down/)).toBeTruthy();
    // L'accordo non mostra un recupero: mostra la capacità di risposta.
    expect(screen.getByText(/disponibilità liquide a fronte di 120.000 €/)).toBeTruthy();
  });

  it('salva la fotografia come base degli scenari', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_demo"
        aziendaId={7}
        ragioneSociale="Tessitura Lario Demo S.p.A."
      />
    );
    const bottone = await screen.findByRole('button', { name: /Salva come base/i });
    fireEvent.click(bottone);
    await waitFor(() => expect(salvaBase).toHaveBeenCalledWith('tenant_demo', 7, 42));
    expect(await screen.findByText(/base degli scenari della verifica aziendale/i)).toBeTruthy();
  });

  it('senza credito vantato lo dice invece di misurare zero', async () => {
    calcola.mockResolvedValue({
      success: true,
      fotografiaId: 42,
      debito: null,
      nota: null,
      fotografia: {
        ...risultato.fotografia,
        credito: null,
        scenari: risultato.fotografia.scenari.map((s) =>
          s.codice === 'ACCORDO'
            ? { ...s, calcolabile: false, motivo: 'capacità di risposta non calcolabile' }
            : { ...s, calcolabile: false, recupero: null, perdita: null }
        ),
      },
    } as never);

    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_demo"
        aziendaId={7}
        ragioneSociale="Tessitura Lario Demo S.p.A."
      />
    );
    expect(await screen.findByText(/credito vantato non è accertato/i)).toBeTruthy();
    expect(screen.getAllByText(/Non calcolabile/).length).toBeGreaterThanOrEqual(1);
  });
});
