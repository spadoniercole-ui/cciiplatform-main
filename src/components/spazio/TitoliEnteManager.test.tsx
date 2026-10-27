// @vitest-environment jsdom
//
// LA RIGA GIALLA ACCANTO ALLA MATERIA VERDE.
//
// Il riscontro sulle fonti si fa una volta per materia e una persona lo
// conferma: il codice che cade in quella materia non deve vedersi chiedere la
// stessa ricerca. Il caso concreto è quello visto a schermo: una ricerca
// automatica andata a vuoto (`NON_VERIFICABILE`, che a schermo è «da
// riscontrare») su un codice la cui materia è invece confermata. Il test guarda
// la tabella vera: la riga legge il riscontro che la materia ha già ricevuto, e
// lo dice; il codice che non ha materia (o la cui materia non è confermata)
// resta com'era, perché lì nessuno ha ancora verificato niente.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { RISCONTRO_VUOTO, type RiscontroFonte, type TitoloEnte } from '@/lib/titoliEnte/titoli';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';

vi.mock('@/app/actions/titoliEnte', () => ({
  eliminaTitoloEnteAction: vi.fn(),
  ottieniTitoliEnteAction: vi.fn(),
  importaAnagraficaCodiciAction: vi.fn(),
  riscontraTitoloAction: vi.fn(),
  salvaAttivitaRecuperoAction: vi.fn(),
  salvaDominioEnteAction: vi.fn(),
  salvaTitoloEnteAction: vi.fn(),
  ottieniMaterieEnteAction: vi.fn(),
  assegnaMateriaCodiceAction: vi.fn(),
  suggerisciMaterieCodiciAction: vi.fn(),
}));

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
}));

vi.mock('@/components/FinestreApp', () => ({ confermaApp: vi.fn(async () => true) }));

import { ottieniMaterieEnteAction, ottieniTitoliEnteAction } from '@/app/actions/titoliEnte';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import { TitoliEnteManager } from './TitoliEnteManager';

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
  confermataDa: 'ADMIN_SPAZIO',
  confermataIl: '2026-09-23T10:00:00.000Z',
  esitoRicerca: null,
  ...p,
});

const riscontro = (
  esito: RiscontroFonte['esito'],
  p: Partial<RiscontroFonte> = {}
): RiscontroFonte => ({
  ...RISCONTRO_VUOTO,
  esito,
  ...p,
});

const codice = (p: Partial<TitoloEnte> = {}): TitoloEnte => ({
  id: 1,
  codice: '11',
  atto: 'REGOLARIZZAZIONE SPONTANEA INPS',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
  materiaId: 10,
  ...p,
});

/** La riga della tabella che porta quel codice di partita. */
const rigaDelCodice = (codicePartita: string) => {
  const riga = screen
    .getAllByRole('row')
    .find((r) => within(r).queryByText(codicePartita, { selector: 'td' }));
  if (!riga) throw new Error(`Riga del codice ${codicePartita} non trovata.`);
  return riga;
};

describe('titoli: il riscontro della materia vale per i codici', () => {
  beforeEach(() => {
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({ success: true, lavorazioni: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('il codice senza esito proprio legge il riscontro della materia e lo dichiara', async () => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({ success: true, materie: [materia()] });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: 'inps.it',
      titoli: [codice()],
    });

    render(<TitoliEnteManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText('11', { selector: 'td' })).toBeTruthy());
    const riga = rigaDelCodice('11');
    expect(within(riga).getAllByText('Confermato').length).toBeGreaterThan(0);
    expect(within(riga).getAllByText(/dalla materia «Variazioni flussi VIG»/).length).toBe(2);
    expect(within(riga).queryByText('Da riscontrare')).toBeNull();
  });

  it('la ricerca automatica andata a vuoto non cancella la materia confermata', async () => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({ success: true, materie: [materia()] });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: 'inps.it',
      titoli: [
        codice({
          riscontroInterno: riscontro('NON_VERIFICABILE', {
            motivo: 'Fonte non raggiungibile o risposta non interpretabile.',
          }),
        }),
      ],
    });

    render(<TitoliEnteManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText('11', { selector: 'td' })).toBeTruthy());
    const riga = rigaDelCodice('11');
    expect(within(riga).queryByText('Da riscontrare')).toBeNull();
    expect(within(riga).getAllByText(/dalla materia «Variazioni flussi VIG»/).length).toBe(2);
  });

  it('senza materia confermata il «da riscontrare» del codice resta in vista', async () => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
      success: true,
      materie: [materia({ stato: 'PROPOSTA', confermataDa: null, confermataIl: null })],
    });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: 'inps.it',
      titoli: [
        codice({
          riscontroInterno: riscontro('NON_VERIFICABILE', { motivo: 'Fonte non raggiungibile.' }),
        }),
      ],
    });

    render(<TitoliEnteManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() => expect(screen.getByText('11', { selector: 'td' })).toBeTruthy());
    const riga = rigaDelCodice('11');
    expect(within(riga).getByText('Da riscontrare')).toBeTruthy();
    expect(within(riga).queryByText(/dalla materia/)).toBeNull();
  });

  it('un contrasto del codice non si nasconde dietro la materia confermata', async () => {
    vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({ success: true, materie: [materia()] });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: 'inps.it',
      titoli: [
        codice({
          presuppostoGiuridico: 'Art. 99, comma 1, legge 8 agosto 1995, n. 335',
          riscontroNorma: riscontro('IN_CONTRASTO', { motivo: 'L’articolo citato dice altro.' }),
        }),
      ],
    });

    render(<TitoliEnteManager nomeSchema="tenant_prova" codice="prova" />);

    await waitFor(() =>
      expect(screen.getByText(/Un codice è in contrasto con le fonti ufficiali/)).toBeTruthy()
    );
    expect(within(rigaDelCodice('11')).getByText('In contrasto')).toBeTruthy();
  });
});
