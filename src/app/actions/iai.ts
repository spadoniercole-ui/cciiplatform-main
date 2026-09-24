'use server';

// Indice di Attenzione Istruttoria: raccoglie i dati che la piattaforma ha
// gia' (soglie dell'ente, bilanci, fascicolo, fatti della visura) e li passa
// al motore puro (src/lib/iai/indice.ts). Nessuna AI.

import { pool } from '@/lib/db';
import {
  assicuraTabellaXbrlAzienda,
  assicuraTabelleScreeningAzienda,
  assicuraTabelleParametriSpazio,
} from '@/db/provision';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { ottieniFascicoloAction } from '@/app/actions/fascicoloEvidenza';
import { riepilogoFascicolo } from '@/lib/fascicolo/evidenza';
import { avvisiDaFattiVisura, normalizzaFattiVisura, proceduraPendente } from '@/lib/visura/fatti';
import {
  calcolaIai,
  parametriDaEnte,
  PARAMETRI_IAI_PREDEFINITI,
  type DatiIai,
  type EsitoIai,
  type ParametriIai,
} from '@/lib/iai/indice';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';

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
    await assicuraTabelleParametriSpazio(nomeSchema);
    const par = await pool.query(
      `SELECT parametri FROM "${nomeSchema}".parametri_iai WHERE id = 1`
    );
    const parametri = par.rows[0]?.parametri
      ? parametriDaEnte(par.rows[0].parametri)
      : PARAMETRI_IAI_PREDEFINITI;

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
    return { success: true, esito: calcolaIai(dati, parametri), dati };
  } catch (error: unknown) {
    console.error('[calcolaIaiAction]', error);
    return {
      success: false,
      error: `Impossibile calcolare l’indice: ${(error as Error).message || error}`,
    };
  }
}

export async function ottieniParametriIaiAction(
  nomeSchema: string
): Promise<{ success: boolean; parametri: ParametriIai; personalizzati: boolean; error?: string }> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return {
        success: false,
        parametri: PARAMETRI_IAI_PREDEFINITI,
        personalizzati: false,
        error: 'Nome schema non valido.',
      };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(`SELECT parametri FROM "${nomeSchema}".parametri_iai WHERE id = 1`);
    const p = r.rows[0]?.parametri;
    return {
      success: true,
      parametri: p ? parametriDaEnte(p) : PARAMETRI_IAI_PREDEFINITI,
      personalizzati: !!p,
    };
  } catch (error: unknown) {
    return {
      success: false,
      parametri: PARAMETRI_IAI_PREDEFINITI,
      personalizzati: false,
      error: `Lettura non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** Salva pesi e minimi dei vincoli dell'ente; null = torna ai predefiniti. */
export async function salvaParametriIaiAction(
  codiceSpazio: string,
  parametri: {
    pesi: ParametriIai['pesi'];
    vincoli: ParametriIai['vincoli'];
    notaNelReport: boolean;
  } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    if (parametri === null) {
      await pool.query(`DELETE FROM "${contesto.nomeSchema}".parametri_iai WHERE id = 1`);
      return { success: true };
    }
    const validi = parametriDaEnte(parametri);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".parametri_iai (id, parametri, aggiornato_il) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET parametri = $1, aggiornato_il = now()`,
      [
        JSON.stringify({
          pesi: validi.pesi,
          vincoli: validi.vincoli,
          notaNelReport: validi.notaNelReport,
        }),
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

/** I dati per l'allegato «Riferimenti e metodo» di un'azienda (Screening) o di uno scenario. */
export async function datiRiferimentiAction(
  nomeSchema: string,
  aziendaId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<{
  success: boolean;
  documenti?: { tipo: string; nomeFile: string; impronta: string; caricatoIl: string | null }[];
  fontiUsate?: string[];
  materie?: {
    nome: string;
    presupposto: string | null;
    riferimenti: string | null;
    confermataDa: string | null;
    confermataIl: string | null;
    codici: string[];
  }[];
  parametriIai?: ParametriIai;
  parametriPersonalizzati?: boolean;
  error?: string;
}> {
  try {
    if (!/^[a-z0-9_]+$/.test(nomeSchema))
      return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const docs = await pool.query(
      `SELECT tipo, nome_file, impronta, caricato_il FROM "${nomeSchema}".documenti_origine WHERE azienda_id = $1 ORDER BY caricato_il`,
      [aziendaId]
    );
    const soglie = await valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio);
    const fontiUsate =
      soglie.success && soglie.esito
        ? Array.from(
            new Set(soglie.esito.righe.map((r) => r.fonte).filter((f): f is string => !!f))
          )
        : [];
    const mat = await pool.query(
      `SELECT m.*, (SELECT string_agg(t.codice, ', ' ORDER BY t.codice) FROM "${nomeSchema}".titoli_ente t WHERE t.materia_id = m.id) AS codici FROM "${nomeSchema}".materie_ente m ORDER BY m.nome`
    );
    const par = await pool.query(
      `SELECT parametri FROM "${nomeSchema}".parametri_iai WHERE id = 1`
    );
    return {
      success: true,
      documenti: docs.rows.map((r) => ({
        tipo: String(r.tipo),
        nomeFile: String(r.nome_file),
        impronta: String(r.impronta),
        caricatoIl: r.caricato_il ? new Date(r.caricato_il).toISOString() : null,
      })),
      fontiUsate,
      materie: mat.rows.map((m) => ({
        nome: String(m.nome),
        presupposto: m.presupposto_giuridico ?? null,
        riferimenti: m.riferimenti_interni ?? null,
        confermataDa: m.confermata_da ?? null,
        confermataIl: m.confermata_il ? new Date(m.confermata_il).toISOString() : null,
        codici: m.codici ? String(m.codici).split(', ') : [],
      })),
      parametriIai: par.rows[0]?.parametri
        ? parametriDaEnte(par.rows[0].parametri)
        : PARAMETRI_IAI_PREDEFINITI,
      parametriPersonalizzati: !!par.rows[0]?.parametri,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Impossibile raccogliere i riferimenti: ${(error as Error).message || error}`,
    };
  }
}
