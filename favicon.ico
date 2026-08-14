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
       * REDIGENTE (chi PREDISPONE la proposta) — default redigente@locale
       * RICEVENTE (l'ente che VALUTA la proposta) — default ricevente@locale
     È lo stesso caso visto dai due lati. Puoi cambiare nomi, email e
     password (le due email DEVONO restare diverse). Questi valori valgono
     SOLO al primo avvio.

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
- Accedi con uno dei due login impostati in config.bat. Di default:
    * Redigente:  redigente@locale / redigente1234
    * Ricevente:  ricevente@locale / ricevente1234
  (cambia le password al primo accesso). Per passare da un lato all'altro:
  esci e rientra con l'altra email.
- Per spegnere: chiudi la finestra nera del server. I dati vengono salvati
  (cifrati) automaticamente durante l'uso e alla chiusura.

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
- Le funzioni AI e i dati di settore richiedono internet.
- Testata su Linux in fase di sviluppo; il collaudo su Windows va completato
  sulla macchina di destinazione.
