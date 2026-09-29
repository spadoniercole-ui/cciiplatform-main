// src/instrumentation.ts
//
// Hook di avvio del server Next.js (eseguito una volta sola). Nell'edizione
// PORTABLE inizializza qui il database embedded PGlite (carica il WASM,
// decifra il DB dal file cifrato o crea+provisiona al primo avvio), così è
// pronto prima di servire qualunque richiesta. Nell'edizione server
// (EDIZIONE_SERVER=1) crea le tabelle globali di sistema su un database
// appena installato. Nel percorso cloud non fa nulla.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.PORTABLE === '1') {
    const { initPortableDb } = await import('@/lib/portableDb');
    await initPortableDb();
  } else if (process.env.EDIZIONE_SERVER === '1') {
    const { preparaDatabaseServer } = await import('@/lib/avvioServer');
    await preparaDatabaseServer();
  }
}
