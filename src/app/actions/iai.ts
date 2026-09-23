'use server';

// Indice di Attenzione Istruttoria: raccoglie i dati che la piattaforma ha
// gia' (soglie dell'ente, bilanci, fascicolo, fatti della visura) e li passa
// al motore puro (src/lib/iai/indice.ts). Nessuna AI.

import { pool } from '@/lib/db';
import { assicuraTabellaXbrlAzienda, assicuraTabelleScreeningAzienda } from '@/db/provision';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { ottieniFascicoloAction } from '@/app/actions/fascicoloEvidenza';
import { riepilogoFascicolo } from '@/lib/fascicolo/evidenza';
import { avvisiDaFattiVisura, normalizzaFattiVisura, proceduraPendente } from '@/lib/visura/fatti';
import { calcolaIai, type DatiIai, type EsitoIai } from '@/lib/iai/indice';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;

export async function calcolaIaiAction(
  nomeSchema: string,
  aziendaId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<{ success: boolean; esito?: EsitoIai; dati?: DatiIai; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaXbrlAzienda(nomeSchema);
    await assicuraTabelleScreeningAzienda(nomeSchema);

    // A. soglie dell'ente
    const soglie = await valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio);
    const righeSoglie =
      soglie.success && soglie.esito ? soglie.esito.righe.filter((r) => r.applicabile) : [];

    // fascicolo dell'azienda
    const fasc = await ottieniFascicoloAction(nomeSchema, aziendaId, null);
    const evidenze = fasc.success && fasc.fascicolo ? fasc.fascicolo : [];
    const riep = riepilogoFascicolo(evidenze);

    // B/C. bilanci: due esercizi
    const bil = await pool.query(
      `SELECT anno_bilancio, dati_finanziari FROM "${nomeSchema}".xbrl_storico_azienda WHERE azienda_id = $1 ORDER BY anno_bilancio DESC NULLS LAST LIMIT 2`,
      [aziendaId]
    );
    const leggi = (r: Record<string, unknown> | undefined) => {
      if (!r) return null;
      const d = (r.dati_finanziari ?? {}) as Record<string, unknown>;
      const totaleDebiti = num(d.totaleDebiti);
      const disagg = [
        d.debitiBanche,
        d.debitiFornitori,
        d.debitiTributari,
        d.debitiPrevidenziali,
      ].map(num);
      return {
        anno: num(r.anno_bilancio),
        ricavi: num(d.ricaviVendite),
        ebitda: num(d.ebitda),
        utile: num(d.utileEsercizio),
        totaleAttivo: num(d.totaleAttivo),
        attivoCircolante: num(d.attivoCircolante),
        patrimonioNetto: num(d.patrimonioNetto),
        totaleDebiti,
        debitiNonDisaggregati:
          (totaleDebiti ?? 0) > 0 && disagg.every((v) => v === null || v === 0),
      };
    };
    const corrente = leggi(bil.rows[0]);
    const prec = leggi(bil.rows[1]);

    // E. visura
    const scr = await pool.query(
      `SELECT visura_fatti FROM "${nomeSchema}".azienda_screening WHERE azienda_id = $1`,
      [aziendaId]
    );
    const fatti = scr.rows[0]?.visura_fatti
      ? normalizzaFattiVisura(scr.rows[0].visura_fatti)
      : null;
    const oggi = new Date().toISOString().slice(0, 10);
    const pendente = fatti?.procedureConcorsuali.find(proceduraPendente) ?? null;
    const avvisi = fatti ? avvisiDaFattiVisura(fatti, oggi) : [];

    const dati: DatiIai = {
      ente: {
        soglie: righeSoglie.map((r) => ({
          ambito: r.ambito,
          esito: r.esito,
          esposizione: r.esposizione,
        })),
        importiNonNoti: riep.IMPORTO_NON_NOTO,
        denunceAssenti: null,
        addetti: fatti?.addetti?.numero ?? null,
      },
      bilancio: {
        corrente,
        precedente: prec
          ? { ricavi: prec.ricavi, utile: prec.utile, patrimonioNetto: prec.patrimonioNetto }
          : null,
      },
      fascicolo: {
        totale: evidenze.length,
        titoloEnte: riep.TITOLO_ENTE,
        dichiarato: riep.DICHIARATO,
        nonNoti: riep.IMPORTO_NON_NOTO,
      },
      visura: {
        disponibile: fatti !== null,
        proceduraPendente: pendente
          ? `${pendente.tipo}${pendente.data ? ` del ${pendente.data.split('-').reverse().join('/')}` : ''}${pendente.tribunale ? ` (${pendente.tribunale})` : ''}`
          : null,
        statoAttivitaAnomalo: avvisi.find((a) => a.codice === 'STATO_ATTIVITA')
          ? (fatti?.statoAttivita ?? null)
          : null,
        giorniVisura: fatti?.dataVisura
          ? Math.floor((Date.parse(oggi) - Date.parse(fatti.dataVisura)) / 86_400_000)
          : null,
        capitaleSociale: fatti?.capitaleSociale ?? null,
      },
    };
    return { success: true, esito: calcolaIai(dati), dati };
  } catch (error: unknown) {
    console.error('[calcolaIaiAction]', error);
    return {
      success: false,
      error: `Impossibile calcolare l’indice: ${(error as Error).message || error}`,
    };
  }
}
