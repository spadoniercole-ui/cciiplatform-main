// @vitest-environment node
//
// LA SIMULAZIONE CONTABILE SALVATA COME BASE, SUL DATABASE.
//
// La simulazione alla data della verifica non è un calcolo da guardare e
// perdere: la verifica aziendale la legge come propria base. Le guardie, la
// sessione, l'apertura della verifica e il debito memorizzato sono simulati —
// sono le cose che non si provano su un Postgres di test, o che hanno già il
// loro modulo. Tutto il resto è codice di produzione: la proiezione viene
// calcolata dai bilanci in archivio, l'INSERT e l'UPDATE sono quelli veri, e la
// riga si rilegge con la funzione che usa la verifica aziendale
// (`leggiFotografiaBase`). PGlite dice se il dato resta al suo posto.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const db = await PGlite.create();

vi.mock('@/lib/db', () => ({
  pool: { query: (testo: string, parametri?: unknown[]) => db.query(testo, parametri) },
}));

const richiediAccessoAzienda = vi.fn(async () => ({
  modalita: 'ADMIN_SPAZIO' as const,
  email: 'anna@alfa.it',
}));
vi.mock('@/lib/autorizzazione', () => ({
  richiediAccessoAzienda,
  richiediAccessoSchema: vi.fn(async () => ({ modalita: 'ADMIN_SPAZIO' as const })),
  leggiSessione: vi.fn(async () => ({ username: 'anna@alfa.it', email: 'anna@alfa.it' })),
}));

// L'apertura della verifica contabile è materia di `verificheApertura` (che ha
// i suoi test): qui si fissa l'anno, perché è quello che l'azione deve usare
// come fine della serie.
vi.mock('@/lib/verificheApertura', () => ({
  apriVerifica: vi.fn(async () => ({ apertaIl: '2026-11-20', riaperta: true })),
}));

// Il debito accertato dall'amministrativa: è il dato che l'ente ha certificato,
// e la simulazione deve nascerne con quello, non con uno zero.
const leggiDebitoEnteMemorizzato = vi.fn();
vi.mock('@/lib/debitiEnte/memorizzaDebitoEnte', () => ({ leggiDebitoEnteMemorizzato }));

// Le tabelle le crea la prova: qui la provision è un no-op, così il test dice
// esattamente con quale schema lavora.
vi.mock('@/db/provision', () => ({
  assicuraTabelleVerificaAzienda: async () => undefined,
  assicuraTabellaXbrlAzienda: async () => undefined,
  assicuraTabellaSpiegazioniContabili: async () => undefined,
}));

const { salvaSimulazioneContabileAction } = await import('./verificaContabile');
const { leggiFotografiaBase } = await import('@/lib/verificaAzienda/baseFotografia');

const SCHEMA = 'tenant_prova_simulazione_contabile';
const AZIENDA = 7;

const dati = (over: Record<string, number> = {}) => ({
  ricaviVendite: 1000,
  valoreProduzione: 1100,
  costiProduzione: 900,
  costiPersonale: 300,
  salariStipendi: 220,
  oneriSociali: 80,
  ebitda: 250,
  ammortamenti: 50,
  ebit: 200,
  oneriFinanziari: 20,
  utileEsercizio: 130,
  totaleAttivo: 1400,
  attivoCircolante: 900,
  disponibilitaLiquide: 100,
  immobilizzazioni: 500,
  patrimonioNetto: 400,
  totaleDebiti: 800,
  debitiBanche: 300,
  debitiFornitori: 200,
  debitiTributari: 20,
  debitiPrevidenziali: 10,
  passivoCorrente: 600,
  creditiClienti: 350,
  ...over,
});

async function inserisciBilancio(anno: number, over: Record<string, number> = {}) {
  await db.query(
    `INSERT INTO ${SCHEMA}.xbrl_storico_azienda (azienda_id, anno_bilancio, dati_finanziari)
     VALUES ($1,$2,$3)`,
    [AZIENDA, anno, JSON.stringify(dati(over))]
  );
}

async function simulazioni() {
  const r = await db.query(
    `SELECT id, profilo, annualita, debito_ente, colonne, avvertenze, base_per_proposta
       FROM ${SCHEMA}.verifica_azienda_simulazioni
      ORDER BY id ASC`
  );
  return r.rows as {
    id: number;
    profilo: string;
    annualita: number;
    debito_ente: string | number;
    colonne: { anno: number; tipo: string; dati: Record<string, number> }[];
    avvertenze: unknown[];
    base_per_proposta: boolean;
  }[];
}

beforeEach(async () => {
  richiediAccessoAzienda.mockClear();
  leggiDebitoEnteMemorizzato.mockReset();
  leggiDebitoEnteMemorizzato.mockResolvedValue({
    debito: { totale: 152_000, fonte: 'Certificazione dei debiti' },
    memorizzatoIl: '2026-11-17',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  await db.exec(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    CREATE TABLE ${SCHEMA}.xbrl_storico_azienda (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      anno_bilancio INTEGER,
      dati_finanziari JSONB,
      note_fatti TEXT
    );
    CREATE TABLE ${SCHEMA}.verifica_azienda_simulazioni (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      profilo TEXT NOT NULL,
      annualita INTEGER NOT NULL,
      debito_ente NUMERIC(16,2) NOT NULL DEFAULT 0,
      crescita_storica_pct NUMERIC(8,2),
      crescita_applicata_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
      colonne JSONB NOT NULL,
      avvertenze JSONB NOT NULL DEFAULT '[]'::jsonb,
      base_per_proposta BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await inserisciBilancio(2023);
  await inserisciBilancio(2024);
});

describe('salvaSimulazioneContabileAction', () => {
  it('fa nascere la riga come base, con le colonne calcolate e il debito accertato', async () => {
    const esito = await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);

    expect(esito.success).toBe(true);
    expect(esito.salvataIl).toBeTruthy();
    expect(richiediAccessoAzienda).toHaveBeenCalledWith(SCHEMA, AZIENDA);

    const righe = await simulazioni();
    expect(righe).toHaveLength(1);
    const riga = righe[0];
    expect(riga.profilo).toBe('SIMULAZIONE_CONTABILE');
    expect(riga.base_per_proposta).toBe(true);
    // Il debito è quello accertato nell'amministrativa, non lo zero predefinito.
    expect(Number(riga.debito_ente)).toBe(152_000);
    // Le colonne sono quelle del prospetto, già calcolate: storico depositato e
    // annualità costruite fino all'anno della verifica.
    expect(riga.annualita).toBe(riga.colonne.length);
    expect(riga.colonne[0]).toMatchObject({ anno: 2023, tipo: 'STORICO' });
    expect(riga.colonne[1]).toMatchObject({ anno: 2024, tipo: 'STORICO' });
    expect(riga.colonne.at(-1)?.anno).toBe(2026);
    expect(riga.colonne.at(-1)?.tipo).toBe('CALCOLATO');
    expect(Array.isArray(riga.avvertenze)).toBe(true);
  });

  it('la verifica aziendale la legge davvero come fotografia base', async () => {
    await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);

    const base = await leggiFotografiaBase(SCHEMA, AZIENDA);

    expect(base).not.toBeNull();
    expect(base?.profilo).toBe('SIMULAZIONE_CONTABILE');
    expect(base?.colonne.map((c) => c.anno)).toEqual([2023, 2024, 2025, 2026]);
    expect(base?.colonne.map((c) => c.tipo)).toEqual([
      'STORICO',
      'STORICO',
      'CALCOLATO',
      'CALCOLATO',
    ]);
    // I numeri arrivano interi: la riga JSONB si rilegge come l'ha scritta l'azione.
    expect(base?.colonne[0].dati.valoreProduzione).toBe(1100);
    expect(base?.annualita).toBe(4);
  });

  it('una seconda simulazione diventa la base e la prima resta, senza il ruolo', async () => {
    await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);
    const prima = (await simulazioni())[0];

    const esito = await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);
    expect(esito.success).toBe(true);

    const righe = await simulazioni();
    // La memoria storica non si cancella: due righe, una sola base.
    expect(righe).toHaveLength(2);
    expect(righe.filter((r) => r.base_per_proposta)).toHaveLength(1);
    expect(righe[0].base_per_proposta).toBe(false);
    expect(righe[1].base_per_proposta).toBe(true);
    expect(righe[0].id).toBe(prima.id);

    const base = await leggiFotografiaBase(SCHEMA, AZIENDA);
    expect(base?.id).toBe(righe[1].id);
  });

  it('senza bilanci non inventa una simulazione e lo dice', async () => {
    await db.query(`DELETE FROM ${SCHEMA}.xbrl_storico_azienda`);

    const esito = await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);

    expect(esito.success).toBe(false);
    expect(esito.error).toContain('Nessun bilancio XBRL');
    expect(await simulazioni()).toHaveLength(0);
  });

  it('se la guardia rifiuta non scrive nulla', async () => {
    richiediAccessoAzienda.mockRejectedValueOnce(
      new Error('Azienda non assegnata a questo utente.')
    );

    const esito = await salvaSimulazioneContabileAction(SCHEMA, AZIENDA);

    expect(esito.success).toBe(false);
    expect(await simulazioni()).toHaveLength(0);
  });
});
