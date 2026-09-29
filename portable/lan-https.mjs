// portable/lan-https.mjs
//
// Modalità RETE LOCALE dell'edizione portable: rende la piattaforma
// raggiungibile dagli altri PC dell'ufficio, in HTTPS.
//
// Il server Next resta in ascolto SOLO su 127.0.0.1 (non raggiungibile dalla
// rete); questo piccolo proxy ascolta su tutte le interfacce, cifra il
// traffico con TLS e inoltra le richieste a Next. Nessun programma esterno da
// installare: solo Node e node-forge (JavaScript puro) per il certificato.
//
// Certificato:
//   - se in <dati>/tls ci sono cert.pem e key.pem (es. forniti dall'IT
//     dell'ente, firmati dalla CA interna) si usano quelli;
//   - altrimenti al primo avvio se ne genera uno autofirmato (validità 5
//     anni) per il nome del PC, localhost e gli indirizzi IP attuali. Il
//     browser mostrerà un avviso la prima volta: va accettato su ogni PC.
//
// Variabili d'ambiente (impostate da Avvia-CCII.bat):
//   PORTABLE_DATA_DIR      cartella dati (qui la sottocartella tls/)
//   PORTABLE_LAN_PORTA     porta HTTPS esposta in rete (predefinita 4443)
//   PORT                   porta interna del server Next (predefinita 4028)

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import forge from 'node-forge';

const PORTA_LAN = Number(process.env.PORTABLE_LAN_PORTA || 4443);
const PORTA_NEXT = Number(process.env.PORT || 4028);
const CARTELLA_DATI = process.env.PORTABLE_DATA_DIR || path.join(process.cwd(), 'dati');
const CARTELLA_TLS = path.join(CARTELLA_DATI, 'tls');

/** Indirizzi IPv4 della macchina sulle reti locali (esclusi loopback). */
export function indirizziLocali() {
  const out = [];
  for (const schede of Object.values(os.networkInterfaces())) {
    for (const s of schede || []) {
      if (s.family === 'IPv4' && !s.internal) out.push(s.address);
    }
  }
  return out;
}

/** Certificato autofirmato per il nome del PC, localhost e gli IP locali. */
export function generaCertificato(nomi, ip) {
  const chiavi = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chiavi.publicKey;
  cert.serialNumber = '01' + crypto.randomBytes(15).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000);
  const soggetto = [
    { name: 'commonName', value: nomi[0] },
    { name: 'organizationName', value: 'CCIIPlatform (portable, rete locale)' },
  ];
  cert.setSubject(soggetto);
  cert.setIssuer(soggetto);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        ...nomi.map((value) => ({ type: 2, value })),
        ...['127.0.0.1', ...ip].map((ipAddr) => ({ type: 7, ip: ipAddr })),
      ],
    },
  ]);
  cert.sign(chiavi.privateKey, forge.md.sha256.create());
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(chiavi.privateKey),
  };
}

function caricaOCreaCertificato() {
  const fileCert = path.join(CARTELLA_TLS, 'cert.pem');
  const fileKey = path.join(CARTELLA_TLS, 'key.pem');
  if (fs.existsSync(fileCert) && fs.existsSync(fileKey)) {
    return { cert: fs.readFileSync(fileCert), key: fs.readFileSync(fileKey), nuovo: false };
  }
  fs.mkdirSync(CARTELLA_TLS, { recursive: true });
  const nome = os.hostname().toLowerCase();
  const { cert, key } = generaCertificato([nome, 'localhost'], indirizziLocali());
  fs.writeFileSync(fileCert, cert);
  fs.writeFileSync(fileKey, key, { mode: 0o600 });
  return { cert, key, nuovo: true };
}

// Intestazioni hop-by-hop: non vanno inoltrate da un proxy (RFC 9110).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
]);

/**
 * Inoltra una richiesta a Next. L'intestazione Host resta quella originale:
 * Next confronta l'Origin delle server action con l'host della richiesta.
 */
export function inoltra(req, res, portaNext = PORTA_NEXT) {
  const intestazioni = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) intestazioni[k] = v;
  }
  intestazioni['x-forwarded-proto'] = 'https';
  intestazioni['x-forwarded-host'] = req.headers.host || '';
  intestazioni['x-forwarded-for'] = req.socket.remoteAddress || '';

  const verso = http.request(
    {
      host: '127.0.0.1',
      port: portaNext,
      method: req.method,
      path: req.url,
      headers: intestazioni,
    },
    (risposta) => {
      const out = {};
      for (const [k, v] of Object.entries(risposta.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
      }
      res.writeHead(risposta.statusCode || 502, out);
      risposta.pipe(res);
    }
  );
  verso.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
    }
    res.end(
      '<!doctype html><meta charset="utf-8"><title>Server in avvio</title>' +
        '<p style="font-family:sans-serif">Il server della piattaforma non risponde ancora: ' +
        'attendi qualche secondo e ricarica la pagina.</p>'
    );
  });
  req.pipe(verso);
}

function avvia() {
  const { cert, key, nuovo } = caricaOCreaCertificato();
  const server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, (req, res) =>
    inoltra(req, res)
  );
  server.on('clientError', (_err, socket) => socket.destroy());
  server.listen(PORTA_LAN, '0.0.0.0', () => {
    const ip = indirizziLocali();
    console.log('');
    console.log(' ============================================================');
    console.log('  RETE LOCALE attiva (HTTPS). Dagli altri PC apri:');
    for (const a of [os.hostname().toLowerCase(), ...ip]) {
      console.log(`     https://${a}:${PORTA_LAN}`);
    }
    console.log('');
    console.log(
      nuovo
        ? '  Certificato autofirmato creato ora in: ' + CARTELLA_TLS
        : '  Certificato: ' + CARTELLA_TLS
    );
    console.log("  Al primo accesso il browser mostra un avviso: e' atteso, va");
    console.log('  accettato una volta su ogni PC (o installa il certificato).');
    console.log(' ============================================================');
    console.log('');
  });
}

// Avvio solo se eseguito direttamente (non quando importato dai test).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('lan-https.mjs')) {
  avvia();
}
