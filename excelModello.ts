'use server';

// Storico XBRL per azienda, isolato per spazio (schema tenant). Il file
// caricato viene analizzato dall'UNICO motore condiviso (src/lib/xbrl,
// via l'endpoint /api/xbrl/parse) — qui ci si occupa solo di persistere e
// rileggere il risultato per una specifica azienda di questo spazio.
// Vedi la nota in src/db/provision.ts (assicuraTabellaXbrlAzienda) sul
// perché questa tabella è distinta da public.analisi_xbrl_storico.

import { pool } from '@/lib/db';
import { assicuraTabellaXbrlAzienda } from '@/db/provision';
import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import type {
  AnalisiXbrlResult,
  DatiFinanziariPeriodo,
  IndiceCcii,
  SituazioneDebitoria,
  AlertSeverity,
} from '@/lib/xbrl/types';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface BilancioStoricoAzienda {
  id: number;
  aziendaId: number;
  annoBilancio: number | null;
  nomeFile: string | null;
  datiFinanziari: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  situazioneDebitoria: SituazioneDebitoria;
  severity: AlertSeverity;
  createdAt: string;
}

export interface RisultatoStoricoXbrlAzienda {
  success: boolean;
  storico: BilancioStoricoAzienda[];
  error?: string;
}

export async function ottieniStoricoXbrlAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoStoricoXbrlAzienda> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, storico: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaXbrlAzienda(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, azienda_id, anno_bilancio, nome_file, dati_finanziari, indici, altri_indici, situazione_debitoria, severity, created_at
       FROM "${nomeSchema}".xbrl_storico_azienda
       WHERE azienda_id = $1
       ORDER BY anno_bilancio ASC NULLS LAST, created_at ASC`,
      [aziendaId]
    );

    return {
      success: true,
      storico: risultato.rows.map((r) => ({
        id: r.id,
        aziendaId: r.azienda_id,
        annoBilancio: r.anno_bilancio,
        nomeFile: r.nome_file,
        datiFinanziari: r.dati_finanziari,
        indici: r.indici,
        altriIndici: r.altri_indici,
        situazioneDebitoria: r.situazione_debitoria,
        severity: r.severity,
        createdAt: r.created_at.toString(),
      })),
    };
  } catch (error: any) {
    console.error('[ottieniStoricoXbrlAzienda] Errore:', error);
    return {
      success: false,
      storico: [],
      error: `Impossibile caricare lo storico XBRL: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneXbrlAzienda {
  success: boolean;
  error?: string;
  /** Presente solo se il codice ATECO dell'azienda è stato aggiornato con quello (diverso) trovato nel file XBRL appena caricato. */
  atecoAggiornato?: { precedente: string | null; nuovo: string };
}

/**
 * Salva (upsert) il risultato di un'analisi XBRL già effettuata (via
 * /api/xbrl/parse) come bilancio storico di un'azienda. Un nuovo
 * salvataggio per lo stesso anno sovrascrive il precedente, non lo
 * duplica — stessa convenzione della tabella globale del superadmin.
 */
export async function salvaAnalisiXbrlAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  analisi: AnalisiXbrlResult
): Promise<RisultatoOperazioneXbrlAzienda> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    await assicuraTabellaXbrlAzienda(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".xbrl_storico_azienda
         (azienda_id, anno_bilancio, nome_file, dati_finanziari, indici, altri_indici, situazione_debitoria, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (azienda_id, anno_bilancio)
       DO UPDATE SET
         nome_file = EXCLUDED.nome_file,
         dati_finanziari = EXCLUDED.dati_finanziari,
         indici = EXCLUDED.indici,
         altri_indici = EXCLUDED.altri_indici,
         situazione_debitoria = EXCLUDED.situazione_debitoria,
         severity = EXCLUDED.severity,
         created_at = now()`,
      [
        aziendaId,
        analisi.annoBilancio,
        analisi.meta.nomeFile,
        JSON.stringify(analisi.corrente),
        JSON.stringify(analisi.indici),
        JSON.stringify(analisi.altriIndici),
        JSON.stringify(analisi.situazioneDebitoria),
        analisi.severity,
      ]
    );

    // Un file XBRL contiene sempre anche l'anno precedente (comparativo
    // per obbligo della tassonomia), già estratto dal parser — prima
    // veniva scartato qui, salvando solo l'anno corrente. Se ha dati
    // reali (non un conto economico completamente a zero, segno che il
    // file non aveva davvero un comparativo), lo si salva come riga di
    // storico a sé, con indici calcolati sui suoi stessi numeri — non
    // derivati o approssimati, lo stesso motore usato per l'anno
    // corrente applicato ai dati di quell'anno.
    const precedenteHaDatiReali =
      analisi.annoBilancio !== null &&
      (analisi.precedente.ricaviVendite !== 0 ||
        analisi.precedente.valoreProduzione !== 0 ||
        analisi.precedente.costiProduzione !== 0 ||
        analisi.precedente.totaleAttivo !== 0);

    if (precedenteHaDatiReali) {
      const bundle = costruisciBundleIndici(analisi.precedente);

      await pool.query(
        `INSERT INTO "${nomeSchema}".xbrl_storico_azienda
           (azienda_id, anno_bilancio, nome_file, dati_finanziari, indici, altri_indici, situazione_debitoria, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (azienda_id, anno_bilancio) DO NOTHING`,
        [
          aziendaId,
          (analisi.annoBilancio as number) - 1,
          `${analisi.meta.nomeFile} (comparativo, dedotto dal bilancio ${analisi.annoBilancio})`,
          JSON.stringify(analisi.precedente),
          JSON.stringify(bundle.indici),
          JSON.stringify(bundle.altriIndici),
          JSON.stringify(bundle.situazioneDebitoria),
          bundle.severity,
        ]
      );
      // DO NOTHING, non DO UPDATE: se per quell'anno esiste già una riga
      // (es. caricato in precedenza come bilancio a sé, con dati propri
      // magari più completi/autorevoli), non la si sovrascrive con una
      // versione dedotta da un altro file.
    }

    // Sincronizzazione del codice ATECO: se il file XBRL (fonte CCIAA)
    // porta un codice diverso da quello in anagrafica, vince il file —
    // un operatore può aver omesso o sbagliato il campo per distrazione,
    // il file no. Aggiorna l'anagrafica invece di lasciarla incompleta e
    // bloccare le fasi di analisi che dipendono dall'ATECO.
    let atecoAggiornato: { precedente: string | null; nuovo: string } | undefined;
    const atecoXbrl = analisi.anagrafica.codiceAteco?.trim() || null;
    if (atecoXbrl) {
      const aziendaRisultato = await pool.query(
        `SELECT codice_ateco FROM "${nomeSchema}".aziende WHERE id = $1`,
        [aziendaId]
      );
      const atecoAttuale: string | null = aziendaRisultato.rows[0]?.codice_ateco || null;
      if (atecoAttuale !== atecoXbrl) {
        await pool.query(`UPDATE "${nomeSchema}".aziende SET codice_ateco = $1 WHERE id = $2`, [
          atecoXbrl,
          aziendaId,
        ]);
        atecoAggiornato = { precedente: atecoAttuale, nuovo: atecoXbrl };
      }
    }

    return { success: true, atecoAggiornato };
  } catch (error: any) {
    console.error('[salvaAnalisiXbrlAziendaAction] Errore:', error);
    return { success: false, error: `Impossibile salvare l'analisi: ${error.message || error}` };
  }
}

export async function eliminaAnalisiXbrlAziendaAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneXbrlAzienda> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(`DELETE FROM "${nomeSchema}".xbrl_storico_azienda WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaAnalisiXbrlAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare il bilancio: ${error.message || error}`,
    };
  }
}
