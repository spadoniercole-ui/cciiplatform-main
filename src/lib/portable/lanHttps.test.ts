import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { generaCertificato, inoltra } from '../../../portable/lan-https.mjs';

// Proxy HTTPS della modalità rete locale (portable/lan-https.mjs): certificato
// autofirmato e inoltro verso il server Next interno.

const { cert, key } = generaCertificato(['pc-studio', 'localhost'], ['192.168.1.20']);
let next: http.Server;
let proxy: https.Server;
let portaProxy = 0;
let ricevute: { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }[] =
  [];

function chiama(opzioni: https.RequestOptions, corpo?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request(
      { host: '127.0.0.1', port: portaProxy, rejectUnauthorized: false, ...opzioni },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

beforeAll(async () => {
  next = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      ricevute.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'text/plain', 'set-cookie': 'session_token=x; Secure' });
      res.end('ok da next');
    });
  });
  await new Promise<void>((r) => next.listen(0, '127.0.0.1', r));
  const portaNext = (next.address() as AddressInfo).port;
  proxy = https.createServer({ cert, key }, (req, res) => inoltra(req, res, portaNext));
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  portaProxy = (proxy.address() as AddressInfo).port;
});

afterAll(() => {
  next.close();
  proxy.close();
});

describe('certificato autofirmato', () => {
  it('copre nome del PC, localhost e gli IP della rete', () => {
    const x509 = new crypto.X509Certificate(cert);
    expect(x509.subjectAltName).toContain('DNS:pc-studio');
    expect(x509.subjectAltName).toContain('DNS:localhost');
    expect(x509.subjectAltName).toContain('IP Address:192.168.1.20');
    expect(x509.subjectAltName).toContain('IP Address:127.0.0.1');
    expect(new Date(x509.validTo).getTime()).toBeGreaterThan(Date.now() + 4 * 365 * 86400e3);
    expect(x509.checkPrivateKey(crypto.createPrivateKey(key))).toBe(true);
  });
});

describe('inoltro verso Next', () => {
  it("mantiene l'Host originale (serve alle server action) e segnala HTTPS", async () => {
    ricevute = [];
    const r = await chiama(
      {
        path: '/spazio/X?a=1',
        method: 'POST',
        headers: {
          host: 'pc-studio:4443',
          origin: 'https://pc-studio:4443',
          'content-type': 'text/plain',
        },
      },
      'corpo della richiesta'
    );
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok da next');
    expect(ricevute).toHaveLength(1);
    expect(ricevute[0].method).toBe('POST');
    expect(ricevute[0].url).toBe('/spazio/X?a=1');
    expect(ricevute[0].body).toBe('corpo della richiesta');
    expect(ricevute[0].headers.host).toBe('pc-studio:4443');
    expect(ricevute[0].headers.origin).toBe('https://pc-studio:4443');
    expect(ricevute[0].headers['x-forwarded-proto']).toBe('https');
    expect(ricevute[0].headers['x-forwarded-host']).toBe('pc-studio:4443');
  });

  it('se Next non risponde, pagina 502 comprensibile', async () => {
    const spento = https.createServer({ cert, key }, (req, res) => inoltra(req, res, 1));
    await new Promise<void>((r) => spento.listen(0, '127.0.0.1', r));
    const porta = (spento.address() as AddressInfo).port;
    const r = await new Promise<{ status: number; body: string }>((resolve) => {
      https.get({ host: '127.0.0.1', port: porta, rejectUnauthorized: false }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
    });
    spento.close();
    expect(r.status).toBe(502);
    expect(r.body).toContain('non risponde ancora');
  });
});
