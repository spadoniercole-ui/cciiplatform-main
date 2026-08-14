/** @type {import('next').NextConfig} */
const PORTABLE = process.env.PORTABLE === '1';

const nextConfig = {
  // Edizione PORTABLE: build "standalone" (server.js autoconsistente da
  // avviare con Node imbarcato sulla chiavetta) e inclusione forzata degli
  // asset WASM/dati di PGlite nel tracing (non sono file JS, il tracing di
  // default può non seguirli tramite import dinamico).
  ...(PORTABLE
    ? {
        output: 'standalone',
        // PGlite carica i propri asset WASM risolvendoli da node_modules:
        // NON va inglobato nel bundle webpack (romperebbe la risoluzione
        // degli asset), ma tenuto esterno e richiesto a runtime.
        serverExternalPackages: ['@electric-sql/pglite'],
        outputFileTracingIncludes: {
          '/**': ['./node_modules/@electric-sql/pglite/**'],
        },
        // In locale non serve l'ottimizzazione immagini: disattivandola si
        // evita la dipendenza da `sharp` (binari nativi per-OS) — così il
        // pacchetto costruito su un OS gira anche su un altro.
        images: { unoptimized: true },
      }
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
