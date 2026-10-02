'use server';

// Salvataggio e ripristino della CONFIGURAZIONE dello spazio (Parametri di
// Spazio e configurazione collegata) in un file. Serve a ricaricare i
// parametri dopo un azzeramento del database, o a portarli su un altro
// spazio dello stesso tipo. Nessun dato di aziende, scenari, utenti, licenze.
// La logica sta in src/lib/configurazioneSpazio (testata su PGlite).

import { pool } from '@/lib/db';
import {
  assicuraTabellaCategorieTipoDebito,
  assicuraTabellaChecklistModelli,
  assicuraTabellaDebitiEnte,
  assicuraTabellaTipoDebitoConfig,
  assicuraTabellaTracciatiDebitiEnte,
  assicuraTabelleAnagraficaEnte,
  assicuraTabelleParametriSpazio,
  assicuraTabelleVera,
} from '@/db/provision';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { APP_VERSION } from '@/lib/appVersion';
import {
  esportaConfigurazione,
  ripristinaConfigurazione,
  validaFileConfigurazione,
  type Esecutore,
  type EsitoRipristino,
  type FileConfigurazione,
} from '@/lib/configurazioneSpazio/configurazione';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

async function assicuraTutte(nomeSchema: string) {
  await assicuraTabelleParametriSpazio(nomeSchema);
  await assicuraTabellaChecklistModelli(nomeSchema);
  await assicuraTabellaTipoDebitoConfig(nomeSchema);
  await assicuraTabelleAnagraficaEnte(nomeSchema);
  await assicuraTabellaCategorieTipoDebito(nomeSchema);
  await assicuraTabellaDebitiEnte(nomeSchema);
  await assicuraTabellaTracciatiDebitiEnte(nomeSchema);
  await assicuraTabelleVera(nomeSchema);
}

async function datiSpazio(nomeSchema: string) {
  const r = await pool.query(
    `SELECT codice, tipo_spazio, direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
    [nomeSchema]
  );
  const x = r.rows[0] ?? {};
  return {
    codice: String(x.codice ?? nomeSchema),
    tipoSpazio: x.tipo_spazio ? String(x.tipo_spazio) : null,
    direttrici: x.direttrici_ente_strutturate ?? null,
  };
}

export async function esportaConfigurazioneSpazioAction(nomeSchema: string): Promise<{
  success: boolean;
  contenuto?: string;
  nomeFile?: string;
  error?: string;
}> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTutte(nomeSchema);
    const sp = await datiSpazio(nomeSchema);
    const esegui: Esecutore = async (sql, params) => (await pool.query(sql, params)).rows;
    const file = await esportaConfigurazione(esegui, nomeSchema, {
      codice: sp.codice,
      tipoSpazio: sp.tipoSpazio,
      appVersion: APP_VERSION,
      direttriciEnteStrutturate: sp.direttrici,
    });
    const data = new Date().toISOString().slice(0, 10);
    return {
      success: true,
      contenuto: JSON.stringify(file, null, 1),
      nomeFile: `configurazione-${sp.codice}-${data}.json`,
    };
  } catch (error: unknown) {
    console.error('[esportaConfigurazioneSpazioAction]', error);
    return { success: false, error: `Esportazione non riuscita: ${(error as Error).message}` };
  }
}

export async function ripristinaConfigurazioneSpazioAction(
  nomeSchema: string,
  contenuto: string,
  opzioni: { accettaTipoDiverso?: boolean } = {}
): Promise<{
  success: boolean;
  esito?: EsitoRipristino;
  /** Il file viene da uno spazio di tipo diverso: serve una conferma esplicita. */
  tipoDiverso?: { file: string | null; spazio: string | null };
  error?: string;
}> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    let grezzo: unknown;
    try {
      grezzo = JSON.parse(contenuto);
    } catch {
      return { success: false, error: 'Il file non è un JSON leggibile.' };
    }
    const errore = validaFileConfigurazione(grezzo);
    if (errore) return { success: false, error: errore };
    const file = grezzo as FileConfigurazione;
    const sp = await datiSpazio(nomeSchema);
    if (file.spazio?.tipoSpazio && sp.tipoSpazio && file.spazio.tipoSpazio !== sp.tipoSpazio) {
      if (!opzioni.accettaTipoDiverso)
        return {
          success: false,
          tipoDiverso: { file: file.spazio.tipoSpazio, spazio: sp.tipoSpazio },
        };
    }
    await assicuraTutte(nomeSchema);

    const client = await pool.connect();
    const esegui: Esecutore = async (sql, params) => (await client.query(sql, params)).rows;
    try {
      await client.query('BEGIN');
      const esito = await ripristinaConfigurazione(esegui, nomeSchema, file);
      if (file.globale && 'direttriciEnteStrutturate' in file.globale) {
        await client.query(
          `UPDATE public.spazi SET direttrici_ente_strutturate = $1 WHERE nome_schema = $2`,
          [
            file.globale.direttriciEnteStrutturate === null
              ? null
              : JSON.stringify(file.globale.direttriciEnteStrutturate),
            nomeSchema,
          ]
        );
      }
      await client.query('COMMIT');
      return { success: true, esito };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    console.error('[ripristinaConfigurazioneSpazioAction]', error);
    return {
      success: false,
      error: `Ripristino non riuscito, nessuna modifica applicata: ${(error as Error).message}`,
    };
  }
}
