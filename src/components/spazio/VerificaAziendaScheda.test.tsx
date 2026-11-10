// @vitest-environment jsdom
//
// LA MAPPA DELLA VERIFICA AZIENDA, GUARDATA DAVVERO.
//
// Il motore puro ha già i suoi test sui numeri; qui si controlla che la scheda
// mostri quello che promette: le tre scelte in testa (mutuamente esclusive), le
// colonne storiche e proiettate, il debito memorizzato come dato certo e — se
// manca — l'avviso al posto di uno zero inventato. Il click su Peggiorativo
// deve chiedere al server proprio quel profilo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/actions/verificaAzienda', () => ({
  calcolaVerificaAziendaAction: vi.fn(),
  impostaConfigVerificaAziendaAction: vi.fn(),
}));

vi.mock('@/app/actions/parametriScenari', () => ({
  ottieniParametriScenariAction: vi.fn(),
}));

import {
  calcolaVerificaAziendaAction,
  impostaConfigVerificaAziendaAction,
} from '@/app/actions/verificaAzienda';
import { ottieniParametriScenariAction } from '@/app/actions/parametriScenari';
import { VerificaAziendaScheda } from './VerificaAziendaScheda';

const calcola = vi.mocked(calcolaVerificaAziendaAction);
const parametri = vi.mocked(ottieniParametriScenariAction);

const colonna = (anno: number, tipo: 'STORICO' | 'PROIEZIONE', ricavi: number) => ({
  anno,
  tipo,
  dati: {
    ricavi,
    costi: ricavi * 0.8,
    ebitda: ricavi * 0.2,
    debitiBanche: 100_000,
    disponibilitaLiquide: 20_000,
  },
  indici: [],
  altriIndici: [],
  severity: 'OK',
  debitoEnteInserito: tipo === 'PROIEZIONE' ? 120_000 : 0,
});

const esito = {
  colonne: [colonna(2024, 'STORICO', 500_000), colonna(2025, 'PROIEZIONE', 550_000)],
  profilo: 'STANDARD' as const,
  annualita: 1,
  debitoEnte: 120_000,
  crescitaStoricaPct: 10,
  crescitaApplicataPct: 10,
  motivo: null,
  avvertenze: [],
};

const debito = {
  totale: 120_000,
  memorizzatoIl: '2026-10-02',
  fonte: 'verifica amministrativa',
};

beforeEach(() => {
  vi.clearAllMocks();
  parametri.mockResolvedValue({ success: true, parametri: null } as never);
  calcola.mockResolvedValue({ success: true, esito, debito } as never);
  vi.mocked(impostaConfigVerificaAziendaAction).mockResolvedValue({
    success: true,
    annualita: 3,
  });
});

afterEach(cleanup);

describe('VerificaAziendaScheda', () => {
  it('mostra le tre scelte, la mappa affiancata e il debito memorizzato', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={1}
      />
    );

    await screen.findByText('Mappa a sezioni affiancate');

    for (const etichetta of ['Standard', 'Migliorativo', 'Peggiorativo']) {
      expect(screen.getByText(etichetta)).toBeTruthy();
    }
    expect(screen.getAllByText('2024').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2025').length).toBeGreaterThan(0);
    expect(screen.getAllByText('proiezione').length).toBeGreaterThan(0);
    expect(screen.getByText('120.000 €')).toBeTruthy();
    expect(screen.getByText(/Debito dell’ente — dato certo della simulazione/)).toBeTruthy();
  });

  it('cambiando profilo richiede al server proprio quel profilo', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={2}
      />
    );

    await waitFor(() => expect(calcola).toHaveBeenCalledWith('tenant_test', 5, 'STANDARD', 2));
    fireEvent.click(screen.getByText('Peggiorativo'));

    await waitFor(() => expect(calcola).toHaveBeenCalledWith('tenant_test', 5, 'PEGGIORATIVO', 2));
  });

  it('senza debito memorizzato avvisa, non iscrive zero', async () => {
    calcola.mockResolvedValue({ success: true, esito, debito: null } as never);

    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={9}
        ragioneSociale="Beta Srl"
        annualitaIniziale={1}
      />
    );

    expect(await screen.findByText(/Nessun debito memorizzato/)).toBeTruthy();
    expect(screen.queryByText('120.000 €')).toBeNull();
  });
});
