'use server';

// IL CATALOGO DELLE TL NEI PRODOTTI, E LE ASSOCIAZIONI ALLA MATERIA (0.157.0).
//
// Il flusso del lavoro è 1 → 2 → 3: direttrici e prodotti, lavorazioni, titoli
// di credito. Le TL — le tipologie di lavorazione — stanno al passo 1, dentro
// il prodotto a cui si applicano: è lì che l'ente sa che cosa fa su un DURC o
// su una Cassa Integrazione. La materia (passo 2) non le possiede più: le
// eredita, associandole ai propri codici. I titoli (passo 3) restano il punto
// in cui il codice dichiara la sua materia e, se vuole, un ufficio proprio.
//
// LE LETTURE SONO LE STESSE DI PRIMA. `ottieniLavorazioniMateria` continua a
// restituire una riga per (materia, TL): triage, check di perimetro, report per
// unità operativa e scheda dei titoli non cambiano una riga, cambia la
// sorgente. È deliberato — un cambio di modello che si propaga in sei letture
// è un cambio che si rompe in silenzio.
//
// Letture e scritture riservate all'Admin di spazio, come le altre voci dei
// Parametri: la pagina che le usa è già riservata, la guardia non si fida della
// pagina.

import { pool } from '@/lib/db';
import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabelleParametriSpazio, assicuraTabelleProdottiTl } from '@/db/provision';
import {
  normalizzaTlProdotto,
  rigaTlProdotto,
  validaTlProdotto,
  type InputTlProdotto,
  type TlProdotto,
} from '@/lib/titoliEnte/prodottiTl';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import { grafiaGiaUsata, registroDipendenze } from '@/lib/lavorazioni/dipendenze';
import {
  direttriceConfigurata,
  nomiDirettrici,
  pianificaRiallineamento,
} from '@/lib/titoliEnte/direttrici';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/**
 * Le grafie degli uffici già configurati nello spazio, dalla più autorevole
 * alla più vecchia: prima il catalogo delle TL (la configurazione di oggi),
 * poi i titoli dei codici, infine la tabella per tipologia di debito
 * (congelata, ma i suoi destinatari sono ancora quelli che ricevono i
 * documenti).
 *
 * Serve a una cosa sola: chi scrive «ufficio contributi» dove esiste già
 * «Ufficio Contributi» salva la grafia che c'è. Lo stesso ufficio smette così
 * di dividersi in due documenti diversi.
 */
async function grafieDegliUffici(nomeSchema: string, escludiId: number | null): Promise<string[]> {
  const leggi = async (sql: string, parametri: unknown[], campo: string): Promise<string[]> => {
    try {
      const r = await pool.query(sql, parametri);
      return r.rows.map((x) => String(x[campo] ?? ''));
    } catch {
      return [];
    }
  };

  return [
    ...(await leggi(
      `SELECT DISTINCT dipendenza FROM "${nomeSchema}".prodotti_tl
        WHERE dipendenza IS NOT NULL AND btrim(dipendenza) <> ''
          AND ($1::int IS NULL OR id <> $1::int)
        ORDER BY dipendenza`,
      [escludiId],
      'dipendenza'
    )),
    ...(await leggi(
      `SELECT DISTINCT dipendenza FROM "${nomeSchema}".titoli_ente
        WHERE dipendenza IS NOT NULL AND btrim(dipendenza) <> ''
        ORDER BY dipendenza`,
      [],
      'dipendenza'
    )),
    ...(await leggi(
      `SELECT DISTINCT destinatario FROM "${nomeSchema}".lavorazioni_tipo_debito
        WHERE btrim(destinatario) <> ''
        ORDER BY destinatario`,
      [],
      'destinatario'
    )),
  ];
}

/** I nomi delle direttrici dello spazio: sono loro a dare il nome all'ufficio. */
async function direttriciDelloSpazio(nomeSchema: string): Promise<string[]> {
  try {
    const r = await pool.query(
      `SELECT direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    return nomiDirettrici(
      (r.rows[0]?.direttrici_ente_strutturate as { nome: string }[] | null) ?? []
    );
  } catch {
    return [];
  }
}

/** La grafia canonica dell'ufficio: quella delle direttrici, o quella già in uso. */
async function ufficioCanonico(
  nomeSchema: string,
  dipendenza: string | null,
  escludiId: number | null
): Promise<string | null> {
  if (!dipendenza) return null;
  const direttrici = await direttriciDelloSpazio(nomeSchema);
  const registro = registroDipendenze(await grafieDegliUffici(nomeSchema, escludiId));
  return (
    direttriceConfigurata(dipendenza, direttrici) ??
    grafiaGiaUsata(dipendenza, registro) ??
    dipendenza
  );
}

function daRigaLavorazione(r: Record<string, unknown>): LavorazioneMateria {
  return {
    id: Number(r.id),
    materiaId: Number(r.materia_id),
    tipologia: String(r.tipologia ?? ''),
    dipendenza: (r.dipendenza as string | null) ?? null,
    procedura: (r.procedura as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ordine: Number(r.ordine ?? 0),
    rilevantePerimetro: r.rilevante_perimetro === true,
    versoPerimetro:
      r.verso_perimetro === 'COLLABORATIVA' || r.verso_perimetro === 'RESISTENZA'
        ? r.verso_perimetro
        : null,
  };
}

/**
 * Le TL che una materia eredita, nella forma che tutte le letture conoscono.
 *
 * L'ordine è quello della materia (poi quello del catalogo): è la sequenza in
 * cui l'ufficio le esegue, e la prima è quella che il titolo del codice
 * eredita.
 */
export async function ottieniLavorazioniMateria(
  nomeSchema: string
): Promise<{ success: boolean; lavorazioni: LavorazioneMateria[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema))
      return { success: false, lavorazioni: [], error: 'Nome schema non valido.' };
    await assicuraTabelleProdottiTl(nomeSchema);
    const r = await pool.query(
      `SELECT t.id, a.materia_id, t.tipologia, t.dipendenza, t.procedura, t.esito,
              a.ordine AS ordine, t.rilevante_perimetro, t.verso_perimetro
         FROM "${nomeSchema}".materia_tl a
         JOIN "${nomeSchema}".prodotti_tl t ON t.id = a.tl_id
        ORDER BY a.materia_id, a.ordine ASC, t.id ASC`
    );
    return { success: true, lavorazioni: r.rows.map(daRigaLavorazione) };
  } catch (error: unknown) {
    console.error('[ottieniLavorazioniMateria]', error);
    return {
      success: false,
      lavorazioni: [],
      error: `Impossibile leggere le lavorazioni delle materie: ${(error as Error).message || error}`,
    };
  }
}

/** Il catalogo completo, con quante materie ereditano ogni TL. */
export async function ottieniCatalogoTl(
  nomeSchema: string
): Promise<{ success: boolean; tl: TlProdotto[]; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema))
      return { success: false, tl: [], error: 'Nome schema non valido.' };
    await assicuraTabelleProdottiTl(nomeSchema);
    const r = await pool.query(
      `SELECT t.id, t.direttrice, t.prodotto, t.tipologia, t.dipendenza, t.procedura,
              t.esito, t.ordine, t.rilevante_perimetro, t.verso_perimetro,
              (SELECT COUNT(*) FROM "${nomeSchema}".materia_tl a WHERE a.tl_id = t.id) AS materie
         FROM "${nomeSchema}".prodotti_tl t
        ORDER BY t.direttrice, t.prodotto, t.ordine, t.id`
    );
    return { success: true, tl: r.rows.map(rigaTlProdotto) };
  } catch (error: unknown) {
    console.error('[ottieniCatalogoTl]', error);
    return {
      success: false,
      tl: [],
      error: `Impossibile leggere il catalogo delle TL: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Crea o aggiorna una TL del prodotto.
 *
 * Il prodotto lo sceglie la pagina fra quelli configurati sulla direttrice, ma
 * il server non si fida: accetta qualunque nome non vuoto, perché un ente può
 * aggiungere il prodotto proprio mentre scrive la TL — e una TL rifiutata è
 * lavoro perso. Il nome dell'ufficio sì, viene ricondotto alla grafia
 * configurata: due nomi per lo stesso ufficio sono due documenti.
 */
export async function salvaTlProdottoAction(
  nomeSchema: string,
  input: InputTlProdotto
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const errore = validaTlProdotto(input);
    if (errore) return { success: false, error: errore };
    const dato = normalizzaTlProdotto(input);
    await assicuraTabelleProdottiTl(nomeSchema);

    dato.dipendenza = await ufficioCanonico(nomeSchema, dato.dipendenza, dato.id ?? null);

    if (dato.id != null) {
      if (!Number.isInteger(dato.id) || dato.id <= 0)
        return { success: false, error: 'TL non valida.' };
      const r = await pool.query(
        `UPDATE "${nomeSchema}".prodotti_tl
            SET direttrice = $2, prodotto = $3, tipologia = $4, dipendenza = $5,
                procedura = $6, esito = $7, rilevante_perimetro = $8,
                verso_perimetro = $9, aggiornato_il = now()
          WHERE id = $1
          RETURNING id`,
        [
          dato.id,
          dato.direttrice,
          dato.prodotto,
          dato.tipologia,
          dato.dipendenza,
          dato.procedura,
          dato.esito,
          dato.rilevantePerimetro === true,
          dato.versoPerimetro,
        ]
      );
      if ((r.rowCount ?? 0) === 0) return { success: false, error: 'TL non trovata.' };
      return { success: true, id: dato.id };
    }

    // Lo stesso prodotto non porta due volte la stessa TL: sarebbe la stessa
    // lavorazione scritta due volte, e il triage chiederebbe due volte la stessa
    // risposta.
    const doppia = await pool.query(
      `SELECT 1 FROM "${nomeSchema}".prodotti_tl
        WHERE lower(btrim(direttrice)) = lower(btrim($1))
          AND lower(btrim(prodotto)) = lower(btrim($2))
          AND lower(btrim(tipologia)) = lower(btrim($3))`,
      [dato.direttrice, dato.prodotto, dato.tipologia]
    );
    if ((doppia.rowCount ?? 0) > 0)
      return {
        success: false,
        error: 'Questa TL esiste già nel prodotto: modificala invece di aggiungerla.',
      };

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
         FROM "${nomeSchema}".prodotti_tl
        WHERE lower(btrim(direttrice)) = lower(btrim($1))
          AND lower(btrim(prodotto)) = lower(btrim($2))`,
      [dato.direttrice, dato.prodotto]
    );
    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".prodotti_tl
         (direttrice, prodotto, tipologia, dipendenza, procedura, esito, ordine,
          rilevante_perimetro, verso_perimetro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        dato.direttrice,
        dato.prodotto,
        dato.tipologia,
        dato.dipendenza,
        dato.procedura,
        dato.esito,
        Number(ordine.rows[0]?.n ?? 1),
        dato.rilevantePerimetro === true,
        dato.versoPerimetro,
      ]
    );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: unknown) {
    console.error('[salvaTlProdottoAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Toglie una TL dal catalogo, e con lei le associazioni alle materie.
 *
 * Le risposte della check di perimetro restano dove sono: se la TL viene
 * ricreata con lo stesso id non succede (gli id non si riusano), ma una
 * risposta orfana non blocca nulla — il triage legge solo le TL esistenti.
 */
export async function eliminaTlProdottoAction(
  nomeSchema: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'TL non valida.' };
    await assicuraTabelleProdottiTl(nomeSchema);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${nomeSchema}".materia_tl WHERE tl_id = $1`, [id]);
      const r = await client.query(
        `DELETE FROM "${nomeSchema}".prodotti_tl WHERE id = $1 RETURNING id`,
        [id]
      );
      if ((r.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'TL non trovata.' };
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
    return { success: true };
  } catch (error: unknown) {
    console.error('[eliminaTlProdottoAction]', error);
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** La materia eredita una TL del catalogo. */
export async function collegaTlMateriaAction(
  nomeSchema: string,
  materiaId: number,
  tlId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(materiaId) || materiaId <= 0 || !Number.isInteger(tlId) || tlId <= 0)
      return { success: false, error: 'Materia o TL non valida.' };
    await assicuraTabelleProdottiTl(nomeSchema);

    const materia = await pool.query(`SELECT 1 FROM "${nomeSchema}".materie_ente WHERE id = $1`, [
      materiaId,
    ]);
    if ((materia.rowCount ?? 0) === 0)
      return { success: false, error: 'Materia non riconosciuta.' };
    const tl = await pool.query(`SELECT 1 FROM "${nomeSchema}".prodotti_tl WHERE id = $1`, [tlId]);
    if ((tl.rowCount ?? 0) === 0) return { success: false, error: 'TL non riconosciuta.' };

    const ordine = await pool.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS n
         FROM "${nomeSchema}".materia_tl WHERE materia_id = $1`,
      [materiaId]
    );
    await pool.query(
      `INSERT INTO "${nomeSchema}".materia_tl (materia_id, tl_id, ordine)
       VALUES ($1, $2, $3)
       ON CONFLICT (materia_id, tl_id) DO NOTHING`,
      [materiaId, tlId, Number(ordine.rows[0]?.n ?? 1)]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[collegaTlMateriaAction]', error);
    return {
      success: false,
      error: `Associazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** La materia smette di ereditare una TL. La TL resta nel catalogo. */
export async function scollegaTlMateriaAction(
  nomeSchema: string,
  materiaId: number,
  tlId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(materiaId) || materiaId <= 0 || !Number.isInteger(tlId) || tlId <= 0)
      return { success: false, error: 'Materia o TL non valida.' };
    await assicuraTabelleProdottiTl(nomeSchema);
    await pool.query(
      `DELETE FROM "${nomeSchema}".materia_tl WHERE materia_id = $1 AND tl_id = $2`,
      [materiaId, tlId]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[scollegaTlMateriaAction]', error);
    return {
      success: false,
      error: `Rimozione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/**
 * RIPORTA UN UFFICIO FUORI ELENCO A UNA DIRETTRICE (0.139.1).
 *
 * Un ufficio che non è tra le direttrici ha un nome che vale solo per sé: le
 * sue posizioni finiscono in un documento a parte, e nessuno se ne accorge
 * finché non arriva in fondo alla catena. Qui si sposta il nome — nelle TL del
 * catalogo e nei titoli che lo dichiarano — sulla direttrice indicata, con la
 * grafia scritta nei Parametri. È un comando solo perché toccare trenta righe a
 * mano è il modo in cui l'ufficio si risdoppia.
 *
 * Le due scritture stanno in una transazione: o si sposta tutto, o niente.
 */
export async function riallineaUfficioAllaDirettriceAction(
  nomeSchema: string,
  da: string,
  a: string
): Promise<{
  success: boolean;
  destinazione?: string;
  lavorazioni?: number;
  codici?: number;
  error?: string;
}> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleProdottiTl(nomeSchema);
    // I titoli vivono in una tabella che potrebbe non essere ancora nata in uno
    // spazio nuovo: la crea la stessa funzione che usa la pagina dei titoli.
    await assicuraTabelleParametriSpazio(nomeSchema);

    const direttrici = await direttriciDelloSpazio(nomeSchema);
    const lavorazioni = await pool.query(`SELECT id, dipendenza FROM "${nomeSchema}".prodotti_tl`);
    const titoli = await pool.query(`SELECT id, dipendenza FROM "${nomeSchema}".titoli_ente`);

    const pianificato = pianificaRiallineamento({
      da,
      a,
      direttrici,
      lavorazioni: lavorazioni.rows.map((r) => ({
        id: Number(r.id),
        dipendenza: (r.dipendenza as string | null) ?? null,
      })),
      titoli: titoli.rows.map((r) => ({
        id: Number(r.id),
        dipendenza: (r.dipendenza as string | null) ?? null,
      })),
    });
    if (!pianificato.ok) return { success: false, error: pianificato.error };
    const { piano } = pianificato;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (piano.lavorazioni.length > 0)
        await client.query(
          `UPDATE "${nomeSchema}".prodotti_tl
              SET dipendenza = $2, aggiornato_il = now()
            WHERE id = ANY($1::int[])`,
          [piano.lavorazioni, piano.destinazione]
        );
      if (piano.codici.length > 0)
        await client.query(
          `UPDATE "${nomeSchema}".titoli_ente
              SET dipendenza = $2, aggiornato_il = now()
            WHERE id = ANY($1::int[])`,
          [piano.codici, piano.destinazione]
        );
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return {
      success: true,
      destinazione: piano.destinazione,
      lavorazioni: piano.lavorazioni.length,
      codici: piano.codici.length,
    };
  } catch (error: unknown) {
    console.error('[riallineaUfficioAllaDirettriceAction]', error);
    return {
      success: false,
      error: `Riallineamento non riuscito: ${(error as Error).message || error}`,
    };
  }
}

/**
 * RINOMINA IN BLOCCO IL PRODOTTO DELLE TL IMPORTATE (0.158.0).
 *
 * Le TL copiate dalle vecchie `materie_lavorazione` non avevano un prodotto:
 * la copia ha messo il nome della lavorazione anche come prodotto. Il risultato
 * è un prodotto che nessuna direttrice ha configurato — la TL resta fuori
 * sequenza e il nome resta doppio.
 *
 * Qui si rinomina il prodotto di tutte le TL della direttrice in una volta. Non
 * è una rinomina della TL: è la chiave che le tiene insieme, e cambiarla una
 * riga per volta è il modo in cui i doppioni tornano. La pagina aggiunge il
 * nome nuovo ai prodotti della direttrice, così la catena resta in piedi.
 */
export async function rinominaProdottoTlAction(
  nomeSchema: string,
  direttrice: string,
  da: string,
  a: string
): Promise<{ success: boolean; rinominati?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const ufficio = String(direttrice ?? '').trim();
    const vecchio = String(da ?? '').trim();
    const nuovo = String(a ?? '').trim();
    if (!ufficio) return { success: false, error: 'Indica la direttrice.' };
    if (!vecchio) return { success: false, error: 'Indica il prodotto da rinominare.' };
    if (!nuovo) return { success: false, error: 'Indica il nome nuovo del prodotto.' };
    if (vecchio.toLowerCase() === nuovo.toLowerCase())
      return { success: false, error: 'Il nome nuovo è uguale a quello attuale.' };
    await assicuraTabelleProdottiTl(nomeSchema);

    // Rinominare su un prodotto che ha già la stessa lavorazione creerebbe due
    // TL identiche sotto lo stesso prodotto: il doppione che il comando deve
    // togliere, non crearne uno nuovo.
    const doppioni = await pool.query(
      `SELECT 1
         FROM "${nomeSchema}".prodotti_tl x
         JOIN "${nomeSchema}".prodotti_tl y
           ON lower(btrim(y.direttrice)) = lower(btrim(x.direttrice))
          AND lower(btrim(y.prodotto)) = lower(btrim($3))
          AND lower(btrim(y.tipologia)) = lower(btrim(x.tipologia))
        WHERE lower(btrim(x.direttrice)) = lower(btrim($1))
          AND lower(btrim(x.prodotto)) = lower(btrim($2))
        LIMIT 1`,
      [ufficio, vecchio, nuovo]
    );
    if ((doppioni.rowCount ?? 0) > 0)
      return {
        success: false,
        error: `«${nuovo}» ha già una TL con la stessa lavorazione: uniscile prima dalla scheda del prodotto.`,
      };

    const r = await pool.query(
      `UPDATE "${nomeSchema}".prodotti_tl
          SET prodotto = $3, aggiornato_il = now()
        WHERE lower(btrim(direttrice)) = lower(btrim($1))
          AND lower(btrim(prodotto)) = lower(btrim($2))`,
      [ufficio, vecchio, nuovo]
    );
    const rinominati = r.rowCount ?? 0;
    if (rinominati === 0) return { success: false, error: 'Nessuna TL trovata su quel prodotto.' };
    return { success: true, rinominati };
  } catch (error: unknown) {
    console.error('[rinominaProdottoTlAction]', error);
    return { success: false, error: `Rinomina non riuscita: ${(error as Error).message || error}` };
  }
}
