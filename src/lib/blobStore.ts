// src/lib/blobStore.ts
//
// Astrazione dello storage dei file. Cloud: Vercel Blob. Edizione PORTABLE:
// filesystem locale (cartella dati sulla chiavetta). Stesse firme usate nel
// codice (put/get/del), così i punti che le usano non cambiano logica. Come
// nel cloud, i file caricati vengono comunque eliminati dopo l'elaborazione:
// questa è solo la loro sede temporanea.
import { put as vput, get as vget, del as vdel } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PORTABLE = process.env.PORTABLE === '1';
const PREFISSO = 'localblob:';

function cartellaBlob(): string {
  const base = process.env.PORTABLE_DATA_DIR || path.join(process.cwd(), 'dati');
  const d = path.join(base, 'blobs');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function idDaUrl(url: string): string {
  return url.startsWith(PREFISSO) ? url.slice(PREFISSO.length) : path.basename(url);
}

async function aBuffer(body: any): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body.arrayBuffer === 'function') return Buffer.from(await body.arrayBuffer());
  return Buffer.from(body);
}

export async function put(name: string, body: any, opts?: any): Promise<any> {
  if (!PORTABLE) return vput(name, body, opts);
  const suffix = opts?.addRandomSuffix ? '-' + crypto.randomBytes(6).toString('hex') : '';
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = `${crypto.randomUUID()}${suffix}__${safe}`;
  fs.writeFileSync(path.join(cartellaBlob(), id), await aBuffer(body));
  const url = PREFISSO + id;
  return { url, downloadUrl: url, pathname: id, contentType: opts?.contentType };
}

export async function get(url: string, opts?: any): Promise<any> {
  if (!PORTABLE) return vget(url, opts);
  const p = path.join(cartellaBlob(), idDaUrl(url));
  if (!fs.existsSync(p)) return { statusCode: 404, stream: null };
  const buf = fs.readFileSync(p);
  return { statusCode: 200, stream: new Blob([new Uint8Array(buf)]).stream() };
}

export async function del(url: string | string[]): Promise<any> {
  if (!PORTABLE) return vdel(url as any);
  const lista = Array.isArray(url) ? url : [url];
  for (const u of lista) {
    try {
      fs.unlinkSync(path.join(cartellaBlob(), idDaUrl(u)));
    } catch {
      /* già assente: ok */
    }
  }
}
