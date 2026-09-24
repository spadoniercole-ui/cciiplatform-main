'use server';

// Parametri di stampa dell'ente: margini, intestazione, pie' di pagina, logo.

import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { PARAMETRI_STAMPA_PREDEFINITI, type ParametriStampa } from '@/lib/stampaTesto';

const LIMITE_LOGO = 400_000; // caratteri del data URL (~300 KB di immagine)

function daRiga(
  r: Record<string, unknown> | undefined
): ParametriStampa & { logoNome: string | null } {
  if (!r) return { ...PARAMETRI_STAMPA_PREDEFINITI, logoNome: null };
  const m = (r.margini ?? {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(5, Math.min(40, v)) : d;
  const base = PARAMETRI_STAMPA_PREDEFINITI.margini;
  return {
    margini: {
      alto: n(m.alto, base.alto),
      destro: n(m.destro, base.destro),
      basso: n(m.basso, base.basso),
      sinistro: n(m.sinistro, base.sinistro),
    },
    intestazione: (r.intestazione as string | null) ?? null,
    piePagina: (r.pie_pagina as string | null) ?? null,
    logoDataUrl: (r.logo_data_url as string | null) ?? null,
    logoNome: (r.logo_nome as string | null) ?? null,
  };
}

export async function ottieniParametriStampaAction(nomeSchema: string): Promise<{
  success: boolean;
  parametri: ParametriStampa & { logoNome: string | null };
  error?: string;
}> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, parametri: daRiga(undefined), error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".parametri_stampa WHERE id = 1`);
    return { success: true, parametri: daRiga(r.rows[0]) };
  } catch (error: unknown) {
    return {
      success: false,
      parametri: daRiga(undefined),
      error: `Lettura non riuscita: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaParametriStampaAction(
  codiceSpazio: string,
  p: {
    margini: ParametriStampa['margini'];
    intestazione: string | null;
    piePagina: string | null;
    logoDataUrl: string | null;
    logoNome: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    if (
      p.logoDataUrl &&
      (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(p.logoDataUrl) ||
        p.logoDataUrl.length > LIMITE_LOGO)
    )
      return {
        success: false,
        error: 'Logo non accettato: usa un PNG, JPEG, WEBP o SVG fino a circa 300 KB.',
      };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".parametri_stampa (id, margini, intestazione, pie_pagina, logo_data_url, logo_nome, aggiornato_il)
       VALUES (1, $1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET margini = $1, intestazione = $2, pie_pagina = $3, logo_data_url = $4, logo_nome = $5, aggiornato_il = now()`,
      [
        JSON.stringify(p.margini),
        p.intestazione?.trim() || null,
        p.piePagina?.trim() || null,
        p.logoDataUrl,
        p.logoNome,
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}
