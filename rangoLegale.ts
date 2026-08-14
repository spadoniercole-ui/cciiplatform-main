'use server';

// Dump dati portabile — genera INSERT SQL per ogni riga di ogni tabella,
// su tutti gli schemi (public + ogni tenant_*), leggendo direttamente con
// lo stesso client `pg` usato ovunque nel progetto. Deliberatamente SOLO
// dati, non schema: pg_dump non è utilizzabile da una funzione serverless
// (nessun binario di sistema installabile a runtime su Vercel), e
// ricostruire il CREATE TABLE per ogni tabella leggendo information_schema
// sarebbe fragile — la fonte più affidabile per lo schema è il codice
// stesso che lo definisce (le funzioni assicuraTabellaXxx), non una copia
// ricostruita a occhio. Il flusso di migrazione previsto: inizializzare
// il nuovo database vuoto (schema dal codice), poi importare questo dump
// per popolarlo di dati.

import { pool } from '@/lib/db';

function escapeIdentificatore(nome: string): string {
  return `"${nome.replace(/"/g, '""')}"`;
}

function escapeValore(valore: unknown): string {
  if (valore === null || valore === undefined) return 'NULL';
  if (typeof valore === 'number') return Number.isFinite(valore) ? String(valore) : 'NULL';
  if (typeof valore === 'boolean') return valore ? 'TRUE' : 'FALSE';
  if (valore instanceof Date) return `'${valore.toISOString()}'`;
  if (typeof valore === 'object') {
    return `'${JSON.stringify(valore).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(valore).replace(/'/g, "''")}'`;
}

export interface RisultatoDumpDati {
  success: boolean;
  sql?: string;
  numeroTabelle?: number;
  numeroRighe?: number;
  error?: string;
}

export async function generaDumpDatiAction(): Promise<RisultatoDumpDati> {
  try {
    const schemiRis = await pool.query(
      `SELECT nspname FROM pg_catalog.pg_namespace
       WHERE nspname = 'public' OR nspname LIKE 'tenant\\_%' ORDER BY nspname`
    );
    const schemi: string[] = schemiRis.rows.map((r) => r.nspname);

    const righeOutput: string[] = [
      `-- Dump dati CCIIWEB4.0 — generato ${new Date().toISOString()}`,
      `-- Solo dati, non schema: vedi il commento in generaDumpDatiAction per il perché.`,
      `-- Import: eseguire su un database con lo schema già creato (Inizializza Database).`,
      '',
      'BEGIN;',
      '',
    ];
    let numeroTabelle = 0;
    let numeroRighe = 0;

    for (const schema of schemi) {
      const tabelleRis = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [schema]
      );

      for (const { table_name: tabella } of tabelleRis.rows) {
        const datiRis = await pool.query(
          `SELECT * FROM ${escapeIdentificatore(schema)}.${escapeIdentificatore(tabella)}`
        );
        if (datiRis.rows.length === 0) continue;

        numeroTabelle += 1;
        const colonne = Object.keys(datiRis.rows[0]);
        righeOutput.push(
          `-- ${schema}.${tabella} (${datiRis.rows.length} righe)`,
          `DELETE FROM ${escapeIdentificatore(schema)}.${escapeIdentificatore(tabella)};`
        );
        for (const riga of datiRis.rows) {
          numeroRighe += 1;
          const valori = colonne.map((c) => escapeValore(riga[c])).join(', ');
          righeOutput.push(
            `INSERT INTO ${escapeIdentificatore(schema)}.${escapeIdentificatore(tabella)} (${colonne
              .map(escapeIdentificatore)
              .join(', ')}) VALUES (${valori});`
          );
        }
        righeOutput.push('');
      }
    }

    righeOutput.push('COMMIT;', '');

    return {
      success: true,
      sql: righeOutput.join('\n'),
      numeroTabelle,
      numeroRighe,
    };
  } catch (error: any) {
    console.error('[generaDumpDatiAction] Errore:', error);
    return { success: false, error: `Impossibile generare il dump: ${error.message || error}` };
  }
}
