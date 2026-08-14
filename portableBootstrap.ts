// src/app/api/xbrl/storico/route.ts
//
// Persiste e legge lo storico delle analisi XBRL per azienda (tabella
// analisi_xbrl_storico, vedi src/db/sql/analisi_xbrl_storico.sql). SQL
// diretto tramite il Pool di src/lib/db.ts, coerente con come vengono
// gestite tutte le tabelle di sistema globali di questo progetto.
//
// POST: salva/aggiorna (upsert) l'analisi di un'azienda per un dato anno.
// GET ?codiceFiscale=...: restituisce tutte le analisi salvate per
// un'azienda, ordinate per anno di bilancio, per il confronto di trend.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';

export async function POST(req: NextRequest) {
  try {
    const body: { analisi: AnalisiXbrlResult } = await req.json();
    const analisi = body?.analisi;

    if (!analisi?.anagrafica?.codiceFiscale) {
      return NextResponse.json(
        { error: "Impossibile salvare: manca il codice fiscale nell'analisi." },
        { status: 400 }
      );
    }

    const risultato = await pool.query(
      `INSERT INTO analisi_xbrl_storico
         (codice_fiscale, ragione_sociale, anno_bilancio, nome_file, dati_finanziari, indici, altri_indici, situazione_debitoria, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (codice_fiscale, anno_bilancio)
       DO UPDATE SET
         ragione_sociale = EXCLUDED.ragione_sociale,
         nome_file = EXCLUDED.nome_file,
         dati_finanziari = EXCLUDED.dati_finanziari,
         indici = EXCLUDED.indici,
         altri_indici = EXCLUDED.altri_indici,
         situazione_debitoria = EXCLUDED.situazione_debitoria,
         severity = EXCLUDED.severity,
         created_at = now()
       RETURNING id`,
      [
        analisi.anagrafica.codiceFiscale,
        analisi.anagrafica.ragioneSociale || 'N/D',
        analisi.annoBilancio,
        analisi.meta?.nomeFile || null,
        JSON.stringify(analisi.corrente),
        JSON.stringify(analisi.indici),
        JSON.stringify(analisi.altriIndici || []),
        JSON.stringify(analisi.situazioneDebitoria),
        analisi.severity,
      ]
    );

    return NextResponse.json({ success: true, id: risultato.rows[0].id });
  } catch (err: any) {
    console.error('[api/xbrl/storico] Errore durante il salvataggio:', err);
    return NextResponse.json(
      { error: `Errore durante il salvataggio dello storico: ${err.message || err}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const codiceFiscale = req.nextUrl.searchParams.get('codiceFiscale');

    if (!codiceFiscale) {
      return NextResponse.json({ error: 'Parametro codiceFiscale obbligatorio.' }, { status: 400 });
    }

    const risultato = await pool.query(
      `SELECT id, ragione_sociale, anno_bilancio, nome_file, dati_finanziari, indici, altri_indici, situazione_debitoria, severity, created_at
       FROM analisi_xbrl_storico
       WHERE codice_fiscale = $1
       ORDER BY anno_bilancio ASC NULLS LAST, created_at ASC`,
      [codiceFiscale]
    );

    return NextResponse.json({ success: true, storico: risultato.rows });
  } catch (err: any) {
    console.error('[api/xbrl/storico] Errore durante la lettura:', err);
    return NextResponse.json(
      { error: `Errore durante la lettura dello storico: ${err.message || err}` },
      { status: 500 }
    );
  }
}
