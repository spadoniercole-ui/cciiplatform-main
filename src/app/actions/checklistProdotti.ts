'use server';

// LA CHECK LIST DEI PRODOTTI — generazione dal catalogo delle TL e risposte.
//
// Nasce dal catalogo, non dalla visura: una domanda per prodotto/lavorazione
// dice se quella parte del rapporto con l'ente è stata attivata. Si compila
// nel triage, subito prima dell'elaborazione.
//
// SENZA AI NON SI BLOCCA NULLA: se la chiave manca o il servizio non risponde,
// le domande si ricavano dal catalogo (una per TL) e la check list resta
// compilabile. Il triage non può dipendere da un servizio esterno per chiudersi.
//
// Le risposte già date sopravvivono a una rigenerazione quando la domanda è
// identica: chi ha risposto non ricomincia da capo solo perché il catalogo è
// stato rigenerato.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { assicuraTabellaChecklistProdotti, assicuraTabelleProdottiTl } from '@/db/provision';
import { consumaQuotaAi } from '@/lib/limiteAi';
import {
  domandeDaCatalogo,
  pulisciDomandeGenerate,
  sintesiChecklistProdotti,
  type RigaChecklistProdotto,
  type SintesiChecklistProdotti,
  type TlCatalogo,
} from '@/lib/checklist/prodotti';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 120 * 1000, maxRetries: 1 }) : null;

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface RisultatoChecklistProdotti {
  success: boolean;
  righe: RigaChecklistProdotto[];
  sintesi: SintesiChecklistProdotti;
  generataIl: string | null;
  error?: string;
}

const VUOTA: SintesiChecklistProdotti = {
  sezioni: [],
  totale: 0,
  risposte: 0,
  criticita: 0,
  senzaRisposta: [],
  completa: false,
};

async function leggiRighe(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoChecklistProdotti> {
  const r = await pool.query(
    `SELECT id, prodotto, direttrice, domanda, risposta, note, ordine, generato_il
       FROM "${nomeSchema}".checklist_prodotti
      WHERE azienda_id = $1
      ORDER BY prodotto, ordine, id`,
    [aziendaId]
  );
  const righe: RigaChecklistProdotto[] = r.rows.map((x) => ({
    id: Number(x.id),
    prodotto: String(x.prodotto),
    direttrice: (x.direttrice as string | null) ?? null,
    domanda: String(x.domanda),
    risposta: typeof x.risposta === 'boolean' ? x.risposta : null,
    note: (x.note as string | null) ?? null,
    ordine: Number(x.ordine ?? 0),
  }));
  const generataIl = r.rows[0]?.generato_il ? new Date(r.rows[0].generato_il).toISOString() : null;
  return {
    success: true,
    righe,
    sintesi: sintesiChecklistProdotti(righe),
    generataIl,
  };
}

export async function ottieniChecklistProdottiAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoChecklistProdotti> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return {
        success: false,
        righe: [],
        sintesi: VUOTA,
        generataIl: null,
        error: 'Nome schema non valido.',
      };
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabellaChecklistProdotti(nomeSchema);
    return await leggiRighe(nomeSchema, aziendaId);
  } catch (error: unknown) {
    console.error('[ottieniChecklistProdottiAction] Errore:', error);
    return {
      success: false,
      righe: [],
      sintesi: VUOTA,
      generataIl: null,
      error: `Lettura non riuscita: ${(error as Error).message}`,
    };
  }
}

/**
 * Genera (o rigenera) le domande. Il catalogo è la fonte: se è vuoto la
 * funzione lo dice, non inventa prodotti. Le risposte già date restano
 * agganciate alle domande che restano identiche.
 */
export async function generaChecklistProdottiAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoChecklistProdotti & { origine?: 'AI' | 'CATALOGO' }> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema))
      return {
        success: false,
        righe: [],
        sintesi: VUOTA,
        generataIl: null,
        error: 'Nome schema non valido.',
      };
    await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['checklist'],
      livello: 'SCRITTURA',
    });
    await assicuraTabellaChecklistProdotti(nomeSchema);
    await assicuraTabelleProdottiTl(nomeSchema);

    const catalogoRis = await pool.query(
      `SELECT id, direttrice, prodotto, tipologia, dipendenza, procedura, ordine
         FROM "${nomeSchema}".prodotti_tl
        ORDER BY direttrice NULLS LAST, prodotto, ordine NULLS LAST, id`
    );
    const catalogo: TlCatalogo[] = catalogoRis.rows.map((x) => ({
      id: Number(x.id),
      direttrice: String(x.direttrice ?? ''),
      prodotto: String(x.prodotto ?? ''),
      tipologia: String(x.tipologia ?? ''),
      dipendenza: (x.dipendenza as string | null) ?? null,
      procedura: (x.procedura as string | null) ?? null,
      ordine: x.ordine === null || x.ordine === undefined ? null : Number(x.ordine),
    }));

    if (catalogo.length === 0) {
      return {
        success: false,
        righe: [],
        sintesi: VUOTA,
        generataIl: null,
        error:
          'Il catalogo delle TL è vuoto: aggiungi direttrici, prodotti e lavorazioni in Parametri di Spazio → Direttrici e prodotti, poi rigenera la check list.',
      };
    }

    let domande = domandeDaCatalogo(catalogo);
    let origine: 'AI' | 'CATALOGO' = 'CATALOGO';

    if (anthropic) {
      const aziendaRis = await pool.query(
        `SELECT ragione_sociale, codice_ateco FROM "${nomeSchema}".aziende WHERE id = $1`,
        [aziendaId]
      );
      const azienda = aziendaRis.rows[0];
      const spazioRis = await pool
        .query(`SELECT id FROM public.spazi WHERE nome_schema = $1`, [nomeSchema])
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const quota = await consumaQuotaAi(pool, 'PROVVEDIMENTO', {
        utente: contesto.email ?? 'spazio',
        spazioId: spazioRis.rows[0]?.id ? Number(spazioRis.rows[0].id) : null,
      });
      if (quota.consentito) {
        const elenco = catalogo
          .map(
            (t) =>
              `- ${t.direttrice} / ${t.prodotto} / ${t.tipologia}${t.dipendenza ? ` (ufficio ${t.dipendenza})` : ''}`
          )
          .join('\n');
        const prompt = `Sei un funzionario di un ente creditore che prepara una check list di triage su un'azienda. Il catalogo dell'ente elenca direttrici, prodotti e lavorazioni (TL): per ciascun prodotto devi formulare domande chiuse a cui rispondere SÌ se la lavorazione risulta attivata/regolare nei confronti dell'azienda, NO se non risulta.

Azienda: ${azienda?.ragione_sociale ?? 'non indicata'}${azienda?.codice_ateco ? ` (ATECO ${azienda.codice_ateco})` : ''}.

CATALOGO (direttrice / prodotto / lavorazione):
${elenco}

Regole:
- massimo 40 domande, una per prodotto o per lavorazione, mai due volte lo stesso concetto;
- ogni domanda deve essere verificabile con i documenti dell'ente (prospetti, posizioni, visura) e non deve chiedere opinioni;
- il testo deve dire che cosa si verifica, in italiano, senza sigle non spiegate;
- "prodotto" deve essere uno di quelli del catalogo, scritto esattamente come sopra.

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{ "domande": [ { "prodotto": "…", "direttrice": "…", "domanda": "…" } ] }`;

        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 4000,
            thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: prompt }],
          });
          const testo = response.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .replace(/```json|```/g, '')
            .trim();
          const proposte = pulisciDomandeGenerate(JSON.parse(testo));
          if (proposte.length > 0) {
            domande = proposte;
            origine = 'AI';
          }
        } catch (erroreAi) {
          console.error(
            '[generaChecklistProdottiAction] AI non disponibile, uso il catalogo:',
            erroreAi
          );
        }
      }
    }

    // Le risposte già date, per domanda identica (prodotto + testo).
    const precedenti = await pool.query(
      `SELECT prodotto, domanda, risposta, note FROM "${nomeSchema}".checklist_prodotti WHERE azienda_id = $1`,
      [aziendaId]
    );
    const risposte = new Map<string, { risposta: boolean | null; note: string | null }>();
    for (const x of precedenti.rows) {
      risposte.set(`${String(x.prodotto).toLowerCase()}|${String(x.domanda).toLowerCase()}`, {
        risposta: typeof x.risposta === 'boolean' ? x.risposta : null,
        note: (x.note as string | null) ?? null,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${nomeSchema}".checklist_prodotti WHERE azienda_id = $1`, [
        aziendaId,
      ]);
      for (let i = 0; i < domande.length; i++) {
        const d = domande[i];
        const salvata = risposte.get(`${d.prodotto.toLowerCase()}|${d.domanda.toLowerCase()}`);
        await client.query(
          `INSERT INTO "${nomeSchema}".checklist_prodotti
             (azienda_id, prodotto, direttrice, domanda, risposta, note, ordine, generato_il, aggiornato_il)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
          [
            aziendaId,
            d.prodotto,
            d.direttrice,
            d.domanda,
            salvata?.risposta ?? null,
            salvata?.note ?? null,
            i,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }

    return { ...(await leggiRighe(nomeSchema, aziendaId)), origine };
  } catch (error: unknown) {
    console.error('[generaChecklistProdottiAction] Errore:', error);
    return {
      success: false,
      righe: [],
      sintesi: VUOTA,
      generataIl: null,
      error: `Generazione non riuscita: ${(error as Error).message}`,
    };
  }
}

export async function salvaRispostaChecklistProdottoAction(
  nomeSchema: string,
  aziendaId: number,
  rigaId: number,
  risposta: boolean | null,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['checklist'],
      livello: 'SCRITTURA',
    });
    if (!Number.isInteger(rigaId) || rigaId <= 0)
      return { success: false, error: 'Domanda non valida.' };
    if (note !== null && note.length > 500)
      return { success: false, error: 'La nota non può superare 500 caratteri.' };
    await assicuraTabellaChecklistProdotti(nomeSchema);
    const r = await pool.query(
      `UPDATE "${nomeSchema}".checklist_prodotti
          SET risposta = $3, note = $4, aggiornato_il = now()
        WHERE id = $1 AND azienda_id = $2`,
      [rigaId, aziendaId, risposta, note]
    );
    if (r.rowCount === 0)
      return { success: false, error: 'Domanda non trovata per questa azienda.' };
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaRispostaChecklistProdottoAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}
