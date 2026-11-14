'use server';

// I profili di flusso dell'ente, le sospensioni della matricola e il
// confronto attesi/ricevuti.
//
// Il flusso appartiene a un ENTE (tabella `enti` dello spazio) e si filtra per
// ente: INPS, INAIL, Agenzia delle Entrate non sono un elenco indistinto di
// righe. Il profilo vale per tutte le aziende che l'ente analizza; la
// sospensione è dell'azienda, perché la matricola è dell'azienda. Il confronto
// si legge dall'archivio: nessun file nuovo da caricare.

import { pool } from '@/lib/db';
import { assicuraTabelleFlussiEnte } from '@/db/provision';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import {
  PROFILI_PREDEFINITI,
  type Periodicita,
  type ProfiloFlusso,
  type TipoFlusso,
} from '@/lib/flussiEnte/profilo';
import type { EsitoCongruenza } from '@/lib/flussiEnte/congruenza';
import {
  congruenzaAzienda,
  leggiEnti,
  leggiProfili,
  leggiSospensioni,
  type EnteFlusso,
} from '@/lib/flussiEnte/leggiCongruenza';

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

/** L'anagrafica degli enti dello spazio: la testa a cui i flussi si agganciano. */
export async function ottieniEntiFlusso(
  nomeSchema: string
): Promise<{ success: boolean; enti: EnteFlusso[]; error?: string }> {
  try {
    if (!schemaValido(nomeSchema)) return { success: false, enti: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    return { success: true, enti: await leggiEnti(nomeSchema) };
  } catch (e) {
    return {
      success: false,
      enti: [],
      error: e instanceof Error ? e.message : 'Lettura degli enti non riuscita.',
    };
  }
}

/**
 * I profili dello spazio. Al primo accesso li semina dai predefiniti,
 * agganciando ciascuno al proprio ente: una configurazione vuota costringerebbe
 * a compilare a mano un calendario che l'operatore vuole soltanto confermare.
 */
export async function ottieniProfiliFlusso(
  nomeSchema: string
): Promise<{ success: boolean; profili: ProfiloFlusso[]; enti: EnteFlusso[]; error?: string }> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, profili: [], enti: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    await assicuraTabelleFlussiEnte(nomeSchema);

    const enti = await leggiEnti(nomeSchema);
    const esistenti = await leggiProfili(nomeSchema);

    if (esistenti.length === 0 && enti.length > 0) {
      for (const p of PROFILI_PREDEFINITI) {
        const ente = enti.find((e) => e.codice === p.tipo) ?? enti[0];
        await pool.query(
          `INSERT INTO "${nomeSchema}".flussi_ente_profili
             (ente_id, tipo, flusso, etichetta_denuncia, etichetta_pagamento, periodicita,
              periodi_per_anno, scadenza_denuncia_giorno, scadenza_denuncia_mesi_dopo,
              scadenza_pagamento_giorno, scadenza_pagamento_mesi_dopo, rate, attivo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            ente.id,
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
    }

    return { success: true, profili: await leggiProfili(nomeSchema), enti };
  } catch (e) {
    return {
      success: false,
      profili: [],
      enti: [],
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

    // Il flusso deve appartenere a un ente di questo spazio: la chiave non si
    // prende dal browser senza controllarla.
    const enti = await leggiEnti(nomeSchema);
    const enteId = Number(profilo.enteId);
    if (!enti.some((e) => e.id === enteId)) {
      return { success: false, profili: [], error: 'Indica l’ente a cui il flusso appartiene.' };
    }

    const tipo = TIPI_AMMESSI.includes(profilo.tipo as TipoFlusso)
      ? (profilo.tipo as TipoFlusso)
      : 'ALTRO';
    const periodicita = PERIODICITA_AMMESSE.includes(profilo.periodicita as Periodicita)
      ? (profilo.periodicita as Periodicita)
      : 'MENSILE';
    const valori = [
      enteId,
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
            SET ente_id=$2, tipo=$3, flusso=$4, etichetta_denuncia=$5, etichetta_pagamento=$6,
                periodicita=$7, periodi_per_anno=$8, scadenza_denuncia_giorno=$9,
                scadenza_denuncia_mesi_dopo=$10, scadenza_pagamento_giorno=$11,
                scadenza_pagamento_mesi_dopo=$12, rate=$13, attivo=$14
          WHERE id=$1`,
        [Number(profilo.id), ...valori]
      );
    } else {
      await pool.query(
        `INSERT INTO "${nomeSchema}".flussi_ente_profili
           (ente_id, tipo, flusso, etichetta_denuncia, etichetta_pagamento, periodicita,
            periodi_per_anno, scadenza_denuncia_giorno, scadenza_denuncia_mesi_dopo,
            scadenza_pagamento_giorno, scadenza_pagamento_mesi_dopo, rate, attivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        valori
      );
    }

    return { success: true, profili: await leggiProfili(nomeSchema) };
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
    return { success: true, profili: await leggiProfili(nomeSchema) };
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
  sospensioni: { id: number; dal: string; al: string; motivo: string }[];
  error?: string;
}> {
  try {
    if (!schemaValido(nomeSchema))
      return { success: false, sospensioni: [], error: 'Schema non valido.' };
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    return { success: true, sospensioni: await leggiSospensioni(nomeSchema, Number(aziendaId)) };
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
 * Il confronto attesi/ricevuti per un'azienda, per ogni profilo attivo, con
 * l'ente di appartenenza. Il calcolo sta in `lib`, così il report PDF legge gli
 * stessi numeri della schermata.
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

    // L'arco confermato si salva: il report PDF legge lo stesso perimetro
    // della schermata, e non un default diverso.
    if (/^\d{4}-\d{2}$/.test(opzioni?.dal ?? '') && /^\d{4}-\d{2}$/.test(opzioni?.al ?? '')) {
      await assicuraTabelleFlussiEnte(nomeSchema);
      await pool.query(
        `INSERT INTO "${nomeSchema}".flussi_perimetri (azienda_id, dal, al, aggiornato_il)
         VALUES ($1,$2,$3, now())
         ON CONFLICT (azienda_id) DO UPDATE SET dal = EXCLUDED.dal, al = EXCLUDED.al,
           aggiornato_il = now()`,
        [Number(aziendaId), String(opzioni?.dal), String(opzioni?.al)]
      );
    }

    const lettura = await congruenzaAzienda(nomeSchema, Number(aziendaId), opzioni);
    return { success: true, ...lettura };
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
