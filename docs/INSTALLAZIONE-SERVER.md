# Installazione sul server dell'ente (edizione server on-premise)

Questa edizione è **la stessa piattaforma del cloud**: multi-spazio, Superadmin,
licenze, MFA. Invece di Vercel e di un database gestito gira su un server
dell'ente, con PostgreSQL locale, file salvati su disco e HTTPS.

Tutto è in `server/`:

| File | A cosa serve |
| --- | --- |
| `docker-compose.yml` | i quattro servizi: `db`, `app`, `caddy`, `backup` |
| `Dockerfile` | l'immagine della piattaforma |
| `Caddyfile` | HTTPS e inoltro verso la piattaforma |
| `.env.example` | modello della configurazione (da copiare in `.env`) |
| `backup.sh` | backup giornaliero del database |
| `ripristina.sh` | ripristino del database da un backup |

## 1. Requisiti

- Server Linux a 64 bit (consigliato: 2 CPU, 4 GB di RAM, 20 GB di disco più
  lo spazio per i backup). Funziona anche su Windows Server con Docker
  Desktop / WSL2, ma la guida usa i comandi Linux.
- **Docker Engine** 24 o successivo con il plugin **Docker Compose** v2
  (`docker compose version`).
- Porte **80** e **443** libere sul server e raggiungibili dai PC degli
  utenti (firewall).
- Per costruire l'immagine: accesso a internet verso `registry.npmjs.org` e
  Docker Hub (solo durante l'installazione e gli aggiornamenti).
- Per le funzioni AI (relazione, visure, screening, chatbot): accesso a
  `https://api.anthropic.com` e una chiave API. Senza, il resto della
  piattaforma funziona e le funzioni AI mostrano un messaggio chiaro.

## 2. Installazione

```bash
git clone <indirizzo del repository> ccii
cd ccii/server
cp .env.example .env
chmod 600 .env
nano .env          # compilare, vedi sotto
docker compose up -d --build
```

Nel file `.env` vanno impostati almeno:

- `POSTGRES_PASSWORD`: solo lettere e cifre, ad esempio generata con
  `openssl rand -hex 24`;
- `SUPERADMIN_USER` e `SUPERADMIN_PASSWORD`: credenziali del Superadmin, che
  non sta nel database (password lunga, almeno 16 caratteri);
- `CCII_INDIRIZZI`: il nome DNS e/o l'IP con cui gli utenti raggiungono il
  server, separati da virgola (es. `ccii.ente.local, 192.168.1.50`);
- `ANTHROPIC_API_KEY`: facoltativa.

La prima costruzione richiede alcuni minuti. Poi:

```bash
docker compose ps          # i quattro servizi devono risultare "Up" (app "healthy")
docker compose logs app    # deve comparire "edizione server: database pronto."
```

## 3. HTTPS e certificato

Due possibilità, scelte con `CCII_TLS` nel file `.env`.

**a) Certificato fornito dall'IT (consigliato).** Copiare in
`server/certificati/` il certificato (`cert.pem`, con la catena completa) e
la chiave (`key.pem`), poi impostare:

```
CCII_TLS=/certificati/cert.pem /certificati/key.pem
```

e riavviare con `docker compose up -d`. Il certificato deve valere per i
nomi indicati in `CCII_INDIRIZZI`.

**b) CA locale di Caddy (`CCII_TLS=internal`, predefinito).** Caddy crea da
solo una piccola autorità di certificazione e il certificato del server.
Perché i browser non mostrino avvisi, il certificato radice va installato
una volta sui PC degli utenti (o distribuito con le policy di dominio):

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./ccii-root.crt
```

Su Windows: doppio clic su `ccii-root.crt` → Installa certificato →
Computer locale → "Autorità di certificazione radice attendibili".

Gli utenti aprono `https://<nome o IP del server>`. Le richieste in HTTP sulla
porta 80 vengono reindirizzate in HTTPS. Se si cambiano le porte
(`CCII_PORTA_HTTP`/`CCII_PORTA_HTTPS`) l'indirizzo va aperto con la porta
(`https://server:8443`) e il reindirizzamento automatico da HTTP non la
conserva: in produzione usare 80 e 443.

## 4. Primo accesso

1. Aprire `https://<server>` ed entrare con `SUPERADMIN_USER` e
   `SUPERADMIN_PASSWORD`. Al primo accesso viene chiesto di impostare il
   **PIN** del Superadmin.
2. **Licenze commerciali** → Nuova licenza.
3. **Spazi di lavoro** → creare lo spazio collegato alla licenza e il suo
   Admin. Nome utente e password temporanea dell'Admin sono mostrati (e
   scaricabili) una sola volta: vanno comunicati per un canale sicuro.
4. L'Admin di spazio, al primo accesso, configura l'app di autenticazione
   (TOTP), il PIN e cambia la password.

## 5. Backup

**Pianificato (database).** Il servizio `backup` esegue ogni giorno, all'ora
`BACKUP_ORA` (predefinita 02:00), un `pg_dump` completo nella cartella
`CCII_CARTELLA_BACKUP` del server (predefinita `server/backup/`) e cancella i
file più vecchi di `BACKUP_GIORNI_CONSERVAZIONE` giorni (predefiniti 30).
Questa cartella va **copiata altrove** (NAS, nastro, backup aziendale): un
backup sullo stesso disco non protegge da un guasto del disco.

Backup immediato, ad esempio prima di un aggiornamento:

```bash
docker compose run --rm backup subito
```

I file `ccii-AAAAMMGG-HHMMSS.dump` contengono anche gli hash delle password,
i segreti MFA e le sessioni: vanno custoditi come credenziali.

**Dal pannello Superadmin.** "Parametri → Backup completo del database"
genera anche un file `.sql` (cifrabile con passphrase) che viene scaricato
e, in questa edizione, salvato pure nel volume `dati` del server
(`/dati/backup-interfaccia`). È lo stesso formato del cloud e si ripristina
dal pannello stesso.

**File caricati.** I PDF caricati (visure, documenti delle simulazioni) sono
nel volume `dati` (`/dati/file`) e vengono eliminati dopo l'elaborazione:
non serve includerli nel backup.

## 6. Ripristino

Da un backup del servizio `backup`:

```bash
cd server
./ripristina.sh backup/ccii-20260929-020000.dump
```

Lo script chiede conferma (scrivere `RIPRISTINA`), esegue prima un backup
dello stato attuale, ferma la piattaforma, sostituisce **tutto** il database
(tutti gli spazi) e la riavvia. Gli utenti dovranno rientrare.

Da un backup `.sql` del pannello: usare "Ripristino da backup" nello stesso
pannello Superadmin.

## 7. Aggiornamento

```bash
cd ccii/server
docker compose run --rm backup subito     # backup prima di aggiornare
git pull
docker compose up -d --build
```

Le tabelle si aggiornano da sole all'avvio e all'uso (senza migrazioni
manuali). La versione installata è indicata in fondo alla pagina di login.

## 8. Comandi utili

```bash
docker compose ps                    # stato dei servizi
docker compose logs -f app           # log della piattaforma
docker compose restart app           # riavvio della sola piattaforma
docker compose down                  # arresto (i dati restano nei volumi)
```

**Non** usare `docker compose down -v`: `-v` elimina i volumi, cioè il
database e i file.

## 9. Sicurezza

- Il database non è esposto sulla rete: è raggiungibile solo dai container.
- La piattaforma (porta 3000) non è esposta: si passa solo da Caddy in HTTPS.
- I cookie di sessione sono `Secure` e `httpOnly`: la piattaforma funziona
  solo in HTTPS.
- Il file `.env` contiene le credenziali del Superadmin e del database:
  permessi `600`, mai in un repository.
- Aggiornare periodicamente il sistema operativo e le immagini
  (`docker compose pull` per `postgres`, `caddy`; `--build` per la
  piattaforma).

## 10. Differenze rispetto al cloud

| | Cloud | Server on-premise |
| --- | --- | --- |
| Database | Postgres gestito, TLS | Postgres 16 nel container `db` (`DATABASE_SSL=0`) |
| File caricati | Vercel Blob, max 4MB | disco (`ARCHIVIO_FILE_DIR`), max 20MB |
| Backup | scaricato dal pannello | pianificato + dal pannello, salvato anche sul server |
| HTTPS | Vercel | Caddy (CA locale o certificato dell'IT) |
| Aggiornamenti | automatici a ogni rilascio | `git pull` + `docker compose up -d --build` |

Variabili specifiche (impostate già dal `Dockerfile`): `EDIZIONE_SERVER=1`,
`DATABASE_SSL=0`, `ARCHIVIO_FILE_DIR=/dati/file`,
`BACKUP_DIR=/dati/backup-interfaccia`. Vedi `src/lib/edizioneServer.ts`.
