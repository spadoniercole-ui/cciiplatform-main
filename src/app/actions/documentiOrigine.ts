'use server';

// Documenti di origine del fascicolo di evidenza: registra nome, dimensione e
// impronta SHA-256 di un file da cui si importano righe. Il file resta nel
// browser; qui arriva solo il descrittore. Stessa impronta per la stessa
// azienda = stesso documento: si restituisce l'id esistente.

import { pool } from '@/lib/db';
import { assicuraTabellaDocumentiOrigine } from '@/db/provision';
import { improntaValida, type DescrittoreDocumento } from '@/lib/fascicolo/impronta';

export type TipoDocumentoOrigine = 'POSIZIONE_ENTE' | 'VERA' | 'VISURA' | 'PROPOSTA' | 'XBRL';

export async function registraDocumentoOrigineAction(
  nomeSchema: string,
  aziendaId: number,
  tipo: TipoDocumentoOrigine,
  descrittore: DescrittoreDocumento
): Promise<{ success: boolean; documentoId?: number; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    if (!improntaValida(descrittore.impronta))
      return { success: false, error: 'Impronta non valida.' };
    await assicuraTabellaDocumentiOrigine(nomeSchema);
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".documenti_origine (azienda_id, tipo, nome_file, dimensione, impronta)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (azienda_id, impronta) DO UPDATE SET nome_file = EXCLUDED.nome_file, tipo = EXCLUDED.tipo
       RETURNING id`,
      [
        aziendaId,
        tipo,
        descrittore.nomeFile.slice(0, 255),
        descrittore.dimensione,
        descrittore.impronta,
      ]
    );
    return { success: true, documentoId: Number(r.rows[0].id) };
  } catch (error: unknown) {
    console.error('[registraDocumentoOrigineAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile registrare il documento: ${(error as Error).message || error}`,
    };
  }
}
