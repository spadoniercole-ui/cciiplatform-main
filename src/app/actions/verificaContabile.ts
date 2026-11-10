'use server';

// LO STATO DELLA VERIFICA CONTABILE, AZIENDA PER AZIENDA.
//
// La verifica contabile si fa a livello azienda — visura storica, parametri
// dell'ente, bilanci XBRL, prospetto e indici — e non chiede più la
// certificazione dei debiti: quella è materia della verifica amministrativa e
// della verifica azienda. Qui si legge solo che cosa manca per poterla
// avviare, così il menu non manda l'operatore in una pagina vuota.
//
// Il debito memorizzato si mostra quando c'è, ma non è un requisito: serve
// alla verifica azienda, non a questa.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface StatoContabileAzienda {
  aziendaId: number;
  ragioneSociale: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  visuraPresente: boolean;
  visuraIl: string | null;
  /** Annualità XBRL distinte in archivio. */
  anniXbrl: number;
  /** true quando l'Anagrafica Ente ha almeno un campo compilato. */
  parametriPresenti: boolean;
  debitoMemorizzato: number | null;
  debitoMemorizzatoIl: string | null;
  /** Visura, parametri e almeno un bilancio: la contabile ha tutto. */
  completa: boolean;
}

export interface RisultatoStatoContabile {
  success: boolean;
  aziende: StatoContabileAzienda[];
  error?: string;
}

/**
 * L'elenco con lo stato. Se una delle tabelle opzionali non esiste ancora —
 * spazio nuovo, o contabile mai aperta — la lettura non fallisce: le colonne
 * mancanti valgono «assente», ed è esattamente ciò che la scheda deve dire.
 */
export async function statoVerificaContabileAction(
  nomeSchema: string
): Promise<RisultatoStatoContabile> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, aziende: [], error: 'Nome schema non valido.' };
    }

    const base = await pool.query(
      `SELECT id, ragione_sociale, partita_iva, codice_fiscale,
              visura_triage_url, to_char(visura_triage_il, 'YYYY-MM-DD') AS visura_il
         FROM "${nomeSchema}".aziende
        WHERE attiva = TRUE
        ORDER BY ragione_sociale ASC`
    );

    const anni = new Map<number, number>();
    await pool
      .query(
        `SELECT azienda_id, COUNT(DISTINCT anno_bilancio) AS anni
           FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE anno_bilancio IS NOT NULL
          GROUP BY azienda_id`
      )
      .then((r) => r.rows.forEach((x) => anni.set(Number(x.azienda_id), Number(x.anni))))
      .catch(() => undefined);

    const parametri = new Set<number>();
    await pool
      .query(
        `SELECT azienda_id FROM "${nomeSchema}".anagrafica_ente
          WHERE COALESCE(id_ente, '') <> ''
             OR ${Array.from({ length: 10 }, (_, i) => `COALESCE(campo_${i + 1}, '') <> ''`).join(' OR ')}`
      )
      .then((r) => r.rows.forEach((x) => parametri.add(Number(x.azienda_id))))
      .catch(() => undefined);

    const debiti = new Map<number, { totale: number; il: string | null }>();
    await pool
      .query(
        `SELECT azienda_id, totale, to_char(memorizzato_il, 'YYYY-MM-DD') AS il
           FROM "${nomeSchema}".debiti_ente_memorizzati`
      )
      .then((r) =>
        r.rows.forEach((x) =>
          debiti.set(Number(x.azienda_id), {
            totale: Number(x.totale),
            il: x.il ? String(x.il) : null,
          })
        )
      )
      .catch(() => undefined);

    const aziende: StatoContabileAzienda[] = base.rows.map((r) => {
      const id = Number(r.id);
      const visuraPresente = Boolean(r.visura_triage_url);
      const anniXbrl = anni.get(id) ?? 0;
      const parametriPresenti = parametri.has(id);
      const debito = debiti.get(id);
      return {
        aziendaId: id,
        ragioneSociale: String(r.ragione_sociale ?? ''),
        partitaIva: r.partita_iva ? String(r.partita_iva) : null,
        codiceFiscale: r.codice_fiscale ? String(r.codice_fiscale) : null,
        visuraPresente,
        visuraIl: r.visura_il ? String(r.visura_il) : null,
        anniXbrl,
        parametriPresenti,
        debitoMemorizzato: debito?.totale ?? null,
        debitoMemorizzatoIl: debito?.il ?? null,
        completa: visuraPresente && parametriPresenti && anniXbrl > 0,
      };
    });

    return { success: true, aziende };
  } catch (error: unknown) {
    console.error('[statoVerificaContabileAction] Errore:', error);
    return {
      success: false,
      aziende: [],
      error: `Impossibile leggere lo stato della verifica contabile: ${(error as Error).message}`,
    };
  }
}
