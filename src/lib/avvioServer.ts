// src/lib/avvioServer.ts
//
// Avvio dell'edizione server on-premise (EDIZIONE_SERVER=1), chiamato da
// src/instrumentation.ts. Attende che Postgres accetti connessioni (con
// Docker Compose il database può essere ancora in avvio) e crea le tabelle
// globali di sistema, così il primo accesso del Superadmin trova già tutto.
// Le istruzioni sono le stesse, idempotenti, che il resto del codice esegue
// a richiesta: su un database già in uso non cambiano nulla.

/** Ripete `azione` finché riesce, fino a `tentativi` volte, con `attesaMs` tra l'una e l'altra. */
export async function conRiprova<T>(
  azione: () => Promise<T>,
  tentativi: number,
  attesaMs: number,
  attendi: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<T> {
  let ultimoErrore: unknown;
  for (let i = 1; i <= tentativi; i++) {
    try {
      return await azione();
    } catch (e) {
      ultimoErrore = e;
      if (i < tentativi) {
        console.warn(
          `[avvio] database non ancora raggiungibile (tentativo ${i}/${tentativi}): ${(e as Error).message}`
        );
        await attendi(attesaMs);
      }
    }
  }
  throw ultimoErrore;
}

export async function preparaDatabaseServer(): Promise<void> {
  const { pool } = await import('@/lib/db');
  await conRiprova(() => pool.query('SELECT 1'), 30, 2000);

  const et = await import('@/db/ensureTables');
  await et.assicuraTabellaSessioni();
  await et.assicuraTabelleSpazi();
  await et.assicuraIndiceAdminSpazio();
  await et.assicuraIndiceUtenteSpazio();
  await et.assicuraTabellaLicenze();
  await et.assicuraTabelleMfa();
  console.log('[avvio] edizione server: database pronto.');
}
