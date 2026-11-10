// LA MEMORIZZAZIONE DEL DEBITO, LATO SERVER.
//
// Due funzioni sole: `memorizzaDebitoEnte` legge gli archivi dell'ente per
// l'azienda (certificazione dei debiti, altrimenti posizioni del triage) e
// scrive la cifra nella tabella `debiti_ente_memorizzati`; `leggiDebitoEnteMemorizzato`
// la rilegge. La regola di che cosa è debito e che cosa non lo è sta in
// `memorizzazione.ts`, che è pura e ha i suoi test.
//
// Perché una tabella e non un ricalcolo: la verifica amministrativa è un atto
// concluso. Il numero che ha prodotto resta quello, anche se domani si importa
// una certificazione diversa; la contabile deve leggere il dato della verifica,
// non l'ultimo file capitato. Una nuova memorizzazione sostituisce la
// precedente e ne dichiara la data, quindi la cifra resta ricostruibile.
//
// Nessuna guardia di autorizzazione qui: le azioni chiamano questo modulo dopo
// aver verificato il chiamante.

import { pool } from '@/lib/db';
import { assicuraTabellaDebitoEnteMemorizzato, assicuraTabelleVera } from '@/db/provision';
import {
  snapshotDebitoEnte,
  snapshotDebitoEnteDaTriage,
  type SnapshotDebitoEnte,
} from '@/lib/ponte/debitoEnte';
import type { DebitoEntePonte } from '@/lib/ponte/types';
import type { RigaVera, TrattamentoVera } from './veraImport';
import type { StatoDuplicatoVera } from './duplicatiVera';
import { debitoDaMemorizzare, type DebitoMemorizzato } from './memorizzazione';

// `pg` restituisce le colonne NUMERIC come STRINGHE, non come numeri: scartare
// tutto ciò che non è già un number trasformava ogni importo in zero, e la
// verifica non trovava mai un debito da memorizzare.
const numero = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/** Gli anni di bilancio in archivio, dal più recente: servono all'aggancio. */
export async function anniBilancioAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<number[]> {
  try {
    const risposta = await pool.query(
      `SELECT DISTINCT anno_bilancio FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL`,
      [aziendaId]
    );
    return risposta.rows.map((r) => Number(r.anno_bilancio)).filter((n) => Number.isFinite(n));
  } catch {
    // Nessun bilancio caricato: la contabile resta da costruire.
    return [];
  }
}

/**
 * Il debito grezzo dagli archivi: la certificazione dei debiti e, se quella
 * non porta una base certa, le posizioni del triage. Ogni lettura è
 * indipendente da quella dell'altra tabella.
 */
export async function leggiSnapshotDebito(
  nomeSchema: string,
  aziendaId: number
): Promise<{ certificazione: SnapshotDebitoEnte | null; triage: DebitoEntePonte | null }> {
  let certificazione: SnapshotDebitoEnte | null = null;
  try {
    const risposta = await pool.query(
      `SELECT id, sezione, ambito, voce, importo, contributi, sanzioni, categoria, stato,
              trattamento, periodo, duplicato_stato
         FROM "${nomeSchema}".debiti_vera
        WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    );
    const righe: RigaVera[] = risposta.rows.map((r) => ({
      id: Number(r.id),
      sezione: String(r.sezione ?? ''),
      ambito: (r.ambito ?? 'INPS') as RigaVera['ambito'],
      voce: String(r.voce ?? ''),
      importo: numero(r.importo),
      categoria: String(r.categoria ?? ''),
      stato: String(r.stato ?? ''),
      periodo: r.periodo ? String(r.periodo) : undefined,
      trattamento: String(r.trattamento ?? 'potenziale') as TrattamentoVera,
      contributi: r.contributi === null || r.contributi === undefined ? null : numero(r.contributi),
      sanzioni: r.sanzioni === null || r.sanzioni === undefined ? null : numero(r.sanzioni),
      duplicatoStato: (r.duplicato_stato ?? '') as StatoDuplicatoVera | '',
    }));
    if (righe.length > 0) certificazione = snapshotDebitoEnte(righe);
  } catch {
    // Nessuna certificazione: si prova col triage.
  }

  let triage: DebitoEntePonte | null = null;
  if (!certificazione || certificazione.totale === 0) {
    try {
      const risposta = await pool.query(
        `SELECT descrizione, categoria, importo_anno_corrente
           FROM "${nomeSchema}".debiti_triage
          WHERE azienda_id = $1 AND importo_anno_corrente IS NOT NULL
          ORDER BY categoria, id`,
        [aziendaId]
      );
      triage = snapshotDebitoEnteDaTriage(
        risposta.rows.map((r) => ({
          categoria: String(r.categoria ?? ''),
          descrizione: String(r.descrizione ?? ''),
          importo:
            r.importo_anno_corrente === null || r.importo_anno_corrente === undefined
              ? null
              : numero(r.importo_anno_corrente),
        }))
      );
    } catch {
      // Tabella assente: il debito resta da acquisire.
    }
  }

  return { certificazione, triage };
}

/**
 * Scrive il debito dell'azienda. Restituisce null quando non c'è nulla di
 * memorizzabile: in quel caso la riga precedente — se c'è — resta com'era.
 * È il comportamento giusto per il rinnovo esplicito (un archivio momentaneamente
 * vuoto non deve cancellare una cifra già consegnata). Chi invece deve tenere la
 * memorizzazione allineata alla verifica corrente usa `allineaDebitoEnteMemorizzato`.
 */
export async function memorizzaDebitoEnte(
  nomeSchema: string,
  aziendaId: number
): Promise<DebitoMemorizzato | null> {
  await assicuraTabellaDebitoEnteMemorizzato(nomeSchema);
  await assicuraTabelleVera(nomeSchema);

  const { certificazione, triage } = await leggiSnapshotDebito(nomeSchema, aziendaId);
  const debito = debitoDaMemorizzare(certificazione, triage);
  if (!debito) return null;

  await pool.query(
    `INSERT INTO "${nomeSchema}".debiti_ente_memorizzati
       (azienda_id, totale, contabilizzato, da_contabilizzare, segnalato, contributi,
        sanzioni, crediti_agente, righe, righe_segnalate, ripartito,
        sanzioni_non_distinte, fonte, fonte_tipo, memorizzato_il)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (azienda_id) DO UPDATE
       SET totale = EXCLUDED.totale,
           contabilizzato = EXCLUDED.contabilizzato,
           da_contabilizzare = EXCLUDED.da_contabilizzare,
           segnalato = EXCLUDED.segnalato,
           contributi = EXCLUDED.contributi,
           sanzioni = EXCLUDED.sanzioni,
           crediti_agente = EXCLUDED.crediti_agente,
           righe = EXCLUDED.righe,
           righe_segnalate = EXCLUDED.righe_segnalate,
           ripartito = EXCLUDED.ripartito,
           sanzioni_non_distinte = EXCLUDED.sanzioni_non_distinte,
           fonte = EXCLUDED.fonte,
           fonte_tipo = EXCLUDED.fonte_tipo,
           memorizzato_il = now()`,
    [
      aziendaId,
      debito.totale,
      debito.contabilizzato,
      debito.daContabilizzare,
      debito.segnalato,
      debito.contributi,
      debito.sanzioni,
      debito.creditiAgente,
      debito.righe,
      debito.righeSegnalate,
      debito.ripartito,
      debito.sanzioniNonDistinte,
      debito.fonte,
      debito.fonteTipo,
    ]
  );

  return debito;
}

/**
 * Toglie la cifra memorizzata. Restituisce true se c'era una riga da togliere.
 *
 * Serve alla riapertura: il debito memorizzato è quello di UNA verifica, non un
 * attributo permanente dell'azienda. Quando si apre un nuovo ciclo di triage la
 * cifra precedente non descrive più la verifica in corso — e il lavoro da cui
 * era stata letta è già nell'archivio del ciclo — quindi va tolta, invece di
 * restare a schermo come se appartenesse al nuovo ciclo.
 */
export async function azzeraDebitoEnteMemorizzato(
  nomeSchema: string,
  aziendaId: number
): Promise<boolean> {
  await assicuraTabellaDebitoEnteMemorizzato(nomeSchema);
  const risposta = await pool.query(
    `DELETE FROM "${nomeSchema}".debiti_ente_memorizzati
      WHERE azienda_id = $1
      RETURNING azienda_id`,
    [aziendaId]
  );
  return risposta.rows.length > 0;
}

/**
 * Riallinea la cifra memorizzata alla verifica amministrativa corrente.
 *
 * Una sola regola per chiusura e riapertura: o c'è un debito negli archivi e
 * allora è quello memorizzato, oppure non c'è e la riga precedente viene tolta,
 * perché apparteneva a una verifica diversa. Il risultato dichiara che cosa è
 * successo, così l'esito può dire di aver rimosso una cifra invece di lasciarla
 * sparire in silenzio.
 */
export async function allineaDebitoEnteMemorizzato(
  nomeSchema: string,
  aziendaId: number
): Promise<{ debito: DebitoMemorizzato | null; azzerato: boolean }> {
  const debito = await memorizzaDebitoEnte(nomeSchema, aziendaId);
  if (debito) return { debito, azzerato: false };
  const azzerato = await azzeraDebitoEnteMemorizzato(nomeSchema, aziendaId);
  return { debito: null, azzerato };
}

export interface DebitoMemorizzatoLetto {
  debito: DebitoMemorizzato;
  /** Giorno della memorizzazione, in ISO (YYYY-MM-DD), o null. */
  memorizzatoIl: string | null;
}

/** Il debito memorizzato a fine verifica amministrativa, se c'è. */
export async function leggiDebitoEnteMemorizzato(
  nomeSchema: string,
  aziendaId: number
): Promise<DebitoMemorizzatoLetto | null> {
  try {
    const risposta = await pool.query(
      `SELECT totale, contabilizzato, da_contabilizzare, segnalato, contributi, sanzioni,
              crediti_agente, righe, righe_segnalate, ripartito, sanzioni_non_distinte,
              fonte, fonte_tipo,
              to_char(memorizzato_il, 'YYYY-MM-DD') AS memorizzato_il
         FROM "${nomeSchema}".debiti_ente_memorizzati
        WHERE azienda_id = $1 LIMIT 1`,
      [aziendaId]
    );
    const r = risposta.rows[0];
    if (!r) return null;
    return {
      debito: {
        totale: numero(r.totale),
        contabilizzato: numero(r.contabilizzato),
        daContabilizzare: numero(r.da_contabilizzare),
        segnalato: numero(r.segnalato),
        contributi: numero(r.contributi),
        sanzioni: numero(r.sanzioni),
        creditiAgente: numero(r.crediti_agente),
        righe: numero(r.righe),
        righeSegnalate: numero(r.righe_segnalate),
        ripartito: r.ripartito === true,
        sanzioniNonDistinte: r.sanzioni_non_distinte === true,
        fonte: String(r.fonte ?? ''),
        fonteTipo:
          r.fonte_tipo === 'triage' || r.fonte_tipo === 'segnalato'
            ? r.fonte_tipo
            : 'certificazione',
      },
      memorizzatoIl: r.memorizzato_il ? String(r.memorizzato_il) : null,
    };
  } catch {
    // Tabella assente su uno spazio che non ha ancora chiuso una verifica.
    return null;
  }
}
