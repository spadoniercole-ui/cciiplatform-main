@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ============================================================
REM  CCIIPlatform - Edizione portable (Windows)
REM  Avvia il server locale e apre il browser. Nessuna installazione.
REM ============================================================

set "PORTABLE=1"
set "NODE_ENV=production"
REM Fuso orario del server: UTC (le date si mostrano nel fuso del browser)
set "TZ=UTC"
set "PORT=4028"
set "HOSTNAME=127.0.0.1"
set "PORTABLE_DATA_DIR=%~dp0dati"

REM --- Verifica, PRIMA della passphrase, che il pacchetto sia completo ---
REM Senza server.js individua la causa piu' probabile e la spiega. Solo "if" su
REM una riga (niente blocchi tra parentesi ne' etichette): il percorso della
REM cartella puo' contenere parentesi, es. "(x86)".
set "CARTELLA=%~dp0"
set "CAUSA="
set "ANNIDATO="
REM Dentro la cartella temporanea = aperto da uno ZIP senza estrarlo.
setlocal EnableDelayedExpansion
set "IN_TEMP=0"
if defined TEMP if /i not "!CARTELLA:%TEMP%=!"=="!CARTELLA!" set "IN_TEMP=1"
endlocal & set "IN_TEMP=%IN_TEMP%"
if not exist "server.js" if "%IN_TEMP%"=="1" set "CAUSA=ZIP"
if not exist "server.js" if not defined CAUSA if exist "..\build-portable.mjs" set "CAUSA=SORGENTI"
if not exist "server.js" if not defined CAUSA for /d %%d in (*) do if exist "%%d\server.js" set "ANNIDATO=%%d"
if not exist "server.js" if not defined CAUSA if defined ANNIDATO set "CAUSA=ANNIDATO"
if not exist "server.js" if not defined CAUSA set "CAUSA=INCOMPLETO"
if defined CAUSA echo.
if defined CAUSA echo  ERRORE: server.js non trovato nella cartella
if defined CAUSA echo    "%CARTELLA%"
if defined CAUSA echo.
if "%CAUSA%"=="ZIP" echo  Stai avviando il launcher dall'interno di un file ZIP: Windows ha estratto
if "%CAUSA%"=="ZIP" echo  solo questo file in una cartella temporanea. Estrai prima TUTTO l'archivio
if "%CAUSA%"=="ZIP" echo  - tasto destro sul file ZIP, "Estrai tutto" - e avvia Avvia-CCII.bat
if "%CAUSA%"=="ZIP" echo  dalla cartella estratta.
if "%CAUSA%"=="SORGENTI" echo  Questa e' la cartella dei sorgenti, portable\template. Esegui
if "%CAUSA%"=="SORGENTI" echo  "npm run build:portable" e avvia Avvia-CCII.bat dalla cartella portable-dist.
if "%CAUSA%"=="ANNIDATO" echo  server.js si trova nella sottocartella "%ANNIDATO%": il pacchetto e' stato
if "%CAUSA%"=="ANNIDATO" echo  costruito con una versione precedente a Portable 1.1.1. Aggiorna i sorgenti,
if "%CAUSA%"=="ANNIDATO" echo  esegui di nuovo "npm run build:portable" e sostituisci i file del programma,
if "%CAUSA%"=="ANNIDATO" echo  lasciando la cartella "dati".
if "%CAUSA%"=="INCOMPLETO" echo  Il pacchetto e' incompleto: la copia si e' interrotta, oppure l'antivirus ha
if "%CAUSA%"=="INCOMPLETO" echo  messo in quarantena server.js. Ricopia l'intera cartella portable-dist, o
if "%CAUSA%"=="INCOMPLETO" echo  ricostruiscila con "npm run build:portable", e riprova.
if defined CAUSA echo.
if defined CAUSA pause
if defined CAUSA exit /b 1

REM --- Configurazione dello spazio/admin (modificabile in config.bat) ---
if exist "config.bat" call "config.bat"

REM --- Modalita' rete locale (config.bat: PORTABLE_LAN=1) ---
REM Next resta su 127.0.0.1 (non raggiungibile dalla rete); lan-https.mjs
REM espone la piattaforma agli altri PC in HTTPS e inoltra le richieste.
if not defined PORTABLE_LAN set "PORTABLE_LAN=0"
if not defined PORTABLE_LAN_PORTA set "PORTABLE_LAN_PORTA=4443"
set "URL_APERTURA=http://%HOSTNAME%:%PORT%"
if "%PORTABLE_LAN%"=="1" (
  set "PORTABLE_HTTPS=1"
  set "URL_APERTURA=https://localhost:%PORTABLE_LAN_PORTA%"
)

REM --- Chiave API Anthropic: da file apikey.txt (una riga) se presente ---
if exist "apikey.txt" set /p "ANTHROPIC_API_KEY="<apikey.txt

REM --- Passphrase di cifratura (digitata in NASCOSTO, chiesta ad ogni avvio) ---
set "PORTABLE_PASSPHRASE="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=Read-Host -AsSecureString 'Inserisci la passphrase del database'; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Runtime.InteropServices.Marshal]::PtrToStringAuto($b)"`) do set "PORTABLE_PASSPHRASE=%%p"
if not defined PORTABLE_PASSPHRASE (
  echo.
  echo  ERRORE: passphrase vuota. Avvio annullato.
  pause
  exit /b 1
)

REM --- Individua Node: prima quello imbarcato, poi quello di sistema ---
set "NODEEXE="
if exist "node\node.exe" set "NODEEXE=node\node.exe"
if not defined NODEEXE ( where node >nul 2>nul && set "NODEEXE=node" )
if not defined NODEEXE (
  echo.
  echo  Node non trovato. Metti node.exe in .\node\ oppure installa Node.js, poi riavvia.
  pause
  exit /b 1
)

if "%PORTABLE_LAN%"=="1" (
  if not exist "lan-https.mjs" (
    echo.
    echo  ERRORE: lan-https.mjs non trovato: il pacchetto non supporta la rete locale.
    pause
    exit /b 1
  )
  REM Regola del firewall per la porta HTTPS (reti private e di dominio).
  REM Serve eseguire questo file come amministratore la PRIMA volta.
  netsh advfirewall firewall show rule name="CCIIPlatform rete locale" >nul 2>nul
  if errorlevel 1 (
    netsh advfirewall firewall add rule name="CCIIPlatform rete locale" dir=in action=allow protocol=TCP localport=%PORTABLE_LAN_PORTA% profile=private,domain >nul 2>nul
    if errorlevel 1 (
      echo.
      echo  ATTENZIONE: non ho potuto aprire la porta %PORTABLE_LAN_PORTA% nel firewall di Windows.
      echo  Riavvia QUESTO file con "Esegui come amministratore" una volta,
      echo  oppure chiedi all'IT di consentire la porta TCP %PORTABLE_LAN_PORTA% in ingresso.
    )
  )
  start "" /b "%NODEEXE%" lan-https.mjs
)

echo.
echo  Avvio del server su %URL_APERTURA%  (apro il browser appena e' pronto)
echo  Lascia aperta questa finestra durante l'uso; chiudila per spegnere.
echo.

REM --- Apri il browser SOLO quando la porta risponde (attende in background) ---
REM Compatibile con Windows PowerShell 5.1: try/catch come istruzioni dentro
REM un while, non dentro un'espressione (until).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=%PORT%; while($true){ try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('%HOSTNAME%',$p); $c.Close(); break } catch { Start-Sleep -Milliseconds 400 } }; Start-Process '%URL_APERTURA%'"

REM --- Avvia il server in primo piano (i log restano visibili qui) ---
"%NODEEXE%" server.js

echo.
echo  Server terminato. I dati sono stati salvati (cifrati).
pause
