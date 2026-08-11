import {
  pgSchema,
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  numeric,
} from 'drizzle-orm/pg-core';

/**
 * Helper per ottenere il costruttore di tabelle corretto
 * basato sullo schema (public o tenant).
 */
function getTableBuilder(nomeSchema: string) {
  if (nomeSchema === 'public') {
    return pgTable;
  }
  const schema = pgSchema(nomeSchema);
  // Restituiamo una funzione che invoca il metodo .table dello schema
  return (name: string, columns: any) => schema.table(name, columns);
}

export function getTabelleTenant(nomeSchema: string) {
  const tableBuilder = getTableBuilder(nomeSchema);

  return {
    parametri_workspace: tableBuilder('parametri_workspace', {
      chiave: text('chiave').primaryKey(),
      valore: text('valore').notNull(),
      categoria: text('categoria').$type<'SISTEMA' | 'LICENZA'>().notNull(),
      descrizione: text('descrizione').notNull(),
    }),

    indici_master: tableBuilder('indici_master', {
      codice: text('codice').primaryKey(),
      nome: text('nome').notNull(),
      formula: text('formula').notNull(),
    }),

    admin_workspace: tableBuilder('admin_workspace', {
      id: serial('id').primaryKey(),
      nome: text('nome').notNull(),
      cognome: text('cognome').notNull(),
      email: text('email').notNull().unique(),
      cellulare: text('cellulare').notNull(),
      passwordHash: text('password_hash').notNull(),
      passwordTemporanea: text('password_temporanea'),
      codiceConvalida: text('codice_convalida').notNull(),
    }),

    // Utenti operativi/consultatori dello spazio (distinti dall'Admin di
    // Spazio, che vive in admin_workspace). Ogni utente può essere
    // associato a una o più aziende tramite utenti_aziende — coerente con
    // "permessi su azienda: quali può vedere/operare" della specifica.
    utenti_spazio: tableBuilder('utenti_spazio', {
      id: serial('id').primaryKey(),
      nome: text('nome').notNull(),
      cognome: text('cognome').notNull(),
      email: text('email').notNull().unique(),
      tipologia: text('tipologia').$type<'OPERATIVO' | 'CONSULTATORE'>().notNull(),
      passwordHash: text('password_hash').notNull(),
      passwordTemporanea: text('password_temporanea'),
      attivo: boolean('attivo').notNull().default(true),
      createdAt: timestamp('created_at').defaultNow().notNull(),
    }),

    // Associazione N:N utente <-> azienda (un utente può operare su più
    // aziende dello stesso spazio, un'azienda può avere più utenti).
    utenti_aziende: tableBuilder('utenti_aziende', {
      id: serial('id').primaryKey(),
      utenteId: integer('utente_id').notNull(),
      aziendaId: integer('azienda_id').notNull(),
    }),

    // Permessi per modulo di ogni utente Operativo/Consultatore (Nessun
    // Accesso / Lettura / Scrittura). L'Admin di Spazio non ha righe qui:
    // non è mai soggetto a restrizioni. Se un utente non ha una riga per un
    // dato modulo, il modulo si considera NESSUNO (negato di default, non
    // concesso di default — più sicuro in caso di dimenticanza).
    permessi_utente: tableBuilder('permessi_utente', {
      id: serial('id').primaryKey(),
      utenteId: integer('utente_id').notNull(),
      modulo: text('modulo').notNull(), // es. 'scenari', 'checklist', 'indici', 'xbrl', 'report'
      livello: text('livello')
        .$type<'NESSUNO' | 'LETTURA' | 'SCRITTURA'>()
        .notNull()
        .default('NESSUNO'),
    }),

    // Scenario: unità operativa centrale dell'analisi. Un'azienda può avere
    // N scenari nel tempo (es. "Bilancio 2025", "Ipotesi A con cessione
    // ramo"), ognuno un ciclo di analisi indipendente — Check List, Test
    // Pratico, Indici, XBRL, Cram Down si agganciano tutti allo Scenario,
    // non direttamente all'Azienda.
    scenari: tableBuilder('scenari', {
      id: serial('id').primaryKey(),
      aziendaId: integer('azienda_id').notNull(),
      nome: text('nome').notNull(),
      stato: text('stato').$type<'BOZZA' | 'IN_CORSO' | 'COMPLETATO'>().notNull().default('BOZZA'),
      tipoProposta: text('tipo_proposta')
        .$type<'RICEVUTA' | 'DA_DEFINIRE'>()
        .notNull()
        .default('DA_DEFINIRE'),
      origineProposta: text('origine_proposta').notNull().default('Studio'),
      // Blocca la scelta della riga "rilevante per l'ente" (Proposta), in
      // modo che il confronto con la Posizione Debitoria dell'Ente resti
      // stabile — cambiare selezione dopo il blocco richiede uno sblocco
      // esplicito, non un click distratto.
      rigaRilevanteBloccata: boolean('riga_rilevante_bloccata').notNull().default(false),
      // Separato da "stato" apposta: archiviare non deve far perdere lo
      // stato procedurale originale (BOZZA/IN_CORSO/COMPLETATO) — un
      // ripristino torna esattamente com'era, non riparte da BOZZA.
      archiviato: boolean('archiviato').notNull().default(false),
      // Solo percorso Ricevente — valorizzato quando la Relazione
      // finale è generata, da quel momento lo scenario è sola lettura
      // permanente. Sempre null per il Redigente.
      bloccatoIl: timestamp('bloccato_il'),
      createdAt: timestamp('created_at').defaultNow().notNull(),
    }),

    // Risposte alla Check List ministeriale (Sezione II del decreto
    // dirigenziale 23 aprile 2026), una riga per domanda per scenario.
    checklist_risposte: tableBuilder('checklist_risposte', {
      id: serial('id').primaryKey(),
      scenarioId: integer('scenario_id').notNull(),
      domandaId: text('domanda_id').notNull(), // es. "1.1", "2.3", "6.4"
      risposta: boolean('risposta'), // null = non ancora risposto
      note: text('note'),
      updatedAt: timestamp('updated_at').defaultNow().notNull(),
    }),

    // Parametri di Spazio — quali indici del dizionario master usare in
    // questo spazio (un sottoinsieme, non nuovi indici). Se un indice non
    // ha una riga qui, si considera abilitato di default (comportamento
    // preesistente prima che questa selezione esistesse).
    indici_abilitati: tableBuilder('indici_abilitati', {
      id: serial('id').primaryKey(),
      indiceId: integer('indice_id').notNull(),
      abilitato: boolean('abilitato').notNull().default(true),
    }),

    // Parametri di Spazio — limiti di ricevibilità di una proposta, per
    // categoria di creditore (es. INPS non considera ricevibile una
    // proposta sotto il 100%, in unica soluzione o a rate). "Generale" è
    // la categoria di fallback per creditori non esplicitamente elencati.
    limiti_ricevibilita: tableBuilder('limiti_ricevibilita', {
      id: serial('id').primaryKey(),
      categoriaCreditore: text('categoria_creditore').notNull().unique(),
      percentualeMinima: integer('percentuale_minima').notNull().default(0),
      unicaSoluzioneAmmessa: boolean('unica_soluzione_ammessa').notNull().default(true),
      rateizzazioneAmmessa: boolean('rateizzazione_ammessa').notNull().default(true),
      note: text('note'),
    }),

    // Righe della proposta (ricevuta o da definire) di uno scenario, una
    // per categoria di creditore: importo dovuto, % offerta, modalità.
    // Verificata contro limiti_ricevibilita per il giudizio di ricevibilità.
    proposta_creditori: tableBuilder('proposta_creditori', {
      id: serial('id').primaryKey(),
      scenarioId: integer('scenario_id').notNull(),
      categoriaCreditore: text('categoria_creditore').notNull(),
      importoDovuto: integer('importo_dovuto').notNull().default(0),
      percentualeOfferta: integer('percentuale_offerta').notNull().default(0),
      modalita: text('modalita')
        .$type<'UNICA_SOLUZIONE' | 'RATEALE'>()
        .notNull()
        .default('UNICA_SOLUZIONE'),
      numeroRate: integer('numero_rate'),
      note: text('note'),
      createdAt: timestamp('created_at').defaultNow().notNull(),
    }),

    // Aziende gestite all'interno di questo spazio. Livello su cui, in
    // futuro, si aggancerà l'entità "Scenario" (un'azienda può avere N
    // scenari, ognuno un ciclo di analisi completo: check list, indici,
    // XBRL, proposta cram down) — non ancora costruita, ma la tabella
    // aziende è pensata per reggerla senza dover essere riscritta.
    aziende: tableBuilder('aziende', {
      id: serial('id').primaryKey(),
      ragioneSociale: text('ragione_sociale').notNull(),
      codiceFiscale: text('codice_fiscale'),
      partitaIva: text('partita_iva'),
      codiceAteco: text('codice_ateco'),
      logoUrl: text('logo_url'),
      attiva: boolean('attiva').notNull().default(true),
      // Sede legale, per la reportistica (es. intestazioni di lettere e
      // relazioni, dove servono per esteso — vedi i documenti reali di
      // riferimento: convocazione INPS/INAIL e piano di risanamento).
      indirizzoSedeLegale: text('indirizzo_sede_legale'),
      citta: text('citta'),
      provincia: text('provincia'),
      cap: text('cap'),
      formaGiuridica: text('forma_giuridica'),
      capitaleSociale: numeric('capitale_sociale'),
      rappresentanteLegale: text('rappresentante_legale'),
      ruoloRappresentanteLegale: text('ruolo_rappresentante_legale'),
      numeroRea: text('numero_rea'),
      pec: text('pec'),
      numeroSediSecondarie: integer('numero_sedi_secondarie').notNull().default(0),
      createdAt: timestamp('created_at').defaultNow().notNull(),
    }),
  };
}

// --- Esportazioni per Drizzle Kit (Schema Pubblico) ---
// Utilizziamo lo schema 'public' per le tabelle globali gestite da Drizzle Kit
const tabellePubbliche = getTabelleTenant('public');

export const parametri_workspace = tabellePubbliche.parametri_workspace;
export const indici_master = tabellePubbliche.indici_master;
export const admin_workspace = tabellePubbliche.admin_workspace;
export const aziende = tabellePubbliche.aziende;
export const utenti_spazio = tabellePubbliche.utenti_spazio;
export const utenti_aziende = tabellePubbliche.utenti_aziende;
export const permessi_utente = tabellePubbliche.permessi_utente;
export const scenari = tabellePubbliche.scenari;
export const checklist_risposte = tabellePubbliche.checklist_risposte;
export const indici_abilitati = tabellePubbliche.indici_abilitati;
export const limiti_ricevibilita = tabellePubbliche.limiti_ricevibilita;
export const proposta_creditori = tabellePubbliche.proposta_creditori;

// NOTA ARCHITETTURALE: questo file gestisce SOLO le tabelle per-tenant a
// schema Postgres dinamico (getTabelleTenant), il meccanismo reale e
// intenzionale per il futuro multi-tenant. Le tabelle di sistema globali
// (licenze, sessioni, xbrl_tag_mappings, indici, parametri_sistema) sono
// gestite con SQL diretto tramite il Pool di src/lib/db.ts — vedi
// src/app/actions/licenze.ts, src/app/actions/auth.ts,
// src/lib/xbrl/tagMapping.ts, src/app/api/indici/route.ts — non con
// Drizzle. Gli script di creazione di queste tabelle sono in
// src/db/sql/*.sql.
//
// In precedenza qui erano dichiarate anche `licenze`, `xbrlTagMappings` e
// `sessioni` come tabelle Drizzle: nessuna delle tre era mai stata
// importata da codice reale (verificato). Peggio, la dichiarazione
// `licenze` descriveva colonne (workspaceId, chiaveLicenza, stato...) che
// non corrispondono alle colonne realmente usate dalla tabella `licenze` in
// produzione (id_licenza, ragione_sociale, max_spazi...): se qualcuno
// l'avesse importata per errore, avrebbe generato query verso colonne
// inesistenti. Rimosse entrambe le fonti di confusione.
