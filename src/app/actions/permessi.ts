'use server';

// Permessi per modulo di un Utente (Operativo/Consultatore). Unica fonte
// letta sia dalla sidebar (per filtrare le voci visibili) sia dal
// controllo d'accesso di ogni pagina (per bloccare l'accesso diretto via
// URL) — non due posti diversi che potrebbero disallinearsi.

import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { MODULI_PERMESSO, type Modulo, type LivelloPermesso } from '@/lib/moduliPermesso';
export type { Modulo, LivelloPermesso };

export interface RisultatoPermessi {
  success: boolean;
  permessi: Record<string, LivelloPermesso>;
  error?: string;
}

export async function ottieniPermessiUtente(
  nomeSchema: string,
  utenteId: number
): Promise<RisultatoPermessi> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db
      .select()
      .from(tabelle.permessi_utente)
      .where(eq(tabelle.permessi_utente.utenteId, utenteId));

    const permessi: Record<string, LivelloPermesso> = {};
    for (const modulo of MODULI_PERMESSO) permessi[modulo] = 'NESSUNO';
    for (const r of righe) permessi[r.modulo] = r.livello as LivelloPermesso;

    return { success: true, permessi };
  } catch (error: any) {
    console.error('[ottieniPermessiUtente] Errore:', error);
    return {
      success: false,
      permessi: {},
      error: `Impossibile caricare i permessi: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazionePermessi {
  success: boolean;
  error?: string;
}

/**
 * Scrive INSIEME i flag di tutte le funzioni (0.255.16). È l'azione della
 * schermata Utenti dopo la creazione: il profilo propone i flag, l'Admin li
 * accende o li spegne e li salva in un colpo solo, senza sette chiamate.
 */
export async function impostaPermessiUtenteAction(
  nomeSchema: string,
  utenteId: number,
  permessi: Record<string, LivelloPermesso>
): Promise<RisultatoOperazionePermessi> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const validi: Record<string, LivelloPermesso> = {};
    for (const modulo of MODULI_PERMESSO) {
      const livello = permessi[modulo];
      if (livello === 'NESSUNO' || livello === 'LETTURA' || livello === 'SCRITTURA') {
        validi[modulo] = livello;
      }
    }
    if (Object.keys(validi).length === 0) {
      return { success: false, error: 'Nessuna funzione da salvare.' };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const esistenti = await db
      .select()
      .from(tabelle.permessi_utente)
      .where(eq(tabelle.permessi_utente.utenteId, utenteId));

    for (const modulo of MODULI_PERMESSO) {
      const livello = validi[modulo];
      if (!livello) continue;
      const riga = esistenti.find((r) => r.modulo === modulo);
      if (riga) {
        await db
          .update(tabelle.permessi_utente)
          .set({ livello })
          .where(eq(tabelle.permessi_utente.id, riga.id));
      } else {
        await db.insert(tabelle.permessi_utente).values({ utenteId, modulo, livello });
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error('[impostaPermessiUtenteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare le funzioni: ${error.message || error}`,
    };
  }
}

export async function impostaPermessoAction(
  nomeSchema: string,
  utenteId: number,
  modulo: Modulo,
  livello: LivelloPermesso
): Promise<RisultatoOperazionePermessi> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const esistente = await db
      .select()
      .from(tabelle.permessi_utente)
      .where(
        and(
          eq(tabelle.permessi_utente.utenteId, utenteId),
          eq(tabelle.permessi_utente.modulo, modulo)
        )
      )
      .limit(1);

    if (esistente.length > 0) {
      await db
        .update(tabelle.permessi_utente)
        .set({ livello })
        .where(eq(tabelle.permessi_utente.id, esistente[0].id));
    } else {
      await db.insert(tabelle.permessi_utente).values({ utenteId, modulo, livello });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[impostaPermessoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare il permesso: ${error.message || error}`,
    };
  }
}
