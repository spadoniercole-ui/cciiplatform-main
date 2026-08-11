import { getDatabaseWorkspace } from './client';
import { parametri_workspace, indici_master, admin_workspace } from './schema';

export async function inizializzaNuovoDatabase(
  pathDatabase: string,
  datiIniziali: {
    admin: typeof admin_workspace.$inferInsert;
    parametriSistema: (typeof parametri_workspace.$inferInsert)[];
    indiciMaster: (typeof indici_master.$inferInsert)[];
  }
) {
  // 1. Inizializza il client del DB locale per questo specifico workspace
  const db = getDatabaseWorkspace(pathDatabase);

  // 2. Esegui le operazioni in una transazione
  // Se una operazione fallisce, il database non viene corrotto
  await db.transaction(async (tx) => {
    // Inserimento Admin
    await tx.insert(admin_workspace).values(datiIniziali.admin);

    // Inserimento Parametri di sistema
    if (datiIniziali.parametriSistema.length > 0) {
      await tx.insert(parametri_workspace).values(datiIniziali.parametriSistema);
    }

    // Inserimento Indici Master
    if (datiIniziali.indiciMaster.length > 0) {
      await tx.insert(indici_master).values(datiIniziali.indiciMaster);
    }
  });

  return { success: true };
}
