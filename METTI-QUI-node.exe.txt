# Edizione portable — report di sviluppo (v0.102.0)

Sviluppo eseguito in autonomia. Decisioni iniziali concordate: **Windows**,
packaging **raw (Node + launcher)**, **cifratura inclusa**.

## Cosa è stato realizzato e verificato

Fondamenta funzionanti dell'edizione portable, validate end-to-end su Linux
(il bundle Windows va eseguito sulla macchina di destinazione). Stesso
codebase: tutto attivo con `PORTABLE=1`, il percorso cloud non è toccato.

- **DB embedded cifrato (PGlite).** Postgres in WASM in-process; il database
  è un unico file cifrato AES-256-GCM (passphrase → scrypt), in chiaro solo
  in RAM. Autosave cifrato periodico + alla chiusura, scrittura atomica.
- **Adapter compatibili.** `pool` (pg-compatibile) e Drizzle su PGlite: le
  ~230 query e il provisioning esistente girano invariati.
- **Storage locale** al posto di Vercel Blob (stesse firme `put/get/del`).
- **Primo avvio automatico**: crea 1 spazio + Admin con le funzioni di
  provisioning reali; SaaS (superadmin/licenze/multi-spazio) disattivata.
- **Pacchetto Windows** via `npm run build:portable` con launcher `.bat`.

### Evidenze di validazione (Linux)

- Boot dello standalone → init PGlite cifrato → provisioning reale →
  **25 tabelle tenant** create (scenari, checklist_*, azienda_test_pratico,
  proposta_creditori, …).
- `spazi`, `admin_spazio_index`, `licenze_spazio` (plus attivi) e
  `admin_workspace` popolati correttamente.
- HTTP: `/` → 200; `/superadmin` → 307 (auth attiva).
- Il file `ccii.db.enc` è cifrato (header casuale); decifrato e riletto con
  la passphrase → dati integri. Passphrase errata rifiutata (tag GCM).
- `type-check`, `lint`, **67 test**, build portable: tutti verdi.

## File principali aggiunti/modificati

- `src/lib/portableCrypto.ts` — cifratura AES-256-GCM del dump.
- `src/lib/portableDb.ts` — singleton PGlite, pool/Drizzle compatibili, persistenza cifrata.
- `src/lib/portableBootstrap.ts` — primo avvio: spazio + Admin unici.
- `src/lib/blobStore.ts` — storage file (cloud Blob | filesystem locale).
- `src/instrumentation.ts` — init del DB all'avvio del server.
- `src/lib/db.ts`, `src/db/client.ts` — scelgono cloud/portable dal flag.
- `next.config.mjs` — `output: standalone` + `serverExternalPackages: ['@electric-sql/pglite']` in portable.
- `portable/build-portable.mjs`, `portable/template/*` — build script, launcher, config, README.
- `package.json` — dipendenza `@electric-sql/pglite`, script `build:portable`.

## Come costruire e avviare (Windows)

1. Sul PC di build: `npm install` poi `npm run build:portable`
   → produce la cartella `portable-dist/`.
2. Metti `node.exe` (Windows x64, LTS) in `portable-dist\node\`
   (oppure usa un Node già installato: il launcher lo rileva).
3. (AI) crea `portable-dist\apikey.txt` con la sola chiave API Anthropic.
4. (Opzionale) modifica `portable-dist\config.bat` (tipo spazio, credenziali).
5. Copia `portable-dist\` sulla chiavetta. Doppio clic su `Avvia-CCII.bat`,
   inserisci la passphrase; il browser apre `http://127.0.0.1:4028`.
   Accesso iniziale: `admin@locale` / `admin1234` (da cambiare).

## Imprevisti risolti (non prevedibili all'inizio)

- **Instrumentation + bundling di PGlite**: PGlite, inglobato da webpack,
  rompeva la risoluzione dei propri asset WASM (errore all'avvio). Risolto
  tenendolo esterno al bundle (`serverExternalPackages`) e copiando il
  pacchetto completo (+ `drizzle-orm/pglite`) nello standalone.
- **Compatibilità tipi Blob/Buffer** in fase di type-check: risolta.

## Cosa resta (per la "definitiva")

- **Collaudo su Windows** reale + aggiunta di `node.exe` (non producibile da
  qui, ambiente Linux).
- **Prova live delle funzioni AI** con una chiave API valida (qui non
  usata per riservatezza).
- **Hardening**: inserimento passphrase da UI (oltre che da launcher),
  gestione cambio passphrase, eventuale indicatore di salvataggio.
- **Cross-OS** (Mac/Linux) se servirà, riusando lo stesso build script.
