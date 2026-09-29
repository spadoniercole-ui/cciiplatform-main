// src/lib/blobStore.ts
//
// Astrazione dello storage dei file. Cloud: Vercel Blob. Edizione PORTABLE
// ed edizione server (ARCHIVIO_FILE_DIR): filesystem locale, vedi
// cartellaArchivioLocale in edizioneServer.ts. Stesse firme usate nel
// codice (put/get/del), così i punti che le usano non cambiano logica. Come
// nel cloud, i file caricati vengono comunque eliminati dopo l'elaborazione:
// questa è solo la loro sede temporanea.
import { put as vput, get as vget, del as vdel } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cartellaArchivioLocale } from './edizioneServer';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CARTELLA_LOCALE = cartellaArchivioLocale();
const LOCALE = CARTELLA_LOCALE !== null;
const PREFISSO = 'localblob:';

function cartellaBlob(): string {
  fs.mkdirSync(CARTELLA_LOCALE!, { recursive: true });
  return CARTELLA_LOCALE!;
}

function idDaUrl(url: string): string {
  const id = url.startsWith(PREFISSO) ? url.slice(PREFISSO.length) : path.basename(url);
  // Solo file dentro la cartella dei blob: niente separatori né "..".
  if (!id || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error('Identificativo di file non valido.');
  }
  return id;
}

async function aBuffer(body: any): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body.arrayBuffer === 'function') return Buffer.from(await body.arrayBuffer());
  return Buffer.from(body);
}

export async function put(name: string, body: any, opts?: any): Promise<any> {
  if (!LOCALE) return vput(name, body, opts);
  const suffix = opts?.addRandomSuffix ? '-' + crypto.randomBytes(6).toString('hex') : '';
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = `${crypto.randomUUID()}${suffix}__${safe}`;
  fs.writeFileSync(path.join(cartellaBlob(), id), await aBuffer(body));
  const url = PREFISSO + id;
  return { url, downloadUrl: url, pathname: id, contentType: opts?.contentType };
}

export async function get(url: string, opts?: any): Promise<any> {
  if (!LOCALE) return vget(url, opts);
  const p = path.join(cartellaBlob(), idDaUrl(url));
  if (!fs.existsSync(p)) return { statusCode: 404, stream: null };
  const buf = fs.readFileSync(p);
  return { statusCode: 200, stream: new Blob([new Uint8Array(buf)]).stream() };
}

export async function del(url: string | string[]): Promise<any> {
  if (!LOCALE) return vdel(url as any);
  const lista = Array.isArray(url) ? url : [url];
  for (const u of lista) {
    try {
      fs.unlinkSync(path.join(cartellaBlob(), idDaUrl(u)));
    } catch {
      /* già assente: ok */
    }
  }
}
