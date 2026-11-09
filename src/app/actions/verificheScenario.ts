'use server';

// LE VERIFICHE DELL’ENTE NELLO SCENARIO — quali entrano, e da quando.
//
// La scelta si fa alla creazione dello scenario e resta modificabile dal
// passo 0. Non è una navigazione: è uno stato dello scenario, e serve a
// rispondere alla sola domanda che conta mentre si lavora — questo dato è
// caricato nello scenario, o no?

import { richiediAccessoAzienda, richiediAccessoScenario } from '@/lib/autorizzazione';
import { assicuraTabelleScenari } from '@/db/provision';
import type { RisultatoOperazioneScenario } from '@/app/actions/scenari';

export interface DisponibilitaVerifiche {
  success: boolean;
  /** Esiste il dato attuale: certificazione dei debiti o posizioni del triage. */
  amministrativa: boolean;
  /** Esiste almeno un bilancio XBRL: il dato storico. */
  contabile: boolean;
  error?: string;
}

/**
 * Quali verifiche esistono davvero su questa azienda. Serve alla creazione
 * per preselezionare la più completa disponibile: completa se ci sono
 * amministrativa e contabile, altrimenti amministrativa, altrimenti la sola
 * contabile storica — che resta l'unica scelta quando il dato attuale manca.
 */
export async function verificheDisponibiliAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<DisponibilitaVerifiche> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return {
        success: false,
        amministrativa: false,
        contabile: false,
        error: 'Nome schema non valido.',
      };
    }
    const { pool } = await import('@/lib/db');
    const esiste = async (tabella: string): Promise<boolean> => {
      try {
        const r = await pool.query(
          `SELECT EXISTS (SELECT 1 FROM "${nomeSchema}".${tabella} WHERE azienda_id = $1) AS c`,
          [aziendaId]
        );
        return Boolean(r.rows[0]?.c);
      } catch {
        // Tabella non provisionata in questo spazio: la verifica non esiste.
        return false;
      }
    };

    const certificazione = await esiste('debiti_vera');
    const amministrativa = certificazione ? true : await esiste('debiti_triage');
    const contabile = await esiste('xbrl_storico_azienda');
    return { success: true, amministrativa, contabile };
  } catch (error: any) {
    console.error('[verificheDisponibiliAziendaAction] Errore:', error);
    return {
      success: false,
      amministrativa: false,
      contabile: false,
      error: `Impossibile leggere le verifiche dell’azienda: ${error.message || error}`,
    };
  }
}

/**
 * Le due spunte del passo 0. Persistono sullo scenario con la data del
 * caricamento; l'amministrativa non si spegne quando l'utente la toglie —
 * è la verifica minima — quindi il server rifiuta una scelta che lascerebbe
 * lo scenario senza nessuna verifica.
 */
export async function impostaVerificheScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  verifiche: { amministrativa: boolean; contabile: boolean }
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    if (!verifiche.amministrativa && !verifiche.contabile) {
      return {
        success: false,
        error: 'Almeno una verifica dell’ente deve restare nello scenario.',
      };
    }
    await assicuraTabelleScenari(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const attuale = await db
      .select({
        amministrativa: tabelle.scenari.verificaAmministrativa,
        contabile: tabelle.scenari.verificaContabile,
        amministrativaIl: tabelle.scenari.verificaAmministrativaIl,
        contabileIl: tabelle.scenari.verificaContabileIl,
      })
      .from(tabelle.scenari)
      .where(eq(tabelle.scenari.id, scenarioId))
      .limit(1);
    if (attuale.length === 0) return { success: false, error: 'Scenario non trovato.' };
    const prima = attuale[0];

    await db
      .update(tabelle.scenari)
      .set({
        verificaAmministrativa: verifiche.amministrativa,
        verificaContabile: verifiche.contabile,
        // La data di caricamento si scrive una volta sola e non si sposta: se la
        // verifica era già dentro lo scenario, resta la sua data.
        // Le colonne sono timestamp Drizzle in modalità date: servono Date, non
        // stringhe ISO, altrimenti la scrittura fallisce su toISOString().
        verificaAmministrativaIl: verifiche.amministrativa
          ? prima.amministrativa && prima.amministrativaIl
            ? prima.amministrativaIl
            : new Date()
          : null,
        verificaContabileIl: verifiche.contabile
          ? prima.contabile && prima.contabileIl
            ? prima.contabileIl
            : new Date()
          : null,
      })
      .where(eq(tabelle.scenari.id, scenarioId));

    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[impostaVerificheScenarioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare le verifiche dello scenario: ${error.message || error}`,
    };
  }
}
