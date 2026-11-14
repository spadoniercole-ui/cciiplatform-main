// src/lib/flussiEnte/leggiCongruenza.ts
//
// LA LETTURA DEI FLUSSI, LATO SERVER.
//
// Sta qui e non nelle server action perché serve a due superfici: la verifica
// amministrativa (che la chiama dall'azione) e il report PDF (che è un Server
// Component e non può invocare un'azione su sé stesso senza un salto inutile).
// Una sola query, un solo calcolo: le due superfici non possono raccontare
// numeri diversi.
//
// I profili si leggono con il loro ente (`LEFT JOIN enti`): il flusso
// appartiene all'ente, e chi mostra l'elenco lo raggruppa per ente invece di
// mescolare UNIEMENS e premi INAIL in un unico calderone.

import { pool } from '@/lib/db';
import { assicuraTabelleFlussiEnte, assicuraTabelleVera } from '@/db/provision';
import {
  congruenzaFlussi,
  periodoDaTesto,
  type EsitoCongruenza,
  type SospensioneFlusso,
} from './congruenza';
import type { Periodicita, ProfiloFlusso, TipoFlusso } from './profilo';

export interface EnteFlusso {
  id: number;
  codice: string;
  nome: string;
}

const PERIODICITA: Periodicita[] = ['MENSILE', 'TRIMESTRALE', 'ANNUALE'];
const TIPI: TipoFlusso[] = ['INPS', 'INAIL', 'AGENZIA_ENTRATE', 'ALTRO'];

/** La riga del database diventa il profilo che il motore conosce. */
export function profiloDaRiga(r: Record<string, unknown>): ProfiloFlusso {
  const periodicita = String(r.periodicita ?? 'MENSILE') as Periodicita;
  const tipo = String(r.tipo ?? 'ALTRO') as TipoFlusso;
  return {
    id: Number(r.id),
    enteId: r.ente_id === null || r.ente_id === undefined ? null : Number(r.ente_id),
    enteNome: String(r.ente_nome ?? ''),
    tipo: TIPI.includes(tipo) ? tipo : 'ALTRO',
    flusso: String(r.flusso ?? ''),
    etichettaDenuncia: String(r.etichetta_denuncia ?? 'denunce'),
    etichettaPagamento: String(r.etichetta_pagamento ?? 'pagamenti'),
    periodicita: PERIODICITA.includes(periodicita) ? periodicita : 'MENSILE',
    periodiPerAnno: Number(r.periodi_per_anno ?? 12),
    scadenzaDenunciaGiorno: Number(r.scadenza_denuncia_giorno ?? 0),
    scadenzaDenunciaMesiDopo: Number(r.scadenza_denuncia_mesi_dopo ?? 1),
    scadenzaPagamentoGiorno: Number(r.scadenza_pagamento_giorno ?? 0),
    scadenzaPagamentoMesiDopo: Number(r.scadenza_pagamento_mesi_dopo ?? 1),
    rate: Number(r.rate ?? 1),
    attivo: r.attivo !== false,
  };
}

export async function leggiEnti(nomeSchema: string): Promise<EnteFlusso[]> {
  await assicuraTabelleFlussiEnte(nomeSchema);
  const v = await pool.query(`SELECT id, codice, nome FROM "${nomeSchema}".enti ORDER BY id`);
  return v.rows.map((r) => ({ id: Number(r.id), codice: String(r.codice), nome: String(r.nome) }));
}

export async function leggiProfili(nomeSchema: string): Promise<ProfiloFlusso[]> {
  await assicuraTabelleFlussiEnte(nomeSchema);
  const v = await pool.query(
    `SELECT p.*, e.nome AS ente_nome
       FROM "${nomeSchema}".flussi_ente_profili p
       LEFT JOIN "${nomeSchema}".enti e ON e.id = p.ente_id
      ORDER BY p.ente_id NULLS LAST, p.id`
  );
  return v.rows.map(profiloDaRiga);
}

export async function leggiSospensioni(
  nomeSchema: string,
  aziendaId: number
): Promise<({ id: number } & SospensioneFlusso)[]> {
  await assicuraTabelleFlussiEnte(nomeSchema);
  const v = await pool.query(
    `SELECT id, dal, al, motivo FROM "${nomeSchema}".flussi_sospensioni
      WHERE azienda_id = $1 ORDER BY dal`,
    [aziendaId]
  );
  return v.rows.map((r) => ({
    id: Number(r.id),
    dal: String(r.dal),
    al: String(r.al),
    motivo: String(r.motivo ?? ''),
  }));
}

export interface LetturaCongruenza {
  esiti: EsitoCongruenza[];
  dal: string | null;
  al: string | null;
  dataVerifica: string;
  periodiInArchivio: number;
}

/**
 * Il confronto attesi/ricevuti per un'azienda, per ogni profilo attivo.
 * L'arco si ricava dai periodi che l'archivio porta (primo e ultimo della
 * certificazione dei debiti) e l'operatore può imporne uno diverso: la
 * finestra la decide chi conosce l'azienda, non il file.
 */
export async function congruenzaAzienda(
  nomeSchema: string,
  aziendaId: number,
  opzioni?: { dal?: string; al?: string; dataVerifica?: string }
): Promise<LetturaCongruenza> {
  await assicuraTabelleFlussiEnte(nomeSchema);
  await assicuraTabelleVera(nomeSchema);

  const oggi = new Date().toISOString().slice(0, 10);
  const righe = await pool.query(
    `SELECT voce, periodo FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1`,
    [aziendaId]
  );

  const periodi = righe.rows
    .map((r) => periodoDaTesto(String(r.periodo ?? '')))
    .filter((p): p is string => Boolean(p))
    .sort();

  const dataVerifica = /^\d{4}-\d{2}-\d{2}$/.test(opzioni?.dataVerifica ?? '')
    ? String(opzioni?.dataVerifica)
    : oggi;

  // L'arco: quello chiesto adesso, poi quello salvato dall'operatore, infine
  // quello che l'archivio porta. Nessun perimetro inventato.
  const salvato = await pool.query(
    `SELECT dal, al FROM "${nomeSchema}".flussi_perimetri WHERE azienda_id = $1`,
    [aziendaId]
  );
  const dalSalvato = String(salvato.rows[0]?.dal ?? '');
  const alSalvato = String(salvato.rows[0]?.al ?? '');
  const dal = /^\d{4}-\d{2}$/.test(opzioni?.dal ?? '')
    ? String(opzioni?.dal)
    : /^\d{4}-\d{2}$/.test(dalSalvato)
      ? dalSalvato
      : (periodi[0] ?? null);
  const al = /^\d{4}-\d{2}$/.test(opzioni?.al ?? '')
    ? String(opzioni?.al)
    : /^\d{4}-\d{2}$/.test(alSalvato)
      ? alSalvato
      : (periodi.at(-1) ?? null);

  const profili = (await leggiProfili(nomeSchema)).filter((p) => p.attivo);
  const sospensioni = await leggiSospensioni(nomeSchema, aziendaId);

  const esiti =
    dal && al
      ? profili.map((profilo) =>
          congruenzaFlussi({
            profilo,
            righe: righe.rows.map((r) => ({
              periodo: String(r.periodo ?? ''),
              voce: String(r.voce ?? ''),
            })),
            sospensioni,
            dal,
            al,
            dataVerifica,
          })
        )
      : [];

  return { esiti, dal, al, dataVerifica, periodiInArchivio: periodi.length };
}
