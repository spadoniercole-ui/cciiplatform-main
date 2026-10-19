// src/lib/archil.ts
//
// Archil: disco persistente per i file che devono sopravvivere al processo che
// li ha creati (container effimeri, riavvii, deploy). Solo codice server:
// ARCHIL_API_KEY non deve mai finire nel bundle del browser, quindi questo
// modulo non va importato da componenti client.
//
// Variabili d'ambiente (vedi .env.example):
//   ARCHIL_API_KEY  chiave API, inizia con "key-" (obbligatoria)
//   ARCHIL_REGION   regione del disco; predefinita aws-us-east-1
//   ARCHIL_DISK_ID  id del disco (dsk-…), usato da discoArchil()
import * as archil from 'disk';
import type { Disk, ExecResult } from 'disk';

export type { Disk, ExecResult };

const REGIONE_PREDEFINITA = 'aws-us-east-1';

function testo(v: string | undefined): string {
  return (v || '').trim();
}

/** Regione effettiva: ARCHIL_REGION, altrimenti aws-us-east-1. */
export function regioneArchil(env: NodeJS.ProcessEnv = process.env): string {
  return testo(env.ARCHIL_REGION) || REGIONE_PREDEFINITA;
}

/**
 * Configura l'SDK con la chiave e la regione dell'ambiente. Si può chiamare
 * più volte: l'SDK conserva l'ultima configurazione.
 */
export function configuraArchil(env: NodeJS.ProcessEnv = process.env): void {
  const apiKey = testo(env.ARCHIL_API_KEY);
  if (!apiKey) {
    throw new Error(
      'ARCHIL_API_KEY non impostata: aggiungerla a .env.local (o all’ambiente del server).'
    );
  }
  archil.configure({ apiKey, region: regioneArchil(env) });
}

/** Id del disco configurato; errore chiaro se ARCHIL_DISK_ID manca. */
export function idDiscoArchil(env: NodeJS.ProcessEnv = process.env): string {
  const id = testo(env.ARCHIL_DISK_ID);
  if (!id) {
    throw new Error('ARCHIL_DISK_ID non impostato: indicare l’id del disco Archil (dsk-…).');
  }
  return id;
}

/** Disco indicato da ARCHIL_DISK_ID. */
export async function discoArchil(env: NodeJS.ProcessEnv = process.env): Promise<Disk> {
  configuraArchil(env);
  return archil.getDisk(idDiscoArchil(env));
}

/** Crea un disco nuovo. Restituisce solo id e nome, mai il mount token. */
export async function creaDiscoArchil(
  nome: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ id: string; nome: string }> {
  configuraArchil(env);
  const { disk } = await archil.createDisk({ name: nome });
  // `token` è monouso e non va registrato né stampato.
  return { id: disk.id, nome: disk.name };
}

/** Esegue un comando sul disco (montato in /mnt/data, directory di lavoro). */
export async function eseguiSuDisco(
  comando: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ExecResult> {
  const disco = await discoArchil(env);
  return disco.exec(comando);
}

/** Scrive un file sul disco (percorso relativo alla radice del disco). */
export async function scriviFileSuDisco(
  percorso: string,
  contenuto: string | Uint8Array,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const disco = await discoArchil(env);
  await disco.putObject(percorso, contenuto);
}

/** Legge un file dal disco come testo UTF-8. */
export async function leggiFileSuDisco(
  percorso: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const disco = await discoArchil(env);
  const dati = await disco.getObject(percorso);
  return new TextDecoder().decode(dati);
}
