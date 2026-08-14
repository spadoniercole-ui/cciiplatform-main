'use server';

// Architrave del modello Situazione Debitoria — si veda il commento in
// db/provision.ts (assicuraTabellaArchitraveDebitiEnte) per il perché.
// Un solo architrave per spazio: l'ente ha un solo formato di file, non
// uno per azienda.

import { pool } from '@/lib/db';
import { assicuraTabellaArchitraveDebitiEnte } from '@/db/provision';
import type { TipoDebitoEnte } from '@/lib/debitiEnte/tipoDebito';

export type RuoloColonnaDebito =
  'voce' | 'importo' | 'importo_versato' | 'tipo' | 'nota' | 'data' | 'ignora';

export interface ArchitraveDebitiEnte {
  intestazioniOriginali: string[];
  /** Un ruolo per ciascuna intestazione, stessa posizione/lunghezza dell'array sopra. */
  mappatura: RuoloColonnaDebito[];
  /** Valore trovato nel file (nella colonna mappata a "tipo") -> codice fisso CLE/CEN/CEC/CEA. */
  mappaturaTipo: Record<string, TipoDebitoEnte>;
  numeroColonne: number;
  nomeFileOrigine: string | null;
  /** Il foglio scelto in fase di mappatura — molti export (es. INPS) hanno un riepilogo e fogli di dettaglio, quello letto va riapplicato uguale ai caricamenti successivi, non riscelto ogni volta. null = primo foglio, comportamento di sempre per chi non ha mai avuto bisogno di scegliere. */
  nomeFoglio: string | null;
  /** Alternativa a mappare una colonna "tipo": alcuni export (es. INPS) non hanno affatto quella colonna — ogni riga del file è implicitamente della stessa natura. Se impostato, si applica a tutte le righe, la mappatura per colonna/valore non serve più. */
  tipoFisso: TipoDebitoEnte | null;
}

export interface RisultatoArchitraveDebitiEnte {
  success: boolean;
  architrave: ArchitraveDebitiEnte | null;
  error?: string;
}

export async function ottieniArchitraveDebitiEnte(
  nomeSchema: string
): Promise<RisultatoArchitraveDebitiEnte> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, architrave: null, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaArchitraveDebitiEnte(nomeSchema);
    const risultato = await pool.query(
      `SELECT intestazioni_originali, mappatura, mappatura_tipo, numero_colonne, nome_file_origine, nome_foglio, tipo_fisso
       FROM "${nomeSchema}".debiti_ente_architrave ORDER BY id LIMIT 1`
    );
    if (risultato.rows.length === 0) {
      return { success: true, architrave: null };
    }
    const r = risultato.rows[0];
    return {
      success: true,
      architrave: {
        intestazioniOriginali: r.intestazioni_originali,
        mappatura: r.mappatura,
        mappaturaTipo: r.mappatura_tipo,
        numeroColonne: r.numero_colonne,
        nomeFileOrigine: r.nome_file_origine,
        nomeFoglio: r.nome_foglio,
        tipoFisso: r.tipo_fisso,
      },
    };
  } catch (error: any) {
    console.error('[ottieniArchitraveDebitiEnte] Errore:', error);
    return {
      success: false,
      architrave: null,
      error: `Impossibile caricare l'architrave: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneArchitrave {
  success: boolean;
  error?: string;
}

export async function salvaArchitraveDebitiEnteAction(
  nomeSchema: string,
  architrave: ArchitraveDebitiEnte
): Promise<RisultatoOperazioneArchitrave> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    if (!architrave.mappatura.includes('importo')) {
      return { success: false, error: 'Devi indicare quale colonna è "Importo".' };
    }
    if (!architrave.mappatura.includes('tipo') && !architrave.tipoFisso) {
      return {
        success: false,
        error:
          'Devi indicare quale colonna è "Tipo", oppure — se il file non ne ha una — scegliere un tipo fisso per tutte le righe.',
      };
    }
    await assicuraTabellaArchitraveDebitiEnte(nomeSchema);
    // Un solo architrave per spazio — se ne esiste già uno, questa
    // azione non lo sovrascrive silenziosamente: va prima azzerato
    // esplicitamente (azzeraArchitraveDebitiEnteAction).
    const esistente = await pool.query(
      `SELECT id FROM "${nomeSchema}".debiti_ente_architrave LIMIT 1`
    );
    if (esistente.rows.length > 0) {
      return {
        success: false,
        error:
          'Esiste già un modello riconosciuto per questo spazio — cambialo esplicitamente prima di caricarne uno nuovo.',
      };
    }
    await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente_architrave
         (intestazioni_originali, mappatura, mappatura_tipo, numero_colonne, nome_file_origine, nome_foglio, tipo_fisso)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        JSON.stringify(architrave.intestazioniOriginali),
        JSON.stringify(architrave.mappatura),
        JSON.stringify(architrave.mappaturaTipo),
        architrave.numeroColonne,
        architrave.nomeFileOrigine,
        architrave.nomeFoglio,
        architrave.tipoFisso,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaArchitraveDebitiEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare l'architrave: ${error.message || error}`,
    };
  }
}

/**
 * Cambiare modello significa cancellare OGNI riga di Situazione
 * Debitoria già inserita in OGNI scenario di questo spazio — non solo
 * quello corrente: l'architrave è per spazio, i dati inseriti con il
 * vecchio formato non hanno più un modello che li descriva. Richiede
 * conferma esplicita lato interfaccia, non solo la chiamata.
 */
export async function azzeraArchitraveDebitiEnteAction(
  nomeSchema: string
): Promise<RisultatoOperazioneArchitrave> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaArchitraveDebitiEnte(nomeSchema);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente_architrave`);
    await pool.query(`DELETE FROM "${nomeSchema}".debiti_ente`);
    return { success: true };
  } catch (error: any) {
    console.error('[azzeraArchitraveDebitiEnteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile azzerare il modello: ${error.message || error}`,
    };
  }
}
