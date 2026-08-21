import { db } from './client';
import { sql } from 'drizzle-orm';
import { getTabelleTenant } from './schema';

// Ogni istruzione DDL è una query separata, non un unico blocco
// multi-istruzione: Postgres avvolge un blocco così in una transazione
// implicita, e se una singola istruzione fallisce annulla anche quelle
// precedenti già riuscite nello stesso blocco (lo stesso problema già
// risolto in src/db/ensureTables.ts per le tabelle di sistema globali).
async function eseguiDdlTenant(istruzione: ReturnType<typeof sql>) {
  await db.execute(istruzione);
}

/**
 * STEP 1 di 2: crea lo schema Postgres isolato per uno spazio di lavoro e le
 * sue tabelle (parametri_workspace, indici_master, admin_workspace, aziende),
 * senza creare ancora nessun record admin — quello è lo step 2, una
 * funzione separata (vedi creaAdminSpazio più sotto), deliberatamente
 * disaccoppiata: uno spazio può esistere con lo schema pronto anche prima
 * che il suo amministratore venga creato.
 */
export async function provisionaSchemaSpazio(codiceSpazio: string): Promise<string> {
  const nomeSchema = `tenant_${codiceSpazio.toLowerCase().replace(/-/g, '_')}`;
  const s = sql.identifier(nomeSchema);

  await eseguiDdlTenant(sql`CREATE SCHEMA IF NOT EXISTS ${s}`);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_workspace (
      chiave TEXT PRIMARY KEY,
      valore TEXT NOT NULL,
      categoria TEXT NOT NULL,
      descrizione TEXT NOT NULL
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.indici_master (
      codice TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      formula TEXT NOT NULL
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.admin_workspace (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      cellulare TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_temporanea TEXT,
      codice_convalida TEXT NOT NULL
    )`
  );
  // Username come identità di login (nome.cognome + cifre): difensivo per
  // gli schemi già creati prima della sua introduzione. UNIQUE per schema,
  // ma sui NULL non blocca (indice parziale) — il backfill la valorizza poi.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.admin_workspace ADD COLUMN IF NOT EXISTS username TEXT`
  );
  // Indice unico NON parziale (Postgres ammette più NULL; un indice parziale
  // manderebbe in errore eventuali ON CONFLICT (username)).
  await eseguiDdlTenant(sql`DROP INDEX IF EXISTS ${s}.admin_workspace_username_key`);
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_workspace_username_key ON ${s}.admin_workspace (username)`
  );

  await assicuraTabellaAziende(nomeSchema);
  await assicuraTabelleUtenti(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);
  await assicuraTabelleParametriSpazio(nomeSchema);
  await assicuraTabellaProposta(nomeSchema);

  return nomeSchema;
}

/**
 * Crea la tabella aziende in uno schema tenant, se non esiste già.
 * Separata e idempotente: serve sia per i nuovi spazi (chiamata da
 * provisionaSchemaSpazio) sia per gli spazi già esistenti creati prima che
 * questa tabella fosse introdotta (chiamata lazy quando si apre la sezione
 * Aziende del pannello) — stesso principio di auto-riparazione già usato
 * per admin_spazio_index.
 */
export async function assicuraTabellaAziende(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.aziende (
      id SERIAL PRIMARY KEY,
      ragione_sociale TEXT NOT NULL,
      codice_fiscale TEXT,
      partita_iva TEXT,
      codice_ateco TEXT,
      logo_url TEXT,
      attiva BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );

  // Qualificazione della sede legale e dati anagrafici aggiuntivi, utili
  // per la reportistica (intestazioni di lettere, relazioni) — difensivo
  // per gli spazi già provisionati prima di questi campi.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS indirizzo_sede_legale TEXT`
  );
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS citta TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS provincia TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS cap TEXT`);
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS forma_giuridica TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS capitale_sociale NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS rappresentante_legale TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS ruolo_rappresentante_legale TEXT`
  );
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS numero_rea TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS pec TEXT`);
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS numero_sedi_secondarie INTEGER NOT NULL DEFAULT 0`
  );
}

/**
 * Crea scenari e checklist_risposte in uno schema tenant, se non esistono
 * già. Stesso principio di auto-riparazione delle altre tabelle.
 */
export async function assicuraTabelleScenari(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);

  await assicuraTabellaAziende(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.scenari (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'BOZZA',
      tipo_proposta TEXT NOT NULL DEFAULT 'DA_DEFINIRE',
      origine_proposta TEXT NOT NULL DEFAULT 'Studio',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );

  // Difensivo: gli spazi provisionati prima dell'introduzione della
  // classificazione della proposta potrebbero avere la tabella già creata
  // senza queste due colonne.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS tipo_proposta TEXT NOT NULL DEFAULT 'DA_DEFINIRE'`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS origine_proposta TEXT NOT NULL DEFAULT 'Studio'`
  );

  // Blocco della riga rilevante (Proposta): senza questo, il confronto
  // con la Posizione Debitoria dell'Ente perderebbe stabilità ad ogni
  // click (un ente che "diventa" un altro ente cambiando selezione).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS riga_rilevante_bloccata BOOLEAN NOT NULL DEFAULT FALSE`
  );

  // Archivia/Elimina — separato da "stato" apposta: archiviare non deve
  // far perdere lo stato procedurale originale, un ripristino torna
  // esattamente com'era.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS archiviato BOOLEAN NOT NULL DEFAULT FALSE`
  );

  // Simulazione a levette (sostenibilità del piano) attivabile anche per il
  // Ricevente, scelta alla creazione dello scenario. Default FALSE: nessun
  // cambiamento per gli scenari già esistenti.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS simulazione_attiva BOOLEAN NOT NULL DEFAULT FALSE`
  );

  // Blocco permanente — solo per il percorso Ricevente: una volta
  // generata la Relazione finale, lo scenario si congela alla data di
  // quella relazione. Uno sblocco esplicito resta possibile, ma solo
  // per l'Admin di Spazio e solo con un motivo dichiarato — vedi
  // scenario_sblocchi sotto. Il Redigente non usa questo campo, resta
  // sempre null per lui.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS bloccato_il TIMESTAMP`
  );

  // Ogni generazione della Relazione è una riga a sé, mai sovrascritta
  // — anche dopo uno sblocco e una rigenerazione, la versione
  // precedente resta consultabile. Senza questo, sbloccare per
  // correggere un errore avrebbe fatto sparire per sempre la relazione
  // già mostrata (o magari già consegnata) a un ente creditore.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.relazione_generazioni (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      numero_versione INTEGER NOT NULL,
      testo TEXT NOT NULL,
      generata_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );

  // Ogni sblocco di uno scenario bloccato è tracciato — solo l'Admin
  // di Spazio può farlo, mai un Operatore, e sempre con un motivo
  // dichiarato: senza questa tabella, uno sblocco sarebbe invisibile a
  // chiunque riguardasse lo scenario più avanti.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.scenario_sblocchi (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      motivo TEXT NOT NULL,
      sbloccato_da TEXT,
      sbloccato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_risposte (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      domanda_id TEXT NOT NULL,
      risposta BOOLEAN,
      note TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (scenario_id, domanda_id)
    )`
  );

  // Check list plurali: una risposta appartiene a un modello specifico
  // ('MINISTERIALE' = quella di sempre, altrimenti l'id del modello
  // custom in checklist_modelli). Il vecchio vincolo univoco
  // (scenario_id, domanda_id) andava sostituito: bloccava una risposta
  // custom con lo stesso id domanda di una ministeriale nello stesso
  // scenario. DROP CONSTRAINT IF EXISTS è un no-op sicuro se il vincolo
  // non esiste con questo nome (quello di default assegnato da Postgres
  // a un UNIQUE inline dichiarato così).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.checklist_risposte ADD COLUMN IF NOT EXISTS modello_chiave TEXT NOT NULL DEFAULT 'MINISTERIALE'`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.checklist_risposte DROP CONSTRAINT IF EXISTS checklist_risposte_scenario_id_domanda_id_key`
  );
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_risposte_scenario_modello_domanda ON ${s}.checklist_risposte (scenario_id, modello_chiave, domanda_id)`
  );

  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_scenari_azienda ON ${s}.scenari (azienda_id)`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_checklist_scenario ON ${s}.checklist_risposte (scenario_id)`
  );

  // Check List Ministeriale a livello Azienda (solo Redigente) — non
  // la stessa tabella di checklist_risposte (chiave su scenario_id,
  // uno scenario alla volta): qui la risposta appartiene all'azienda,
  // per poter essere pre-compilata dallo Screening una volta sola e
  // poi ereditata da ogni nuovo Scenario di quell'azienda, invece di
  // ripartire da zero ogni volta.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.azienda_checklist_ministeriale_risposte (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      domanda_id TEXT NOT NULL,
      risposta BOOLEAN,
      note TEXT,
      /** true se compilata automaticamente dallo Screening (dati verificabili, mai inventati) — false o null se inserita a mano. Solo informativo, per far vedere all'utente cosa ha già fatto lo Screening. */
      da_screening BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (azienda_id, domanda_id)
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_azienda_checklist_ministeriale_azienda ON ${s}.azienda_checklist_ministeriale_risposte (azienda_id)`
  );

  // Test pratico per la ragionevole perseguibilità del risanamento
  // (art. 13, comma 2 CCII — Sezione I del documento guida
  // ministeriale) — solo Redigente, a livello Azienda come la Check
  // List Ministeriale (Sezione II) a cui fa da premessa. Una riga per
  // azienda: le voci del debito da ristrutturare [A] e dei flussi annui
  // a regime [B] che il professionista inserisce. Il risultato (fascia,
  // rapporto) non è persistito — è calcolato deterministicamente da
  // questi input, così non può mai andare fuori sincrono con essi.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.azienda_test_pratico (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      debito_scaduto NUMERIC(18,2) NOT NULL DEFAULT 0,
      di_cui_iscrizioni_a_ruolo NUMERIC(18,2) NOT NULL DEFAULT 0,
      debito_riscadenziato_o_moratorie NUMERIC(18,2) NOT NULL DEFAULT 0,
      linee_credito_non_rinnovabili NUMERIC(18,2) NOT NULL DEFAULT 0,
      rate_finanziamenti_scadenza_2_anni NUMERIC(18,2) NOT NULL DEFAULT 0,
      investimenti_iniziative_industriali NUMERIC(18,2) NOT NULL DEFAULT 0,
      dismissioni_cespiti_o_rami NUMERIC(18,2) NOT NULL DEFAULT 0,
      nuovi_conferimenti_e_finanziamenti NUMERIC(18,2) NOT NULL DEFAULT 0,
      mol_netto_negativo_primo_anno NUMERIC(18,2) NOT NULL DEFAULT 0,
      stralcio_ritenuto_ragionevole NUMERIC(18,2) NOT NULL DEFAULT 0,
      mol_prospettico_normalizzato NUMERIC(18,2) NOT NULL DEFAULT 0,
      investimenti_mantenimento_annui NUMERIC(18,2) NOT NULL DEFAULT 0,
      imposte_reddito_annue NUMERIC(18,2) NOT NULL DEFAULT 0,
      in_equilibrio_dal_secondo_anno BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Crea indici_abilitati e limiti_ricevibilita in uno schema tenant, se non
 * esistono già ("Parametri di Spazio"). Stesso principio di
 * auto-riparazione delle altre tabelle.
 */
/**
 * Modelli di Check List custom, oltre alla Ministeriale (che resta
 * cablata in src/lib/checklist/ministeriale.ts + pesi/soglie per spazio —
 * non duplicata qui, per non rischiare le risposte già raccolte). Ogni
 * spazio può crearne quante ne servono (es. per un ente come l'INPS:
 * "Vigilanza Documentale", "Gestione del Credito", "Ufficio Legale"),
 * stessa struttura sezioni→domande→peso e stesso motore di punteggio.
 */
export async function assicuraTabellaChecklistModelli(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_modelli (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descrizione TEXT,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      sezioni JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Posizione Aggiornata di uno scenario: il bilancio di verifica
 * infrannuale (o di fine anno non ancora deliberato dall'assemblea) che
 * si aggiunge ai due anni già presenti nel file XBRL. Una riga per
 * scenario (non per azienda: scenari diversi della stessa azienda
 * possono avere una posizione aggiornata a date diverse).
 */
export async function assicuraTabellaPosizioneAggiornata(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema); // serve scenari per la FK
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.posizione_aggiornata (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      data_riferimento DATE,
      deliberato BOOLEAN NOT NULL DEFAULT FALSE,
      dati JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Più caricamenti nel tempo per lo stesso scenario (es. un bilancino
  // al 31/12 e un altro al 31/03) — non più un solo record per
  // scenario. Difensivo: se la tabella esisteva già con lo schema
  // vecchio (scenario_id UNIQUE), il vincolo va tolto esplicitamente,
  // CREATE TABLE IF NOT EXISTS da solo non lo farebbe.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.posizione_aggiornata DROP CONSTRAINT IF EXISTS posizione_aggiornata_scenario_id_key`
  );
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_posizione_aggiornata_scenario_data
        ON ${s}.posizione_aggiornata (scenario_id, data_riferimento)`
  );
}

export async function assicuraTabelleParametriSpazio(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.indici_abilitati (
      id SERIAL PRIMARY KEY,
      indice_id INTEGER NOT NULL UNIQUE,
      abilitato BOOLEAN NOT NULL DEFAULT TRUE
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.limiti_ricevibilita (
      id SERIAL PRIMARY KEY,
      categoria_creditore TEXT NOT NULL UNIQUE,
      percentuale_minima INTEGER NOT NULL DEFAULT 0,
      unica_soluzione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      rateizzazione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      note TEXT
    )`
  );

  // Criterio corretto ex CCII: la proposta è ricevibile se offre al
  // creditore non meno di quanto otterrebbe in liquidazione giudiziale.
  // Valore assoluto in euro, stimato dall'Esperto/professionista per
  // quella categoria di creditore — non è una percentuale.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.limiti_ricevibilita ADD COLUMN IF NOT EXISTS valore_liquidazione_stimato NUMERIC`
  );

  // Alias — lo stesso creditore compare con nomi diversi a seconda di
  // chi scrive la riga ("INPS", "Enti previdenziali", "Ente
  // previdenziale"...). Un elenco di nomi alternativi che puntano allo
  // stesso limite configurato, così il matching non dipende dal nome
  // esatto scelto riga per riga.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.limiti_ricevibilita ADD COLUMN IF NOT EXISTS alias TEXT[] NOT NULL DEFAULT '{}'`
  );

  // Limiti per RANGO LEGALE: secondo livello di corrispondenza, quando
  // la riga non combacia con nessuna categoria di creditore configurata
  // per nome esatto (es. riga "Enti previdenziali" non trova "INPS" —
  // nomi liberi, non è pensabile un elenco che li copra tutti). Il rango
  // è un insieme chiuso di 6 valori, non ambiguo: usarlo come fallback
  // prima di "Generale" evita che una riga passi per assenza di
  // controllo quando in realtà un vincolo per quel rango esiste.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.limiti_ricevibilita_rango (
      rango_legale TEXT PRIMARY KEY,
      percentuale_minima INTEGER NOT NULL DEFAULT 0,
      unica_soluzione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      rateizzazione_ammessa BOOLEAN NOT NULL DEFAULT TRUE,
      valore_liquidazione_stimato NUMERIC,
      note TEXT
    )`
  );

  // Solo Redigente: non una soglia per categoria (quella è un vincolo
  // che decide l'ente ricevente, non ha senso per chi scrive la
  // proposta), ma una percentuale di base da cui partire compilando
  // una nuova riga — modificabile riga per riga quando si sa che un
  // creditore specifico richiede una percentuale diversa (es. INPS al
  // 100% mentre la media resta al 30%). Un solo numero per spazio, non
  // una tabella per categoria.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_proposta_redigente (
      id SERIAL PRIMARY KEY,
      percentuale_media_default INTEGER NOT NULL DEFAULT 30
    )`
  );

  // Parametri di visualizzazione dello spazio — un'unica riga (id=1).
  // anni_storico_max: quanti anni di storico XBRL mostrare al massimo a
  // video (Indici multi-periodo e Posizione Aggiornata). NULL = usa il
  // default di sistema (vedi src/lib/parametriPeriodi.ts). Non limita cosa
  // viene archiviato, solo cosa si mostra.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_visualizzazione (
      id INTEGER PRIMARY KEY DEFAULT 1,
      anni_storico_max INTEGER,
      CONSTRAINT una_sola_riga_visualizzazione CHECK (id = 1)
    )`
  );

  // Quali tab del motore XBRL (Indici CNDCEC, Altri Indici, Situazione
  // Debitoria, Andamento Storico) l'Admin di Spazio vuole attive
  // nell'Import XBRL di ogni azienda — non tutte servono a ogni studio.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.xbrl_tab_abilitate (
      id SERIAL PRIMARY KEY,
      tab_codice TEXT NOT NULL UNIQUE,
      abilitato BOOLEAN NOT NULL DEFAULT TRUE
    )`
  );

  // Pesi della Check List (Strutturale/Rilevante/Documentale) — spostati
  // qui dal superadmin: erano globali per tutta la piattaforma, un collo
  // di bottiglia per uno spazio che vuole personalizzare la propria
  // valutazione senza passare dal gestore della piattaforma.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_pesi_domande (
      domanda_id TEXT PRIMARY KEY,
      peso TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_config_pesi (
      chiave TEXT PRIMARY KEY,
      valore INTEGER NOT NULL
    )`
  );

  // Foto congelata del modello base Ministeriale al momento del primo
  // accesso di questo spazio alla Check List: da quel momento in poi
  // questo spazio usa la SUA copia, non più il modello base "in diretta"
  // — una modifica successiva al modello base (superadmin) non tocca gli
  // spazi che hanno già scattato la foto, solo quelli che non l'hanno
  // ancora fatto.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_ministeriale_snapshot (
      id INTEGER PRIMARY KEY DEFAULT 1,
      sezioni JSONB NOT NULL,
      scattata_il TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT un_solo_snapshot CHECK (id = 1)
    )`
  );

  // Domande escluse per questo specifico scenario: un modello (Ministeriale
  // o custom) resta uguale per tutti, ma non ogni domanda è pertinente a
  // ogni caso — es. l'intero gruppo "Gruppo di imprese" non ha senso se
  // l'azienda non fa parte di un gruppo. Escludere qui non tocca il
  // modello: quella domanda resta nel modello, semplicemente non entra
  // nel punteggio di QUESTO scenario.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_esclusioni (
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      modello_chiave TEXT NOT NULL,
      domanda_id TEXT NOT NULL,
      PRIMARY KEY (scenario_id, modello_chiave, domanda_id)
    )`
  );

  // Etichette delle colonne usate nell'export/import Excel dei modelli
  // di Check List — stesso principio di Anagrafica Ente: la STRUTTURA
  // resta fissa (sezione, id, domanda, peso, a cura di, nota — sono i
  // campi che il motore di punteggio richiede), ma il TESTO delle
  // intestazioni si personalizza per spazio, per usare la nomenclatura
  // di chi lo usa davvero (es. "Area" invece di "Sezione Titolo",
  // "Indicatore" invece di "Domanda", come nell'esempio INPS).
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_colonne_config (
      campo TEXT PRIMARY KEY,
      etichetta TEXT NOT NULL
    )`
  );
  // Flessibilità massima: tutti i campi tranne "domanda" (il testo, senza
  // il quale non c'è nulla da rispondere) sono disattivabili — ciascuno
  // con un comportamento di ripiego dichiarato altrove (sezione unica
  // automatica, ID progressivo automatico, peso di default a livello di
  // modello). Deciso esplicitamente: un utente medio, diffidente verso
  // uno strumento che sembra rigido, lo respinge prima ancora di
  // provarlo — vale la pena il lavoro in più.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.checklist_colonne_config ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT TRUE`
  );
  // Usato solo sulla riga campo='peso': se quella colonna è disattivata,
  // ogni domanda di ogni modello custom di questo spazio prende questo
  // peso — condiviso per spazio, non per singolo modello, per non
  // moltiplicare la configurazione (semplificazione dichiarata).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.checklist_colonne_config ADD COLUMN IF NOT EXISTS peso_default TEXT NOT NULL DEFAULT 'RILEVANTE'`
  );

  // Campi extra oltre ai 7 di base — puramente informativi, nessun ruolo
  // nel calcolo del punteggio. Fino a 3 (per un totale di 10 assieme ai
  // 7 fissi, come richiesto). "ordine" per controllare dove compaiono
  // in Excel, prima della colonna peso (sempre l'ultima).
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.checklist_campi_extra (
      id SERIAL PRIMARY KEY,
      etichetta TEXT NOT NULL,
      ordine INTEGER NOT NULL DEFAULT 0
    )`
  );
}

/**
 * Leve della Simulazione per uno scenario — solo l'INPUT (le tre leve
 * scelte dall'operatore). L'output (traiettoria, DSCR, esito) non si
 * salva mai: è sempre ricalcolato dal vivo sui dati correnti
 * (calcolaSimulazione, deterministico) — salvare un risultato lo
 * renderebbe stantio ogni volta che XBRL, Posizione Aggiornata o
 * Proposta cambiano dopo il primo lancio.
 */
export async function assicuraTabellaSimulazione(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.simulazione_scenario (
      scenario_id INTEGER PRIMARY KEY REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      riduzione_costi_pct NUMERIC NOT NULL DEFAULT 0,
      riduzione_personale_pct NUMERIC NOT NULL DEFAULT 0,
      mesi_allungamento_rate INTEGER NOT NULL DEFAULT 0,
      crescita_ricavi_manuale NUMERIC,
      salvata_il TIMESTAMP
    )`
  );
  // Difensivo: se la tabella esisteva già da una versione precedente,
  // CREATE TABLE IF NOT EXISTS non aggiunge la colonna nuova da sola.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_scenario ADD COLUMN IF NOT EXISTS crescita_ricavi_manuale NUMERIC`
  );
}

/**
 * Simulazione Redigente — input per lo strumento "un solo stato, non tre
 * scenari" di chi scrive una proposta (tipoProposta = DA_DEFINIRE). Le
 * aliquote previdenziali/INAIL per categoria vivono qui, per scenario,
 * come scelta pragmatica dichiarata — non a livello di Parametri di
 * Spazio come i pesi della Check List, per non bloccare tutto il resto
 * dietro una sezione di configurazione separata non ancora costruita. Se
 * in futuro serve condividerle tra scenari dello stesso spazio, si
 * sposta lì senza perdere nulla di quanto già inserito qui.
 */
export async function assicuraTabellaSimulazioneRedigente(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.simulazione_redigente (
      scenario_id INTEGER PRIMARY KEY REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      costi_produzione_altri NUMERIC,
      personale JSONB NOT NULL DEFAULT '{}',
      aliquote_personale JSONB NOT NULL DEFAULT '{}',
      giorni_incasso_clienti NUMERIC NOT NULL DEFAULT 30,
      giorni_pagamento_fornitori NUMERIC NOT NULL DEFAULT 30,
      giorni_baseline NUMERIC NOT NULL DEFAULT 30,
      aliquota_imposte_reddito NUMERIC NOT NULL DEFAULT 43,
      aliquota_irap NUMERIC NOT NULL DEFAULT 3.9,
      numero_rate_medie INTEGER NOT NULL DEFAULT 84,
      salvata_il TIMESTAMP
    )`
  );
}

/**
 * Simulazione Ricevente — per chi valuta una proposta arrivata, non chi
 * la scrive: nessun calcolo, nessuna leva. Si caricano i documenti
 * allegati (solo PDF), l'AI li legge insieme ai dati già in piattaforma
 * (Proposta, Indici, Dati di Settore) e restituisce un'analisi che
 * incrocia quello che il documento dichiara con quello che i dati
 * esterni suggeriscono — un lavoro di lettura critica, non di calcolo.
 * I PDF NON si conservano dopo l'analisi (solo il risultato testuale) —
 * scelta deliberata, non un limite tecnico: sono documenti aziendali
 * riservati, non c'è motivo di tenerli più del necessario.
 */
export async function assicuraTabellaSimulazioneRicevente(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.simulazione_ricevente (
      scenario_id INTEGER PRIMARY KEY REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      analisi TEXT,
      nomi_file TEXT[],
      generata_il TIMESTAMP
    )`
  );
  // I tre documenti della fase di analisi proposta sono ora nominati,
  // non un elenco generico: l'asseverazione del professionista e il
  // piano di sviluppo sono opzionali (la loro assenza penalizza il
  // giudizio finale, non lo blocca), la proposta di cram down è
  // obbligatoria (la sua assenza impedisce del tutto l'analisi).
  for (const colonna of ['nome_asseverazione', 'nome_proposta_cram_down', 'nome_piano_sviluppo']) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS ${sql.identifier(colonna)} TEXT`
    );
  }

  // L'importo offerto non si inserisce più a mano in righe — lo
  // estrae l'AI dal PDF della proposta di cram down. Colonne separate
  // per il valore estratto e per il motivo di un'estrazione fallita
  // (il documento non quantifica chiaramente l'offerta, o non nomina
  // questo ente): mai un fallimento silenzioso.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS importo_dovuto_estratto NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS percentuale_offerta_estratta NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS modalita_estratta TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS numero_rate_estratto INTEGER`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS estrazione_riuscita BOOLEAN`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS motivo_estrazione_mancata TEXT`
  );
}

/**
 * Etichette personalizzate per i 4 codici di tipo debito (CLE/CEN/CEC/
 * CEA, fissi nel codice — vedi src/lib/debitiEnte/tipoDebito.ts) usati
 * nella Situazione Debitoria dell'Ente. Il CODICE resta sempre quello,
 * stabile nel database e nel calcolo — solo l'ETICHETTA mostrata
 * all'operatore è personalizzabile per spazio (es. un ente che chiama
 * internamente CEA con un proprio codice, come 7780) — stesso principio
 * già usato per l'Anagrafica Ente e le colonne Excel della Check List.
 */
export async function assicuraTabellaTipoDebitoConfig(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.tipo_debito_config (
      codice TEXT PRIMARY KEY,
      etichetta TEXT NOT NULL
    )`
  );
}

/**
 * Architrave del modello Situazione Debitoria — a differenza di ogni
 * altro Excel del progetto, qui NON esportiamo un modello nostro: il
 * sistema assorbe la struttura di colonne del PRIMO file che l'ente
 * carica (quello che già usa nella propria contabilità) e la fissa come
 * riferimento per tutti i caricamenti successivi, per l'intero spazio —
 * un solo ente, un solo formato. Cambiare modello richiede la
 * cancellazione esplicita di ogni riga già inserita con quel modello, in
 * ogni scenario di questo spazio (vedi azzeraArchitraveDebitiEnteAction).
 */
export async function assicuraTabellaArchitraveDebitiEnte(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_ente_architrave (
      id SERIAL PRIMARY KEY,
      intestazioni_originali JSONB NOT NULL,
      mappatura JSONB NOT NULL,
      mappatura_tipo JSONB NOT NULL,
      numero_colonne INTEGER NOT NULL,
      nome_file_origine TEXT,
      creato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Il foglio scelto in fase di mappatura — molti export (es. INPS)
  // hanno un riepilogo e fogli di dettaglio separati, va riapplicato
  // uguale ai caricamenti successivi, non riscelto ogni volta.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente_architrave ADD COLUMN IF NOT EXISTS nome_foglio TEXT`
  );
  // Alternativa a mappare una colonna "tipo" — alcuni export (es.
  // INPS) non ce l'hanno affatto, ogni riga è implicitamente della
  // stessa natura.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente_architrave ADD COLUMN IF NOT EXISTS tipo_fisso TEXT`
  );
}

/**
 * Brogliaccio — solo per gli scenari RICEVUTA: il documento che accumula
 * l'analisi dell'ente su 3 livelli, uno alla volta. Livello 1 (Posizione
 * Ente + Proposta) è sempre generabile appena i dati esistono. Livello 2
 * (XBRL + Indici) e Livello 3 (Dati di Settore + Simulazione) sono dietro
 * un varco esplicito — "richiesto" — che l'ente attiva solo se vuole
 * approfondire, non generati automaticamente. Ogni livello, una volta
 * generato, resta scritto: rigenerarlo lo sovrascrive, non lo somma.
 */
export async function assicuraTabellaBrogliaccio(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.brogliaccio (
      scenario_id INTEGER PRIMARY KEY REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      livello1_testo TEXT,
      livello1_generato_il TIMESTAMP,
      livello2_richiesto BOOLEAN NOT NULL DEFAULT FALSE,
      livello2_testo TEXT,
      livello2_generato_il TIMESTAMP,
      livello3_richiesto BOOLEAN NOT NULL DEFAULT FALSE,
      livello3_testo TEXT,
      livello3_generato_il TIMESTAMP
    )`
  );
}

/**
 * Documenti di corredo alla proposta — solo percorso Redigente. Bozze
 * scritte per intero dall'AI (come la Relazione), poi liberamente
 * modificabili a mano dal professionista che le firma: asseverazione
 * del professionista (sempre pertinente), lettera di convocazione dei
 * creditori ed eventuale memoria legale a supporto. Una riga per
 * (scenario, tipo). `generato_il` = quando l'AI ha prodotto la bozza;
 * `aggiornato_il` = ultima modifica (a mano o rigenerazione): se
 * aggiornato_il > generato_il, il testo è stato ritoccato dopo la
 * generazione.
 */
export async function assicuraTabellaDocumentiCorredo(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.documenti_corredo (
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      testo TEXT,
      generato_il TIMESTAMP,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (scenario_id, tipo)
    )`
  );
}

/**
 * Confronto con lo scenario liquidatorio — tassi di recupero di
 * settore e criteri legali aggiornati (artt. 63/88 CCII), trovati con
 * ricerca web reale. Non generato al lancio della Relazione (troppo
 * lento lì, l'utente aspetterebbe la ricerca in diretta) — generato
 * silenziosamente a ogni chiusura di un livello del Brogliaccio
 * (Ricevente, l'unico che oggi esiste per davvero), poi "parcheggiato"
 * qui: la Relazione lo legge già pronto, non lo cerca mai lei stessa.
 */
export async function assicuraTabellaConfrontoLiquidatorio(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.confronto_liquidatorio (
      scenario_id INTEGER PRIMARY KEY REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      testo TEXT,
      generato_il TIMESTAMP,
      errore TEXT
    )`
  );
}

/**
 * Screening — solo spazi ENTE, a livello di Azienda (non di Scenario):
 * prima che arrivi una proposta, da XBRL + visura camerale l'AI genera
 * una Check List su misura, lungo le direttrici dichiarate dallo spazio
 * (spazi.direttrici_ente) — non un modello riusabile come i modelli
 * custom della Check List (checklist_modelli), un'istanza generata
 * apposta per QUESTA azienda specifica. L'esito (dopo che un umano
 * risponde) diventa un'etichetta permanente sull'azienda, ereditata da
 * ogni scenario che nascerà su di lei — non un peso che altera calcoli
 * altrove, solo un orientamento sempre visibile.
 */
export async function assicuraTabelleScreeningAzienda(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.azienda_screening (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      direttrici_usate TEXT,
      sezioni JSONB NOT NULL,
      relazione_testo TEXT,
      relazione_generata_il TIMESTAMP,
      nome_file_visura TEXT,
      generato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.azienda_screening_risposte (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      domanda_id TEXT NOT NULL,
      risposta BOOLEAN,
      note TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (azienda_id, domanda_id)
    )`
  );
}

/**
 * Override PER AZIENDA di cosa è abilitato a livello di spazio: quali tab
 * XBRL (tra quelle già attive per lo spazio) e quali indici (tra quelli
 * già attivi per lo spazio) si applicano a QUESTA azienda. Serve perché
 * aziende diverse nello stesso spazio (es. settori ATECO diversi in uno
 * studio commercialista) possono avere bisogno di sottoinsiemi diversi.
 * Non si può abilitare qui qualcosa che è disabilitato a livello di
 * spazio: questa tabella è un sottoinsieme, non un'estensione.
 */
export async function assicuraTabelleConfigAzienda(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.xbrl_tab_azienda (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      tab_codice TEXT NOT NULL,
      abilitato BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (azienda_id, tab_codice)
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.indici_azienda (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      indice_id INTEGER NOT NULL,
      abilitato BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (azienda_id, indice_id)
    )`
  );
}

/**
 * Crea xbrl_storico_azienda in uno schema tenant: storico delle analisi
 * XBRL per azienda, isolato per spazio. Deliberatamente NON la stessa
 * tabella `public.analisi_xbrl_storico` usata dal modulo XBRL del
 * superadmin (quella è globale, chiave codice_fiscale, pensata per un
 * utilizzo di test/superadmin senza isolamento multi-tenant) — riusare
 * quella qui romperebbe l'isolamento per spazio su cui è costruito tutto
 * il resto della piattaforma. Il motore di parsing (src/lib/xbrl) resta
 * lo stesso, cambia solo dove il risultato viene salvato.
 */
export async function assicuraTabellaXbrlAzienda(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.xbrl_storico_azienda (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      anno_bilancio INTEGER,
      nome_file TEXT,
      dati_finanziari JSONB NOT NULL,
      indici JSONB NOT NULL,
      altri_indici JSONB NOT NULL DEFAULT '[]',
      situazione_debitoria JSONB NOT NULL,
      severity TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT uq_azienda_anno_tenant UNIQUE (azienda_id, anno_bilancio)
    )`
  );
}

/**
 * Crea proposta_creditori in uno schema tenant, se non esiste già. Stesso
 * principio di auto-riparazione delle altre tabelle.
 */
export async function assicuraTabellaProposta(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema); // serve scenari per la FK

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.proposta_creditori (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      categoria_creditore TEXT NOT NULL,
      importo_dovuto INTEGER NOT NULL DEFAULT 0,
      percentuale_offerta INTEGER NOT NULL DEFAULT 0,
      modalita TEXT NOT NULL DEFAULT 'UNICA_SOLUZIONE',
      numero_rate INTEGER,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );

  // rango_legale aggiunta più sotto.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ALTER COLUMN importo_dovuto TYPE NUMERIC USING importo_dovuto::numeric`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ALTER COLUMN percentuale_offerta TYPE NUMERIC USING percentuale_offerta::numeric`
  );

  // Rango legale della singola riga (non della categoria: uno stesso
  // creditore — es. una banca — può avere righe con ranghi diversi a
  // seconda del singolo credito). Famiglie tipiche della liquidazione
  // giudiziale, non personalizzabili per spazio: sono una classificazione
  // di legge, non una preferenza dello studio.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ADD COLUMN IF NOT EXISTS rango_legale TEXT`
  );

  // Quale riga interessa all'ente destinatario di una proposta RICEVUTA
  // (una e una sola: un ente guarda la propria posizione, non un
  // sottoinsieme arbitrario delle altre). Non ha senso per una proposta
  // DA_DEFINIRE, dove servono tutti i parametri insieme — il flag resta
  // comunque disponibile ovunque, è l'uso a livello di relazione/PDF a
  // essere condizionato dal tipo di proposta.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ADD COLUMN IF NOT EXISTS rilevante_per_ente BOOLEAN NOT NULL DEFAULT FALSE`
  );

  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_proposta_scenario ON ${s}.proposta_creditori (scenario_id)`
  );
}

/**
 * Posizione Debitoria dell'Ente — "step 0" del cammino, solo per le
 * proposte RICEVUTE (un ente guarda la propria contabilità PRIMA di
 * valutare quanto gli viene offerto; non ha senso per una proposta
 * DA_DEFINIRE, dove non c'è un ente che dichiara nulla). Stesso sistema
 * di caricamento della Proposta (stessa UI, stesso export/import Excel),
 * ma è un'altra tabella — dati diversi, archiviazione diversa.
 */
export async function assicuraTabellaDebitiEnte(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema); // serve scenari per la FK

  // Stessa migrazione di anagrafica_ente — la posizione debitoria che
  // l'ente dichiara per un'azienda non cambia da uno scenario
  // all'altro della stessa azienda. Rinomina la vecchia (per scenario)
  // come archivio, mai persa.
  const vecchiaEsiste = await db.execute(
    sql`SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${nomeSchema} AND table_name = 'debiti_ente'`
  );
  const vecchiaHaScenarioId =
    vecchiaEsiste.length > 0 &&
    (
      await db.execute(
        sql`SELECT 1 FROM information_schema.columns
            WHERE table_schema = ${nomeSchema} AND table_name = 'debiti_ente' AND column_name = 'scenario_id'`
      )
    ).length > 0;
  if (vecchiaHaScenarioId) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.debiti_ente RENAME TO debiti_ente_per_scenario_legacy`
    );
  }

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_ente (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'CLE',
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_debiti_ente_azienda ON ${s}.debiti_ente (azienda_id)`
  );
  // Importo versato — opzionale, alcuni schemi proprietari distinguono
  // il debito originario dal saldo residuo (quanto è già stato pagato).
  // NULL quando la colonna non è mappata: il saldo resta pari
  // all'importo, nessun cambiamento per chi non ha questa distinzione.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS importo_versato NUMERIC`
  );
  // Data — generica (scadenza, notifica, emissione: il significato lo
  // sa l'ente che configura l'architrave, non serve saperlo qui).
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS data DATE`);
  // Colonne "extra": qualunque colonna del file che l'operatore mappa al
  // ruolo "extra" viene salvata qui, chiave = intestazione originale. Così
  // se si mappano 10 colonne, tutte e 10 vengono caricate — anche quelle
  // che non rientrano nei campi semantici (voce/importo/tipo/nota/data).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS dati_extra JSONB`
  );

  // Migrazione dati "best effort", una tantum: per ogni azienda, se la
  // nuova tabella è ancora vuota, copia TUTTE le righe dello scenario
  // (della stessa azienda) aggiornato più di recente — un'azienda con
  // più scenari poteva avere righe diverse in ciascuno, non ha senso
  // fonderle tutte insieme, si prende la versione più recente.
  if (vecchiaHaScenarioId) {
    await eseguiDdlTenant(
      sql`INSERT INTO ${s}.debiti_ente (azienda_id, voce, importo, importo_versato, tipo, note, data, created_at)
          SELECT sc.azienda_id, l.voce, l.importo, l.importo_versato, l.tipo, l.note, l.data, l.created_at
          FROM ${s}.debiti_ente_per_scenario_legacy l
          JOIN ${s}.scenari sc ON sc.id = l.scenario_id
          WHERE sc.id = (
            SELECT l2.scenario_id
            FROM ${s}.debiti_ente_per_scenario_legacy l2
            JOIN ${s}.scenari sc2 ON sc2.id = l2.scenario_id
            WHERE sc2.azienda_id = sc.azienda_id
            ORDER BY l2.created_at DESC
            LIMIT 1
          )
          AND NOT EXISTS (SELECT 1 FROM ${s}.debiti_ente d WHERE d.azienda_id = sc.azienda_id)`
    );
  }
}

/**
 * Anagrafica Ente — "chi è" l'ente per questo spazio (INPS ha matricola,
 * posizione gestione separata, codici CSC/CA...; un altro ente li chiama
 * diversamente). Due tabelle: le ETICHETTE sono a livello di spazio (si
 * configurano una volta, restano per tutti gli scenari), i VALORI sono
 * per scenario (ogni azienda ha la propria matricola/posizione presso
 * l'ente).
 */
export async function assicuraTabelleAnagraficaEnte(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema); // serve scenari per la FK

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.anagrafica_ente_config (
      campo INTEGER PRIMARY KEY,
      etichetta TEXT NOT NULL,
      CONSTRAINT campo_valido CHECK (campo BETWEEN 1 AND 10)
    )`
  );
  // Difensivo: il vincolo originale limitava a 5 campi (1-5) — se la
  // tabella esisteva già da prima di questa consegna, il CREATE TABLE IF
  // NOT EXISTS sopra non lo aggiorna da solo. Sostituito con uno a 10.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.anagrafica_ente_config DROP CONSTRAINT IF EXISTS campo_valido`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.anagrafica_ente_config ADD CONSTRAINT campo_valido CHECK (campo BETWEEN 1 AND 10)`
  );
  // Flessibilità massima, stesso principio già applicato alla Check List
  // custom: ogni campo è disattivabile, non solo rietichettabile — un
  // ente diffidente verso uno strumento che sembra rigido lo respinge
  // prima ancora di provarlo.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.anagrafica_ente_config ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT TRUE`
  );

  // Migrazione da scenario_id ad azienda_id — l'ente identifica
  // un'azienda sempre allo stesso modo nella propria contabilità,
  // indipendentemente da quale proposta/scenario si sta valutando.
  // Se la vecchia tabella (per scenario) esiste ancora col nome
  // pulito, la si rinomina come archivio storico — mai persa, solo
  // non più letta/scritta dal codice corrente — e si crea la nuova a
  // livello azienda al suo posto.
  const vecchiaEsiste = await db.execute(
    sql`SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${nomeSchema} AND table_name = 'anagrafica_ente'`
  );
  const vecchiaHaScenarioId =
    vecchiaEsiste.length > 0 &&
    (
      await db.execute(
        sql`SELECT 1 FROM information_schema.columns
            WHERE table_schema = ${nomeSchema} AND table_name = 'anagrafica_ente' AND column_name = 'scenario_id'`
      )
    ).length > 0;
  if (vecchiaHaScenarioId) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.anagrafica_ente RENAME TO anagrafica_ente_per_scenario_legacy`
    );
  }

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.anagrafica_ente (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      id_ente TEXT,
      campo_1 TEXT,
      campo_2 TEXT,
      campo_3 TEXT,
      campo_4 TEXT,
      campo_5 TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Difensivo: campi 6-10 aggiunti in questa consegna.
  for (let i = 6; i <= 10; i++) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.anagrafica_ente ADD COLUMN IF NOT EXISTS ${sql.identifier(`campo_${i}`)} TEXT`
    );
  }

  // Migrazione dati "best effort", una tantum: se la nuova tabella è
  // ancora vuota per un'azienda e la vecchia (legacy, per scenario) ha
  // dati per quell'azienda, copia dallo scenario aggiornato più di
  // recente. ON CONFLICT DO NOTHING: se già migrato, non sovrascrive.
  if (vecchiaHaScenarioId) {
    await eseguiDdlTenant(
      sql`INSERT INTO ${s}.anagrafica_ente (azienda_id, id_ente, campo_1, campo_2, campo_3, campo_4, campo_5, campo_6, campo_7, campo_8, campo_9, campo_10, updated_at)
          SELECT DISTINCT ON (sc.azienda_id)
            sc.azienda_id, l.id_ente, l.campo_1, l.campo_2, l.campo_3, l.campo_4, l.campo_5, l.campo_6, l.campo_7, l.campo_8, l.campo_9, l.campo_10, l.updated_at
          FROM ${s}.anagrafica_ente_per_scenario_legacy l
          JOIN ${s}.scenari sc ON sc.id = l.scenario_id
          ORDER BY sc.azienda_id, l.updated_at DESC
          ON CONFLICT (azienda_id) DO NOTHING`
    );
  }
}

/**
 * Presa in carico dello step "Analisi Bilancio" a livello di AZIENDA.
 *
 * Le due sotto-sezioni (Configurazione XBRL e Indici) sono un semplice
 * sottoinsieme dei parametri di spazio: non c'è nulla di pesante da
 * caricare qui (il bilancio XBRL vero si carica nello Scenario). Perché il
 * passo diventi verde — e sblocchi lo Screening — basta che l'operatore
 * abbia aperto entrambe le sotto-sezioni. Registriamo quella presa visione
 * qui, una riga per azienda, due booleani. Idempotente: la visita ripetuta
 * non cambia nulla.
 */
export async function assicuraTabellaAnalisiBilancioStep(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema); // serve aziende per la FK
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.analisi_bilancio_step (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      xbrl_config_vista BOOLEAN NOT NULL DEFAULT FALSE,
      indici_visti BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Cache dei dati ISTAT per settore (Dati di Settore) — GLOBALE (schema
 * public, non per tenant). Il dato è nazionale, identico per qualunque
 * azienda con lo stesso gruppo ATECO, di qualunque spazio: metterlo per
 * tenant significherebbe interrogare ISTAT una volta per ogni spazio per
 * lo stesso identico dato. Fondamentale anche per il limite di ISTAT (5
 * richieste al minuto per IP, blocco di 1-2 giorni se superato): una
 * cache condivisa riduce drasticamente le chiamate reali necessarie.
 */
export async function assicuraTabellaDatiSettore(): Promise<void> {
  await eseguiDdlTenant(sql`
    CREATE TABLE IF NOT EXISTS public.dati_settore_cache (
      gruppo_ateco TEXT NOT NULL,
      dataflow TEXT NOT NULL,
      dati JSONB NOT NULL,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (gruppo_ateco, dataflow)
    )
  `);
  // Traccia l'ultima chiamata reale a ISTAT, indipendentemente dal
  // gruppo/dataflow interrogato — è il limite per IP, non per serie: la
  // protezione va applicata a livello globale, non per singola cache.
  await eseguiDdlTenant(sql`
    CREATE TABLE IF NOT EXISTS public.dati_settore_ultima_chiamata (
      id INTEGER PRIMARY KEY DEFAULT 1,
      chiamata_il TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT un_solo_orologio CHECK (id = 1)
    )
  `);
}

/**
 * Crea utenti_spazio e utenti_aziende in uno schema tenant, se non esistono
 * già. Stesso principio di auto-riparazione delle altre tabelle: idempotente,
 * chiamabile sia dal provisioning di un nuovo spazio sia lazy per spazi già
 * esistenti creati prima che queste tabelle fossero introdotte.
 */
export async function assicuraTabelleUtenti(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.utenti_spazio (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      tipologia TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_temporanea TEXT,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Username come identità di login (nome.cognome + cifre) — stesso
  // principio di admin_workspace.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.utenti_spazio ADD COLUMN IF NOT EXISTS username TEXT`);
  // Indice unico NON parziale (vedi nota su admin_workspace).
  await eseguiDdlTenant(sql`DROP INDEX IF EXISTS ${s}.utenti_spazio_username_key`);
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS utenti_spazio_username_key ON ${s}.utenti_spazio (username)`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.utenti_aziende (
      id SERIAL PRIMARY KEY,
      utente_id INTEGER NOT NULL REFERENCES ${s}.utenti_spazio(id) ON DELETE CASCADE,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_utenti_aziende_utente ON ${s}.utenti_aziende (utente_id)`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_utenti_aziende_azienda ON ${s}.utenti_aziende (azienda_id)`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.permessi_utente (
      id SERIAL PRIMARY KEY,
      utente_id INTEGER NOT NULL REFERENCES ${s}.utenti_spazio(id) ON DELETE CASCADE,
      modulo TEXT NOT NULL,
      livello TEXT NOT NULL DEFAULT 'NESSUNO',
      UNIQUE (utente_id, modulo)
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_permessi_utente ON ${s}.permessi_utente (utente_id)`
  );
}

/**
 * STEP 2 di 2. Inserisce il record amministratore nello schema già
 * provisionato dallo step 1.
 */
export async function creaAdminSpazio(
  nomeSchema: string,
  admin: {
    nome: string;
    cognome: string;
    username: string;
    email: string;
    cellulare: string;
    passwordHash: string;
    codiceConvalida: string;
    passwordTemporanea?: string;
  }
) {
  const tabelle = getTabelleTenant(nomeSchema);
  await db.insert(tabelle.admin_workspace).values(admin).onConflictDoNothing();
}

/**
 * Popola parametri_workspace e indici_master di uno schema già provisionato.
 * Separata dal provisioning perché opzionale: uno spazio può restare senza
 * dizionario per un momento senza che questo blocchi la sua creazione.
 */
export async function popolaDatiMasterSpazio(
  nomeSchema: string,
  datiIniziali: {
    parametriSistema: {
      chiave: string;
      valore: string;
      categoria: 'SISTEMA' | 'LICENZA';
      descrizione: string;
    }[];
    indiciMaster: { codice: string; nome: string; formula: string }[];
  }
) {
  const tabelle = getTabelleTenant(nomeSchema);

  await db.transaction(async (tx) => {
    for (const param of datiIniziali.parametriSistema) {
      await tx.insert(tabelle.parametri_workspace).values(param).onConflictDoNothing();
    }
    for (const indice of datiIniziali.indiciMaster) {
      await tx.insert(tabelle.indici_master).values(indice).onConflictDoNothing();
    }
  });
}
