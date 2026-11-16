// LA FOTOGRAFIA SALVATA COME BASE (0.240.0).
//
// Prima qui c'era la simulazione scelta nella verifica azienda (profilo,
// orizzonte, colonne proiettate). Ora la base è la fotografia del prospetto
// contabile: le sue colonne, con l'etichetta di ogni anno. La leggono
// ScenariManager (per sapere se la verifica aziendale è pronta) e il confronto
// scenario (per i valori di partenza).
//
// La guardia sull'assenza della tabella serve agli spazi vecchi: valgono
// «nessuna base», non un errore.

import { pool } from '@/lib/db';
import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

/**
 * Le etichette possibili di una colonna. «PROIEZIONE» resta nel tipo per la
 * compatibilità delle basi salvate prima della 0.240.0: la fotografia scrive
 * solo STORICO e CALCOLATO.
 */
export type TipoColonnaBase = 'STORICO' | 'CALCOLATO' | 'PROIEZIONE';

export interface ColonnaBase {
  anno: number;
  tipo: TipoColonnaBase;
  dati: DatiFinanziariPeriodo;
}

export interface FotografiaBaseLetta {
  id: number;
  profilo: string;
  annualita: number;
  colonne: ColonnaBase[];
  createdAt: string;
}

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

export async function leggiFotografiaBase(
  nomeSchema: string,
  aziendaId: number
): Promise<FotografiaBaseLetta | null> {
  if (!schemaOk(nomeSchema)) return null;
  const esistenza = await pool.query(`SELECT to_regclass($1) AS tabella`, [
    `${nomeSchema}.verifica_azienda_simulazioni`,
  ]);
  if (!esistenza.rows[0]?.tabella) return null;

  const r = await pool.query(
    `SELECT id, profilo, annualita, colonne, created_at
       FROM "${nomeSchema}".verifica_azienda_simulazioni
      WHERE azienda_id = $1 AND base_per_proposta = TRUE
      ORDER BY created_at DESC
      LIMIT 1`,
    [aziendaId]
  );
  const riga = r.rows[0];
  if (!riga) return null;

  const grezze = Array.isArray(riga.colonne) ? (riga.colonne as unknown[]) : [];
  const colonne: ColonnaBase[] = grezze.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const c = x as Record<string, unknown>;
    const anno = Number(c.anno);
    if (!Number.isInteger(anno)) return [];
    const dati = (c.dati && typeof c.dati === 'object' ? c.dati : {}) as DatiFinanziariPeriodo;
    const tipo: TipoColonnaBase =
      c.tipo === 'CALCOLATO' || c.tipo === 'PROIEZIONE' ? c.tipo : 'STORICO';
    return [{ anno, tipo, dati }];
  });

  return {
    id: Number(riga.id),
    profilo: String(riga.profilo),
    annualita: Number(riga.annualita),
    colonne,
    createdAt: riga.created_at?.toString() ?? '',
  };
}
