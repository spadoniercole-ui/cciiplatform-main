// src/app/api/xbrl/tag-mapping/route.ts
//
// Persiste le correzioni manuali fatte dalla UI di parificazione tag
// (src/components/xbrl/caricamento/FunzioneParificazioneTag.tsx) nella
// tabella xbrl_tag_mappings. Da questo momento in poi, ogni nuovo file
// XBRL caricato beneficia di queste correzioni: non serve rifarle a mano
// per ogni bilancio con la stessa tassonomia.
//
// SQL diretto tramite il Pool di src/lib/db.ts, coerente con come vengono
// gestite tutte le altre tabelle di sistema globali di questo progetto
// (licenze, sessioni, indici, parametri_sistema) — vedi la nota in
// src/lib/xbrl/tagMapping.ts.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface OverrideTag {
  aliasTag: string;
  canonicalKey: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const overrides: OverrideTag[] = body?.overrides;

    if (!Array.isArray(overrides) || overrides.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna correzione da salvare: "overrides" deve essere un array non vuoto.' },
        { status: 400 }
      );
    }

    for (const override of overrides) {
      if (!override.aliasTag || !override.canonicalKey) continue;

      await pool.query(
        `INSERT INTO xbrl_tag_mappings (alias_tag, canonical_key, note)
         VALUES ($1, $2, $3)
         ON CONFLICT (alias_tag)
         DO UPDATE SET canonical_key = EXCLUDED.canonical_key, note = COALESCE(EXCLUDED.note, xbrl_tag_mappings.note)`,
        [
          override.aliasTag,
          override.canonicalKey,
          override.note ?? 'Parificazione manuale da UI superadmin',
        ]
      );
    }

    return NextResponse.json({ success: true, salvati: overrides.length });
  } catch (err: any) {
    console.error('[api/xbrl/tag-mapping] Errore durante il salvataggio:', err);
    return NextResponse.json(
      { error: `Errore durante il salvataggio delle correzioni: ${err.message || err}` },
      { status: 500 }
    );
  }
}
