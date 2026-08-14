// src/instrumentation.ts
//
// Hook di avvio del server Next.js (eseguito una volta sola). Nell'edizione
// PORTABLE inizializza qui il database embedded PGlite (carica il WASM,
// decifra il DB dal file cifrato o crea+provisiona al primo avvio), così è
// pronto prima di servire qualunque richiesta. Nel percorso cloud non fa
// nulla.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.PORTABLE === '1') {
    const { initPortableDb } = await import('@/lib/portableDb');
    await initPortableDb();
  }
}
