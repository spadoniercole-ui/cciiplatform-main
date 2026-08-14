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

import { assicuraTabelleScenari } from '@/db/provision';
import { type TipoProposta, ORIGINI_PER_TIPO } from '@/lib/origineProposta';

export type StatoScenario = 'BOZZA' | 'IN_CORSO' | 'COMPLETATO';
export type { TipoProposta };

export interface Scenario {
  id: number;
  aziendaId: number;
  nome: string;
  stato: StatoScenario;
  tipoProposta: TipoProposta;
  origineProposta: string;
  rigaRilevanteBloccata: boolean;
  archiviato: boolean;
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
        rigaRilevanteBloccata: r.rigaRilevanteBloccata,
        archiviato: r.archiviato,
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
        rigaRilevanteBloccata: tabelle.scenari.rigaRilevanteBloccata,
        archiviato: tabelle.scenari.archiviato,
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
        rigaRilevanteBloccata: r.rigaRilevanteBloccata,
        archiviato: r.archiviato,
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
}

export async function creaScenarioAction(
  nomeSchema: string,
  aziendaId: number,
  nome: string,
  tipoProposta: TipoProposta,
  origineProposta: string
): Promise<RisultatoOperazioneScenario> {
  try {
    if (!nome.trim()) {
      return { success: false, error: 'Il nome dello scenario è obbligatorio.' };
    }
    if (!ORIGINI_PER_TIPO[tipoProposta]?.includes(origineProposta)) {
      return { success: false, error: 'Origine della proposta non valida per il tipo scelto.' };
    }

    // Uno spazio ENTE riceve sempre proposte, non le redige mai — non ci
    // si fida solo del client (che già nasconde la scelta): controllato
    // anche qui, come ovunque nel progetto.
    const { pool } = await import('@/lib/db');
    const spazioRis = await pool.query(
      `SELECT tipo_spazio FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
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
      .values({ aziendaId, nome: nome.trim(), tipoProposta, origineProposta })
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

export async function aggiornaStatoScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  stato: StatoScenario
): Promise<RisultatoOperazioneScenario> {
  try {
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.update(tabelle.scenari).set({ stato }).where(eq(tabelle.scenari.id, scenarioId));
    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[aggiornaStatoScenarioAction] Errore:', error);
    return { success: false, error: `Impossibile aggiornare lo stato: ${error.message || error}` };
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
  const risultato = await ottieniScenarioPerId(nomeSchema, scenarioId);
  if (!risultato.success || !risultato.scenario) return null; // scenario non trovato, altri controlli se ne occupano altrove
  if (risultato.scenario.bloccatoIl) {
    return "Questo scenario è in sola lettura permanente — la Relazione finale è già stata generata. Per una nuova valutazione, apri un nuovo scenario — oppure, se serve correggere un errore su questo, l'Admin di Spazio può sbloccarlo qui sotto.";
  }
  return null;
}
