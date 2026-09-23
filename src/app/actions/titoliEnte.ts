'use server';

// Titoli di credito dell'ente: lettura, salvataggio con riscontro sulle fonti
// ufficiali (Gazzetta Ufficiale e Normattiva per la norma; sito dell'ente per
// il riferimento interno), precaricamento INPS.
//
// Regola del salvataggio concordata con Ercole (0.109.96):
//   IN_CONTRASTO     -> la riga NON si salva; a schermo il passo trovato;
//   CONFERMATO       -> si salva, e la fonte entra nel registro (prossima tappa);
//   NON_VERIFICABILE -> si salva solo con conferma esplicita, etichetta «da
//                       riscontrare» finche' un riscontro non la chiude.
// Senza chiave AI (portable senza rete) il riscontro e' NON_VERIFICABILE.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { estraiJson } from '@/lib/visura/fatti';
import {
  DOMINI_NORMA,
  RISCONTRO_VUOTO,
  interpretaRiscontro,
  promptRiscontroInterno,
  promptRiscontroNorma,
  validaTitolo,
  type RiscontroFonte,
  type TitoloEnte,
} from '@/lib/titoliEnte/titoli';
import {
  materiaSuggeritaPerDescrizione,
  normalizzaProposta,
  promptRicercaMateria,
  type MateriaEnte,
  type PropostaMateria,
} from '@/lib/titoliEnte/materie';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 60 * 1000, maxRetries: 1 }) : null;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function daRiga(r: Record<string, unknown>): TitoloEnte {
  return {
    id: Number(r.id),
    codice: String(r.codice),
    atto: String(r.atto ?? ''),
    presuppostoGiuridico: String(r.presupposto_giuridico ?? ''),
    riferimentoInterno: (r.riferimento_interno as string | null) ?? null,
    effettoCalcolo: (r.effetto_calcolo as TitoloEnte['effettoCalcolo']) ?? 'NESSUNO',
    note: (r.note as string | null) ?? null,
    riscontroNorma: (r.riscontro_norma as RiscontroFonte | null) ?? RISCONTRO_VUOTO,
    riscontroInterno: (r.riscontro_interno as RiscontroFonte | null) ?? RISCONTRO_VUOTO,
    materiaId: r.materia_id === null || r.materia_id === undefined ? null : Number(r.materia_id),
  };
}

export async function ottieniTitoliEnteAction(
  nomeSchema: string
): Promise<{ success: boolean; titoli: TitoloEnte[]; dominioEnte: string | null; error?: string }> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, titoli: [], dominioEnte: null, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".titoli_ente ORDER BY codice`);
    const c = await pool.query(
      `SELECT dominio_ente FROM "${nomeSchema}".titoli_ente_config WHERE id = 1`
    );
    return {
      success: true,
      titoli: r.rows.map(daRiga),
      dominioEnte: c.rows[0]?.dominio_ente ?? null,
    };
  } catch (error: unknown) {
    console.error('[ottieniTitoliEnteAction]', error);
    return {
      success: false,
      titoli: [],
      dominioEnte: null,
      error: `Impossibile leggere i titoli: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Importa l'anagrafica dei codici dell'ente (codice, descrizione): crea le
 * righe che mancano con la descrizione ufficiale come atto, aggiorna la
 * descrizione di quelle che esistono senza toccare presupposto, riferimento e
 * riscontri gia' fatti. Nessun precaricamento: l'anagrafica e' dell'ente.
 */
export async function importaAnagraficaCodiciAction(
  codiceSpazio: string,
  codici: { codice: string; descrizione: string }[]
): Promise<{ success: boolean; inseriti: number; aggiornati: number; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return {
        success: false,
        inseriti: 0,
        aggiornati: 0,
        error: 'Operazione riservata all’Admin di Spazio.',
      };
    if (codici.length === 0)
      return {
        success: false,
        inseriti: 0,
        aggiornati: 0,
        error: 'Nel file non ci sono righe con Codice e Descrizione.',
      };
    const nomeSchema = contesto.nomeSchema;
    await assicuraTabelleParametriSpazio(nomeSchema);
    let inseriti = 0;
    let aggiornati = 0;
    for (const c of codici) {
      const codice = c.codice.trim().slice(0, 12);
      if (!/^[A-Za-z0-9.\-/]{1,12}$/.test(codice)) continue;
      const r = await pool.query(
        `INSERT INTO "${nomeSchema}".titoli_ente (codice, atto) VALUES ($1, $2)
         ON CONFLICT (codice) DO UPDATE SET atto = CASE WHEN "${nomeSchema}".titoli_ente.atto = '' OR "${nomeSchema}".titoli_ente.atto = '(da precisare)' THEN EXCLUDED.atto ELSE "${nomeSchema}".titoli_ente.atto END, aggiornato_il = now()
         RETURNING (xmax = 0) AS nuovo`,
        [codice, c.descrizione.trim().slice(0, 200)]
      );
      if (r.rows[0]?.nuovo) inseriti += 1;
      else aggiornati += 1;
    }
    return { success: true, inseriti, aggiornati };
  } catch (error: unknown) {
    console.error('[importaAnagraficaCodiciAction]', error);
    return {
      success: false,
      inseriti: 0,
      aggiornati: 0,
      error: `Importazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

async function riscontraSuFonti(prompt: string, domini: string[]): Promise<RiscontroFonte> {
  const adesso = new Date().toISOString();
  if (!anthropic) {
    return {
      ...RISCONTRO_VUOTO,
      esito: 'NON_VERIFICABILE',
      motivo:
        'Riscontro automatico non disponibile in questo ambiente (nessuna chiave AI o nessuna rete).',
      eseguitoIl: adesso,
    };
  }
  try {
    const risposta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      tools: [
        { type: 'web_search_20250305', name: 'web_search', allowed_domains: domini, max_uses: 4 },
      ],
      messages: [{ role: 'user', content: prompt }],
    });
    const testo = risposta.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return interpretaRiscontro(estraiJson(testo), adesso);
  } catch (e) {
    console.error('[riscontraSuFonti]', e);
    return {
      ...RISCONTRO_VUOTO,
      esito: 'NON_VERIFICABILE',
      motivo: 'Fonte non raggiungibile o risposta non interpretabile.',
      eseguitoIl: adesso,
    };
  }
}

export interface EsitoSalvataggioTitolo {
  success: boolean;
  /** true = la riga non e' stata salvata perche' un riscontro e' IN_CONTRASTO. */
  bloccato?: boolean;
  /** true = serve la conferma esplicita: un riscontro e' NON_VERIFICABILE. */
  richiedeConferma?: boolean;
  titolo?: TitoloEnte;
  error?: string;
}

export async function salvaTitoloEnteAction(
  codiceSpazio: string,
  titolo: TitoloEnte,
  opzioni: { confermaNonVerificabile?: boolean } = {}
): Promise<EsitoSalvataggioTitolo> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const nomeSchema = contesto.nomeSchema;
    const errore = validaTitolo(titolo);
    if (errore) return { success: false, error: errore };
    await assicuraTabelleParametriSpazio(nomeSchema);

    const cfg = await pool.query(
      `SELECT dominio_ente FROM "${nomeSchema}".titoli_ente_config WHERE id = 1`
    );
    const dominioEnte: string | null = cfg.rows[0]?.dominio_ente ?? null;
    const precedente = titolo.id
      ? (await pool.query(`SELECT * FROM "${nomeSchema}".titoli_ente WHERE id = $1`, [titolo.id]))
          .rows[0]
      : null;
    const chi = contesto.email ?? contesto.modalita;

    // Riscontro solo su cio' che e' cambiato: un riscontro confermato resta.
    let riscontroNorma: RiscontroFonte = precedente?.riscontro_norma ?? RISCONTRO_VUOTO;
    if (titolo.presuppostoGiuridico.trim()) {
      if (
        !precedente ||
        precedente.presupposto_giuridico !== titolo.presuppostoGiuridico ||
        precedente.atto !== titolo.atto ||
        riscontroNorma.esito === 'NON_ESEGUITO'
      ) {
        riscontroNorma = await riscontraSuFonti(
          promptRiscontroNorma(titolo.presuppostoGiuridico, titolo.atto),
          DOMINI_NORMA
        );
      }
    } else {
      riscontroNorma = RISCONTRO_VUOTO;
    }
    let riscontroInterno: RiscontroFonte = precedente?.riscontro_interno ?? RISCONTRO_VUOTO;
    if (titolo.riferimentoInterno?.trim() && dominioEnte) {
      if (
        !precedente ||
        precedente.riferimento_interno !== titolo.riferimentoInterno ||
        precedente.presupposto_giuridico !== titolo.presuppostoGiuridico ||
        riscontroInterno.esito === 'NON_ESEGUITO'
      ) {
        riscontroInterno = await riscontraSuFonti(
          promptRiscontroInterno(
            titolo.riferimentoInterno,
            titolo.presuppostoGiuridico,
            dominioEnte
          ),
          [dominioEnte]
        );
      }
    } else {
      riscontroInterno = RISCONTRO_VUOTO;
    }

    const proposto: TitoloEnte = { ...titolo, riscontroNorma, riscontroInterno };
    if (riscontroNorma.esito === 'IN_CONTRASTO' || riscontroInterno.esito === 'IN_CONTRASTO') {
      return {
        success: false,
        bloccato: true,
        titolo: proposto,
        error:
          'Il riscontro sulle fonti ufficiali è in contrasto con quanto scritto: la riga non è stata salvata.',
      };
    }
    const daConfermare =
      riscontroNorma.esito === 'NON_VERIFICABILE' || riscontroInterno.esito === 'NON_VERIFICABILE';
    if (daConfermare && !opzioni.confermaNonVerificabile) {
      return { success: false, richiedeConferma: true, titolo: proposto };
    }
    if (riscontroNorma.esito === 'CONFERMATO' && !riscontroNorma.confermatoDa)
      riscontroNorma.confermatoDa = chi;
    if (riscontroInterno.esito === 'CONFERMATO' && !riscontroInterno.confermatoDa)
      riscontroInterno.confermatoDa = chi;

    const r = await pool.query(
      `INSERT INTO "${nomeSchema}".titoli_ente (codice, atto, presupposto_giuridico, riferimento_interno, effetto_calcolo, note, riscontro_norma, riscontro_interno, aggiornato_il)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (codice) DO UPDATE SET atto = $2, presupposto_giuridico = $3, riferimento_interno = $4, effetto_calcolo = $5, note = $6, riscontro_norma = $7, riscontro_interno = $8, aggiornato_il = now()
       RETURNING *`,
      [
        titolo.codice.trim(),
        titolo.atto.trim(),
        titolo.presuppostoGiuridico.trim(),
        titolo.riferimentoInterno?.trim() || null,
        titolo.effettoCalcolo,
        titolo.note?.trim() || null,
        JSON.stringify(riscontroNorma),
        JSON.stringify(riscontroInterno),
      ]
    );
    return { success: true, titolo: daRiga(r.rows[0]) };
  } catch (error: unknown) {
    console.error('[salvaTitoloEnteAction]', error);
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

export async function eliminaTitoloEnteAction(
  codiceSpazio: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    await pool.query(`DELETE FROM "${contesto.nomeSchema}".titoli_ente WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaDominioEnteAction(
  codiceSpazio: string,
  dominio: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const d = dominio
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
      return { success: false, error: 'Indicare un dominio, es. inps.it.' };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    await pool.query(
      `INSERT INTO "${contesto.nomeSchema}".titoli_ente_config (id, dominio_ente) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET dominio_ente = $1`,
      [d]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Materie (0.109.98)
// ---------------------------------------------------------------------------

function materiaDaRiga(r: Record<string, unknown>): MateriaEnte {
  return {
    id: Number(r.id),
    nome: String(r.nome),
    codiciIndicativi: (r.codici_indicativi as string | null) ?? null,
    presuppostoGiuridico: (r.presupposto_giuridico as string | null) ?? null,
    riferimentiInterni: (r.riferimenti_interni as string | null) ?? null,
    proposta: (r.proposta as PropostaMateria | null) ?? null,
    stato: (r.stato as MateriaEnte['stato']) ?? 'DA_RICERCARE',
    confermataDa: (r.confermata_da as string | null) ?? null,
    confermataIl: r.confermata_il ? new Date(r.confermata_il as string).toISOString() : null,
  };
}

export async function ottieniMaterieEnteAction(
  nomeSchema: string
): Promise<{ success: boolean; materie: MateriaEnte[]; error?: string }> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, materie: [], error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".materie_ente ORDER BY nome`);
    return { success: true, materie: r.rows.map(materiaDaRiga) };
  } catch (error: unknown) {
    return {
      success: false,
      materie: [],
      error: `Impossibile leggere le materie: ${(error as Error).message || error}`,
    };
  }
}

export async function salvaMateriaEnteAction(
  codiceSpazio: string,
  materia: { id: number | null; nome: string; codiciIndicativi: string | null }
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const nome = materia.nome.trim();
    if (!nome) return { success: false, error: 'Indicare il nome della materia.' };
    await assicuraTabelleParametriSpazio(contesto.nomeSchema);
    // Cambiare il nome invalida la proposta: si ricerca di nuovo.
    const r = materia.id
      ? await pool.query(
          `UPDATE "${contesto.nomeSchema}".materie_ente
              SET nome = $2, codici_indicativi = $3,
                  stato = CASE WHEN nome <> $2 AND stato <> 'CONFERMATA' THEN 'DA_RICERCARE' ELSE stato END,
                  aggiornato_il = now()
            WHERE id = $1 RETURNING id`,
          [materia.id, nome, materia.codiciIndicativi?.trim() || null]
        )
      : await pool.query(
          `INSERT INTO "${contesto.nomeSchema}".materie_ente (nome, codici_indicativi) VALUES ($1, $2)
           ON CONFLICT (nome) DO UPDATE SET codici_indicativi = EXCLUDED.codici_indicativi RETURNING id`,
          [nome, materia.codiciIndicativi?.trim() || null]
        );
    return { success: true, id: Number(r.rows[0].id) };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Salvataggio non riuscito: ${(error as Error).message || error}`,
    };
  }
}

export async function eliminaMateriaEnteAction(
  codiceSpazio: string,
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    await pool.query(
      `UPDATE "${contesto.nomeSchema}".titoli_ente SET materia_id = NULL WHERE materia_id = $1`,
      [id]
    );
    await pool.query(`DELETE FROM "${contesto.nomeSchema}".materie_ente WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Eliminazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Ricerca dell'AI per UNA materia (il client la chiama in sequenza per tutte
 * quelle «da ricercare»: un solo clic, una barra di avanzamento, nessun
 * timeout del server). Ricerca sul sito dell'ente piu' Normattiva e Gazzetta.
 */
export async function ricercaMateriaAction(
  codiceSpazio: string,
  materiaId: number
): Promise<{ success: boolean; materia?: MateriaEnte; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    const nomeSchema = contesto.nomeSchema;
    const cfg = await pool.query(
      `SELECT dominio_ente FROM "${nomeSchema}".titoli_ente_config WHERE id = 1`
    );
    const dominio: string | null = cfg.rows[0]?.dominio_ente ?? null;
    if (!dominio)
      return { success: false, error: 'Indicare prima il sito istituzionale dell’ente.' };
    const m = await pool.query(`SELECT * FROM "${nomeSchema}".materie_ente WHERE id = $1`, [
      materiaId,
    ]);
    if (m.rows.length === 0) return { success: false, error: 'Materia non trovata.' };
    const materia = materiaDaRiga(m.rows[0]);
    if (!anthropic)
      return {
        success: false,
        error:
          'Ricerca automatica non disponibile in questo ambiente (nessuna chiave AI o nessuna rete).',
      };
    const domini = [dominio, ...DOMINI_NORMA];
    let testo = '';
    try {
      const risposta = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2500,
        thinking: { type: 'disabled' },
        tools: [
          { type: 'web_search_20250305', name: 'web_search', allowed_domains: domini, max_uses: 8 },
        ],
        messages: [
          {
            role: 'user',
            content: promptRicercaMateria(materia.nome, materia.codiciIndicativi, dominio),
          },
        ],
      });
      testo = risposta.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ricercaMateriaAction]', msg);
      return {
        success: false,
        error: `La ricerca è stata rifiutata dal servizio AI: ${msg.slice(0, 200)}`,
      };
    }
    const proposta = normalizzaProposta(estraiJson(testo), new Date().toISOString(), domini);
    if (!proposta) {
      await pool.query(
        `UPDATE "${nomeSchema}".materie_ente SET proposta = NULL, aggiornato_il = now() WHERE id = $1`,
        [materiaId]
      );
      return { success: true, materia: { ...materia, proposta: null } };
    }
    const r = await pool.query(
      `UPDATE "${nomeSchema}".materie_ente SET proposta = $2, stato = CASE WHEN stato = 'CONFERMATA' THEN stato ELSE 'PROPOSTA' END, aggiornato_il = now() WHERE id = $1 RETURNING *`,
      [materiaId, JSON.stringify(proposta)]
    );
    return { success: true, materia: materiaDaRiga(r.rows[0]) };
  } catch (error: unknown) {
    return { success: false, error: `Ricerca non riuscita: ${(error as Error).message || error}` };
  }
}

/** Conferma umana: presupposto e riferimenti (eventualmente corretti) diventano quelli della materia. */
export async function confermaMateriaEnteAction(
  codiceSpazio: string,
  materiaId: number,
  presuppostoGiuridico: string,
  riferimentiInterni: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    if (!presuppostoGiuridico.trim())
      return { success: false, error: 'Indicare il presupposto giuridico prima di confermare.' };
    await pool.query(
      `UPDATE "${contesto.nomeSchema}".materie_ente
          SET presupposto_giuridico = $2, riferimenti_interni = $3, stato = 'CONFERMATA', confermata_da = $4, confermata_il = now(), aggiornato_il = now()
        WHERE id = $1`,
      [
        materiaId,
        presuppostoGiuridico.trim(),
        riferimentiInterni.trim() || null,
        contesto.email ?? contesto.modalita,
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: `Conferma non riuscita: ${(error as Error).message || error}` };
  }
}

/** Un codice cade in una materia (null = da assegnare). */
export async function assegnaMateriaCodiceAction(
  codiceSpazio: string,
  titoloId: number,
  materiaId: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, error: 'Operazione riservata all’Admin di Spazio.' };
    await pool.query(
      `UPDATE "${contesto.nomeSchema}".titoli_ente SET materia_id = $2, aggiornato_il = now() WHERE id = $1`,
      [titoloId, materiaId]
    );
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Assegnazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}

/** Propone la materia dei codici ancora senza, dalla descrizione ufficiale; l'ente corregge. */
export async function suggerisciMaterieCodiciAction(
  codiceSpazio: string
): Promise<{ success: boolean; assegnati: number; error?: string }> {
  try {
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto || contesto.modalita === 'OPERATORE')
      return { success: false, assegnati: 0, error: 'Operazione riservata all’Admin di Spazio.' };
    const s = contesto.nomeSchema;
    const materie = (await pool.query(`SELECT id, nome FROM "${s}".materie_ente`)).rows.map(
      (r) => ({ id: Number(r.id), nome: String(r.nome) })
    );
    const codici = (
      await pool.query(`SELECT id, atto FROM "${s}".titoli_ente WHERE materia_id IS NULL`)
    ).rows;
    let assegnati = 0;
    for (const c of codici) {
      const m = materiaSuggeritaPerDescrizione(String(c.atto ?? ''), materie);
      if (m !== null) {
        await pool.query(`UPDATE "${s}".titoli_ente SET materia_id = $2 WHERE id = $1`, [c.id, m]);
        assegnati += 1;
      }
    }
    return { success: true, assegnati };
  } catch (error: unknown) {
    return {
      success: false,
      assegnati: 0,
      error: `Assegnazione non riuscita: ${(error as Error).message || error}`,
    };
  }
}
