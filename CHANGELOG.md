# Changelog

Ogni consegna riporta qui il numero di versione e le modifiche incluse.
Per verificare quale versione è davvero online: guarda in fondo alla
pagina di login, oppure confronta questo file con quello nel repository al
commit che Vercel mostra come "Production".

**Due linee di versione, indipendenti** (per non confondere le due
situazioni):

- **Cloud** — la piattaforma SaaS servita da Vercel. Numerazione `0.x`
  (allineata a `version` in `package.json` e a `APP_VERSION`). Ultima
  release cloud: **0.105.0**. (I numeri 0.102–0.104 non sono stati riusati
  per il cloud: erano già comparsi su build portable consegnate, così
  nessun numero è mai condiviso tra le due linee.)
- **Portable** — l'edizione stand-alone da chiavetta USB. Contatore
  proprio (`Portable X.Y.Z`, mostrato con l'etichetta "Portable" nella
  barra di stato), che avanza solo per il lavoro portable e **non** tocca
  il numero cloud. Le voci qui sotto che nel passato erano numerate
  0.102–0.104 appartengono in realtà a questa linea e sono state
  ri-etichettate di conseguenza.

Versionamento libero (non segue semver in senso stretto): il primo numero
sale per cambi strutturali importanti, il secondo per funzionalità nuove,
il terzo per correzioni.

---

## 0.69.0 — 2026-08-05 (centoduesima consegna)

**Screening dell'Azienda — release di prova, dal disegno discusso alla prima versione testabile**

Nuovo, esclusivo degli spazi ENTE, a livello di Azienda (non di
Scenario) — prima che arrivi una proposta.

- **Direttrici dell'ente**: nuova sezione in Parametri di Spazio
  (visibile solo per ENTE) — testo libero, es. "Vigilanza documentale,
  Gestione del credito, Contenzioso amministrativo, Contenzioso
  giudiziario". Determina lungo quali aree lo Screening genera le
  domande.
- **Nuova scheda "Screening"** nella pagina di ciascuna Azienda (visibile
  solo per ENTE, accanto ad Anagrafica/XBRL/Indici/Operatori): carichi
  la visura camerale (PDF) — il bilancio XBRL lo riusa da quello già
  configurato nella scheda XBRL, nessun doppio caricamento.
- **Da un solo caricamento, due output**, entrambi generati dall'AI:
  - un **questionario Sì/No** organizzato per sezione (una per
    direttrice), con domande mirate a fatti verificabili nei sistemi
    interni dell'ente per quella specifica azienda — mai giudizi
    generici che un funzionario non potrebbe conoscere senza
    interazione diretta con l'azienda;
  - una **relazione di analisi preliminare**, in prosa, dal punto di
    vista dell'ente creditore — identikit dalla visura, posizione
    economico-patrimoniale dal bilancio, scenario liquidatorio come
    ancoraggio del test di convenienza, eventuali segnali di
    incoerenza, e cosa manca prima di poter valutare una proposta.
- Le risposte al questionario producono un **esito permanente
  sull'azienda** (Solido/Da rafforzare/Critico) — stesso motore di
  punteggio già in uso per la Check List, non un calcolo nuovo.
  Rigenerare lo screening (nuova visura) azzera le risposte precedenti,
  coerente con il fatto che un questionario diverso non deve ereditare
  risposte a domande che potrebbero non esistere più.

**Cosa manca ancora, dichiarato esplicitamente**: l'esito non è ancora
mostrato come etichetta ereditata nella Panoramica/Brogliaccio degli
Scenari (previsto, non incluso in questa prima release di prova) — e il
PDF scaricabile della relazione (oggi solo testo in pagina, coerente col
resto della piattaforma) resta il passo successivo, non affrontato qui.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — nuove rotte confermate esplicitamente nel bundle
(`/aziende/[aziendaId]/screening`, `/parametri/direttrici`).

## 0.70.1 — 2026-08-05 (centosesta consegna)

**Impossibile creare uno scenario in uno spazio ENTE — "Origine della proposta non valida"**

Il primo test reale dello Screening con documenti veri ha funzionato
(relazione e questionario generati correttamente) — il vero bug era
un passo indietro, nella creazione dello scenario stesso.

Quando avevo bloccato il Tipo Proposta a "Ricevuta" per gli spazi ENTE
(punto 8, qualche consegna fa), avevo aggiornato lo stato di default
del **tipo**, ma non quello dell'**origine** — che restava sempre
`'Studio'`, un valore mai valido per "Ricevuta" (le origini ammesse lì
sono solo Ente/Tribunale). Il menu a tendina *mostrava* "Ente" perché
il browser, quando il valore reale non corrisponde a nessuna opzione
disponibile nella lista, visualizza la prima — ma lo stato interno
restava ancora "Studio", ed era quello inviato al server alla
creazione. Corretto in entrambi i punti dove l'origine viene
inizializzata (all'apertura del form e dopo ogni creazione), coerente
con il tipo di spazio.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.107.0 — 2026-08-10 (centocinquantasettesima consegna)

**Cloud — la ricevibilità è solo dell'Ente: rimossa da tutto il percorso Redigente**

La ricevibilità di una proposta è un giudizio che spetta all'ente creditore
che la riceve (fissa lui le soglie e valuta): non ha senso nel percorso
Redigente, dove il professionista *predispone* la proposta. Compariva invece
per errore anche lì, con esiti fuorvianti (righe tutte "RICEVIBILE" verdi
quando in realtà non c'era alcuna soglia da verificare, e messaggi
auto-contraddittori tipo "Nessuna soglia configurata dalla soglia
Generale…"). Rimossa da tutto il contesto Redigente, lasciata intatta per
l'Ente.

- **Tabella Proposta (Redigente)**: eliminata la colonna "Esito", i badge
  Ricevibile/Non ricevibile per riga e il banner "Esito complessivo:
  PROPOSTA RICEVIBILE". La verifica di ricevibilità non viene più nemmeno
  chiamata quando lo scenario non è RICEVUTA.
- **PDF della proposta (Redigente)**: tolta la sezione "Verifica automatica
  di ricevibilità".
- **Relazione AI (Redigente)**: il prompt non parla più di ricevibilità.
  La Sintesi Esecutiva ragiona su sostenibilità e convenienza del piano; la
  sezione per categoria/rango presenta la STRUTTURA della proposta (quanto
  offerto), non un verdetto RICEVIBILE/NON RICEVIBILE. Il percorso Ricevente
  mantiene invariata la verifica di ricevibilità.
- **Pulizia**: rimosso un `console.error` diagnostico "temporaneo" rimasto
  in produzione nel ramo Ente di `verificaRicevibilitaProposta` (loggava a
  ogni verifica gli importi estratti).
- Invariato e intatto il lato Ente: `verificaRicevibilitaProposta` ramo
  ENTE, giudizio finale, Brogliaccio, confronto liquidatorio ricevente,
  "Limiti di ricevibilità" in Parametri di Spazio (che restano ENTE-only).
  Per il Redigente resta la "Percentuale media di proposta", che è un'altra
  cosa (il punto di partenza per una nuova riga).

## 0.106.0 — 2026-08-10 (centocinquantaseiesima consegna)

**Cloud — l'orizzonte dello storico XBRL a video diventa un parametro di spazio**

Il tetto di 5 anni introdotto nella 0.105.0 era una costante di sistema;
ora è un **parametro per-spazio con default di sistema**, coerente con gli
altri parametri di spazio già esistenti.

- **Default di sistema** (5 anni) in un unico punto — `src/lib/parametriPeriodi.ts`
  — con intervallo consentito 1–10. È il fallback quando lo spazio non
  imposta nulla.
- **Override per-spazio**: nuova riga unica in `parametri_visualizzazione`
  (schema del tenant, `anni_storico_max`, NULL = usa il default). Letto e
  scritto da `ottieniAnniStoricoMax` / `aggiornaAnniStoricoMaxAction` con lo
  stesso pattern idempotente degli altri parametri di spazio.
- **Nuova sezione "Storico XBRL a video"** in Parametri di Spazio (Admin di
  Spazio, non Operatore): imposta quanti anni mostrare, oppure spunta "Usa il
  default di sistema" per tornare al valore di sistema. Non tocca
  l'archivio: `xbrl_storico_azienda` continua a conservare tutti gli anni,
  qui si governa solo quanti visualizzarne.
- **Indici multi-periodo e Posizione Aggiornata** leggono ora questo valore
  per-spazio invece della costante; i testi di intestazione riflettono il
  valore impostato e rimandano ai Parametri di Spazio.
- Verificato: type-check e build puliti, 67/67 test, e round-trip del nuovo
  parametro su PGlite (set, update, reset a default, vincolo di riga unica).

## 0.105.0 — 2026-08-10 (centocinquantacinquesima consegna)

**Cloud — storia XBRL fino a 5 anni negli Indici e nella Posizione Aggiornata, e correzione del contatore XBRL nello Screening**

Tre interventi collegati sulla gestione dello storico XBRL. L'archivio
(`xbrl_storico_azienda`, una riga per anno) già teneva N annualità: l'anno
è letto dal file, non digitato, e ogni anno diverso è una riga a sé. Erano
due punti a valle a fermarsi a 2 anni, più un contatore sbagliato.

- **Indici multi-periodo fino a 5 anni.** L'azione `ottieniIndiciMultiPeriodo`
  prendeva solo le ultime due annualità archiviate; ora ne sviluppa fino a
  **5** (le più recenti) più la Posizione Aggiornata, con lo stesso motore
  di calcolo e lo stesso trend (già generalizzato a N punti). Tetto a 5
  deliberato: oltre, la tabella diventa illeggibile a video. La UI degli
  Indici era già dinamica sul numero di periodi; aggiunto solo il ritorno a
  capo delle serie per gestire più colonne.
- **Posizione Aggiornata con tutti gli anni acquisiti (max 5).** Il prospetto
  mostrava due sole colonne di riferimento (penultimo + ultimo anno);
  adesso ne mostra fino a **5**, così si compila l'anno in corso avendo
  davanti l'intera storia disponibile. Export/import Excel adeguati: la
  colonna compilabile è sempre l'ultima e in import viene individuata per
  intestazione ("Posizione Aggiornata"), non più per indice fisso — così il
  numero di colonne di riferimento può variare senza rompere la rilettura
  (retro-compatibile col vecchio formato a 2 colonne, verificato).
- **Bug del contatore XBRL nello Screening.** Il badge "N caricato/i"
  incrementava di 1 a ogni upload (`prev + 1`), divergendo dal numero reale
  di annualità archiviate: ricaricare lo stesso anno lo faceva salire senza
  che nascesse una riga nuova (`DO UPDATE`), e un file nuovo che inserisce
  due righe (corrente + comparativo) lo faceva salire di 1 solo. Ora dopo
  ogni upload il contatore si riallinea alle annualità distinte effettive
  (`storico.length`).

## Portable 1.0.0 — 2026-08-09 (già numerata 0.104.0)

**Prima release completa dell'edizione portable — demo pre-caricata: la stessa azienda vista dai due lati**

_Da questa consegna la portable ha una numerazione propria, separata dal
cloud: questa build (due spazi + demo) è la 1.0.0. La versione cloud resta
ferma a 0.101.0._

Al primo avvio, oltre ai due spazi, l'edizione portable ora semina un caso
completo e già navigabile, così il pacchetto racconta il flusso end-to-end
senza dover inserire nulla a mano. La stessa azienda (**Meccanica Lombarda
S.r.l.**, manifatturiero) compare su entrambi i lati.

- **Lato Redigente**: l'azienda con uno scenario `DA_DEFINIRE` ("Piano di
  risanamento") e la proposta ai creditori già compilata (Banca ipotecaria,
  INPS, Erario, Fornitori — con importi, percentuali, modalità e rango
  legale).
- **Lato Ricevente (ENTE = INPS)**: la stessa azienda con l'intera "parte
  ente" alimentata —
  - **Anagrafica Ente** con etichette da ente previdenziale (Matricola INPS,
    Gestione Separata, CSC, CA, Sede) e i relativi valori;
  - **Posizione debitoria dell'ente**: quattro voci che coprono tutte le
    nature CLE/CEN/CEC/CEA, per un totale di 120.000 € — coerente con il
    "dovuto" INPS della proposta;
  - **Limite di ricevibilità** per l'INPS (valore di liquidazione stimato
    30.000 €): l'offerta ricevuta (40% di 120.000 = 48.000 €) lo supera, così
    la demo "torna" anche nel test di convenienza;
  - uno scenario `RICEVUTA` ("Proposta ricevuta") con la proposta e la riga
    INPS già segnata come **rilevante per l'ente**.
- **Idempotente e non bloccante**: la semina avviene solo su database nuovo
  e non si ripete ai riavvii; un eventuale errore viene loggato ma non
  impedisce l'avvio. Disattivabile con `PORTABLE_SEED_DEMO=0` in `config.bat`.
- Verificato end-to-end su Linux: primo avvio → entrambi gli spazi + demo
  seminata (HTTP 200), dati riletti dal DB cifrato e confermati riga per riga.

## Portable 0.2.0 — 2026-08-09 (già numerata 0.103.0)

**Portable — due spazi fissi (Redigente + Ricevente) per una distribuzione "chiavi in mano"**

Perché l'edizione portable sia davvero utile a mostrare l'applicativo, al
primo avvio ora crea DUE spazi di lavoro sulla stessa istanza locale invece
di uno solo: è lo stesso caso reale visto dai due lati — la stessa azienda
che da una parte è quella valutata, dall'altra è quella che predispone la
proposta.

- **Due spazi fissi**: un **Redigente** (NON_ENTE, chi predispone la
  proposta) e un **Ricevente** (ENTE, l'ente creditore che la valuta),
  ciascuno con il proprio schema tenant, la propria licenza tecnica LOCALE
  e il proprio Admin di Spazio.
- **Due login separati**, come nel cloud: si accede con l'uno o con l'altro
  e si esce/rientra per cambiare lato — nessun ruolo supervisore, nessun
  pannello di gestione multi-spazio. Le due email di accesso devono essere
  distinte (vincolo di unicità globale su `admin_spazio_index.email`); il
  bootstrap lo verifica e si ferma con un messaggio chiaro se coincidono.
- **`config.bat` con due set di credenziali** (`PORTABLE_RED_*` e
  `PORTABLE_ENTE_*`); default `redigente@locale` / `ricevente@locale`.
  Rimosso il segnaposto `SUPERADMIN_PASSWORD`: non serviva (il messaggio
  compare solo a un tentativo di login `superadmin`, mai all'avvio).
- **Bootstrap idempotente per codice**: ogni spazio si crea solo se non
  esiste già, così un riavvio non duplica nulla. Verificato end-to-end su
  Linux — primo avvio crea entrambi gli spazi (HTTP 200), secondo avvio sul
  DB esistente non ricrea nulla e non produce errori.

## Portable 0.1.1 — 2026-08-09 (già numerata 0.102.1)

**Portable — correzioni dal primo collaudo su Windows**

- **Bug: `relation "sessioni" does not exist`.** Il bootstrap portable
  creava spazi, licenze e Admin ma non la tabella globale `sessioni`, così
  ogni pagina che verifica la sessione andava in errore. Ora le tabelle
  globali di sistema (`sessioni`, `spazi`/licenze, indici email→schema)
  sono garantite a OGNI avvio, idempotenti: un DB già creato senza
  `sessioni` si auto-ripara senza perdere i dati. Verificato avviando la
  build nuova su un database preesistente privo della tabella.
- **Launcher: apertura del browser compatibile con Windows PowerShell 5.1.**
  L'attesa "apri quando il server è pronto" usava `try/catch` in un
  contesto di espressione (`until(...)`), non valido in PS 5.1: il browser
  non si apriva. Riscritta con `try/catch` come istruzioni dentro un
  `while`. La passphrase ora si digita in nascosto.
- **Silenziato il messaggio `SUPERADMIN_PASSWORD non configurata`** (feature
  non usata in locale) impostando un valore segnaposto in `config.bat`.
- **Cross-OS**: immagini non ottimizzate in portable (`images.unoptimized`)
  per eliminare la dipendenza dai binari nativi di `sharp`; il pacchetto
  costruito su un OS gira su un altro.

## Portable 0.1.0 — 2026-08-09 (già numerata 0.102.0)

**Fondamenta dell'edizione PORTABLE — l'app gira da chiavetta USB, senza installazione, con database embedded e cifrato**

Primo blocco (verificato end-to-end su Linux) di una edizione che parte
da chiavetta senza installare nulla. Stesso codebase: tutto è attivato
dal flag `PORTABLE=1`, il percorso cloud non è toccato.

- **Database embedded (PGlite, Postgres in WASM), cifrato a riposo.** Al
  posto del Postgres remoto, un unico PGlite in-process (`src/lib/portableDb.ts`).
  Il database vive in un solo file cifrato con AES-256-GCM (chiave da
  passphrase via scrypt, `src/lib/portableCrypto.ts`); in chiaro solo in
  RAM. Autosave cifrato periodico e alla chiusura, scrittura atomica.
  L'adapter espone un `pool` compatibile con `pg` (`.query`/`.connect`,
  BEGIN/COMMIT) e un'istanza Drizzle: le ~230 query e il codice di
  provisioning esistente girano invariati. `src/lib/db.ts` e
  `src/db/client.ts` scelgono cloud o portable dal flag.
- **Storage file locale.** `src/lib/blobStore.ts` sostituisce Vercel Blob
  con il filesystem locale mantenendo le firme `put/get/del`; i 4 punti
  che le usavano ora importano da qui. Come nel cloud, i file caricati
  sono temporanei.
- **Primo avvio "chiavi in mano".** Un hook di avvio (`src/instrumentation.ts`)
  inizializza il DB; se vuoto, `src/lib/portableBootstrap.ts` crea — con
  le stesse funzioni di provisioning del cloud — un unico spazio + Admin
  (tipo spazio, credenziali e nome da `config.bat`), saltando la parte
  SaaS (superadmin, licenze, multi-spazio).
- **Pacchetto Windows raw.** `npm run build:portable` produce una cartella
  `portable-dist/` (Next standalone) con launcher `Avvia-CCII.bat`,
  `config.bat`, `README-PORTABLE.txt`; basta aggiungere `node.exe`. PGlite
  è tenuto esterno al bundle (`serverExternalPackages`) perché risolve da
  sé i propri asset WASM.
- **Validazione end-to-end (Linux).** Boot dello standalone → init PGlite
  cifrato → provisioning reale dell'app (25 tabelle tenant create) →
  spazio, indice di login e Admin persistiti → home HTTP 200,
  `/superadmin` reindirizza (auth ok) → DB decifrato e riletto. Type-check,
  lint, 67 test verdi.

**Ambito e limiti dichiarati.** L'AI e i dati di settore restano online
(portable-online, non offline). Edizione mono-spazio/mono-utente. Il
collaudo su Windows e l'aggiunta del `node.exe` vanno completati sulla
macchina di destinazione; il bundle Windows non è stato eseguito qui
(ambiente Linux).

## 0.101.0 — 2026-08-08 (centocinquantesima consegna)

**Punto 7 — la Simulazione (e la Relazione) ora dicono COSA cambiare, non solo se il piano regge — completata la lista Redigente**

Fino a ieri la Simulazione Redigente dava un verdetto statico: viabile o
no (DSCR ≥ 1). Ora, quando il piano non regge, indica esplicitamente
quali leve muovere e verso quale valore per riportare il DSCR a 1.

- **Motore di raccomandazioni deterministico** (`raccomandazioniRedigente.ts`,
  6 test unitari, 67 in totale) — non stime "morbide" ma l'inversione
  delle stesse formule di `calcoloRedigente.ts`. Per ciascuna leva
  calcola il valore-obiettivo tenendo ferme le altre: allungare la
  dilazione (a N mesi), ridurre il debito oggetto di proposta (a € X, più
  stralcio), ridurre i giorni di incasso, allungare i giorni di
  pagamento, tagliare i costi operativi (al netto dell'effetto fiscale).
  Ogni leva sa dire anche quando "da sola non basta" (es. la dilazione
  non aiuta se il flusso a regime è ≤ 0), così non suggerisce mai
  correzioni impossibili.
- **In pagina, dal vivo**: nella Simulazione compare un riquadro "Come
  rendere il piano sostenibile" con lo scoperto annuo da colmare e le
  leve (valore attuale → obiettivo), ricalcolato a ogni movimento di
  slider come il resto della simulazione. Se il piano già regge, un
  riquadro verde lo conferma.
- **Nella Relazione**: la sezione "Raccomandazioni operative" riceve ora
  queste leve calcolate (parametro attuale → obiettivo) e le riporta
  esplicitamente, invece di limitarsi a un giudizio. Le cifre sono
  passate già calcolate al modello, che deve riportarle fedelmente senza
  inventarne di diverse.
- **Riuso pulito**: `ottieniInputRedigente` ora espone anche l'`input`
  completo passato al motore, così UI e Relazione non lo rimontano da
  leve + fotografia. L'aggancio nella Relazione usa un import dinamico
  per non creare un ciclo con `simulazioneRedigente`.

**Con questa consegna la lista dei 7 punti del percorso Redigente è
completa** (parametri di spazio, direttrici, Check List Ministeriale,
stepper riordinato, documenti di corredo, Brogliaccio, raccomandazioni),
più i due pezzi pronti ora agganciati (Test pratico ed eredità della
Check List).

Verificato: type-check (entrambi i controlli), lint, 67 test, build
completa.

## 0.100.0 — 2026-08-08 (centoquarantanovesima consegna)

**Punto 5 — i documenti di corredo alla proposta, scritti per intero dall'AI**

Nel percorso Redigente, nel passo Proposta, compaiono tre documenti di
corredo che l'assistente redige come bozze complete (come la Relazione),
poi liberamente modificabili a mano e stampabili/salvabili in PDF:

- **Asseverazione del professionista** (sempre pertinente) — veridicità
  dei dati e coerenza/sostenibilità del piano.
- **Lettera di convocazione dei creditori** (eventuale) — invito ad
  avviare le trattative nella composizione negoziata.
- **Memoria legale a supporto** (eventuale) — convenienza rispetto alla
  liquidazione e ragionevole perseguibilità del risanamento.

Dettagli:

- **Bozze fondate sul quadro reale, mai inventato**: ogni documento
  riceve la proposta ai creditori, la sintesi del Brogliaccio, il test
  pratico e il confronto liquidatorio già raccolti per lo scenario. Dove
  un dato manca (date, nome dell'esperto, tribunale…) l'assistente
  lascia un segnaposto tra parentesi quadre invece di riempirlo a caso —
  e un banner in cima dice chiaramente che sono bozze da rivedere,
  completare e firmare.
- **Editabili e versionate nel piccolo**: dopo la generazione il testo è
  un'area modificabile; salvando a mano si aggiorna `aggiornato_il` senza
  toccare `generato_il`, così l'interfaccia distingue "modificato dopo la
  generazione". Nuova tabella `documenti_corredo` (una riga per scenario
  e tipo). Solo Redigente — per una proposta ricevuta non si redige
  nulla, si valuta soltanto.
- **La Relazione ora usa il confronto liquidatorio anche per il
  Redigente**: da quando il Brogliaccio Redigente esiste e ricerca quel
  confronto (0.99.0), la Relazione lo legge già pronto come per il
  Ricevente — prima per il Redigente veniva dichiarato "non applicabile".

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.99.0 — 2026-08-08 (centoquarantottesima consegna)

**Punto 6 — il Brogliaccio Redigente esiste davvero, non è più un placeholder**

Fino a ieri, nel percorso Redigente il Brogliaccio era una pagina "in
costruzione". Ora è una sintesi vera, con dentro il confronto con lo
scenario liquidatorio richiesto fin dall'inizio.

- **Sintesi unica, non i 3 livelli con varchi del Ricevente** — quel
  disegno serve a chi *valuta* una proposta ricevuta; chi *redige*
  ha bisogno di un riepilogo ordinato di tutto quanto acquisito, come
  trampolino per scrivere la Proposta (che nel percorso Redigente viene
  dopo, non prima). Il Brogliaccio raccoglie, in un colpo d'occhio:
  anagrafica dell'azienda, ultimo bilancio XBRL e indici CCII, posizione
  aggiornata, esito della Check List Ministeriale, fascia del Test
  pratico (con rapporto A/B e totali), crescita a confronto col settore,
  e la sostenibilità della Simulazione (flusso disponibile, rata, DSCR,
  viabilità). Nessun dato nuovo: solo aggregazione di ciò che c'è già.
- **Confronto con lo scenario liquidatorio, adattato al Redigente** — lo
  stesso meccanismo del Ricevente (`confrontoLiquidatorio.ts`, ricerca
  web reale, "parcheggiata" per la Relazione, freschezza 24h), ma dal
  punto di vista di chi redige verso *tutti* i creditori: il termine di
  paragone non è il saldo verso un singolo ente e i suoi limiti (che per
  il Redigente non esistono), ma la massa debitoria complessiva dai
  bilanci e i tassi di recupero medi di settore, come pavimento minimo
  ex artt. 63/88 CCII. Parte in automatico a ogni generazione del
  Brogliaccio, silenziosa e mai bloccante — se fallisce, il Brogliaccio
  si vede comunque.
- **Riuso pulito, nessun raddoppio di schema**: la sintesi Redigente
  scrive nella stessa tabella `brogliaccio` (campo `livello1_testo`),
  così lettura (`ottieniBrogliaccio`) e stampa restano una sola
  implementazione condivisa con il Ricevente.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.98.0 — 2026-08-08 (centoquarantasettesima consegna)

**Agganciati all'interfaccia due pezzi già pronti ma mai chiamati — Test pratico e eredità della Check List**

Due funzionalità esistevano già nel codice, verificate ma scollegate:
questa consegna le porta finalmente in mano all'utente, senza
inventare nulla di nuovo sul piano del calcolo.

- **Test pratico (Sezione I) agganciato alla Check List Ministeriale
  (Sezione II)** — il motore `src/lib/testPratico/calcolo.ts` (art. 13,
  comma 2 CCII, costruito a suo tempo dal testo ufficiale, 5 test
  unitari) non aveva ancora un'interfaccia. Ora, per il Redigente,
  nella scheda Check List dell'Azienda compare sopra la Check List
  Ministeriale — nell'ordine del documento ufficiale, dove la Sezione I
  precede e inquadra la Sezione II. Il professionista inserisce le voci
  del debito da ristrutturare [A] e dei flussi annui a regime [B]; il
  rapporto A/B, la fascia di gravità (le quattro fasce più il caso di
  disequilibrio a regime) e il punto successivo della Sezione I si
  aggiornano dal vivo mentre digita.
  - **Calcolo sempre coerente con gli input**: la fascia e il rapporto
    non sono persistiti — solo le voci inserite lo sono (nuova tabella
    `azienda_test_pratico`, una riga per azienda). Il risultato è
    ricalcolato dalla stessa funzione pura dei test, così non può mai
    andare fuori sincrono con i numeri.
  - Salvataggio con debounce (nessuna scrittura ad ogni tasto), il
    segno +/− di ogni voce è mostrato accanto al campo perché sia
    chiaro come entra nel totale.
- **Eredità della Check List Azienda → Scenario, ora davvero
  automatica** — `ereditaChecklistMinisterialeInScenarioAction`
  esisteva già ma non la chiamava nessuno. Ora, alla creazione di un
  nuovo Scenario in uno spazio Redigente, le risposte già date a
  livello Azienda (a mano o dallo Screening) vengono copiate nella
  Check List del nuovo scenario — non si riparte più da zero. Se
  l'eredità fallisce, lo scenario si crea comunque (la Check List si
  compila da capo): non deve mai bloccare la creazione.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.97.1 — 2026-08-08 (centoquarantaseiesima consegna)

**Bug serio trovato: un'email admin poteva "rubare" lo spazio di un'altra — più il testo Screening rimasto ENTE-centrico**

- **La causa dell'admin sparito**: l'indice globale che instrada il
  login (`admin_spazio_index`) ha l'email come chiave unica su tutta
  la piattaforma — ma la creazione di un nuovo Admin di Spazio
  sovrascriveva quell'indice senza controllo (`ON CONFLICT DO
  UPDATE`), se la stessa email era già usata come Admin altrove.
  Risultato osservato: creare un Admin del Redigente con la stessa
  email dell'Admin del Ricevente ha fatto sparire quest'ultimo dal
  login — il suo account esisteva ancora intatto nel proprio schema,
  semplicemente l'indice ora puntava al nuovo spazio.
  - **Prevenzione**: `creaSpazioAction` ora blocca la creazione,
    prima di scrivere qualunque cosa, se l'email è già Admin di un
    altro spazio — errore chiaro con il nome dello spazio in
    conflitto, non più un furto silenzioso.
  - **Recupero per chi è già successo**: nuovo strumento in
    Manutenzione Spazi (superadmin) — cerca un'email, mostra in quali
    spazi esiste ancora l'account (l'auto-riparazione esistente nel
    login trovava solo il primo, non tutti), e fa scegliere
    esplicitamente a quale spazio far puntare di nuovo il login,
    senza toccare la password.
- **Screening — testo ancora ENTE-centrico**: il paragrafo
  introduttivo (mai condizionato) parlava sempre di "direttrici di
  questo ente" anche per il Redigente, con un secondo box sotto che
  provava a correggere il tiro — ridondante e confuso. Unificato in un
  solo paragrafo, condizionato per tipo di spazio fin dall'inizio.

**Sul messaggio "le direttrici di questo ente non sono ancora
impostate" visto per uno spazio Redigente**: nella versione attuale
questo non dovrebbe più comparire (lo Screening per il Redigente non
passa più da quella funzione) — se lo vedi ancora, verifica di aver
davvero caricato l'ultimo zip su Vercel.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.97.0 — 2026-08-08 (centoquarantacinquesima consegna)

**Punto 4 — Proposta diventa il penultimo passo dello Scenario Redigente**

- Riordinato `PASSI_SCENARIO_DA_DEFINIRE`: Import XBRL → Posizione
  Aggiornata → Indici → Check List → Dati di Settore → Simulazione →
  Brogliaccio → **Proposta** → Relazione AI. Prima era il primo passo,
  ora è il penultimo — si scrive avendo già in mano tutto il resto,
  non prima di vederlo.
- Descrizione del passo Proposta riscritta di conseguenza, e
  quella del Brogliaccio aggiornata (ora è anche "il punto di partenza
  per la proposta", non solo per la relazione).
- Verificato che nessun altro punto del codice assumesse un ordine
  fisso dei passi — la Panoramica dello Scenario legge lo stepper
  dinamicamente, nessuna modifica necessaria lì.

**Nota per chi prova questa versione**: il Brogliaccio per il
Redigente resta ancora un placeholder (punto 6 della lista, da
costruire) — arrivandoci nel nuovo ordine si trova "in costruzione"
prima di raggiungere una Proposta che invece funziona già.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.96.0 — 2026-08-08 (centoquarantaquattresima consegna)

**Pre-compilazione AI della Check List Ministeriale dallo Screening — completa il punto 1 del Redigente**

Per il Redigente, lo Screening non genera più un questionario libero
(quello resta esclusivo del Ricevente) — legge bilancio XBRL e
fascicolo storico e prova a rispondere alle 56 domande fisse della
Check List Ministeriale, ma solo dove i dati lo dimostrano con
certezza:

- **Nuova azione** `generaPreCompilazioneMinisterialeAction` — stesso
  documento e stessi dati di bilancio già usati per il Ricevente, ma
  il prompt è tassativo sul limite: per ogni domanda, o il dato è
  letteralmente presente e verificabile, o la domanda resta senza
  risposta — "non rispondere" è la risposta corretta quando il dato
  non c'è, non un fallimento da correggere.
- Le risposte compilate portano un badge "Compilata dallo Screening"
  nella Check List (già costruito nella consegna precedente), così
  resta sempre visibile cosa ha deciso l'AI e cosa ha inserito la
  persona.
- Ripetere l'operazione aggiorna solo le domande già compilate dallo
  Screening — quelle risposte a mano restano intatte, mai
  sovrascritte silenziosamente.

Con questa, il punto 1 della lista Redigente è completo.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.95.0 — 2026-08-08 (centoquarantatreesima consegna)

**Screening e Check List Ministeriale raggiungibili anche dal Redigente — checkpoint intermedio**

- **Posizione Ente** resta l'unica scheda esclusiva di Azienda per
  spazi Ente — Screening e Check List ora compaiono per entrambi i
  tipi di spazio (erano condizionati insieme, senza motivo per
  restarci uniti).
- **Nuova Check List Ministeriale a livello Azienda** (solo Redigente)
  — le 56 domande fisse del decreto ministeriale, organizzate per
  sezione come nel testo ufficiale, con lo stesso motore di calcolo
  già usato per gli scenari. Nuova tabella dedicata
  (`azienda_checklist_ministeriale_risposte`), separata da quella
  legata allo scenario: le risposte date qui potranno essere
  ereditate da ogni nuovo Scenario di quell'azienda, invece di
  ripartire da zero (funzione di eredità già scritta e pronta,
  `ereditaChecklistMinisterialeInScenarioAction` — non ancora
  agganciata alla creazione di un nuovo scenario, prossimo passo).
- **Checkpoint dichiarato, non finto completo**: per ora lo Screening
  per il Redigente genera ancora lo stesso questionario libero del
  Ricevente — un banner onesto lo dice chiaramente in pagina. La
  pre-compilazione automatica della Check List Ministeriale dai dati
  dello Screening (solo dove i dati lo consentono con certezza, mai
  per invenzione) resta da costruire.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.94.1 — 2026-08-08 (centoquarantaduesima consegna)

**Prosegue il percorso Redigente — occultamenti parametri e ripulitura di un lavoro duplicato**

- **Anagrafica Ente e Tipo Debito** nel menu Parametri di Spazio ora
  compaiono solo per spazi Ente — erano rimasti senza condizione fin
  dalla loro creazione (segnalato tempo fa come pendente, corretto
  ora).
- **Check List parametri semplificata**: non più una scelta tra due
  schede — per ogni tipo di spazio c'è ormai una sola Check List
  sensata (Ministeriale per il Redigente, pesi da direttrici per il
  Ricevente). La vecchia "Customizzata" resta raggiungibile solo da un
  link diretto a un modello già esistente, non più come opzione dal
  menu.
- **Trovato e ripulito un lavoro duplicato**: durante la ricostruzione
  del contesto dopo un'interruzione, ho ricostruito da zero la
  "percentuale media di proposta" — una funzionalità che un tentativo
  precedente aveva già implementato, meglio (tabella dedicata invece
  di riusare `limiti_ricevibilita` con una sentinella, componente a sé
  già montato correttamente nella pagina Ricevibilità). Rimosso il mio
  duplicato, mantenuta la versione già esistente.
- **La parte davvero mancante**: il pre-riempimento della riga nuova
  in Proposta con la percentuale media configurata (l'esempio "proposta
  media 30%, modifico solo la riga INPS al 100%") non c'era ancora — 
  aggiunta ora in `PropostaScenario.tsx`, senza toccare un form che
  l'utente ha già iniziato a compilare.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.94.0 — 2026-08-07 (centoquarantunesima consegna)

**Inizia il percorso Redigente — primo mattone: il Test Pratico ministeriale, fedele alla fonte ufficiale**

Comincia un progetto molto più ampio (parametri di spazio dedicati,
Screening che pre-compila la Check List Ministeriale, documenti di
corredo alla proposta redatti dall'AI, Brogliaccio Redigente da
costruire davvero, Relazione con raccomandazioni sui parametri da
modificare) — questa consegna è solo il primo pezzo, verificato da
solo prima di proseguire.

- **Motore di calcolo del Test Pratico** (art. 13, comma 2 CCII) —
  costruito leggendo il testo ufficiale (Sezione I del documento guida
  ministeriale, Decreto dirigenziale 23 aprile 2026, Bollettino
  Ufficiale n. 10/2026, recuperato direttamente dalla piattaforma
  ufficiale delle Camere di Commercio), non da un riassunto o
  un'approssimazione. Rapporto tra debito da ristrutturare [A] e
  flussi annui a regime [B], voce per voce come da testo ufficiale,
  con le quattro fasce di gravità e le soglie esatte (2, 3, 6) — più
  il caso di disequilibrio a regime, dove il rapporto stesso non è
  applicabile.
- 5 nuovi test unitari (61 in totale, prima 56) verificano ogni
  fascia di soglia e i casi limite (MOL negativo nel primo anno,
  disequilibrio a regime).

**Ancora tutto da fare**: parametri di spazio per Redigente
(percentuale media di proposta al posto della soglia di ricevibilità,
occultamento Anagrafica Ente e Direttrici), Screening esteso a
NON_ENTE con pre-compilazione della Check List Ministeriale,
riordino dello stepper Scenario (Proposta come ultimo passo),
documenti di corredo redatti dall'AI, Brogliaccio Redigente (oggi
ancora un placeholder), agganciare il Test Pratico appena costruito
all'interfaccia e ai parametri, Relazione con raccomandazioni.

Verificato: type-check (entrambi i controlli), lint, 61 test, build
completa.

## 0.93.0 — 2026-08-07 (centoquarantesima consegna)

**Restyling grafico — la stessa identità del logo, finalmente estesa a tutta l'app**

Il brief era aperto ("colore, innovazione, dinamismo"), governo delle
operazioni lasciato a me. Trovato che l'identità di marca ("misuriamo
il battito del tuo business", logo con tracciato ECG) esisteva già,
ben fatta, ma quasi ignorata nel resto dell'app — che girava sui
colori generici di Tailwind. Non ho inventato un nuovo brand: ho
esteso quello che c'era già.

- **Palette**: le scale colore che l'app usa letteralmente ovunque
  (`slate`, `blue`, `emerald`, `amber`, `red`, `purple` — centinaia di
  classi già scritte in tutti i componenti) sono state ridefinite alla
  radice nella configurazione Tailwind, costruite in OKLCH per
  uniformità percettiva e armonizzate sullo stesso hue dei 4 colori di
  marca esistenti (Blu Analisi, Blu Notte, Corallo Impulso, Grigio
  Carta). Risultato: ogni `bg-blue-600` o `text-slate-500` già
  scritto eredita la nuova identità senza aver toccato i singoli file
  — a rischio quasi zero, nessuna riga di logica cambiata.
- **Tipografia**: tre ruoli distinti — Space Grotesk per i titoli
  (carattere tecnico, da strumento di precisione), IBM Plex Sans per
  il corpo (più personalità di Inter, resta leggibile nelle tabelle
  dense), IBM Plex Mono per le cifre (importi e percentuali allineati
  in colonna, non "ballano" più a seconda delle cifre).
- **Firma**: il tracciato ECG del logo diventa un vero componente di
  caricamento riutilizzabile (`CaricamentoBattito`) — trovato per
  strada che il vecchio skeleton di caricamento era codice morto, mai
  importato da nessuna parte, con colori che non esistevano nemmeno
  (`bg-muted`, `border-border` mai definiti in questo progetto).
  Ricostruito con colori reali.
- **Login reale riscattato**: `src/app/page.tsx` (non il file
  `LoginPage.tsx`, mai usato) — stessa identica logica, aspetto
  completamente nuovo: il logo finalmente presente, sfondo con un
  filo di tracciato ECG come unico elemento di rischio estetico,
  resto della pagina disciplinato.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — inclusi i font Google Fonts scaricati correttamente in
fase di build.

## 0.92.0 — 2026-08-07 (centotrentanovesima consegna)

**Sblocco tracciato per l'Admin di Spazio — la sola lettura permanente non è più un vicolo cieco**

Il blocco dopo la generazione della Relazione (percorso Ricevente)
resta il comportamento di default, ma non è più senza via d'uscita —
con un design pensato per non perdere mai nulla:

- **Ogni generazione della Relazione è ora una versione salvata a sé**
  (nuova tabella `relazione_generazioni`), mai sovrascritta — prima il
  testo non veniva conservato da nessuna parte, esisteva solo nella
  risposta mostrata in quel momento. Una "Cronologia versioni" nella
  pagina Relazione le rende tutte consultabili e stampabili, non solo
  l'ultima.
- **Sblocco solo per l'Admin di Spazio**, mai un Operatore — sempre
  con un motivo dichiarato obbligatorio, mai facoltativo. Ogni sblocco
  è tracciato in una nuova tabella (`scenario_sblocchi`): chi, quando,
  perché. Una "Cronologia sblocchi" li rende tutti visibili a chiunque
  riguardi lo scenario più avanti.
- **Banner aggiornato**: quando bloccato, il messaggio ora menziona la
  possibilità di sblocco; quando sbloccato (in attesa di rigenerazione),
  un banner distinto mostra motivo, chi, e quando — non torna
  silenziosamente come se nulla fosse successo.
- Aggiunta l'email dell'utente al contesto di accesso spazio (prima
  non esposta), necessaria per registrare chi ha sbloccato.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.91.0 — 2026-08-07 (centotrentottesima consegna)

**Ricerca web reale per il confronto liquidatorio — parcheggiata dal Brogliaccio, letta dalla Relazione**

Confermata la scelta: ricerca web vera, non solo ragionamento sui dati
già in piattaforma. Ma con un parametro aggiunto in corsa: non cercata
in diretta al lancio della Relazione (troppo lenta lì, l'utente
aspetterebbe la ricerca mentre guarda lo schermo) — generata
silenziosamente a ogni chiusura di un livello del Brogliaccio
Ricevente (l'unico che oggi esiste per davvero — per il Redigente,
dove il Brogliaccio è ancora un placeholder, questa sezione non si
applica), poi parcheggiata: la Relazione la legge già pronta.

- **Nuova tabella** `confronto_liquidatorio` — un record per scenario,
  con il testo generato, la data, ed eventuali errori (mai un
  fallimento silenzioso: se la ricerca non riesce, resta traccia).
- **Nuova azione** `generaConfrontoLiquidatorioSeNecessarioAction` —
  usa lo strumento di ricerca web Anthropic (fino a 5 ricerche) per
  trovare tassi di recupero tipici del settore ATECO dell'azienda e i
  criteri legali correnti per il test di convenienza ex artt. 63/88
  CCII. Protetta da una finestra di freschezza (24 ore): il Brogliaccio
  ha 3 livelli, non rifà la ricerca 3 volte se generati in sequenza
  ravvicinata. Mai bloccante — un fallimento qui non deve mai impedire
  di vedere il Brogliaccio appena generato.
- **Relazione riscritta di conseguenza**: non ha più lo strumento di
  ricerca web — legge il testo già parcheggiato e lo riporta nella
  sezione "2bis. Confronto con lo scenario liquidatorio", integrandolo
  nel tono della relazione senza riscriverlo da zero. Se non ancora
  disponibile, lo dichiara esplicitamente invece di inventare un
  confronto.
- **`maxDuration` spostato di conseguenza**: 120s sulla pagina
  Relazione (non più ricerca web lì, il margine di prima era
  eccessivo), 180s sulla pagina Brogliaccio (dove ora avviene davvero
  la ricerca, silenziosa mentre l'utente genera un livello).
- Pannello informativo nel Brogliaccio: mostra se il confronto è
  pronto, in errore, o non ancora generato — visibile prima ancora di
  arrivare alla Relazione.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.90.0 — 2026-08-07 (centotrentasettesima consegna)

**Trovata la causa vera — un errore di design, non un bug tecnico**

Il messaggio di fallimento questa volta era specifico e chiaro:
il documento della proposta di cram down riporta l'importo del debito
verso l'ente, ma non la percentuale offerta — quella compare in un
documento diverso (piano di sviluppo o relazione). L'estrazione
leggeva **solo** il documento della proposta, per una scelta di design
mia — corretta in astratto, sbagliata nella pratica: i documenti reali
spesso separano l'importo del debito (nella proposta formale) dalla
percentuale offerta (nel piano di sviluppo).

- **Corretto**: l'estrazione ora legge tutti i documenti caricati
  insieme (proposta di cram down, e asseverazione/piano di sviluppo se
  presenti), non solo quello formale — con un'istruzione esplicita a
  non concludere che il dato manca senza aver guardato tutti i
  documenti insieme.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.89.1 — 2026-08-07 (centotrentaseiesima consegna)

**Trovato con il debug in pagina — un fallimento di parsing silenzioso, diverso dal caso già visto**

Il secondo JSON di debug mostrava un messaggio diverso dal primo:
"Carica ed analizza..." invece della motivazione dettagliata dell'AI
vista in precedenza. Questo corrisponde a un ramo diverso del codice —
non "l'AI non ha trovato un importo per questo ente" (un esito
legittimo), ma "il parsing della risposta di estrazione è fallito del
tutto", un errore tecnico mai stato mostrato all'utente, solo
registrato nei log.

- **Causa probabile**: il budget di token per l'estrazione (1024) era
  rimasto invariato mentre il prompt è cresciuto (alias, istruzioni
  rinforzate sulla polarità tematica) — una spiegazione lunga del
  motivo del fallimento può troncare il JSON a metà. Portato a 2000.
- **Corretto anche il sintomo**, non solo la causa: quando il parsing
  fallisce, l'importo si salva come 0 (non più null) — un null faceva
  scattare il messaggio generico "carica e analizza", fuorviante
  quando l'analisi in realtà era stata fatta. Ora scatta il messaggio
  con una spiegazione specifica del problema tecnico.

**Non garantito al 100%** — se il budget di token non era la causa
vera, il prossimo tentativo fallito mostrerà comunque un messaggio
specifico invece del generico fuorviante, il che da solo aiuterà a
capire cosa sta succedendo davvero.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.89.0 — 2026-08-07 (centotrentacinquesima consegna)

**Confronto esplicito con la soglia, e un altro bug collegato trovato**

- **Soglia mostrata esplicitamente**: il pannello "Confronto" mostrava
  offerto, saldo dichiarato dall'ente ed esito — ma la soglia
  configurata restava nascosta dentro il testo della motivazione, mai
  un numero a sé. Aggiunto un quarto riquadro con il valore vero e
  proprio (valore di liquidazione stimato, o percentuale minima).
- **Bug trovato per strada**: la chiamata che recupera quella soglia
  non passava `tipoSpazio` — per gli spazi Ente prendeva le categorie
  generiche multiple invece della singola soglia dell'ente configurata
  apposta. Corretto.
- **Messaggio più preciso quando l'estrazione fallisce**: prima
  diceva sempre "carica e analizza", anche quando l'analisi era già
  stata fatta ma non aveva trovato un valore per questo ente (il caso
  visto insieme) — ora distingue i due casi e mostra la motivazione
  del fallimento, con l'invito a controllare gli alias.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.88.2 — 2026-08-07 (centotrentaquattresima consegna)

**Debug direttamente in pagina — niente più caccia nei log di Vercel**

Il log Vercel condiviso era solo rumore di provisioning (innocuo, già
visto), non il mio log diagnostico — probabilmente troppo difficile
da isolare tra il resto. Cambiato approccio: sulla pagina Relazione,
per gli scenari Ricevuta, un pannello "Debug temporaneo" (chiuso di
default, un clic per aprirlo) mostra esattamente cosa il client ha
ricevuto dal server — lo stesso identico dato usato per decidere se il
pulsante è acceso o spento, leggibile direttamente in pagina.

Apri quella pagina, clicca sul pannello di debug in fondo, e mandami
uno screenshot di quello che contiene — da lì sapremo con certezza se
il problema è nel dato che il server restituisce, o in qualcos'altro.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.88.1 — 2026-08-07 (centotrentatreesima consegna)

**Relazione ancora bloccata su 0.88.0 — non trovo altri bug rileggendo il codice, serve un log**

Confermato: sei già sulla 0.88.0, e il pulsante "Genera Relazione AI"
resta disabilitato per "Proposta acquisita" mancante, nonostante
l'analisi sia stata fatta con successo. Ho riletto per intero sia il
codice server (`verificaRicevibilitaProposta`) sia il componente
client (`RelazioneAiScenario.tsx`) senza trovare un altro bug logico —
sembrano entrambi corretti.

Aggiunto un log diagnostico temporaneo: quando la pagina Relazione
calcola i prerequisiti, il server ora registra esattamente cosa trova
nella tabella dell'analisi (se la riga esiste, e cosa contiene) — lo
stesso approccio già usato con successo per i bug precedenti dello
Screening.

**Serve il tuo aiuto**: apri la pagina Relazione di quello scenario (o
ricaricala), poi controlla i log della funzione su Vercel intorno a
quel momento, cercando `[verificaRicevibilitaProposta] Stato
estrazione ENTE:` — quel log dirà esattamente cosa succede.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.88.0 — 2026-08-07 (centotrentaduesima consegna)

**Alias rinforzati — e un bug reale trovato per strada: il campo era nascosto proprio dove serve di più**

- **Bug trovato**: il campo Alias nell'interfaccia era condizionato
  per escludersi esplicitamente dalla "Soglia dell'ente" (il caso
  Ricevente) — visibile solo per le categorie multiple del Redigente.
  Esattamente al contrario di quello che serve: per il Ricevente,
  dove gli alias alimentano l'estrazione AI, il campo non compariva
  affatto. Corretto — ora visibile ovunque.
- **Prompt di estrazione rinforzato**: prima l'istruzione era un
  debole "cerca anche: X, Y, Z". Ora è esplicita su due punti — gli
  alias includono anche termini tematici/di categoria (non solo nomi
  propri: per l'Agenzia delle Entrate, "ente fiscale", "debiti
  tributari", "fiscali", "erariali", mai l'acronimo interno "ADE"), e
  l'AI deve verificarli PRIMA di dichiarare l'estrazione fallita — non
  arrendersi solo perché l'acronimo esatto non compare mai nel testo.
- Aggiornato anche il testo di supporto sotto il campo, con l'esempio
  dell'Agenzia delle Entrate al posto del solo INPS.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.87.1 — 2026-08-07 (centotrentunesima consegna)

**La causa vera del blocco — non staleness, un parametro mancante in due punti**

Il fix precedente (callback padre/figlio) era corretto ma non
sufficiente — il vero bug era più a monte, in due punti distinti dello
stesso file:

- **`generaRelazionePropostaAction` (server)**: la chiamata a
  `verificaRicevibilitaProposta` non passava mai `tipoSpazio: 'ENTE'`.
  Senza quel parametro, per Ricevuta finiva nel ramo generico (righe
  manuali, sempre vuoto dato che quelle righe non esistono più) —
  faceva scattare il vecchio controllo "aggiungi una riga alla
  proposta" prima ancora di arrivare al controllo giusto aggiunto in
  precedenza, che quindi non veniva mai raggiunto.
- **`PropostaScenario.tsx` (il pannello "Confronto")**: la stessa
  chiamata veniva fatta solo se c'erano righe manuali — condizione mai
  vera per Ricevuta, quindi mai chiamata affatto, indipendentemente
  dal fix di staleness della consegna precedente.

Corretti entrambi: lo scenario si legge prima delle altre chiamate
(serve a dedurre se lo spazio è Ente), e per Ricevuta la verifica di
ricevibilità viene sempre interrogata, non solo quando ci sono righe
manuali che ormai non esistono più.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.87.0 — 2026-08-07 (centotrentesima consegna)

**Correzione della polarità applicabile a quanto già generato**

Il fix della regola Sì=favorevole (consegna precedente) valeva solo per
i nuovi Screening — le domande già generate in aziende esistenti
restavano con la vecchia formulazione, potenzialmente ambigua.

- **Nuovo pulsante "Correggi polarità domande esistenti"** nella Check
  List di ogni Azienda: rilegge le domande già generate e riformula
  solo quelle con polarità sbagliata, senza rigenerare tutto da capo
  (non serve il documento originale, ormai non più conservato).
- **Le risposte già date vengono invertite di conseguenza**, non
  lasciate come stavano: un "Sì" dato alla vecchia formulazione
  ("Risultano versamenti scaduti?") diventerebbe un fatto diverso se
  la domanda viene capovolta in "La posizione è priva di versamenti
  scaduti?" senza toccare la risposta — l'inversione della risposta
  mantiene lo stesso fatto reale rappresentato.
- Messaggio di conferma esplicito prima di procedere, e un riepilogo
  di quante domande sono state riformulate e quante risposte
  invertite, non un'operazione silenziosa.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.86.0 — 2026-08-07 (centoventinovesima consegna)

**Sette correzioni dal test su Azienda Demo**

- **Punto 1 — alias, uso reale corretto**: avevo frainteso lo scopo —
  non servono per il matching di righe (che non esistono più per
  Ricevuta), ma per aiutare l'AI a riconoscere l'ente nei documenti PDF
  quando si firma diversamente dal proprio acronimo ("Ente
  previdenziale", "Istituto" invece di "INPS"). Ora alimentano
  entrambi i prompt di Analisi Proposta.
- **Punto 2 — Ministeriale e pesi oscurati per Ricevente**: in
  Parametri di Spazio, uno spazio Ente ora vede solo la Check List da
  Screening — niente più card Ministeriale né pannello pesi
  Strutturale/Rilevante/Documentale, che non le riguardano. Direttrici
  Ente spostata subito dopo Limiti di ricevibilità nel menu, per
  seguire l'ordine logico con cui poi si legge la Check List.
- **Punto 3 — polarità delle domande imposta esplicitamente**: il
  prompt che genera il questionario aveva perfino degli esempi con la
  polarità sbagliata ("Risultano versamenti scaduti?" — un Sì qui è
  una cattiva notizia). Corretto con una regola vincolante e esempi
  giusti: ogni domanda va scritta perché un Sì sia sempre la buona
  notizia.
- **Punti 4/5 — la causa vera era un genitore con dati vecchi**:
  l'analisi della proposta funzionava (l'estrazione del 20% era
  corretta), ma il pannello "Confronto" — in un componente diverso,
  montato come genitore — non veniva mai avvisato che l'analisi era
  completata, restando con lo stato di prima. Aggiunto un callback che
  avvisa il genitore a fine analisi. Aggiunto anche il pulsante
  Stampa/PDF che mancava su questo pannello.
- **Punto 6**: pulsante Stampa/PDF aggiunto anche ai tre livelli del
  Brogliaccio.
- **Punto 7**: dovrebbe essere risolto dalla stessa causa di 4/5 — la
  Relazione leggeva lo stesso esito di ricevibilità, la cui verifica
  server-side risultava già corretta; il problema era la vista non
  aggiornata, non il calcolo.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.85.0 — 2026-08-07 (centoventottesima consegna)

**Chiude la lista di 8 punti — punti 5 e 6 completati**

- **Punto 5**: aggiunto un pulsante "Stampa / PDF" sulla Relazione di
  Screening — apre una finestra pulita (solo il testo, senza il resto
  dell'interfaccia) e lancia la stampa nativa del browser, che include
  sempre "Salva come PDF". Grezzo apposta, come richiesto: niente
  libreria di generazione PDF pesante da aggiungere al bundle. Sul bug
  del primo tentativo bloccato: senza un log di quell'episodio
  specifico non posso confermare la causa esatta, ma i fix già fatti
  in precedenza (timeout esplicito, ragionamento esteso disabilitato,
  budget di token aumentato) coprono le cause più probabili di un
  blocco in quel punto.
- **Punto 6**: la lettura di un file Excel leggeva sempre il primo
  foglio, senza eccezioni. Ora, se il file ha più fogli, un menu
  chiede quale leggere prima di procedere alla mappatura delle colonne
  — utile per export come quello INPS, con un riepilogo e fogli di
  dettaglio separati. La scelta fatta diventa parte del modello
  salvato (architrave): si riapplica automaticamente ai caricamenti
  successivi, non si richiede ogni volta.

Con questa, tutti gli 8 punti della lista sono completati: 1
(credenziali scaricabili), 2 (pesi dinamici check list da direttrici),
3 (alias categorie ricevibilità), 4 (avviso ATECO), 5 (stampa
relazione screening), 6 (scelta foglio Excel), 7 (indici numerici), 8
(prerequisiti Relazione corretti per Ricevente).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.84.0 — 2026-08-07 (centoventisettesima consegna)

**Terzo giro sulla lista di 8 punti — punto 2 completato**

- **Punto 2**: nuovo motore di calcolo per la Check List generata
  dallo Screening — non più pesi fissi per categoria
  (Strutturale/Rilevante/Documentale, come la Ministeriale), ma pesi
  calcolati dalla struttura delle direttrici: ogni prodotto configurato
  (sommato su tutte le direttrici) vale la stessa frazione di 100, il
  peso di una direttrice è quanti prodotti ha, il peso di una domanda è
  il peso della sua direttrice diviso per quante domande genera lo
  Screening in quella sezione. Punteggio finale: somma dei pesi delle
  domande con No, meno la somma di quelle con Sì.
- In Parametri di Spazio → Check List, per gli spazi Ente la vecchia
  scheda "Customizzate" (colonne Excel + modelli da caricare a mano)
  è sparita — non serve più, lo Screening genera automaticamente. Al
  suo posto, una tabella mostra il peso calcolato per ciascuna
  direttrice, in trasparenza: niente da inserire a mano, si cambia
  aggiungendo o togliendo prodotti dalle direttrici stesse.
- Il punteggio numerico è ora visibile anche nella Check List di ogni
  azienda, non solo l'etichetta testuale (Quadro solido / Da
  approfondire / Criticità rilevanti).

**Ancora da fare**: punto 5 (bug screening + esportazione PDF), punto
6 (Excel multi-foglio per la Situazione Debitoria).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.83.0 — 2026-08-07 (centoventiseiesima consegna)

**Secondo giro sulla lista di 8 punti — punti 3 e 7 completati**

- **Punto 7**: gli Indici mostravano un grafico a linee (andamento PFN
  e andamento per singolo indice) — tolto, ora tabelle numeriche.
  Stessi dati, più diretti da leggere e da citare in una relazione.
- **Punto 3**: aggiunto un campo alias per ciascun limite di
  ricevibilità — nomi alternativi con cui lo stesso creditore può
  comparire in una riga (es. "INPS" con alias "Enti previdenziali",
  "Ente previdenziale"). Il matching ora prova, in ordine: nome esatto
  configurato, poi un alias, poi il rango legale (meccanismo già
  esistente), poi "Generale" come ultima rete. Esisteva già un
  fallback sul rango legale, ma per un nome libero specifico — non
  ancorato a una classificazione giuridica — l'alias è più diretto.

**Ancora da fare**: punto 2 (pesi dinamici check list custom), punto 5
(bug screening + esportazione PDF), punto 6 (Excel multi-foglio).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.82.0 — 2026-08-07 (centoventicinquesima consegna)

**Primo giro sulla lista di 8 punti — punti 1, 4, 8 completati**

- **Punto 1**: alla creazione di uno spazio (e alla rigenerazione
  password di un admin già esistente), un pulsante scarica un file
  .txt con codice spazio, email di login e password temporanea — non
  serve più copiarla al volo o gestirla da superadmin se te ne
  dimentichi.
- **Punto 4**: il testo sotto il campo Codice ATECO era obsoleto
  ("funzione futura" — oggi è già attiva) e non avvisava di niente.
  Ora dice esplicitamente: opzionale, ma senza i Dati di Settore non
  si caricano in automatico.
- **Punto 8**: trovato esattamente quello che descrivevi — il
  controllo "prerequisiti" prima della Relazione aveva tre blocchi
  fissi (Proposta/Check List/XBRL) uguali per entrambi i percorsi. Per
  Ricevuta, "Check List" non esiste più come passo scenario (rimossa
  due consegne fa) e "Proposta" — controllando solo "almeno una riga"
  — non bloccava mai, dato che la riga sintetica esiste sempre anche
  prima di aver caricato nulla. Corretto sia lato server sia
  nell'interfaccia: per Ricevuta restano due prerequisiti veri
  (l'estrazione dal documento è stata fatta, XBRL caricato), niente
  Check List.

**Ancora da fare**: punto 2 (pesi dinamici check list custom — formula
confermata), punto 3 (alias categorie ricevibilità), punto 5 (bug
screening + esportazione PDF), punto 6 (Excel multi-foglio — approccio
confermato), punto 7 (indici come numeri).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.81.0 — 2026-08-06 (centoventiquattresima consegna)

**Due bug distinti — analisi troncata, e "Non ricevibile" mostrato senza dati veri**

- **Giudizio complessivo fuorviante**: "nessuna estrazione ancora
  fatta" e "estrazione fatta, importo sotto soglia" producevano lo
  stesso segnale (`complessivamenteRicevibile: false`) — indistinguibili
  agli occhi del giudizio finale, che mostrava sempre "Non ricevibile"
  con la motivazione sulla soglia anche quando in realtà non c'era
  ancora nessun dato reale da valutare. Aggiunto un flag esplicito che
  distingue i due casi: ora il pannello resta spento (grigio, "Non
  ancora valutabile") finché non c'è davvero un'estrazione, si accende
  con un giudizio vero solo quando i dati arrivano per davvero dal
  documento.
- **Analisi critica troncata**: stesso identico meccanismo già trovato
  per lo Screening — budget di token insufficiente ora che il
  ragionamento esteso è disabilitato e tutto lo spazio va al testo
  vero. Portato da 3000 a 6000. Aggiunto anche un segnale esplicito di
  troncamento (non ancora presente prima), visibile in interfaccia se
  dovesse ripresentarsi.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.80.2 — 2026-08-06 (centoventitreesima consegna)

**Causa vera trovata nel log — il ragionamento esteso consumava tutto il budget di token**

Il log della funzione confermava esattamente il sospetto:
`stopReason: 'max_tokens'`, `numeroBlocchi: 1` — un solo blocco che
aveva esaurito lo spazio prima di produrre testo visibile, il segno
classico di un blocco di ragionamento (thinking) mai arrivato alla
risposta vera.

Verificato: di 5 chiamate AI nel progetto, solo una (la generazione
della Relazione proposta) aveva il ragionamento esteso disabilitato
esplicitamente. Le altre 4 — le due di Screening (questionario e
relazione) e le due di Analisi Proposta Ricevente (analisi critica ed
estrazione dell'importo) — non l'avevano mai avuto, con lo stesso
rischio silente. Corrette tutte e quattro.

Questo spiega retroattivamente anche il primo bug dello Screening
("questionario non leggibile") — l'aumento del budget di token in
quel caso aveva probabilmente solo mascherato la causa di fondo,
lasciando abbastanza spazio sia al ragionamento sia alla risposta, ma
senza risolverla davvero.

**Nota a margine**: nello stesso log compariva anche un avviso
Postgres su una colonna — verificato, è il comportamento atteso e
innocuo di `ADD COLUMN IF NOT EXISTS` quando la colonna esiste già,
non un problema reale.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.80.1 — 2026-08-06 (centoventiduesima consegna)

**Trovata la contraddizione — "analisi fallita" ma "giudizio" reale, causa nel client**

Il bug non era dove sembrava: il server aveva successo (l'estrazione
era salvata correttamente, per questo il Giudizio complessivo mostrava
un valore reale), ma il client controllava `success && analisi`
insieme — se il testo dell'analisi critica risultava vuoto per
qualunque motivo, mostrava "Impossibile completare l'analisi" anche
se il server non aveva affatto fallito. Un successo parziale
mascherato da errore totale.

- **Corretto**: il client ora mostra quello che c'è, non nasconde un
  successo dietro un controllo troppo rigido.
- **Aggiunta diagnostica** per capire perché il testo dell'analisi
  critica può risultare vuoto (stop_reason, numero e tipo di blocchi
  nella risposta) — non ancora una causa certa, il prossimo tentativo
  con il log dirà di più.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.80.0 — 2026-08-06 (centoventunesima consegna)

**Righe eliminate per la Ricevente — l'importo offerto lo estrae l'AI dal documento**

Confermato: per il percorso Ricevente, l'inserimento manuale di righe
(categoria creditore, importo, percentuale) non ha più ragione di
esistere — l'unica fonte è il PDF della proposta di cram down.

- **Nuova estrazione AI strutturata**: in parallelo con l'analisi
  critica già esistente, una seconda chiamata legge solo il documento
  della proposta di cram down ed estrae importo, percentuale, modalità
  in JSON. Se il documento non quantifica chiaramente l'offerta per
  questo ente, lo dichiara esplicitamente — mai un fallimento
  silenzioso.
- **Verifica di ricevibilità riscritta** per il percorso Ricevente:
  non legge più righe, confronta il valore estratto con la soglia già
  configurata in Parametri di Spazio — stessa identica logica di
  confronto di prima, cambia solo da dove arriva il numero. Brogliaccio,
  Relazione e il giudizio finale non hanno dovuto cambiare: stessa
  struttura dati di prima, un adattatore sotto.
- **Tolta dall'interfaccia** l'intera sezione di inserimento manuale
  (form nuova riga, tabella, import/export Excel, il meccanismo
  "blocca riga rilevante") per gli scenari Ricevuta — resta invariata
  per il Redigente. Il confronto con la Situazione Debitoria dell'Ente
  ora mostra il valore estratto invece di quello inserito a mano.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — `/proposta` più snella (11,9 kB, prima 13,1) nonostante la
nuova logica, per via del codice morto rimosso insieme.

## 0.79.1 — 2026-08-06 (centoventesima consegna)

**"Questionario non leggibile" — probabile causa trovata: risposta troncata**

Il `catch` che intercettava il fallimento del parsing JSON era muto —
nessun log, nessuna diagnostica. Aggiunta: ora registra `stop_reason`,
la lunghezza del testo e gli ultimi caratteri ricevuti, per capire con
certezza la causa al prossimo tentativo.

Nel frattempo, un sospetto concreto già corretto: il budget di token
per il questionario era 3000 — probabilmente insufficiente ora che il
prompt richiede fino a 20 domande strutturate (id, testo, peso,
destinatario) dentro sezioni annidate, introdotto due consegne fa.
Portato a 6000. Il messaggio d'errore ora distingue anche il caso di
troncamento esplicito da un problema di formato generico.

**Non ancora confermato al 100%** — se il problema persiste, il nuovo
log dirà la causa esatta.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.79.0 — 2026-08-06 (centodiciannovesima consegna)

**Errore reale trovato — i tre documenti erano costruiti ma irraggiungibili dal percorso Ricevente**

Avevo costruito tutta la logica dei tre documenti (asseverazione,
proposta di cram down, piano di sviluppo — obbligatorio solo
quest'ultimo, giudizio penalizzato per gli altri due mancanti) in un
componente a sé, montato sulla vecchia pagina "Simulazione". Quando ho
ristrutturato lo Stepper Ricevente (consegna 0.77.0), ho tolto
"Simulazione" come passo separato — correttamente, come parte del
redesign — ma non ho mai spostato i tre documenti dentro "Proposta",
dove restano visibili nel nuovo percorso. Il risultato: tutta quella
logica esisteva ed era corretta, ma nessuno la vedeva mai, perché non
c'era più un link che ci portasse.

- **Corretto**: i tre documenti vivono ora dentro la pagina Proposta
  stessa, subito dopo il confronto con la Situazione Debitoria
  dell'Ente — non più una tappa separata e irraggiungibile.
- La vecchia rotta `/simulazione` per Ricevuta ora fa redirect a
  `/proposta` (per chi arriva comunque sull'URL diretto, es. da un
  link salvato) — resta invariata per il Redigente, che la usa
  ancora per le leve.
- Rimossa una duplicazione minore trovata per strada: il contesto
  dichiarato per l'assistente chat, doppio tra Proposta e il
  componente ora annidato dentro di lei.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — `/proposta` più corposa (13,1 kB, prima 11,1) coerente con
l'aggiunta, `/simulazione` più snella (5,07 kB, ora solo redirect e
Redigente).

## 0.78.1 — 2026-08-06 (centodiciottesima consegna)

**Screening che non completa mai — causa non ancora certa, fix difensivo consegnato**

Segnalato: lo Screening resta bloccato indefinitamente durante la
generazione, nessun errore visibile, "Status 0" nel log di rete —
verificato che non è un problema di rete mobile (schermo acceso, app
in primo piano per tutto il tempo).

Trovato un punto debole reale: il client Anthropic non aveva un
timeout esplicito — il default dell'SDK arriva fino a 10 minuti, più
lungo del limite di Vercel (300 secondi). Se una chiamata rallenta
davvero, Vercel interromperebbe la funzione dall'esterno prima che il
mio codice possa restituire un errore leggibile — il browser vede solo
una connessione interrotta, non un messaggio comprensibile. Aggiunto
un timeout esplicito di 150 secondi sul client, con margine (180s) sul
`maxDuration` della pagina.

**Non è ancora una diagnosi definitiva**: questo trasforma un blocco
indefinito in un errore leggibile, ma non elimina necessariamente la
causa di fondo se la generazione impiega davvero più di 150 secondi
per il fascicolo caricato. Al prossimo tentativo, il messaggio
d'errore esatto (se compare) dirà se il problema è un genuino
rallentamento da ottimizzare, o qualcos'altro.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.78.0 — 2026-08-06 (centodiciassettesima consegna)

**Ultimi due pezzi — chiude il redesign del percorso Ricevente iniziato con la 0.76.0**

- **Posizione Aggiornata, caricamenti multipli datati**: non più un
  solo record per scenario — un'azienda può avere un bilancino al
  31/12 e un altro al 31/03, ciascuno con la propria data. Nuova vista
  con l'elenco dei caricamenti esistenti, selezionabili per
  correggerli o da cui partire per aggiungerne uno nuovo. Chi consuma
  "la" posizione aggiornata (Indici, Simulazione, Brogliaccio) prende
  sempre quella con la data più recente — nessuna di quelle funzioni
  ha dovuto cambiare.
- **Blocco permanente dopo la Relazione**: solo percorso Ricevente —
  generare la Relazione finale congela lo scenario in sola lettura,
  per sempre. Nessuno sblocco possibile: per una nuova valutazione
  serve un nuovo scenario. Il controllo è centralizzato (una funzione
  sola) e applicato a tutte le azioni di scrittura del percorso:
  Proposta (righe, import), Posizione Aggiornata, Analisi Proposta —
  Ricevente. Banner visibile in cima alla Panoramica quando lo
  scenario è bloccato.
- **Trovato e corretto un bug serio nello stesso momento**: la
  generazione della Relazione per Ricevente falliva sempre, perché
  richiedeva "almeno una domanda della Check List compilata" — un
  controllo pensato per il Redigente, mai aggiornato quando la Check
  List scenario è sparita dal percorso Ricevente due consegne fa.

Con questa, il redesign del percorso Ricevente descritto è completo:
Screening ad Azienda (fatto una volta), Proposta con i tre documenti e
il giudizio penalizzato, ISTAT automatico e protetto, caricamenti
multipli datati, blocco permanente dopo la Relazione.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.77.0 — 2026-08-06 (centosedicesima consegna)

**Secondo pezzo — Stepper Ricevente ristrutturato, ISTAT automatico**

- **Stepper**: Ricevente e Redigente sono ora due elenchi separati, non
  più un unico elenco filtrato. Il percorso Ricevente ha 6 passi, non
  più 10: Proposta (con i tre documenti), Posizione Aggiornata, Indici,
  Dati di Settore, Brogliaccio, Relazione. Posizione Ente, Import XBRL
  e Check List sono spariti dal percorso scenario — vivono ad Azienda,
  fatti una volta sola dallo Screening. Rimossa anche la vecchia pagina
  scenario di Posizione Ente, ormai irraggiungibile e inutile. Il
  percorso Redigente resta quello di sempre, 9 passi.
- **ISTAT automatico, ma protetto**: alla prima riga di proposta di
  uno scenario Ricevuta, i dati di settore si aggiornano da soli — ma
  solo se non c'è già un dato recente in cache (24 ore), e solo alla
  prima riga, mai in un ciclo. Il limite ISTAT (5 richieste/minuto, con
  penalità di blocco di 1-2 giorni se superato) è condiviso da tutti
  gli spazi della piattaforma — la protezione resta quella già
  costruita in precedenza, solo attivata automaticamente invece che a
  richiesta esplicita.

**Ancora da fare**: caricamento multiplo datato per Posizione
Aggiornata, blocco permanente e sola lettura dopo la generazione della
Relazione.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.76.0 — 2026-08-06 (centoquindicesima consegna)

**Primo pezzo del redesign del percorso Ricevente — i tre documenti della fase di analisi proposta**

Inizio del redesign più ampio descritto: "Analisi Proposta" (ex
Simulazione Ricevente) ora chiede tre documenti nominati e distinti,
non più un elenco generico di PDF da caricare alla rinfusa:

- **Proposta di cram down** — obbligatoria. Senza di lei l'analisi non
  parte.
- **Asseverazione del professionista** e **Piano di sviluppo** —
  opzionali, ma la loro assenza penalizza il giudizio finale.
- **Nuovo giudizio complessivo**, non solo il vecchio esito
  ricevibile/non ricevibile: combina la soglia numerica (fatto
  oggettivo, invariato) con la completezza documentale — 4 livelli
  (Ricevibile, Ricevibile con riserva, Ricevibile con riserva grave,
  Non ricevibile), con colore ed etichetta coerenti con lo stile già
  usato in Screening.
- Confermato: il "sentimento negativo" modifica davvero il giudizio
  calcolato, non è solo un'annotazione testuale.

**Ancora da fare**, nell'ordine concordato: ristrutturare lo Stepper
della Ricevente (togliere Posizione Ente/Import XBRL/Check List come
passi scenario — già spostati ad Azienda), automatizzare l'aggiornamento
ISTAT senza passo manuale, caricamento multiplo datato per Posizione
Aggiornata, blocco permanente e sola lettura dopo la generazione della
Relazione.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.75.0 — 2026-08-06 (centoquattordicesima consegna)

**Corretto un errore di interpretazione — Check List torna a essere una scheda a sé**

Rileggendo con attenzione due messaggi precedenti: la richiesta non era
di eliminare la Check List, ma di **portarla fuori dallo Screening** —
uno spazio sempre presente in Azienda, che si illumina quando ci sono
domande in attesa, popolato dal questionario generato dallo Screening
(non dalla Ministeriale). Avevo fuso le due cose in una scheda sola.

- **Screening** ora fa solo quello che il nome dice: documenti di
  partenza, generazione, relazione di inquadramento. Nessuna risposta
  alle domande da qui.
- **Check List** — nuova scheda separata, sempre visibile nel menu di
  ogni Azienda (spazi ENTE), accanto a Screening: qui si risponde alle
  domande generate. Se lo Screening non è ancora stato fatto, un link
  diretto porta lì.
- Il badge con le domande in attesa si è spostato dalla scheda
  Screening alla scheda Check List, dove ora vive davvero
  l&apos;azione di rispondere.
- Il paragrafo del Brogliaccio aggiornato di conseguenza (etichetta
  "Check List (da Screening)").

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — tre rotte separate sotto Azienda (Posizione Ente, Screening,
Check List), tutte confermate nella build.

## 0.74.1 — 2026-08-06 (centotredicesima consegna)

**Tre problemi reali segnalati, tutti confermati e corretti**

- **Il più grave, un mio errore di design**: la consegna precedente
  aveva spostato i *dati* di Posizione Ente ad Azienda, ma il punto di
  accesso restava raggiungibile solo passando per uno Scenario — senza
  una scheda diretta in Azienda, dove ora quei dati vivono davvero.
  Aggiunta la scheda "Posizione Ente" accanto a Screening nel menu di
  ogni Azienda (spazi ENTE). L'accesso dallo Scenario resta anche lui
  valido (fa parte dello step 0 del percorso guidato) — ora sono due
  strade allo stesso posto, non una sola nascosta.
- **Testo residuo mai aggiornato**: lo step 0 della Panoramica scenario
  menzionava ancora "la sua Check List" — testo statico in un file
  separato dal componente che avevo corretto, sfuggito alla rimozione
  della Check List di due consegne fa. Aggiornato.
- **Aziende disabilitate selezionabili per un nuovo scenario**: il
  selettore in creazione scenario mostrava tutte le aziende senza
  distinzione. Ora nasconde quelle disabilitate (con una nota se ce ne
  sono, e l'indicazione di riattivarle se serve), lasciando intatti gli
  scenari già esistenti per un'azienda poi disabilitata.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — entrambe le rotte di Posizione Ente (da Azienda e da
Scenario) compilano e condividono lo stesso componente, nessuna
duplicazione di codice.

## 0.74.0 — 2026-08-06 (centododicesima consegna)

**Punti F+G — Screening legge la Situazione Debitoria, area di risposta visibile**

Con questa consegna, tutti i punti della giornata sono chiusi (1, 2, C,
E, D, A+B, F+G).

- **F**: lo Screening ora legge anche la Situazione Debitoria dell'ente
  (disponibile da subito, dato che vive ad Azienda) — non più solo XBRL
  e fascicolo storico. Il prompt segnala esplicitamente se il quadro
  del bilancio e quello dichiarato dall'ente sono coerenti tra loro.
- **G — punto di ingresso visibile**: un badge sulla scheda
  "Screening" (nel menu dentro ogni Azienda, spazi ENTE) si accende con
  il numero di domande ancora senza risposta — prima non c'era modo di
  accorgersene senza entrare a controllare.
- **G — confluenza nel Brogliaccio**: il paragrafo "Check List" del
  Livello 1 (che leggeva da una tabella ormai irraggiungibile, dato che
  quella scheda è sparita nella consegna precedente) è sostituito da un
  paragrafo "Screening" — stato del questionario, risposte, e la
  relazione preliminare per intero quando disponibile. Lo Scenario, da
  qui, si occupa solo di quello che è davvero specifico del round di
  proposta.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.73.0 — 2026-08-06 (centoundicesima consegna)

**Punti A+B — Posizione Ente spostata da Scenario ad Azienda, Check List rimossa**

- **Anagrafica Ente e Situazione Debitoria ora vivono ad Azienda**, non
  più per singolo Scenario: la matricola con cui l'ente identifica
  un'azienda e la sua posizione debitoria non cambiano da una proposta
  all'altra della stessa azienda — creare uno Scenario 2 non richiede
  più di reinserire tutto da capo, condivide gli stessi dati dello
  Scenario 1.
- **Migrazione dati non distruttiva**: le vecchie tabelle (per
  scenario) sono rinominate come archivio storico
  (`*_per_scenario_legacy`), mai eliminate. Una migrazione automatica
  "best effort" copia i dati dallo scenario aggiornato più di recente
  per ciascuna azienda — chi ha già dati di test inseriti non li perde.
- **La Check List dentro Posizione Ente è sparita come scheda a sé**
  (punto B): il questionario generato dallo Screening la sostituisce —
  è già mirato alle direttrici di questo ente per questa azienda
  specifica, non serve una seconda check list generica in parallelo.
- Nessun link da riscrivere: la pagina resta raggiungibile dallo
  stesso punto del percorso scenario (coerente con lo step 0), ma
  internamente ora legge/scrive sull'azienda a cui lo scenario
  appartiene.
- Toccati coerentemente: chat guidata AI, Brogliaccio, Proposta (il
  confronto di ricevibilità), lo Stepper della Panoramica.

**Nota per il prossimo giro**: non ancora affrontato — le voci di menu
"Anagrafica Ente" e "Tipo Debito" in Parametri di Spazio non sono
condizionate a spazi ENTE (visibili anche dove non servono), stesso
problema già corretto per "Direttrici Ente".

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.72.0 — 2026-08-06 (centodecima consegna)

**Punto E — etichetta e contatore Fascicolo storico**

- "Visura camerale" → "Fascicolo storico" ovunque visibile
  (interfaccia, messaggi d'errore, prompt AI usati per generare la
  relazione).
- Il vero bug del contatore: la UI guardava solo il file appena
  selezionato nella sessione corrente, non quello già salvato in
  precedenza — corretto, ora mostra "1 caricato — nomefile" quando
  esiste davvero uno stato salvato.

**Punto C — direttrici strutturate a prodotti**

- Ogni direttrice ha ora un nome e un elenco di "prodotti" concreti
  (es. Cassa Integrazione, DURC, DICA) — editor dedicato per
  aggiungerli/rimuoverli, non più un campo di testo libero.
- Il prompt AI genera 1-2 domande per prodotto elencato, mai più di 20
  in totale — sempre ancorate a un prodotto specifico, mai alla
  direttrice in astratto. Corregge le domande non pertinenti segnalate.
- Colonna DB nuova (`spazi.direttrici_ente_strutturate`, JSONB) — la
  vecchia colonna testo libero resta intatta ma non più usata, nessuna
  perdita di dati per chi l'aveva già compilata (andrà solo reinserita
  nel nuovo formato).

**Trovata e rimossa una duplicazione reale**: due pagine diverse nel
menu Parametri di Spazio facevano esattamente la stessa cosa (stesso
dato sottostante, entrambe "Direttrici... Screening") — rimossa quella
vecchia a testo libero. Corretto anche che la voce rimasta non fosse
condizionata a spazi ENTE (visibile per errore anche dove lo Screening
non esiste — lo stesso problema esiste ancora, non toccato in questa
consegna, su "Anagrafica Ente" e "Tipo Debito").

**Trovato un buco nel controllo automatico** (consegna precedente):
non intercettava funzioni sincrone esportate da file `'use server'` —
corretto lo script perché non ricapiti.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.71.1 — 2026-08-06 (centonovesima consegna)

**Situazione Debitoria — dimezzamento righe e confronto sul lordo invece che sul saldo (punto D)**

Due bug reali distinti, non una singola causa:

- **Dimezzamento delle righe all'import**: il controllo "questa riga ha
  dati?" guardava sempre la colonna 0 fissa del foglio, a prescindere
  da quale colonna fosse davvero mappata come "voce" — su uno schema
  proprietario dove quella colonna specifica non è sempre valorizzata,
  metà delle righe sparivano senza passare né tra le importate né tra
  gli errori. Corretto: ora basta che qualunque colonna abbia un
  valore.
- **Il confronto con la proposta usava il debito lordo, non il
  saldo**: se una quota è già stata versata, sommare il lordo dava un
  numero sbagliato — più alto di quanto l'ente incasserebbe davvero.
  Aggiunto un ruolo di colonna opzionale "Importo versato": quando
  mappato, il saldo (importo − versato) è ciò che entra ovunque nei
  calcoli (confronto in Proposta, Brogliaccio) — il lordo resta sempre
  visibile accanto, mai nascosto.
- Aggiunto anche il ruolo "Data" tra le colonne mappabili, come
  richiesto.

Toccati: schema (`debiti_ente.importo_versato`, `.data`), l'intero
percorso di import adattivo, l'interfaccia di Situazione Debitoria
(doppio totale quando serve), Proposta (il confronto usa il saldo),
Brogliaccio (idem), l'export Excel di consultazione.

**Trovato anche un buco nel controllo automatico**: lo script che
verifica i file `'use server'` intercettava costanti esportate ma non
funzioni sincrone (non-async) — sfuggito una volta in questa consegna,
il build reale l'ha bloccato comunque. Corretto lo script perché non
succeda più.

Verificato: type-check (entrambi i controlli, incluso quello appena
corretto), lint, 56 test, build completa.

## 0.71.0 — 2026-08-06 (centottava consegna)

**Archivia ed Elimina per gli scenari, stesso principio già visto per gli spazi**

- **Archivia/Ripristina**: toglie uno scenario dalla vista principale
  senza cancellare nulla — reversibile in un click. Lo stato
  procedurale (Bozza/In corso/Completato) resta intatto, un ripristino
  torna esattamente com'era. Colonna separata dallo stato apposta, non
  un valore in più dentro "stato".
- **Elimina**: cancellazione completa e irreversibile, nessuna
  distinzione tra dati inseriti a mano e calcoli derivati — scelto
  esplicitamente. Conferma obbligatoria digitando il nome esatto dello
  scenario prima che il pulsante si attivi. Verificato che tutte le 10
  tabelle collegate (checklist, debiti ente, anagrafica ente,
  simulazioni...) abbiano già CASCADE sulla chiave verso lo scenario —
  una sola cancellazione basta, non serve pulizia manuale.
- Il contatore "Scenari (N)" ora conta solo gli attivi; gli archiviati
  restano un click di distanza dietro "Mostra archiviati".

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.70.2 — 2026-08-06 (centosettesima consegna)

**Screening: usava solo 5 campi su 22 già disponibili dal bilancio**

Segnalato: "non abbiamo intercettato il 90% delle voci" sul file XBRL
caricato per un test di Screening. Verificato — vero, letteralmente:
il parser XBRL estrae già 22 campi per periodo (conto economico
completo, attivo, passivo, scomposizione dei debiti), ma il contesto
passato all'AI per generare questionario e relazione ne usava solo 5
(ricavi, EBITDA, patrimonio netto, totale debiti, debiti previdenziali).
Il resto — immobilizzazioni, disponibilità liquide, crediti, oneri
finanziari, scomposizione debiti per tipo — non arrivava mai
all'assistente.

- **Corretto**: il contesto ora include tutti i 22 campi, organizzati
  per area (conto economico, attivo, passivo), più un confronto con
  l'esercizio precedente quando disponibile (prima assente del tutto).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.70.1 — 2026-08-05 (centosesima consegna)

**Trovata la causa vera — non un bug tecnico, un errore di design nel valore stesso**

"Ente" come origine di una proposta ricevuta non aveva senso: uno
spazio ENTE è il *destinatario*, non può essere anche l'origine di
qualcosa che riceve da se stesso. L'osservazione che ha sbloccato
tutto: creando lo scenario con "Tribunale" funzionava, con "Ente" no —
segno che il valore stesso era sbagliato, non la validazione attorno
ad esso.

- **Corretto**: le origini valide per una proposta Ricevuta sono ora
  **Azienda** (il debitore trasmette direttamente) e **Tribunale**
  (proposta veicolata in sede di omologazione forzosa / cram down) —
  non più "Ente". Aggiornato sia il valore di default sia l'elenco
  scelte nel form.
- Tolto il log diagnostico temporaneo della consegna precedente, non
  più necessario.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.70.0 — 2026-08-05 (centoquinta consegna)

**Il vero blocco era un bug di Vercel, non del codice — aggirato con un proxy server-side**

L'errore CORS mostrato nel browser corrispondeva esattamente a una
segnalazione recentissima (pochi giorni) sul forum ufficiale Vercel,
stessa versione del pacchetto, stesso errore identico — confermato
dallo stesso supporto Vercel come bug in corso di indagine interna,
nessuna data di risoluzione nota. L'upload diretto dal browser a
Vercel Blob (`handleUpload`) non funziona in questo momento sulla
piattaforma, indipendentemente da come è scritto il codice.

- **Upload proxato attraverso il server**, non più diretto dal browser
  — il file passa da una Route Handler propria (`/api/blob-upload`),
  che lo carica su Blob lato server con `put()`. Applicato sia a
  Screening sia a Simulazione Ricevente.
- **Il costo di questo giro**: torna a valere il limite di 4,5MB sul
  corpo della richiesta — lo stesso limite che l'upload diretto era
  nato per aggirare. Segnalato esplicitamente all'utente se un file lo
  supera, invece di un fallimento silenzioso.
- **Effetto collaterale positivo**: con l'upload che ora passa dal
  server (autenticato via OIDC, come già `get()`/`del()`), il token
  statico mancante diventa irrilevante per questo percorso — un
  secondo problema risolto insieme al primo.
- **Le due chiamate AI dello Screening (questionario + relazione) ora
  girano in parallelo**, non più in sequenza — il tempo di attesa
  complessivo è quello della più lenta delle due, non la somma di
  entrambe. Nessun dato nuovo, stesso identico prompt e contenuto,
  solo il tempo di attesa dell'utente si dimezza.

**Nota per il futuro**: se Vercel risolve il bug lato loro, si può
tornare all'upload diretto dal browser per superare il limite di 4,5MB
su documenti più pesanti — il codice del proxy resta comunque una base
di riferimento valida, non va scartato a prescindere.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — `/simulazione` scesa da 21,4 kB a 6,98 kB (il pacchetto
client di Vercel Blob non è più necessario lato browser).

## 0.69.2 — 2026-08-05 (centoquarta consegna)

**Corretti due bug reali trovati mentre si indagava sullo storage — ma il blocco originale resta**

Dallo screenshot dello store si è visto un dettaglio che il codice non
gestiva: lo store è **privato**, non pubblico. Questo ha fatto emergere
due problemi indipendenti dal token mancante, che avrei comunque dovuto
correggere:

- **`access: 'public'` ovunque, store privato** — sia Screening sia
  Simulazione Ricevente passavano sempre `access: 'public'` in fase di
  upload, un disallineamento con lo store reale. Corretto a `'private'`
  in entrambi.
- **Lettura lato server con `fetch()` diretto** — su uno store privato
  questo fallisce sempre (serve autenticazione, l'URL non è
  pubblicamente raggiungibile). Sostituito con `get()` del SDK, che
  autentica da sola con le credenziali OIDC già presenti.
- **La libreria `@vercel/blob` era troppo vecchia** (0.27) per
  supportare `get()` e gli store privati — introdotti dalla 2.3 in su.
  Aggiornata a 2.6.1 — salto di versione grande, verificato che nessuna
  delle firme già in uso (`upload`, `handleUpload`, `del`) fosse
  cambiata.

**Quello che questi fix NON risolvono**: il blocco originale — il token
statico mancante per l'upload dal browser — resta. `get()` funziona
con le sole credenziali OIDC che hai già, ma `handleUpload()` (l'upload
diretto dal browser, quello che serve per non passare per il limite di
4,5MB) richiede sempre quel token specifico, indipendentemente dalla
versione della libreria — è un vincolo di design della funzione, non
qualcosa che il codice possa aggirare. Vale ancora la ricerca del
token (o la creazione di un nuovo store dentro questo progetto) di cui
parlavamo prima di scoprire questi due bug.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.69.1 — 2026-08-05 (centoterza consegna)

**Trovata la causa vera del crash sullo Screening — lo stesso bug già risolto una volta, dimenticato qui**

Il messaggio "An error occurred in the Server Components render" era
lo stesso identico sintomo già trovato per la Simulazione Ricevente
qualche consegna fa: il PDF della visura passava come base64 diretto
nel corpo di una Server Action — e Vercel impone un tetto di 4,5MB su
quel corpo, non aggirabile da configurazione. Avevo già risolto questo
esatto problema una volta, ma non l'avevo applicato quando ho costruito
lo Screening.

- **Corretto con la stessa soluzione già collaudata**: la visura si
  carica ora direttamente dal browser su Vercel Blob, la funzione
  riceve solo l'URL e scarica il file da lì — il limite non si applica
  più. Eliminata subito dopo l'uso, riuscita o fallita che sia la
  generazione.
- **Tolta anche la duplicazione trovata per strada**: la pagina
  Screening ripeteva l'intestazione azienda e la query che il layout
  condiviso (`layout.tsx`, con la sua scheda &quot;Screening&quot; già
  prevista — residuo di un tentativo precedente mai del tutto ripulito)
  già forniva. Rimosso anche un link duplicato in Anagrafica Azienda,
  ora ridondante con la scheda del layout.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — la rotta `/screening` è più leggera di prima (2,99 kB,
era 4,45 kB), coerente con la duplicazione tolta.

## 0.69.0 — 2026-08-06 (centoduesima consegna)

**Screening dell'Azienda — prima ancora che arrivi una proposta**

Nuovo modulo, esclusivo degli spazi ENTE, a livello di Azienda (non di
Scenario): da bilancio XBRL e visura camerale, entrambi caricati una
volta sola, l'AI genera **due cose insieme**, non in due passaggi
separati — un questionario Sì/No mirato alle direttrici dichiarate
dall'ente (vigilanza documentale, gestione del credito, contenzioso...)
e una relazione narrativa di inquadramento, nello stile di una vera
istruttoria preliminare.

- **Le direttrici sono configurabili** — nuova sezione in Parametri di
  Spazio, testo libero, non un elenco fisso: ogni ente ha le proprie.
- **Il questionario è mirato a quello che l'ente può verificare nei
  propri sistemi**, non a giudizi che richiederebbero un'interazione
  diretta con l'azienda — il prompt lo dice esplicitamente all'AI, per
  evitare domande su governance o clima interno che nessun funzionario
  potrebbe rispondere onestamente senza aver mai parlato con l'azienda.
- **Stesso motore di punteggio già esistente** per la Check List
  (Solido/Da rafforzare/Critico) — nessun calcolo nuovo, solo applicato
  a un contesto diverso.
- **Rigenerare azzera le risposte precedenti** — un questionario diverso
  non deve ereditare risposte a domande che potrebbero non esistere più.
- Link diretto dalla pagina Anagrafica Azienda, visibile solo per spazi
  ENTE.

**Cosa manca, dichiarato esplicitamente**: l'esportazione PDF della
relazione — resta testo salvato in app per ora, come Brogliaccio e
Simulazione Ricevente. Un vero PDF scaricabile è un secondo strato da
costruire sopra questo, non incluso in questa consegna.

Verificato: type-check (entrambi i controlli automatici), lint, 56
test, build completa con conferma esplicita della nuova rotta
(`/aziende/[id]/screening`, 4,45 kB — davvero nel bundle, non solo
scritta).

## 0.68.0 — 2026-08-05 (centounesima consegna)

**Eliminazione di un singolo spazio — non serve più "far esplodere" tutto il database per ripulirne uno**

Richiesta diretta dopo aver notato che una correzione al codice (blocco
tipo proposta per gli spazi ENTE) non cambia retroattivamente i dati già
creati con le vecchie regole — serviva un modo per ripulire *quello*
spazio senza azzerare l'intero database.

- **Nuovo pulsante "Elimina"** in Manutenzione Spazi, per ogni spazio —
  conferma richiesta scrivendo il **codice esatto** dello spazio (più
  mirato di una frase generica: previene l'errore di cliccare sullo
  spazio sbagliato in un elenco).
- **Cosa elimina**: l'intero schema tenant (ogni azienda, scenario,
  proposta, bilancio, risposta Check List, tutto) più le righe globali
  collegate — tre tabelle (`licenze_spazio`, `admin_spazio_index`,
  `utente_spazio_index`) avevano già `ON DELETE CASCADE` verso `spazi`,
  si puliscono da sole; `sessioni` no (nessun vincolo dichiarato), va
  ripulita esplicitamente per non lasciare sessioni orfane.
- **`analisi_xbrl_storico` non viene toccata** — verificato che è un
  modulo completamente separato (test/superadmin, nessun legame con
  nessuno spazio specifico), quindi giustamente esclusa.
- **Verificato con un test reale** contro un database vero, non solo a
  parole: creato uno spazio completo di licenza, sessione, indici
  admin/utente e uno schema tenant con dati dentro — dopo
  l&apos;eliminazione, tutto sparito, verificato riga per riga.

Verificato anche il resto: type-check (entrambi i controlli), lint, 56
test, build completa.

## 0.67.0 — 2026-08-05 (centesima consegna)

**Trovato dalla prima verifica reale su database azzerato — tre problemi, una sola causa comune al primo**

- **Scenario "Da definire" creabile dentro uno spazio ENTE** — la causa
  vera del "punto 0 mancante" nella Panoramica: non un bug della
  Panoramica (che filtrava correttamente su `tipoProposta`), ma la
  creazione dello scenario, che permetteva (e proponeva come default!)
  di scegliere "Da definire" anche in uno spazio che riceve soltanto
  proposte, non le scrive mai. Corretto alla radice: per uno spazio
  ENTE il tipo è ora fisso a "Ricevuta", sia lato interfaccia (il
  selettore diventa un&apos;etichetta bloccata) sia lato server (non ci
  si fida solo del client). Lo scenario di test già creato con "Da
  definire" resta così com&apos;è — va ricreato, non c&apos;è modo di
  correggerlo automaticamente da qui.
- **Una seconda scheda "Soglie Normative"** — "Localizzazione e
  Stampa" in Parametri di Sistema, sfuggita alla pulizia di mesi fa:
  stessa causa esatta (leggeva da `parametri_sistema`, mai scritta da
  nessuna interfaccia), stesso sintomo ("nessun dato caricato"). Trovata
  con lei anche una terza sezione dormiente nello stesso file
  (&quot;Configurazione Percorso di Backup&quot;, mai popolata):
  eliminate entrambe, resta solo quello che funziona davvero — Dump e
  Azzeramento.
- **Segnalato, non ancora toccato**: l&apos;endpoint REST legacy
  `/api/indici?type=parametri` (e `type=indici`) risulta ora
  completamente orfano — nessuna interfaccia lo chiama più. Da valutare
  con più calma se eliminarlo, in un prossimo giro.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — `/superadmin/Parametri` scesa da 3,92 kB a 2,24 kB, a
conferma della pulizia.

## 0.66.1 — 2026-08-05 (novantanovesima consegna)

**Automatizzato l'unico passo manuale rimasto nel ciclo azzera/ricostruisci**

Le mappature dei tag XBRL (`xbrl_tag_mappings`) richiedevano finora uno
script da eseguire a mano con `psql` dopo ogni azzeramento — un passo
facile da dimenticare, e che oltretutto falliva **in silenzio**: senza
quella tabella il motore XBRL cade sul fallback statico più piccolo,
senza nessun errore visibile che lo segnali.

- **Estratto in un'unica fonte di verità** (`seedXbrlTagMappings.ts`) —
  prima viveva solo nel file `.sql`, ora è codice richiamabile.
- **Richiamato automaticamente in due punti**: `assicuraTabelleSpazi()`
  (ad ogni avvio rilevante — copre anche un ambiente mai avviato prima)
  e dentro `azzeraDatabaseCompletoAction()` stesso, subito dopo aver
  svuotato la tabella — la ripopolazione è ora parte della stessa
  operazione atomica del pulsante "Azzera tutto", non un secondo passo
  separato da ricordarsi.
- **Verificato con un test reale** contro un database vero (non solo a
  parole): tabella mancante → seed → popolata; seed richiamato una
  seconda volta → nessun duplicato, nessun errore.
- Il file `.sql` originale resta come riferimento leggibile dei dati,
  con una nota esplicita che non serve più eseguirlo a mano.

Con questo, il ciclo azzera→ricostruisci non ha più passi manuali
nascosti: creare una Licenza Commerciale e uno Spazio dalla UI dopo
l'azzeramento basta da solo a ricostruire uno schema tenant completo e
funzionante, senza nessuno script da lanciare a parte.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.66.0 — 2026-08-05 (novantottesima consegna)

**Brogliaccio a 3 livelli — punti 15, 18, 19, il pezzo concettualmente più grande di tutto il feedback INPS**

Costruito per gli scenari Ricevuti, coerente con il disegno concordato
tempo fa e mai realizzato: non un documento a sé da compilare, ma un
contenitore che accumula l'analisi dell'ente livello per livello, con
un varco esplicito tra l'uno e l'altro — mai generato automaticamente
senza che l'operatore lo chieda.

- **Livello 1 — sempre disponibile**: raccoglie Anagrafica Ente, Check
  List (conteggio Sì/No), Situazione Debitoria dichiarata, e l'esito di
  ricevibilità della riga rilevante della Proposta. Il primo giudizio,
  prima di ogni altro.
- **Varco verso il Livello 2**: "vuoi procedere alla verifica dei
  bilanci?" — solo dopo un sì esplicito si sblocca la sezione, che
  raccoglie l'ultimo bilancio XBRL, gli indici CCII e la Posizione
  Aggiornata.
- **Varco verso il Livello 3**: condizionato anche dalla licenza —
  visibile solo se almeno una tra Dati di Settore e Simulazione è
  attiva come funzione plus per questo spazio, altrimenti spiega perché
  non è disponibile invece di nasconderlo silenziosamente. Raccoglie il
  confronto con il settore ISTAT e l'analisi critica dei documenti
  allegati alla proposta (la Simulazione Ricevente già costruita).
- **Ogni livello si rigenera esplicitamente**, non si aggiorna da solo:
  un pulsante "Genera"/"Rigenera" per volta, con la data dell'ultima
  generazione visibile — mai un testo che cambia sotto gli occhi senza
  che l'operatore lo chieda.
- Per gli scenari Da Definire, resta un lavoro futuro dichiarato
  onestamente nel placeholder — il disegno a 3 livelli con varchi
  riguarda solo chi valuta una proposta ricevuta, non chi la scrive.

**Nota**: il Livello 1 usa un conteggio semplice delle risposte alla
Check List (quante Sì, quante No), non il punteggio pesato completo
(Strutturale/Rilevante/Documentale) — quello resta nella pagina Check
List dedicata. Se serve la stessa granularità anche qui, è un
incremento successivo, non incluso in questa prima versione.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — crescita misurabile di `/brogliaccio` (3,95 kB, prima 820 B)
a conferma che il modulo è davvero nel bundle.

---

**Con questa consegna si chiudono 18 punti su 20 del feedback INPS.**
Resta aperto solo il punto 2 (il crash sui limiti di ricevibilità),
segnalato dall'utente come non riproducibile al momento — nessuna
traccia nei log Vercel. Resterà da indagare se e quando si ripresenterà.

## 0.65.0 — 2026-08-05 (novantasettesima consegna)

**Punto 8 — un solo posto per l'elenco delle funzioni, non più due**

Prima: uno stepper serpentino a icone sempre visibile in cima a ogni
pagina scenario, e una pagina "Panoramica" separata con le stesse
informazioni in formato card — la stessa cosa esposta due volte,
esattamente la confusione segnalata.

- **Lo stepper è sparito dal layout**: resta solo un link "Torna alla
  Panoramica", per navigare da dentro un passo senza uno stepper
  completo sempre in vista.
- **La Panoramica è ora l'unico posto**: un elenco verticale a piena
  larghezza, numero e funzione a sinistra, spiegazione estesa a destra
  — non più le brevi frasi tecniche di prima, ma testo che dice cosa
  succede e perché conta quando premi quel passo (es. Proposta: non più
  "Acquisizione della proposta e verifica di ricevibilità", ma la
  spiegazione di cosa succede alla riga rilevante quando la ricevibilità
  non torna).
- **Corretta anche la descrizione di Simulazione**, rimasta ferma al
  vecchio design "tre scenari" — ora riflette la biforcazione reale
  Redigente/Ricevente.
- **Sistemato un gap preesistente**: la Panoramica non filtrava i passi
  per i permessi dell'Operatore/Consultatore (lo faceva solo il vecchio
  stepper) — ora lo fa anche lei, coerente col resto.
- **Effetto collaterale positivo**: il layout non fa più le 5 query
  parallele che servivano solo a colorare lo stepper — ogni pagina
  scenario carica un po' più leggera.

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa.

## 0.64.0 — 2026-08-05 (novantaseiesima consegna)

**8 punti del feedback INPS in un colpo solo — riepilogo organizzato per testare mirato, non a tappeto**

Otto punti diversi, di peso molto diverso — dal riallineamento di un
campo al ripensamento di come un intero modulo riceve i dati.
Raggruppati qui per area, con cosa testare per ciascuna.

### Check List custom — flessibilità massima (punto 4)

Prima: 7 colonne fisse, solo le etichette personalizzabili. Ora: tutte
disattivabili e rietichettabili tranne "Domanda" — con un ripiego
automatico per ciascuna se disattivata (sezione unica generata, ID
progressivo, peso di default a livello di modello). Più fino a 3 campi
propri, puramente informativi.

**Da testare**: Parametri di Spazio → Check List → colonne. Disattiva
"Sezione" e importa un Excel senza quelle colonne — deve finire tutto
in una sezione sola, non dare errore. Disattiva "Peso" e importa senza
quella colonna — ogni domanda deve prendere il peso di default che hai
impostato. Aggiungi un campo tuo e verifica che compaia nell'export e
venga riletto in import.

### Anagrafica Ente — 10 campi con flag, ID Ente meno prominente (punti 6, 9)

Da 5 campi fissi a 10, ciascuno disattivabile. L'ID Ente (probabilmente
il campo a cui ti riferivi) spostato in fondo al form, etichettato come
riferimento facoltativo invece di essere il primo campo.

**Da testare**: Parametri di Spazio → Anagrafica Ente — attiva qualche
campo oltre ai primi 5, verifica che compaia in Posizione Ente. Verifica
che l'anagrafica risulti "compilata" (sblocca Check List/Situazione
Debitoria) anche se solo un campo tra il 6 e il 10 è pieno.

### Parametri di sistema — licenza reale, non più dati morti (punto 7)

La vecchia fonte ("Soglie Normative CCII") non aveva più nessuna
interfaccia superadmin che la scrivesse. Sostituita con la licenza
operativa reale dello spazio: tier, limiti, scadenza, funzioni plus.

**Da testare**: Parametri di Spazio → Parametri di sistema — deve
mostrare la licenza vera di quello spazio, non un elenco vuoto o dati
vecchi.

### Situazione Debitoria — confronto rimosso, XBRL più onesto (punti 11, 16)

Tolto il "Confronto con la Proposta" (prematuro in questa fase — pulito
anche il codice diventato morto per questa rimozione, tre file a
cascata). XBRL già caricato in una sessione precedente ora mostra
subito il pannello completo (indici, situazione debitoria) invece di un
riepilogo vuoto.

**Da testare**: apri Situazione Debitoria — non deve più comparire il
confronto. Riapri la pagina XBRL di uno scenario dove avevi già caricato
un bilancio — deve comparire subito il pannello con gli indici, non un
messaggio a video senza numeri.

### Posizione Aggiornata — formattazione coerente (punto 17)

Il terzo campo (editabile) ora si presenta come le altre due colonne
(punti delle migliaia) invece di mostrare il numero grezzo — e accetta
la virgola come decimale in scrittura.

**Da testare**: apri Posizione Aggiornata, verifica che il valore si
presenti formattato come le colonne accanto, e che scrivere con la
virgola (es. "23070354,25") funzioni.

### Situazione Debitoria — il pezzo grosso: modello adattivo, non più esportato da noi (punto 13)

Cambiamento di natura diversa da tutto il resto del progetto: prima
esportavamo un modello fisso da compilare e reimportare, come ovunque
altrove. Ora il sistema assorbe la struttura del **primo file che l'ente
carica** — quello che già usa nella propria contabilità — e la fissa
come riferimento per l'intero spazio. Al primo caricamento, un pannello
chiede di riconoscere ciascuna colonna del file (Voce/Importo/Tipo/Nota,
Importo e Tipo obbligatorie) e di mappare i valori trovati nella colonna
Tipo su CLE/CEN/CEC/CEA. Da lì in poi ogni caricamento successivo si
applica automaticamente, senza richiedere altro — se il file non
corrisponde più alla struttura riconosciuta (numero di colonne diverso),
lo segnala invece di leggerlo a caso. Cambiare modello richiede una
conferma testuale esplicita e cancella ogni riga già inserita, in tutti
gli scenari dello spazio, non solo quello corrente.

**Da testare con più attenzione degli altri punti**, è il cambiamento
più strutturale di questa consegna: prova a caricare un file con le tue
colonne (in un ordine e con nomi diversi da "Voce/Importo/Tipo/Note"),
verifica che il pannello di mappatura le riconosca correttamente,
completa la mappatura e verifica che le righe vengano importate bene.
Poi prova a caricare un secondo file con la stessa struttura — deve
funzionare senza richiedere di nuovo la mappatura. Prova anche a
caricare un file con un numero di colonne diverso — deve segnalarlo,
non tentare di leggerlo comunque. Infine prova "Cambia modello" e
verifica che cancelli davvero tutto, in tutti gli scenari dello spazio.

**Nota**: `esportaDebitiEnteExcel` ora serve solo per scaricare/rivedere
i dati già inseriti (consultazione), non più come modello da ricompilare
— e `importaDebitiEnteExcel` (il vecchio formato a 4 colonne fisse) resta
nel codice per compatibilità ma non è più raggiungibile dall'interfaccia.

---

Verificato per l'intero batch: type-check (entrambi i controlli
automatici), lint, 56 test, build completa — inclusa una crescita
misurabile di `/posizione-ente` (11,2 kB, prima 9,92 kB) a conferma che
il pannello di mappatura è davvero nel bundle.

Resta aperto, non affrontato in questa consegna: il punto 8 (doppia
esposizione nello stepper).

## 0.63.0 — 2026-08-05 (novantacinquesima consegna)

**Punto 3 — le funzioni plus vivono ora nella Licenza Commerciale, ereditate dallo spazio alla creazione**

- **Nuova scheda "Funzioni Plus"** in Licenze Commerciali: il superadmin
  imposta qui i default (Dati di Settore, Simulazione, Relazione AI) per
  quella licenza — non più tre checkbox scelti ad hoc ogni volta che si
  crea uno spazio.
- **Creazione spazio**: i checkbox sono spariti — al posto loro, una
  visualizzazione in sola lettura di cosa la licenza commerciale
  selezionata eredita, così l'operatore vede subito cosa sta ereditando
  invece di doverlo scegliere di nuovo.
- **Non retroattivo**: gli spazi già esistenti restano su quanto
  scelto quando sono stati creati — modificabile singolarmente da
  Manutenzione Spazi, come già prima. Cambiare i default sulla licenza
  vale solo per i nuovi spazi creati da quel momento in poi — stesso
  principio già visto altrove nel progetto (un modello aggiornato non
  cambia chi ne ha già fatto una copia propria).

Verificato: type-check (entrambi i controlli), lint, 56 test, build
completa — cresciuta la dimensione di `/superadmin/Licenze` (nuova
scheda) e ridotta quella di `/superadmin/Spazi` (checkbox rimossi),
coerente con il cambiamento.

## 0.62.0 — 2026-08-04 (novantaquattresima consegna)

**Chiuso il pacchetto ENTE/NON ENTE/GIUDICANTE — punti 1, 2, 5, 12, 14 del feedback INPS**

- **Anagrafica dello Spazio**, prima non manutenibile per nulla dopo la
  creazione: ora modificabile (descrizione, tipo ENTE/NON ENTE, flag
  GIUDICANTE predisposto per il futuro) sia alla creazione sia dopo, da
  Manutenzione Spazi.
- **Limiti di ricevibilità**: per gli spazi ENTE, collassati da N
  categorie a una sola soglia — un ente a scopo singolo non deve
  destreggiarsi tra categorie che non lo riguardano.
- **Verifica ricevibilità semplificata per ENTE**: applicata direttamente
  alla riga rilevante, senza alcun matching per nome — eliminata
  l'ambiguità che causava il "sempre ricevibile" silenzioso.
- **Evidenza rossa sulla riga rilevante**, se non ricevibile — il banner
  di blocco/sblocco ora mostra l'esito e la motivazione, non serve più
  scendere nella tabella per scoprirlo.
- **CLE/CEN/CEC/CEA personalizzabili per spazio**: il codice resta fisso
  nel database, l'etichetta mostrata è configurabile (nuova sezione in
  Parametri di Spazio) — incluso l'export/import Excel, che riconosce
  sia il codice sia l'etichetta personalizzata al reimport.

Verificato: type-check (entrambi i controlli automatici — uno dei quali
ha correttamente bloccato un primo tentativo sbagliato), lint, 56 test,
build completa con conferma esplicita della nuova rotta.

## 0.61.0 — 2026-08-04 (novantatreesima consegna)

**Trovata la causa vera del caricamento PDF che falliva — un tetto di Vercel, non del codice**

Verificato: Vercel impone un limite di 4,5MB sul corpo di una funzione
serverless, a livello di infrastruttura — non aggirabile alzando il
`bodySizeLimit` di Next.js (quello governa solo il limite logico di
Next.js, non il tetto di Vercel a monte). Con 4 documenti insieme
(~2,65MB grezzi, ~3,5MB una volta codificati in base64) la richiesta
veniva respinta prima ancora che il mio codice venisse eseguito — da qui
il messaggio generico "Impossibile completare l'analisi".

**Corretto alla radice, non aggirato**: i PDF ora si caricano
direttamente dal browser su Vercel Blob Storage (bypassando
completamente il limite di corpo delle funzioni, dato che i byte grossi
non passano più per una Server Action) — la funzione riceve solo l'URL,
scarica il file da lì, lo passa a Claude, e lo elimina subito dopo
l'analisi (riuscita o fallita che sia), coerente con "i documenti non si
conservano" già dichiarato.

**Richiede un'azione tua**: verificare che il progetto abbia Vercel Blob
Storage collegato (scheda "Storage" nel progetto) — se non c'è, va
creato una volta. La variabile d'ambiente `BLOB_READ_WRITE_TOKEN` viene
di norma iniettata automaticamente da Vercel quando lo storage è
collegato, non serve configurarla a mano come per la chiave Anthropic.

Confermato anche: il Brogliaccio, quando sarà costruito, dovrà essere un
vero PDF scaricato e poi allegato come documento — non testo iniettato
nel prompt, come avevo proposto io. Design a 3 livelli confermato senza
modifiche.

## 0.60.1 — 2026-08-04 (novantaduesima consegna)

**Corretto: la Redigente aveva caselle numeriche, non le barre trascinabili con semaforo richieste — e verificato che gli scenari già esistenti si aggancino da soli**

Due segnalazioni, entrambe fondate:

- **Barre e semafori mancanti**: la consegna precedente aveva sostituito
  la specifica esplicita (una barra orizzontale trascinabile sotto ogni
  campo, con un semaforo sotto che si accende quando l'insieme torna in
  equilibrio) con semplici caselle numeriche e un unico pannello
  riassuntivo in cima — una deviazione reale dalla richiesta, non un
  dettaglio. Corretto: ogni campo (personale, giorni di incasso/
  pagamento, aliquote, numero rate, costi di produzione) ha ora una
  barra trascinabile affiancata da un valore numerico preciso
  modificabile a mano, con un piccolo semaforo sotto che riflette la
  viabilità corrente in tempo reale mentre si trascina — nessun bisogno
  di spostare lo sguardo su un pannello separato.
- **Verificato, non solo affermato, che gli scenari già esistenti non
  rischiano nulla**: simulato con un vero database locale uno scenario
  creato prima di questa consegna (nessuna delle tabelle nuove) — la
  pagina Simulazione si apre senza errori, la tabella si crea da sola al
  primo accesso, i valori di default coprono l'assenza di dati salvati,
  il primo salvataggio scrive correttamente. Nessuna azione manuale sul
  database richiesta, nessun rischio di perdita dati.

## 0.60.0 — 2026-08-04 (novantunesima consegna)

**Simulazione Ricevente — caricamento PDF, lettura AI incrociata con i dati già in piattaforma**

Sostituisce, per gli scenari Ricevuti, il vecchio strumento a tre
scenari (che non serviva più a nessun bisogno reale — chi valuta una
proposta non deve simulare, deve leggere criticamente). Un solo output:
un'analisi testuale che confronta quello che i documenti allegati alla
proposta dichiarano con i dati che la piattaforma ha già raccolto
(riga rilevante della Proposta, esito di ricevibilità, indici XBRL,
crescita storica dell'azienda confrontata col trend ISTAT del settore).

- **Solo PDF**: validati sia lato client (estensione/tipo) sia lato
  server (controllo sui byte reali del file, `%PDF-` — non ci si fida
  di un'estensione dichiarata dal browser, facile da falsificare).
- **I documenti non si conservano**: solo il risultato testuale
  dell'analisi resta salvato — sono documenti aziendali riservati, non
  c'è motivo di tenerli più del necessario.
- **Limite di dimensione alzato**: il default di Next.js per le Server
  Actions (1MB) era troppo piccolo per PDF reali — alzato a 25MB.

Con questa consegna, entrambi gli strumenti della Simulazione esistono:
Redigente (leve, un solo stato) per chi scrive, Ricevente (lettura
critica) per chi valuta.

**Da decidere**: `SimulazioneScenario.tsx`, il vecchio strumento a tre
scenari, è ora completamente orfano — nessuna pagina lo monta più.
Resta nel codice finché non si decide se eliminarlo o tenerlo
dormiente, come già fatto per altro codice superato in questo progetto.

## 0.59.0 — 2026-08-04 (novantesima consegna)

**Simulazione Redigente — costruita per intero, e la rotta biforca davvero per tipoProposta**

Separata la rotta PRIMA di scrivere l'interfaccia, come richiesto
esplicitamente — nessun codice scritto per poi essere abbandonato. Per
gli scenari Da Definire, `/simulazione` mostra ora uno strumento
completamente diverso da quello a tre scenari (che resta per i
Ricevuti): un solo stato, corretto leva per leva finché gli indici non
tornano in equilibrio, con ricalcolo istantaneo — nessuna chiamata al
server ad ogni movimento, lo stesso modulo di calcolo puro gira
direttamente nel browser.

- **Personale in 4 categorie** (operai/impiegati/quadri/dirigenti):
  numero e retribuzione lorda mensile media per categoria, aliquote
  previdenziali/INAIL configurabili (default richiesti: 36/40/42/45%
  previdenziale, 10/0,72/0,72/0,72% INAIL) — costo azienda calcolato
  automaticamente, non da inserire a mano.
- **Capitale circolante commerciale**: giorni medi di incasso e
  pagamento confrontati con una base convenzionale di 30 giorni
  (configurabile) — non un dato "attuale" da reperire, un punto di
  origine dichiarato.
- **Imposte separate**: aliquota sul reddito (default 43%, IRPEF —
  cambiabile a 24% per le società soggette a IRES) più IRAP (default
  3,9%), non più un unico numero fisso.
- **Rata dal cram down su una media dichiarata**: totale della Proposta
  diviso 84 rate (media indicativa tra 60 INPS, 72 Agenzia, 120 INAIL),
  configurabile.
- **Nuovo campo XBRL**: crediti verso clienti — aggiunto end-to-end
  (tipo, whitelist di sicurezza dei campi riconosciuti, mappatura tag
  con varianti, fallback, Posizione Aggiornata). **Richiede un'azione
  manuale**: rieseguire `src/db/sql/xbrl_tag_mappings.sql` sul database
  reale — è sicuro (`ON CONFLICT DO NOTHING`), ma non è automatico.
- 12 test sul modulo di calcolo Redigente (56 totali nel progetto),
  scritti e verificati prima di collegare qualunque interfaccia.

Scelta dichiarata: le aliquote previdenziali/INAIL vivono per ora per
scenario, non in una sezione dedicata di Parametri di Spazio come i pesi
della Check List — per non bloccare questa consegna dietro una
configurazione condivisa non ancora costruita. Si sposta lì in un
secondo momento, se serve condividerle tra scenari dello stesso spazio.

Resta da costruire: lo strumento per chi RICEVE (caricamento PDF,
lettura AI incrociata con i dati già in piattaforma) — un lavoro
diverso, non una variante di questo.

## 0.58.0 — 2026-08-03 (ottantanovesima consegna)

**Simulazione — trovata la causa vera del -40% che non tornava, e una quarta leva sui ricavi**

Verificato sui tuoi numeri esatti (Posizione Aggiornata a esattamente
1/4 di ogni voce 2024): il campo data della Posizione Aggiornata
esisteva già in tabella, si compilava, si salvava — ma la Simulazione
non lo leggeva mai, trattando sempre il dato come se coprisse un anno
intero. Un bilancino trimestrale confrontato con un anno pieno produce
matematicamente un crollo che non esiste nella realtà — è quello il
-40% che vedevi, non l'azienda che crolla.

- **Annualizzazione**: se la Posizione Aggiornata ha una data compilata
  che copre meno di 12 mesi, le sole voci di flusso (ricavi, costi,
  EBITDA — non lo stato patrimoniale, che è già un dato puntuale) si
  annualizzano prima di calcolare la crescita storica. Segnalato in
  interfaccia quando succede, e segnalato altrettanto chiaramente se la
  data manca (il calcolo prosegue col dato grezzo, ma va saputo).
- **Nuova leva**: "Crescita ricavi (%/anno) — sostituisce lo storico".
  Vuota = comportamento di sempre (trend storico). Compilata (anche a
  zero, per ricavi fermi) = sostituisce il trend storico come base per
  tutti e tre gli scenari — per i casi in cui l'operatore ha
  un'ipotesi propria, diversa da quella che il solo storico
  suggerirebbe.
- 2 nuovi test sulla leva (25 totali sul modulo), verificati con i
  numeri reali del bilancino prima di collegare la correzione
  all'interfaccia.

Restano aperti, come discusso: le leve sul capitale circolante (giorni
di incasso/pagamento) al posto di un apporto di capitale ipotetico, e
il suggerimento AI sui valori delle leve — entrambi più grandi, da
affrontare quando lo si concorda nel dettaglio.

## 0.57.1 — 2026-08-03 (ottantottesima consegna)

**Il pulsante "blocca la riga" — c'era, ma era invisibile**

Verificato nel codice: non era una regressione, esisteva dalla consegna
che lo introdusse — ma piazzato malissimo, un'iconcina minuscola dentro
l'intestazione di una colonna della tabella, indistinguibile da
un'etichetta decorativa. Spostato in un banner ben visibile sopra la
tabella (solo per le proposte Ricevute): mostra la riga rilevante
scelta, e un pulsante vero, con testo, per bloccarla o sbloccarla.

## 0.57.0 — 2026-08-03 (ottantasettesima consegna)

**Licenza business — funzioni plus attivabili una per una, per spazio**

Tre funzioni non incluse nella licenza base — Dati di Settore,
Simulazione, Relazione AI — partono disattivate per ogni spazio e si
attivano singolarmente dal superadmin. Restano sempre inclusi nella
licenza base: Posizione Ente, Proposta, XBRL, Posizione Aggiornata,
Indici, Check List, Brogliaccio, e l'assistente/chatbot (confermato
esplicitamente in base, per vantaggio competitivo).

- **Schema**: tre colonne su `licenze_spazio` (`plus_dati_settore`,
  `plus_simulazione`, `plus_relazione_ai`), tutte `DEFAULT FALSE`.
- **Protezione a due livelli**: le tre pagine mostrano un messaggio
  "non inclusa nella licenza" al posto del contenuto se il flag è
  spento — e lo stesso controllo è ripetuto **dentro le azioni server**
  con un costo reale (chiamata Anthropic per la Relazione AI, chiamata
  ISTAT rate-limited per Dati di Settore): un accesso diretto
  all'azione, bypassando l'interfaccia, resta comunque bloccato.
- **Attivabili sia alla creazione** di un nuovo spazio (tre checkbox in
  Spazi di Lavoro) **sia dopo**, su uno spazio già esistente (tre
  pulsanti in Manutenzione Spazi, per un cliente che passa a un piano
  superiore in un secondo momento).

Nota aperta: **Simulazione trattata come plus per coerenza con
Relazione AI e Dati di Settore** — non era mai stata esplicitamente
elencata né tra le funzioni base né tra quelle plus, resta da
confermare.

## 0.56.0 — 2026-08-03 (ottantaseiesima consegna)

**Dump dati portabile e azzeramento completo del database — entrambi testati con un round-trip reale, non solo type-check**

Verificato prima di costruire: `pg_dump` non è utilizzabile da una
funzione serverless su Vercel (nessun binario di sistema installabile a
runtime) — e Railway offre già backup nativi del volume con pulsante di
lancio manuale e recovery puntuale, quindi non ha senso duplicarlo. Le
due funzioni costruite hanno uno scopo diverso e specifico:

- **Dump Dati Portabile** (Parametri di Sistema → Dati e Manutenzione):
  esporta tutti i dati — non lo schema — di ogni spazio in un file .sql
  scaricabile, scritto in TypeScript puro (stessa connessione `pg` usata
  ovunque nel progetto), pensato per una futura migrazione di
  infrastruttura, non come backup di sicurezza. **Testato con un vero
  ciclo completo**: generato, svuotate le tabelle, reimportato, dati
  tornati identici — incluse colonne JSONB e timestamp.
- **Azzeramento Completo del Database**: stessa identica logica già
  scritta in `reset_database.sql`, ora richiamabile da un pulsante
  invece che da un client esterno — protetta da una frase di conferma
  esplicita da scrivere ("AZZERA TUTTO"), non un semplice click.
  Pensata per un solo uso, dopo aver dichiarato conclusa la versione
  stabile definitiva. **Testata su un database reale**: schemi tenant
  eliminati, tabelle globali svuotate, una tabella di controllo fuori
  elenco rimasta intatta.

## 0.55.1 — 2026-08-03 (ottantacinquesima consegna)

**Superadmin — fase 1 continua: tre voci di navigazione tolte, una eliminata per davvero**

- **Dizionario Indici** e **Analisi XBRL**: tolte dalla barra laterale
  (superate dalla gestione ormai spostata dentro gli spazi) — codice e
  pagine restano intatti, dormienti, raggiungibili solo con l'URL
  diretto. Verificato per trasparenza: il Dizionario Indici non
  alimentava comunque il motore di calcolo reale (che usa formule fisse
  nel codice) — nasconderlo non toglie nulla di funzionante.
- **Check List — modello base**: eliminata per davvero, non solo
  nascosta — l'editor JSON grezzo non aveva senso per un riferimento
  normativo (le 56 domande della Sezione II del decreto ministeriale),
  e la configurazione vera oggi si fa a livello di spazio. Il meccanismo
  che ne dipendeva (la "foto" che ogni nuovo spazio scatta alla prima
  apertura della Check List) continua a funzionare esattamente come
  prima — attinge sempre alla costante nel codice, semplicemente non più
  attraverso una copia editabile nel database.

## 0.55.0 — 2026-08-03 (ottantaquattresima consegna)

**Ripulito superadmin — fase 1 (pulizia): codice morto rimosso, "Soglie Normative CCII" eliminata, log di backup finto tolto**

Prima fase di una ristrutturazione più ampia di superadmin, concordata
dopo aver verificato il codice reale (non a memoria):

- **Rimosso codice mai raggiungibile**: `SuperAdminDashboard.tsx` (un
  intero componente mai montato da nessuna pagina, con link rotti verso
  una cartella inesistente e un refuso in un altro), le pagine orfane
  `/superadmin/CramDown` e `/superadmin/Rabc` (raggiungibili solo
  digitando l'URL a mano — nessun menu ci ha mai linkato).
- **Eliminata la scheda "Soglie Normative CCII"**: verificato che i suoi
  valori (soglia DSCR, margine operativo, ecc.) non fossero letti da
  nessuna parte della logica reale della piattaforma (ricevibilità e
  punteggio Check List usano tutt'altre tabelle) — erano numeri che
  sembravano governare l'applicativo senza toccare nulla.
- **Tolto il log storico backup, che era finto**: un array scritto a
  mano nel codice con un'unica riga inventata, presentato come "log di
  sistema in sola lettura". Sostituito con un'indicazione onesta — il
  percorso si salva, ma nessun processo lo usa ancora davvero.

Restano da affrontare, nell'ordine deciso insieme: backup reale
(quantità di copie, pulsante di lancio manuale), il nuovo modulo
"licenza business" con le funzioni plus (Dati di Settore, Simulazione,
Relazione AI, chatbot guidato confermato invece in licenza base), lo
script di inizializzazione database per un ambiente completamente vuoto,
e la possibilità per il superadmin di impostare i valori di partenza che
un nuovo spazio eredita.

## 0.54.1 — 2026-08-03 (ottantatreesima consegna)

**Simulazione: due difetti reali trovati testando su dati veri, corretti**

- **Il risparmio da riduzione costi era ancorato al livello storico
  assoluto, non ai ricavi proiettati**: un solo punto percentuale di
  riduzione costi faceva saltare il flusso disponibile di importi
  enormi, identici in ogni anno e in ogni scenario — matematicamente
  coerente con la formula scritta, ma concettualmente sbagliato quando
  lo scenario si allontana molto dal livello storico (specialmente nel
  pessimistico). Corretto: il risparmio ora scala con i costi
  **proiettati** di quell'anno e scenario specifico.
- **Nessun tetto massimo sull'ampiezza degli scenari**: con un trend
  storico aziendale già estremo (tipico di un'azienda in crisi grave),
  lo scarto misurato produceva scenari clamorosamente sproporzionati
  (visto un caso reale: neutrale -40%/anno, pessimistico -82%/anno).
  Aggiunto un tetto dichiarato (15 punti percentuali) accanto al minimo
  già esistente — segnalato esplicitamente in interfaccia quando si
  applica, non silenzioso.
- **Trasparenza sulla base del piano**: la leva "Allungamento piano
  (mesi)" ora mostra a fianco quanti mesi ha già il piano in Proposta
  prima dell'allungamento — prima non c'era alcuna indicazione, rendendo
  impossibile giudicare se un valore inserito fosse ragionevole.
- 2 nuovi test unitari mirati sui due difetti (19 totali sul modulo),
  scritti PRIMA di collegare la correzione all'interfaccia.

## 0.54.0 — 2026-08-03 (ottantaduesima consegna)

**Simulazione — attivata, con formula concordata e verificata da test unitari prima di essere collegata all'interfaccia**

Il passo "Simulazione" (numero 7) è ora attivo — prima segnato "Presto".
Tre scenari di crescita ricavi a 3 anni (ottimistico/neutrale/
pessimistico), l'ampiezza tra loro ancorata al confronto reale tra il
trend storico dell'azienda (XBRL + Posizione Aggiornata) e il trend
storico del settore (Dati di Settore ISTAT) — non percentuali
arbitrarie. Tre leve manovrabili (riduzione costi operativi, riduzione
costo del personale, allungamento del piano di rientro). Il criterio di
viabilità è il DSCR proiettato: uno scenario è viabile solo se resta
≥ 1 in tutti e 3 gli anni, non in media.

- **Il calcolo è sempre deterministico** (`src/lib/simulazione/calcolo.ts`),
  mai generato dall'AI — 17 test unitari scrivono la formula prima di
  collegarla all'interfaccia, non dopo.
- **Nessun nuovo inserimento manuale** a parte le tre leve: tutto il
  resto (ricavi storici, margine EBITDA, rata del piano) viene dai dati
  già presenti nello scenario.
- **Semplificazioni dichiarate in interfaccia, non nascoste**: aliquota
  fiscale forfettaria (24%), riduzione costi e riduzione personale sulla
  stessa base di calcolo (il bilancio XBRL non isola una voce di costo
  del personale separata), scarto di default se i Dati di Settore non
  sono disponibili per quell'azienda.
- Nuovo modulo di permesso granulare ("simulazione") accanto agli altri.

Resta da fare, come prossimo passo naturale: il Brogliaccio, che
riepiloga anche l'esito di questa Simulazione una volta salvata.

## 0.53.0 — 2026-08-03 (ottantunesima consegna)

**L'assistente riconosce anche le sei sezioni di Parametri di Spazio**

Confermato con uno screenshot: su "Check List — etichette delle colonne
Excel" (Parametri di Spazio) l'assistente rispondeva col saluto
generico, come se non fosse in nessuna pagina specifica — perché non lo
era, per come l'avevo costruito: il contesto era dichiarato solo dalle
pagine compilabili in conversazione (Anagrafica, Check List, Situazione
Debitoria, Proposta, XBRL), non dalle pagine di configurazione.

Aggiunto un nuovo tipo di contesto ("parametri", con un'etichetta di
sezione) e collegato a tutte e sei le sezioni di Parametri di Spazio
(Limiti di ricevibilità, Tab XBRL, Indici, Check List, Anagrafica Ente,
Parametri di sistema). Non compilano nulla in conversazione (sono
impostazioni singole, non righe ripetute) — ma l'assistente ora sa
esattamente su quale sezione si trova e la spiega, invece di rispondere
come se fosse ovunque e in nessun posto.

## 0.52.1 — 2026-08-03 (ottantesima consegna)

**L'assistente generico non disclama più sulle domande operative — chiede, quando serve, invece di rimandare altrove**

Confermato con un esempio reale: a "come posso caricare le situazioni
relative all'ente?" e "come posso utilizzare la posizione ente?",
l'assistente rispondeva con un disclaimer ("non ho visibilità
sull'interfaccia... contatta l'assistenza") — un comportamento inutile e
respingente per chi fa proprio il tipo di domanda per cui un assistente
dovrebbe servire.

Corretto il prompt: ora distingue tra non avere accesso ai **dati
specifici** di questo caso (limite reale, resta) e non conoscere la
**piattaforma in generale** (falso — la conosce, ha una mappa completa
delle sue funzioni). Su una domanda operativa ambigua, non rimanda più
genericamente altrove: fa una domanda di chiarimento concreta proponendo
la sua migliore ipotesi (es. "Intendi la Posizione Ente, dove registri
anagrafica, check list e situazione debitoria dell'ente che riceve la
proposta?") — poi guida davvero, con la stessa mappa della piattaforma
che ho usato per il manuale.

## 0.52.0 — 2026-08-03 (settantanovesima consegna)

**Un solo assistente, sempre nello stesso posto — non più quattro chat nascoste dentro ogni funzione**

Ristrutturazione di impianto: le quattro modalità "Guidata" separate
(Anagrafica, Situazione Debitoria, Check List, Proposta), ciascuna dietro
un interruttore "Libera/Guidata" da scoprire funzione per funzione, sono
sparite. Al loro posto, un solo assistente flottante — sempre in basso a
destra, sempre uguale a sé stesso — che riconosce dal contesto su quale
funzione ci si trova e si comporta di conseguenza:

- Su Anagrafica, Situazione Debitoria, Check List, Proposta: compila
  davvero, in conversazione — stesse azioni server di prima, nessuna
  perdita di capacità.
- Su Import XBRL: non può caricare un file al posto dell'operatore (è
  un'azione fisica), ma guida passo per passo cosa fare.
- Ovunque altro, o per domande generali: risponde come assistente di
  cultura generale, come già faceva.

Tecnicamente: un contesto React (`ContestoAssistenteContext`) dice
all'assistente dove si trova l'utente; un unico dispatcher
(`assistenteContestuale.ts`) smista alla funzione già costruita giusta
senza duplicarne la logica. I quattro componenti di chat incorporata e i
relativi interruttori sono stati rimossi — il form libero è ora sempre
l'unica cosa visibile in pagina, l'assistente è sempre nello stesso
angolo per chi preferisce farsi guidare.

## 0.51.1 — 2026-08-03 (settantottesima consegna)

**Rimosso "Riepilogo per rango legale" dalla Proposta, sostituito da un confronto con la Situazione Debitoria dell'Ente**

Confermato: la rimozione era già stata chiesta in precedenza ma non era
mai stata completata (verificato nel codice, non a memoria). Al suo
posto, per le proposte Ricevute, un confronto numerico tra la riga
segnata come rilevante e il totale dichiarato dall'ente in Posizione
Ente — stessa logica già in uso in Situazione Debitoria, vista dal lato
opposto. Quello esistente in Situazione Debitoria resta invariato (utile
lì per l'avviso sul blocco della riga).

**Chiarito, non un difetto**: l'errore "Chiave API ANTHROPIC_API_KEY non
configurata nel server" nella compilazione guidata è una variabile
d'ambiente mancante su quello specifico deployment, non un bug — va
aggiunta nelle impostazioni del server, come già per la Relazione AI che
usa la stessa chiave.

## 0.51.0 — 2026-08-02 (settantasettesima consegna)

**Proposta guidata — quinto passo. XBRL resta solo libera, per scelta esplicita**

- **XBRL**: confermato che una guida conversazionale non avrebbe aggiunto
  nulla (caricare un file è un'operazione meccanica, non c'è niente da
  interpretare in linguaggio naturale) — lasciato solo in modalità
  libera, nessun involucro superfluo costruito.
- **Proposta guidata**: toggle "Libera"/"Guidata" nella vista di
  Acquisizione della proposta. Raccoglie una riga alla volta (creditore,
  importo, percentuale offerta, modalità, rango legale facoltativo) e la
  salva davvero. Solo per le proposte **Ricevute**, può segnare quale riga
  riguarda l'ente — ma non la blocca: il blocco resta un'azione
  deliberata dal form libero, non qualcosa che una conversazione decide
  da sola. Per le proposte **Da definire**, quella parte non viene
  nemmeno proposta (tutte le righe hanno pari importanza, coerente con
  quanto già stabilito).
- Tabella, riepilogo per rango, esito complessivo restano sempre visibili
  sotto, in entrambe le modalità.

Con questo, il percorso guidato copre tutti i passi a cui si presta
davvero: Anagrafica, Situazione Debitoria, Check List, Proposta. XBRL
resta libera per scelta, non per lavoro mancante.

## 0.50.0 — 2026-08-02 (settantaseiesima consegna)

**Check List guidata — terzo passo dello stesso schema**

Costruita da zero questa volta (non c'era nulla di preesistente,
verificato prima di iniziare). Diversa dagli altri due passi: qui non si
aggiunge un dato nuovo, si risponde a domande già definite dal modello
scelto (Ministeriale o custom) — la guida conosce l'elenco completo delle
domande di quel modello, quali hanno già una risposta, e quali sono state
escluse per questo scenario (non le richiede, rispetta la stessa scelta
fatta nel form libero).

- Toggle "Libera"/"Guidata" nella vista di dettaglio di ogni modello,
  stesso posto e stile degli altri due.
- Procede per sezione, una domanda alla volta, salvando davvero ogni
  risposta con la stessa azione del form libero — non serve rispondere a
  tutte le 56 per proseguire lo scenario.
- Il resto della pagina (quadro qualitativo, filtri, export/import)
  resta identico e sempre raggiungibile passando a "Libera".

Resta, nello stesso schema: Proposta e XBRL — entrambi più articolati
(un file da caricare, o un impianto di ricevibilità con soglie), da
affrontare con più cautela quando si arriva a quel punto.

## 0.49.0 — 2026-08-02 (settantacinquesima consegna)

**Situazione Debitoria guidata — secondo passo dello stesso schema**

Il motore server (`chiediGuidaDebitiEnte`) esisteva già dalla sessione
precedente — trovato verificando, non a memoria, come per l'Anagrafica.
Mancava solo l'interfaccia: costruita seguendo esattamente lo stesso
schema già collaudato.

- Toggle "Libera"/"Guidata" in Posizione Ente → Situazione Debitoria,
  stesso posto e stesso stile del toggle già in Anagrafica.
- La guida raccoglie una voce di debito alla volta (descrizione,
  importo, classificazione CLE/CEN/CEC/CEA) e la salva davvero, con la
  stessa azione del form libero — non un salvataggio finto.
- Il confronto con la Proposta resta sempre visibile in fondo alla
  pagina, indipendentemente dalla modalità scelta per inserire i dati.

Restano da fare, nello stesso schema, un passo alla volta: Check List,
XBRL, Proposta.

## 0.48.1 — 2026-08-02 (settantaquattresima consegna)

**Confermato il 2.3 (nessuna modifica necessaria) — e un conflitto trovato e risolto sul chatbot guidato**

- **Punto 2.3**: verificato di nuovo nel codice — il confronto numerico
  tra riga rilevante della Proposta e Situazione Debitoria esisteva già
  (voce 0.48.0), corrisponde esattamente a quanto descritto: puramente
  numerico, nessun tentativo di spiegare il perché. Confermato, nessuna
  modifica.
- **Chatbot guidato**: nell'affrontarlo mi sono accorto — verificando,
  non supponendo — che esisteva già un'implementazione funzionante da
  una sessione precedente (`chatGuidato.ts`, il toggle "Libera"/"Guidata"
  nell'Anagrafica) che avevo perso di vista. Avevo iniziato a costruirne
  una seconda, diversa e in conflitto, prima di accorgermene. Rimossa la
  mia, verificata quella esistente end-to-end (type-check, lint, test,
  build tutti puliti) — è solida, gestisce correttamente anche un caso
  che la mia non copriva (non sovrascrivere un campo già salvato se
  l'utente non lo rimenziona in un turno successivo).

## 0.48.0 — 2026-08-02 (settantatreesima consegna)

**Confermato: il confronto 2.3 esisteva già — e primo passo del chatbot guidato per l'ente**

- **Punto 2.3**: verificato nel codice, non da memoria — il confronto
  numerico tra riga rilevante della Proposta e totale Situazione
  Debitoria esisteva già (costruito diverse consegne fa), corrisponde
  esattamente a quanto descritto: puramente numerico, nessun tentativo di
  spiegare il perché di una discrepanza. Nessuna modifica necessaria.
- **Chatbot guidato — primo passo (Anagrafica Ente)**: diverso
  dall'assistente "dotto" di cultura generale (0.47.0), questo compila
  davvero i dati in conversazione, con tool-use reale verso la stessa
  azione di salvataggio usata dal form libero — non finge di salvare, lo
  fa. L'operatore sceglie "Libera" o "Guidata" in cima alla scheda
  Anagrafica di Posizione Ente. Un passo alla volta, il resto del
  percorso (Check List, Situazione Debitoria, Proposta, XBRL, Indici)
  seguirà lo stesso schema nelle prossime consegne — costruirlo tutto
  insieme sarebbe stato troppo rischioso da spedire senza prova
  intermedia sul primo pezzo.

## 0.47.0 — 2026-08-02 (settantaduesima consegna)

**Parametri di Spazio → Check List: due macro schede invece delle 56 domande in vista — e nuovo assistente "dotto"**

- **Check List in Parametri di Spazio**: separata "Valori numerici e
  soglie" (condivisi tra Ministeriale e custom, sempre in vista) dal
  "Peso per domanda" (56 domande, ora dietro la scheda "Check List
  Ministeriale"). Due macro raggruppamenti — Ministeriale e Customizzate
  — stesso principio già applicato allo Scenario e a Posizione Ente. Il
  link diretto ai modelli vuoti (0.45.2) continua a funzionare, salta
  dritto alla scheda giusta.
- **Nuovo assistente "dotto"**: un pulsante flottante in basso a destra,
  ad uso facoltativo, disponibile su tutte le pagine dello spazio.
  Risponde a domande di cultura generale (indici di bilancio,
  terminologia CCII, classificazioni ATECO...) — non conosce i dati
  specifici del caso su cui si sta lavorando, lo dichiara esplicitamente
  quando serve. Usa la ricerca web quando la domanda richiede
  un'informazione recente o incerta, invece di supporre. Stesso motore
  già in uso per la Relazione AI (stessa chiave, stesso modello).

## 0.46.1 — 2026-08-02 (settantunesima consegna)

**Posizione Ente: Anagrafica obbligata prima di sbloccare le altre schede, riepilogo sempre visibile**

- Check List e Situazione Debitoria restano bloccate (lucchetto, non
  cliccabili) finché l'Anagrafica non ha almeno un campo compilato e
  salvato — validato anche lato server, non solo in pagina.
- Una volta sbloccate, un riepilogo compatto dei dati anagrafici
  compilati resta sempre visibile sopra Check List e Situazione
  Debitoria: chi le compila sa sempre su quale ente sta lavorando, senza
  dover tornare indietro a controllare.

## 0.46.0 — 2026-08-01 (settantesima consegna)

**Check List: esclusione domande anche da export/import Excel, non solo dall'interruttore in pagina**

Nuova colonna "Applicabile a questo scenario" (Sì/No) nell'Excel già
esistente — non un nuovo file, un'aggiunta a quello che c'era già.
Esportando riflette lo stato attuale (Sì di default, No se già esclusa
da sistema); importando, scrivere No esclude quella domanda dal
punteggio esattamente come farebbe l'interruttore in pagina — stesso
dato, due modi di modificarlo, sempre coerenti perché scritti dalla
stessa azione server.

## 0.45.2 — 2026-08-01 (sessantanovesima consegna)

**Check List: le schede dei modelli vuoti collegano direttamente a Parametri di Spazio**

Come indicato: cliccare una check list custom senza ancora domande non
apre più un dettaglio vuoto nello Scenario — porta dritti a Parametri di
Spazio → Check List, con quel modello già aperto in modifica (non un
elenco da cercare a mano). Una volta popolato via Excel, la scheda torna
a comportarsi come le altre (apre il dettaglio per compilarlo).

## 0.45.1 — 2026-08-01 (sessantottesima consegna)

**ISTAT: risolto con l'elenco completo dei codici — non un formato sbagliato, un livello di dettaglio diverso per divisione**

Con l'elenco completo (53 codici, non più troncato) si vede chiaramente:
"49" compare da solo, a due cifre, insieme a "50", "51", "52", "53" —
mentre altre divisioni (45, 46) hanno il dettaglio fine a tre cifre
(451, 452, 453...). Non è un formato sbagliato: ISTAT pubblica il
dettaglio a gruppo (3 cifre) solo per alcune divisioni, per altre si
ferma alla divisione (2 cifre) — probabilmente per significatività
statistica del campione.

- **Corrispondenza a cascata**: si prova prima il gruppo richiesto (3
  cifre), se assente si ripiega sulla divisione (2 cifre) — sugli stessi
  dati già scaricati, senza consumare un'altra chiamata a ISTAT.
- **Trasparenza**: quando si usa la divisione invece del gruppo, un
  avviso lo dice esplicitamente in Dati di Settore — il confronto a quel
  punto include anche altre attività della stessa divisione, non solo
  quella specifica dell'azienda, e chi legge il dato deve saperlo.

## 0.45.0 — 2026-08-01 (sessantasettesima consegna)

**Check List: schermata di ingresso invece delle 56 domande subito in vista**

- La pagina Check List dello Scenario ora si apre su un elenco di schede
  (una per modello: Ministeriale + eventuali custom), non più con la
  Ministeriale già aperta e tutte le domande in vista — stesso principio
  già usato per Posizione Ente. Si "scatena" il contenuto solo cliccando
  la scheda giusta, con un "← Elenco Check List" per tornare indietro.
- **ISTAT**: l'elenco dei codici realmente presenti nella colonna ATECO,
  in caso di mancata corrispondenza, ora è completo — non più troncato ai
  primi 15. Con l'evidenza del formato "45_46" (divisioni aggregate con
  underscore), serve vedere l'elenco intero per capire se e come il
  gruppo 49 è aggregato, invece di continuare a tagliare l'informazione
  utile a metà.

## 0.44.3 — 2026-08-01 (sessantaseiesima consegna)

**Il 500 di ISTAT è superato — ora un messaggio diagnostico reale invece di un'altra ipotesi alla cieca**

Buona notizia confermata: l'header `Accept-Language` aggiunto nella
consegna precedente ha risolto il 500 — ISTAT risponde, i dati arrivano,
il formato viene riconosciuto correttamente. Il passo successivo (il
gruppo ATECO richiesto, "49.4", non trovato tra i valori) non è un
errore da correggere alla cieca con un altro formato ipotizzato: ora il
messaggio mostra i **codici realmente presenti** nella colonna ATECO di
quel dataflow — che siano un formato diverso da quello atteso, o un
livello di dettaglio diverso, si vede direttamente dal dato vero, non da
un'altra supposizione mia.

## 0.44.2 — 2026-08-01 (sessantacinquesima consegna)

**ISTAT 500 persistente — tentativo di correzione mirato sul dettaglio "languageTag1"**

La correzione precedente (query più leggera) non ha risolto: il 500
persiste, ma ora con un dettaglio nel corpo della risposta grazie alla
diagnostica aggiunta l'ultima volta — "languageTag1", un indizio concreto
di un problema lato server nella negoziazione della lingua, tipico di
implementazioni SDMX-RI basate su Java che si aspettano sempre un header
`Accept-Language` e non gestiscono bene la sua assenza. Non lo mandavamo
affatto. Aggiunto (`Accept-Language: it`).

**Onestà**: non ho potuto verificarlo con una chiamata reale riuscita
(il limite di frequenza di ISTAT non permette di sperimentare
liberamente) — è un tentativo ragionato sul dettaglio ricevuto, non una
certezza. Se il 500 persiste ancora dopo questo, il messaggio d'errore
(già arricchito) darà un dettaglio nuovo su cui ragionare, invece di
continuare a tentare alla cieca.

## 0.44.1 — 2026-08-01 (sessantaquattresima consegna)

**Correzione: avevo frainteso "label di colonna" per "testo della domanda"**

Verificato con il tuo file esportato: l'authoring che avevo costruito
(0.44.0) generava sempre le stesse 6 colonne fisse, mai personalizzabili
— avevo capito "crea le label di colonna prima dell'export" come "scrivi
le domande in un form", e avevo costruito un inseritore riga-per-riga di
domande invece di un editor di intestazioni.

- **Rimosso** il form "aggiungi riga" di domande in pagina.
- **Nuovo, corretto**: "Check List — etichette delle colonne Excel" in
  Parametri di Spazio → Check List, stesso pattern già in uso per
  Anagrafica Ente — la struttura (sezione, ID, domanda, peso, a cura di,
  nota) resta fissa, il **testo** dell'intestazione si personalizza per
  spazio (es. "Area" invece di "Sezione Titolo", "Indicatore" invece di
  "Domanda", come nell'esempio INPS).
- **"Nuovo modello" ora crea solo la testata** (nome + descrizione, zero
  domande) — pronta subito per essere esportata (con le etichette
  configurate), lavorata in Excel, e reimportata. Le domande si scrivono
  lì, non più in un form dentro l'app.
- **Import ora legge per posizione di riga**, non confrontando il testo
  con un'intestazione fissa: le etichette personalizzate non rompono più
  la lettura.
- **Confermato con verifica nel codice**: la selezione delle domande
  "non applicabili" per scenario (già costruita nella consegna
  precedente) è presente e funzionante — vive nella pagina Check List
  dello Scenario, non in Parametri di Spazio.

## 0.44.0 — 2026-08-01 (sessantatreesima consegna)

**Domande escludibili per scenario, nuovo authoring riga-per-riga per le check list, correzione ISTAT 500**

- **Domande "non applicabili" per scenario**: qualunque modello (Ministeriale
  compresa) può ora avere singole domande escluse dal punteggio di UNO
  scenario specifico — il modello resta identico per tutti, non ogni
  domanda è pertinente a ogni caso (es. l'intero gruppo "Gruppo di
  imprese" se l'azienda non ne fa parte). La domanda esclusa resta
  visibile in chiaro (attenuata, non nascosta) — si deve sempre vedere
  cosa è stato escluso, non farlo sparire.
- **Costruzione delle check list riga per riga**: niente più solo Excel
  fin dall'inizio — si compila un piccolo form (sezione, domanda, peso,
  a cura di, nota facoltativa) direttamente in pagina, con una tabella
  che cresce riga dopo riga. Una volta che la bozza ha qualche domanda,
  export/import Excel restano disponibili per il lavoro massivo (molto
  più comodo lì che riga per riga per un modello con decine di domande).
- **Confermato**: le check list vivono a livello di Spazio, non di
  singola azienda — un'azienda eredita quelle dello spazio in cui opera,
  nessun bisogno di prefissare "INPS" o altro nel nome visto che lo
  spazio stesso è già quel contesto.
- **Correzione ISTAT — errore 500**: la query usava `lastNObservations`
  senza alcun filtro di chiave, chiedendo al server di scorrere
  potenzialmente migliaia di combinazioni di dimensioni per determinare
  "le ultime osservazioni" — un tipo di richiesta pesante, causa
  plausibile del 500. Sostituita con un intervallo di date esplicito
  (`startPeriod`), più leggero e standard. Aggiunta anche la cattura del
  corpo della risposta in caso di errore, per una diagnosi più precisa se
  dovesse ripresentarsi.

## 0.43.0 — 2026-08-01 (sessantaduesima consegna)

**"Posizione Debitoria dell'Ente" diventa "Posizione Ente" — anagrafica personalizzabile, Check List integrata — e le check list si costruiscono con Excel, non più con JSON**

Verificato prima con il file reale di scoring vigilanza INPS che mi hai
allegato: resta sul modello a Sì/No con tre pesi fissi già in uso, come
confermato — il caso INPS va semplificato per entrarci, non il
contrario.

- **"Posizione Ente"**: stesso passo "0" di sempre (solo proposte
  Ricevute), ora un contenitore con tre schede — Anagrafica, Check List
  (riuso diretto del sistema già costruito: Ministeriale + modelli
  custom dell'ente), Situazione Debitoria (quella che già c'era,
  invariata). Rotta rinominata da `/debiti-ente` a `/posizione-ente`.
- **Anagrafica Ente**: ID Ente fisso + 5 campi liberi con **etichetta
  personalizzabile** — le etichette si configurano una volta per spazio
  (nuova sezione in Parametri di Spazio), i valori si compilano scenario
  per scenario. Così INPS li chiama "Matricola", "Posizione Gestione
  Separata", "Codice CSC", "Codice CA" e un altro ente li chiama come
  preferisce, senza toccare codice.
- **Check list via Excel, non più JSON**: il textarea di testo è sparito
  — ora si esporta uno scheletro (vuoto o con le domande già presenti),
  si compila in Excel (Sezione, ID, Domanda, Peso, A cura di — una riga
  per domanda), si reimporta. Stesso principio già collaudato per
  Proposta e Posizione Debitoria: righe di istruzioni riconosciute,
  errori di formato segnalati riga per riga, non un fallimento
  silenzioso. La Ministeriale resta cablata così com'è (56 domande) —
  esportabile come scheletro di partenza per un nuovo modello, non
  sostituita.

## 0.42.1 — 2026-07-31 (sessantunesima consegna)

**Correzione: ISTAT rispondeva 404 alla prima chiamata reale**

Confermato esattamente il rischio segnalato onestamente nella consegna
precedente. Causa: avevo agganciato l'URL a una versione fissa del
dataflow (`IT1,119_367,1.3`) — le versioni ISTAT cambiano nel tempo (la
serie servizi è stata ribasata nell'aprile 2024, passando di versione),
e una versione fissa nel codice si rompe al primo aggiornamento
successivo. Rimossi agenzia e versione dall'URL, lasciando solo l'ID del
dataflow: è il formato che nella documentazione pratica compariva
ripetutamente come quello affidabile, e fa sì che l'endpoint usi sempre
l'ultima versione disponibile invece di una fissata nel codice.
Aggiunto anche un suggerimento diagnostico specifico per un futuro 404
(l'ID del dataflow potrebbe essere cambiato), per non dover ripartire
da zero se dovesse ripresentarsi.

## 0.42.0 — 2026-07-31 (sessantesima consegna)

**Dati di Settore (pezzo 4 di 7) — costruito dopo una ricognizione reale, non a tavolino**

Prima di scrivere codice, verificata la situazione vera: endpoint SDMX
ISTAT corrente (esploradati.istat.it, in uso dal 2022), dataflow reali
per fatturato industria/servizi, e soprattutto un vincolo che cambia
l'architettura — **5 richieste al minuto per IP, blocco di 1-2 giorni se
superato**. Verificato anche che, nonostante ATECO 2025 sia in vigore dal
2025, le serie ISTAT (comunicato più recente: 27 febbraio 2026) usano
ancora ATECO 2007 — la base su cui costruire oggi.

- **Mai una chiamata automatica a ISTAT**: solo su azione esplicita
  dell'operatore ("Aggiorna da ISTAT"), con un controllo che rifiuta la
  chiamata se l'ultima interrogazione reale è troppo recente (margine di
  sicurezza sotto il limite).
- **Cache condivisa e globale**, non per spazio: il dato è nazionale,
  identico per qualunque azienda con lo stesso gruppo ATECO — interrogare
  ISTAT una volta per spazio per lo stesso identico dato avrebbe solo
  aumentato il rischio di superare il limite.
- **Mappatura onesta**: dall'ATECO a 6 cifre dell'azienda al gruppo a 3
  cifre realmente disponibile nei dati ISTAT — e quando il settore non è
  coperto dall'indice (costruzioni, agricoltura, finanza, pubblica
  amministrazione, commercio al dettaglio...) lo dice esplicitamente,
  invece di restare in silenzio o inventare un confronto.
- **Onestà tecnica sul parsing**: il nome esatto della colonna ATECO nella
  risposta ISTAT non è stato verificato con una chiamata riuscita (un
  timeout durante la ricognizione, non un fallimento del servizio) — il
  parsing cerca la colonna per pattern invece di assumerne il nome, e
  segnala esplicitamente se non la riconosce, invece di fallire in
  silenzio. Da confermare/affinare al primo utilizzo reale.
- **Grafico a video** dell'andamento dell'indice (base 2021=100), non
  solo un numero.

## 0.41.1 — 2026-07-31 (cinquantanovesima consegna)

**Correzione: "Fatto" mancante su Posizione Aggiornata e Indici — e sincronizzazione del codice ATECO da XBRL**

- **Indicatore "Fatto"**: mai calcolato per Posizione Aggiornata e Indici
  — erano "presto" quando l'indicatore è stato scritto, non ci sono più
  tornato quando li ho resi reali. Aggiunta la voce mancante in entrambi
  i punti (stepper e Panoramica, stessa fonte). "Indici" non ha un
  proprio passo di inserimento (è una vista calcolata): "fatto" significa
  qui "c'è qualcosa da mostrare" (XBRL o Posizione Aggiornata presenti),
  non "è stato compilato qualcosa qui".
- **Causa reale del formato ATECO sempre sbagliato**: il campo XBRL
  contiene una descrizione intera con il codice tra parentesi in fondo
  (es. "Altri servizi di logistica (52.25.09)"), non il codice pulito —
  il parser prendeva la frase intera. Verificato ed estratto solo il
  codice, testato contro il file reale prima di considerarlo risolto.
- **Il file XBRL ora vince sull'anagrafica**, come indicato: al
  salvataggio di un'analisi, se il codice ATECO nel file differisce da
  quello in anagrafica, l'anagrafica viene aggiornata con quello del
  file (fonte CCIAA) — con un messaggio esplicito che lo segnala
  all'operatore, non un cambiamento silenzioso.

## 0.41.0 — 2026-07-31 (cinquantottesima consegna)

**Correzione: altro caso di testo invisibile (Situazione Debitoria) — e Indici multi-periodo (pezzo 3 di 7)**

- **Correzione**: stesso bug del testo bianco su bianco già risolto nella
  Proposta, ritrovato in un punto diverso (la tabella "Dettaglio Debiti"
  in Import XBRL — Debiti verso Banche, Fornitori e Altri Debiti senza
  colore esplicito). Corretto, e questa volta ho fatto una scansione
  sistematica di **tutto** il progetto (30 potenziali casi controllati
  uno per uno) invece di un controllo superficiale: tutti gli altri erano
  falsi positivi (input, pulsanti, colore impostato sulla riga).
- **Indici multi-periodo**: come previsto, riuso diretto di quanto già
  costruito — `costruisciBundleIndici` (nuovo helper condiviso, elimina
  una logica che prima era duplicata in 2 punti) applica lo stesso motore
  di calcolo a ciascun periodo, `calcolaTrend` (già generalizzata a N
  punti da tempo) confronta precedente → corrente → Posizione Aggiornata.
- **Sul salvare i trend**: non li ho persistiti, come discusso — sono
  interamente derivabili dai tre punti già salvati, ricalcolarli è a
  costo quasi zero e non rischia disallineamenti. La funzione è pronta e
  riusabile per Simulazione e Dati di Settore quando arriveranno.
- **Rappresentazione grafica a video**: grafico dell'andamento PFN e un
  mini-grafico per ogni indice abilitato (recharts, già una dipendenza,
  stesso pattern già in uso altrove nel progetto) — non solo nel report
  generato, come richiesto.

## 0.40.1 — 2026-07-31 (cinquantasettesima consegna)

**Correzione sostanziale: l'anno precedente del bilancio XBRL veniva scartato al salvataggio, non al parsing**

Verificato con il file reale caricato: il parser individua correttamente
entrambi gli anni (context `cntxCorr_*` 2024, `cntxPrev_*` 2023 — dati
di conto economico reali per il 2023 confermati riga per riga nel file
grezzo, non solo la struttura). Il problema era a valle: al momento del
salvataggio dello storico, `salvaAnalisiXbrlAziendaAction` persisteva
solo `analisi.corrente`, scartando `analisi.precedente` anche se già
completamente estratto ed elaborato — un solo file XBRL, che contiene
sempre il comparativo per obbligo di tassonomia, produceva una sola riga
di storico invece di due.

- **Ora si salvano entrambi gli anni**, come due righe di storico
  distinte — quella dell'anno precedente con indici calcolati sui suoi
  stessi numeri (stesso motore usato per l'anno corrente, non un valore
  derivato o approssimato).
- **Non sovrascrive un bilancio già caricato per quell'anno**: se
  l'anno precedente esiste già come riga a sé (es. caricato in passato
  come file indipendente), quella riga resta quella autorevole — la
  versione dedotta dal comparativo si inserisce solo se manca.
- **Effetto diretto**: la colonna "Anno Precedente" in Posizione
  Aggiornata ora si popola da un solo caricamento XBRL, non richiede più
  un secondo file separato per il 2023.

## 0.40.0 — 2026-07-31 (cinquantaseiesima consegna)

**Sistema brand CCIIWEB4.0 — logo, palette, e "Disconnetti" finalmente nello stesso posto ovunque**

Consegna diversa dalle altre, come richiesto: identità visiva, non
funzioni. "Misuriamo il battito del tuo business" — il logo è un
tracciato di elettrocardiogramma in un cerchio Blu Analisi.

- **Palette come token Tailwind** (`brand.analisi`, `brand.notte`,
  `brand.impulso`, `brand.carta`, con gli stessi valori OKLCH indicati) —
  disponibile ovunque nel progetto, applicata per ora al logo e alla
  nuova barra di stato, non ridipinta su ogni schermata esistente: un
  cambiamento di quella portata in un colpo solo sarebbe stato rischioso
  per una consegna pensata per essere leggera.
- **Logo** (`src/components/brand/Logo.tsx`, icona + wordmark) nelle
  intestazioni di entrambe le sidebar (superadmin e spazio), al posto del
  testo segnaposto "CCII Web 2.0" e di una versione finta ("v2.1") che
  non corrispondeva a nulla di reale.
- **"Disconnetti" ora nello stesso posto per tutti i ruoli**: prima era
  in fondo alla sidebar per il superadmin, in alto a destra per Admin di
  Spazio/Operatore — due pattern diversi per la stessa azione. Ora è
  sempre nella stessa barra di stato in alto, sempre nella stessa
  posizione.
- **Nuova barra di stato condivisa** (`TopStatusBar`): utente e ruolo
  connessi, data e ora dal vivo, versione dell'applicazione (letta da
  una costante tenuta in sync con `package.json`, non più inventata) —
  un solo componente, non tre implementazioni diverse da mantenere
  allineate.

## 0.39.1 — 2026-07-31 (cinquantacinquesima consegna)

**Correzione: "column riga_rilevante_bloccata does not exist" nell'elenco Scenari**

Causa: nella consegna precedente avevo aggiunto la colonna
`riga_rilevante_bloccata` (il blocco della riga rilevante) dentro
`assicuraTabellaProposta` invece che dentro `assicuraTabelleScenari` —
la funzione sbagliata. La pagina Elenco Scenari chiama solo la seconda,
quindi quella colonna non aveva mai occasione di essere creata finché
non si apriva la pagina Proposta di uno scenario specifico (che chiama
anche la prima). Spostata nel punto corretto, insieme alle altre colonne
difensive di `scenari` già presenti lì.

## 0.39.0 — 2026-07-31 (cinquantaquattresima consegna)

**Posizione Debitoria dell'Ente — "step 0", solo per le proposte Ricevute**

Nuovo passo nel cammino, prima della Proposta, visibile solo quando lo
scenario è di tipo "Ricevuta" (non ha senso per una proposta "Da
definire": lì non c'è un ente che dichiara nulla, tutte le righe hanno
pari importanza — la colonna di selezione infatti non compare più in
quel caso).

- **Stesso sistema di caricamento della Proposta**: form aggiungi/modifica,
  selezione multipla con eliminazione massiva, export/import Excel con
  conferma esplicita su reimport (stessa protezione contro i doppioni),
  righe di istruzioni e di riepilogo riconosciute e scartate — tutte le
  lezioni imparate costruendo la Proposta, applicate da subito qui.
- **Classificazione per tipo**: CLE (Certo Liquido Esigibile), CEN (Certo
  Emesso Notificato), CEC (Certo Esigibile Contenzioso), CEA (Certo
  Esigibile, Agente della Riscossione) — con totale per tipo in fondo
  alle righe, sia a schermo sia nel file esportato.
- **Confronto diretto con la Proposta**: dichiarato dall'ente vs
  dichiarato dall'azienda (sulla riga segnata come rilevante), con
  differenza in evidenza e un avviso se i dati non coincidono.
- **Blocco della riga rilevante**: la scelta di quale riga della Proposta
  riguarda l'ente destinatario ora si può bloccare — da quel momento il
  confronto resta stabile, non cambia più ad ogni click di distrazione.
  Sbloccare richiede conferma esplicita, non un click accidentale.
- La colonna "Rilevante per l'ente" nella Proposta ora compare solo per
  le proposte Ricevute, come indicato: per una proposta Da definire tutte
  le righe sono ugualmente importanti, non ha senso sceglierne una.

## 0.38.0 — 2026-07-31 (cinquantatreesima consegna)

**Correzione sostanziale: la verifica di ricevibilità confrontava per nome esatto della categoria, e falliva silenziosamente**

La lacuna più vecchia rimasta aperta in questa conversazione ("categorie
per rango legale, non per singolo ente") era anche un bug concreto, non
solo un'imperfezione di modello: una riga chiamata "Enti previdenziali"
non trovava mai il limite configurato su "INPS" (nomi diversi), ricadeva
silenziosamente su "Generale" (spesso 0% e nessun vincolo) e risultava
ricevibile per assenza di controllo — non perché lo avesse superato.
Confermato riproducendo esattamente il caso: soglia INPS al 100%,
proposta al 75% su "Enti previdenziali", esito RICEVIBILE.

- **Corrispondenza ora a due livelli**: (1) categoria esatta, se
  configurata con quel nome preciso; (2) rango legale della riga, se
  impostato — un insieme chiuso di 6 valori, non un nome libero che può
  non corrispondere mai; (3) Generale, solo se nessuno dei due sopra ha
  dato risposta.
- **Nuova sezione in Parametri di Spazio → Limiti di ricevibilità**:
  "Limiti per rango legale" — stessi campi già visti per categoria
  (valore di liquidazione, % minima, unica soluzione/rateale ammesse),
  applicati ai 6 ranghi fissi.
- **Motivazione sempre esplicita su quale livello ha risposto**: non più
  solo "conforme", ma "verificato per questa categoria" / "verificato per
  il rango legale X (nessuna soglia specifica trovata per il nome esatto
  di questa categoria)" / "dalla soglia Generale (nessuna soglia
  specifica trovata né per categoria né per rango)".
- **Confermato, non un bug a sé**: il controllo su unica
  soluzione/rateale ammesse esisteva già nel codice — appariva inefficace
  per lo stesso motivo (ricadeva sempre su Generale, permissivo di
  default). Ora che la corrispondenza per rango è collegata, si attiva
  davvero quando un limite specifico lo prevede.

## 0.37.0 — 2026-07-31 (cinquantaduesima consegna)

**Riga rilevante per l'ente destinatario — un flag, non un nuovo modello**

Come indicato: un ente che riceve una proposta guarda solo la propria
posizione, non l'intero impianto — diverso da uno studio che compone una
proposta da inviare, dove servono tutti i parametri insieme. Non serve
un modello di dati nuovo, solo un flag a scelta singola.

- **Nuova colonna nella tabella Proposta**: un pulsante a scelta esclusiva
  (una e una sola riga per scenario) per segnare quale riga riguarda
  l'ente destinatario. Impostarne una toglie automaticamente il flag da
  qualsiasi altra — garantito anche lato server, non solo
  nell'interfaccia.
- **La Relazione AI ne tiene conto**: per una proposta "Ricevuta" con una
  riga segnata, la Sintesi Esecutiva apre con l'esito su quella riga
  specifica — il resto resta come contesto per giudicare se il piano nel
  complesso regge, non come oggetto di valutazione per quell'ente. Per
  una proposta "Da definire" il flag non cambia nulla nella relazione:
  lì servono davvero tutti i parametri insieme, come indicato.
- Il documento PDF (solo per "Da definire") non è stato toccato: il flag
  non gli si applica, per lo stesso motivo.

## 0.36.0 — 2026-07-31 (cinquantunesima consegna)

**Selezione multipla per l'eliminazione, e trasparenza vera sul giudizio di ricevibilità**

Due correzioni di qualità, non di quantità, come richiesto.

- **Selezione multipla**: checkbox per riga più "seleziona tutte" in
  intestazione, sia nella Proposta sia nello storico XBRL dello Scenario
  — non più necessario eliminare una riga alla volta. Conferma esplicita
  prima dell'eliminazione, che elenca quante righe verranno rimosse.
- **Motivazione della ricevibilità ora visibile, non solo in un tooltip
  al passaggio del mouse**: sotto ogni badge "Ricevibile"/"Non
  ricevibile" compare il criterio verificato per esteso (valore di
  liquidazione, percentuale minima, o l'assenza di una soglia
  configurata — reso esplicito anche quando "ricevibile" non significa
  "ha superato un controllo" ma solo "nessun vincolo impostato").
- **Disclaimer esplicito** aggiunto in tre punti: sotto l'esito
  complessivo nella Proposta, nell'interfaccia della Relazione AI, e nel
  documento PDF — tutti dicono la stessa cosa: è un output automatico
  basato sui parametri configurati in Parametri di Spazio, non un
  giudizio professionale; spetta al professionista incaricato valutarlo
  nel merito e decidere se asseverarlo.
- **Anche il prompt della Relazione AI riformulato**: prima chiedeva
  all'AI di "essere" un Dottore Commercialista — ora le chiede
  esplicitamente di redigere una bozza di lavoro PER un professionista,
  con una sezione "AVVERTENZA" obbligatoria in chiusura che lo dichiara.

## 0.35.5 — 2026-07-31 (cinquantesima consegna)

**Correzione: reimportare lo stesso file Excel accodava invece di sostituire, creando doppioni**

Confermato esattamente come descritto: l'import non aveva mai modo di
sapere che i dati di un file erano già presenti nello scenario — ogni
reimport aggiungeva le righe da capo, moltiplicando il prospetto ad ogni
caricamento ripetuto.

- **Ora, se lo scenario ha già righe**, importare chiede prima conferma
  esplicita ("le righe esistenti verranno eliminate e sostituite — non
  aggiunte"): se confermato, le righe attuali vengono eliminate e
  sostituite con quelle del file; se annullato, non succede nulla.
- **Scelta deliberata di non provare ad abbinare automaticamente** le
  righe vecchie con quelle nuove (per categoria): un creditore può avere
  più righe con ranghi diversi, un confronto automatico rischierebbe di
  unire righe che devono restare distinte. Meglio sostituire tutto con
  conferma esplicita che indovinare.
- **Protezione aggiuntiva**: righe il cui creditore si chiama "Totale",
  "Riepilogo", "Somma" o simili vengono ora scartate in lettura, non
  importate come se fossero un creditore reale — anche se l'export
  attuale non genera mai una riga così, per sicurezza in caso di file
  modificati a mano.

## 0.35.4 — 2026-07-31 (quarantanovesima consegna)

**Correzione: la virgola nei campi numerici, e chiarimento sul riepilogo per rango**

- **Campi "Importo dovuto" e "% offerta" non accettavano la virgola**:
  un `<input type="number">` HTML rifiuta a livello di browser un valore
  con virgola come separatore decimale — il campo si svuota e il valore
  diventa 0 in silenzio, prima ancora che il codice lo veda. Sostituiti
  con campi testuali che accettano sia virgola sia punto.
- **Causa più probabile dello squilibrio nel riepilogo per rango**
  (Offerto molto più basso del previsto): editando manualmente una riga,
  senza un'indicazione chiara nel campo "% offerta", è naturale scrivere
  "0,06" pensando alla frazione invece di "6" — il numero intero che il
  sistema divide per 100 internamente. Aggiunta un'indicazione esplicita
  sotto il campo ("Numero intero da 0 a 100, es. 6 per il 6%, non 0,06").
  Il file Excel non c'entra: quella lettura resta corretta e verificata
  nella consegna precedente.
- **Chiarito, non corretto** (era già così per progetto): il "Riepilogo
  per rango legale" è di sola consultazione — raggruppa più righe
  insieme, non è un'entità editabile in sé. Per assegnare o cambiare il
  rango di un creditore si modifica la riga corrispondente nella tabella
  sopra (icona matita), non il raggruppamento. Aggiunta una didascalia
  che lo dice esplicitamente, invece di lasciarlo implicito.

## 0.35.3 — 2026-07-31 (quarantottesima consegna)

**Correzione: testo invisibile in tabella (non un problema di dati), percentuali Excel lette male, righe della proposta ora modificabili**

I dati erano tutti importati correttamente — non era un bug di parsing.
Tre correzioni distinte:

- **Testo bianco su bianco**: le celle Dovuto/Offerta/Modalità (e il
  riepilogo per rango) non specificavano un colore proprio ed ereditavano
  `color: white` impostato globalmente su `<body>` per il tema scuro
  della sidebar — invisibile su sfondo bianco. Altre celle nella stessa
  riga (Creditore, Rango) avevano un colore esplicito e per questo si
  vedevano, dando l'illusione che solo alcuni campi fossero vuoti.
  Corretto qui; verificato che gli altri componenti costruiti in questa
  conversazione non avessero lo stesso problema (solo due falsi positivi,
  già con colore sui figli).
- **Percentuali formattate come "%" in Excel lette male**: digitare "3%"
  in una cella Excel salva 0,03 come valore sottostante. La libreria non
  espone il formato della cella di default (proprietà assente) — corretto
  usando il testo già formattato da Excel ("3.00%"), sempre presente.
  Verificato contro il file reale prima di considerarlo risolto: 0,03 →
  3, 1 → 100, 0,2 → 20.
- **Righe della proposta ora modificabili singolarmente**: prima l'unico
  modo per correggere un valore era eliminare la riga e reinserirla (o
  reimportare l'intero file). Nuovo pulsante "Modifica" per riga, che
  carica i valori nel form in cima e li salva con un nuovo aggiornamento
  invece di una nuova riga.

## 0.35.2 — 2026-07-31 (quarantasettesima consegna)

**Correzione: importi con centesimi rifiutati dal database ("invalid input syntax for type integer")**

La correzione precedente (0.35.1, verifica reale di ogni salvataggio) ha
fatto esattamente il suo lavoro: ha reso visibile l'errore vero, che
prima spariva in silenzio. Causa: `importo_dovuto` e `percentuale_offerta`
nella tabella della Proposta erano colonne **INTEGER** (numeri interi) —
un importo reale come 2.803.914,66 non può starci, Postgres lo rifiuta a
priori. Bastava un solo importo con centesimi nel file importato per far
fallire quella riga.

- Entrambe le colonne convertite da INTEGER a NUMERIC (accettano
  decimali), con migrazione automatica sugli spazi già provisionati.
- Nota tecnica: Postgres restituisce le colonne NUMERIC come **stringhe**
  al driver Node (per non perdere precisione), non come numeri — il
  codice che legge queste righe ora converte esplicitamente, altrimenti
  calcoli e formattazioni a valle si sarebbero rotti silenziosamente.

## 0.35.1 — 2026-07-31 (quarantaseiesima consegna)

**Correzione: import Excel della Proposta dava "evidenza" del salvataggio senza che i dati comparissero**

Causa reale, stessa classe di errore già corretta altre volte in questa
conversazione: il ciclo che salvava le righe importate non verificava mai
se ogni singolo salvataggio fosse davvero riuscito — mostrava quante
righe erano state **lette** dal file, non quante erano state **salvate**
sul database. Un salvataggio fallito spariva in silenzio.

- **Verifica reale di ogni riga**: ora il messaggio distingue "N di M
  lette sono state salvate" e, se qualcuna fallisce, mostra il motivo
  vero restituito dal server — non più un conteggio ottimistico.
- **Corretta anche una causa concreta di righe scartate**: la riga di
  istruzioni in cima al foglio (una sola cella valorizzata) veniva
  scambiata per una riga dati incompleta e finiva tra gli errori. Ora
  riconosciuta esplicitamente e ignorata, non segnalata.
- **Stesso controllo applicato anche all'import della Check List**, per
  coerenza — stessa lacuna, stesso tipo di correzione. Il parsing della
  Check List non aveva invece il problema della riga di istruzioni
  (verificato: controlla una colonna diversa, già al riparo).

## 0.35.0 — 2026-07-31 (quarantacinquesima consegna)

**Posizione Aggiornata (pezzo 2 di 7): CE a valore della produzione, SP a criterio finanziario, precompilati dal file XBRL**

Non più placeholder. Nello Scenario, subito dopo Import XBRL — coerente
con la sequenza indicata: il prospetto propone automaticamente le due
colonne di riferimento (anno precedente e anno corrente) dall'ultimo
bilancio XBRL caricato per l'azienda, l'operatore aggiunge la terza
colonna (la posizione aggiornata alla data di predisposizione dello
scenario).

- **Schema organizzato in due gruppi**, Conto Economico (a valore della
  produzione) e Stato Patrimoniale (criterio finanziario) — 19 voci.
- **Onestà tecnica sullo scope**: non è lo schema civilistico completo
  voce per voce — è lo stesso sottoinsieme aggregato che il motore XBRL
  estrae davvero (`DatiFinanziariPeriodo`), riorganizzato secondo quella
  logica. Scelta deliberata: usare la stessa forma dati già usata per
  anno corrente/precedente rende "Indici multi-periodo" (prossimo pezzo)
  un riuso diretto delle formule esistenti, non un nuovo motore.
- **Export/import Excel** del prospetto a 3 colonne — le due di
  riferimento non vengono rilette in import (solo la terza), abbinamento
  per etichetta di voce, non per posizione di riga.
- **Data di riferimento e flag "non ancora deliberato dall'assemblea"**
  — per distinguere una verifica intermedia da un bilancio approvato,
  come nel caso reale di riferimento (Athena: bilancio di verifica al
  30/11/2025, non deliberato).
- Dato per scenario, non per azienda: scenari diversi della stessa
  azienda possono avere una posizione aggiornata a date diverse.

**Prossimo pezzo**: Indici multi-periodo — applicare le formule già
scritte ai tre punti (precedente, corrente, aggiornata) invece che a due.

## 0.34.0 — 2026-07-31 (quarantaquattresima consegna)

**Rango legale per singola riga della proposta (pezzo 1 di 7 del piano concordato)**

Un creditore può avere righe con ranghi diversi (una banca può avere sia
un finanziamento ipotecario sia uno chirografario): per questo il rango
è una proprietà della singola riga, non della categoria di creditore —
la categoria resta "chi è" il creditore, il rango è "con che grado" è
assistito quel credito specifico.

- **Nuovo campo Rango legale** su ogni riga della Proposta: Prededucibile,
  Privilegiato (ipoteca), Privilegiato (privilegio generale), Privilegiato
  (non specificato), Chirografario, Postergato — le famiglie tipiche della
  liquidazione giudiziale, non personalizzabili per spazio (è una
  classificazione di legge, non una preferenza dello studio).
- **Riepilogo per rango** ovunque conta la reportistica: nella pagina
  Proposta (somma per rango, con evidenza di quali creditori vi sono
  finiti), nel documento PDF da inviare, nell'export/import Excel, e nel
  prompt della Relazione AI.

**Prossimo pezzo**: Posizione Aggiornata (CE a valore della produzione,
SP a criterio finanziario), collegata al file XBRL già caricato.

## 0.33.0 — 2026-07-30 (stesso giorno, quarantatreesima consegna)

**Operatori/Consultatori: creazione spostata dentro la scheda azienda, Utenti resta panoramica**

Scoperto in corso d'opera: la rotta `/aziende/[aziendaId]/operatori` e il
componente `AziendaUtentiManager` esistevano già, completi e funzionanti
— probabilmente da un momento precedente di questo lavoro. Verificati a
fondo (type-check, lint, test, build) e confermati corretti rispetto a
quanto hai indicato:

- **Nuovo operatore si crea da Aziende → azienda → Operatori**, con
  quell'azienda già associata di default. Da lì si può anche associare un
  operatore già esistente in un'altra azienda dello spazio, o rimuoverlo
  da questa (bloccato se sarebbe l'ultima azienda associata, per non
  lasciarlo senza nulla su cui lavorare).
- **Resta associabile a più aziende**, come confermato: l'associazione
  vive nella tabella `utenti_aziende` (N:N), non cambia struttura.
- **"Utenti" nella sidebar resta una panoramica**, come confermato: ho
  ripulito il componente rimuovendo la creazione/modifica completa (che
  non aveva comunque un pulsante che la aprisse — dead code) e ora mostra
  le aziende associate per nome, non solo il conteggio. Restano qui:
  permessi per modulo, rigenerazione password, disabilita/riattiva.

## 0.32.0 — 2026-07-30 (stesso giorno, quarantaduesima consegna)

**Check List Ministeriale: il modello base torna editabile dal superadmin, ma senza toccare retroattivamente chi lo usa già**

Avevo reso la pagina superadmin sola lettura in una consegna precedente,
ma non aveva senso: quella check list è la base di tutte le altre, deve
poter essere corretta. Il problema vero era un altro: prima ogni spazio
leggeva la struttura "in diretta" dalla stessa costante — una modifica
avrebbe cambiato silenziosamente anche gli spazi già in uso, con risposte
già raccolte su domande che nel frattempo cambiano id o testo.

- **Foto congelata per spazio**: ogni spazio, alla prima apertura della
  propria Check List, salva una copia propria della struttura base
  (`checklist_ministeriale_snapshot`, tenant-scoped) e da quel momento usa
  quella — non più la costante in diretta.
- **Superadmin → Check List — modello base**: di nuovo editabile (JSON),
  con un avviso esplicito su cosa succede davvero: la modifica cambia il
  seme solo per gli spazi che non hanno ancora scattato la foto (nuovi
  spazi, o spazi che non hanno mai aperto la Check List) — non per quelli
  che la usano già.
- Nessuna rottura per gli spazi esistenti: la prima volta che aprono la
  Check List dopo questa consegna, la foto scattata è identica a quella
  di sempre (il seme non è ancora stato toccato).

## 0.31.0 — 2026-07-30 (stesso giorno, quarantunesima consegna)

**Parametri di Spazio asciugato del tutto: ogni sezione sulla propria pagina, come la Check List**

Estratte anche Limiti di ricevibilità, Tab XBRL, Indici e Parametri di
sistema — non più tutto in linea sulla stessa pagina. Ora Parametri di
Spazio è solo un indice di 5 card, ciascuna con un link alla propria
pagina dedicata (`/parametri/ricevibilita`, `/tab-xbrl`, `/indici`,
`/checklist`, `/sistema`).

Risultato misurato: la pagina principale è passata da 4,91 kB a **2,39
kB** di JS — le informazioni di ogni sezione si caricano solo quando la
si apre davvero, non tutte insieme ad ogni visita.

**Verificato anche**: la tab "Normativa" citata come possibile impatto sul
sistema non esiste nel superadmin attuale — l'unico codice affine
(`src/app/ccii-dashboard/components/SystemParamsManager.tsx`) non chiama
mai un'azione server né legge/scrive sul database (solo `useState` con
valori scritti a mano), e non è collegato da nessun link in nessuna
sidebar attuale: raggiungibile solo digitando l'URL, non usato da nessuna
funzione reale.

## 0.30.0 — 2026-07-30 (stesso giorno, quarantesima consegna)

**Specchio della Proposta completato: documento PDF per la versione "Da definire"**

I dati (categoria, importo, % offerta, modalità, rate, note) erano già
esattamente gli stessi per RICEVUTA e DA_DEFINIRE — lo specchio a livello
di dato esisteva già. Mancava l'ultimo pezzo: un documento vero da poter
inviare, per la versione che lo studio deve produrre e spedire (la
versione Ricevuta non ne ha bisogno, è già stata ricevuta).

- **"Genera documento (PDF) da inviare"**, visibile solo per gli scenari
  con proposta "Da definire": un documento con intestazione, anagrafica
  completa dell'azienda (ragione sociale, forma giuridica, sede legale,
  C.F./P.IVA, capitale sociale, REA, rappresentante legale e ruolo, PEC —
  tutti i campi aggiunti apposta all'anagrafica azienda qualche consegna
  fa), tabella della proposta, esito della verifica interna di
  ricevibilità, spazio per data e firma.
- Stesse librerie già in uso (`jspdf` + `jspdf-autotable`), lato browser,
  nessuna dipendenza nuova.

Con questa consegna il piano concordato inizialmente (stepper, Report→
Proposta rinominato, Relazione AI a sé, specchio Proposta con stampa) è
completo end-to-end.

## 0.29.1 — 2026-07-30 (stesso giorno, trentanovesima consegna)

**Parametri di Spazio asciugato: Check List spostata su una pagina dedicata**

La pagina era diventata chilometrica: l'elenco completo delle ~50 domande
della Check List (con dropdown del peso per ciascuna) stava tutto in
linea, insieme a tutto il resto. Spostato su
`/spazio/[codice]/parametri/checklist` (pesi/soglie + modelli custom
insieme, un solo link di rientro); in Parametri di Spazio resta solo una
card compatta con un collegamento "Gestisci". Risultato misurato, non
solo percepito: la pagina principale è passata da 7,77 kB a 4,91 kB di
JS.

## 0.29.0 — 2026-07-30 (stesso giorno, trentottesima consegna)

**Export/import Excel: Check List (per farla compilare all'azienda) e modello di Proposta in entrata**

Entrambi interamente lato browser, riusando `xlsx` (SheetJS), già una
dipendenza del progetto per l'export XBRL — nessuna libreria nuova.

- **Check List → Excel**: nello Scenario, "Esporta per compilazione"
  genera un file con una riga per domanda (Sezione, ID, Domanda, A cura
  di, Peso di riferimento, più le colonne da compilare Risposta e Note),
  precompilato con le risposte già date se lo si riesporta per
  completare quanto manca. "Importa compilato" rilegge il file e salva le
  risposte, **abbinando sempre per ID domanda** (non per posizione di
  riga): se il file viene riordinato l'abbinamento resta corretto. Righe
  con ID non riconosciuto vengono segnalate, non scartate in silenzio.
  Funziona per la Ministeriale e per ogni modello custom.
- **Proposta → Excel**: "Scarica modello" genera un tracciato con le
  intestazioni fisse già in uso (categoria, importo, % offerta, modalità,
  rate, note) — vuoto con 10 righe di cortesia se la proposta non ha
  ancora righe, altrimenti con le righe già presenti. "Importa modello
  compilato" valida ogni riga (importo e percentuale numerici, modalità
  riconosciuta) e aggiunge solo le righe valide, segnalando quelle
  scartate e il motivo.
- Nessuno schema esterno standard trovato per il tracciato Proposta (ricerca
  già fatta in una consegna precedente): tracciato nostro, che ricalca
  esattamente i campi già gestiti dall'acquisizione manuale.

**Prossimo passo, come indicato**: asciugare la pagina Parametri di
Spazio, ormai lunga — in particolare sostituire l'elenco completo delle
domande della Check List (mostrato per intero in "Pesi e soglie") con un
collegamento a una gestione dedicata.

## 0.28.0 — 2026-07-30 (stesso giorno, trentasettesima consegna)

**Check list plurali per azienda/ente (pezzo 2: "farlo lavorare" sulla casa appena costruita)**

Uno spazio può ora avere, oltre alla Check List Ministeriale, quanti
modelli aggiuntivi servono (es. per un ente: Vigilanza Documentale,
Gestione del Credito, Ufficio Legale) — stessa struttura sezioni →
domande → peso (i "tre binari" Strutturale/Rilevante/Documentale) e
STESSO motore di punteggio, non uno nuovo.

- **Parametri di Spazio → Check List aggiuntive**: crea un modello nuovo
  (vuoto, o precompilato con lo scheletro della Ministeriale da adattare),
  modificalo, disattivalo (le risposte già raccolte restano leggibili),
  esporta la struttura di un modello come JSON.
- **Nello Scenario → Check List**: un selettore in alto (Ministeriale +
  ogni modello attivo dello spazio) — ciascuno con le proprie risposte e
  il proprio quadro di sintesi, calcolati con gli stessi pesi e soglie
  configurati per lo spazio.
- **Relazione AI aggiornata**: include ora il quadro di ogni check list
  compilata (non solo la Ministeriale), ciascuna con la propria etichetta
  di sintesi — la "fotografia immediata" richiesta, per ciascuna area.
- Modalità di autoria testuale (JSON) per ora, non un editor visivo per
  sezioni/domande: funzionale, non la UX più raffinata possibile — un
  affinamento futuro se serve.

**Non ancora affrontato** (resta in coda, come da elenco): export/import
Excel per far compilare la Check List all'azienda (56 domande, tutte in
capo a loro) ed export/import Excel del modello di proposta in entrata.

## 0.27.0 — 2026-07-30 (stesso giorno, trentaseiesima consegna)

**Check List: pesi e soglie spostati dal superadmin a Parametri di Spazio (fondamenta per le check list plurali)**

Prima passo di una richiesta più ampia (check list aggiuntive per
azienda/ente, oltre alla ministeriale): sistemata la casa di dove vive la
configurazione, prima di costruirci sopra.

- **Prima**: pesi (Strutturale/Rilevante/Documentale) e soglie di sintesi
  vivevano su tabelle globali, modificabili solo dal superadmin — un
  collo di bottiglia reale per uno studio o ente che vuole la propria
  valutazione senza passare dal gestore della piattaforma.
- **Ora**: vivono nello schema di ogni spazio (`checklist_pesi_domande`,
  `checklist_config_pesi`, tenant-scoped), modificabili dall'Admin di
  Spazio in **Parametri di Spazio → Check List — pesi e soglie**. Stesso
  principio già seguito per Indici e Tab XBRL.
- **Il superadmin mantiene un modello base in sola lettura**
  (`/superadmin/ChecklistConfig`, ora Server Component, niente più form di
  modifica): quello che uno spazio nuovo eredita come punto di partenza,
  non più l'unica fonte modificabile.
- Nessuna migrazione di dati necessaria per i pesi già personalizzati sul
  vecchio sistema globale (restano nella tabella `public` originale, ora
  inutilizzata): da questa versione in poi, ogni spazio parte dai default
  del modello base e li personalizza per conto proprio.

**Prossimo passo**, come concordato: le check list plurali per azienda/
ente vere e proprie, sulla casa appena costruita qui.

## 0.26.1 — 2026-07-30 (stesso giorno, trentacinquesima consegna)

**Correzione: Import XBRL non segnalava un bilancio già caricato**

Si arrivava sulla pagina Import XBRL dello Scenario e si trovava solo il
form di caricamento vuoto, anche quando per quell'azienda esisteva già
uno o più bilanci salvati — nessun segnale, a meno di avere la tab
"Andamento Storico" abilitata e scorrere fino in fondo. Ora un banner
sempre visibile (indipendente da quali tab sono abilitate) mostra subito
quanti bilanci ci sono e i dati dell'ultimo caricato.

## 0.26.0 — 2026-07-30 (stesso giorno, trentaquattresima consegna)

**Sentiero a serpentina + coerenza tra stepper e Panoramica + gating morbido (correzioni dal feedback sullo screenshot)**

- **Sentiero a serpentina** (opzione A scelta): due righe invece di una barra a scorrimento laterale — riga 1 da sinistra a destra (Proposta → Check List), riga 2 da destra a sinistra (Dati di Settore → Relazione AI), con un connettore verticale tra le due. Tutti e 9 i passi visibili senza scorrimento.
- **Un'unica fonte per stepper e Panoramica** (`src/lib/scenarioStepper.ts`): stessi numeri, stessa etichetta, stesso ordine ovunque — prima erano due elenchi separati che potevano disallinearsi.
- **Coerenza di comportamento**: prima la barra rendeva i passi "Presto" non cliccabili mentre la Panoramica sì (stessa funzione, comportamento diverso). Ora sono cliccabili ovunque — portano alla pagina placeholder onesta, che è meglio di un blocco arbitrario su una pagina che comunque esiste.
- **Gating morbido, come richiesto**: nessun passo blocca l'accesso al successivo. Non ancora possibile bloccare rigidamente sui passi non costruiti (Posizione Aggiornata, Indici) — se in futuro si vorrà rendere rigido, sarà una scelta esplicita da riconfermare.
- **Indicatore "Fatto"**: Proposta, Check List e Import XBRL mostrano ora un segno di spunta (verde nello stepper, etichetta "Fatto" nella Panoramica) quando contengono davvero dei dati — prima non c'era alcun segnale che un bilancio fosse già stato caricato.

**Registrato per le prossime consegne**: export/import Excel del modello di Proposta (per la gestione extra-procedura in ingresso) ed export/import Excel della Check List (56 domande in capo all'azienda, non pensabile farle compilare nel sistema).

## 0.25.1 — 2026-07-30 (stesso giorno, trentatreesima consegna)

**Correzione critica: errore server-side ad ogni apertura di uno Scenario**

Causa: nel nuovo stepper (`layout.tsx`, consegna 0.25.0) avevo passato un
`onClick` — una funzione — come prop a `<Link>` dentro un Server
Component. Non è permesso: una funzione non è serializzabile attraverso
il confine server/client di Next.js. Per i passi "Presto" ora viene
renderizzato un elemento non interattivo (`<div>`, non un link disattivato
via JavaScript) — nessun handler di evento in un Server Component.

Nota di trasparenza sul perché non l'avevo preso in build: `next build`
compila le rotte dinamiche (quelle con parametri come `[scenarioId]`) ma
non le renderizza mai davvero durante la build — l'errore emerge solo
alla prima richiesta reale in produzione. Ho esteso lo script di
controllo automatico (già introdotto per l'errore `'use server'`) per
cercare anche questo pattern (handler di evento in file senza `'use
client'`), agganciato a `npm run type-check` come prima.

## 0.25.0 — 2026-07-30 (stesso giorno, trentaduesima consegna)

**Stepper dello Scenario + "Report" rinominato + Relazione AI estratta come passo a sé (fondamenta del flusso completo)**

Lo Scenario passa da un insieme di tab liberamente navigabili a un
percorso numerato che riflette il flusso di lavoro reale concordato:
Proposta → Import XBRL → Posizione Aggiornata → Indici → Check List →
Dati di Settore → Simulazione → Brogliaccio → Relazione AI. I passi non
ancora costruiti compaiono comunque, disabilitati e marcati "Presto": il
disegno completo è visibile fin da subito, non solo quando sarà finito.

- **"Report" rinominato "Proposta"**: la pagina che acquisisce la proposta
  e ne verifica la ricevibilità aveva un'etichetta che induceva a pensare
  generasse un report — ora si chiama per quello che fa. La chiave interna
  di permesso resta `report` (non toccata, per non invalidare i permessi
  già assegnati dagli Admin di Spazio) — cambia solo l'etichetta mostrata.
  Il vecchio URL `/report` reindirizza a `/proposta`, non si rompe.
- **Relazione AI estratta come passo a sé** (`/relazione`, nuovo modulo di
  permesso dedicato): non più un pulsante accanto all'acquisizione della
  proposta. Mostra un cruscotto dei prerequisiti (Proposta acquisita,
  Check List avviata, Bilancio XBRL caricato) e il pulsante di generazione
  resta disabilitato finché non sono tutti soddisfatti.
- **Stesso gate anche lato server**, non solo nell'interfaccia:
  `generaRelazionePropostaAction` ora rifiuta la generazione se manca
  anche solo uno dei tre prerequisiti, con un messaggio specifico su cosa
  manca — l'interfaccia è una comodità, il controllo vero è sul server.
- Aggiunti 4 placeholder onesti per i passi futuri del flusso concordato:
  Posizione Aggiornata, Dati di Settore (con nota sulla fonte reale — ISTAT
  — e sul lavoro di mappatura ATECO che servirà), Simulazione, Brogliaccio.

**Prossimo pezzo**: da concordare — i candidati sono Specchio Proposta
(RICEVUTA/DA_DEFINIRE + stampa), Posizione Aggiornata + Indici
multi-periodo, Check List import/export Excel.

## 0.24.1 — 2026-07-30 (stesso giorno, trentunesima consegna)

**Correzione: il salvataggio dell'Anagrafica azienda sembrava non funzionare**

Il salvataggio scriveva correttamente nel database — mancava un
`router.refresh()` dopo il salvataggio riuscito. Senza quello, Next.js può
continuare a mostrare (dalla propria cache di navigazione lato client) i
dati precedenti al salvataggio se si cambia tab e si torna su Anagrafica
senza un refresh completo del browser: sembra che non abbia salvato,
anche se in realtà sì. Aggiunto in `AziendaAnagraficaEditor.tsx`, stesso
principio già corretto altrove nel progetto.

## 0.24.0 — 2026-07-30 (stesso giorno, trentesima consegna)

**Relazione AI quali-quantitativa unificata (pezzo 4 di 5 del piano concordato)**

La Relazione AI dello Scenario prima dichiarava esplicitamente di non
includere ancora Indici e dati di bilancio XBRL. Ora li include davvero,
insieme a Check List e Ricevibilità nella stessa relazione — non tre
relazioni separate.

- **Quadro quantitativo**: legge l'ultimo bilancio XBRL salvato nello
  storico dell'azienda dello scenario (gli scenari sono aziendali, lo
  storico è condiviso tra tutti gli scenari della stessa azienda).
  Include severità, indici, situazione debitoria/PFN, e andamento storico
  se sono stati salvati almeno due bilanci.
- **Sempre filtrato per azienda**: solo gli indici confermati in Aziende
  → questa azienda → Indici entrano nella relazione — mai tutti e 9
  indiscriminatamente, stessa regola già in vigore nello Scenario →
  Import XBRL.
- **Onesta sull'assenza di dati**: se per l'azienda non è stato ancora
  caricato alcun bilancio, la relazione lo dichiara esplicitamente
  ("Nessun bilancio XBRL caricato per questa azienda") invece di
  ometterlo o lasciare che il modello inventi cifre.
- Struttura relazione aggiornata a 5 sezioni: Sintesi Esecutiva, Verifica
  di Ricevibilità, Quadro Qualitativo (Check List), Quadro Quantitativo
  (Indici e XBRL), Raccomandazioni Operative — con la sintesi e le
  raccomandazioni che ora tengono conto di entrambi i quadri insieme.

**Prossimo pezzo (5 di 5, ultimo del piano)**: specchio della proposta
(RICEVUTA / DA_DEFINIRE), con esportazione stampabile per la versione
"Da definire" da inviare a enti e creditori.

## 0.23.2 — 2026-07-30 (stesso giorno, ventinovesima consegna)

**Correzione critica: 500 su Parametri di Spazio, Aziende → Indici, Aziende → Configurazione XBRL**

Causa: `INDICI_XBRL_CANONICI`, introdotta nella consegna 0.23.0, era
esportata direttamente da `parametriSpazio.ts` — un file `'use server'`,
che può esportare SOLO funzioni async. Stesso identico errore già capitato
due volte prima in questo progetto (`RUOLI_ADMIN_SPAZIO`,
`ORIGINI_PER_TIPO`/`MODULI_PERMESSO`) — stavolta l'ho reintrodotto io
stesso nonostante fosse un errore noto e documentato nel codice.

- Spostata in `src/lib/indiciXbrlCanonici.ts` (nuovo file, non-server),
  importata da `parametriSpazio.ts` invece di essere esportata da lì.
- **Aggiunta una verifica automatica permanente**
  (`scripts/check-use-server-exports.sh`, agganciata a `npm run
  type-check`): controlla che nessun file `'use server'` esporti
  costanti/classi non-funzione. Non mi affiderò più a un controllo
  manuale fatto a mente prima di ogni consegna — ora fa parte della
  verifica standard ed è impossibile dimenticarlo.
- Nota tecnica per trasparenza: `next build` in locale non aveva segnalato
  l'errore (probabilmente perché nulla importava effettivamente quella
  costante, quindi il bundler non l'aveva mai analizzata a fondo) — è
  emerso solo a runtime in produzione. Per questo la verifica sopra è
  uno script dedicato, non un'attesa che `next build` lo scopra da solo.

## 0.23.1 — 2026-07-30 (stesso giorno, ventottesima consegna)

**Correzione: il salvataggio di Indici/Tab XBRL per azienda (e per spazio) poteva fallire in silenzio**

Segnalato: le selezioni in Aziende → [azienda] → Indici si modificavano a
schermo ma sparivano al ricaricamento. Non ho trovato un errore logico
nella lettura/scrittura, ma ho trovato — e corretto — due problemi reali:

- **L'interfaccia non verificava mai l'esito del salvataggio**: il toggle
  era "ottimistico" (cambiava a schermo subito) ma non controllava se il
  salvataggio sul server fosse davvero riuscito. Un eventuale errore
  spariva senza che l'utente lo vedesse, lasciando lo schermo con un
  valore mai davvero salvato. Corretto in tutti e 4 i punti che hanno
  questo pattern (Indici e Tab XBRL, sia per azienda che per spazio):
  ora un salvataggio fallito annulla il toggle e mostra il motivo.
- **Il salvataggio stesso reso più robusto**: sostituito l'`INSERT ...
  ON CONFLICT` (che richiede un vincolo univoco esattamente combaciante)
  con un `UPDATE` seguito da `INSERT` solo se nessuna riga è stata
  aggiornata — non dipende più dal presupposto che il vincolo univoco
  della tabella sia esattamente quello atteso, più resistente a tabelle
  create da versioni precedenti del codice.

Se il problema si ripresenta dopo questa consegna, il messaggio d'errore
che ora comparirà a schermo dirà finalmente perché.

## 0.23.0 — 2026-07-30 (stesso giorno, ventisettesima consegna)

**Import XBRL reale nello Scenario (pezzo 2 di 5: Indici quantitativi collegati) — con una correzione architetturale necessaria**

Prima di collegare, ho trovato che il "Dizionario Indici" del superadmin
(da cui leggeva `ottieniIndiciSpazio`) non aveva alcuna chiave in comune
con i 9 indici che il motore XBRL calcola davvero (`src/lib/xbrl/indici.ts`:
C1-C5 CNDCEC + ROE/ROI/ROT-ATT/INC-DEB) — selezionarli o meno in Parametri
di Spazio non cambiava nulla di reale, perché nessun modulo di calcolo
leggeva quella tabella. Corretto alla radice: la lista ora è quella
realmente calcolata, cablata una sola volta. Il Dizionario Indici del
superadmin resta un modulo a sé, non più agganciato qui.

- **Caricamento reale**: nello Scenario (`/scenari/[id]/xbrl`), non più
  placeholder. Carica un file → analisi immediata → "Salva nello storico"
  solo se si vuole tenerlo (storico per azienda, condiviso tra tutti gli
  scenari di quell'azienda — i bilanci sono un fatto aziendale, non dello
  scenario che li ha caricati).
- **Filtrato per davvero per l'azienda**: le tab mostrate sono solo quelle
  confermate in Aziende → questa azienda → Configurazione XBRL; gli
  indici mostrati (nelle tab CNDCEC/Altri Indici e nell'Andamento Storico)
  sono solo quelli confermati in Aziende → questa azienda → Indici. Lo
  storico salvato resta sempre completo (tutti i 9 indici): è la
  visualizzazione a filtrare, non il dato conservato — se la
  configurazione cambia in futuro, non serve ricaricare i bilanci.
- Non toccata in questa consegna: la pagina "Indici" a sé stante dello
  Scenario (confronto con soglie e valore di liquidazione) — quella
  confluirà nella Relazione AI quali-quantitativa unificata (pezzo 4),
  per evitare di costruire ora una vista che quel pezzo dovrebbe poi
  rifare.

## 0.22.0 — 2026-07-30 (stesso giorno, ventiseiesima consegna)

**Anagrafica azienda estesa: sede legale, capitale sociale, rappresentante legale, REA, PEC, sedi secondarie**

Campi richiesti esplicitamente, più alcuni aggiunti di iniziativa perché
già visti come necessari nei documenti reali di riferimento (la
convocazione INPS/INAIL cita PEC e destinatari per esteso; il piano di
risanamento cita capitale sociale, REA, Amministratore Unico) — tutti
utili quando produrremo report e lettere formali.

- Nuovi campi in Azienda: indirizzo/città/provincia/CAP di sede legale,
  numero di sedi secondarie, forma giuridica, capitale sociale,
  rappresentante legale (nome + ruolo), numero REA, PEC.
- Tutti opzionali e aggiunti con lo stesso pattern auto-riparante delle
  altre colonne (`ADD COLUMN IF NOT EXISTS`): gli spazi già provisionati
  non richiedono alcuna migrazione manuale.
- Il form di creazione rapida in Aziende resta minimo (ragione sociale,
  CF, P.IVA, ATECO) — i nuovi campi si compilano nella tab Anagrafica
  della scheda di dettaglio, coerente con "crea in fretta, qualifica
  dopo".
- L'intestazione della scheda azienda mostra ora forma giuridica,
  rappresentante legale/ruolo e città quando presenti.

## 0.21.1 — 2026-07-30 (stesso giorno, venticinquesima consegna)

**Correzione: sidebar riordinata come indicato, e Azienda XBRL rifatto da capo (era sbagliato)**

Due correzioni dirette a un fraintendimento della consegna precedente, non
rifiniture:

- **Sidebar riordinata**: Dashboard → Parametri di Spazio → Utenti →
  Aziende → Scenari → Normativa CCII. Nessuna logica di visibilità
  toccata (un Operatore continua a vedere solo Dashboard e Scenari) — solo
  l'ordine, così che "spegnere" voci per un ruolo non richieda riscrivere
  la sidebar da zero.
- **Azienda: eliminato il doppio punto di accesso**. In Aziende c'era un
  pulsante "Apri" accanto alla matita di modifica inline: due modi diversi
  di modificare la stessa anagrafica. Rimossa la modifica inline; resta un
  solo ingresso per azienda verso la sua scheda di dettaglio, dove
  Anagrafica è una tab come le altre.
- **Azienda: rimosso il caricamento file XBRL** che avevo aggiunto lì —
  duplicava il caricamento che deve avvenire nello Scenario. Le tab
  "Configurazione XBRL" e "Indici" nella scheda azienda ora sono solo
  configurazione (nessun upload): quali tab XBRL (tra quelle attive per lo
  spazio) e quali indici (tra quelli attivi per lo spazio) si applicano a
  QUESTA azienda — utile perché aziende diverse nello stesso spazio (es.
  settori ATECO diversi in uno studio commercialista) possono avere
  bisogno di sottoinsiemi diversi. Due nuove tabelle tenant
  (`xbrl_tab_azienda`, `indici_azienda`) per questi override, entrambe un
  sottoinsieme di quanto abilitato a livello di spazio, mai un'estensione.
- La tabella `xbrl_storico_azienda` e le relative azioni (introdotte nella
  consegna precedente) restano nel codice: serviranno al caricamento vero
  e proprio quando costruiremo l'Import XBRL dentro lo Scenario (che è
  aziendale) — quel caricamento alimenterà solo le tab e gli indici
  confermati qui per l'azienda di quello scenario.

## 0.21.0 — 2026-07-30 (stesso giorno, ventiquattresima consegna)

**Import XBRL attivato a livello di Azienda (pezzo 1 di 5 del piano concordato: XBRL Azienda → Indici → Sidebar → Relazione AI unificata → Specchio proposta)**

Prima l'Import XBRL viveva solo come placeholder ("PRESTO") dentro lo
Scenario, e "Aziende" era solo anagrafica flat senza pagina di dettaglio.
Costruito quanto serviva per renderlo reale, riusando l'UNICO motore di
parsing della piattaforma (`src/lib/xbrl`, stesso usato dal modulo
superadmin) — non ricreato da zero.

- **Pagina di dettaglio Azienda** (`/aziende/[aziendaId]`), con due tab:
  Anagrafica (stesso form già in Aziende, ora anche nel dettaglio) e
  **Import XBRL**. Un pulsante "Apri" per ogni azienda in elenco porta qui.
- **Storico XBRL per azienda**: nuova tabella tenant `xbrl_storico_azienda`
  (isolata per spazio) — deliberatamente **non** la tabella globale
  `public.analisi_xbrl_storico` usata dal solo superadmin, che avrebbe
  rotto l'isolamento multi-tenant su cui è costruita tutta la piattaforma.
  Carica un file → analisi immediata (senza salvare) → "Salva nello
  storico" solo se si vuole tenerlo. Un salvataggio per lo stesso anno
  sovrascrive il precedente, non lo duplica.
- **Tab XBRL personalizzabili per spazio**: in Parametri di Spazio, nuova
  sezione "Tab XBRL attive" (Indici CNDCEC / Altri Indici / Situazione
  Debitoria / Andamento Storico), con checkbox come per gli Indici. Non
  tutte servono a ogni studio — quelle disattivate non compaiono
  nell'Import XBRL delle aziende di quello spazio.
- **Andamento Storico**: riusa `calcolaTrend` (stesso motore del
  superadmin) per confrontare i bilanci salvati nel tempo.
- Rimandata volutamente da questo giro: la tab "Parificazione Tag" (agisce
  su una tabella globale condivisa tra spazi — va bene tenerla lì finché
  non serve altrove) e l'esportazione PDF/Excel del singolo bilancio.

**Prossimo pezzo (2 di 5)**: Indici quantitativi collegati a questo
storico, per alimentare la Relazione AI quali-quantitativa unificata.

## 0.20.1 — 2026-07-29 (stesso giorno, ventitreesima consegna)

**Correzione del criterio di ricevibilità: confronto col valore di liquidazione, non solo % minima fissa**

Spunto da un caso reale (Composizione Negoziata Athena Pubblicità S.r.l.):
la documentazione allegata alla convocazione INPS/INAIL include esplicitamente
una relazione "sulla convenienza della soluzione proposta rispetto
all'alternativa liquidatoria" — è quello il vero test di ricevibilità
ex CCII, non una soglia percentuale fissa per ente.

- Nuovo campo **valore di liquidazione stimato** (€) per categoria di
  creditore in Parametri di Spazio, accanto alla % minima già esistente.
  Facoltativo: se non impostato, il comportamento resta quello di prima
  (solo % minima).
- **Verifica di ricevibilità aggiornata**: se per una categoria è stato
  stimato un valore di liquidazione, il test principale diventa "l'importo
  offerto (importo dovuto × % offerta) è almeno pari a quel valore?" — la
  % minima resta un pavimento aggiuntivo solo se impostata sopra zero.
  La motivazione mostrata (e quella letta dalla relazione AI) riporta
  quale criterio non è stato soddisfatto, in euro.
- Non toccati in questa consegna (rimandati): categorie di creditore per
  rango legale (chirografario/privilegiato/fiscale-previdenziale) al posto
  del singolo ente, ed entità "Comunicazione" separata dalla proposta.

## 0.20.0 — 2026-07-29 (stesso giorno, ventiduesima consegna)

**Login Operatori/Consultatori + permessi granulari per modulo e per azienda + sidebar filtrata davvero (non solo "spenta")**

Come discusso: né un menu che nasconde voci mentre il server lascia comunque passare, né una sidebar ricostruita da zero per ogni ruolo. Un'unica fonte di permessi (`permessi_utente` + `utenti_aziende`), letta sia dalla sidebar sia dal controllo d'accesso reale di ogni pagina.

- **Login per Operatori/Consultatori**: stesso principio già usato per l'Admin di Spazio (indice email→schema, `utente_spazio_index`, auto-riparazione se l'indice non è aggiornato). Password sempre temporanea fino al primo cambio, stesso obbligo già in vigore per l'Admin.
- **Permessi per modulo** (Scenari/Check List/Indici/XBRL/Report): Nessun Accesso / Sola Lettura / Lettura e Scrittura, editabili dall'Admin di Spazio direttamente nella scheda di ogni utente (pannello "Permessi"). Default alla creazione: moduli di analisi aperti, gestione dello spazio sempre negata.
- **Sidebar filtrata per davvero**: un Operatore non vede mai Aziende/Utenti/Parametri di Spazio (riservati all'Admin), e vede Scenari solo se ha un permesso diverso da "Nessuno". Le pagine sotto-scenario (Check List/Report) sono anch'esse protette lato server, non solo nascoste dal menu — un tentativo di accesso diretto via URL viene respinto comunque.
- **Aziende limitate**: un Operatore vede in "Scenari" solo le aziende a cui l'Admin lo ha associato, non tutte quelle dello spazio.
- **Corretto un terzo errore dello stesso tipo** delle volte scorse (una costante esportata per sbaglio da un file `'use server'`, questa volta `MODULI_PERMESSO`): intercettato e spostato in `src/lib/moduliPermesso.ts` prima ancora di eseguire il type-check, non dopo.

## 0.19.0 — 2026-07-29 (stesso giorno, ventunesima consegna)

**Pezzo 3 di 3: il ciclo Check List → limiti → proposta → giudizio è chiuso end-to-end**

Costruito per intero, non ridotto: form di acquisizione della proposta,
verifica automatica di ricevibilità, relazione finale con supporto AI.

- **Acquisizione proposta**: nella tab Report di ogni scenario, una riga
  per categoria di creditore (importo dovuto, % offerta, modalità unica
  soluzione/rateale, numero rate). Le categorie già configurate in
  Parametri di Spazio compaiono come suggerimento, ma si può scriverne
  anche una nuova al volo.
- **Verifica di ricevibilità automatica**: ogni riga viene confrontata con
  i limiti configurati per quella categoria (fallback su "Generale" se non
  c'è un limite specifico) — % minima, modalità ammesse. Esito per riga e
  complessivo (ricevibile solo se lo sono tutte le righe), con motivazione
  visibile passando sopra il badge.
- **Relazione finale con supporto AI** (Claude, stesso motore già
  collaudato per l'analisi XBRL): legge insieme il quadro qualitativo
  della Check List (criticità strutturali aperte incluse) e l'esito di
  ricevibilità, e redige una relazione in 4 sezioni (sintesi esecutiva,
  verifica per creditore, quadro Check List, raccomandazioni). **Dichiara
  esplicitamente in apertura** che Indici e XBRL non sono ancora integrati
  in questa lettura — non finge di leggere dati che non ha.

Con questo pezzo il ciclo pensato all'origine (Check List + limiti +
proposta + giudizio) è dimostrabile per intero, in attesa di agganciare
Indici e XBRL quando quei moduli saranno pronti.

## 0.18.0 — 2026-07-29 (stesso giorno, ventesima consegna)

**Parametri di Spazio (pezzo 2 di 3), con un taglio deliberatamente operativo per arrivare a un beta dimostrabile in tempi ragionevoli**

Scelta esplicita: la configurazione Check List per singola azienda (che
avevo annotato come parte di questo pezzo) è rimandata — è un
affinamento, non un blocco per iniziare a confrontarsi con INPS,
commercialisti e avvocati. Costruito invece ciò che serve davvero per il
prossimo passo (il form della proposta):

- **Selezione Indici**: quali indici del dizionario master (gestito dal
  superadmin) usare in questo spazio specifico — un sottoinsieme, non
  nuovi indici. Se un indice non ha una scelta esplicita, resta abilitato
  di default.
- **Limiti di ricevibilità della proposta**: per categoria di creditore
  (INPS, Agenzia Entrate, Banche, Fornitori, più "Generale" come
  fallback), una % minima di saldo del debito, se ammessa l'unica
  soluzione, se ammessa la rateizzazione. Precompilati con valori di
  partenza ragionevoli (es. INPS 100%), modificabili subito. È la base su
  cui si aggancerà il controllo automatico di ricevibilità nel prossimo
  pezzo (il form della proposta).
- Parametri di sistema mostrati in sola lettura per riferimento (l'override
  per singolo spazio è anch'esso rimandato).
- Nuova voce "Parametri di Spazio" in sidebar.

**Prossimo pezzo (3 di 3)**: il form strutturato per acquisire la
proposta (per categoria di creditore: importo, % offerta, modalità),
agganciato allo Scenario, con verifica automatica contro questi limiti e
relazione finale con supporto AI.

## 0.17.0 — 2026-07-29 (stesso giorno, diciannovesima consegna)

**"Scenari" diventa una voce propria in sidebar (pezzo 1 di 3: Scenari → Parametri di Spazio → Form proposta)**

Prima Check List aveva il proprio selettore azienda/scenario incorporato:
sbagliato in prospettiva, perché Indici/XBRL/Report avrebbero dovuto
duplicarlo ciascuno per conto proprio. Ristrutturato: lo scenario si
sceglie/crea una volta sola, e da lì si entra nelle sue analisi.

- Nuova voce "Scenari" in sidebar (sostituisce "Check List" come voce di
  primo livello). Pagina `/spazio/[codice]/scenari`: seleziona azienda →
  elenco/creazione scenari di quell'azienda.
- Entrando in uno scenario (`/spazio/[codice]/scenari/[scenarioId]`): un
  layout con intestazione (nome, proposta, stato) e sotto-navigazione verso
  Check List (reale), Indici/XBRL/Report (placeholder onesti, non ancora
  costruiti).
- **Rimossi** la vecchia rotta `/spazio/[codice]/checklist` e il vecchio
  componente `ChecklistManager.tsx` (con selettore incorporato): sostituiti
  da `ScenariManager.tsx` (selezione/creazione) e `ChecklistScenario.tsx`
  (solo compilazione, riceve lo scenario già scelto) — non sono rimasti
  entrambi in parallelo.
- Dashboard di Spazio aggiornata: la card "Check List in corso" (che diceva
  ancora "modulo non costruito", ormai falso) è diventata "Scenari", con
  conteggio reale su tutte le aziende.
- **Corretto un secondo errore dello stesso tipo già visto** (una costante,
  `ORIGINI_PER_TIPO`, esportata per errore da un file `'use server'`):
  spostata in `src/lib/origineProposta.ts`, non-server, stesso principio
  già applicato a `RUOLI_ADMIN_SPAZIO`.

**Prossimo pezzo (2 di 3)**: "Parametri di Spazio" — parametri di sistema
ereditati, selezione degli indici da usare, configurazione Check List per
azienda, e i nuovi limiti di ricevibilità della proposta (% minima di
saldo del debito).

## 0.16.2 — 2026-07-29 (stesso giorno, diciottesima consegna)

**Lo stesso fix di 0.16.1, esteso a scenari e risposte**

Il fix precedente (timeout esplicito di 15 secondi) copriva solo il
caricamento iniziale delle aziende. Il caricamento degli scenari (dopo
aver scelto un'azienda) e delle risposte alla Check List (dopo aver scelto
uno scenario) non avevano la stessa protezione: se una di quelle due
chiamate resta sospesa, ora mostra un errore leggibile entro 15 secondi
invece di restare bloccata — con un feedback visivo dedicato
("Caricamento scenari...") sotto il menu a tendina.

## 0.16.1 — 2026-07-29 (stesso giorno, diciassettesima consegna)

**Fix: "Caricamento..." infinito nella Check List**

Il blocco che carica le aziende aveva già try/catch/finally corretti, ma
questo non protegge da un caso specifico: una chiamata che non risponde
affatto (connessione al database in coda o simile) non genera né un
successo né un errore — resta sospesa, e nessun try/catch la intercetta.
Aggiunto un timeout esplicito (15 secondi) su entrambe le chiamate di
caricamento iniziale: oltre quel limite, viene mostrato un errore reale
invece di un caricamento infinito.

## 0.16.0 — 2026-07-29 (stesso giorno, sedicesima consegna)

**Lo Scenario nasce dalla proposta (Ricevuta o Da Definire), non più da un nome libero**

Confermato con l'utente: creare uno Scenario significa dichiarare fin da
subito se la proposta che lo determina è Ricevuta (da un Ente o dal
Tribunale) o Da Definire (dallo studio, da un professionista,
dall'azienda) — è l'input che scatena l'intero ciclo di verifica
(Check List, e in futuro XBRL/Indici/Test Pratico/Cram Down).

- Tabella `scenari`: aggiunti `tipo_proposta` e `origine_proposta`, con
  vincolo applicativo (l'origine deve appartenere al tipo scelto).
- Form di creazione scenario in Check List aggiornato: tipo proposta →
  origine (aggiornata dinamicamente in base al tipo) → nome → crea. Il
  menu di selezione scenario mostra tipo e origine accanto al nome.

**Fix operativi (nota 1 del messaggio precedente):**
- Corretto un bug reale in "Configurazione Check List": le combo dei pesi
  (e tutti gli input numerici della pagina) non avevano un colore di
  testo/sfondo esplicito — su alcune configurazioni risultavano bianco su
  bianco, illeggibili.
- Aggiunta una legenda in popup ("Come funziona") che spiega cosa
  significano i tre livelli di peso e come si calcola il quadro
  qualitativo finale.

**Annotato per i prossimi step, non ancora costruito**: la scelta di dove
posizionare la sintesi AI (spostarla alla fine del ciclo di verifica), la
possibilità per l'Admin di Spazio di attivare/disattivare singole tab
dell'analisi XBRL a seconda di tipo spazio/azienda (inclusa una tab
dedicata al caricamento dei valori correnti, non solo storici), e un
mini-agente AI per generare la carta intestata dal logo dell'azienda.

## 0.15.0 — 2026-07-29 (stesso giorno, quindicesima consegna)

**Governo del superadmin sui pesi della Check List**

I pesi assegnati alle ~50 domande (0.14.0) sono una scelta di merito, non
un dato normativo, e prima potevano essere cambiati solo modificando
codice e rifacendo un deploy — inaccettabile per un aggiustamento che un
commercialista dovrebbe poter fare da solo. Coerente con il modello già
stabilito ("parametri di base governati dal superadmin, ereditati dagli
spazi"):

- Nuova voce in sidebar "Configurazione Check List" (subito dopo
  Dizionario Indici): per ogni domanda, un menu per cambiarne il peso
  (Strutturale/Rilevante/Documentale), con indicazione visiva di quali
  sono state personalizzate rispetto al default e un pulsante per
  ripristinarlo.
- Anche i tre valori numerici dei pesi e le due soglie di sintesi
  ("Solido"/"Da rafforzare") sono ora configurabili dalla stessa pagina.
- Le tabelle di override vivono nello schema `public` (non per-tenant):
  è un parametro di base valido per tutti gli spazi, non specifico di uno
  spazio — auto-inizializzate al primo utilizzo, stesso principio già
  usato ovunque.
- La Check List di ogni spazio ora legge questa configurazione effettiva
  invece della costante statica nel codice: un cambio di peso fatto dal
  superadmin si riflette subito in tutti gli spazi, senza deploy.

## 0.14.0 — 2026-07-29 (stesso giorno, quattordicesima consegna)

**Tab per sezione, peso su ogni domanda, quadro qualitativo con soglie (Modello B)**

- Check List divisa in tab per sezione (una alla volta), non più tutta su
  una pagina lunga — ciascuna con contatore di completamento.
- Assegnato un peso a tutte le ~50 domande: STRUTTURALE (3) / RILEVANTE (2)
  / DOCUMENTALE (1) — scelta di merito fatta in base alla logica del testo
  ministeriale, da rivedere con un professionista prima di un uso reale
  verso terzi.
- Quadro qualitativo pesato: percentuale di criticità (peso dei "No" sul
  peso totale delle domande già risposte), con etichetta e soglie
  (solido / da rafforzare / criticità rilevanti), calcolato per sezione e
  complessivo. Elenco dedicato delle criticità strutturali ancora aperte.
- **Consolidamento**: trovato un modulo `scoring.ts` già scritto e testato
  a parte (4 test, ora 19 in totale) che faceva lo stesso calcolo in modo
  più completo del mio primo tentativo interno al componente — sostituito
  il mio calcolo con quello, invece di lasciare due implementazioni
  parallele dello stesso punteggio.

## 0.13.0 — 2026-07-29 (stesso giorno, tredicesima consegna)

**Riformulata la cornice normativa, e primo modulo del "cuore" del prodotto: Scenario + Check List ministeriale**

Prima di continuare a costruire funzionalità, verificato con fonti ufficiali: l'art. 13 comma 2 CCII (i "5 indici CNDCEC" su cui si basa la Tab 1 dell'Analisi XBRL) è stato abrogato dal D.Lgs. 83/2022, e quegli indici non sono mai stati approvati ufficialmente. Il quadro oggi in vigore (artt. 5-bis, 13, 17 CCII, come modificati dal D.Lgs. 136/2024) è la composizione negoziata, con due strumenti ufficiali aggiornati dal decreto dirigenziale del Ministero della Giustizia del 23 aprile 2026: il Test Pratico (prognosi di sostenibilità del debito) e la Check List (guida alla redazione del piano di risanamento, 8 sezioni).

- **Scenario**: nuova entità centrale, introdotta come guscio leggero. Un'azienda può avere N scenari nel tempo (id, nome, stato bozza/in corso/completato/archiviato). Check List, Test Pratico, Indici, XBRL e Cram Down si aggancieranno tutti qui, non più direttamente all'Azienda.
- **Check List Ministeriale**: costruita sulla struttura ufficiale reale (Sezione II del decreto 23/4/2026) — 7 sezioni, ~50 domande con risposta Sì/No e indicazione operativa in caso di "No", non un elenco generico. Selezione azienda → scenario → compilazione interattiva, salvataggio automatico per singola risposta.
- La sidebar "Check List" passa da "presto" a "pronta".
- **Non ancora fatto, di proposito**: il Test Pratico (prossimo modulo, formula già nota e pronta per essere implementata) e la riformulazione delle diciture "Indici CNDCEC" nella Tab XBRL esistente (da fare quando arriviamo lì).

## 0.12.0 — 2026-07-29 (stesso giorno, dodicesima consegna)

**Gestione Utenti collegati alle Aziende + password sempre temporanea fino alla scelta dell'utente**

- **Utenti dello Spazio** (Operativo/Consultatore): creazione, modifica,
  disabilitazione/riattivazione, rigenerazione password. Ogni utente è
  associato a una o più aziende (tabella `utenti_aziende`, N:N) — non può
  operare su aziende a cui non è associato. Auto-provisionata per i nuovi
  spazi, auto-riparata per quelli esistenti, stesso principio già usato
  altrove. La sidebar "Utenti" passa da "parziale" a "pronta".
- **Cambio password obbligatorio al primo accesso**: sia la password
  assegnata alla creazione dell'Admin di Spazio, sia quella rigenerata,
  sono ora sempre temporanee — il layout dello spazio reindirizza
  automaticamente a `/cambio-password/[codice]` finché l'Admin non ne
  imposta una propria (pagina separata, senza sidebar, per non permettere
  di aggirare il passaggio navigando altrove).
- Aggiunta una colonna `email` a `sessioni`, necessaria per sapere *quale*
  admin ha fatto login (prima si sapeva solo lo spazio, non la persona) —
  serve a collegare la sessione al record giusto in `admin_workspace` per
  applicare il cambio password.
- Utenti Operativi/Consultatori non hanno ancora un proprio login reale
  (solo l'Admin di Spazio ce l'ha): prossimo passo naturale, lo schema è
  già pronto a riceverlo (stessa struttura password_hash/password_temporanea).

## 0.11.0 — 2026-07-29 (stesso giorno, undicesima consegna)

**Bug di confine di sicurezza: il pannello spazio mostrava la sidebar del superadmin**

Segnalato da uno screenshot con due sidebar visibili insieme. Causa: il
pannello dello spazio viveva sotto `/superadmin/workspace/[codice]/*`, e
quel percorso eredita automaticamente il layout `/superadmin/layout.tsx`
— che mostra la Sidebar del superadmin (Licenze Commerciali, Spazi di
Lavoro, ecc.) per **qualunque** ruolo autenticato, incluso un vero Admin
di Spazio. Non solo un problema estetico: un vero Admin di Spazio che
avesse fatto login avrebbe visto gli strumenti di gestione del
superadmin, a cui non deve avere accesso.

- L'intero pannello spostato da `/superadmin/workspace/[codice]/*` a
  `/spazio/[codice]/*`, un albero di rotte indipendente, senza alcuna
  relazione con il layout o la Sidebar del superadmin.
- Aggiornati tutti i riferimenti al vecchio percorso (login, Manutenzione
  Spazi, Spazi di Lavoro, sidebar interna del pannello).
- Il controllo d'accesso (`ottieniContestoAccessoSpazio`, già unificato
  per salvagente e Admin di Spazio reale) resta l'unico punto di verifica,
  ora nel posto giusto.

## 0.10.1 — 2026-07-29 (stesso giorno, decima consegna)

**La rigenerazione password non era sparita: era nascosta da un'etichetta ingannevole**

Nella ristrutturazione in dashboard+sidebar (0.10.0), la lista Admin di
Spazio con "Rigenera Password" (costruita in 0.9.2) è finita nella sezione
"Utenti" — ma la sidebar la marcava "Presto" identica alle sezioni
davvero vuote, quindi invisibile all'occhio anche se cliccabile.

- La sidebar ora distingue tre stati: **pronta** (Dashboard, Aziende),
  **parziale** (Utenti — contiene già l'Admin di Spazio reale, manca solo
  la gestione di Operatori/Consultatori), **presto** (il resto, davvero
  vuoto). Solo "presto" è mostrato in grigio spento.
- Le card "Aziende Attive" e "Utenti / Admin" nella Dashboard sono ora
  collegamenti diretti alle rispettive sezioni.

## 0.10.0 — 2026-07-29 (stesso giorno, nona consegna)

**Dashboard di Spazio, sidebar e gestione Aziende — basati sui due documenti di specifica allegati**

Letti integralmente "riscrittura_completa.docx" e "ANALISI_FUNZIONALE_E_TECNICA_DETTAGLIATA.docx" (v2.0). Confermato con l'utente: il concetto di "Scenario" (un'azienda può avere N scenari nel tempo, ognuno un ciclo di analisi completo) resta centrale e verrà agganciato sopra le Aziende quando costruiremo Check List/Indici/Report.

- **Tabella `aziende`** per ogni spazio (ragione sociale, CF, P.IVA, ATECO, logo — quest'ultimo rimandato), auto-provisionata per i nuovi spazi e auto-riparata per quelli già esistenti, stesso principio già usato per `admin_spazio_index`.
- **Sidebar del Pannello Spazio**: rispecchia le funzioni dell'Admin di Spazio dall'analisi funzionale (Dashboard, Aziende, Utenti, Check List, Indici, Import XBRL, Report, Normativa CCII). Solo Dashboard e Aziende sono costruite per davvero; le altre sono in navigazione con etichetta "Presto" e una pagina placeholder onesta che elenca cosa conterranno — non fingono di essere pronte.
- **Dashboard di Spazio**: cruscotto con aziende attive e admin/utenti (dati reali), check list e report a zero onesto (moduli non ancora costruiti, non un errore di conteggio).
- **Gestione Aziende**: creazione, modifica, disabilitazione/riattivazione (soft, non cancellazione — le aziende dovranno restare collegate a scenari futuri anche se non più operative).
- **Corretto un buco reale**: un Admin di Spazio che faceva login veniva rediretto su `/superadmin/Spazi` (il form di creazione spazio del superadmin!). Ora atterra sul proprio Pannello Spazio.
- **Unificato l'accesso al pannello**: prima il superadmin (salvagente) e un vero Admin di Spazio autenticato avrebbero avuto bisogno di due controlli diversi, con il rischio di collisione multi-scheda già segnalato in una versione precedente. Ora una sola funzione (`ottieniContestoAccessoSpazio`) riconosce entrambi i casi e li serve dallo stesso layout, con un banner diverso per ciascuno.
- Individuate (non toccate, fuori scope) alcune pagine orfane pre-esistenti dal codice originale (`/superadmin/CramDown`, `/superadmin/Rabc`, `/wizard-setup`, `/setup-licenza`, `/ccii-dashboard`): compilano ma non sono collegate alla sidebar attuale — candidate per un futuro giro di pulizia.

## 0.9.2 — 2026-07-29 (stesso giorno, ottava consegna)

**Aggiunta la rigenerazione password: prima non esisteva alcun modo di recuperarla se persa**

La password temporanea di un Admin di Spazio viene mostrata una sola volta
alla creazione. Se si perde — o se l'admin è stato creato prima che questo
meccanismo esistesse, come nel caso appena verificato — prima non c'era
alcun modo di recuperarla o generarne una nuova: da qui il "Credenziali non
valide" persistente, non un bug di login ma una password realmente
sconosciuta.

- Nuovo pulsante "Rigenera Password" nel Pannello Spazio, per ogni admin
  elencato. Genera una nuova password temporanea, mostrata una sola volta
  (con conferma esplicita prima di invalidare quella attuale).
- **Correzione di un mio errore**: nella stessa modifica avevo cancellato
  per sbaglio una riga di codice (l'apertura dell'interfaccia
  `AdminSpazio`), che il type-check ha segnalato subito prima che finisse
  nello zip — controllato e corretto prima della consegna, non dopo.

## 0.9.1 — 2026-07-29 (stesso giorno, settima consegna)

**Confermato con query dirette: l'admin esisteva davvero, mancava solo l'indice per gli spazi creati prima di 0.8.0**

Verificato insieme sul database: 3 schemi tenant esistenti
(`tenant_wp_2026_001`, `tenant_wp_2026_002`, `tenant_spazioprova_2026_001`),
tutti creati prima che `admin_spazio_index` esistesse — quindi nessuno dei
loro admin era indicizzato, login bloccato anche con il fix di 0.8.0.

- Script SQL di recupero fornito in chat per sbloccare subito i 3 spazi
  esistenti, senza aspettare un deploy.
- **Auto-riparazione permanente nel codice**: se un'email non è
  nell'indice, `eseguiAutenticazione` ora scandisce tutti gli schemi
  `tenant_%` esistenti, e se trova l'admin lì, ripara l'indice al volo.
  D'ora in poi, nessuno spazio "vecchio" (creato prima di una futura
  modifica a questo meccanismo) potrà mai più bloccare un login per questo
  motivo — si ripara da solo al primo tentativo.

## 0.9.0 — 2026-07-29 (stesso giorno, sesta consegna)

**Il pannello salvagente ora mostra dati reali, non un messaggio di conferma**

Richiesta legittima: non fidarsi a parole se un admin "esiste davvero" nel
database, poterlo verificare a schermo. Il "Pannello Spazio" (raggiunto
entrando come salvagente) ora legge per davvero lo schema isolato dello
spazio e mostra gli Admin di Spazio effettivamente presenti — se sono
zero, lo dice esplicitamente invece di un messaggio generico di conferma.

- Nuova funzione `ottieniAdminSpazio`: legge `admin_workspace` dallo schema
  del tenant (non più `public`), restituendo nome/cognome/email/cellulare
  (mai gli hash delle password).
- Il pannello mostra questi dati, o un avviso esplicito se non trova
  nessun admin — la stessa pagina è ora uno strumento di verifica, non solo
  una schermata di ingresso.
- Aggiunte query di diagnosi dirette (in chat, non nel codice) per
  controllare a mano su Railway se una riga esiste davvero, senza dover
  aspettare un nuovo deploy per saperlo.

## 0.8.0 — 2026-07-29 (stesso giorno, quinta consegna)

**Login dell'Admin di Spazio: non cercava mai nello schema giusto**

L'Admin di Spazio veniva creato correttamente nello schema isolato del
proprio spazio (`tenant_xxx`), ma il login cercava sempre e solo nello
schema `public` — che non ha mai avuto senso per un admin legato a uno
spazio specifico ("relation admin_workspace does not exist": quello
schema non è mai stato popolato per davvero).

- Nuova tabella `admin_spazio_index` (email → schema, spazio, codice):
  popolata automaticamente da `creaSpazioAction` subito dopo aver creato
  l'admin nel suo schema.
- `eseguiAutenticazione` ora cerca prima in questo indice per sapere in
  quale schema verificare le credenziali, invece di guardare solo
  `public`.
- La password temporanea generata alla creazione era già mostrata
  correttamente (verificato nel codice): se non l'hai vista, ricontrolla
  alla prossima creazione — viene mostrata una sola volta.

## 0.7.0 — 2026-07-29 (stesso giorno, quarta consegna)

**Creazione dello spazio confermata funzionante end-to-end** (licenza commerciale → spazio → schema isolato → Admin di Spazio → salvagente), come da screenshot di conferma.

- Nuova voce in sidebar "Manutenzione Spazi": pagina dedicata solo
  all'elenco degli spazi esistenti e all'ingresso come salvagente, separata
  dalla pagina di creazione per non farla scorrere troppo.
- "Spazi di Lavoro" ora contiene solo il form di creazione, con un rimando
  a Manutenzione Spazi dopo ogni creazione riuscita.
- L'ingresso in uno spazio (sia dalla combo di login sia da Manutenzione
  Spazi) apre ora in una nuova scheda del browser, così il superadmin non
  perde la propria pagina di partenza e può tenere aperti più spazi in
  schede separate.
- Annotato (non ancora implementato): il modello per cui l'Admin di Spazio
  vede solo il proprio spazio ma può gestire più aziende al suo interno,
  con utenti creati nella stessa funzione di creazione azienda, entro un
  limite di licenza complessivo di spazio (non per singola azienda) — base
  per il prossimo pannello operativo da costruire.
- Segnalata (non ancora corretta) una fragilità nota: il contesto "in quale
  spazio sto operando" oggi vive in un cookie condiviso dal browser, che
  non distingue bene tra più schede aperte su spazi diversi
  contemporaneamente — da risolvere leggendo lo spazio dal codice nell'URL
  quando costruiremo il vero pannello operativo.

## 0.6.2 — 2026-07-29 (stesso giorno, terza consegna)

**La causa reale, finalmente visibile grazie al fix di 0.6.1**

Con gli errori non più mascherati, è comparso il messaggio vero: `column
"licenza_commerciale_id" does not exist`. Causa: `ensureTables.ts` eseguiva
tutte le istruzioni di creazione/modifica come UN UNICO blocco
multi-istruzione. Postgres avvolge un blocco così in una transazione
implicita — se una sola istruzione a metà fallisce, vengono annullate
anche quelle precedenti già riuscite nello stesso blocco. Nello specifico:
la `CREATE INDEX` su `licenza_commerciale_id` veniva eseguita PRIMA
dell'`ALTER TABLE` che aggiunge quella colonna; su una tabella
`licenze_spazio` preesistente (creata da una versione precedente di questo
progetto, senza quella colonna), l'indice falliva subito e si portava
dietro l'annullamento di tutto il resto.

- Ogni istruzione DDL in `ensureTables.ts` è ora una query separata,
  eseguita in sequenza nell'ordine di dipendenza corretto (colonna prima,
  indice che la usa dopo) — un fallimento su una non annulla più le altre.

## 0.6.1 — 2026-07-29 (stesso giorno, consegna successiva)

**Bonifica sistemica: lo stesso problema di 0.6.0 c'era in altri 8 punti**

Dopo la correzione in 0.6.0, la creazione di uno spazio falliva ancora con
lo stesso messaggio mascherato: `contaSpaziPerLicenza` non aveva alcun
try/catch, e la chiamata era fuori da qualunque blocco protetto dentro
`creaSpazioAction`. Invece di correggere punto per punto ad ogni nuovo
report, ho passato in rassegna **tutte** le server action di spazi.ts,
licenze.ts e auth.ts:

- `creaSpazioAction`: un solo try/catch avvolge ora l'intera funzione (non
  solo la parte finale della transazione) — nessuna chiamata intermedia può
  più uscire come throw non gestito.
- `contaSpaziPerLicenza`, `creaLicenzaCommercialeAction`,
  `rigeneraChiaveLicenza`, `salvaParametriLicenza`, `salvaAnagraficaLicenza`,
  `sospendiLicenzaAction`, `riattivaLicenzaAction`, `cessaLicenzaAction`,
  `entraComeSalvagenteAction`, `eseguiLogout`: convertite tutte allo stesso
  pattern "restituisci l'esito, non lanciarlo mai".
- Aggiornati tutti i punti in `ModuloLicenza.tsx` che leggevano i vecchi
  valori di ritorno (booleani diretti, stringhe, oggetti Licenza) per usare
  la nuova forma `{ success, dato?, error? }`.

## 0.6.0 — 2026-07-29

**Correzione critica: gli errori delle Server Action non arrivavano mai a schermo**

Next.js maschera in produzione il messaggio di QUALSIASI errore lanciato
(`throw`) da una Server Action, sostituendolo con un testo generico ("An
error occurred in the Server Components render..."), a prescindere da
try/catch interni alla funzione. Le funzioni che leggono spazi e licenze
lanciavano l'errore invece di restituirlo: risultato, l'utente vedeva
sempre il messaggio mascherato, mai la causa reale.

- `ottieniSpaziAction`, `elencaLicenzeCommerciali`, `getLicenzaPerId`: non
  lanciano più eccezioni, restituiscono `{ success, dato, error? }`. Tutte
  le pagine che le chiamano sono state aggiornate di conseguenza.
- Aggiunta questa pagina di changelog, come richiesto.

## 0.5.0 — 2026-07-29 (stesso giorno, consegna precedente)

- Corretta una corsa concorrente: la pagina Spazi lanciava in parallelo la
  lettura di spazi e licenze, entrambe le quali potevano innescare la
  stessa auto-inizializzazione delle tabelle nello stesso istante. Ora sono
  sequenziali; `ensureTables.ts` ignora inoltre gli errori Postgres di tipo
  "esiste già" (`42P07`, `42701`, `42710`, `23505`) invece di farli
  propagare.
- Login del superadmin: dopo la password, una combo chiede "dove vuoi
  operare" (la propria dashboard o uno spazio specifico da ispezionare). In
  assenza di spazi provisionati, la combo mostra solo la dashboard.

## 0.4.0

- Stato commerciale della licenza: ATTIVA / SOSPESA / CESSATA, indipendente
  dalla scadenza naturale, con pulsanti dedicati nella schermata licenza.
- Codici "parlanti": il codice spazio incorpora la descrizione (es.
  `STUDIOROSSI-2026-001`), la chiave di licenza commerciale incorpora la
  ragione sociale (es. `CCII-STUDIOROSSI-A3F9`). Pulsanti di copia rapida
  ovunque questi codici compaiono.
- Auto-inizializzazione delle tabelle di sistema (spazi, licenze_spazio,
  licenze): non serve più eseguire manualmente gli script SQL prima di
  usare queste funzioni, si creano da sole al primo utilizzo.
- Sidebar riordinata: Parametri di Sistema → Dizionario Indici → Analisi
  XBRL → Licenze Commerciali → Spazi di Lavoro (l'ambiente di base viene
  prima delle licenze, che vengono prima degli spazi).
- Aggiunto il ruolo "Responsabile IT" tra i ruoli assegnabili all'Admin di
  Spazio.

## 0.3.0

- Licenza commerciale trasformata da riga singola globale a entità
  multipla: `/superadmin/Licenze` è ora un elenco con creazione e modifica,
  non più un singolo record forzato.
- Creazione di uno Spazio di Lavoro ora collega una licenza operativa a una
  licenza commerciale esistente (selezionata da un elenco, non più una
  chiave libera), verifica la capienza (`max_spazi`), e crea
  contestualmente l'Admin di Spazio (nome, cognome, email, ruolo,
  cellulare) con password temporanea generata e mostrata una sola volta.

## 0.2.0

- Provisioning dello schema Postgres isolato per ogni spazio, scomposto in
  funzioni separate (schema da solo, poi admin, poi dati master) invece di
  un'unica funzione monolitica.
- Modalità "salvagente": il superadmin può entrare in qualunque spazio
  provisionato senza sostituire la propria sessione di autenticazione.

## 0.1.0

- Prima versione funzionante di creazione Spazi di Lavoro (senza ancora
  licenza commerciale collegata, senza provisioning schema, senza Admin di
  Spazio contestuale).
