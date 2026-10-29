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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
  salvaMappaturaTitoliVeraAction: vi.fn(),
  ottieniMappaturaTitoliVera: vi.fn(),
  ottieniDebitiVera: vi.fn(),
  impostaDuplicatoVeraAction: vi.fn(),
  ottieniMaterieVociVera: vi.fn(),
  salvaMaterieVociVeraAction: vi.fn(),
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

// Gli identificativi dell'azienda presso l'ente: la finestra delle soglie li
// legge quando si apre, e devono essere quelli dell'Anagrafica Ente.
vi.mock('@/app/actions/anagraficaEnte', () => ({
  ottieniAnagraficaEnte: vi.fn(),
  salvaAnagraficaEnteAction: vi.fn(),
}));

vi.mock('@/app/actions/anagraficaEnteConfig', () => ({
  ottieniEtichetteAnagraficaEnte: vi.fn(),
  aggiornaEtichettaAnagraficaEnteAction: vi.fn(),
}));

import type { AnagraficaEstratta } from '@/app/actions/visuraEstrazione';
import {
  archiviaVerificaAction,
  creaAziendaInVerificaAction,
  ottieniStoricoVerificheAction,
  ottieniVerificaDaRiprendereAction,
  type VerificaDaRiprendere,
} from '@/app/actions/aziendaInVerifica';
import { estraiAnagraficaDaVisuraAction } from '@/app/actions/visuraEstrazione';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import {
  impostaDuplicatoVeraAction,
  ottieniDebitiVera,
  ottieniMappaturaTitoliVera,
  salvaMappaturaTitoliVeraAction,
} from '@/app/actions/posizioneVera';
import { ottieniMaterieEnteAction, ottieniTitoliEnteAction } from '@/app/actions/titoliEnte';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import { ottieniLavorazioniTipoDebito } from '@/app/actions/lavorazioniTipoDebito';
import { ottieniConsegneRepartiAction } from '@/app/actions/consegneReparti';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
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

  // Posizioni: una da lavorare, con un codice di partita («TS 27») e una
  // categoria che ha una lavorazione configurata — da qui nascono TUTTE e tre
  // le uscite — e una già contabilizzata, che i documenti devono dichiarare
  // senza elencarla.
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
      {
        id: 2,
        sezione: 'Sezione A',
        ambito: 'INPS',
        voce: 'TS 25 - nota di rettifica',
        importo: 400,
        categoria: 'CONTRIBUTI',
        stato: '',
        periodo: '202508 - 202508',
        trattamento: 'contabilizzato',
        contributi: 400,
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

  vi.mocked(ottieniAnagraficaEnte).mockResolvedValue({
    success: true,
    dati: {
      idEnte: 'ENTE-77',
      campo1: '0912345678',
      campo2: null,
      campo3: 'CSC-01',
      campo4: null,
      campo5: null,
      campo6: null,
      campo7: null,
      campo8: null,
      campo9: null,
      campo10: null,
    },
  });
  vi.mocked(ottieniEtichetteAnagraficaEnte).mockResolvedValue({
    success: true,
    etichette: [
      { campo: 1, etichetta: 'Matricola INPS', attivo: true },
      { campo: 3, etichetta: 'Codice CSC', attivo: true },
      { campo: 4, etichetta: 'Campo disattivato', attivo: false },
    ],
  });

  vi.mocked(ottieniConsegneRepartiAction).mockResolvedValue({ success: true, consegne: [] });
  vi.mocked(creaAziendaInVerificaAction).mockResolvedValue({
    success: false,
    error: 'Non deve essere chiamata: la verifica si riapre, non si rifà.',
  });
  vi.mocked(archiviaVerificaAction).mockResolvedValue({ success: true, aziendaId: AZIENDA_ID });
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

    // UNA SOLA USCITA: il report per unità operativa. Le comunicazioni ai
    // colleghi sono state ritirate — dicevano le stesse cose senza registrare
    // l'invio — e con loro il documento per reparto: due fogli per lo stesso
    // ufficio erano due versioni da tenere allineate.
    expect(screen.queryByRole('heading', { name: 'Comunicazioni ai colleghi' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Comunica ai reparti' })).toBeNull();
    const unitaOperative = sezioneDi('Report per unità operativa');
    // Il destinatario è quello della MATERIA (la configurazione viva), non
    // della vecchia tabella per categoria — che qui è configurata, ma non deve
    // più instradare.
    expect(within(unitaOperative).getByText('Ufficio Recupero Crediti')).toBeTruthy();
    expect(within(unitaOperative).queryByText('Sportello Entrate')).toBeNull();
    expect(within(unitaOperative).getByText(/Codici: 27/)).toBeTruthy();
    expect(within(unitaOperative).getByRole('button', { name: /Scarica il PDF/i })).toBeTruthy();

    // Ciò che il report non elenca si dichiara: la posizione già contabilizzata
    // non è una riga dell'elenco, ma il suo importo non sparisce.
    const dichiarazione = screen.getByText(
      /Già contabilizzate, e per questo non elencate: 1 posizione/
    );
    expect(dichiarazione.textContent).toContain('TS 25');

    // Un documento, un file.
    expect(screen.getAllByRole('button', { name: /Scarica il PDF/i })).toHaveLength(1);

    // Il triage NON è ricominciato: nessuna visura letta, nessuna azienda
    // creata, nessun ciclo nuovo che archivi il lavoro precedente.
    expect(estraiAnagraficaDaVisuraAction).not.toHaveBeenCalled();
    expect(creaAziendaInVerificaAction).not.toHaveBeenCalled();
  });

  it('dice che si può procedere alle comunicazioni per le unità operative, con i numeri', async () => {
    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText('Puoi procedere alle comunicazioni per le unità operative')
      ).toBeTruthy()
    );
    // I numeri dell'avviso sono quelli dei documenti, non una frase generica:
    // un ufficio, una posizione, 1.200 €.
    expect(screen.getByText(/1 ufficio, 1 posizione, 1\.200,00 €/)).toBeTruthy();
    // E porta al riquadro, senza farlo cercare.
    expect(screen.getByRole('link', { name: /Vai ai report per unità operativa/i })).toBeTruthy();

    // E dice che cosa i documenti NON elencano: il loro totale non è quello del
    // V.E.R.A., e la differenza ha una spiegazione, con la quota AdR.
    const avviso = screen.getByText('Puoi procedere alle comunicazioni per le unità operative')
      .parentElement!.parentElement!;
    const dichiarazione = within(avviso).getByText(
      /Già contabilizzate, e per questo non elencate/,
      { selector: 'p' }
    );
    expect(dichiarazione.textContent).toContain('TS 25');
    expect(dichiarazione.textContent).toContain('Agente della Riscossione');
  });

  it('le soglie si aprono in una finestra, che dice da dove vengono i numeri', async () => {
    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    const apri = await screen.findByRole('button', { name: /Apri le soglie di segnalazione/i });
    expect(screen.queryByRole('dialog')).toBeNull();
    apri.click();

    const finestra = await screen.findByRole('dialog');
    // Il confronto si misura sui documenti caricati — il V.E.R.A. per i debiti
    // certi e in divenire, i flussi inviati per il dovuto dell'anno
    // precedente, le deleghe F24 per il ritardo di versamento. I riferimenti
    // con cui l'ente identifica l'azienda (matricola, codici CSC) NON entrano
    // nel calcolo: mostrarli qui faceva credere che senza quelli il confronto
    // non si potesse fare.
    expect(within(finestra).getByText(/Da dove vengono i numeri/i)).toBeTruthy();
    expect(within(finestra).getAllByText(/V\.E\.R\.A\./).length).toBeGreaterThan(0);
    expect(within(finestra).getByText(/Denunce e flussi inviati/i)).toBeTruthy();
    expect(within(finestra).getByText(/Deleghe F24 e pagamenti/i)).toBeTruthy();
    expect(within(finestra).queryByText(/Matricola INPS/)).toBeNull();
    // Si chiude: la finestra è una lettura, non un passaggio obbligato.
    within(finestra)
      .getAllByRole('button', { name: /^Chiudi$/ })
      .at(-1)!
      .click();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('con il solo report per unità operativa, l’avviso conta la posizione invece di dire zero', async () => {
    // La materia non ha lavorazioni: nessun documento per reparto. Ma il codice
    // 27 ha una dipendenza propria, quindi il report per unità operativa esiste
    // e la posizione va a un ufficio. Contando solo i documenti per reparto
    // l’avviso diceva «1 ufficio, 0 posizioni, 0,00 €»: le posizioni sembravano
    // svanite, e il link portava a un riquadro vuoto.
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({ success: true, lavorazioni: [] });
    vi.mocked(ottieniLavorazioniTipoDebito).mockResolvedValue({ success: true, lavorazioni: [] });

    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText('Puoi procedere alle comunicazioni per le unità operative')
      ).toBeTruthy()
    );
    expect(screen.getByText(/1 ufficio, 1 posizione, 1\.200,00 €/)).toBeTruthy();
  });

  it('senza ufficio sulla materia, il link porta alla lavorazione che manca', async () => {
    // Nessuna lavorazione, né della materia né della vecchia tabella: il codice
    // 27 non ha una dipendenza propria e la sua materia non ne porta una.
    vi.mocked(ottieniLavorazioniMateria).mockResolvedValue({ success: true, lavorazioni: [] });
    vi.mocked(ottieniLavorazioniTipoDebito).mockResolvedValue({ success: true, lavorazioni: [] });
    vi.mocked(ottieniTitoliEnteAction).mockResolvedValue({
      success: true,
      dominioEnte: null,
      titoli: [
        {
          id: 1,
          codice: '27',
          atto: 'Flusso Uniemens',
          presuppostoGiuridico: '',
          riferimentoInterno: null,
          effettoCalcolo: 'NESSUNO',
          note: null,
          materiaId: 1,
          dipendenza: null,
          riscontroNorma: RISCONTRO_VUOTO,
          riscontroInterno: RISCONTRO_VUOTO,
        },
      ],
    });

    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText('Le comunicazioni per le unità operative non sono pronte')
      ).toBeTruthy()
    );

    // Il link non manda «ai parametri»: dice quale materia e la apre. Compare
    // nell'avviso e in fondo al report, perché chi arriva all'uno o all'altro
    // deve trovarlo lo stesso.
    const link = screen.getAllByRole('link', {
      name: /Configura la lavorazione di «Flussi Uniemens»/i,
    })[0];
    // E porta con sé la via del ritorno: chi esce dai Parametri deve tornare
    // a QUESTA verifica, non alla dashboard dei parametri.
    expect(link.getAttribute('href')).toBe(
      '/spazio/prova/parametri/materie-lavorazione?materia=1&ritorno=%2Fspazio%2Fprova%2Fverifica-salute%3Fazienda%3D42'
    );
  });

  //
  // I DUE TASTI CHE NON FACEVANO NULLA.
  //
  // In una verifica riaperta «Non procedo» apriva uno stato che nessuna parte
  // della videata leggeva — la finestra del motivo non c'era più — e «Verifica
  // un'altra azienda» non riportava al caricamento. Due comandi visibili e
  // inerti sono peggio di due comandi assenti: chi li preme crede di aver
  // deciso qualcosa.
  //
  it('«Non procedo» chiede il motivo e archivia la verifica', async () => {
    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    await waitFor(() => expect(screen.getByText('Verifica riaperta')).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();

    screen.getByRole('button', { name: 'Non procedo' }).click();
    const finestra = await screen.findByRole('dialog');
    expect(within(finestra).getByText(/Non procedo/i)).toBeTruthy();

    // Il motivo è obbligatorio: senza, l'archiviazione è indistinguibile da
    // una dimenticanza, e l'azione lo rifiuta.
    const motivo = within(finestra).getByLabelText(/Motivo/i);
    const conferma = within(finestra).getByRole('button', { name: /Archivia la verifica/i });
    expect((conferma as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(motivo, { target: { value: 'Debito sotto soglia, nessun seguito.' } });
    await waitFor(() => expect((conferma as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(conferma);

    await waitFor(() =>
      expect(archiviaVerificaAction).toHaveBeenCalledWith(
        SCHEMA,
        AZIENDA_ID,
        'Debito sotto soglia, nessun seguito.'
      )
    );
    // Chiusa la pratica si torna al caricamento: la verifica archiviata non è
    // più quella da guardare.
    await waitFor(() => expect(screen.getByText('Visura camerale (PDF)')).toBeTruthy());
  });

  //
  // LA SCELTA SULLA COPPIA F24 / DENUNCE.
  //
  // Lo stesso debito compare due volte nel file, come versamento non eseguito
  // e come denuncia non trasmessa: la cifra si conta una volta sola. Ma il
  // criterio può sbagliare, e chi vede la posizione lo sa meglio del criterio:
  // il comando deve registrare la scelta SULLA RIGA e cambiare i numeri della
  // verifica, non solo il colore di un pulsante.
  //
  it('la coppia si può dichiarare distinta, e la scelta cambia i totali', async () => {
    vi.mocked(ottieniDebitiVera).mockResolvedValue({
      success: true,
      righe: [
        {
          id: 11,
          sezione: 'Gestione',
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
        {
          id: 12,
          sezione: 'Gestione',
          ambito: 'INPS',
          voce: 'F24 Non presentato',
          importo: 9590,
          categoria: 'CONTRIBUTI',
          stato: '',
          periodo: '06/2026',
          trattamento: 'contabilizzato',
          contributi: 9590,
          sanzioni: 0,
        },
        {
          id: 13,
          sezione: 'Gestione',
          ambito: 'INPS',
          voce: 'Denunce non trasmesse',
          importo: 9590,
          categoria: 'CONTRIBUTI',
          stato: '',
          periodo: '2026-06-01',
          trattamento: 'contabilizzato',
          contributi: 0,
          sanzioni: 0,
        },
      ],
    });
    vi.mocked(impostaDuplicatoVeraAction).mockResolvedValue({ success: true });

    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    const riquadro = await waitFor(() =>
      sezioneDi('La stessa cifra scritta due volte nel V.E.R.A.')
    );
    // La coppia si vede con le due righe e la cifra in gioco.
    expect(within(riquadro).getAllByText(/F24 Non presentato/).length).toBeGreaterThan(0);
    expect(within(riquadro).getAllByText(/Denunce non trasmesse/).length).toBeGreaterThan(0);
    expect(
      within(riquadro).getAllByText(/Riconosciuto automaticamente: contato una volta sola/i).length
    ).toBeGreaterThan(0);

    // La dichiarazione delle già contabilizzate la conta UNA volta: 9.590 €.
    await waitFor(() =>
      expect(screen.getAllByText(/1 posizione per 9\.590,00 €/).length).toBeGreaterThan(0)
    );

    fireEvent.click(within(riquadro).getAllByRole('button', { name: /No, sono due debiti/i })[0]);

    // La scelta va sulla riga denunce, con l'azienda di questa posizione.
    await waitFor(() =>
      expect(impostaDuplicatoVeraAction).toHaveBeenCalledWith(SCHEMA, AZIENDA_ID, 13, 'NEGATO')
    );
    // E i numeri seguono: adesso la cifra conta due volte.
    await waitFor(() =>
      expect(screen.getAllByText(/2 posizioni per 19\.180,00 €/).length).toBeGreaterThan(0)
    );
    expect(
      within(riquadro).getAllByText(/Due debiti distinti: le due cifre contano entrambe/i).length
    ).toBeGreaterThan(0);

    // E si può tornare indietro: la coppia è ancora in elenco.
    fireEvent.click(within(riquadro).getAllByRole('button', { name: /Torna all.automatico/i })[0]);
    await waitFor(() =>
      expect(impostaDuplicatoVeraAction).toHaveBeenCalledWith(SCHEMA, AZIENDA_ID, 13, '')
    );
    await waitFor(() =>
      expect(screen.getAllByText(/1 posizione per 9\.590,00 €/).length).toBeGreaterThan(0)
    );
  });

  //
  // LA MAPPATURA V.E.R.A. SI FA QUI.
  //
  // La sezione che non si riconduce a una materia lascia le sue posizioni fuori
  // da ogni documento. La mappatura è un dato dello spazio, non dell'azienda:
  // si fa in una finestra aperta dal triage, e al salvataggio si aggancia alle
  // posizioni già lette — il report si compone subito, senza uscire dalla
  // verifica, senza aprire la scheda dell'azienda e senza ricaricare il file.
  it('le sezioni non mappate si mappano qui, e il report si compone subito', async () => {
    vi.mocked(ottieniDebitiVera).mockResolvedValue({
      success: true,
      righe: [
        {
          id: 21,
          sezione: 'Gestione artisti',
          ambito: 'INPS',
          voce: 'Compensi non versati',
          importo: 830,
          categoria: '',
          stato: 'Da verificare',
          periodo: '202507 - 202507',
          trattamento: 'da_contabilizzare',
          contributi: 830,
          sanzioni: 0,
        },
      ],
    });
    vi.mocked(salvaMappaturaTitoliVeraAction).mockResolvedValue({ success: true });

    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    // Senza una destinazione la posizione non arriva a nessun ufficio.
    await waitFor(() =>
      expect(
        screen.getByText('Le comunicazioni per le unità operative non sono pronte')
      ).toBeTruthy()
    );

    // UN INGRESSO SOLO, nel riquadro del report: è lì che si vede che cosa
    // manca alle posizioni. Il comando sta accanto all'avviso che lo spiega.
    const report = sezioneDi('Report per unità operativa');
    const mappaDalReport = within(report).getByRole('button', {
      name: /Mappa le sezioni qui/i,
    });
    expect(screen.getAllByRole('button', { name: /Mappa le sezioni qui/i })).toHaveLength(1);
    fireEvent.click(mappaDalReport);
    const finestra = await screen.findByRole('dialog');
    const scelta = await within(finestra).findByLabelText(/Destinazione di Gestione artisti/i);
    fireEvent.change(scelta, { target: { value: 'MATERIA:1' } });
    fireEvent.click(within(finestra).getByRole('button', { name: /Salva e aggancia/i }));

    // La scelta si salva SULLO SPAZIO: la sezione come la scrive il file, con la
    // sua etichetta e la materia scelta.
    await waitFor(() => expect(salvaMappaturaTitoliVeraAction).toHaveBeenCalled());
    const chiamata = vi.mocked(salvaMappaturaTitoliVeraAction).mock.calls[0];
    expect(chiamata[0]).toBe(SCHEMA);
    expect(chiamata[1]).toHaveLength(1);
    expect(chiamata[1][0].label).toBe('Gestione artisti');
    expect(chiamata[1][0].categoria).toBe('MATERIA:1');

    // Chiusa la finestra, la posizione ha una materia e il report esiste: gli
    // stessi numeri dell'avviso, senza ricaricare nulla.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByText('Puoi procedere alle comunicazioni per le unità operative')
      ).toBeTruthy()
    );
    expect(within(report).getByText('Ufficio Recupero Crediti')).toBeTruthy();
    expect(within(report).getAllByText(/1 posizione/).length).toBeGreaterThan(0);
  });

  it('«Verifica un’altra azienda» riporta al caricamento, senza restare sull’esito', async () => {
    render(
      <VerificaSaluteAzienda
        nomeSchema={SCHEMA}
        codice="prova"
        tipoSpazio="ENTE"
        aziendaDaRiprendere={AZIENDA_ID}
      />
    );

    await waitFor(() => expect(screen.getByText('Verifica riaperta')).toBeTruthy());
    screen.getByRole('button', { name: /Verifica un.altra azienda/i }).click();

    await waitFor(() => expect(screen.queryByText('Verifica riaperta')).toBeNull());
    expect(screen.getByText('Visura camerale (PDF)')).toBeTruthy();
  });
});
