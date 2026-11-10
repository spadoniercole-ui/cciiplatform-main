import { db } from './client';
import { pool } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { deveRinominareInLegacy } from '@/lib/migrazioni/debitiEnteLegacy';
import { assicuraTabelleProdotti } from './provisionProdotti';
import { sqlVincoloCheckIdempotente } from '@/lib/migrazioni/vincoloCheck';
import { sqlChiaveEsternaIdempotente } from '@/lib/migrazioni/chiaveEsterna';
import { eCorsaDdlBenigna } from '@/lib/migrazioni/corsaDdl';
import { getTabelleTenant } from './schema';

// Ogni istruzione DDL è una query separata, non un unico blocco
// multi-istruzione: Postgres avvolge un blocco così in una transazione
// implicita, e se una singola istruzione fallisce annulla anche quelle
// precedenti già riuscite nello stesso blocco (lo stesso problema già
// risolto in src/db/ensureTables.ts per le tabelle di sistema globali).
//
// Una corsa concorrente BENIGNA (due richieste che creano lo stesso oggetto
// nello stesso istante: "already exists", o il duplicato sui cataloghi di
// sistema di un CREATE … IF NOT EXISTS) viene ignorata, come già fa
// src/db/ensureTables.ts; qualunque altro errore viene rilanciato.

// DDL GIÀ GARANTITO IN QUESTO PROCESSO. Le funzioni `assicuraTabella…`
// venivano chiamate a ogni azione: per il registro delle consegne sono un
// CREATE TABLE, cinque ALTER TABLE e un CREATE INDEX per ogni registrazione,
// lettura e conferma. Su Postgres ogni DDL idempotente prende comunque un lock
// sulla tabella e produce un NOTICE: con più operatori sul triage, il registro
// in scrittura si metteva in coda dietro le letture per un lavoro già fatto.
//
// Il DDL resta la garanzia di primo accesso (spazi creati prima di una
// colonna nuova la ricevono così), ma si esegue una volta per processo e per
// schema. Chi cancella o ripristina lo schema deve chiamare
// `dimenticaTabelleGarantite`, altrimenti la garanzia resta valida per una
// tabella che non esiste più.
const tabelleGarantite = new Set<string>();

function giaGarantita(nomeSchema: string, tabella: string): boolean {
  return tabelleGarantite.has(`${nomeSchema}.${tabella}`);
}

function segnaGarantita(nomeSchema: string, tabella: string): void {
  tabelleGarantite.add(`${nomeSchema}.${tabella}`);
}

/**
 * Dimentica il DDL già eseguito: da chiamare quando lo schema viene
 * cancellato o sostituito (azzeramento, ripristino, eliminazione dello
 * spazio). Senza `nomeSchema` si dimentica tutto.
 */
export function dimenticaTabelleGarantite(nomeSchema?: string): void {
  if (!nomeSchema) {
    tabelleGarantite.clear();
    return;
  }
  for (const chiave of tabelleGarantite) {
    if (chiave.startsWith(`${nomeSchema}.`)) tabelleGarantite.delete(chiave);
  }
}

export async function eseguiDdlTenant(istruzione: ReturnType<typeof sql>) {
  try {
    await db.execute(istruzione);
  } catch (error) {
    if (eCorsaDdlBenigna(error)) {
      console.warn(
        '[provision] Corsa concorrente sul DDL del tenant (innocua, ignorata):',
        (error as Error)?.message
      );
      return;
    }
    throw error;
  }
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

  // Anno di costituzione — OBBLIGATORIO in anagrafica.
  //
  // Serve a distinguere due assenze che a video si somigliano: un bilancio
  // XBRL che manca perché l'impresa è appena nata, e uno che manca perché i
  // bilanci non sono stati depositati. Il secondo caso è di per sé un
  // segnale, il primo no. Senza questo dato l'indicatore di attenzione non
  // può fare la distinzione e dichiara il perimetro non circoscrivibile.
  //
  // Nullable a livello di colonna (le aziende già inserite non ce l'hanno e
  // non si inventa una data), ma obbligatorio nella regola di completezza:
  // l'anagrafica di quelle aziende risulterà incompleta finché non viene
  // compilato. È il comportamento voluto — costringe a colmare il dato — ma
  // ha un effetto immediato sul semaforo di ogni azienda esistente.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS anno_costituzione INTEGER`
  );

  // Contributi INPS letti dai file e conservati ANNO PER ANNO.
  //
  // `[{ anno, dovuti, scaduti }]`: i dovuti vengono dal saldo delle denunce
  // (DM10 / UNIEMENS), gli scaduti dalla Lista Inadempienze, già entrambi
  // aggregati per anno all'atto della lettura. Servono a due cose: la scheda
  // Soglie li usa come sorgente automatica quando i campi non sono stati
  // compilati, e la scheda Indici mostra il rapporto scaduti/dovuti accanto
  // agli indici dello stesso anno — così si vede da quale esercizio il
  // rapporto dell'art. 25-novies, lett. a) si è acceso.
  //
  // JSON e non una tabella: è una fotografia per azienda, si riscrive tutta
  // a ogni caricamento e non si interroga per riga.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS contributi_per_anno JSONB`
  );

  // DA DOVE viene la serie conservata: 'file' (DM10 e Lista Inadempienze),
  // oppure 'posizioni'/'valori' quando l'ha ricostruita il ricalcolo
  // d'ufficio (o la lettura pigra della scheda Indici). Serve perché la
  // ricostruzione non si presenti come la lettura dei file: senza questa
  // colonna, una serie dedotta dal triage si rileggerebbe come se i fogli
  // fossero stati caricati. NULL = serie scritta prima che la colonna
  // esistesse, cioè dai file.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS contributi_per_anno_origine TEXT`
  );

  // Stato "in verifica": l'azienda esiste come record ma non è ancora una
  // posizione in lavorazione.
  //
  // Nasce dalla funzione "Verifica salute azienda", che serve al triage: si
  // caricano visura, XBRL e la certificazione dei debiti, si ottiene l'indicatore, e SOLO se si
  // decide di procedere l'azienda diventa attiva. Il costo di guardare una
  // posizione scende da quindici campi digitati a due o tre da confermare.
  //
  // Perché comunque un record, e non un calcolo al volo: se un funzionario
  // guarda l'indicatore e decide di NON procedere, ha preso una decisione
  // amministrativa, e senza traccia non resta memoria di chi ha verificato
  // cosa. In un ente è la traccia che protegge il funzionario. Inoltre i
  // documenti caricati vengono sempre eliminati dopo l'elaborazione: senza
  // esito salvato, due funzionari sulla stessa azienda otterrebbero report
  // diversi e nessuno dei due sarebbe ricostruibile.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS in_verifica BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS verifica_esito TEXT`);
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS verifica_eseguita_il TIMESTAMP`
  );
  // DATA DI RIFERIMENTO della verifica: il giorno a cui si riferiscono i conti
  // (esigibilità dei periodi, anno precedente per il 30%, anzianità del
  // ritardo). Non è la data in cui si è premuto «Conferma e valuta»:
  // quest'ultima è un istante, quella è un giorno civile dichiarato
  // dall'operatore, e i due possono non coincidere (si verifica oggi una
  // posizione al 30 settembre). Senza, riaprendo una verifica dopo un crash i
  // documenti per i reparti si ricostruirebbero su una data inventata.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS verifica_riferita_al DATE`
  );

  // Archiviazione della verifica: decidere di NON procedere è una decisione
  // amministrativa quanto decidere di procedere, e va registrata con il suo
  // motivo. Senza, la coda di lavoro cresce all'infinito e nessuno sa perché
  // una posizione è stata lasciata andare.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS verifica_archiviata BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS verifica_motivo TEXT`
  );

  // ---- Soglie di segnalazione art. 25-novies: valori a inserimento manuale.
  //
  // Stanno sull'AZIENDA e non sullo scenario: il debito e' il punto di
  // partenza di ogni analisi, non cambia da uno scenario all'altro. Si
  // compilano una volta nella fase di raccolta delle informazioni azienda
  // (scheda "Soglie di segnalazione" accanto alla Certificazione dei debiti) e da li'
  // vengono riportati in ogni scenario.
  //
  // Tutte FACOLTATIVE: obbligatorie manderebbero in arancione l'anagrafica di
  // ogni azienda gia' inserita, bloccando a cascata gli step successivi via
  // semaforo. Dove mancano, il motore dichiara l'esito non determinabile
  // invece di inventarlo.
  //
  // `con_lavoratori_subordinati` e' NULLABLE a TRE stati: TRUE / FALSE / NULL
  // (non dichiarato). Un booleano con default FALSE farebbe passare per
  // "impresa senza lavoratori" ogni azienda su cui nessuno si e' pronunciato,
  // applicando la soglia sbagliata (5.000 € invece del concorso 30% +
  // 15.000 €) senza che nessuno se ne accorga.
  for (const colonna of [
    'con_lavoratori_subordinati BOOLEAN',
    'contributi_scaduti NUMERIC',
    'contributi_dovuti_anno_precedente NUMERIC',
    'anno_contributi_dovuti INTEGER',
    'sanzioni_presunte_vera NUMERIC',
    'premi_inail NUMERIC',
    'iva_scaduta NUMERIC',
    'volume_affari NUMERIC',
    'crediti_affidati_aer NUMERIC',
    'soglie_aggiornate_al DATE',
    // Terzo requisito dell'art. 25-novies, accertato dall'Elenco Deleghe.
    // NULL = non accertato, diverso da FALSE = accertato e assente.
    'ritardo_oltre_90_giorni BOOLEAN',
    'periodi_in_ritardo INTEGER',
    'denunce_non_presentate TEXT',
    // ---- SEGNALI DELL'ART. 3, COMMA 4 (dati dell'impresa).
    //
    // L'art. 25-novies guarda ciò che l'ente vede; l'art. 3, comma 4 guarda
    // ciò che l'impresa deve saper vedere: retribuzioni, fornitori, banche.
    // Questi importi non arrivano da nessun documento che la piattaforma
    // legge, quindi si dichiarano a mano nella scheda Soglie — e restano
    // NULL quando nessuno li ha dichiarati, così il confronto risulta «non
    // verificabile» invece di sparire o di valere zero.
    'retribuzioni_scadute_oltre_30 NUMERIC',
    'retribuzioni_mensili_totali NUMERIC',
    'fornitori_scaduti_oltre_90 NUMERIC',
    'fornitori_non_scaduti NUMERIC',
    'banche_scadute_oltre_60 NUMERIC',
    'banche_oltre_affidamento_oltre_60 NUMERIC',
    'banche_esposizioni_totali NUMERIC',
    // Visura caricata nel triage, TRATTENUTA fino alla generazione dello
    // screening e poi eliminata. Deroga consapevole alla regola per cui i
    // documenti non si conservano mai: senza, la visura appena fornita
    // verrebbe distrutta e lo screening la richiederebbe di nuovo — un file
    // richiesto due volte nello stesso percorso.
    //
    // La deroga è circoscritta: una visura è un atto pubblico del Registro
    // Imprese, e la conservazione dura il tempo di un passaggio, non oltre.
    'visura_triage_url TEXT',
    'visura_triage_nome TEXT',
    'visura_triage_il TIMESTAMP',
  ]) {
    // Un DDL per chiamata: le stringhe multi-statement provocano rollback
    // impliciti silenziosi.
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.aziende ADD COLUMN IF NOT EXISTS ${sql.raw(colonna)}`
    );
  }
}

/**
 * Crea scenari e checklist_risposte in uno schema tenant, se non esistono
 * già. Stesso principio di auto-riparazione delle altre tabelle.
 */
/**
 * Cronologia dei cambi di situazione (0.190.0). Tabella separata e
 * idempotente: si crea al primo cambio, non serve a chi non ne ha mai fatti.
 */
export async function assicuraStoricoSituazione(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.situazione_storico (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      da TEXT,
      a TEXT NOT NULL,
      cambiata_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Annullamento dell'ultimo cambio (0.191.0): la riga resta, marcata.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.situazione_storico ADD COLUMN IF NOT EXISTS annullato_il TIMESTAMP`
  );
  // Chi ha cambiato e chi ha annullato (0.192.0): l'autore viene dalla
  // sessione, mai dal browser.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.situazione_storico ADD COLUMN IF NOT EXISTS autore TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.situazione_storico ADD COLUMN IF NOT EXISTS annullato_da TEXT`
  );
}

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

  // Che cosa ha in mano l'azienda (0.170.0): proposta, decreto di
  // liquidazione giudiziale o dispositivo di cram down. Gli scenari che
  // esistevano prima restano PROPOSTA e non ricevono la domanda; solo i
  // nuovi nascono 'DA_CHIEDERE' e la vedono una volta sola.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS tipo_istruttoria TEXT NOT NULL DEFAULT 'PROPOSTA'`
  );
  // La verifica di base scelta alla creazione (0.195.0): aziendale per
  // l'accordo transattivo, amministrativa per liquidazione e cram down.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS base_verifica TEXT`);
  // Le sovrascritture del transattivo (0.196.0): una riga per cella
  // modificata, con il valore di base e la differenza. La traccia serve alla
  // statistica del modello, non a nascondere la correzione.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.scenario_sovrascritture (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      anno INTEGER NOT NULL,
      voce TEXT NOT NULL,
      valore_base NUMERIC(16,2) NOT NULL,
      valore_inserito NUMERIC(16,2) NOT NULL,
      differenza NUMERIC(16,2) NOT NULL,
      autore TEXT,
      aggiornata_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS scenario_sovrascritture_unica
          ON ${s}.scenario_sovrascritture (scenario_id, anno, voce)`
  );
  // Cambio di situazione (0.189.0): la data non cancella il lavoro fatto,
  // dice soltanto da quando i passi compilati vanno ricontrollati.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS situazione_cambiata_il TIMESTAMP`
  );
  // Quali verifiche dell'ente sono caricate nello scenario (0.182.0): la
  // scelta si fa alla creazione e resta modificabile dal passo 0. Gli scenari
  // che esistevano prima nascono con l'amministrativa attiva — è la verifica
  // minima — ma senza data: non si inventa il giorno in cui è stata caricata.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS verifica_amministrativa BOOLEAN NOT NULL DEFAULT TRUE`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS verifica_contabile BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS verifica_amministrativa_il TIMESTAMP`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS verifica_contabile_il TIMESTAMP`
  );

  // Istruttoria del provvedimento del giudice: una riga per scenario.
  // I documenti si conservano fino alla generazione dell'analisi critica,
  // poi i file vengono eliminati e resta ciò che è stato letto e calcolato.
  // La tabella è separata da simulazione_ricevente perché qui non c'è una
  // proposta da valutare: ci sono un atto del giudice e un confronto.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.istruttoria_giudice (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL UNIQUE REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      documenti JSONB NOT NULL DEFAULT '[]'::jsonb,
      lettura JSONB,
      confronto JSONB,
      relazione TEXT,
      lettura_il TIMESTAMP,
      generata_il TIMESTAMP
    )`
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

  // Inquadramento della proposta (0.109.81): i tre dati da cui dipende quale
  // regola del registro delle fonti si applica. Tutti facoltativi e senza
  // default: uno scenario esistente resta "da compilare", non riceve una
  // data o uno strumento che nessuno ha indicato. La data e' TEXT AAAA-MM-GG
  // (un DATE passerebbe per il fuso orario del server); la quota e' 0..1 ed
  // e' valorizzata SOLO quando l'operatore corregge a mano il valore
  // calcolato dalle righe.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS strumento_proposta TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS data_deposito_proposta TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.scenari ADD COLUMN IF NOT EXISTS quota_altri_aderenti_manuale NUMERIC`
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
  // Provenienza (0.109.115): da quale file arriva il caricamento (bilancino
  // importato → documenti_origine con impronta) e come è stato compilato.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.posizione_aggiornata ADD COLUMN IF NOT EXISTS documento_id INTEGER`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.posizione_aggiornata ADD COLUMN IF NOT EXISTS origine TEXT`
  );
}

/**
 * Tracciati dei bilancini (0.109.115). Un bilancino di verifica arriva nel
 * formato del software contabile dell'azienda: colonne, segno degli importi
 * e piano dei conti cambiano. La prima volta l'operatore conferma colonne e
 * classificazione dei conti; qui si memorizza tutto, per azienda e per
 * «firma» dell'intestazione, così il caricamento successivo dello stesso
 * formato si riconosce da solo e chiede conferma solo sui conti nuovi.
 */
export async function assicuraTabellaTracciatiBilancino(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.tracciati_bilancino (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      firma TEXT NOT NULL,
      colonne JSONB NOT NULL,
      mappa JSONB NOT NULL DEFAULT '{}'::jsonb,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (azienda_id, firma)
    )`
  );
}

export async function assicuraTabelleParametriSpazio(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);

  // Soglie di segnalazione art. 25-novies, configurabili per spazio.
  //
  // Gli importi sono di LEGGE, non nostri: i valori predefiniti sono quelli
  // dell'articolo, e la tabella esiste perché una riforma non debba imporre
  // una nuova release. Chi modifica un valore qui cambia l'esito di una
  // valutazione: l'interfaccia lo dice, mostra sempre il valore di legge
  // accanto a quello impostato, e consente di ripristinarlo.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_soglie_25novies (
      id INTEGER PRIMARY KEY DEFAULT 1,
      inps_percentuale NUMERIC NOT NULL DEFAULT 0.30,
      inps_importo_con_lavoratori NUMERIC NOT NULL DEFAULT 15000,
      inps_importo_senza_lavoratori NUMERIC NOT NULL DEFAULT 5000,
      inail NUMERIC NOT NULL DEFAULT 5000,
      iva_importo NUMERIC NOT NULL DEFAULT 5000,
      iva_percentuale_volume_affari NUMERIC NOT NULL DEFAULT 0.10,
      iva_importo_assoluto NUMERIC NOT NULL DEFAULT 20000,
      aer_impresa_individuale NUMERIC NOT NULL DEFAULT 100000,
      aer_societa_persone NUMERIC NOT NULL DEFAULT 200000,
      aer_altre_societa NUMERIC NOT NULL DEFAULT 500000,
      giorni_ritardo INTEGER NOT NULL DEFAULT 90,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT riga_unica CHECK (id = 1)
    )`
  );
  await eseguiDdlTenant(
    sql`INSERT INTO ${s}.parametri_soglie_25novies (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );

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

  // Collegamento CERTO fra la categoria di creditore configurata dall'utente e
  // la soglia di legge dell'art. 25-novies.
  //
  // `categoria_creditore` e' testo libero: va benissimo per raggruppare i
  // limiti di ricevibilita', ma non basta a decidere QUALE soglia applicare,
  // perche' li' serve una corrispondenza esatta (INPS -> 30% + 15.000,
  // INAIL -> 5.000, AdE -> 5.000 con il 10% del volume d'affari). Chi
  // configura puo' scrivere "Enti previdenziali" o "INPS Sede di Milano".
  //
  // Elenco chiuso, NULL ammesso: dove non e' impostata, la griglia dichiara
  // di non poter applicare alcuna soglia invece di indovinarne una.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.limiti_ricevibilita ADD COLUMN IF NOT EXISTS ente_25novies TEXT`
  );
  // Un solo blocco DO, sicuro con richieste concorrenti: il vecchio DROP+ADD
  // in due istruzioni falliva con "constraint already exists" quando una
  // pagina lanciava più richieste in parallelo (vedi vincoloCheck.ts).
  await eseguiDdlTenant(
    sql.raw(
      sqlVincoloCheckIdempotente(
        nomeSchema,
        'limiti_ricevibilita',
        'ente_25novies_valido',
        `ente_25novies IS NULL OR ente_25novies IN ('INPS','INAIL','AGENZIA_ENTRATE','AGENZIA_RISCOSSIONE','NON_PUBBLICO')`
      )
    )
  );

  // Riconoscimento automatico per gli spazi gia' esistenti: si valorizza solo
  // dove categoria o alias corrispondono in modo INEQUIVOCABILE. Dove il nome
  // e' ambiguo la colonna resta NULL e lo si dichiara a video — meglio non
  // sapere che sapere una cosa sbagliata.
  for (const [ente, pattern] of [
    ['INPS', '(^|[^a-z])inps([^a-z]|$)|previdenzial'],
    ['INAIL', '(^|[^a-z])inail([^a-z]|$)'],
    ['AGENZIA_RISCOSSIONE', 'riscossion|agente della riscossione|(^|[^a-z])aer([^a-z]|$)'],
    ['AGENZIA_ENTRATE', 'agenzia (delle )?entrate|erario|(^|[^a-z])iva([^a-z]|$)'],
  ] as const) {
    await eseguiDdlTenant(
      sql`UPDATE ${s}.limiti_ricevibilita
             SET ente_25novies = ${ente}
           WHERE ente_25novies IS NULL
             AND (lower(categoria_creditore) ~ ${pattern}
                  OR EXISTS (SELECT 1 FROM unnest(alias) a WHERE lower(a) ~ ${pattern}))`
    );
  }

  // Lessico controllato (0.109.82): le note PREDEFINITE scritte alla creazione
  // dello spazio contenevano un termine vietato. Si aggiornano solo se sono
  // ancora identiche al testo originale: una nota riscritta dall'ente non si
  // tocca. Il vecchio testo e' costruito a pezzi perche' il test sul lessico
  // sorveglia anche questo file.
  const RADICE_VIETATA = 'ricevibil';
  for (const [vecchia, nuova] of [
    [
      `Non considera ${RADICE_VIETATA}e una proposta sotto il 100%, in unica soluzione o a rate.`,
      'Parametro dell’ente: proposta non coerente sotto il 100%, in unica soluzione o a rate.',
    ],
    [
      `Soglia unica di ${RADICE_VIETATA}ità per questo ente.`,
      'Soglia unica di riscontro per questo ente.',
    ],
  ] as const) {
    await eseguiDdlTenant(
      sql`UPDATE ${s}.limiti_ricevibilita SET note = ${nuova} WHERE note = ${vecchia}`
    );
  }

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

  // Parametri del TRIAGE — un'unica riga (id=1).
  //
  // vera_obbligatorio: se il file della certificazione dei debiti è il presupposto del triage in
  // questo spazio. NULL = automatico, cioè segue l'ente (obbligatorio per
  // l'INPS, facoltativo per gli altri). La regola sta in
  // src/lib/triage/veraObbligatorio.ts: qui solo il valore scelto, così un
  // ente che non emette il prospetto non resta con il triage bloccato.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_triage (
      id INTEGER PRIMARY KEY DEFAULT 1,
      vera_obbligatorio BOOLEAN,
      CONSTRAINT una_sola_riga_triage CHECK (id = 1)
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

  // Titoli di credito dell'ente (0.109.96): la tabella giuridica su cui l'ente
  // fonda il recupero, un record per codice di partita. Il presupposto
  // giuridico e il riferimento interno (circolare) sono riscontrati sulle
  // fonti ufficiali al salvataggio; l'esito resta sulla riga.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.titoli_ente (
      id SERIAL PRIMARY KEY,
      codice TEXT NOT NULL UNIQUE,
      atto TEXT NOT NULL,
      presupposto_giuridico TEXT NOT NULL DEFAULT '',
      riferimento_interno TEXT,
      effetto_calcolo TEXT NOT NULL DEFAULT 'NESSUNO',
      note TEXT,
      riscontro_norma JSONB,
      riscontro_interno JSONB,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.titoli_ente_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      dominio_ente TEXT
    )`
  );
  // Materie (0.109.98): la chiave giuridica non e' il codice ma la MATERIA
  // (denunce Uniemens, note di rettifica, dilazioni, verbali, diffide...).
  // Ogni codice dell'anagrafica cade in una materia; presupposto giuridico e
  // riferimenti interni stanno sulla materia, proposti dall'AI sul sito
  // dell'ente e confermati da una persona.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.materie_ente (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      codici_indicativi TEXT,
      presupposto_giuridico TEXT,
      riferimenti_interni TEXT,
      proposta JSONB,
      stato TEXT NOT NULL DEFAULT 'DA_RICERCARE',
      confermata_da TEXT,
      confermata_il TIMESTAMP,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.titoli_ente ADD COLUMN IF NOT EXISTS materia_id INTEGER`
  );
  // Attività di recupero (0.133.0): la procedura che l'ente segue per
  // incassare il credito di quel codice, scritta una volta nei Parametri e
  // mostrata partita per partita nella fase successiva al triage. Testo
  // libero: le procedure degli enti non stanno in un elenco chiuso di passi.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.titoli_ente ADD COLUMN IF NOT EXISTS attivita_recupero TEXT`
  );
  // Dipendenza (0.133.5): l'ufficio a cui indirizzare la comunicazione con cui
  // si chiede all'azienda il pagamento del debito. Sta accanto alla procedura
  // perché la procedura senza il destinatario non si può eseguire.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.titoli_ente ADD COLUMN IF NOT EXISTS dipendenza TEXT`);
  // LA VESTIZIONE LEGALE (0.159.0): il titolo mette insieme la TS, la
  // direttrice (la colonna `dipendenza`) e il prodotto. Il codice di partita
  // resta la chiave; questi campi dicono su quale presupposto giuridico e con
  // quale lavorazione l'ente fonda la richiesta.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.titoli_ente ADD COLUMN IF NOT EXISTS tl_id INTEGER`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.titoli_ente ADD COLUMN IF NOT EXISTS prodotto TEXT`);
  // Lavorazioni della materia (0.138.0): la materia porta con sé la dipendenza
  // e la procedura con cui si lavora. Un processo ha spesso più lavorazioni
  // (verifica, diffida, contabilizzazione) che finiscono nello stesso esito:
  // una riga per lavorazione, e i titoli dell'ente le leggono da qui invece di
  // ripetere lo stesso testo su ogni codice.
  await assicuraTabellaMaterieLavorazione(nomeSchema);
  // Esito dell'ultima ricerca (0.109.99): anche «nulla trovato» e' un esito, e va detto.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.materie_ente ADD COLUMN IF NOT EXISTS esito_ricerca TEXT`
  );
  // Ricerca in differita (0.109.101): il lotto inviato al servizio a meta' prezzo.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.titoli_ente_config ADD COLUMN IF NOT EXISTS lotto_ricerca_id TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.titoli_ente_config ADD COLUMN IF NOT EXISTS lotto_ricerca_il TIMESTAMP`
  );
  // Piano di sviluppo (0.109.113): ipotesi per riga e per anno, per scenario
  // e per variante (base, prudente, favorevole). Sostituisce la simulazione
  // a leve. Le tabelle della vecchia simulazione restano, non piu' usate.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.piano_sviluppo (
      scenario_id INTEGER NOT NULL,
      variante TEXT NOT NULL DEFAULT 'base',
      orizzonte INTEGER NOT NULL DEFAULT 5,
      ipotesi JSONB NOT NULL DEFAULT '{}',
      note TEXT,
      salvato_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (scenario_id, variante)
    )`
  );
  // Ricevente (0.125): rettifiche delle manopole sul piano dell'azienda.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.piano_sviluppo ADD COLUMN IF NOT EXISTS rettifiche JSONB`
  );
  // Ricevente (0.129): piano di rientro scelto con le domande, variante di
  // sistema accesa o no, soluzione verde trovata dal motore.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.piano_sviluppo ADD COLUMN IF NOT EXISTS piano_rientro JSONB`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.piano_sviluppo ADD COLUMN IF NOT EXISTS serie_sistema BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.piano_sviluppo ADD COLUMN IF NOT EXISTS soluzione JSONB`
  );
  // Vecchia simulazione a levette (sostituita dal Piano di sviluppo nella
  // 0.109.113 e tolta dal codice nella 0.109.118, su indicazione di Ercole:
  // «la simulazione attuale la puoi cestinare»). Le sue tabelle si
  // eliminano: nessuna parte dell'applicativo le legge più.
  await eseguiDdlTenant(sql`DROP TABLE IF EXISTS ${s}.simulazione_scenario`);
  await eseguiDdlTenant(sql`DROP TABLE IF EXISTS ${s}.simulazione_redigente`);
  // Piano dell'azienda (0.109.116): il piano depositato dall'azienda,
  // normalizzato sulle righe d'ipotesi del nostro piano (valori in euro per
  // anno solare), da confrontare con il piano automatico di settore.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.piano_aziendale (
      scenario_id INTEGER PRIMARY KEY,
      valori JSONB NOT NULL,
      origine TEXT NOT NULL,
      nome_file TEXT,
      documento_id INTEGER,
      note TEXT,
      salvato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Abbinamento voci del file → righe del piano, memorizzato per azienda.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.tracciati_piano_aziendale (
      azienda_id INTEGER PRIMARY KEY,
      abbinamento JSONB NOT NULL DEFAULT '{}'::jsonb,
      unita INTEGER NOT NULL DEFAULT 1,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Soglie dei semafori del confronto (verde / giallo, in %). NULL = predefinite 10 / 25.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_confronto_piano (
      id INTEGER PRIMARY KEY DEFAULT 1,
      soglia_verde NUMERIC,
      soglia_gialla NUMERIC,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Parametri di stampa (0.109.111): margini, intestazione, pie' di pagina,
  // logo dell'ente (immagine come data URL, al massimo ~300 KB).
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_stampa (
      id INTEGER PRIMARY KEY DEFAULT 1,
      margini JSONB,
      intestazione TEXT,
      pie_pagina TEXT,
      logo_data_url TEXT,
      logo_nome TEXT,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Parametri dell'Indice di Attenzione Istruttoria (0.109.104): pesi delle
  // dimensioni e minimi dei vincoli, dell'ente. NULL = valori predefiniti.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_iai (
      id INTEGER PRIMARY KEY DEFAULT 1,
      parametri JSONB,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
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
  // Lista di controllo della valutazione (0.109.114): le dichiarazioni
  // dell'istruttore («asseverazione non pervenuta», «piano non pervenuto»,
  // «posizione aggiornata non pervenuta») restano sullo scenario, così la
  // lista non va ricompilata a ogni accesso.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS dichiarazioni JSONB NOT NULL DEFAULT '{}'::jsonb`
  );
  // Percorso in quattro tempi (0.120): i documenti caricati restano
  // disponibili fra la PRIMA LETTURA (strumento, data, quota degli
  // aderenti, letti dai documenti) e la VALUTAZIONE, che parte solo dopo
  // che l'istruttore ha confermato l'inquadramento. Eliminati a valutazione
  // riuscita, come sempre.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS documenti_caricati JSONB`
  );
  // Nome e tipo dei documenti su cui si è fatta la valutazione: i file si
  // eliminano, l'elenco resta da mostrare nella fase 1.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS documenti_esaminati JSONB`
  );
  // Base dell'art. 63 (0.121): capitale al netto di sanzioni, interessi e
  // somme aggiuntive, e percentuale offerta su quella base.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS importo_capitale_estratto NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS percentuale_capitale_estratta NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS prima_lettura JSONB`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS prima_lettura_il TIMESTAMP`
  );
  // Valori della situazione contabile ricevuta, letti al caricamento e da
  // confermare come Posizione Aggiornata (0.122).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS posizione_letta JSONB`
  );
  // Scelte fatte appena prima di «Avvia la valutazione»: quale piano entra
  // nel giudizio, se includere il piano aziendale e se citare il confronto.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.simulazione_ricevente ADD COLUMN IF NOT EXISTS opzioni_piano JSONB`
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
  // Fatti della visura (0.109.89): estratti una volta, salvati, passati
  // all'AI come dati; con l'impronta della visura da cui vengono.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.azienda_screening ADD COLUMN IF NOT EXISTS visura_fatti JSONB`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.azienda_screening ADD COLUMN IF NOT EXISTS visura_impronta TEXT`
  );
  // Origine della generazione (0.118): AUTOMATICA = lanciata al primo
  // salvataggio dei parametri dell'ente; MANUALE = dal pulsante.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.azienda_screening ADD COLUMN IF NOT EXISTS origine TEXT`
  );
  // Storico delle generazioni (0.109.90): la riga corrente si sovrascrive,
  // ma ogni generazione resta qui con versione della piattaforma e impronta
  // della visura.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.azienda_screening_storico (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      generato_il TIMESTAMP NOT NULL DEFAULT now(),
      relazione_testo TEXT,
      sezioni JSONB,
      nome_file_visura TEXT,
      visura_impronta TEXT,
      visura_fatti JSONB,
      app_version TEXT
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_screening_storico_azienda ON ${s}.azienda_screening_storico (azienda_id)`
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
  // Fascicolo di evidenza (0.109.93): il file XBRL da cui viene il bilancio.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.xbrl_storico_azienda ADD COLUMN IF NOT EXISTS documento_id INTEGER`
  );
  // Note integrative (Piano-ponte): i fact testuali non sono numeri e non
  // entrano nei totali, ma sono la fonte per criteri di valutazione, eventi
  // successivi, continuita aziendale e impegni. Si conservano con l'impronta
  // del file da cui sono state lette.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.xbrl_storico_azienda ADD COLUMN IF NOT EXISTS note_fatti JSONB`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.xbrl_storico_azienda ADD COLUMN IF NOT EXISTS note_impronta TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.xbrl_storico_azienda ADD COLUMN IF NOT EXISTS note_estratte_il TIMESTAMP`
  );
}

/**
 * Piano-ponte: proiezione a livello azienda dalla chiusura dell'ultimo
 * bilancio alla Data verifica. Non e' un piano di sviluppo: non appartiene a
 * uno scenario e non contiene proposte ai creditori. La versione confermata
 * e' immutabile: una nuova elaborazione crea una versione nuova e supera la
 * precedente, senza sovrascriverla.
 */
export async function assicuraTabellaPonteTemporale(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.ponte_temporale (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      data_riferimento DATE NOT NULL,
      stato TEXT NOT NULL DEFAULT 'BOZZA',
      versione INTEGER NOT NULL DEFAULT 1,
      sostituisce_id INTEGER REFERENCES ${s}.ponte_temporale(id) ON DELETE SET NULL,
      hash_input TEXT NOT NULL,
      hash_output TEXT,
      input JSONB NOT NULL,
      output JSONB,
      assunzioni JSONB NOT NULL DEFAULT '[]',
      copertura JSONB,
      avvisi JSONB NOT NULL DEFAULT '[]',
      limiti JSONB NOT NULL DEFAULT '[]',
      motore_versione TEXT NOT NULL,
      prompt_versione TEXT,
      note_copertura INTEGER,
      generato_da TEXT,
      confermato_da TEXT,
      confermato_il TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Una sola versione CONFERMATO per azienda e data: le altre restano nello
  // storico come SUPERATO. L'indice parziale e' la garanzia, non la buona
  // volonta' dell'azione che conferma.
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ponte_confermato
        ON ${s}.ponte_temporale (azienda_id, data_riferimento)
        WHERE stato = 'CONFERMATO'`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_ponte_azienda_data
        ON ${s}.ponte_temporale (azienda_id, data_riferimento DESC, versione DESC)`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.ponte_temporale_eventi (
      id SERIAL PRIMARY KEY,
      ponte_id INTEGER NOT NULL REFERENCES ${s}.ponte_temporale(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      dettaglio JSONB,
      utente TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_ponte_eventi_ponte
        ON ${s}.ponte_temporale_eventi (ponte_id, created_at)`
  );
}

/**
 * Crea proposta_creditori in uno schema tenant, se non esiste gia. Stesso
 * principio di auto-riparazione delle altre tabelle.
 */
export async function assicuraTabellaProposta(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaDocumentiOrigine(nomeSchema);
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

  // Adesione della riga all'accordo (0.109.81): serve a calcolare la quota
  // degli altri creditori aderenti sull'indebitamento complessivo (art. 63).
  // NULL = non indicata: il calcolo si ferma, non presume. importo_aderente
  // vale solo per ADERENTE (NULL = l'intera riga): una riga e' una categoria
  // e puo' aderire solo in parte.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ADD COLUMN IF NOT EXISTS adesione TEXT`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ADD COLUMN IF NOT EXISTS importo_aderente NUMERIC`
  );
  // Fascicolo di evidenza (0.109.92): l'Excel da cui la riga e' stata importata.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.proposta_creditori ADD COLUMN IF NOT EXISTS documento_id INTEGER`
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
/**
 * Documenti di origine (fascicolo di evidenza, 0.109.88): un record per ogni
 * file da cui sono state importate righe, con l'impronta SHA-256 calcolata
 * nel browser. Il file NON viene conservato: solo nome, dimensione e
 * impronta. Stessa impronta = stesso documento, anche se ricaricato.
 */
export async function assicuraTabellaDocumentiOrigine(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.documenti_origine (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      nome_file TEXT NOT NULL,
      dimensione INTEGER NOT NULL,
      impronta TEXT NOT NULL,
      caricato_il TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (azienda_id, impronta)
    )`
  );
}

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
  // La migrazione scenario -> azienda si esegue UNA SOLA VOLTA. La presenza
  // di `scenario_id` non e' piu' un segnale valido: dalla 0.109.58 la colonna
  // c'e' di nuovo, perche' la Situazione Debitoria e' tornata nello scenario.
  //
  // Senza questa guardia, rimettere `scenario_id` faceva ripartire la vecchia
  // migrazione su database gia' migrati: tentava di rinominare `debiti_ente`
  // in una tabella legacy che esiste gia', e l'errore
  //   relation "debiti_ente_per_scenario_legacy" already exists
  // faceva fallire OGNI operazione che passa di qui — fra cui il calcolo
  // dell'indicatore di attenzione, che restava "non calcolabile" senza dire
  // perche'.
  //
  // Se la tabella legacy esiste, la migrazione e' gia' avvenuta: non si tocca
  // nulla. E' il caso di ogni database in esercizio.
  const legacyGiaPresente =
    (
      await db.execute(
        sql`SELECT 1 FROM information_schema.tables
            WHERE table_schema = ${nomeSchema} AND table_name = 'debiti_ente_per_scenario_legacy'`
      )
    ).length > 0;

  if (deveRinominareInLegacy(vecchiaHaScenarioId, legacyGiaPresente)) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.debiti_ente RENAME TO debiti_ente_per_scenario_legacy`
    );
  }

  await assicuraTabellaDocumentiOrigine(nomeSchema);
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
  // Fascicolo di evidenza (0.109.88): documento di origine della riga.
  // NULL per le righe inserite a mano o importate prima di questa versione:
  // il fascicolo le mostra come «provenienza non registrata».
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS documento_id INTEGER`
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
  // Tracciato d'origine della riga (catalogo tracciati). NULL per le righe
  // caricate col vecchio percorso architrave — restano intatte. Permette la
  // sostituzione PER-TRACCIATO: ricaricare l'nrc non tocca le righe del
  // DettaglioRichiesta della stessa azienda.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS tracciato_id INTEGER`
  );
  // Codice-guida grezzo da cui è stata derivata la categoria (solo per le
  // righe importate da un tracciato a colonna-guida). Serve a RI-APPLICARE
  // una correzione della mappatura codice→categoria anche ai dati già
  // importati, senza dover ricaricare il file: UPDATE tipo WHERE codice_guida = X.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS codice_guida TEXT`
  );

  // ---- SCENARIO_ID: la Situazione Debitoria torna nello scenario --------
  //
  // Attenzione a chi legge: questo file contiene, poco sopra, la migrazione
  // OPPOSTA — da scenario ad azienda — con la motivazione "il debito che
  // l'ente dichiara non cambia da uno scenario all'altro". Non è
  // un'oscillazione: è cambiata la tesi.
  //
  // Allora l'argomento era la STABILITÀ del dato. Oggi l'argomento è la sua
  // FUNZIONE: la fotografia stabile dell'esposizione è la Posizione
  // certificazione dei debiti — documento ufficiale dell'istituto, che comprende le partite
  // in lavorazione e le sanzioni — mentre il CONTABILIZZATO è la base su cui
  // si fanno i conti quando arriva una proposta specifica, a una data
  // specifica. È legato a un evento, quindi appartiene allo scenario.
  //
  // NON si crea una tabella nuova: si aggiunge una colonna. Creare una terza
  // tabella lascerebbe in giro `debiti_ente_per_scenario_legacy`,
  // `debiti_ente` e la nuova, con dati in tutte e tre e nessuna certezza su
  // quale valga per una data azienda. E un eventuale ripensamento futuro ne
  // produrrebbe una quarta.
  //
  // Le righe esistenti restano con scenario_id NULL e continuano a essere
  // leggibili: sono la "posizione caricata a livello azienda", che ogni
  // scenario può riprendere con una copia esplicita. Nulla viene distrutto.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_ente ADD COLUMN IF NOT EXISTS scenario_id INTEGER
        REFERENCES ${s}.scenari(id) ON DELETE CASCADE`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_debiti_ente_scenario ON ${s}.debiti_ente (scenario_id)`
  );

  // ---- POSIZIONI DEBITORIE DEL TRIAGE ----------------------------------
  //
  // Generiche per costruzione: righe con categoria e tre anni, senza alcuna
  // presunzione sull'ente. I tracciati INPS compilano QUESTE righe più in
  // fretta, non una struttura propria — altrimenti ogni ente nuovo avrebbe
  // richiesto una variante.
  //
  // `riferimento_anno_precedente` è il termine di paragone che la soglia di
  // quella categoria richiede: i contributi dovuti per il previdenziale, il
  // volume d'affari per il fiscale. Nullo dove la soglia è assoluta.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_triage (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      descrizione TEXT NOT NULL,
      categoria TEXT NOT NULL,
      importo_anno_corrente NUMERIC,
      importo_anno_precedente NUMERIC,
      importo_anno_meno2 NUMERIC,
      riferimento_anno_precedente NUMERIC,
      prospetto_id INTEGER,
      creato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_debiti_triage_azienda ON ${s}.debiti_triage (azienda_id)`
  );

  // Prospetti caricati: la mappatura delle colonne vive qui, e viene
  // sostituita quando la struttura del file cambia. Le righe portano il
  // `prospetto_id`, così due insiemi costruiti con mappature diverse
  // restano distinguibili invece di mescolarsi in silenzio.
  // ---- STRUTTURE DEI PROSPETTI, PER ENTE -------------------------------
  //
  // La mappatura delle colonne si riconosce dalla FIRMA delle intestazioni,
  // ma la firma da sola non basta: nello spazio di un soggetto non pubblico
  // arrivano prospetti di tutti e quattro gli enti, e due tracciati diversi
  // possono avere intestazioni simili. Senza l'ente nella chiave, un estratto
  // INAIL erediterebbe la mappatura di un tracciato INPS — il "mischione" che
  // non serve a nessuno.
  //
  // Chiave: ente + firma. Cosi' ogni ente accumula il proprio repertorio di
  // strutture, e il riconoscimento resta dentro il suo perimetro.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.strutture_prospetto (
      id SERIAL PRIMARY KEY,
      ente TEXT NOT NULL,
      firma TEXT NOT NULL,
      nome_riconosciuto TEXT,
      mappatura JSONB NOT NULL,
      volte_usata INTEGER NOT NULL DEFAULT 0,
      creata_il TIMESTAMP NOT NULL DEFAULT now(),
      ultima_volta TIMESTAMP,
      CONSTRAINT uq_struttura_ente_firma UNIQUE (ente, firma)
    )`
  );

  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.prospetti_triage (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      nome_file TEXT NOT NULL,
      ente TEXT,
      mappatura JSONB,
      righe_importate INTEGER NOT NULL DEFAULT 0,
      caricato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
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
  // Stesso blocco DO sicuro con richieste concorrenti (vedi vincoloCheck.ts).
  await eseguiDdlTenant(
    sql.raw(
      sqlVincoloCheckIdempotente(
        nomeSchema,
        'anagrafica_ente_config',
        'campo_valido',
        'campo BETWEEN 1 AND 10'
      )
    )
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
 * Categorie tipo debito PARAMETRICHE di spazio (Debito / AVA / Neutro di
 * default). Sostituiscono l'insieme fisso CLE/CEN/CEC/CEA come CHOICE per i
 * nuovi caricamenti; i vecchi codici restano risolvibili via fallback statico
 * (vedi lib/debitiEnte/tipoDebito), quindi i dati già inseriti non si toccano.
 * Idempotente; seed solo se la tabella è vuota (mai sovrascrive scelte fatte).
 */
export async function assicuraTabellaCategorieTipoDebito(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.categorie_tipo_debito (
      codice TEXT PRIMARY KEY,
      etichetta TEXT NOT NULL,
      descrizione TEXT,
      ordine INTEGER NOT NULL DEFAULT 0,
      attivo BOOLEAN NOT NULL DEFAULT TRUE
    )`
  );
  // "contribuisce al totale": una categoria neutra (es. Neutro) NON alimenta i
  // totali né i delta del confronto. Difensivo: se la colonna non c'era, la
  // aggiungo e imposto Neutro a FALSE una tantum (senza sovrascrivere scelte
  // future, perché lo faccio solo alla prima creazione della colonna).
  const haContribuisce = await db.execute(
    sql`SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${nomeSchema} AND table_name = 'categorie_tipo_debito' AND column_name = 'contribuisce'`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.categorie_tipo_debito ADD COLUMN IF NOT EXISTS contribuisce BOOLEAN NOT NULL DEFAULT TRUE`
  );
  if (haContribuisce.length === 0) {
    await eseguiDdlTenant(
      sql`UPDATE ${s}.categorie_tipo_debito SET contribuisce = FALSE WHERE codice = 'NEUTRO'`
    );
  }

  const conteggio = await db.execute(
    sql`SELECT count(*)::int AS n FROM ${s}.categorie_tipo_debito`
  );
  const n = (conteggio[0] as { n: number } | undefined)?.n ?? 0;
  if (n === 0) {
    // ON CONFLICT: due richieste parallele possono vedere entrambe la tabella
    // vuota e seminare insieme; senza, la seconda falliva con
    // "duplicate key … categorie_tipo_debito_pkey".
    await eseguiDdlTenant(
      sql`INSERT INTO ${s}.categorie_tipo_debito (codice, etichetta, descrizione, ordine, attivo, contribuisce) VALUES
        ('DEBITO', 'Debito', 'Debito certo da contabilizzare', 1, TRUE, TRUE),
        ('AVA', 'AVA', 'Affidato all''Agente della Riscossione', 2, TRUE, TRUE),
        ('NEUTRO', 'Neutro', 'Voce neutra ai fini del confronto', 3, TRUE, FALSE)
        ON CONFLICT (codice) DO NOTHING`
    );
  }
}

/**
 * Catalogo dei TRACCIATI della Posizione Debitoria (un formato di file =
 * un tracciato). Sostituisce l'architrave unico per spazio: più tracciati
 * coesistono (nrc, DettaglioRichiesta, futuri), riconosciuti per firma.
 * Il vecchio debiti_ente_architrave NON viene toccato.
 */
export async function assicuraTabellaTracciatiDebitiEnte(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_ente_tracciati (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      foglio TEXT NOT NULL,
      intestazioni JSONB NOT NULL,
      ruoli JSONB NOT NULL,
      classificazione_modo TEXT NOT NULL,
      tipo_fisso TEXT,
      mappatura_codici JSONB NOT NULL DEFAULT '{}'::jsonb,
      codici_noti JSONB NOT NULL DEFAULT '[]'::jsonb,
      firma TEXT NOT NULL,
      nome_file_origine TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Certificazione dei debiti — il file INPS "DettaglioRichiesta" letto su TUTTE le
 * sezioni, ognuna con la natura data dal titolo di sezione. Due tabelle:
 *  - vera_titoli: mappa (per spazio) titolo-di-sezione normalizzato → categoria;
 *  - debiti_vera: righe importate (per azienda), usate per il confronto
 *    certo-per-certo con la Situazione Debitoria contabilizzata.
 */
export async function assicuraTabelleVera(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaDocumentiOrigine(nomeSchema);
  await assicuraTabellaAziende(nomeSchema); // FK aziende
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.vera_titoli (
      titolo_norm TEXT PRIMARY KEY,
      titolo TEXT NOT NULL,
      categoria TEXT NOT NULL
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_vera (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      sezione TEXT NOT NULL,
      voce TEXT NOT NULL,
      importo NUMERIC NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // Dicitura della colonna "Stato": vuota = contabilizzato, valorizzata = non
  // ancora contabilizzato (da lavorare per renderlo esigibile).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT ''`
  );
  // Trattamento derivato dalla CATENA Natura+Stato: contabilizzato /
  // da_contabilizzare / potenziale (importo ignoto) / sospeso (provvedimento
  // giudiziario) / ignora.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS trattamento TEXT NOT NULL DEFAULT 'contabilizzato'`
  );
  // PERIODO DI COMPETENZA («202506 - 202506»). Fino a qui viveva solo nel file
  // appena letto, quindi nella sessione del browser: riaperta la verifica, la
  // colonna «Periodo» dei documenti per i reparti tornava vuota pur avendo il
  // dato in mano. Vuoto quando la sezione non lo porta (cartelle dell'Agente
  // della Riscossione).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS periodo TEXT NOT NULL DEFAULT ''`
  );
  // Chiave della combinazione Natura+Stato di questa riga (per ri-applicare le
  // correzioni del trattamento senza ricaricare il file).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS combinazione TEXT NOT NULL DEFAULT ''`
  );
  // SCELTA DELL'OPERATORE sulla doppia scrittura del file («F24 non presentato»
  // e «Denunce non trasmesse» dello stesso periodo e importo): '' = vale il
  // riconoscimento automatico, 'CONFERMATO' = è lo stesso debito, 'NEGATO' =
  // sono due debiti distinti e le due cifre restano distinte. Sta sulla riga
  // denunce, insieme alla posizione: la verifica riaperta rifà i conti con la
  // scelta già presa. Un nuovo import della certificazione dei debiti ricostruisce le righe e
  // riparte dall'automatico.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS duplicato_stato TEXT NOT NULL DEFAULT ''`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS documento_id INTEGER`
  );
  // AMBITO della riga: contributi INPS oppure crediti già affidati all'Agente
  // della Riscossione. Alimentano due lettere diverse dell'art. 25-novies e
  // non vanno sommati (vedi `TotaliVera` in debitiEnte/veraImport.ts).
  //
  // La colonna è nuova: le righe importate prima non la portano, e il DEFAULT
  // 'INPS' metterebbe le cartelle nella base della lettera a). Al primo
  // passaggio l'ambito si ricava dal titolo di sezione, con lo stesso
  // criterio del parser; il riparto contributi/sanzioni invece non è
  // ricostruibile senza il file, e resta NULL (si usa l'importo intero) fino
  // al ricaricamento.
  const ambitoPresente = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = ${nomeSchema}
       AND table_name = 'debiti_vera'
       AND column_name = 'ambito'`);
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS ambito TEXT NOT NULL DEFAULT 'INPS'`
  );
  if (ambitoPresente.length === 0) {
    await eseguiDdlTenant(sql`
      UPDATE ${s}.debiti_vera
         SET ambito = 'AGENTE_RISCOSSIONE'
       WHERE ambito <> 'AGENTE_RISCOSSIONE'
         AND (sezione ILIKE '%agente della riscossione%'
           OR sezione ILIKE '%crediti affidati%'
           OR sezione ILIKE '%crediti presso adr%'
           OR sezione ~* '^adr($|[^[:alpha:]])'
           OR voce ~* '^adr($|[^[:alpha:]])')`);
  }
  // Riparto della riga: le sanzioni sono presunte e restano fuori dal test di
  // soglia, quindi l'importo da solo non basta più. NULL = il file non lo
  // espone (righe salvate prima di questa colonna comprese).
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS contributi NUMERIC`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.debiti_vera ADD COLUMN IF NOT EXISTS sanzioni NUMERIC`
  );
  // Mappatura (per spazio) della combinazione Natura+Stato → trattamento.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.vera_trattamenti (
      chiave TEXT PRIMARY KEY,
      natura TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT '',
      trattamento TEXT NOT NULL
    )`
  );
  // LA MATERIA SCELTA SULLA SINGOLA VOCE.
  //
  // La mappatura di sezione è un ripiego: quando le voci si riconducono già da
  // sole alla loro materia, la scelta salvata sulla sezione non sposta niente, e
  // il report lo dichiara. Ma la destinazione sbagliata resta, e per correggerla
  // non c'è modo: la deduzione automatica legge la voce, e la voce non si tocca
  // dall'applicazione. Qui l'operatore dice, una volta per voce, quale materia
  // le compete: la scelta vale per lo spazio (non per la singola azienda) e
  // batte ogni deduzione automatica, perché è una decisione e non un'ipotesi.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.vera_voci (
      sezione_norm TEXT NOT NULL,
      voce_norm TEXT NOT NULL,
      sezione TEXT NOT NULL,
      voce TEXT NOT NULL,
      materia_id INTEGER NOT NULL,
      aggiornata_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (sezione_norm, voce_norm)
    )`
  );
  // LE SOSPENSIONI GIÀ SALVATE.
  //
  // La classificazione della certificazione dei debiti metteva le posizioni con stato «Sospeso»
  // nel trattamento «Ignora»: fuori dai totali, ma anche fuori da ogni ufficio
  // — invisibili a chi dovrà riprenderle quando il ricorso si chiude. Ora
  // l'automatico le riconosce da sole («sospeso»); le righe già salvate però
  // non si riscrivono da sole, e chiedere allo spazio di correggerle a mano
  // una per una significherebbe lasciarle invisibili finché qualcuno se ne
  // ricorda. Qui si riallineano da sé, quando lo spazio rilegge il suo
  // certificazione dei debiti: solo dove il trattamento è ancora «Ignora» — una scelta diversa
  // fatta a mano resta com'è — e solo per le posizioni sospese.
  //
  // È idempotente: dopo il primo passaggio non c'è più nessuna riga da
  // spostare, e la seconda volta non cambia nulla.
  if (!giaGarantita(nomeSchema, 'vera_sospensioni')) {
    await eseguiDdlTenant(sql`
      UPDATE ${s}.debiti_vera
         SET trattamento = 'sospeso'
       WHERE trattamento = 'ignora'
         AND (stato ILIKE '%sospes%'
           OR combinazione IN (
             SELECT chiave FROM ${s}.vera_trattamenti WHERE stato ILIKE '%sospes%'
           ))`);
    await eseguiDdlTenant(sql`
      UPDATE ${s}.vera_trattamenti
         SET trattamento = 'sospeso'
       WHERE trattamento = 'ignora'
         AND stato ILIKE '%sospes%'`);
    segnaGarantita(nomeSchema, 'vera_sospensioni');
  }
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_debiti_vera_azienda ON ${s}.debiti_vera (azienda_id)`
  );
}

/**
 * LAVORAZIONI per tipologia di debito — configurazione di spazio.
 *
 * Per ogni categoria di debito (le stesse `categorie_tipo_debito` con cui si
 * classificano le posizioni) dice che cosa va fatto e a chi va chiesto. Non è
 * una tabella di dati dell'azienda: è il ponte fra il file della certificazione dei debiti e le
 * comunicazioni che l'operatore deve inviare ai colleghi.
 *
 * Idempotente. L'indice univoco evita che lo stesso binomio categoria +
 * lavorazione venga configurato due volte (e quindi che la stessa posizione
 * produca due richieste identiche).
 */
export async function assicuraTabellaLavorazioniTipoDebito(nomeSchema: string): Promise<void> {
  if (giaGarantita(nomeSchema, 'lavorazioni_tipo_debito')) return;
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.lavorazioni_tipo_debito (
      id SERIAL PRIMARY KEY,
      categoria TEXT NOT NULL,
      lavorazione TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      ordine INTEGER NOT NULL DEFAULT 0
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_lavorazioni_tipo_debito_unica
        ON ${s}.lavorazioni_tipo_debito (categoria, lavorazione)`
  );
  segnaGarantita(nomeSchema, 'lavorazioni_tipo_debito');
}

/**
 * Lavorazioni della materia: la dipendenza (l'ufficio che lavora) e la procedura
 * (i passi) scritte una volta sulla MATERIA invece che su ogni codice.
 *
 * Perché una tabella nuova e non le direttrici dello screening: le direttrici
 * sono il questionario, qui si configura l'esecuzione; tenerle separate
 * significa che aggiungere un campo di qualificazione alla lavorazione non
 * tocca né il questionario né i titoli. La materia è la chiave: ogni codice
 * dell'anagrafica cade in una materia e ne eredita la lavorazione.
 *
 * Nessuna chiave esterna, come per `titoli_ente.materia_id`: la cancellazione
 * della materia toglie le sue lavorazioni nell'azione che la elimina, così un
 * ripristino della configurazione non dipende dall'ordine delle tabelle.
 *
 * Idempotente: ogni spazio già attivo la riceve al primo salvataggio.
 */
export async function assicuraTabellaMaterieLavorazione(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.materie_lavorazione (
      id SERIAL PRIMARY KEY,
      materia_id INTEGER NOT NULL,
      tipologia TEXT NOT NULL DEFAULT '',
      dipendenza TEXT,
      procedura TEXT,
      esito TEXT,
      ordine INTEGER NOT NULL DEFAULT 0,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // IL PERIMETRO DELLA TS (0.153.0). Non tutte le lavorazioni dicono la
  // stessa cosa dell'azienda: alcune sono il presidio che l'ente attiva quando
  // la condotta è elusiva. Il contrassegno dice quali entrano nella check
  // obbligatoria del triage, e il verso dice da che parte stanno. Due colonne
  // e non una tabella: la qualificazione è della lavorazione, non un elenco a
  // parte da tenere allineato.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.materie_lavorazione
        ADD COLUMN IF NOT EXISTS rilevante_perimetro BOOLEAN NOT NULL DEFAULT false`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.materie_lavorazione
        ADD COLUMN IF NOT EXISTS verso_perimetro TEXT`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_materie_lavorazione_materia
        ON ${s}.materie_lavorazione (materia_id, ordine)`
  );
}

/**
 * CATALOGO DELLE TS NEI PRODOTTI (0.157.0).
 *
 * La TS — la tipologia di lavorazione — non appartiene più alla materia: sta
 * sotto una direttrice e un prodotto, cioè dove il lavoro si organizza. La
 * materia la EREDITA, associandola ai propri codici: \`materia_tl\` è quella
 * associazione, e i titoli di credito restano il punto in cui il codice dichiara
 * la sua materia (e, se vuole, un ufficio proprio).
 *
 * PERCHÉ DUE TABELLE E NON UNA. La stessa TS può coprire più materie — è il
 * caso normale di un prodotto lavorato su partite diverse — e l'ordine con cui
 * la materia la esegue è suo, non del catalogo. Tenerli separati evita di
 * duplicare la TS (e di doverla correggere due volte).
 *
 * MIGRAZIONE DELLE CONFIGURAZIONI ESISTENTI. Le TS scritte finora in
 * \`materie_lavorazione\` sono già lavoro fatto: si copiano una volta sola nel
 * catalogo, conservando l'id (le risposte della check di perimetro lo
 * referenziano) e come prodotto si usa la tipologia stessa, che è l'unico nome
 * concreto disponibile. Nessuna riga si perde, e la vecchia tabella resta come
 * storico: non viene più letta né scritta.
 *
 * Idempotente: ogni spazio già attivo la riceve alla prima lettura della
 * configurazione, e la copia avviene solo se il catalogo è ancora vuoto.
 */
export async function assicuraTabelleTl(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaMaterieLavorazione(nomeSchema);
  await assicuraTabelleProdotti(nomeSchema);

  // IL CATALOGO PIATTO DELLE TS (0.159.0). Codice, descrizione, contrassegno
  // per la check list: nient'altro. L'ufficio, i passi e l'esito sono il
  // processo con cui una materia la applica a una direttrice e a un prodotto, e
  // stanno in `materia_tl`: la stessa TS non va riscritta per ogni prodotto.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.tl (
      id SERIAL PRIMARY KEY,
      codice TEXT NOT NULL DEFAULT '',
      descrizione TEXT NOT NULL DEFAULT '',
      check_list BOOLEAN NOT NULL DEFAULT false,
      verso_check_list TEXT,
      ordine INTEGER NOT NULL DEFAULT 0,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // IL CODICE È UNICO DENTRO IL PRODOTTO, NON NELLO SPAZIO (0.167.0). La
  // numerazione delle TS riparte per prodotto: la 81 di «Diffida M400» e la 81
  // di «Diffida sgravi contributivi» sono due lavorazioni, e l'indice unico sul
  // solo codice le rifiutava. Il vincolo vero — stesso codice sullo stesso
  // prodotto — lo controlla il salvataggio, perché le associazioni sono un
  // elenco jsonb; qui resta l'indice semplice, e più sotto l'unico parziale per
  // le TS senza prodotto.
  await eseguiDdlTenant(sql`DROP INDEX IF EXISTS ${s}.idx_tl_codice`);
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_tl_codice ON ${s}.tl (lower(btrim(codice)))`
  );
  // LA TS SA A QUALE PRODOTTO APPARTIENE (0.161.0). Il codice identificativo
  // si associa al prodotto e alla sua direttrice; più TS possono stare sullo
  // stesso prodotto. Colonna e tabella restano quelle di prima: cambia solo
  // che la coppia si scrive anche qui, non solo nell'associazione della
  // materia.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.tl ADD COLUMN IF NOT EXISTS direttrice TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.tl ADD COLUMN IF NOT EXISTS prodotto TEXT`);
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_tl_prodotto ON ${s}.tl (direttrice, prodotto)`
  );
  // UNA TS, PIÙ PRODOTTI (0.166.0). L'associazione è tanti a tanti: la stessa
  // lavorazione serve più prodotti, e con una colonna sola la seconda non si
  // poteva scrivere — il codice risultava già usato e la TS andava duplicata.
  // Le associazioni stanno in un elenco jsonb; `direttrice` e `prodotto`
  // restano e portano la prima, perché il processo operativo continua a
  // leggerle per dire su quale prodotto la TS è nata.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.tl ADD COLUMN IF NOT EXISTS prodotti JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  // Gli spazi già configurati hanno la coppia singola: diventa la prima
  // associazione. Si fa solo dove l'elenco è ancora vuoto, così riavviare non
  // riscrive le scelte fatte dopo.
  await eseguiDdlTenant(
    sql`UPDATE ${s}.tl
           SET prodotti = jsonb_build_array(
                 jsonb_build_object(
                   'direttrice', COALESCE(direttrice, ''),
                   'prodotto', btrim(prodotto)
                 )
               )
         WHERE jsonb_array_length(prodotti) = 0
           AND prodotto IS NOT NULL AND btrim(prodotto) <> ''`
  );
  // Senza prodotto non c'è un posto in cui distinguersi: una sola TS per codice.
  await eseguiDdlTenant(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tl_codice_senza_prodotto
        ON ${s}.tl (lower(btrim(codice)))
        WHERE jsonb_array_length(prodotti) = 0`
  );

  // L'ASSOCIAZIONE: la materia mutua la coppia direttrice/prodotto e porta il
  // processo (ufficio, passi, esito, ordine). La chiave resta (materia, TS):
  // una materia applica una TS una volta sola, su un prodotto.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.materia_tl (
      id SERIAL,
      materia_id INTEGER NOT NULL,
      tl_id INTEGER NOT NULL,
      ordine INTEGER NOT NULL DEFAULT 0,
      direttrice TEXT NOT NULL DEFAULT '',
      prodotto TEXT NOT NULL DEFAULT '',
      dipendenza TEXT,
      procedura TEXT,
      esito TEXT,
      PRIMARY KEY (materia_id, tl_id)
    )`
  );
  // L'id dell'associazione serve ai comandi in blocco (riallineamento di un
  // ufficio): la coppia (materia, TS) resta la chiave logica.
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS id SERIAL`);
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS direttrice TEXT NOT NULL DEFAULT ''`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS prodotto TEXT NOT NULL DEFAULT ''`
  );
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS dipendenza TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS procedura TEXT`);
  await eseguiDdlTenant(sql`ALTER TABLE ${s}.materia_tl ADD COLUMN IF NOT EXISTS esito TEXT`);
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_materia_tl_prodotto
        ON ${s}.materia_tl (direttrice, prodotto, ordine)`
  );

  // Il collegamento alle categorie di debito deve esistere prima della
  // rimappatura: in uno spazio fermo alla 0.157.0 la tabella non c'è ancora e
  // la migrazione la nominerebbe. Crearla qui è idempotente.
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.categoria_tl (
      categoria TEXT NOT NULL,
      tl_id INTEGER NOT NULL,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      ordine INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (categoria, tl_id)
    )`
  );

  // LA COPIA DAL VECCHIO MODELLO, UNA VOLTA SOLA.
  //
  // Fino alla 0.158.0 la TS stava dentro il prodotto (`prodotti_tl`): la stessa
  // lavorazione era ripetuta per ogni prodotto che la usava. Qui se ne fa una
  // sola per codice, e le associazioni delle materie conservano direttrice,
  // prodotto e processo. Gli id nuovi si rimappano su `categoria_tl` e sulle
  // risposte della check di perimetro, così il lavoro già fatto non si perde.
  const stato = await pool.query(
    `SELECT NOT EXISTS (SELECT 1 FROM "${nomeSchema}".tl) AS vuoto,
            to_regclass('"${nomeSchema}".prodotti_tl') IS NOT NULL AS vecchio,
            EXISTS (SELECT 1 FROM "${nomeSchema}".materie_lavorazione) AS storico`
  );
  if (stato.rows[0]?.vuoto && stato.rows[0]?.vecchio) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "${nomeSchema}".tl
           (codice, descrizione, check_list, verso_check_list, ordine)
         SELECT DISTINCT ON (lower(btrim(tipologia)))
                btrim(tipologia),
                COALESCE(NULLIF(btrim(esito), ''), btrim(tipologia)),
                rilevante_perimetro, verso_perimetro, ordine
           FROM "${nomeSchema}".prodotti_tl
          WHERE btrim(tipologia) <> ''
          ORDER BY lower(btrim(tipologia)), id`
      );
      await client.query(
        `CREATE TEMP TABLE mappa_tl ON COMMIT DROP AS
         SELECT p.id AS vecchio, t.id AS nuovo
           FROM "${nomeSchema}".prodotti_tl p
           JOIN "${nomeSchema}".tl t
             ON lower(btrim(t.codice)) = lower(btrim(p.tipologia))`
      );
      // Il processo passa dall'associazione: la direttrice e il prodotto che
      // erano sulla TS diventano quelli che la materia mutua, e la TS resta
      // codice + descrizione + contrassegno.
      await client.query(
        `UPDATE "${nomeSchema}".materia_tl a
            SET direttrice = COALESCE(p.direttrice, ''),
                prodotto = COALESCE(p.prodotto, ''),
                dipendenza = p.dipendenza,
                procedura = p.procedura,
                esito = p.esito
           FROM "${nomeSchema}".prodotti_tl p
          WHERE p.id = a.tl_id`
      );
      // LA RIMMAPPATURA IN UN COLPO SOLO. Due vecchie TS con lo stesso codice
      // diventano una sola. Spostare gli id una riga alla volta fa cascata —
      // 3 → 1 tocca anche le righe appena diventate 3 — e un UPDATE in blocco
      // viola la chiave prima di poter scartare il duplicato. Si calcola prima
      // la destinazione di ogni riga, si tiene una riga per chiave (vince
      // quella già sulla TS che sopravvive) e si scrive una volta sola.
      const mappa = await client.query(`SELECT vecchio FROM mappa_tl`);
      const vecchi = mappa.rows.map((r) => Number(r.vecchio));
      const mappati = vecchi.length > 0 ? vecchi : [-1];

      // Associazioni delle materie: identità = id dell'associazione, così una
      // riga scartata non porta via il processo di un'altra.
      await client.query(
        `CREATE TEMP TABLE materia_tl_target ON COMMIT DROP AS
         SELECT DISTINCT ON (a.materia_id, m.nuovo)
                a.id AS associazione_id, m.nuovo AS tl_id
           FROM "${nomeSchema}".materia_tl a
           JOIN mappa_tl m ON m.vecchio = a.tl_id
          ORDER BY a.materia_id, m.nuovo, (a.tl_id = m.nuovo) DESC, a.id`
      );
      await client.query(
        `DELETE FROM "${nomeSchema}".materia_tl a
          WHERE a.tl_id = ANY($1::int[])
            AND NOT EXISTS (
                  SELECT 1 FROM materia_tl_target t WHERE t.associazione_id = a.id
                )`,
        [mappati]
      );
      await client.query(
        `UPDATE "${nomeSchema}".materia_tl a
            SET tl_id = t.tl_id
           FROM materia_tl_target t
          WHERE a.id = t.associazione_id`
      );

      // Collegamenti alle categorie di debito: si riscrivono dalla mappa.
      await client.query(
        `CREATE TEMP TABLE categoria_tl_target ON COMMIT DROP AS
         SELECT DISTINCT ON (c.categoria, m.nuovo)
                c.categoria, m.nuovo AS tl_id, c.attivo, c.ordine
           FROM "${nomeSchema}".categoria_tl c
           JOIN mappa_tl m ON m.vecchio = c.tl_id
          ORDER BY c.categoria, m.nuovo, (c.tl_id = m.nuovo) DESC, c.tl_id`
      );
      await client.query(`DELETE FROM "${nomeSchema}".categoria_tl`);
      await client.query(
        `INSERT INTO "${nomeSchema}".categoria_tl (categoria, tl_id, attivo, ordine)
         SELECT categoria, tl_id, attivo, ordine FROM categoria_tl_target`
      );

      // Risposte della check di perimetro: una per azienda e TS. La tabella
      // può non essere ancora nata (spazio che non ha mai aperto il triage):
      // in quel caso non c'è nulla da rimappare.
      const triage = await client.query(`SELECT to_regclass($1) AS tabella`, [
        `"${nomeSchema}".triage_perimetro`,
      ]);
      if (triage.rows[0]?.tabella) {
        await client.query(
          `CREATE TEMP TABLE triage_perimetro_target ON COMMIT DROP AS
           SELECT DISTINCT ON (p.azienda_id, m.nuovo)
                  p.azienda_id, m.nuovo AS lavorazione_id, p.stato, p.natura, p.nota,
                  p.aggiornato_il
             FROM "${nomeSchema}".triage_perimetro p
             JOIN mappa_tl m ON m.vecchio = p.lavorazione_id
            ORDER BY p.azienda_id, m.nuovo, (p.lavorazione_id = m.nuovo) DESC,
                     p.lavorazione_id`
        );
        await client.query(
          `DELETE FROM "${nomeSchema}".triage_perimetro p
            WHERE p.lavorazione_id = ANY($1::int[])`,
          [mappati]
        );
        await client.query(
          `INSERT INTO "${nomeSchema}".triage_perimetro
             (azienda_id, lavorazione_id, stato, natura, nota, aggiornato_il)
           SELECT azienda_id, lavorazione_id, stato, natura, nota, aggiornato_il
             FROM triage_perimetro_target`
        );
      }
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
  } else if (stato.rows[0]?.vuoto && stato.rows[0]?.storico) {
    // Spazi antichissimi, senza nemmeno `prodotti_tl`: le TS stavano nelle
    // lavorazioni delle materie. Stessa idea, sorgente diversa.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "${nomeSchema}".tl
           (codice, descrizione, check_list, verso_check_list, ordine)
         SELECT DISTINCT ON (lower(btrim(tipologia)))
                btrim(tipologia), btrim(tipologia), rilevante_perimetro,
                verso_perimetro, ordine
           FROM "${nomeSchema}".materie_lavorazione
          WHERE btrim(tipologia) <> ''
          ORDER BY lower(btrim(tipologia)), id`
      );
      await client.query(
        `INSERT INTO "${nomeSchema}".materia_tl
           (materia_id, tl_id, ordine, direttrice, prodotto, dipendenza, procedura, esito)
         SELECT l.materia_id, t.id, l.ordine, COALESCE(l.dipendenza, ''), l.tipologia,
                l.dipendenza, l.procedura, l.esito
           FROM "${nomeSchema}".materie_lavorazione l
           JOIN "${nomeSchema}".tl t ON lower(btrim(t.codice)) = lower(btrim(l.tipologia))
         ON CONFLICT (materia_id, tl_id) DO NOTHING`
      );
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
  }

  // LE LAVORAZIONI PER TIPOLOGIA DI DEBITO ENTRANO NEL CATALOGO (0.158.0).
  //
  // Prima ogni categoria di debito aveva una riga scritta a mano con la
  // lavorazione e il destinatario: la stessa procedura esisteva in due tabelle
  // e andava tenuta allineata a mano. Qui la categoria punta a una TS di
  // `prodotti_tl`, così ufficio, passi ed esito si scrivono in un posto solo.
  //
  // La vecchia `lavorazioni_tipo_debito` resta in piedi (i documenti del
  // triage già emessi la citano) ma nessuno la legge più: la copia avviene una
  // volta sola, e se la categoria ha già dei collegamenti non si torna
  // indietro sopra le scelte fatte dall'ente.
  await assicuraTabellaLavorazioniTipoDebito(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.categoria_tl (
      categoria TEXT NOT NULL,
      tl_id INTEGER NOT NULL,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      ordine INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (categoria, tl_id)
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_categoria_tl_tl ON ${s}.categoria_tl (tl_id)`
  );

  const categorie = await pool.query(
    `SELECT NOT EXISTS (SELECT 1 FROM "${nomeSchema}".categoria_tl) AS vuoto,
            EXISTS (SELECT 1 FROM "${nomeSchema}".lavorazioni_tipo_debito) AS legate`
  );
  if (categorie.rows[0]?.vuoto && categorie.rows[0]?.legate) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Le TS che la vecchia tabella citava e che il catalogo non ha ancora:
      // la lavorazione è il codice e la descrizione, una volta sola. L'ufficio
      // che stava nella vecchia riga non entra più nella TS: è il processo
      // dell'associazione, e qui non c'è una materia a cui appenderlo.
      await client.query(
        `INSERT INTO "${nomeSchema}".tl (codice, descrizione, ordine)
         SELECT DISTINCT ON (lower(btrim(l.lavorazione)))
                btrim(l.lavorazione), btrim(l.lavorazione), 0
           FROM "${nomeSchema}".lavorazioni_tipo_debito l
          WHERE btrim(l.lavorazione) <> ''
            AND NOT EXISTS (
                  SELECT 1 FROM "${nomeSchema}".tl t
                   WHERE lower(btrim(t.codice)) = lower(btrim(l.lavorazione))
                )
          ORDER BY lower(btrim(l.lavorazione)), l.id`
      );
      await client.query(
        `INSERT INTO "${nomeSchema}".categoria_tl (categoria, tl_id, attivo, ordine)
         SELECT l.categoria, t.id, l.attivo, l.ordine
           FROM "${nomeSchema}".lavorazioni_tipo_debito l
           JOIN "${nomeSchema}".tl t ON lower(btrim(t.codice)) = lower(btrim(l.lavorazione))
          ON CONFLICT (categoria, tl_id) DO NOTHING`
      );
      await client.query('COMMIT');
    } catch (errore) {
      await client.query('ROLLBACK').catch(() => {});
      throw errore;
    } finally {
      client.release();
    }
  }
}

/**
 * CHECK DI PERIMETRO E SCENARI DEL TRIAGE (0.153.0).
 *
 * Quattro tabelle, ognuna con un compito solo:
 *
 *  - `triage_perimetro` — le risposte dell'operatore alle TS rilevanti, una
 *    riga per azienda e lavorazione. La chiave è la coppia: la stessa TS vale
 *    per tutte le aziende nella configurazione, ma la risposta è di ciascuna.
 *  - `parametri_scenari` — la riga unica delle spese di procedura.
 *  - `parametri_scenari_rango` — le percentuali per rango, fissate dall'ente.
 *    Nessun valore di default: una riga assente è un'ipotesi non calcolabile.
 *  - `triage_scenario` — il rango del credito scelto per questa azienda.
 *
 * Si creano a runtime come le altre: uno spazio esistente le riceve alla prima
 * apertura del triage, senza migrazioni e senza perdere nulla.
 */
export async function assicuraTabelleScenariTriage(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await assicuraTabellaMaterieLavorazione(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.triage_perimetro (
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      lavorazione_id INTEGER NOT NULL,
      stato TEXT NOT NULL,
      natura TEXT,
      nota TEXT,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (azienda_id, lavorazione_id)
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_scenari (
      id INTEGER PRIMARY KEY DEFAULT 1,
      costi_procedura_pct NUMERIC,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.parametri_scenari_rango (
      rango TEXT PRIMARY KEY,
      tasso_liquidazione_pct NUMERIC,
      cram_down_pct NUMERIC,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.triage_scenario (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      rango TEXT NOT NULL,
      aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Registro delle consegne ai reparti: un evento per ogni PDF scaricato dal
 * triage, con reparto, data della verifica, versione del documento, totali e
 * chi lo ha scaricato.
 *
 * Diario e non stato: due scaricamenti sono due righe. Serve a rispondere a
 * «il reparto ha in mano la versione che vedo adesso?», che una data sola non
 * saprebbe dire. Nessun contenuto del documento viene copiato qui: la versione
 * è un'impronta, e il PDF resta sul computer di chi lo ha scaricato.
 */
export async function assicuraTabellaConsegneReparti(nomeSchema: string): Promise<void> {
  if (giaGarantita(nomeSchema, 'consegne_reparti')) return;
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema); // FK aziende
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.consegne_reparti (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER REFERENCES ${s}.aziende(id) ON DELETE SET NULL,
      ragione_sociale TEXT,
      reparto TEXT NOT NULL,
      data_verifica DATE NOT NULL,
      versione TEXT NOT NULL,
      nome_file TEXT NOT NULL,
      righe INTEGER NOT NULL DEFAULT 0,
      totale NUMERIC(15,2) NOT NULL DEFAULT 0,
      posizioni_da_contabilizzare INTEGER NOT NULL DEFAULT 0,
      importo_da_contabilizzare NUMERIC(15,2) NOT NULL DEFAULT 0,
      consegnato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
      consegnato_da TEXT,
      tipo TEXT NOT NULL DEFAULT 'reparto'
    )`
  );
  // LA CONFERMA D'INVIO, aggiunta dopo: la riga dice che il documento è
  // uscito dalla piattaforma, non che è arrivato al reparto. Chi lo spedisce
  // lo dichiara — data, mezzo, note — e la dichiarazione porta con sé chi
  // l'ha fatta e quando. NULL sulle quattro colonne = nessuno l'ha dichiarato.
  //
  // `ADD COLUMN IF NOT EXISTS` una per chiamata: gli spazi già attivi hanno la
  // tabella senza queste colonne, e il DDL gira a ogni avvio dell'azione. Le
  // conferme già scritte non si toccano.
  for (const colonna of [
    'inviata_il DATE',
    'mezzo_invio TEXT',
    'note_invio TEXT',
    'invio_confermato_il TIMESTAMPTZ',
    'invio_confermato_da TEXT',
    // La ragione sociale della consegna è una fotografia: rende la riga
    // leggibile anche se l'anagrafica cambia nome o sparisce.
    'ragione_sociale TEXT',
    // QUALE DOCUMENTO è uscito: il foglio per reparto (raggruppato per
    // tipologia di debito) o il report per unità operativa (raggruppato per
    // codice di partita). Le due impronte di versione non sono confrontabili:
    // senza questa colonna un ufficio che si chiama come un reparto farebbe
    // risultare «superato» un documento che nessuno ha mai ricevuto.
    "tipo TEXT NOT NULL DEFAULT 'reparto'",
  ]) {
    await eseguiDdlTenant(
      sql`ALTER TABLE ${s}.consegne_reparti ADD COLUMN IF NOT EXISTS ${sql.raw(colonna)}`
    );
  }
  // Il diario non si cancella con l'oggetto a cui si riferisce: `ON DELETE
  // CASCADE` azzerava le consegne — comprese le dichiarazioni d'invio già
  // firmate — quando si cancellava l'azienda, che è un'operazione ordinaria.
  // Con SET NULL la riga resta (con la sua ragione sociale) e smette solo di
  // puntare a un'anagrafica che non c'è più. Il nome del file è del vincolo
  // scelto da noi: quello automatico di Postgres non è stabile.
  await eseguiDdlTenant(
    sql.raw(
      sqlChiaveEsternaIdempotente({
        nomeSchema,
        tabella: 'consegne_reparti',
        colonne: ['azienda_id'],
        schemaRiferito: nomeSchema,
        tabellaRiferita: 'aziende',
        colonneRiferite: ['id'],
        azione: 'SET NULL',
        nomeVincolo: 'consegne_reparti_azienda_fk',
      })
    )
  );
  await eseguiDdlTenant(
    sql`CREATE INDEX IF NOT EXISTS idx_consegne_reparti_azienda
        ON ${s}.consegne_reparti (azienda_id, consegnato_il DESC)`
  );
  segnaGarantita(nomeSchema, 'consegne_reparti');
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

/**
 * Ramo contabile per anno (0.184.0): un ramo per ogni bilancio XBRL aperto
 * sullo scenario, accanto — non al posto — degli altri anni. `tipo` vale
 * 'PARTENZA' per il ramo che nasce dal bilancio depositato e 'SIMULAZIONE'
 * per quelli che applicano ipotesi dichiarate su un ramo di partenza
 * (`ramo_base_id`). Dati, indici, situazione debitoria e valutazione si
 * conservano già calcolati: riaprire il ramo deve mostrare esattamente il
 * prospetto che l'operatore ha visto, anche se il motore degli indici
 * cambia — un ricalcolo esplicito crea un ramo nuovo, non riscrive il
 * passato.
 */
export async function assicuraTabellaContabileRami(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.contabile_rami (
      id SERIAL PRIMARY KEY,
      scenario_id INTEGER NOT NULL REFERENCES ${s}.scenari(id) ON DELETE CASCADE,
      azienda_id INTEGER NOT NULL,
      anno_bilancio INTEGER NOT NULL,
      etichetta TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'PARTENZA',
      ramo_base_id INTEGER REFERENCES ${s}.contabile_rami(id) ON DELETE CASCADE,
      xbrl_storico_id INTEGER,
      dati_finanziari JSONB NOT NULL,
      leve JSONB NOT NULL DEFAULT '{}'::jsonb,
      indici JSONB NOT NULL,
      altri_indici JSONB NOT NULL DEFAULT '[]'::jsonb,
      situazione_debitoria JSONB NOT NULL,
      severity TEXT NOT NULL,
      valutazione JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Debito dell'ente memorizzato a fine verifica amministrativa (0.185.0).
 *
 * La verifica amministrativa non è un calcolo a schermo: è un atto che si
 * chiude con una cifra. Quella cifra resta qui, una riga per azienda, con i tre
 * stati separati e la data in cui è stata letta dagli archivi. La contabile la
 * legge come dato della verifica, non ricalcolandola per conto proprio; una
 * nuova memorizzazione sostituisce la precedente, e la data dice quando.
 */
export async function assicuraTabellaDebitoEnteMemorizzato(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.debiti_ente_memorizzati (
      azienda_id INTEGER PRIMARY KEY REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      totale NUMERIC(16,2) NOT NULL,
      contabilizzato NUMERIC(16,2) NOT NULL DEFAULT 0,
      da_contabilizzare NUMERIC(16,2) NOT NULL DEFAULT 0,
      segnalato NUMERIC(16,2) NOT NULL DEFAULT 0,
      contributi NUMERIC(16,2) NOT NULL DEFAULT 0,
      sanzioni NUMERIC(16,2) NOT NULL DEFAULT 0,
      crediti_agente NUMERIC(16,2) NOT NULL DEFAULT 0,
      righe INTEGER NOT NULL DEFAULT 0,
      righe_segnalate INTEGER NOT NULL DEFAULT 0,
      ripartito BOOLEAN NOT NULL DEFAULT FALSE,
      sanzioni_non_distinte BOOLEAN NOT NULL DEFAULT FALSE,
      fonte TEXT NOT NULL,
      fonte_tipo TEXT NOT NULL DEFAULT 'certificazione',
      memorizzato_il TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
}

/**
 * Verifica azienda (0.187.0): la simulazione che unisce amministrativa e
 * contabile, e la configurazione delle annualità di proiezione.
 *
 * `verifica_azienda_config` ha una sola riga per spazio: le annualità si
 * fissano una volta e valgono per tutte le aziende, così due simulazioni della
 * stessa posizione non usano orizzonti diversi senza dirlo. Le simulazioni si
 * conservano già calcolate (colonne, crescita, avvertenze) perché sono la
 * memoria storica su cui il sistema dovrà misurare i propri scostamenti: una
 * nuova elaborazione non cancella quella precedente.
 */
export async function assicuraTabelleVerificaAzienda(nomeSchema: string): Promise<void> {
  const s = sql.identifier(nomeSchema);
  await assicuraTabellaAziende(nomeSchema);
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.verifica_azienda_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      annualita_proiezione INTEGER NOT NULL DEFAULT 3,
      simulazione_attiva BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT verifica_azienda_config_una_riga CHECK (id = 1)
    )`
  );
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.verifica_azienda_config ADD COLUMN IF NOT EXISTS simulazione_attiva BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await eseguiDdlTenant(
    sql`CREATE TABLE IF NOT EXISTS ${s}.verifica_azienda_simulazioni (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL REFERENCES ${s}.aziende(id) ON DELETE CASCADE,
      profilo TEXT NOT NULL,
      annualita INTEGER NOT NULL,
      debito_ente NUMERIC(16,2) NOT NULL DEFAULT 0,
      crescita_storica_pct NUMERIC(8,2),
      crescita_applicata_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
      colonne JSONB NOT NULL,
      avvertenze JSONB NOT NULL DEFAULT '[]'::jsonb,
      base_per_proposta BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  // La simulazione scelta come base degli scenari di accordo transattivo
  // (0.195.0). Una sola per azienda: l'azione azzera le altre.
  await eseguiDdlTenant(
    sql`ALTER TABLE ${s}.verifica_azienda_simulazioni ADD COLUMN IF NOT EXISTS base_per_proposta BOOLEAN NOT NULL DEFAULT FALSE`
  );
}
