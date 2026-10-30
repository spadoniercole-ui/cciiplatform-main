// @vitest-environment jsdom
//
// I CONTRIBUTI INPS NELLA SCHEDA INDICI, VISTI DALL'INTERFACCIA.
//
// Il rapporto scaduti / dovuti e il ritardo oltre 90 giorni stanno nella
// stessa tabella degli indici, e devono dire cose diverse quando i dati sono
// diversi. Tre casi, tutti e tre reali:
//
//   1. serie letta dai file — il ritardo è misurato, e uno zero misurato è
//      «0 €», non un trattino;
//   2. serie ricostruita dalle posizioni del triage — il ritardo NON è
//      misurato, e la cella deve dirlo invece di mostrare zero;
//   3. serie ricostruita dai valori conservati — stessa regola, con la nota
//      che dice da dove viene.
//
// Il punto del test è la DISTINZIONE: «non misurato» e «zero» si somigliano
// in una cella vuota, e confonderli farebbe sembrare in regola un'azienda di
// cui semplicemente non si sa nulla. Le server action sono finte: qui si
// verifica che cosa l'operatore legge, non come i numeri si calcolano (quello
// sta in rapportoAnni.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@/app/actions/aziendaConfig', () => ({
  ottieniIndiciAzienda: vi.fn(),
  impostaIndiceAziendaAction: vi.fn(),
}));

vi.mock('@/app/actions/analisiBilancioStep', () => ({
  segnaVistaAnalisiBilancioAction: vi.fn(),
}));

vi.mock('@/app/actions/xbrlAzienda', () => ({
  ottieniStoricoXbrlAzienda: vi.fn(),
}));

vi.mock('@/app/actions/soglie25novies', () => ({
  ottieniContributiPerAnnoAction: vi.fn(),
}));

import { ottieniIndiciAzienda } from '@/app/actions/aziendaConfig';
import { segnaVistaAnalisiBilancioAction } from '@/app/actions/analisiBilancioStep';
import { ottieniStoricoXbrlAzienda, type BilancioStoricoAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniContributiPerAnnoAction } from '@/app/actions/soglie25novies';
import { AziendaConfigIndici } from './AziendaConfigIndici';

const SCHEMA = 'tenant_prova';
const AZIENDA_ID = 42;

/** Un bilancio caricato, con il solo indice che serve alla tabella. */
function bilancio(anno: number): BilancioStoricoAzienda {
  return {
    id: anno,
    aziendaId: AZIENDA_ID,
    annoBilancio: anno,
    nomeFile: `bilancio-${anno}.xbrl`,
    datiFinanziari: {} as BilancioStoricoAzienda['datiFinanziari'],
    indici: [
      {
        codice: 'C1',
        nome: 'Patrimonio netto',
        valore: 1000,
        soglia: '> 0',
        esito: 'OK',
      },
    ],
    altriIndici: [],
    situazioneDebitoria: {
      debitiBanche: 0,
      debitiFornitori: 0,
      debitiTributari: 0,
      debitiPrevidenziali: 0,
      altriDebiti: 0,
      totaleDebiti: 0,
      disponibilitaLiquide: 0,
      pfn: 0,
    },
    severity: 'GREEN',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(ottieniIndiciAzienda).mockResolvedValue({
    success: true,
    indici: [
      {
        id: 1,
        codice: 'C1',
        categoria: 'Patrimoniale',
        nome: 'Patrimonio netto',
        abilitato: true,
      },
    ],
  });
  vi.mocked(ottieniStoricoXbrlAzienda).mockResolvedValue({
    success: true,
    storico: [bilancio(2024), bilancio(2025)],
  });
  vi.mocked(segnaVistaAnalisiBilancioAction).mockResolvedValue({
    success: true,
    cambiato: false,
  });
});

afterEach(() => {
  cleanup();
});

/**
 * Il testo di una cella della tabella, per etichetta di riga e posizione.
 * La colonna 0 è l'indice, la 1 la soglia: i due anni stanno in 2 e 3.
 */
function cellaDi(etichetta: string, colonna: number): string {
  const td = screen.getByText(etichetta);
  const riga = td.closest('tr');
  if (!riga) throw new Error(`Riga di «${etichetta}» non trovata.`);
  return within(riga).getAllByRole('cell')[colonna].textContent ?? '';
}

/** L'attributo `title` della cella (il perché del valore, al passaggio). */
function titoloDi(etichetta: string, colonna: number): string | null {
  const td = screen.getByText(etichetta);
  const riga = td.closest('tr');
  if (!riga) throw new Error(`Riga di «${etichetta}» non trovata.`);
  return within(riga).getAllByRole('cell')[colonna].getAttribute('title');
}

describe('AziendaConfigIndici — contributi INPS per anno', () => {
  it('con la serie dei file mostra il ritardo per anno accanto al rapporto', async () => {
    vi.mocked(ottieniContributiPerAnnoAction).mockResolvedValue({
      success: true,
      origine: 'file',
      anni: [
        { anno: 2024, dovuti: 41_820, scaduti: 17_000, oltre90: 0 },
        { anno: 2025, dovuti: 48_380, scaduti: 44_471, oltre90: 44_471 },
      ],
    });

    render(<AziendaConfigIndici nomeSchema={SCHEMA} aziendaId={AZIENDA_ID} />);

    await waitFor(() => expect(screen.getByText('di cui scaduti da oltre 90 giorni')).toBeTruthy());
    expect(ottieniContributiPerAnnoAction).toHaveBeenCalledWith(SCHEMA, AZIENDA_ID);

    // Lo zero MISURATO è uno zero: «0 €», non un trattino. Nel 2024 il ritardo
    // fu accertato e assente, che è un'informazione diversa dal non saperlo.
    expect(cellaDi('di cui scaduti da oltre 90 giorni', 2)).toBe('0 €');
    // Nel 2025 il debito è per intero oltre i 90 giorni.
    expect(cellaDi('di cui scaduti da oltre 90 giorni', 3)).toBe('44.471 €');
    expect(titoloDi('di cui scaduti da oltre 90 giorni', 3)).toContain('oltre 90 giorni');

    // Il rapporto, nella stessa colonna: 40,7% e 91,9%.
    expect(cellaDi('Rapporto scaduti / dovuti', 2)).toBe('40,7%');
    expect(cellaDi('Rapporto scaduti / dovuti', 3)).toBe('91,9%');

    // La serie viene dai file: nessuna nota di ricostruzione.
    expect(screen.queryByText(/Serie ricostruita/)).toBeNull();
  });

  it('con la serie ricostruita dalle posizioni il ritardo risulta non misurato', async () => {
    vi.mocked(ottieniContributiPerAnnoAction).mockResolvedValue({
      success: true,
      origine: 'posizioni',
      ricostruitaIl: '2026-09-11',
      anni: [
        { anno: 2024, dovuti: 41_820, scaduti: 17_000, oltre90: null },
        { anno: 2025, dovuti: null, scaduti: 44_471, oltre90: null },
      ],
    });

    render(<AziendaConfigIndici nomeSchema={SCHEMA} aziendaId={AZIENDA_ID} />);

    await waitFor(() => expect(screen.getByText(/Serie ricostruita/)).toBeTruthy());

    // Il ritardo non c'è, e la cella dice perché: un trattino, non «0 €».
    expect(cellaDi('di cui scaduti da oltre 90 giorni', 2)).toBe('—');
    expect(cellaDi('di cui scaduti da oltre 90 giorni', 3)).toBe('—');
    expect(titoloDi('di cui scaduti da oltre 90 giorni', 2)).toContain('Ritardo non misurato');

    // Il rapporto si calcola solo dove ci sono entrambi i lati: nel 2025
    // manca il dovuto, e la cella resta vuota invece di dire «0%».
    expect(cellaDi('Rapporto scaduti / dovuti', 2)).toBe('40,7%');
    expect(cellaDi('Rapporto scaduti / dovuti', 3)).toBe('—');
    expect(titoloDi('Rapporto scaduti / dovuti', 3)).toContain('Rapporto non calcolabile');

    // La nota dice da dove viene la serie e quando: senza, sembrerebbe
    // letta dai file come tutte le altre.
    const nota = screen.getByText(/Serie ricostruita/);
    expect(nota.textContent).toContain('posizioni del triage');
    expect(nota.textContent).toContain('11/09/2026');
    expect(nota.textContent).toContain('non porta il ritardo oltre 90 giorni');
  });

  it('dice quando la serie viene dai valori conservati, non dai file', async () => {
    vi.mocked(ottieniContributiPerAnnoAction).mockResolvedValue({
      success: true,
      origine: 'valori',
      ricostruitaIl: '2026-09-11',
      anni: [
        { anno: 2024, dovuti: 41_820, scaduti: null, oltre90: null },
        { anno: 2025, dovuti: null, scaduti: 44_471, oltre90: null },
      ],
    });

    render(<AziendaConfigIndici nomeSchema={SCHEMA} aziendaId={AZIENDA_ID} />);

    const nota = await waitFor(() => screen.getByText(/Serie ricostruita/));
    expect(nota.textContent).toContain('valori conservati nell’ultima verifica');
    // Due lati su due anni diversi: nessun rapporto, in nessuna colonna.
    expect(cellaDi('Rapporto scaduti / dovuti', 2)).toBe('—');
    expect(cellaDi('Rapporto scaduti / dovuti', 3)).toBe('—');
  });
});
