'use server';

// CARICAMENTO DEI SET DEMO (0.171.0).
//
// Un pulsante nello spazio crea tre aziende per la liquidazione e tre per il
// cram down, con la posizione debitoria dell'ente, lo scenario già aperto sul
// percorso giusto e i documenti PDF allegati. È pensato per collaudare il
// percorso senza dipendere dall'AI: la lettura e il confronto sono già
// calcolati dal modello demo e salvati, quindi la schermata si apre completa.
//
// IDEMPOTENZA. Si riconosce un'azienda dalla ragione sociale: se c'è già, non
// la si duplica e non si toccano i suoi dati. I PDF caricati per un'azienda
// già presente vengono eliminati, per non lasciare file orfani sullo storage.
//
// SOLO ADMIN DI SPAZIO. È una funzione di configurazione, non un'operazione
// di lavoro: un Operatore non deve poter popolare il database con dati finti.

import { pool } from '@/lib/db';
import { richiediAccessoSchema, verificaFileDelloSpazio } from '@/lib/autorizzazione';
import { del } from '@/lib/blobStore';
import {
  assicuraTabellaAziende,
  assicuraTabellaDebitiEnte,
  assicuraTabelleScenari,
} from '@/db/provision';
import {
  SET_DEMO,
  confrontoDaDemo,
  documentiPer,
  letturaDaDemo,
  nomeScenarioDemo,
  setDemoValido,
  type AziendaDemo,
  type TipoSetDemo,
} from '@/lib/demo/setGiudice';

export interface DocumentoDemoCaricato {
  nome: string;
  url: string;
}

/** Le chiavi sono le ragioni sociali esatte del set. */
export type DocumentiSetDemo = Record<string, DocumentoDemoCaricato[]>;

export interface EsitoSetDemo {
  success: boolean;
  create?: number;
  esistenti?: number;
  scenarioId?: number;
  mancanti?: string[];
  error?: string;
}

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

async function ragioniSocialiEsistenti(
  nomeSchema: string,
  tipo: TipoSetDemo
): Promise<Set<string>> {
  const nomi = SET_DEMO[tipo].map((a) => a.ragioneSociale);
  const r = await pool.query(
    `SELECT ragione_sociale FROM "${nomeSchema}".aziende WHERE ragione_sociale = ANY($1::text[])`,
    [nomi]
  );
  return new Set(r.rows.map((x) => String(x.ragione_sociale)));
}

/** Dice quali aziende del set ci sono già e quali mancano, prima di generare i PDF. */
export async function statoSetDemoAction(
  nomeSchema: string,
  tipo: TipoSetDemo
): Promise<EsitoSetDemo> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!setDemoValido(tipo)) return { success: false, error: 'Set demo non valido.' };
    if (contesto.tipoSpazio !== 'ENTE') {
      return {
        success: false,
        error: 'I set demo del provvedimento sono per uno spazio ENTE (ente creditore).',
      };
    }
    await assicuraTabellaAziende(nomeSchema);
    const esistenti = await ragioniSocialiEsistenti(nomeSchema, tipo);
    const mancanti = SET_DEMO[tipo].map((a) => a.ragioneSociale).filter((n) => !esistenti.has(n));
    return { success: true, esistenti: esistenti.size, mancanti };
  } catch (error: any) {
    console.error('[statoSetDemoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile verificare il set demo: ${error.message || error}`,
    };
  }
}

async function inserisciAzienda(
  client: { query: (sql: string, valori?: unknown[]) => Promise<any> },
  nomeSchema: string,
  a: AziendaDemo
): Promise<number> {
  const r = await client.query(
    `INSERT INTO "${nomeSchema}".aziende
       (ragione_sociale, codice_fiscale, partita_iva, codice_ateco, forma_giuridica,
        indirizzo_sede_legale, citta, provincia, cap, capitale_sociale,
        rappresentante_legale, ruolo_rappresentante_legale, numero_rea, pec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      a.ragioneSociale,
      a.codiceFiscale,
      a.partitaIva,
      a.codiceAteco,
      a.formaGiuridica,
      a.indirizzo,
      a.citta,
      a.provincia,
      a.cap,
      a.capitaleSociale,
      a.rappresentante,
      a.ruoloRappresentante,
      a.numeroRea,
      a.pec,
    ]
  );
  return Number(r.rows[0].id);
}

/**
 * Crea le aziende mancanti del set. I documenti arrivano già caricati dal
 * browser (sono PDF generati con jsPDF): qui si salvano i riferimenti e il
 * risultato della lettura/confronto del modello, non i file su disco.
 */
export async function caricaSetDemoAction(
  nomeSchema: string,
  tipo: TipoSetDemo,
  documenti: DocumentiSetDemo
): Promise<EsitoSetDemo> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!setDemoValido(tipo)) return { success: false, error: 'Set demo non valido.' };
    if (contesto.tipoSpazio !== 'ENTE') {
      return {
        success: false,
        error: 'I set demo del provvedimento sono per uno spazio ENTE (ente creditore).',
      };
    }
    if (!documenti || typeof documenti !== 'object') {
      return { success: false, error: 'Documenti del set mancanti.' };
    }

    // Ogni URL deve appartenere a questo spazio: il browser non è una fonte
    // attendibile e un URL arbitrario farebbe leggere file di altri spazi.
    for (const elenco of Object.values(documenti)) {
      for (const d of elenco) {
        if (!d?.url || !d?.nome) return { success: false, error: 'Documento demo non valido.' };
        verificaFileDelloSpazio(contesto, d.url);
      }
    }

    await assicuraTabellaAziende(nomeSchema);
    await assicuraTabelleScenari(nomeSchema);
    await assicuraTabellaDebitiEnte(nomeSchema);

    const esistenti = await ragioniSocialiEsistenti(nomeSchema, tipo);
    const mancanti = SET_DEMO[tipo].filter((a) => !esistenti.has(a.ragioneSociale));
    const usati = new Set<string>();
    let creati = 0;
    let primoScenario: number | undefined;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const a of mancanti) {
        const elenco = documenti[a.ragioneSociale] ?? [];
        const attesi = documentiPer(a, tipo).map((d) => d.nome);
        const inviati = new Set(elenco.map((d) => d.nome));
        if (attesi.some((n) => !inviati.has(n))) {
          throw new Error(`Documenti incompleti per «${a.ragioneSociale}».`);
        }
        for (const d of elenco) usati.add(d.url);

        const aziendaId = await inserisciAzienda(client, nomeSchema, a);
        const sc = await client.query(
          `INSERT INTO "${nomeSchema}".scenari
             (azienda_id, nome, stato, tipo_proposta, origine_proposta, tipo_istruttoria)
           VALUES ($1, $2, 'IN_CORSO', 'RICEVUTA', 'Tribunale', $3) RETURNING id`,
          [aziendaId, nomeScenarioDemo(a), a.atto.tipo]
        );
        const scenarioId = Number(sc.rows[0].id);
        if (primoScenario === undefined) primoScenario = scenarioId;

        for (const d of a.debiti) {
          await client.query(
            `INSERT INTO "${nomeSchema}".debiti_ente
               (azienda_id, scenario_id, voce, importo, tipo, note)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [aziendaId, scenarioId, d.voce, d.importo, d.tipo, 'posizione del set demo']
          );
        }

        await client.query(
          `INSERT INTO "${nomeSchema}".istruttoria_giudice
             (scenario_id, documenti, lettura, confronto, lettura_il)
           VALUES ($1,$2,$3,$4, now())`,
          [
            scenarioId,
            JSON.stringify(elenco),
            JSON.stringify(letturaDaDemo(a)),
            JSON.stringify(confrontoDaDemo(a)),
          ]
        );
        creati += 1;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // I PDF delle aziende già presenti non sono stati usati: si eliminano,
    // altrimenti resterebbero orfani sullo storage a ogni nuovo tentativo.
    const orfani = Object.values(documenti)
      .flat()
      .filter((d) => !usati.has(d.url));
    await Promise.all(orfani.map((d) => del(d.url).catch(() => undefined)));

    return {
      success: true,
      create: creati,
      esistenti: esistenti.size,
      scenarioId: primoScenario,
    };
  } catch (error: any) {
    console.error('[caricaSetDemoAction] Errore:', error);
    return { success: false, error: `Impossibile caricare il set demo: ${error.message || error}` };
  }
}
