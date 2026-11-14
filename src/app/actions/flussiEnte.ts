'use server';

// I profili di flusso dell'ente, le sospensioni della matricola e il
// confronto attesi/ricevuti.
//
// Il profilo è dello SPAZIO (vale per tutte le aziende che l'ente analizza);
// la sospensione è dell'AZIENDA, perché la matricola è dell'azienda. Il
// confronto si legge dall'archivio: nessun file nuovo da caricare, nessun
// dato chiesto due volte.

import { pool } from '@/lib/db';
import { assicuraTabelleFlussiEnte, assicuraTabelleVera } from '@/db/provision';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  PROFILI_PREDEFINITI,
  type Periodicita,
  type ProfiloFlusso,
  type TipoFlusso,
} from '@/lib/flussiEnte/profilo';
import {
  congruenzaFlussi,
  periodoDaTesto,
  type EsitoCongruenza,
  type SospensioneFlusso,
} from '@/lib/flussiEnte/congruenza';

const schemaValido = (nomeSchema: string) => /^[a-z0-9_]+$/.test(nomeSchema);

const testo = (v: unknown, max = 120) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

const intero = (v: unknown, min: number, max: number, difetto: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return difetto;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const PERIODICITA_AMMESSE: Periodicita[] = ['MENSILE', 'TRIMESTRALE', 'ANNUALE'];
const TIPI_AMMESSI: TipoFlusso[] = ['INPS', 'INAIL', 'AGENZIA_ENTRATE', 'ALTRO'];

function dallaRiga(r: Record<string, unknown>): ProfiloFlusso {
  const periodicita = String(r.periodicita ?? 'MENSILE') as Periodicita;
  const tipo = String(r.tipo ?? 'ALTRO') as TipoFlusso;
  return {
    id: Number(r.id),
    tipo: TIPI_AMMESSI.includes(tipo) ? tipo : 'ALTRO',
    flusso: String(r.flusso ?? ''),
    etichettaDenuncia: String(r.etichetta_denuncia ?? 'denunce'),
    etichettaPagamento: String(r.etichetta_pagamento ?? 'pagamenti'),
    periodicita: PERIODICITA_AMMESSE.includes(periodicita) ? periodicita : 'MENSILE',
    periodiPerAnno: Number(r.periodi_per_anno ?? 12),
    scadenzaDenunciaGiorno: Number(r.scadenza_denuncia_giorno ?? 0),
    scadenzaDenunciaMesiDopo: Number(r.scadenza_denuncia_mesi_dopo ?? 1),
    scadenzaPagamentoGiorno: Number(r.scadenza_pagamento_giorno ?? 0),
    scadenzaPagamentoMesiDopo: Number(r.scadenza_pagamento_mesi_dopo ?? 1),
    rate: Number(r.rate ?? 1),
    attivo: r.attivo !== false,
  };
}

/**
 * I profili dello spazio. Al primo accesso li semina dai predefiniti: una
 * configurazione vuota costringerebbe a compilare a mano un calendario che
 * l'operatore vuole soltanto confermare.
 */
export async function ottieniProfiliFlusso(
  nomeSchema: string
): Promise<{ success: boolean; profili: ProfiloFlusso[]; error?: string }> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, profili: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);

    let v = await pool.query(`SELECT * FROM "${nomeSchema}".flussi_ente_profili ORDER BY id`);
    if (v.rows.length === 0) {
      for (const p of PROFILI_PREDEFINITI) {
        await pool.query(
          `INSERT INTO "${nomeSchema}".flussi_ente_profili
             (tipo, flusso, etichetta_denuncia, etichetta_pagamento, periodicita,
              periodi_per_anno, scadenza_denuncia_giorno, scadenza_denuncia_mesi_dopo,
              scadenza_pagamento_giorno, scadenza_pagamento_mesi_dopo, rate, attivo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            p.tipo,
            p.flusso,
            p.etichettaDenuncia,
            p.etichettaPagamento,
            p.periodicita,
            p.periodiPerAnno,
            p.scadenzaDenunciaGiorno,
            p.scadenzaDenunciaMesiDopo,
            p.scadenzaPagamentoGiorno,
            p.scadenzaPagamentoMesiDopo,
            p.rate,
            p.attivo,
          ]
        );
      }
      v = await pool.query(`SELECT * FROM "${nomeSchema}".flussi_ente_profili ORDER BY id`);
    }

    return { success: true, profili: v.rows.map(dallaRiga) };
  } catch (e) {
    return {
      success: false,
      profili: [],
      error: e instanceof Error ? e.message : 'Lettura dei profili non riuscita.',
    };
  }
}

export async function salvaProfiloFlusso(
  nomeSchema: string,
  profilo: Partial<ProfiloFlusso>
): Promise<{ success: boolean; profili: ProfiloFlusso[]; error?: string }> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, profili: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);

    const flusso = testo(profilo.flusso);
    if (!flusso) return { success: false, profili: [], error: 'Indica il nome del flusso.' };

    const tipo = TIPI_AMMESSI.includes(profilo.tipo as TipoFlusso)
      ? (profilo.tipo as TipoFlusso)
      : 'ALTRO';
    const periodicita = PERIODICITA_AMMESSE.includes(profilo.periodicita as Periodicita)
      ? (profilo.periodicita as Periodicita)
      : 'MENSILE';
    const valori = [
      tipo,
      flusso,
      testo(profilo.etichettaDenuncia) || 'denunce',
      testo(profilo.etichettaPagamento) || 'pagamenti',
      periodicita,
      intero(profilo.periodiPerAnno, 1, 12, periodicita === 'MENSILE' ? 12 : 1),
      intero(profilo.scadenzaDenunciaGiorno, 0, 31, 0),
      intero(profilo.scadenzaDenunciaMesiDopo, 0, 12, 1),
      intero(profilo.scadenzaPagamentoGiorno, 0, 31, 0),
      intero(profilo.scadenzaPagamentoMesiDopo, 0, 12, 1),
      intero(profilo.rate, 1, 4, 1),
      profilo.attivo !== false,
    ];

    if (profilo.id) {
      await pool.query(
        `UPDATE "${nomeSchema}".flussi_ente_profili
            SET tipo=$3, flusso=$4, etichetta_denuncia=$5, etichetta_pagamento=$6,
                periodicita=$7, periodi_per_anno=$8, scadenza_denuncia_giorno=$9,
                scadenza_denuncia_mesi_dopo=$10, scadenza_pagamento_giorno=$11,
                scadenza_pagamento_mesi_dopo=$12, rate=$13, attivo=$14
          WHERE id=$1 AND $2::text IS NOT NULL`,
        [Number(profilo.id), nomeSchema, ...valori]
      );
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".flussi_ente_profili
           (tipo, flusso, etichetta_denuncia, etichetta_pagamento, periodicita,
            periodi_per_anno, scadenza_denuncia_giorno, scadenza_denuncia_mesi_dopo,
            scadenza_pagamento_giorno, scadenza_pagamento_mesi_dopo, rate, attivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        valori
      );
    }

    const v = await pool.query(`SELECT * FROM "${nomeSchema}".flussi_ente_profili ORDER BY id`);
    return { success: true, profili: v.rows.map(dallaRiga) };
  } catch (e) {
    return {
      success: false,
      profili: [],
      error: e instanceof Error ? e.message : 'Salvataggio del profilo non riuscito.',
    };
  }
}

export async function eliminaProfiloFlusso(
  nomeSchema: string,
  id: number
): Promise<{ success: boolean; profili: ProfiloFlusso[]; error?: string }> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, profili: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await pool.query(`DELETE FROM "${nomeSchema}".flussi_ente_profili WHERE id = $1`, [Number(id)]);
    const v = await pool.query(`SELECT * FROM "${nomeSchema}".flussi_ente_profili ORDER BY id`);
    return { success: true, profili: v.rows.map(dallaRiga) };
  } catch (e) {
    return {
      success: false,
      profili: [],
      error: e instanceof Error ? e.message : 'Eliminazione non riuscita.',
    };
  }
}

/** Le sospensioni della matricola per questa azienda. */
export async function ottieniSospensioniFlusso(
  nomeSchema: string,
  aziendaId: number
): Promise<{
  success: boolean;
  sospensioni: ({ id: number } & SospensioneFlusso)[];
  error?: string;
}> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, sospensioni: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);
    const v = await pool.query(
      `SELECT id, dal, al, motivo FROM "${nomeSchema}".flussi_sospensioni
        WHERE azienda_id = $1 ORDER BY dal`,
      [Number(aziendaId)]
    );
    return {
      success: true,
      sospensioni: v.rows.map((r) => ({
        id: Number(r.id),
        dal: String(r.dal),
        al: String(r.al),
        motivo: String(r.motivo ?? ''),
      })),
    };
  } catch (e) {
    return {
      success: false,
      sospensioni: [],
      error: e instanceof Error ? e.message : 'Lettura delle sospensioni non riuscita.',
    };
  }
}

export async function salvaSospensioneFlusso(
  nomeSchema: string,
  aziendaId: number,
  dati: { id?: number; dal: string; al: string; motivo?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaValido(nomeSchema)) return { success: false, error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);

    const dal = testo(dati.dal, 7);
    const al = testo(dati.al, 7);
    if (!/^\d{4}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}$/.test(al)) {
      return { success: false, error: 'Indica i due mesi, nel formato AAAA-MM.' };
    }
    if (dal > al) return { success: false, error: 'Il primo mese viene dopo l’ultimo.' };

    if (dati.id) {
      await pool.query(
        `UPDATE "${nomeSchema}".flussi_sospensioni
            SET dal=$3, al=$4, motivo=$5 WHERE id=$1 AND azienda_id=$2`,
        [Number(dati.id), Number(aziendaId), dal, al, testo(dati.motivo, 240)]
      );
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".flussi_sospensioni (azienda_id, dal, al, motivo)
         VALUES ($1,$2,$3,$4)`,
        [Number(aziendaId), dal, al, testo(dati.motivo, 240)]
      );
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Salvataggio della sospensione non riuscito.',
    };
  }
}

export async function eliminaSospensioneFlusso(
  nomeSchema: string,
  aziendaId: number,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!schemaValido(nomeSchema)) return { success: false, error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await pool.query(
      `DELETE FROM "${nomeSchema}".flussi_sospensioni WHERE id=$1 AND azienda_id=$2`,
      [Number(id), Number(aziendaId)]
    );
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Eliminazione non riuscita.',
    };
  }
}

/**
 * Il confronto attesi/ricevuti per un'azienda: per ogni profilo attivo, i
 * periodi che l'ente doveva ricevere, quelli arrivati, quelli mancanti con i
 * giorni di ritardo e quelli coperti da una sospensione o da una
 * regolarizzazione.
 *
 * Il perimetro si ricava dai dati in archivio (il primo e l'ultimo periodo
 * della certificazione dei debiti), ma l'operatore può restringerlo o
 * allargarlo: la finestra la decide chi conosce l'azienda, non il file.
 */
export async function calcolaCongruenzaFlussi(
  nomeSchema: string,
  aziendaId: number,
  opzioni?: { dal?: string; al?: string; dataVerifica?: string }
): Promise<{
  success: boolean;
  esiti: EsitoCongruenza[];
  dal: string | null;
  al: string | null;
  dataVerifica: string;
  periodiInArchivio: number;
  error?: string;
}> {
  const oggi = new Date().toISOString().slice(0, 10);
  try {
    if (!schemaValido(nomeSchema)) {
      return {
        success: false,
        esiti: [],
        dal: null,
        al: null,
        dataVerifica: oggi,
        periodiInArchivio: 0,
        error: 'Schema non valido.',
      };
    }
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);
    await assicuraTabelleVera(nomeSchema);

    const righe = await pool.query(
      `SELECT voce, periodo FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1`,
      [Number(aziendaId)]
    );

    const periodi = righe.rows
      .map((r) => periodoDaTesto(String(r.periodo ?? '')))
      .filter((p): p is string => Boolean(p))
      .sort();

    const dataVerifica = /^\d{4}-\d{2}-\d{2}$/.test(opzioni?.dataVerifica ?? '')
      ? String(opzioni?.dataVerifica)
      : oggi;
    const dal = /^\d{4}-\d{2}$/.test(opzioni?.dal ?? '')
      ? String(opzioni?.dal)
      : (periodi[0] ?? null);
    const al = /^\d{4}-\d{2}$/.test(opzioni?.al ?? '')
      ? String(opzioni?.al)
      : (periodi.at(-1) ?? null);

    const profili = await pool.query(
      `SELECT * FROM "${nomeSchema}".flussi_ente_profili WHERE attivo = TRUE ORDER BY id`
    );
    const sosp = await pool.query(
      `SELECT dal, al, motivo FROM "${nomeSchema}".flussi_sospensioni WHERE azienda_id = $1 ORDER BY dal`,
      [Number(aziendaId)]
    );
    const sospensioni: SospensioneFlusso[] = sosp.rows.map((r) => ({
      dal: String(r.dal),
      al: String(r.al),
      motivo: String(r.motivo ?? ''),
    }));

    const esiti =
      dal && al
        ? profili.rows.map(dallaRiga).map((profilo) =>
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

    return {
      success: true,
      esiti,
      dal,
      al,
      dataVerifica,
      periodiInArchivio: periodi.length,
    };
  } catch (e) {
    return {
      success: false,
      esiti: [],
      dal: null,
      al: null,
      dataVerifica: oggi,
      periodiInArchivio: 0,
      error: e instanceof Error ? e.message : 'Confronto dei flussi non riuscito.',
    };
  }
}
