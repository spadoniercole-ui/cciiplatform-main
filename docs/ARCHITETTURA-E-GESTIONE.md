# CCIIplatform — Logica applicativa e guida alla gestione

Documento unico di ricostruzione. Riferimento: versione **0.133.3**
(Portable **1.2.16**), verificato sui sorgenti il 19/10/2026.

Come è costruito: prima il prodotto e il modello concettuale, poi la sequenza logica
completa (fasi 0–10), poi le regole trasversali, la mappa del codice, i dati, le fonti
normative, le incoerenze trovate e infine il protocollo di gestione del progetto. Le
affermazioni di comportamento sono verificate sul codice; quelle marcate *(dedotto)* sono
inferenze da strutture e commenti, da confermare.

---

## 1. Il prodotto in una pagina

Piattaforma SaaS multi-tenant per il Codice della Crisi d'Impresa e dell'Insolvenza
(D.Lgs. 14/2019, corretto dal D.Lgs. 136/2024).

Serve due pubblici che leggono la stessa norma da lati opposti:

| Attore | Cosa fa | Percorso |
|---|---|---|
| **Ente creditore** (INPS, INAIL, Agenzia Entrate, Riscossione) | riceve una proposta, la istruisce, decide se è ricevibile e come votare | `RICEVENTE` |
| **Professionista / azienda** | costruisce la proposta, la difende, negozia | `REDIGENTE` |

Il prodotto non emette giudizi riservati: rileva parametri, perimetri, soglie e
incongruenze. "Il cram down è applicabile" e "la proposta è conveniente" non compaiono mai
come esito: restano al professionista, all'ente e al tribunale. Questa è una scelta di
responsabilità, non un limite tecnico, ed è ripetuta nei commenti di
`src/lib/registroFonti/regole.ts` e `src/lib/screening/indicatore.ts`.

Output tipici: indici di allerta, Check List pesata, soglie art. 25-novies, verifica di
ricevibilità, confronto con la liquidazione, piano di rientro, relazione AI,
fascicolo/PDF, backup.

---

## 2. Modello concettuale

```
Superadmin (env, fuori dal DB)
└── Licenza commerciale (licenze)
    └── Spazio / tenant (spazi: codice, tipo_spazio, giudicante)
        ├── schema Postgres dedicato: tenant_<codice>
        ├── Admin di spazio (admin_workspace)
        ├── Utenti (utenti_spazio) → permessi per modulo + aziende assegnate
        ├── Aziende (aziende)
        │   ├── Anagrafica, anagrafica presso l'ente
        │   ├── XBRL per esercizio, indici, posizione aggiornata
        │   ├── Triage / debiti verso l'ente / V.E.R.A. / soglie
        │   ├── Screening (solo ENTE) e cicli archiviati
        │   └── Scenari (1..N)
        │       └── Proposta, Check List, piano, simulazione,
        │           confronto liquidatorio, relazione
        └── Parametri di spazio (soglie, limiti, checklist, stampa…)
```

Tre distinzioni che reggono tutto il resto:

1. **Spazio = schema Postgres.** L'isolamento è fisico (`tenant_<codice>`); il nome schema
   ricevuto dal browser è accettato solo se coincide con quello della sessione
   (`richiediAccessoSchema`).
2. **Azienda ≠ Scenario.** L'azienda è il soggetto (anagrafica, bilanci, storia). Lo
   scenario è **un ciclo di analisi indipendente** su quell'azienda: Check List, indici,
   proposta, piano e relazione si agganciano allo scenario, non all'azienda. Un'azienda
   può avere N scenari nel tempo.
3. **Ciclo ≠ Scenario.** Il *ciclo* (`src/lib/cicloAzienda.ts`) è la riapertura
   dell'istruttoria sulla stessa azienda: archivia screening, risposte Check List,
   posizioni debitorie e soglie, e riparte da zero. Restano anagrafica, bilanci XBRL
   (fatti per esercizio), scenari già aperti e storico dello screening. Lo scenario è
   invece una singola proposta/analisi dentro il ciclo.

### I due percorsi

| | ENTE (`tipo_spazio = 'ENTE'`) | NON_ENTE / Redigente |
|---|---|---|
| Tipo proposta | solo `RICEVUTA` | `DA_DEFINIRE` (default) o `RICEVUTA` |
| Origini ammesse | `['Azienda', 'Tribunale']` | `['Studio', 'Professionista', 'Azienda']` |
| Soglie 25-novies | solo la propria | tutte insieme |
| Ricevibilità | una soglia (quella dell'ente) | una soglia per riga/categoria/rango |
| Screening | sì, esclusivo | no |
| Proposta | estratta dal PDF con AI | inserita a righe |

`tipo_spazio` nel codice vale **`'ENTE' | 'NON_ENTE'`** (default `NON_ENTE`, vedi
`src/lib/autorizzazione.ts`). Il percorso `REDIGENTE` è la declinazione di `NON_ENTE`, non
un valore memorizzato. Le origini ammesse stanno in `src/lib/origineProposta.ts`.

---

## 3. Le tre edizioni

| Edizione | Attivazione | Database | File | Differenze |
|---|---|---|---|---|
| Cloud (Vercel) | default | Postgres gestito, TLS senza verifica | Vercel Blob | multi-spazio, superadmin, licenze |
| Portable (USB) | `PORTABLE=1` | PGlite cifrato AES-256-GCM | cartella locale | niente superadmin/licenze/multi-spazio; HTTP locale o HTTPS LAN |
| Server on-premise | `EDIZIONE_SERVER=1` | Postgres locale | disco (`ARCHIVIO_FILE_DIR`) | come il cloud, su server dell'ente, backup su disco |

Il confine è concentrato in `src/lib/edizioneServer.ts`, `src/lib/portableDb.ts`,
`src/lib/portableBootstrap.ts`, `src/lib/blobStore.ts`, `src/lib/cookieSicuro.ts`.
**Regola:** ogni modifica al codice condiviso deve funzionare in tutte e tre. La CI
costruisce anche l'immagine Docker (`server/Dockerfile`).

---

## 4. La sequenza logica

### Fase 0 — Accesso e identità

1. Login in `src/app/page.tsx` → `src/app/actions/auth.ts`.
2. Superadmin: credenziali da `SUPERADMIN_USER` / `SUPERADMIN_PASSWORD`, niente riga nel
   DB. Utenti di spazio: bcryptjs su `admin_workspace` / `utenti_spazio`.
3. MFA (`src/lib/mfa`, TOTP) e limite tentativi in memoria + DB
   (`src/lib/tentativiAccessoCondivisi.ts`).
4. Sessione: token opaco di 32 byte (`crypto.randomBytes(32)`), cookie httpOnly
   `session_token`, `sameSite: 'lax'`, **8 ore** (`DURATA_SESSIONE_ORE` in
   `src/lib/sessione.ts`), `Secure` solo dove ha senso (`cookieSicuro.ts`).
5. Contesto di spazio (`src/lib/autorizzazione.ts`):
   - `SALVAGENTE` — Superadmin in ispezione, cookie `spazio_ispezione` valido solo con
     sessione SUPERADMIN;
   - `ADMIN_SPAZIO` — nessuna restrizione di permessi;
   - `OPERATORE` — permessi per modulo (`NESSUNO | LETTURA | SCRITTURA`) + elenco
     `aziendeConsentite`.
6. Password temporanea: in DB c'è solo il marcatore `PASSWORD_DA_CAMBIARE`, mai la
   password; il cambio è forzato.

### Fase 1 — Dal contratto allo spazio

Superadmin: licenza commerciale (`licenze`) → spazio (`spazi`) → provisioning dello schema
`tenant_<codice>` (`src/db/provision.ts`) → creazione dell'Admin di spazio con password
temporanea. Le **funzioni plus** stanno in `licenze_spazio` e partono tutte spente: Dati di
Settore, Simulazione, Relazione AI (`src/app/actions/funzioniPlus.ts`). La licenza base
comprende Posizione Ente, Proposta, XBRL, Posizione Aggiornata, Indici, Check List,
Brogliaccio e assistente.

Le tabelle si creano/aggiornano **a runtime**, in modo idempotente
(`src/db/ensureTables.ts` per le globali, `src/db/provision.ts` per i tenant,
`src/lib/migrazioni` per le correzioni DDL). Non ci sono migrazioni Drizzle applicate:
Drizzle è marginale.

### Fase 2 — L'azienda e i fatti

1. **Anagrafica** (`aziende`, `anagrafica_ente` + configurazione): è ciò che resta tra un
   ciclo e l'altro.
2. **Triage / situazione debitoria**: strutture del prospetto (`strutture_prospetto`),
   prospetti (`prospetti_triage`), posizioni (`debiti_triage`), debiti verso l'ente
   (`debiti_ente`, `debiti_ente_tracciati`, `tipo_debito_config`,
   `categorie_tipo_debito`).
3. **V.E.R.A. (obbligatorio nel triage)**: `debiti_vera`, `vera_titoli`,
   `vera_trattamenti`; le sanzioni sono una *presunzione* e restano fuori dai test di
   soglia. Ogni riga porta anche l'**ambito** — contributi INPS oppure crediti già affidati
   all'Agente della Riscossione — e il riparto contributi/sanzioni: sono due lettere diverse
   dell'art. 25-novies (a e d) e non si sommano nella stessa base. Il file è un presupposto:
   senza un V.E.R.A. riconosciuto e leggibile la conferma
   del triage non parte. Dalle sue righe, con la tabella `lavorazioni_tipo_debito`
   (Parametri › Lavorazioni), il triage prepara una comunicazione per collega — solo testo
   da copiare e inviare personalmente, mai un invio automatico — e, con la stessa
   configurazione, **un PDF per reparto** («Comunica ai reparti»): elenca i debiti da
   lavorare e le attività di contabilizzazione, si scarica e l'invio resta a cura
   dell'ufficio. La funzione vive accanto alla presa in carico, non la sostituisce e non
   la condiziona.
   Accanto c'è la seconda uscita, **un report per unità operativa**: i debiti raggruppati per
   codice di partita e, dentro ogni codice, le lavorazioni della sua materia (con passi ed
   esito) e le inadempienze che lo compongono. L'ufficio è la **dipendenza** del codice, o
   quella della materia se il codice non ne ha una propria (`titoli_ente`,
   `materie_lavorazione`).

   **La verifica si riapre.** La videata di esito (comunicazioni, documenti, decisione) non
   vive più solo nella scheda del browser: l'azienda sta nell'URL
   (`/verifica-salute?azienda=<id>`) e una ricarica ricompone l'esito dai dati salvati —
   posizioni del V.E.R.A. con il loro periodo, esito, soglie ricalcolate. Il ritorno è
   offerto anche dalla scheda azienda e dalla dashboard. Una verifica già presa in carico,
   o archiviata, si consulta ma non si decide di nuovo.
   Ogni PDF porta una **versione** (impronta del contenuto, stampata sul foglio) e ogni
   scaricamento lascia una riga in `consegne_reparti`: reparto, data della verifica,
   versione, posizioni, totali, chi e quando. È un diario, non uno stato — due
   scaricamenti sono due righe — e non registra nessun contenuto del documento. A schermo
   l'ultima consegna dice se il reparto ha in mano la versione che si sta guardando: se
   il documento è cambiato dopo la consegna, il triage lo segnala e chiede di riscaricare.
   «Consegnato» qui significa *scaricato*: la piattaforma non spedisce e non sa da sola se
   l'ufficio ha poi inviato il file. Chi lo spedisce lo **dichiara** (data, mezzo, note),
   e la riga del registro conserva la dichiarazione con il nome di chi l'ha fatta e
   l'istante in cui è stata scritta. Una dichiarazione per consegna, non sovrascrivibile:
   senza conferma la scheda dice «invio non confermato», non «non inviato».
4. **Visura**: estrazione AI → fatti strutturati (`src/lib/visura/fatti.ts`),
   conservazione e controllo dei documenti già presenti.
5. **Soglie art. 25-novies**: dati a mano o da tracciati, calcolo puro
   (`src/lib/soglie25novies/calcolo.ts`), forma giuridica per la soglia AER, parametri per
   spazio.
6. **Nuovo ciclo** (`src/lib/cicloAzienda.ts`): archivia e azzera il lavoro istruttorio,
   conserva i fatti.

### Fase 3 — Lo scenario

Lo scenario nasce dalla classificazione della proposta: `RICEVUTA` (da Ente o Tribunale) o
`DA_DEFINIRE` (dallo studio). Campi rilevanti: `stato` (BOZZA / IN_CORSO / COMPLETATO),
`origine_proposta`, `simulazione_attiva`, `bloccato_il`, `archiviato`. In uno spazio ENTE
la creazione di uno scenario non `RICEVUTA` è rifiutata lato server.

La UX attuale è **una pagina sola per scenario**: `/scenari/[id]` reindirizza a
`/proposta`, che monta `PropostaScenario` (Ricevente) o `LavorazioneRedigente`
(Redigente). Le vecchie rotte `brogliaccio`, `report` e la panoramica restano come
redirect per non rompere i link.

### Fase 4 — Il quadro quantitativo

1. **XBRL**: upload → parser (`fast-xml-parser`, `src/lib/xbrl/parser.ts`) → mappatura tag
   (globale `xbrl_tag_mappings` + per tenant) → dati per esercizio
   (`xbrl_storico_azienda`, `xbrl_tab_azienda`).
2. **Indici**: unico punto di calcolo `src/lib/xbrl/indici.ts` (C1–C5). Attenzione: sono
   derivati dal sistema dell'abrogato art. 13 CCII e sono un **ausilio operativo**, non un
   parametro normativo. Le soglie vanno validate.
3. **Trend** multi-periodo (`src/lib/xbrl/trend.ts`).
4. **Posizione aggiornata** (`posizione_aggiornata`): dati attualizzati, anche da PDF;
   confronto con l'ultimo bilancio depositato.
5. **Dati di settore**: cache globale ISTAT (`dati_settore_cache`,
   `dati_settore_ultima_chiamata`), crescita per ATECO.
6. **IAI** (`src/lib/iai`): indice composito 0–100, non compensatorio, con vincoli; è la
   copertina dello Screening.
7. **Indicatore di attenzione** (`src/lib/screening/indicatore.ts`): regola **gerarchica e
   non compensatoria**. Un superamento dell'art. 25-novies non può essere "compensato" da
   un buon patrimonio netto: è un fatto giuridico. L'esito migliore possibile è "nessuna
   criticità con i dati disponibili", mai un verde pieno.

### Fase 5 — Il quadro qualitativo

- **Check List ministeriale** (`src/lib/checklist/ministeriale.ts`) con modelli, pesi,
  colonne, campi extra, esclusioni, snapshot.
- **Punteggio** (`src/lib/checklist/scoring.ts`): contano solo le domande risposte; le non
  risposte non sono né a favore né contro. Le soglie di sintesi (default 20% / 50%) **non
  sono normative** e vanno riviste.
- **Criticità strutturali** aperte evidenziate a parte.
- **Test pratico** per azienda (`azienda_test_pratico`).

### Fase 6 — Screening (solo ENTE)

Dalla visura + XBRL l'AI produce due output in un colpo: un questionario Sì/No organizzato
per **direttrici dell'ente** e una relazione preliminare. Le risposte producono un esito
permanente sull'azienda con lo stesso motore di punteggio della Check List. Rigenerare lo
screening azzera le risposte precedenti (un questionario nuovo non eredita risposte a
domande che potrebbero non esistere più). Lo storico delle generazioni è conservato.

### Fase 7 — La proposta (il cuore)

1. **Righe** (`proposta_creditori`): categoria, importo dovuto, percentuale offerta,
   modalità (unica soluzione / rateale), rango legale, rilevanza per l'ente.
2. **Inquadramento** (`src/lib/proposta/inquadramento.ts`):
   - strumento (ADR 57/60/61, CN 23 c. 2-bis, concordato, PRO 64-bis, altro);
   - data di deposito;
   - quota degli altri aderenti, **calcolata** dalle righe ma correggibile, con scostamento
     visibile e segnalazione se il valore a mano cambia la soglia del 25%.
3. **Regole** (`src/lib/registroFonti/regole.ts`), deterministiche:
   - cram down art. 63: dal `2024-09-28` soglia 50% (se aderenti ≥ 25%) o 60% con
     dilazione max 10 anni; prima del 28/09/2024 regime transitorio 30% / 40%;
   - composizione negoziata: perimetro solo Agenzia Entrate / Riscossione, contributi e
     premi esclusi, nessuna omologazione forzosa.

   Se manca un dato decisivo la regola **si blocca e dice quale dato manca**. Ogni formula
   esiste in doppia versione, Ricevente e Redigente.
4. **Ricevibilità** (`src/lib/proposta/ricevibilita.ts`):
   - NON_ENTE: matching a quattro livelli (categoria esatta → alias → rango legale →
     Generale); criterio principale il valore di liquidazione stimato, poi percentuale
     minima e modalità;
   - ENTE: un solo limite, applicato ai dati estratti dal PDF; la percentuale si misura
     sul **capitale** (al netto di sanzioni, interessi e somme aggiuntive), non sul totale.
5. **Fonti**: ogni parametro cita la fonte e dichiara se è "riscontrata" o solo
   "riportata". Una fonte non riscontrata non si presenta come consolidata.

### Fase 8 — Piano, simulazione, confronto

- **Piano aziendale** (`piano_aziendale`, `tracciati_piano_aziendale`): import manuale, da
  bilancino o da XBRL.
- **Piano del Ricevente** (`src/lib/piano/ricevente.ts`), nell'ordine: piano dell'azienda
  sulle manopole con i colori di scostamento → variante di sistema → piano di rientro
  (unica soluzione/rate, mesi, quota subito, totale offerto a tutti i creditori) →
  soluzione "verde" (cassa mai negativa, rate coperte dal flusso di gestione, patrimonio
  netto non negativo). Orizzonte massimo 10 anni (`ORIZZONTE_MASSIMO`).
- **Simulazione Ricevente** (`simulazione_ricevente`): funzione plus, abilitata per
  scenario.
- **Confronto liquidatorio** (`confronto_liquidatorio`): generato a parte e poi letto
  dalla Relazione; non è la Relazione a fare ricerca web.

### Fase 9 — Chiusura

1. **Lista di controllo** prima della valutazione (`src/lib/valutazione/listaControllo.ts`):
   proposta, asseverazione, piano aziendale, posizione aggiornata, settore. Il piano di
   sviluppo è informativo, non bloccante.
2. **Relazione AI**: contesto costruito in `src/lib/relazione/contestoRicevente.ts` (cosa è
   cambiato, non ripetizione dello screening), generazione con Anthropic, revisione
   (`src/lib/revisore`), lessico (`src/lib/lessico`), perimetro delle fonti.
3. **Blocco**: generata la relazione, lo scenario diventa **sola lettura permanente**
   (`bloccato_il`); le versioni sono salvate in `relazione_generazioni` /
   `scenario_sblocchi` (sblocco tracciato).
4. **Documenti di corredo**, **fascicolo**, **stampa** (markdown/PDF), **copertina IAI**.

### Fase 10 — Esercizio e manutenzione

- Backup/ripristino (`src/lib/backup`, frammenti JSON, cartella backup su server), dump
  dati, verifica salute, manutenzione spazi.
- `azzeraDatabase` e `reset_database.sql` sono **distruttivi**: non eseguirli mai senza
  autorizzazione esplicita.
- Limiti AI per utente/ora e per spazio/giorno (`src/lib/limiteAi.ts`).

---

## 5. Regole trasversali non negoziabili

1. **Autorizzazione dentro l'azione.** Ogni `export async function` di un file
   `'use server'` è un endpoint pubblico. Prima istruzione:
   `richiediAccessoSchema(nomeSchema, { soloAdmin?, modulo?, livello? })`,
   `richiediAccessoSpazio(codice)`, `richiediAccessoAzienda`, `richiediAccessoScenario`,
   `verificaRigaConsentita`, `richiediSuperadmin`. Route API: `rifiutaSeNonAutorizzato`.
   Lo verifica `scripts/check-autorizzazione.mjs` dentro `npm run type-check`.
2. **Mai fidarsi del browser**: identità solo dalla sessione; `nomeSchema` validato;
   `aziendaId`/`scenarioId` verificati contro le aziende assegnate all'operatore.
3. **File**: URL passati dal browser verificati con `verificaFileDelloSpazio` (prefisso
   `spazio-<id>-`) prima di `get`/`del`.
4. **`'use server'`**: solo funzioni `async` esportate. Costanti e helper sincroni in moduli
   separati. Nei Server Component niente handler (`onClick`, `onChange`). Controllo in
   `scripts/check-use-server-exports.sh`.
5. **Schema a runtime, idempotente.** Ogni modifica deve essere compatibile con i tenant
   esistenti e con i dati già presenti.
6. **AI**: solo `@anthropic-ai/sdk`. Nuove chiamate a consumo raggiungibili con la sola
   sessione passano da `consumaQuotaAi`. Le pagine pesanti dichiarano `maxDuration`:
   300s su Proposta, Relazione e Parametri; 180s su Screening e Verifica Salute.
7. **Lingua**: UI, commenti, messaggi e CHANGELOG in italiano.
8. **Versioni**: `package.json`, `APP_VERSION` in `src/lib/appVersion.ts`, voce in
   `CHANGELOG.md`; la Portable ha il contatore separato `PORTABLE_VERSION`.
9. **Prima della consegna**: `type-check`, `lint`, `test`, `build` verdi (li esegue la CI
   su push e PR, più la build dell'immagine server).

---

## 6. Mappa del codice

### Rotte principali

| Percorso | Contenuto |
|---|---|
| `/` | login |
| `/cambio-password/[codice]` | cambio password forzato |
| `/superadmin` | pannello: Spazi, Licenze, Parametri, Indici, Manutenzione, XBRL |
| `/spazio/[codice]` | dashboard di spazio |
| `/spazio/[codice]/aziende` | elenco e creazione aziende |
| `/spazio/[codice]/aziende/[aziendaId]/…` | anagrafica; XBRL, indici, checklist, posizione ente, screening, operatori |
| `/spazio/[codice]/scenari` | elenco scenari |
| `/spazio/[codice]/scenari/[scenarioId]` | redirect a `/proposta` |
| `/spazio/[codice]/scenari/[scenarioId]/proposta` | pagina unica del lavoro (entrambi i percorsi) |
| `/spazio/[codice]/scenari/[scenarioId]/relazione` | relazione AI (funzione plus) |
| `…/checklist`, `…/indici`, `…/xbrl`, `…/settore`, `…/simulazione`, `…/posizione-aggiornata`, `…/situazione-debitoria` | viste di dettaglio |
| `/spazio/[codice]/parametri/**` | soglie, ricevibilità, checklist, lavorazioni per tipo di debito, indici, stampa, anagrafica ente, titoli, materie, direttrici |
| `/spazio/[codice]/indici`, `…/normativa`, `…/utenti`, `…/verifica-salute` | strumenti di spazio |
| `/spazio/[codice]/report` | **placeholder** "Sezione in costruzione" (Generazione Report) |
| `/api/blob-upload`, `/api/xbrl/*`, `/api/indici`, `/api/configurazioni/ccii` | route API |

### Dove sta la logica

| Ambito | File guida |
|---|---|
| Autorizzazione | `src/lib/autorizzazione.ts` |
| Tenant e DDL | `src/db/provision.ts`, `src/db/ensureTables.ts`, `src/lib/migrazioni` |
| Ciclo azienda | `src/lib/cicloAzienda.ts` |
| Indici | `src/lib/xbrl/indici.ts` |
| Check List | `src/lib/checklist/scoring.ts`, `src/lib/checklist/ministeriale.ts` |
| Soglie 25-novies | `src/lib/soglie25novies/calcolo.ts` |
| Regole normative | `src/lib/registroFonti/regole.ts`, `src/lib/registroFonti/fonti.ts` |
| Proposta | `src/lib/proposta/inquadramento.ts`, `src/lib/proposta/ricevibilita.ts` |
| Piano | `src/lib/piano/ricevente.ts`, `src/lib/piano/piano.ts`, `src/lib/piano/confronto.ts` |
| Screening | `src/lib/screening/indicatore.ts`, `src/lib/iai/indice.ts` |
| Comunicazioni ai colleghi | `src/lib/lavorazioni/comunicazioni.ts` |
| Documenti per i reparti (PDF, dal triage) | `src/lib/lavorazioni/reparti.ts`, `src/lib/lavorazioni/pdfReparto.ts` |
| Report per unità operativa (PDF per dipendenza, per codice o materia) | `src/lib/lavorazioni/reportUo.ts`, `src/lib/lavorazioni/pdfReportUo.ts` |
| Relazione | `src/lib/relazione/contestoRicevente.ts`, `src/lib/revisore` |
| Backup | `src/lib/backup` |
| Edizioni | `src/lib/edizioneServer.ts`, `src/lib/portableDb.ts`, `src/lib/blobStore.ts` |

71 server action in `src/app/actions/`: sono il livello di orchestrazione (leggono il DB,
verificano i permessi, delegano il calcolo ai moduli puri). `propostaScenario.ts` è la più
grande (~1.088 righe) e concentra acquisizione, verifica e relazione.

### Test

105 file di test accanto al sorgente: `*.test.ts` (Vitest, ambiente node, alias `@`) e,
per l'interfaccia, `*.test.tsx` con `// @vitest-environment jsdom` in testa — montano il
componente vero con Testing Library e leggono ciò che l'operatore vede. Sono la
specifica comportamentale più affidabile: prima di cambiare una regola, leggi il test che
la descrive.

---

## 7. Modello dati

**Globali (`public`)**: `licenze`, `licenze_spazio`, `spazi`, `sessioni`,
`mfa_credenziali`, `mfa_challenge`, `admin_spazio_index`, `utente_spazio_index`,
`xbrl_tag_mappings`, `analisi_xbrl_storico`, `dati_settore_cache`,
`dati_settore_ultima_chiamata`.

**Per tenant (`tenant_<codice>`), per area**:

- identità e configurazione: `admin_workspace`, `utenti_spazio`, `utenti_aziende`,
  `permessi_utente`, `parametri_workspace`, `parametri_visualizzazione`, `parametri_stampa`,
  `parametri_iai`, `parametri_soglie_25novies`, `indici_master`, `indici_abilitati`,
  `xbrl_tab_abilitate`;
- azienda: `aziende`, `anagrafica_ente`, `anagrafica_ente_config`,
  `azienda_cicli_archivio`, `azienda_screening`, `azienda_screening_storico`,
  `azienda_screening_risposte`, `azienda_checklist_ministeriale_risposte`,
  `azienda_test_pratico`;
- bilanci: `xbrl_tab_azienda`, `xbrl_storico_azienda`, `indici_azienda`,
  `posizione_aggiornata`, `analisi_bilancio_step`;
- debiti: `debiti_ente`, `debiti_ente_tracciati`, `debiti_ente_architrave`,
  `tipo_debito_config`, `categorie_tipo_debito`, `lavorazioni_tipo_debito`, `debiti_triage`,
  `debiti_vera`, `vera_titoli`, `vera_trattamenti`, `consegne_reparti`,
  `strutture_prospetto`, `prospetti_triage`, `tracciati_bilancino`;
- scenario: `scenari`, `proposta_creditori`, `simulazione_ricevente`,
  `piano_aziendale`, `tracciati_piano_aziendale`, `parametri_confronto_piano`,
  `confronto_liquidatorio`, `documenti_origine`, `documenti_corredo`, `brogliaccio`,
  `relazione_generazioni`, `scenario_sblocchi`;
- check list: `checklist_risposte`, `checklist_modelli`,
  `checklist_ministeriale_snapshot`, `checklist_pesi_domande`, `checklist_config_pesi`,
  `checklist_colonne_config`, `checklist_campi_extra`, `checklist_esclusioni`;
- ricevibilità: `limiti_ricevibilita`, `limiti_ricevibilita_rango`,
  `parametri_proposta_redigente`;
- ente: `titoli_ente` (il titolo di un codice e, in `attivita_recupero`, la procedura che
  l’ente segue per incassarlo; in `dipendenza`, l’ufficio a cui indirizzare la comunicazione di
  pagamento all’azienda — entrambe lette da `src/lib/titoliEnte/recupero.ts`),
  `titoli_ente_config`, `materie_ente`, `materie_lavorazione` (dipendenza, procedura ed esito
  scritti sulla materia: i codici li ereditano dove non ne hanno una versione propria — vedi
  `src/lib/titoliEnte/lavorazioniMateria.ts`). In `riscontro_norma` / `riscontro_interno` sta l’esito
  della ricerca sulle fonti ufficiali: `IN_CORSO` significa che la ricerca è partita col salvataggio e sta ancora lavorando
  (vedi `src/lib/titoliEnte/titoli.ts`), gli altri esiti sono il risultato.

Lo schema effettivo è quello creato da `src/db/provision.ts` + `src/db/ensureTables.ts`;
`src/db/schema.ts` (Drizzle) non è la fonte di verità. Alcune tabelle nascono però dentro il
modulo di dominio che le usa: `azienda_cicli_archivio` è creata da `src/lib/cicloAzienda.ts`
al primo utilizzo. Prima di dichiarare "la tabella non esiste", cerca il `CREATE TABLE`
anche in `src/lib`.

---

## 8. Dove vive la norma

| Materia | Fonte unica | Da validare |
|---|---|---|
| Indici di allerta | `src/lib/xbrl/indici.ts` | formule e soglie (art. 13 abrogato: ausilio) |
| Soglie 25-novies | `src/lib/soglie25novies/calcolo.ts` + `src/lib/normativa/dati.ts` | importi e requisiti, con checklist |
| Cram down / CN | `src/lib/registroFonti/regole.ts` + `fonti.ts` | decorrenze e perimetri |
| Check List ministeriale | `src/lib/checklist/ministeriale.ts` | pesi e soglie di sintesi |
| Riferimenti divulgativi | `src/lib/normativa/dati.ts`, `riferimenti.ts` | testo e riscontri |

`docs/CHECKLIST_VALIDAZIONE_NORMATIVA.md` elenca ciò che un commercialista deve validare.
**Regola:** nessun articolo, soglia o importo va inventato. Se un dato non è nel codice o
nei documenti, si chiede.

Duplicazione consapevole: le prime sette soglie di
`src/lib/soglie25novies/calcolo.ts` replicano `src/lib/normativa/dati.ts`; i test devono
rompersi se una delle due cambia. È un trade-off accettato, ma va ricordato in ogni
modifica.

---

## 9. Incoerenze e debito tecnico (trovati, non corretti)

1. **`CHANGELOG.md` non è coerente con sé stesso.** L'intestazione dichiara "ultima release
   cloud 0.105.0" mentre `package.json` e `APP_VERSION` sono a 0.133.3; inoltre dopo
   l'intestazione compaiono `0.69.0` e `0.70.1` prima della serie discendente da 0.133.3. Il
   changelog va letto come diario, non come indice.
2. **`CLAUDE.md` dice `tipo_spazio = ENTE | RED`**, il codice usa `ENTE | NON_ENTE`
   (default `NON_ENTE`). È la documentazione da correggere, non il codice: cambiare il
   valore romperebbe i dati esistenti.
3. **`/spazio/[codice]/report`** è ancora una pagina "Sezione in costruzione"
   ("Generazione Report", cinque tipologie). È un residuo di prodotto: decidere se
   implementarla o rimuoverla dalla navigazione.
4. **`giudicante`** è presente in `spazi` e nel contesto ma, come dice il commento in
   `src/lib/autorizzazione.ts`, è predisposto e non ancora operativo.
5. **Doppia sorgente DDL**: `ensureTables.ts` (globali + alter) e `provision.ts` (tenant)
   creano le stesse famiglie di tabelle in punti diversi; `src/lib/migrazioni` corregge a
   posteriori. Funziona, ma è il punto più fragile per una modifica di schema.
6. **Normativa duplicata** (vedi §8): intenzionale, da presidiare con i test.
7. **Action molto grandi**: `propostaScenario.ts` ~1.088 righe; il calcolo è già estratto
   in `src/lib/proposta`, l'orchestrazione no.
8. **Rotte fantasma**: `scenari/[id]`, `brogliaccio`, `report` sono redirect. Sono
   compatibilità voluta, ma vanno ricordate quando si legge il routing.
9. **Versioni a mano in tre punti**: `package.json`, `appVersion.ts`, `CHANGELOG.md`.
   `npm run consegna` confronta le tre fonti locali e lo dice, ma non corregge nulla: resta
   un avviso, perché le modifiche di solo tooling non chiedono il bump.

---

## 10. Protocollo di gestione del progetto

### Come si fa una modifica (sequenza consigliata)

1. **Classifica**: è logica di dominio (→ `src/lib/<dominio>` + test), orchestrazione
   (→ server action), UI (→ `src/components`), schema (→ `provision`/`ensureTables`),
   o infrastruttura (→ `src/lib`)?
2. **Individua il percorso**: ENTE o NON_ENTE? Le due letture della stessa norma producono
   messaggi diversi: non scrivere una formula sola.
3. **Cerca la fonte normativa** già presente (`registroFonti`, `normativa`, `indici.ts`).
   Se il dato non c'è, fermati e chiedi.
4. **Scrivi prima il test** di dominio (il repo è pieno di esempi) e poi la funzione pura.
5. **Collega l'azione** con la guardia di autorizzazione come prima istruzione, il modulo e
   il livello corretti (lettura vs scrittura).
6. **Schema**: `CREATE TABLE IF NOT EXISTS` + `ALTER ... IF NOT EXISTS`, compatibile con i
   tenant esistenti; aggiungi il test di migrazione se tocchi dati.
7. **UI**: nessun handler nei Server Component; etichette e messaggi in italiano; mai un
   default silenzioso: se manca un dato, dillo.
8. **Chiudi**: version bump triad, voce di CHANGELOG, `type-check`, `lint`, `test`, `build`,
   poi commit e push su GitHub, deploy di anteprima atteso fino a Ready e stesso commit in
   produzione su `main` (vedi `CLAUDE.md`, «Consegna: GitHub, anteprima e produzione»).
   L'attesa dei deploy e della CI non si guarda a occhio: dopo il push si lancia
   `npm run consegna`, che esce 0 solo se ogni ambiente Vercel atteso è pronto, la CI del
   commit è verde e — su `main` — il login del sito di produzione dichiara la stessa versione
   del commit. Se la CI è rossa lo script dice anche a quale passo si è fermata, così
   l'indicazione serve a correggere senza aprire GitHub.

### Cosa serve per lavorare bene

- **Ambito**: edizione (cloud/portable/server) e percorso (ENTE/Redigente).
- **Criterio di accettazione** osservabile: file, schermata, messaggio, formato, oppure
  "stesso risultato del test X".
- **Fonte normativa** quando la modifica tocca articoli, soglie o importi.
- **Decisione di prodotto** quando ci sono due letture possibili: meglio una domanda in più
  che un default inventato.

### Cosa non si fa senza autorizzazione

- `reset_database.sql`, `azzeraDatabase`, ripristini del database, e ogni azione
  irreversibile sui dati. (Commit, push e pubblicazione in anteprima e produzione non stanno
  qui: sono parte ordinaria di ogni consegna, vedi `CLAUDE.md`.)
- Cambi di formule/soglie normative senza aggiornare checklist e test.
- Rinomina della chiave permesso `'report'` (è il modulo Proposta).
- Modifiche che funzionano solo in cloud e rompono portable/server.

### Igiene documentale suggerita

- Questo documento come punto di ingresso; `CLAUDE.md` come regole operative;
  `CHANGELOG.md` come diario.
- Aggiungere in testa al CHANGELOG un **indice delle versioni** (o correggere
  l'intestazione e spostare 0.69/0.70 al loro posto) per eliminare l'ambiguità della
  versione corrente.
- Tenere aggiornata la lista delle decisioni aperte (§11) a ogni rilascio.

---

## 11. Decisioni aperte

1. **Versione corrente ufficiale**: 0.133.3 è la linea da dichiarare? Aggiornare
   l'intestazione del CHANGELOG e l'ordine delle voci.
2. **`tipo_spazio`**: confermare `NON_ENTE` e correggere `CLAUDE.md` (consigliato), oppure
   introdurre un alias `RED` a livello di sola UI.
3. **`/spazio/[codice]/report`**: implementare le cinque tipologie o rimuovere la voce.
4. **`giudicante`**: roadmap o campo da eliminare.
5. **Drizzle**: dichiararlo ufficialmente marginale (consigliato) o avviare una migrazione
   verso di esso.
6. **Sorgente DDL unica**: consolidare `provision.ts` + `ensureTables.ts`?
7. **Questo documento**: è una consegna di prodotto (bump versione) o documentazione
   interna (nessun bump)? La convenzione attuale non lo dice.

---

*Fine. Ogni affermazione non marcata come dedotta è stata verificata nei file citati; le
formule normative restano soggette alla checklist di validazione.*
