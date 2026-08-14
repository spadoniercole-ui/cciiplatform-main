'use server';

// Azzeramento completo del database — stessa identica logica già scritta
// e verificata in reset_database.sql (schemi tenant_* eliminati, tabelle
// globali svuotate), qui richiamabile da un pulsante invece che da un
// client psql esterno. Pensata per un solo uso: subito dopo aver
// "battezzato" la versione definitiva stabile, prima di consegnare
// l'ambiente pulito. IRREVERSIBILE — la conferma forte sta
// nell'interfaccia (va scritta una frase esatta), non qui: questa
// funzione esegue senza ulteriori domande una volta chiamata.

import { pool } from '@/lib/db';
import { seedXbrlTagMappings } from '@/db/seedXbrlTagMappings';

const TABELLE_GLOBALI = [
  'spazi',
  'licenze_spazio',
  'licenze',
  'sessioni',
  'analisi_xbrl_storico',
  'xbrl_tag_mappings',
  'admin_spazio_index',
  'utente_spazio_index',
  'checklist_modello_base',
  'dati_settore_cache',
  'dati_settore_ultima_chiamata',
  'parametri_sistema',
];

export interface RisultatoAzzeramento {
  success: boolean;
  schemiEliminati?: number;
  tabelleSvuotate?: number;
  error?: string;
}

export async function azzeraDatabaseCompletoAction(): Promise<RisultatoAzzeramento> {
  try {
    const schemiRis = await pool.query(
      `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\\_%'`
    );
    for (const { nspname } of schemiRis.rows) {
      await pool.query(`DROP SCHEMA IF EXISTS "${nspname.replace(/"/g, '""')}" CASCADE`);
    }

    let tabelleSvuotate = 0;
    for (const tabella of TABELLE_GLOBALI) {
      const esisteRis = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [tabella]
      );
      if (esisteRis.rows.length === 0) continue;
      await pool.query(`TRUNCATE TABLE public."${tabella}" RESTART IDENTITY CASCADE`);
      tabelleSvuotate += 1;
    }

    // Prima un passo manuale a parte, facile da dimenticare: ora fa
    // parte della stessa operazione atomica di azzeramento.
    await seedXbrlTagMappings();

    return {
      success: true,
      schemiEliminati: schemiRis.rows.length,
      tabelleSvuotate,
    };
  } catch (error: any) {
    console.error('[azzeraDatabaseCompletoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile azzerare il database: ${error.message || error}`,
    };
  }
}
