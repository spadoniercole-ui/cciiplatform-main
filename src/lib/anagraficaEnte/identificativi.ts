// src/lib/anagraficaEnte/identificativi.ts
//
// IDENTIFICATIVI DELL'ENTE per un'azienda: matricola, posizioni, codici…
// come l'ente li chiama (etichette configurate nello spazio) e come li ha
// compilati per questa azienda.
//
// Perché li chiediamo: da quando sono salvati, l'azienda si riconosce con i
// riferimenti INTERNI dell'ente e non più con quelli camerali. Lo Screening,
// la Check List e la Proposta li riportano, così chi riceve un elaborato
// ritrova i documenti dell'azienda nei propri archivi senza ricerche.
//
// Modulo lato server (usa il pool): lo chiamano azioni che hanno già
// verificato l'accesso.

import { pool } from '@/lib/db';
import { assicuraTabelleAnagraficaEnte } from '@/db/provision';

export interface IdentificativoEnte {
  etichetta: string;
  valore: string;
}

const NUMERO_CAMPI = 10;

/** Campi compilati (attivi) dell'Anagrafica Ente, nell'ordine configurato. ID Ente in coda. */
export async function leggiIdentificativiEnte(
  nomeSchema: string,
  aziendaId: number
): Promise<IdentificativoEnte[]> {
  await assicuraTabelleAnagraficaEnte(nomeSchema);
  const colonne = Array.from({ length: NUMERO_CAMPI }, (_, i) => `campo_${i + 1}`).join(', ');
  const v = await pool.query(
    `SELECT id_ente, ${colonne} FROM "${nomeSchema}".anagrafica_ente WHERE azienda_id = $1`,
    [aziendaId]
  );
  if (v.rows.length === 0) return [];
  const riga = v.rows[0];
  const conf = await pool.query(
    `SELECT campo, etichetta, attivo FROM "${nomeSchema}".anagrafica_ente_config ORDER BY campo`
  );
  const perCampo = new Map<number, { etichetta: string; attivo: boolean }>(
    conf.rows.map((r) => [
      Number(r.campo),
      { etichetta: String(r.etichetta || ''), attivo: r.attivo !== false },
    ])
  );
  return daRiga(riga, perCampo);
}

/** Identificativi di più aziende in due query (elenchi, cruscotti). */
export async function leggiIdentificativiEntePerAziende(
  nomeSchema: string,
  aziendaIds: number[]
): Promise<Map<number, IdentificativoEnte[]>> {
  const out = new Map<number, IdentificativoEnte[]>();
  if (aziendaIds.length === 0) return out;
  await assicuraTabelleAnagraficaEnte(nomeSchema);
  const colonne = Array.from({ length: NUMERO_CAMPI }, (_, i) => `campo_${i + 1}`).join(', ');
  const v = await pool.query(
    `SELECT azienda_id, id_ente, ${colonne} FROM "${nomeSchema}".anagrafica_ente WHERE azienda_id = ANY($1::int[])`,
    [aziendaIds]
  );
  if (v.rows.length === 0) return out;
  const conf = await pool.query(
    `SELECT campo, etichetta, attivo FROM "${nomeSchema}".anagrafica_ente_config ORDER BY campo`
  );
  const perCampo = new Map<number, { etichetta: string; attivo: boolean }>(
    conf.rows.map((r) => [
      Number(r.campo),
      { etichetta: String(r.etichetta || ''), attivo: r.attivo !== false },
    ])
  );
  for (const riga of v.rows) out.set(Number(riga.azienda_id), daRiga(riga, perCampo));
  return out;
}

function daRiga(
  riga: Record<string, unknown>,
  perCampo: Map<number, { etichetta: string; attivo: boolean }>
): IdentificativoEnte[] {
  const out: IdentificativoEnte[] = [];
  for (let i = 1; i <= NUMERO_CAMPI; i++) {
    const valore = riga[`campo_${i}`];
    if (!valore || !String(valore).trim()) continue;
    const c = perCampo.get(i);
    if (!(c ? c.attivo : i <= 5)) continue;
    out.push({ etichetta: c?.etichetta || `Campo ${i}`, valore: String(valore).trim() });
  }
  if (riga.id_ente && String(riga.id_ente).trim()) {
    out.push({ etichetta: 'ID Ente', valore: String(riga.id_ente).trim() });
  }
  return out;
}

/** true se almeno un parametro dell'ente è salvato per l'azienda. */
export async function anagraficaEnteCompilata(
  nomeSchema: string,
  aziendaId: number
): Promise<boolean> {
  return (await leggiIdentificativiEnte(nomeSchema, aziendaId)).length > 0;
}

/** Riga di testo per i contesti AI e le intestazioni. */
export function testoIdentificativi(id: IdentificativoEnte[]): string {
  return id.map((x) => `${x.etichetta}: ${x.valore}`).join(' · ');
}

/** Denominazione, identificativi presso l'ente e camerali: la testata di un'azienda. */
export async function leggiRiferimentoAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<{
  azienda: string;
  identificativi: IdentificativoEnte[];
  partitaIva: string | null;
  codiceFiscale: string | null;
} | null> {
  const r = await pool.query(
    `SELECT ragione_sociale, partita_iva, codice_fiscale FROM "${nomeSchema}".aziende WHERE id = $1`,
    [aziendaId]
  );
  if (r.rows.length === 0) return null;
  return {
    azienda: String(r.rows[0].ragione_sociale ?? ''),
    identificativi: await leggiIdentificativiEnte(nomeSchema, aziendaId),
    partitaIva: r.rows[0].partita_iva ?? null,
    codiceFiscale: r.rows[0].codice_fiscale ?? null,
  };
}
