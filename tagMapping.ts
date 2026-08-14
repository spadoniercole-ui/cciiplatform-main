'use server';

// Permessi per modulo di un Utente (Operativo/Consultatore). Unica fonte
// letta sia dalla sidebar (per filtrare le voci visibili) sia dal
// controllo d'accesso di ogni pagina (per bloccare l'accesso diretto via
// URL) — non due posti diversi che potrebbero disallinearsi.

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

export async function impostaPermessoAction(
  nomeSchema: string,
  utenteId: number,
  modulo: Modulo,
  livello: LivelloPermesso
): Promise<RisultatoOperazionePermessi> {
  try {
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
