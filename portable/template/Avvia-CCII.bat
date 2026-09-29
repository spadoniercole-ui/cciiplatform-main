@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ============================================================
REM  CCIIPlatform - Edizione portable (Windows)
REM  Avvia il server locale e apre il browser. Nessuna installazione.
REM ============================================================

set "PORTABLE=1"
set "NODE_ENV=production"
set "PORT=4028"
set "HOSTNAME=127.0.0.1"
set "PORTABLE_DATA_DIR=%~dp0dati"

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

REM --- Verifica che il pacchetto sia quello costruito (deve esserci server.js) ---
if not exist "server.js" (
  echo.
  echo  ERRORE: server.js non trovato in questa cartella.
  echo  Stai lanciando dalla cartella giusta? Deve essere la cartella "portable-dist"
  echo  prodotta da "npm run build:portable", non i sorgenti.
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
