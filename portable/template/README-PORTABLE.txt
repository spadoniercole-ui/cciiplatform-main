CCIIPlatform — Edizione portable (Windows)
==========================================

Che cos'è
---------
Una versione della piattaforma che gira da chiavetta USB SENZA installazione.
Il database è incorporato (PGlite, Postgres in WASM) e vive CIFRATO in un
unico file sotto la cartella "dati". Le funzioni di intelligenza artificiale
(analisi, relazioni, documenti, confronto liquidatorio) e i dati di settore
ISTAT restano online: per usarle serve una connessione a internet e una
chiave API Anthropic. Tutto il resto funziona in locale.

Preparazione (una volta sola)
-----------------------------
1) Node per Windows:
   - Metti "node.exe" (Windows x64) nella cartella  .\node\
     (scaricabile da nodejs.org, versione LTS). In alternativa, se Node è
     già installato sul PC, il launcher lo userà automaticamente.
2) Chiave API Anthropic (per le funzioni AI):
   - Crea un file  apikey.txt  in questa cartella, con dentro SOLO la chiave.
   - Senza chiave, l'app funziona ma le funzioni AI mostreranno un errore.
3) Configurazione iniziale (facoltativa):
   - Apri  config.bat  con un editor di testo. Al primo avvio vengono creati
     DUE spazi di lavoro sulla stessa istanza, con due login separati:
       * REDIGENTE (chi PREDISPONE la proposta) — nome utente admin.redigente
       * RICEVENTE (l'ente che VALUTA la proposta) — nome utente admin.ricevente
     È lo stesso caso visto dai due lati. Puoi cambiare nomi, email e
     password. Il NOME UTENTE per accedere è  nome.cognome  dell'Admin, in
     minuscolo (es. Mario Rossi -> mario.rossi): NON è l'email. Questi valori
     valgono SOLO al primo avvio: dopo, modificarli non cambia nulla.

Demo pre-caricata
-----------------
Al primo avvio (database vuoto) viene seminato un caso completo, la STESSA
azienda vista dai due lati: sul Redigente l'azienda con la proposta ai
creditori; sul Ricevente la stessa azienda con tutta la parte ente
(anagrafica ente, posizione debitoria, limiti di ricevibilità e la proposta
ricevuta). Serve solo a mostrare il flusso: puoi modificarla o cancellarla.
Per partire con spazi VUOTI, imposta  PORTABLE_SEED_DEMO=0  in config.bat.

Avvio
-----
- Doppio clic su  Avvia-CCII.bat
- Inserisci la passphrase del database quando richiesto.
  ATTENZIONE: la passphrase cifra i dati. Se la dimentichi, i dati non sono
  recuperabili. Usa la stessa passphrase ad ogni avvio.
- Il browser si apre su  http://127.0.0.1:4028
- Accedi con il NOME UTENTE (non l'email) e la password. Di default:
    * Redigente:  admin.redigente / redigente1234
    * Ricevente:  admin.ricevente / ricevente1234
  Gli username effettivi sono scritti nella finestra nera ad ogni avvio
  (riga "[portable] Accesso con il NOME UTENTE ...").
- Al primo accesso di ogni Admin viene chiesta la VERIFICA IN DUE
  PASSAGGI: installa sul telefono un'app come Google Authenticator o
  Microsoft Authenticator, inquadra il QR (o inserisci a mano la chiave
  mostrata) e scrivi il codice a 6 cifre. Funziona anche senza internet,
  purché l'ora del PC e del telefono siano corrette. Dagli accessi
  successivi: nome utente, password e codice dell'app.
- Per non usare le password predefinite, impostale in config.bat PRIMA
  del primo avvio.
- Per passare da un lato all'altro: esci e rientra con l'altro nome utente.
- Per spegnere: chiudi la finestra nera del server. I dati vengono salvati
  (cifrati) automaticamente durante l'uso e alla chiusura.

Uso in rete locale (più PC dello stesso ufficio)
-----------------------------------------------
Un PC fa da "server" e gli altri usano la piattaforma dal browser, senza
installare nulla.
1) Sul PC server apri  config.bat  e imposta  PORTABLE_LAN=1
   (porta predefinita 4443, modificabile con PORTABLE_LAN_PORTA).
2) La PRIMA volta avvia  Avvia-CCII.bat  con clic destro →
   "Esegui come amministratore": serve ad aprire la porta nel firewall di
   Windows (solo reti private e di dominio). Dalle volte successive basta il
   doppio clic. Se non puoi, chiedi all'IT di consentire in ingresso la
   porta TCP 4443.
3) All'avvio la finestra mostra gli indirizzi da aprire dagli altri PC, ad
   esempio  https://pc-studio:4443  oppure  https://192.168.1.20:4443
4) Al primo accesso da ogni PC il browser avvisa che il certificato non è
   riconosciuto (è "autofirmato", creato al primo avvio in dati\tls): è
   atteso; scegli "Avanzate" → "Procedi". Per evitare l'avviso l'IT può
   installare il certificato (dati\tls\cert.pem) sui PC, oppure mettere in
   dati\tls un proprio cert.pem + key.pem firmati dalla CA interna.
- Il traffico è cifrato (HTTPS); il server interno resta su 127.0.0.1 e non
  è raggiungibile direttamente dalla rete.
- Il PC server deve restare acceso con la finestra aperta finché gli altri
  lavorano; se lo spegni, gli altri vedono "Il server non risponde ancora".
- Anche sul PC server si usa l'indirizzo https (si apre da solo).
- Ogni persona deve avere il PROPRIO utente (Admin → Aziende → Operatori):
  non condividete lo stesso login fra più PC.
- Senza internet le funzioni AI e i dati ISTAT mostrano un messaggio chiaro;
  tutto il resto funziona in rete locale.

Sicurezza dei dati
------------------
- Il file del database (dati\ccii.db.enc) è cifrato con AES-256-GCM, chiave
  derivata dalla passphrase. In chiaro esiste solo nella memoria del PC
  durante l'uso.
- I documenti caricati (visure, PDF) restano in dati\blobs solo per il tempo
  dell'elaborazione e vengono poi eliminati, come nella versione cloud.
- Custodisci la chiavetta: chi ha la chiavetta E la passphrase ha i dati.

Backup
------
- Per il backup è sufficiente copiare la cartella "dati" (è cifrata).

Limiti noti di questa edizione portable
---------------------------------------
- Due spazi fissi (Redigente + Ricevente), un Admin per ciascuno. La parte
  SaaS del cloud (superadmin, gestione multi-spazio, licenze commerciali)
  è disattivata: gli spazi non si aggiungono né si rimuovono dall'interno.
- Le funzioni AI e i dati di settore richiedono internet (senza, messaggio
  esplicito; il resto funziona).
- In rete locale: pensata per un ufficio con pochi utenti contemporanei; un
  solo PC server, nessun bilanciamento o replica.
- Testata su Linux in fase di sviluppo; il collaudo su Windows va completato
  sulla macchina di destinazione.
