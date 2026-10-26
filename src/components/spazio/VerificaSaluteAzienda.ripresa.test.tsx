// @vitest-environment jsdom
//
// LA VERIFICA RIAPERTA, VISTA DALL'INTERFACCIA.
//
// Il test di `aziendaInVerifica.test.ts` dimostra che i dati per ricomporre una
// verifica ci sono e che l'azione li restituisce. Questo guarda un'altra cosa:
// che l'URL `?azienda=<id>` arrivi fino alla videata di esito senza rifare il
// triage — niente visura, niente creazione dell'azienda — e che lì si vedano
// le comunicazioni, i documenti per i reparti e il report per le unità
// operative, ciascuno con il suo pulsante di scaricamento.
//
// Perché serve un test così. La regressione da cui nasce la riapertura non era
// nel calcolo: era che l'esito viveva solo nello stato React. Un test sulle
// funzioni pure non l'avrebbe mai vista. Qui si monta il componente vero con
// `aziendaDaRiprendere` — lo stesso valore che la pagina ricava da `?azienda=`
// — e si legge ciò che l'operatore ha davanti.
//
// Le server action sono finte: non c'è database, e non serve. Ciò che si
// verifica è il percorso dal parametro alla schermata; che le risposte siano
// realistiche lo garantiscono i tipi (`VerificaDaRiprendere`, `RigaVera`, …),
// non la forma scritta a mano in un `as`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/app/actions/visuraEstrazione', () => ({
  estraiAnagraficaDaVisuraAction: vi.fn(),
}));

vi.mock('@/app/actions/aziendaInVerifica', () => ({
  creaAziendaInVerificaAction: vi.fn(),
  promuoviAziendaAction: vi.fn(),
  registraEsitoVerificaAction: vi.fn(),
  ottieniStoricoVerificheAction: vi.fn(),
  ottieniVerificaDaRiprendereAction: vi.fn(),
  archiviaVerificaAction: vi.fn(),
}));

vi.mock('@/app/actions/debitiTriage', () => ({
  salvaTutteDebitiTriageAction: vi.fn(),
}));

vi.mock('@/app/actions/struttureProspetto', () => ({
  salvaStrutturaProspettoAction: vi.fn(),
  cercaStrutturaProspettoAction: vi.fn(),
}));

vi.mock('@/app/actions/attenzioneScreening', () => ({
  ottieniAttenzioneScreeningAction: vi.fn(),
}));

vi.mock('@/app/actions/checklistMinisterialeAzienda', () => ({
  generaPreCompilazioneMinisterialeAction: vi.fn(),
}));

vi.mock('@/app/actions/visuraTriage', () => ({
  registraVisuraTriageAction: vi.fn(),
}));

vi.mock('@/app/actions/xbrlAzienda', () => ({
  salvaAnalisiXbrlAziendaAction: vi.fn(),
}));

vi.mock('@/app/actions/posizioneVera', () => ({
  sostituisciDebitiVeraAction: vi.fn(),
  ottieniMappaturaTitoliVera: vi.fn(),
  ottieniDebitiVera: vi.fn(),
}));

vi.mock('@/app/actions/titoliEnte', () => ({
  ottieniTitoliEnteAction: vi.fn(),
  ottieniMaterieEnteAction: vi.fn(),
}));

vi.mock('@/app/actions/materieLavorazione', () => ({
  ottieniLavorazioniMateria: vi.fn(),
}));

vi.mock('@/app/actions/categorieTipoDebito', () => ({
  ottieniCategorieTipoDebito: vi.fn(),
}));

vi.mock('@/app/actions/lavorazioniTipoDebito', () => ({
  ottieniLavorazioniTipoDebito: vi.fn(),
}));

vi.mock('@/app/actions/consegneReparti', () => ({
  confermaInvioConsegnaAction: vi.fn(),
  ottieniConsegneRepartiAction: vi.fn(),
  registraConsegnaRepartoAction: vi.fn(),
}));

vi.mock('@/app/actions/soglie25novies', () => ({
  salvaValoriSoglieParzialeAction: vi.fn(),
  valutaSoglieAction: vi.fn(),
}));

vi.mock('@/app/actions/documentiOrigine', () => ({
  registraDocumentoOrigineAction: vi.fn(),
}));

import type { AnagraficaEstratta } from '@/app/actions/visuraEstrazione';
import {
  creaAziendaInVerificaAction,
  ottieniStoricoVerificheAction,
  ottieniVerificaDaRiprendereAction,
  type VerificaDaRiprendere,
} from '@/app/actions/aziendaInVerifica';
import { estraiAnagraficaDaVisuraAction } from '@/app/actions/visuraEstrazione';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniDebitiVera, ottieniMappaturaTitoliVera } from '@/app/actions/posizioneVera';
import { ottieniMaterieEnteAction, ottieniTitoliEnteAction } from '@/app/actions/titoliEnte';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import { ottieniLavorazioniTipoDebito } from '@/app/actions/lavorazioniTipoDebito';
import { ottieniConsegneRepartiAction } from '@/app/actions/consegneReparti';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { RISCONTRO_VUOTO } from '@/lib/titoliEnte/titoli';
import { VerificaSaluteAzienda } from './VerificaSaluteAzienda';

const AZIENDA_ID = 42;
const SCHEMA = 'tenant_prova';

const ANAGRAFICA: AnagraficaEstratta = {
  ragioneSociale: 'Rossi Costruzioni S.r.l.',
  formaGiuridica: 'S.r.l.',
  annoCostituzione: 2005,
  codiceFiscale: '01234567890',
  partitaIva: '01234567890',
  codiceAteco: '412000',
  numeroRea: 'MI-123456',
  capitaleSociale: 10000,
  indirizzoSedeLegale: 'Via Roma 1',
  citta: 'Milano',
  provincia: 'MI',
  cap: '20100',
  rappresentanteLegale: 'Mario Rossi',
  ruoloRappresentanteLegale: 'Amministratore unico',
  pec: 'rossi@pec.it',
};

/** La verifica salvata, come la restituisce `ottieniVerificaDaRiprendereAction`. */
const VERIFICA: VerificaDaRiprendere = {
  aziendaId: AZIENDA_ID,
  anagrafica: ANAGRAFICA,
  dataVerifica: '2026-09-30',
  dataApprossimata: false,
  esito: 'PROSEGUI',
  eseguitaIl: '2026-10-01T08:30:00.000Z',
  inVerifica: true,
  archiviata: false,
  motivo: null,
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(ottieniVerificaDaRiprendereAction).mockResolvedValue({
    success: true,
    verifica: VERIFICA,
  });
  vi.mocked(ottieniStoricoVerificheAction).mockResolvedValue({ success: true, righe: [] });

  // Posizioni: una sola, con un codice di partita («TS 27») e una categoria
  // che ha una lavorazione configurata. Da qui nascono TUTTE e tre le uscite.
  vi.mocked(ottieniDebitiVera).mockResolvedValue({
    success: true,
    righe: [
      {
        id: 1,
        sezione: 'Sezione A',
        ambito: 'INPS',
        voce: 'TS 27 - flusso Uniemens non versato',
        importo: 1200,
        categoria: 'CONTRIBUTI',
        stato: 'Non versato',
        periodo: '202506 - 202506',
        trattamento: 'da_contabilizzare',
        contributi: 1200,
        sanzioni: 0,
      },
    ],
  });

  vi.mocked(ottieniAttenzioneScreeningAction).mockResolvedValue({
    success: true,
    attenzione: {
      esito: 'ATTENZIONE_MINIMA',
      etichetta: 'Nessuna criticità rilevante',
      fattoreDeterminante: 'Soglie di segnalazione non superate',
      accertato: ['Esposizione contributiva quantificata: 1.200 €'],
      daAccertare: [],
      copertura: { determinate: 4, totali: 4 },
    },
  });

  vi.mocked(valutaSoglieAction).mockResolvedValue({
    success: true,
    esito: {
      righe: [],
      superate: [],
      nonDeterminabili: [],
      datiMancanti: [],
      inpsSopraSoloConSanzioni: false,
    },
  });

  // Il destinatario per CATEGORIA: alimenta comunicazioni e documento per reparto.
  vi.mocked(ottieniMappaturaTitoliVera).mockResolvedValue({ success: true, mappatura: {} });
  vi.mocked(ottieniLavorazioniTipoDebito).mockResolvedValue({
    success: true,
    lavorazioni: [
      {
        id: 1,
        categoria: 'CONTRIBUTI',
        lavorazione: 'Recupero dei contributi non versati',
        destinatario: 'Sportello Entrate',
        attivo: true,
        ordine: 1,
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

  // Il destinatario per CODICE e per MATERIA: alimenta il report per unità
  // operativa. Il codice 27 ha una dipendenza propria, che vince su quella
  // della materia.
  vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
    success: true,
    dominioEnte: null,
    titoli: [
      {
        id: 1,
        codice: '27',
        atto: 'Flusso Uniemens',
        presuppostoGiuridico: 'Art. 1 D.Lgs. 46/1999',
        riferimentoInterno: null,
        effettoCalcolo: 'NESSUNO',
        note: null,
        materiaId: 1,
        dipendenza: 'Ufficio Recupero Crediti',
        riscontroNorma: RISCONTRO_VUOTO,
        riscontroInterno: RISCONTRO_VUOTO,
      },
    ],
  });
  vi.mocked(ottieniMaterieEnteAction).mockResolvedValue({
    success: true,
    materie: [
      {
        id: 1,
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
  vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({
    success: true,
    lavorazioni: [
      {
        id: 1,
        materiaId: 1,
        tipologia: 'Emissione diffida',
        dipendenza: 'Ufficio Recupero Crediti',
        procedura: '1. Verifica del flusso\n2. Diffida',
        esito: 'Diffida',
        ordine: 1,
      },
    ],
  });

  vi.mocked(ottieniConsegneRepartiAction).mockResolvedValue({ success: true, consegne: [] });
  vi.mocked(creaAziendaInVerificaAction).mockResolvedValue({
    success: false,
    error: 'Non deve essere chiamata: la verifica si riapre, non si rifà.',
  });
});

afterEach(() => {
  cleanup();
});

/** La sezione che contiene un titolo: h3 → riga del titolo → riquadro. */
function sezioneDi(titolo: string): HTMLElement {
  const h3 = screen.getByRole('heading', { name: titolo });
  const riquadro = h3.parentElement?.parentElement;
  if (!riquadro) throw new Error(`Riquadro di «${titolo}» non trovato.`);
  return riquadro;
}

describe('Verifica salute azienda — riapertura da ?azienda=', () => {
  it('mostra esito, comunicazioni e i due documenti senza rifare il triage', async () => {
    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    // La videata di esito, non un «caricamento» rimasto appeso.
    await waitFor(() => expect(screen.getByText('Verifica riaperta')).toBeTruthy());

    // È stata riaperta QUELLA verifica: l'id è quello dell'URL.
    expect(ottieniVerificaDaRiprendereAction).toHaveBeenCalledWith(SCHEMA, AZIENDA_ID);

    // L'esito: l'indicatore ricalcolato e le soglie rivalutate sui dati salvati.
    expect(screen.getByText('Nessuna criticità rilevante')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Soglie di segnalazione (art. 25-novies)' })
    ).toBeTruthy();

    // Le comunicazioni ai colleghi: il testo c'è, con il destinatario della
    // MATERIA (la configurazione viva), non con quello della vecchia tabella
    // per categoria — che qui è configurato, ma non deve più instradare.
    const comunicazioni = sezioneDi('Comunicazioni ai colleghi');
    expect(within(comunicazioni).getByText('Ufficio Recupero Crediti')).toBeTruthy();
    expect(within(comunicazioni).queryByText('Sportello Entrate')).toBeNull();
    expect(within(comunicazioni).getByRole('button', { name: /Copia testo/i })).toBeTruthy();

    // I due export, ciascuno nel proprio riquadro.
    const reparti = sezioneDi('Comunica ai reparti');
    expect(within(reparti).getByText('Ufficio Recupero Crediti')).toBeTruthy();
    expect(within(reparti).getByRole('button', { name: /Scarica il PDF/i })).toBeTruthy();

    const unitaOperative = sezioneDi('Report per unità operativa');
    expect(within(unitaOperative).getByText('Ufficio Recupero Crediti')).toBeTruthy();
    expect(within(unitaOperative).getByText(/Codici: 27/)).toBeTruthy();
    expect(within(unitaOperative).getByRole('button', { name: /Scarica il PDF/i })).toBeTruthy();

    // Due documenti, due file: uno per reparto, uno per unità operativa.
    expect(screen.getAllByRole('button', { name: /Scarica il PDF/i })).toHaveLength(2);

    // Il triage NON è ricominciato: nessuna visura letta, nessuna azienda
    // creata, nessun ciclo nuovo che archivi il lavoro precedente.
    expect(estraiAnagraficaDaVisuraAction).not.toHaveBeenCalled();
    expect(creaAziendaInVerificaAction).not.toHaveBeenCalled();
  });
});
