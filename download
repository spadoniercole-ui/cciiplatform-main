@echo off
REM ============================================================
REM  Configurazione dell'edizione portable.
REM  Al PRIMO avvio (database vuoto) questi valori creano DUE spazi
REM  di lavoro fissi con i rispettivi Admin:
REM    - REDIGENTE (NON_ENTE): lo studio che PREDISPONE la proposta
REM    - RICEVENTE (ENTE):     l'ente creditore che VALUTA la proposta
REM  Sono due login separati (email diverse): si entra con l'uno o
REM  con l'altro, si esce e si rientra per cambiare lato.
REM  Dopo il primo avvio questi valori vengono ignorati (i dati sono
REM  gia' nel database).
REM ============================================================

REM ---- Spazio REDIGENTE (chi propone) ----
set "PORTABLE_RED_SPACE_CODICE=REDIGENTE-LOCALE-2026-001"
set "PORTABLE_RED_SPACE_DESCRIZIONE=Redigente (studio che propone)"
set "PORTABLE_RED_ADMIN_NOME=Admin"
set "PORTABLE_RED_ADMIN_COGNOME=Redigente"
set "PORTABLE_RED_ADMIN_EMAIL=redigente@locale"
set "PORTABLE_RED_ADMIN_CELLULARE="
set "PORTABLE_RED_ADMIN_PASSWORD=redigente1234"

REM ---- Spazio RICEVENTE (chi valuta) ----
set "PORTABLE_ENTE_SPACE_CODICE=RICEVENTE-LOCALE-2026-001"
set "PORTABLE_ENTE_SPACE_DESCRIZIONE=Ricevente (ente che valuta)"
set "PORTABLE_ENTE_ADMIN_NOME=Admin"
set "PORTABLE_ENTE_ADMIN_COGNOME=Ricevente"
set "PORTABLE_ENTE_ADMIN_EMAIL=ricevente@locale"
set "PORTABLE_ENTE_ADMIN_CELLULARE="
set "PORTABLE_ENTE_ADMIN_PASSWORD=ricevente1234"

REM NOTA: le due email DEVONO essere diverse (sono i due login separati).

REM ---- Demo pre-caricata (stessa azienda sui due lati) ----
REM Al primo avvio semina un caso completo gia' navigabile: azienda +
REM proposta sul Redigente, e sul Ricevente tutta la parte ente
REM (anagrafica, posizione debitoria, limiti, proposta ricevuta).
REM Metti a 0 per partire con spazi VUOTI.
set "PORTABLE_SEED_DEMO=1"
