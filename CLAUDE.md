# CLAUDE.md

Guida per Claude Code (e per chiunque lavori sul codice) su **CCIIplatform**.

## Il prodotto

Piattaforma SaaS multi-tenant per il **Codice della Crisi d'Impresa e dell'Insolvenza**
(D.Lgs. 14/2019, come modificato dal D.Lgs. 136/2024). Funzioni principali: bilanci XBRL e
indici di allerta, Check List, proposte ai creditori e verifica di ricevibilità (soglie
art. 25-novies), confronto con la liquidazione (artt. 63/88), relazione generata con AI,
estrazione visure, screening aziende, debiti verso l'ente, simulazioni, backup/restore.

- **Superadmin**: non sta nel DB, credenziali da `SUPERADMIN_USER` / `SUPERADMIN_PASSWORD`
  (`src/app/actions/auth.ts`). Gestisce spazi, licenze, parametri, indici.
- **Spazio** (tenant, `/spazio/[codice]`): `tipo_spazio` = `ENTE` (ente creditore) oppure
  `RED` (professionista che redige la proposta; percorso `REDIGENTE` vs `RICEVENTE`, vedi
  `src/lib/proposta/inquadramento.ts`). Alcune funzioni sono solo ENTE (es. Screening).
- **Utenti di spazio**: Admin di spazio (`src/lib/ruoliAdminSpazio.ts`) e utenti con permessi
  per modulo `NESSUNO | LETTURA | SCRITTURA` (`src/lib/moduliPermesso.ts`).

## Comandi

```bash
npm run dev          # http://localhost:4028
npm run type-check   # check 'use server' + tsc --noEmit
npm run lint         # next lint (0 errori richiesti; i warning sono tollerati)
npm test             # vitest run (tutti i test)
npx vitest run src/lib/xbrl/indici.test.ts   # un singolo file
npm run build        # build cloud (non richiede segreti)
npm run build:portable
```

**Prima di ogni consegna**: `type-check`, `lint`, `test`, `build` devono passare (li esegue
anche la CI in `.github/workflows/ci.yml`).

## Architettura

- `src/app/` — App Router. `page.tsx` = login; `superadmin/…`; `spazio/[codice]/…`.
- `src/app/actions/*.ts` — server action: qui vive la maggior parte della logica.
- `src/app/api/` — poche route (blob-upload, xbrl, indici, configurazioni).
- `src/lib/<dominio>/` — logica di dominio pura e testabile (xbrl, checklist, proposta,
  screening, visura, debitiEnte, soglie25novies, simulazione, normativa, backup, mfa, …).
- **Database**: Postgres. Quasi tutto il codice usa SQL diretto tramite il `pg` Pool di
  `src/lib/db.ts`; Drizzle (`src/db/schema.ts`, `src/db/client.ts`) è marginale.
  - Multi-tenant: **uno schema Postgres per spazio**, `tenant_<codice>`
    (`src/db/provision.ts`).
  - Le tabelle si creano/aggiornano **a runtime** (`src/db/ensureTables.ts`,
    `src/db/sql/*.sql`, funzioni `assicuraTabella*`), non con migrazioni drizzle. Ogni
    modifica di schema deve essere idempotente e compatibile con i tenant esistenti.
- **Autenticazione**: niente `middleware.ts`. Sessione = token opaco nella tabella `sessioni`,
  cookie httpOnly `session_token` (8 ore), password bcryptjs, MFA (`src/lib/mfa`), limite
  tentativi (`src/lib/tentativiAccesso.ts`).
- **Autorizzazione — regola obbligatoria**: ogni `export async function` di un file
  `'use server'` è un endpoint pubblico. La prima istruzione deve verificare il chiamante con
  `src/lib/autorizzazione.ts`:
  - `richiediAccessoSchema(nomeSchema, { soloAdmin?, modulo?, livello? })` per le azioni di
    spazio (rifiuta schemi diversi da quello della sessione; il Superadmin passa sempre);
  - `richiediAccessoSpazio(codice)` / `richiediAccessoSpazioId(id)` se il parametro è quello;
  - `richiediSuperadmin()` per licenze, spazi, backup/ripristino, parametri di sistema;
  - route API: `rifiutaSeNonAutorizzato('SESSIONE' | 'SUPERADMIN')`.
  Operatori (`modalita === 'OPERATORE'`), oltre allo spazio:
  - azioni con `aziendaId` / `scenarioId` → `richiediAccessoAzienda` / `richiediAccessoScenario`
    (solo aziende assegnate); con il solo id di una riga → `verificaRigaConsentita`;
  - scritture → `{ modulo: [...], livello: 'SCRITTURA' }` col modulo della pagina che le usa
    (`scenari` per i passi generici; `report` = Proposta); le scritture automatiche alla sola
    visita di una pagina (cache, "…SeNecessario") contano come letture;
  - funzioni usate solo da pagine Admin (`parametri`, `utenti`, `aziende/**`,
    `verifica-salute`) → `soloAdmin: true`, anche le letture;
  - elenchi di più aziende → filtrati a `contesto.aziendeConsentite`;
  - URL di file passati dal browser → `verificaFileDelloSpazio` prima di `get`/`del`.
  Mai fidarsi di `nomeSchema`, id utente o ruolo passati dal browser. Le funzioni interne
  (helper, avvio MFA) vanno in `src/lib`, non esportate da file `'use server'`.
  `scripts/check-autorizzazione.mjs` (dentro `npm run type-check`) fa fallire la CI se
  un'azione non ha la guardia.
- **AI**: solo `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY`), usato nelle server action
  (proposta, screening, visura, confronto liquidatorio, chatbot…) e in
  `src/app/api/xbrl/report-ai`.
- **File**: Vercel Blob tramite `src/lib/blobStore.ts` (filesystem locale in portable).

### Variabili d'ambiente

`DATABASE_URL`, `ANTHROPIC_API_KEY`, `SUPERADMIN_USER`, `SUPERADMIN_PASSWORD`,
`BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_COPYRIGHT`. Portable: `PORTABLE`, `NEXT_PUBLIC_PORTABLE`,
`PORTABLE_*` (vedi `src/lib/portableDb.ts`, `src/lib/portableBootstrap.ts`).

## Edizione portable

`npm run build:portable` → `portable-dist/` per chiavetta USB Windows (launcher `.bat` in
`portable/template/`). DB PGlite cifrato AES-256-GCM (`src/lib/portableDb.ts`,
`portableCrypto.ts`), inizializzato da `src/instrumentation.ts`. Niente superadmin, licenze,
multi-spazio. Una modifica al codice condiviso deve funzionare **sia in cloud sia in
portable**. Dettagli: `portable/REPORT-PORTABLE.md`.

## Convenzioni

- **Lingua**: UI, commenti, messaggi di commit e CHANGELOG in **italiano**.
- **File `'use server'`**: esportano solo funzioni `async`. Costanti, tipi-valore e helper
  sincroni vanno in moduli separati (es. `ruoliAdminSpazio.ts`, `moduliPermesso.ts`).
  Controllato da `scripts/check-use-server-exports.sh`.
- **Server Component** (`page.tsx`/`layout.tsx` senza `'use client'`): non passare handler
  (`onClick`, `onChange`…) ai Client Component. Anche questo è controllato dallo script: nelle
  rotte dinamiche l'errore apparirebbe solo in produzione.
- **Test**: Vitest, file `*.test.ts` accanto al sorgente, ambiente node, alias `@` → `src`.
  La logica di dominio nuova va in `src/lib/…` con i suoi test.
- **Stile**: Prettier (singoli apici, punto e virgola, 100 colonne, trailing comma es5).
- **Versioni** — ad ogni consegna di prodotto aggiorna **insieme**:
  1. `version` in `package.json`
  2. `APP_VERSION` in `src/lib/appVersion.ts`
  3. nuova voce `## X.Y.Z — AAAA-MM-GG` in `CHANGELOG.md` (sopra le precedenti 0.109.x)

  La portable ha un contatore separato (`PORTABLE_VERSION`). Le modifiche solo di
  tooling/CI non richiedono un bump.

## Normativa: attenzione

- Formule e soglie degli indici di allerta: unica fonte `src/lib/xbrl/indici.ts`.
  `docs/CHECKLIST_VALIDAZIONE_NORMATIVA.md` elenca ciò che un commercialista deve validare:
  non cambiare formule o soglie senza aggiornare la checklist e i test.
- Riferimenti normativi (articoli, soglie, importi) non vanno inventati: se un dato non è
  nel codice o nei documenti, chiedere.

## Insidie note

- `reset_database.sql` è **distruttivo** (elimina tutti gli schemi `tenant_*` e le tabelle
  globali). Non eseguirlo mai.
- La chiave di permesso `'report'` indica il modulo **Proposta**: non rinominarla, si
  romperebbero i permessi salvati.
- `xlsx` 0.18.5 (npm) ha vulnerabilità note senza correzione: va sostituito con la build
  SheetJS 0.20.x da cdn.sheetjs.com (stessa API), non con un'altra versione da npm.
- `README.md` è boilerplate generico: questo file è la documentazione di riferimento.
