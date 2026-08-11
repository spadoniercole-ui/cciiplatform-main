import { db } from './client'; // Assicurati che importi il tuo client Drizzle
import { parametri_workspace } from './schema'; // Importa la tabella corretta

async function seed() {
  console.log('Inizio seeding...');
  try {
    await db.insert(parametri_workspace).values([
      {
        chiave: 'master_config',
        valore: 'attiva',
        categoria: 'SISTEMA',
        descrizione: 'Configurazione iniziale',
      },
      // Aggiungi qui gli altri record necessari rispettando i campi: chiave, valore, categoria, descrizione
    ]);
    console.log('Seeding completato con successo!');
  } catch (e) {
    console.error('Errore durante il seeding:', e);
  }
}

seed();
