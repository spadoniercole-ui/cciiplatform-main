// @vitest-environment jsdom
//
// LA VERIFICA AZIENDA, GUARDATA DAVVERO.
//
// Due verifiche in due box distinti, la simulazione che si abilita con un flag
// e si lancia, il debito memorizzato come dato certo (o l’avviso, se manca) e
// il salvataggio della simulazione come base degli scenari di accordo
// transattivo. Il click su Peggiorativo deve chiedere al server proprio quel
// profilo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/actions/verificaAzienda', () => ({
  calcolaVerificaAziendaAction: vi.fn(),
  impostaConfigVerificaAziendaAction: vi.fn(),
  impostaSimulazioneAttivaAction: vi.fn(),
  salvaSimulazioneBaseAction: vi.fn(),
  ottieniSimulazioneBaseAction: vi.fn(),
}));

import {
  calcolaVerificaAziendaAction,
  impostaConfigVerificaAziendaAction,
  impostaSimulazioneAttivaAction,
  salvaSimulazioneBaseAction,
  ottieniSimulazioneBaseAction,
} from '@/app/actions/verificaAzienda';
import { VerificaAziendaScheda } from './VerificaAziendaScheda';

const calcola = vi.mocked(calcolaVerificaAziendaAction);
const flag = vi.mocked(impostaSimulazioneAttivaAction);
const salvaBase = vi.mocked(salvaSimulazioneBaseAction);
const base = vi.mocked(ottieniSimulazioneBaseAction);

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

/* eslint-disable @typescript-eslint/no-explicit-any */
beforeEach(() => {
  vi.clearAllMocks();
  calcola.mockResolvedValue({ success: true, esito, debito, simulazioneId: 77 } as never);
  vi.mocked(impostaConfigVerificaAziendaAction).mockResolvedValue({
    success: true,
    annualita: 3,
    simulazioneAttiva: false,
  } as never);
  flag.mockResolvedValue({ success: true, attiva: true } as never);
  salvaBase.mockResolvedValue({ success: true, simulazioneId: 77 } as never);
  base.mockResolvedValue({ success: true, base: null } as never);
});

afterEach(cleanup);

const riepilogoAmministrativo = {
  etichetta: 'Criticità rilevante',
  esito: 'ROSSO',
  copertura: '3/4',
  verificataIl: '2026-11-09',
  debitoTotale: 120_000,
  debitoFonte: 'Certificazione dei debiti',
  debitoIl: '2026-11-09',
};

const riepilogoContabile = {
  anniXbrl: 2,
  visuraIl: '2026-11-09',
  parametriPresenti: true,
  completa: true,
};

describe('VerificaAziendaScheda', () => {
  it('tiene le due verifiche in due box distinti', () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={1}
        amministrativa={riepilogoAmministrativo}
        contabile={riepilogoContabile}
      />
    );

    expect(screen.getByText('Verifica amministrativa')).toBeTruthy();
    expect(screen.getByText('Verifica contabile')).toBeTruthy();
    expect(screen.getByText('Criticità rilevante')).toBeTruthy();
    expect(screen.getByText(/2 annualità XBRL/)).toBeTruthy();
    expect(screen.getByText('Dato storico completo')).toBeTruthy();
  });

  it('con il flag spento non lancia la simulazione; accendendolo la abilita', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={2}
      />
    );

    expect(screen.queryByText('Lancia la simulazione')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Abilita la simulazione/));

    await waitFor(() => expect(flag).toHaveBeenCalledWith('tenant_test', true));
    expect(await screen.findByText('Lancia la simulazione')).toBeTruthy();
    expect(calcola).not.toHaveBeenCalled();
  });

  it('lancia la simulazione e mostra mappa, profili e debito certo', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={1}
        simulazioneAttivaIniziale
        amministrativa={riepilogoAmministrativo}
      />
    );

    fireEvent.click(screen.getByText('Lancia la simulazione'));
    await screen.findByText('Mappa a sezioni affiancate');

    for (const etichetta of ['Standard', 'Migliorativo', 'Peggiorativo']) {
      expect(screen.getByText(etichetta)).toBeTruthy();
    }
    expect(screen.getAllByText('2024').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2025').length).toBeGreaterThan(0);
    expect(screen.getAllByText('proiezione').length).toBeGreaterThan(0);
    expect(screen.getAllByText('120.000 €').length).toBeGreaterThan(0);
    expect(screen.getByText(/Debito dell’ente — dato certo della simulazione/)).toBeTruthy();
    // Il debito è un dato accertato, non una riga simulata: sta in un blocco
    // suo, fuori dalla mappa, con la fonte e le annualità di iscrizione e
    // rimborso. Dentro le righe simulate non compare più come «di cui».
    expect(screen.getByText('Debito dell’ente — dato certo, non simulato')).toBeTruthy();
    expect(screen.getByText(/accertato nella verifica amministrativa/)).toBeTruthy();
    expect(screen.queryByText('di cui debito dell’ente (iscritto / rimborsato)')).toBeNull();
  });

  it('cambiando profilo richiede al server proprio quel profilo', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={2}
        simulazioneAttivaIniziale
      />
    );

    fireEvent.click(screen.getByText('Lancia la simulazione'));
    await waitFor(() => expect(calcola).toHaveBeenCalledWith('tenant_test', 5, 'STANDARD', 2));
    fireEvent.click(screen.getByText('Peggiorativo'));

    await waitFor(() => expect(calcola).toHaveBeenCalledWith('tenant_test', 5, 'PEGGIORATIVO', 2));
  });

  it('senza debito memorizzato avvisa, non iscrive zero', async () => {
    calcola.mockResolvedValue({ success: true, esito, debito: null, simulazioneId: 78 } as never);

    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={9}
        ragioneSociale="Beta Srl"
        annualitaIniziale={1}
        simulazioneAttivaIniziale
      />
    );

    fireEvent.click(screen.getByText('Lancia la simulazione'));
    expect(await screen.findByText(/Nessun debito memorizzato/)).toBeTruthy();
    expect(screen.queryByText('120.000 €')).toBeNull();
    // Senza debito consegnato non c’è nulla da leggere dentro i costi.
    expect(screen.queryByText('di cui debito dell’ente')).toBeNull();
  });

  it('salva la simulazione calcolata come base degli scenari', async () => {
    render(
      <VerificaAziendaScheda
        nomeSchema="tenant_test"
        aziendaId={5}
        ragioneSociale="Alfa Srl"
        annualitaIniziale={1}
        simulazioneAttivaIniziale
      />
    );

    fireEvent.click(screen.getByText('Lancia la simulazione'));
    await screen.findByText('Mappa a sezioni affiancate');
    fireEvent.click(screen.getByText('Salva come base per la proposta'));

    await waitFor(() => expect(salvaBase).toHaveBeenCalledWith('tenant_test', 5, 77));
    expect(await screen.findByText('Base per la proposta')).toBeTruthy();
  });
});
