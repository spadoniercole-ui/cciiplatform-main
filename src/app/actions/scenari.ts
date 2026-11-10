'use server';

// Scenario: unità operativa centrale dell'analisi. Un'azienda può avere N
// scenari nel tempo, ognuno un ciclo di analisi indipendente (Check List,
// Test Pratico, Indici, XBRL, Cram Down si agganciano tutti qui, non
// direttamente all'Azienda).
//
// Ogni scenario nasce dalla classificazione della proposta che lo
// determina: RICEVUTA (da un Ente o dal Tribunale) o DA_DEFINIRE (dallo
// studio, da un professionista, dall'azienda stessa) — è l'input che
// scatena l'intero ciclo di verifica.

import { richiediAccessoAzienda, richiediAccessoScenario } from '@/lib/autorizzazione';
import { assicuraTabelleScenari } from '@/db/provision';
import { type TipoProposta, ORIGINI_PER_TIPO } from '@/lib/origineProposta';
import { tipoIstruttoriaValido, type TipoIstruttoria } from '@/lib/giudice/lettura';
import {
  MESSAGGIO_SCENARIO_BLOCCATO,
  originePerSituazione,
  passiDaRivedere,
} from '@/lib/scenari/situazione';
import { leggiPassiCompilati } from '@/lib/scenari/passiCompilati';
import { assicuraStoricoSituazione } from '@/db/provision';

const schemaOk = (nome: string) => /^[a-z0-9_]+$/.test(nome);

// Le colonne timestamp di Drizzle tornano dal driver come Date: l'API dello
// scenario parla invece stringhe ISO, perché è quello che il browser mostra e
// taglia sulla data. Convertirle con toString() dava una data locale
// illeggibile («Mon Nov 09 2026 …»), che non si taglia come ISO.
function isoData(valore: Date | string | null): string | null {
  if (!valore) return null;
  return valore instanceof Date ? valore.toISOString() : valore;
}

export type StatoScenario = 'BOZZA' | 'IN_CORSO' | 'COMPLETATO';
export type { TipoProposta };

export interface Scenario {
  id: number;
  aziendaId: number;
  nome: string;
  stato: StatoScenario;
  tipoProposta: TipoProposta;
  origineProposta: string;
  /** Che cosa ha in mano l'azienda. Assente sugli scenari anteriori alla 0.170.0: vale PROPOSTA. */
  tipoIstruttoria?: TipoIstruttoria;
  /** Data dell'ultimo cambio di situazione (0.189.0); null se non è mai cambiata. */
  situazioneCambiataIl: string | null;
  rigaRilevanteBloccata: boolean;
  archiviato: boolean;
  /** Ricevente (ENTE): abilita il passo «Piano di sviluppo» (confronto con il piano dell'azienda, ipotesi dell'AI) su questo scenario. Scelto alla creazione. Per il Redigente il piano è sempre disponibile, quindi questo flag è ininfluente lì. */
  simulazioneAttiva: boolean;
  /** Le due verifiche dell'ente caricate in questo scenario (0.182.0). L'amministrativa è obbligatoria. */
  verificaAmministrativa: boolean;
  verificaContabile: boolean;
  /** Quando la verifica è stata caricata NELLO SCENARIO (non quando il documento è stato letto). */
  verificaAmministrativaIl: string | null;
  verificaContabileIl: string | null;
  /** Solo percorso Ricevente — valorizzato quando la Relazione finale è stata generata. Da quel momento lo scenario è sola lettura permanente. */
  bloccatoIl: string | null;
  createdAt: string;
}

export interface RisultatoElencoScenari {
  success: boolean;
  scenari: Scenario[];
  error?: string;
}

export async function ottieniScenari(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoElencoScenari> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    await assicuraTabelleScenari(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db
      .select()
      .from(tabelle.scenari)
      .where(eq(tabelle.scenari.aziendaId, aziendaId));

    return {
      success: true,
      scenari: righe.map((r) => ({
        id: r.id,
        aziendaId: r.aziendaId,
        nome: r.nome,
        stato: r.stato as StatoScenario,
        tipoProposta: r.tipoProposta as TipoProposta,
        origineProposta: r.origineProposta,
        tipoIstruttoria: r.tipoIstruttoria as TipoIstruttoria,
        situazioneCambiataIl: isoData(r.situazioneCambiataIl),
        rigaRilevanteBloccata: r.rigaRilevanteBloccata,
        archiviato: r.archiviato,
        simulazioneAttiva: r.simulazioneAttiva,
        verificaAmministrativa: r.verificaAmministrativa,
        verificaContabile: r.verificaContabile,
        verificaAmministrativaIl: isoData(r.verificaAmministrativaIl),
        verificaContabileIl: isoData(r.verificaContabileIl),
        bloccatoIl: r.bloccatoIl ? r.bloccatoIl.toString() : null,
        createdAt: r.createdAt.toString(),
      })),
    };
  } catch (error: any) {
    console.error('[ottieniScenari] Errore:', error);
    return {
      success: false,
      scenari: [],
      error: `Impossibile caricare gli scenari: ${error.message || error}`,
    };
  }
}

export interface ScenarioConAzienda extends Scenario {
  ragioneSocialeAzienda: string;
}

export interface RisultatoScenarioSingolo {
  success: boolean;
  scenario?: ScenarioConAzienda;
  error?: string;
}

export async function ottieniScenarioPerId(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoScenarioSingolo> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    await assicuraTabelleScenari(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db
      .select({
        id: tabelle.scenari.id,
        aziendaId: tabelle.scenari.aziendaId,
        nome: tabelle.scenari.nome,
        stato: tabelle.scenari.stato,
        tipoProposta: tabelle.scenari.tipoProposta,
        origineProposta: tabelle.scenari.origineProposta,
        tipoIstruttoria: tabelle.scenari.tipoIstruttoria,
        situazioneCambiataIl: tabelle.scenari.situazioneCambiataIl,
        rigaRilevanteBloccata: tabelle.scenari.rigaRilevanteBloccata,
        archiviato: tabelle.scenari.archiviato,
        simulazioneAttiva: tabelle.scenari.simulazioneAttiva,
        verificaAmministrativa: tabelle.scenari.verificaAmministrativa,
        verificaContabile: tabelle.scenari.verificaContabile,
        verificaAmministrativaIl: tabelle.scenari.verificaAmministrativaIl,
        verificaContabileIl: tabelle.scenari.verificaContabileIl,
        bloccatoIl: tabelle.scenari.bloccatoIl,
        createdAt: tabelle.scenari.createdAt,
        ragioneSocialeAzienda: tabelle.aziende.ragioneSociale,
      })
      .from(tabelle.scenari)
      .innerJoin(tabelle.aziende, eq(tabelle.aziende.id, tabelle.scenari.aziendaId))
      .where(eq(tabelle.scenari.id, scenarioId))
      .limit(1);

    if (righe.length === 0) {
      return { success: false, error: 'Scenario non trovato.' };
    }

    const r = righe[0];
    return {
      success: true,
      scenario: {
        id: r.id,
        aziendaId: r.aziendaId,
        nome: r.nome,
        stato: r.stato as StatoScenario,
        tipoProposta: r.tipoProposta as TipoProposta,
        origineProposta: r.origineProposta,
        tipoIstruttoria: r.tipoIstruttoria as TipoIstruttoria,
        situazioneCambiataIl: isoData(r.situazioneCambiataIl),
        rigaRilevanteBloccata: r.rigaRilevanteBloccata,
        archiviato: r.archiviato,
        simulazioneAttiva: r.simulazioneAttiva,
        verificaAmministrativa: r.verificaAmministrativa,
        verificaContabile: r.verificaContabile,
        verificaAmministrativaIl: isoData(r.verificaAmministrativaIl),
        verificaContabileIl: isoData(r.verificaContabileIl),
        bloccatoIl: r.bloccatoIl ? r.bloccatoIl.toString() : null,
        createdAt: r.createdAt.toString(),
        ragioneSocialeAzienda: r.ragioneSocialeAzienda,
      },
    };
  } catch (error: any) {
    console.error('[ottieniScenarioPerId] Errore:', error);
    return { success: false, error: `Impossibile caricare lo scenario: ${error.message || error}` };
  }
}

export interface RisultatoOperazioneScenario {
  success: boolean;
  scenarioId?: number;
  error?: string;
  /** Dopo un cambio di situazione: i passi già compilati da ricontrollare. */
  rivedere?: string[];
}

export async function creaScenarioAction(
  nomeSchema: string,
  aziendaId: number,
  nome: string,
  tipoProposta: TipoProposta,
  origineProposta: string,
  simulazioneAttiva: boolean = false,
  verifiche: { amministrativa: boolean; contabile: boolean } = {
    amministrativa: true,
    contabile: false,
  },
  /**
   * La situazione che si sta valutando, scelta alla creazione (0.187.0):
   * accordo transattivo, liquidazione giudiziale o cram down. Prende il posto
   * della scelta tipo proposta/origine, che era un doppione della stessa
   * domanda.
   */
  tipoIstruttoria?: TipoIstruttoria
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    if (!nome.trim()) {
      return { success: false, error: 'Il nome dello scenario è obbligatorio.' };
    }
    if (!verifiche.amministrativa && !verifiche.contabile) {
      return {
        success: false,
        error: 'Almeno una verifica dell’ente deve entrare nello scenario.',
      };
    }
    if (!ORIGINI_PER_TIPO[tipoProposta]?.includes(origineProposta)) {
      return { success: false, error: 'Origine della proposta non valida per il tipo scelto.' };
    }

    if (tipoIstruttoria !== undefined && !tipoIstruttoriaValido(tipoIstruttoria)) {
      return { success: false, error: 'Situazione dello scenario non riconosciuta.' };
    }

    // Uno spazio ENTE riceve sempre proposte, non le redige mai — non ci
    // si fida solo del client (che già nasconde la scelta): controllato
    // anche qui, come ovunque nel progetto.
    const { pool } = await import('@/lib/db');
    const spazioRis = await pool.query(
      `SELECT tipo_spazio, demo FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    if (spazioRis.rows[0]?.demo) {
      return {
        success: false,
        error:
          'Nell’ambiente demo gli scenari sono già predisposti: non si creano nuovi scenari senza documenti.',
      };
    }
    if (spazioRis.rows[0]?.tipo_spazio === 'ENTE' && tipoProposta !== 'RICEVUTA') {
      return {
        success: false,
        error: 'Uno spazio ENTE può creare solo scenari di tipo Ricevuta.',
      };
    }

    await assicuraTabelleScenari(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const tabelle = getTabelleTenant(nomeSchema);

    const inserito = await db
      .insert(tabelle.scenari)
      .values({
        aziendaId,
        nome: nome.trim(),
        tipoProposta,
        origineProposta,
        // Solo lo spazio ENTE riceve: il nuovo scenario si apre chiedendo
        // che cosa ha in mano l'azienda. Il Redigente redige una proposta,
        // quindi la domanda non ha senso per lui.
        // Alla creazione la situazione è già dichiarata (0.187.0): il
        // vecchio «da chiedere» resta solo come ripiego per i chiamanti che
        // non la passano.
        tipoIstruttoria:
          spazioRis.rows[0]?.tipo_spazio === 'ENTE'
            ? tipoIstruttoria &&
              tipoIstruttoria !== 'DA_CHIEDERE' &&
              tipoIstruttoriaValido(tipoIstruttoria)
              ? tipoIstruttoria
              : 'DA_CHIEDERE'
            : 'PROPOSTA',
        simulazioneAttiva,
        verificaAmministrativa: verifiche.amministrativa,
        verificaContabile: verifiche.contabile,
        // Le colonne sono timestamp Drizzle in modalità date: si passano Date,
        // non stringhe ISO (la scrittura chiama toISOString() sul valore).
        verificaAmministrativaIl: verifiche.amministrativa ? new Date() : null,
        verificaContabileIl: verifiche.contabile ? new Date() : null,
      })
      .returning({ id: tabelle.scenari.id });

    const nuovoScenarioId = inserito[0].id;

    // Redigente: erediti nella Check List del nuovo scenario le risposte
    // già date a livello Azienda (manuali o da Screening) — così non si
    // riparte mai da zero. Non deve mai far fallire la creazione dello
    // scenario: se l'eredità non riesce, lo scenario esiste comunque e la
    // Check List si compila da capo, quindi si logga e si prosegue.
    if (spazioRis.rows[0]?.tipo_spazio !== 'ENTE') {
      try {
        const { ereditaChecklistMinisterialeInScenarioAction } =
          await import('@/app/actions/checklistMinisterialeAzienda');
        const esitoEredita = await ereditaChecklistMinisterialeInScenarioAction(
          nomeSchema,
          aziendaId,
          nuovoScenarioId
        );
        if (!esitoEredita.success) {
          console.error(
            '[creaScenarioAction] Eredità Check List Ministeriale non riuscita:',
            esitoEredita.error
          );
        }
      } catch (erroreEredita) {
        console.error(
          "[creaScenarioAction] Errore imprevisto durante l'eredità della Check List:",
          erroreEredita
        );
      }
    }

    return { success: true, scenarioId: nuovoScenarioId };
  } catch (error: any) {
    console.error('[creaScenarioAction] Errore:', error);
    return { success: false, error: `Impossibile creare lo scenario: ${error.message || error}` };
  }
}

/**
 * Blocca o sblocca la scelta della riga "rilevante per l'ente" — senza
 * questo, il confronto con la Posizione Debitoria dell'Ente perderebbe
 * stabilità ad ogni click di distrazione.
 */
export async function impostaBloccoRigaRilevanteAction(
  nomeSchema: string,
  scenarioId: number,
  bloccata: boolean
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['report'],
      livello: 'SCRITTURA',
    });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db
      .update(tabelle.scenari)
      .set({ rigaRilevanteBloccata: bloccata })
      .where(eq(tabelle.scenari.id, scenarioId));
    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[impostaBloccoRigaRilevanteAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare il blocco: ${error.message || error}` };
  }
}

/**
 * Archivia o ripristina — separato da "stato" apposta, un ripristino
 * torna esattamente allo stato procedurale che aveva prima, non
 * riparte da BOZZA. Nessuna cancellazione di dati, solo fuori dalla
 * vista principale.
 */
export async function archiviaScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  archiviato: boolean
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.update(tabelle.scenari).set({ archiviato }).where(eq(tabelle.scenari.id, scenarioId));
    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[archiviaScenarioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile archiviare lo scenario: ${error.message || error}`,
    };
  }
}

/**
 * Elimina per intero — nessuna distinzione tra dati inseriti a mano e
 * calcoli derivati, cancella tutto lo scenario. Le tabelle figlie
 * (checklist_risposte, debiti_ente, anagrafica_ente, simulazioni,
 * brogliaccio...) hanno tutte ON DELETE CASCADE sulla FK verso
 * scenari, quindi una singola DELETE qui basta. "Archivia" è l'unica
 * rete di sicurezza — questa è irreversibile, per questo il client
 * chiede conferma digitando il nome esatto prima di chiamarla.
 */
export async function eliminaScenarioAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.delete(tabelle.scenari).where(eq(tabelle.scenari.id, scenarioId));
    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[eliminaScenarioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare lo scenario: ${error.message || error}`,
    };
  }
}

/** Chiamata dopo la generazione riuscita della Relazione finale, solo
 * percorso Ricevente — congela lo scenario alla data di quella
 * relazione. Nessuna funzione di sblocco: per design, non ce n'è
 * bisogno — una nuova valutazione richiede un nuovo scenario. */
export async function bloccaScenarioAction(
  nomeSchema: string,
  scenarioId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Stessi requisiti del chiamante (generaRelazionePropostaAction).
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['relazione'],
      livello: 'SCRITTURA',
    });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);
    await db
      .update(tabelle.scenari)
      .set({ bloccatoIl: new Date() })
      .where(eq(tabelle.scenari.id, scenarioId));
    return { success: true };
  } catch (error: any) {
    console.error('[bloccaScenarioAction] Errore:', error);
    return { success: false, error: `Impossibile bloccare lo scenario: ${error.message || error}` };
  }
}

/** Usata all'inizio di ogni azione che scrive dati di uno scenario nel
 * percorso Ricevente — un controllo centralizzato invece di ripetere
 * la stessa query in ogni singola funzione. Ritorna un messaggio
 * pronto per l'utente se lo scenario è bloccato, altrimenti null. */
export async function verificaScenarioNonBloccato(
  nomeSchema: string,
  scenarioId: number
): Promise<string | null> {
  await richiediAccessoScenario(nomeSchema, scenarioId);
  const risultato = await ottieniScenarioPerId(nomeSchema, scenarioId);
  if (!risultato.success || !risultato.scenario) return null; // scenario non trovato, altri controlli se ne occupano altrove
  if (risultato.scenario.bloccatoIl) {
    return MESSAGGIO_SCENARIO_BLOCCATO;
  }
  return null;
}

/**
 * Attiva il Piano di sviluppo su uno scenario ricevuto: la domanda «vuoi
 * mettere alla prova il piano dell'azienda?» si pone a fine valutazione,
 * non più solo alla creazione dello scenario.
 */
export async function attivaPianoSviluppoAction(
  nomeSchema: string,
  scenarioId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    const bloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (bloccato) return { success: false, error: bloccato };
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);
    await db
      .update(tabelle.scenari)
      .set({ simulazioneAttiva: true })
      .where(eq(tabelle.scenari.id, scenarioId));
    return { success: true };
  } catch (error: unknown) {
    console.error('[attivaPianoSviluppoAction] Errore:', error);
    return { success: false, error: `Impossibile attivare il piano: ${(error as Error).message}` };
  }
}

/**
 * Cambia la situazione di uno scenario già creato (0.188.0).
 *
 * La scelta fatta alla creazione non è un'etichetta: decide che cosa si sta
 * valutando. Restare vincolati a un errore di inquadramento costringerebbe a
 * rifare lo scenario da capo, quindi si corregge qui — finché la Relazione
 * finale non l'ha congelato. Per uno spazio ENTE l'origine si riallinea
 * (proposta dall'azienda, decreto e cram down dal tribunale); per il Redigente
 * resta quella dichiarata.
 */
export async function aggiornaSituazioneScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  tipoIstruttoria: TipoIstruttoria
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    if (!schemaOk(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!tipoIstruttoriaValido(tipoIstruttoria) || tipoIstruttoria === 'DA_CHIEDERE') {
      return { success: false, error: 'Situazione dello scenario non riconosciuta.' };
    }

    const { pool } = await import('@/lib/db');
    const scenarioRis = await pool.query(
      `SELECT tipo_istruttoria, bloccato_il FROM "${nomeSchema}".scenari WHERE id = $1`,
      [scenarioId]
    );
    if (scenarioRis.rows.length === 0) {
      return { success: false, error: 'Scenario non trovato.' };
    }
    if (scenarioRis.rows[0].bloccato_il) {
      return { success: false, error: MESSAGGIO_SCENARIO_BLOCCATO };
    }
    if (scenarioRis.rows[0].tipo_istruttoria === tipoIstruttoria) {
      return { success: true, scenarioId, rivedere: [] };
    }

    const spazioRis = await pool.query(
      `SELECT tipo_spazio, demo FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    if (spazioRis.rows[0]?.demo) {
      return {
        success: false,
        error: 'Nell’ambiente demo i percorsi sono già predisposti: la situazione non si cambia.',
      };
    }

    const origineProposta = originePerSituazione(
      spazioRis.rows[0]?.tipo_spazio === 'ENTE',
      tipoIstruttoria
    );

    // Riallineamento, non cancellazione: il lavoro fatto resta, lo scenario
    // torna in bozza perché non è più concluso per l'atto che si valuta, e la
    // data dice da quando i passi vanno riguardati.
    await pool.query(
      `UPDATE "${nomeSchema}".scenari
          SET tipo_istruttoria = $2,
              origine_proposta = COALESCE($3, origine_proposta),
              stato = 'BOZZA',
              situazione_cambiata_il = now()
        WHERE id = $1`,
      [scenarioId, tipoIstruttoria, origineProposta ?? null]
    );

    // La traccia: da che atto a che atto, e quando. Il dato precedente non
    // si perde — è proprio quello che rende leggibile il riallineamento.
    await assicuraStoricoSituazione(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".situazione_storico (scenario_id, da, a)
       VALUES ($1, $2, $3)`,
      [scenarioId, scenarioRis.rows[0].tipo_istruttoria as string, tipoIstruttoria]
    );

    const passi = await leggiPassiCompilati(nomeSchema, scenarioId);
    return { success: true, scenarioId, rivedere: passiDaRivedere(passi) };
  } catch (error: unknown) {
    console.error('[aggiornaSituazioneScenarioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la situazione: ${(error as Error).message}`,
    };
  }
}
