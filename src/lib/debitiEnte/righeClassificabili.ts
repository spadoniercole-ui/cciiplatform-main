// LE RIGHE DELLA CERTIFICAZIONE CHE ENTRANO NELLA CLASSIFICAZIONE.
//
// La stessa cifra una volta sola: se il file descrive lo stesso debito due
// volte («F24 non presentato» e «Denunce non trasmesse», stesso periodo e
// stesso importo) la seconda riga non entra nei conti (vedi `duplicatiVera`).
// La lettura stava dentro una server action, e serviva anche alla fotografia
// della verifica azienda: due copie della stessa query sono due occasioni di
// divergere, quindi sta qui.
//
// Il periodo si legge: senza, il confronto fra doppie scritture non ha la
// chiave che gli serve (periodo + importo) e non esclude nulla.

import { pool } from '@/lib/db';
import { denunceDuplicateVera, insiemeEsclusi } from '@/lib/debitiEnte/duplicatiVera';
import type { RigaDaClassificare } from '@/lib/debitiEnte/classificazioneCredito';

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const testo = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Le righe della certificazione dell'azienda, già senza le doppie scritture. */
export async function leggiRigheClassificabili(
  nomeSchema: string,
  aziendaId: number
): Promise<RigaDaClassificare[]> {
  const esito = await pool
    .query(
      `SELECT voce, importo, stato, periodo, contributi, sanzioni, ambito
         FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const escluse = insiemeEsclusi(
    denunceDuplicateVera(
      esito.rows.map((r) => ({
        voce: testo(r.voce),
        importo: Number(r.importo ?? 0),
        stato: r.stato === null || r.stato === undefined ? undefined : testo(r.stato),
        periodo: r.periodo === null || r.periodo === undefined ? undefined : testo(r.periodo),
        contributi: numero(r.contributi),
        sanzioni: numero(r.sanzioni),
      }))
    )
  );

  return esito.rows
    .filter((_, i) => !escluse.has(i))
    .map((r) => ({
      voce: testo(r.voce),
      importo: Number(r.importo ?? 0),
      stato: testo(r.stato),
      contributi: numero(r.contributi),
      sanzioni: numero(r.sanzioni),
      ambito:
        r.ambito === 'AGENTE_RISCOSSIONE' ? ('AGENTE_RISCOSSIONE' as const) : ('INPS' as const),
    }));
}
