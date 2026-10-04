import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const PORTABLE = process.env.PORTABLE === '1';
// Edizione server (Docker): build standalone, ma con l'ottimizzazione immagini
// di Next attiva come nel cloud. Vedi Dockerfile.
const STANDALONE = process.env.NEXT_OUTPUT_STANDALONE === '1';
// Radice del progetto, fissata per le build standalone. Se Next trova un altro
// package-lock.json in una cartella superiore (es. nella cartella utente di
// Windows) sceglie quella come radice e mette server.js in
// .next/standalone/<nome-cartella>/ invece che in .next/standalone/: il
// pacchetto portable restava senza server.js e il launcher non partiva.
const RADICE_PROGETTO = path.dirname(fileURLToPath(import.meta.url));

// Intestazioni di sicurezza su ogni risposta, in tutte e tre le edizioni
// (cloud, server dell'ente, portable). La piattaforma non carica nulla da
// altri domini nel browser: script, stili, font e chiamate restano su 'self'.
// 'unsafe-inline' per gli script serve agli script di avvio che Next inserisce
// nella pagina; 'unsafe-eval' solo in sviluppo (ricaricamento a caldo).
// frame-ancestors 'none' impedisce di incorniciare la piattaforma in un'altra
// pagina (clickjacking). HSTS conta solo su HTTPS: su http://127.0.0.1 della
// portable il browser lo ignora.
const SVILUPPO = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${SVILUPPO ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const INTESTAZIONI_SICUREZZA = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig = {
  // Niente «X-Powered-By: Next.js»: non serve dire a chi bussa che cosa gira.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: INTESTAZIONI_SICUREZZA }];
  },
  // Edizione PORTABLE: build "standalone" (server.js autoconsistente da
  // avviare con Node imbarcato sulla chiavetta) e inclusione forzata degli
  // asset WASM/dati di PGlite nel tracing (non sono file JS, il tracing di
  // default può non seguirli tramite import dinamico).
  // PGlite carica i propri asset WASM risolvendoli da node_modules: NON va
  // inglobato nel bundle webpack (romperebbe la risoluzione degli asset), ma
  // tenuto esterno e richiesto a runtime.
  //
  // Vale per ENTRAMBE le edizioni, non solo per la portable. Nella portable
  // PGlite È il database; nel cloud serve alla verifica preventiva del
  // ripristino, che esegue il backup su un database temporaneo prima di
  // toccare quello vero. Tenendo questa configurazione dentro il ramo
  // PORTABLE, sul cloud l'import falliva a runtime e la Server Action moriva
  // senza risposta: il browser mostrava "An unexpected response was received
  // from the server", senza alcuna indicazione della causa, e proprio sul
  // pulsante che precede la cancellazione del database.
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/@electric-sql/pglite/**'],
  },
  ...(PORTABLE
    ? {
        output: 'standalone',
        outputFileTracingRoot: RADICE_PROGETTO,
        // In locale non serve l'ottimizzazione immagini: disattivandola si
        // evita la dipendenza da `sharp` (binari nativi per-OS) — così il
        // pacchetto costruito su un OS gira anche su un altro.
        images: { unoptimized: true },
      }
    : STANDALONE
      ? { output: 'standalone', outputFileTracingRoot: RADICE_PROGETTO }
      : {}),
  experimental: {
    // Default Next.js per le Server Actions: 1MB — troppo poco per PDF
    // reali (relazioni, business plan, perizie allegate a una proposta).
    // Alzato per la Simulazione Ricevente, che carica più documenti
    // insieme in una sola chiamata.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  eslint: {
    // In precedenza: ignoreDuringBuilds: true.
    // Per mesi il progetto ha potuto accumulare componenti che non
    // compilavano (import mai definiti, funzioni chiamate ma mai
    // dichiarate) perché nessuna build li avrebbe mai segnalati. Ora la
    // build fallisce se il lint fallisce: è il comportamento corretto.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // In precedenza: ignoreBuildErrors: true. Stessa motivazione sopra.
    // Riattivandolo, il primo `npm run build` dopo questa modifica può
    // rivelare errori di tipo preesistenti in parti del progetto non
    // toccate in questa sessione: è previsto, non un effetto collaterale
    // da annullare disattivando di nuovo il controllo.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
