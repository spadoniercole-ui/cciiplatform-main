// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColonnaVerificaAzienda } from '@/lib/verificaAzienda/simulazione';

const salvaMock = vi.fn();
vi.mock('@/app/actions/confrontoScenario', () => ({
  salvaSovrascrittureAction: (...args: unknown[]) => salvaMock(...args),
}));

import { ConfrontoScenario } from './ConfrontoScenario';

const parametri = {
  costiProceduraPct: 10,
  ranghi: [
    { rango: 'PREDEDUCIBILE' as const, tassoLiquidazionePct: 100, cramDownPct: 100 },
    { rango: 'PRIVILEGIATO' as const, tassoLiquidazionePct: 20, cramDownPct: 50 },
    { rango: 'CHIROGRAFARIO' as const, tassoLiquidazionePct: 40, cramDownPct: 30 },
    { rango: 'POSTERGATO' as const, tassoLiquidazionePct: 0, cramDownPct: 0 },
  ],
};

const colonna = (anno: number, ricavi: number): ColonnaVerificaAzienda => ({
  anno,
  tipo: 'STORICO',
  dati: {
    ricaviVendite: ricavi,
    valoreProduzione: 0,
    costiProduzione: 0,
    ebit: 0,
    ammortamenti: 0,
    ebitda: 0,
    oneriFinanziari: 0,
    utileEsercizio: 0,
    totaleAttivo: 0,
    attivoCircolante: 0,
    disponibilitaLiquide: 0,
    immobilizzazioni: 0,
    patrimonioNetto: 0,
    totaleDebiti: 0,
    debitiBanche: 0,
    debitiFornitori: 0,
    debitiTributari: 0,
    debitiPrevidenziali: 0,
    passivoCorrente: 0,
    creditiClienti: 0,
  },
  indici: [],
  altriIndici: [],
  severity: 'GREEN',
  debitoEnteInserito: 0,
});

describe('documento di confronto', () => {
  beforeEach(() => salvaMock.mockReset());
  afterEach(() => cleanup());

  it('confronta liquidazione e cram down sul credito', () => {
    render(
      <ConfrontoScenario
        modo="AMMINISTRATIVA"
        nomeSchema="spazio_demo"
        scenarioId={7}
        ragioneSociale="Alfa Srl"
        nomeScenario="Confronto ente"
        credito={100_000}
        parametri={parametri}
        soglie={{ superate: 2, nonDeterminabili: 1, datiMancanti: [], ente: 'INPS' }}
      />
    );

    expect(screen.getByText('Alfa Srl')).toBeTruthy();
    expect(screen.getAllByText(/36\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/La liquidazione restituirebbe/).textContent).toContain('6000');
  });

  it('ricalcola cambiando il rango del credito', () => {
    render(
      <ConfrontoScenario
        modo="AMMINISTRATIVA"
        nomeSchema="spazio_demo"
        scenarioId={7}
        ragioneSociale="Alfa Srl"
        nomeScenario="Confronto ente"
        credito={100_000}
        parametri={parametri}
        soglie={null}
      />
    );

    fireEvent.change(screen.getByLabelText(/Rango del credito/), {
      target: { value: 'PRIVILEGIATO' },
    });

    expect(screen.getAllByText(/18\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50\.000,00/).length).toBeGreaterThan(0);
  });

  it('salva la sovrascrittura e mostra la differenza', async () => {
    salvaMock.mockResolvedValue({
      success: true,
      sovrascritture: [
        {
          anno: 2024,
          voce: 'ricaviVendite',
          valoreBase: 500,
          valoreInserito: 600,
          differenza: 100,
        },
      ],
      statistiche: { numero: 1, sommaAssoluta: 100, mediaAssoluta: 100, perAnno: [] },
    });

    render(
      <ConfrontoScenario
        modo="AZIENDALE"
        nomeSchema="spazio_demo"
        scenarioId={7}
        ragioneSociale="Alfa Srl"
        nomeScenario="Accordo"
        base={{ profilo: 'Base', annualita: 3, colonne: [colonna(2024, 500)] }}
      />
    );

    const input = screen.getByLabelText('Ricavi delle vendite 2024');
    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.click(screen.getByText(/Salva sovrascritture/));

    await waitFor(() =>
      expect(salvaMock).toHaveBeenCalledWith('spazio_demo', 7, [
        { anno: 2024, voce: 'ricaviVendite', valoreInserito: 600 },
      ])
    );
    expect((await screen.findAllByText(/\+100,00/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Salvate 1 sovrascritture/)).toBeTruthy();
  });
});
