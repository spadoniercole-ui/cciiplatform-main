// @vitest-environment node
//
// LA QUOTA DELL'ELABORAZIONE DEL PIANO.
//
// L'elaborazione del piano è una chiamata AI a pagamento — contesto lungo,
// ricerca web, seimila token di risposta — e la sola sessione basta a farla
// partire: deve passare dal tetto d'uso come le visure e i riscontri.
//
// Qui si prova il collegamento dell'azione al contatore (il conteggio vero, con
// i suoi limiti e i suoi messaggi, sta in `limiteAi.test.ts`): quota esaurita =
// nessuna chiamata al modello, nessun salvataggio; quota consumata con l'utente
// e lo spazio dello scenario; senza chiave non si consuma nulla.
//
// Le guardie, la sessione, l'apertura delle tabelle e i dati dello scenario
// sono simulati: sono le cose che hanno già il loro modulo. Il resto è codice di
// produzione.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { ContestoElaborazione } from '@/lib/piano/elaborazioneAi';

const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

vi.mock('@/lib/autorizzazione', () => ({
  richiediAccessoScenario: vi.fn(async () => ({ modalita: 'ADMIN_SPAZIO' as const })),
}));

vi.mock('@/app/actions/spazi', () => ({
  ottieniContestoAccessoSpazio: vi.fn(async () => ({
    spazioId: 3,
    codice: 'SPAZIO-PROVA',
    descrizione: 'Spazio di prova',
    nomeSchema: 'tenant_prova_piano_quota',
    modalita: 'ADMIN_SPAZIO' as const,
    email: 'anna@alfa.it',
  })),
}));

vi.mock('@/app/actions/scenari', () => ({
  verificaScenarioNonBloccato: vi.fn(async () => null),
  ottieniScenarioPerId: vi.fn(async () => ({ success: false })),
}));

// Le tabelle le prepara la prova: la provision è un no-op, così il test dice
// esattamente con quale schema lavora.
vi.mock('@/db/provision', () => ({
  assicuraTabelleParametriSpazio: async () => undefined,
  assicuraTabellaXbrlAzienda: async () => undefined,
  assicuraTabellaProposta: async () => undefined,
  assicuraTabellaPosizioneAggiornata: async () => undefined,
}));

const consumaQuotaAi = vi.fn();
vi.mock('@/lib/limiteAi', () => ({ consumaQuotaAi }));

// Il modello: se la quota lo ferma, non deve essere chiamato.
const creaMessaggio = vi.fn();
// Il client si sostituisce, le classi d'errore restano quelle vere: le usa
// `serviziEsterni` per tradurre un errore del fornitore in un messaggio.
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({ messages: { create: creaMessaggio } })),
  };
});

const { elaboraPianoConAiAction } = await import('./pianoSviluppo');

const SCHEMA = 'tenant_prova_piano_quota';
const SCENARIO = 12;

const STORICO = {
  anno: 2025,
  ricaviVendite: 1_000_000,
  valoreProduzione: 1_050_000,
  costiProduzione: 950_000,
  costiPersonale: 300_000,
  ammortamenti: 50_000,
  oneriFinanziari: 20_000,
  utileEsercizio: 60_000,
  immobilizzazioni: 400_000,
  creditiClienti: 250_000,
  disponibilitaLiquide: 30_000,
  attivoCircolante: 400_000,
  totaleAttivo: 800_000,
  patrimonioNetto: 100_000,
  debitiBanche: 300_000,
  debitiFornitori: 200_000,
  debitiTributari: 50_000,
  debitiPrevidenziali: 80_000,
  totaleDebiti: 700_000,
};

/** Il contesto che la pagina manda: gli stessi dati che l'operatore ha davanti. */
const contesto = (): ContestoElaborazione => ({
  lato: 'RICEVUTA',
  orizzonte: 3,
  storico: [STORICO],
  crescita: { tasso: 2, descrizione: 'Crescita del settore 2%.' },
  rate: { ente: [10_000, 10_000, 10_000], altri: [0, 0, 0] },
});

const MESSAGGIO_TETTO =
  "Limite di 10 elaborazioni del piano all'ora raggiunto. Riprova più tardi: il piano in schermo resta quello salvato.";

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'sk-prova';
  consumaQuotaAi.mockResolvedValue({ consentito: true });
  await db.exec(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.piano_sviluppo (
       scenario_id integer NOT NULL,
       variante text NOT NULL,
       progetto boolean NOT NULL DEFAULT false
     )`
  );
  await db.exec(`DELETE FROM ${SCHEMA}.piano_sviluppo`);
});

describe('elaborazione del piano: quota', () => {
  it('con la quota esaurita si ferma prima del modello, con il messaggio del tetto', async () => {
    consumaQuotaAi.mockResolvedValue({ consentito: false, error: MESSAGGIO_TETTO });

    const r = await elaboraPianoConAiAction('SPAZIO-PROVA', SCENARIO, contesto());

    expect(r.success).toBe(false);
    // Il pannello mostra questo testo così com'è: dice il tetto raggiunto e che
    // cosa resta all'operatore.
    expect(r.error).toBe(MESSAGGIO_TETTO);
    expect(creaMessaggio).not.toHaveBeenCalled();
  });

  it('la quota si consuma con l’utente della sessione e lo spazio dello scenario', async () => {
    // Il modello non risponde nulla di valido: qui interessa solo che la strada
    // ci arrivi, e l'errore che ne nasce è quello che l'azione già registra.
    const rumore = vi.spyOn(console, 'error').mockImplementation(() => {});
    await elaboraPianoConAiAction('SPAZIO-PROVA', SCENARIO, contesto());
    rumore.mockRestore();

    expect(consumaQuotaAi).toHaveBeenCalledTimes(1);
    const [, funzione, chi] = consumaQuotaAi.mock.calls[0];
    expect(funzione).toBe('PIANO');
    expect(chi).toEqual({ utente: 'anna@alfa.it', spazioId: 3 });
    // Con la quota disponibile la strada arriva al modello.
    expect(creaMessaggio).toHaveBeenCalled();
  });

  it('senza chiave AI non si consuma quota: il problema non è il tetto', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const r = await elaboraPianoConAiAction('SPAZIO-PROVA', SCENARIO, contesto());

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/chiave API Anthropic/i);
    expect(consumaQuotaAi).not.toHaveBeenCalled();
  });
});
