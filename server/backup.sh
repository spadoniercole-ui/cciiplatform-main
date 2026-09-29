#!/bin/sh
# server/backup.sh
#
# Backup pianificato del database (servizio "backup" di docker-compose.yml).
# Ogni giorno all'ora BACKUP_ORA (HH:MM, ora del server) esegue pg_dump in
# formato custom in /backup ed elimina i file più vecchi di
# BACKUP_GIORNI_CONSERVAZIONE giorni. Con l'argomento "subito" esegue un solo
# backup ed esce (docker compose run --rm backup subito).
set -eu

ORA="${BACKUP_ORA:-02:00}"
GIORNI="${BACKUP_GIORNI_CONSERVAZIONE:-30}"
CARTELLA=/backup

esegui_backup() {
  mkdir -p "$CARTELLA"
  nome="ccii-$(date +%Y%m%d-%H%M%S).dump"
  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') inizio: $nome"
  # Scrittura su file temporaneo e rinomina: un backup interrotto a metà non
  # deve sembrare buono.
  if pg_dump -Fc -f "$CARTELLA/$nome.tmp"; then
    mv "$CARTELLA/$nome.tmp" "$CARTELLA/$nome"
    echo "[backup] completato: $nome ($(du -h "$CARTELLA/$nome" | cut -f1))"
  else
    rm -f "$CARTELLA/$nome.tmp"
    echo "[backup] ERRORE: pg_dump non riuscito" >&2
    return 1
  fi
  find "$CARTELLA" -maxdepth 1 -name 'ccii-*.dump' -type f -mtime "+$GIORNI" -print -delete |
    sed 's/^/[backup] eliminato (oltre la conservazione): /'
}

if [ "${1:-}" = "subito" ]; then
  esegui_backup
  exit $?
fi

echo "[backup] pianificato ogni giorno alle $ORA, conservazione $GIORNI giorni, in $CARTELLA"
ultimo=""
while true; do
  oggi="$(date +%Y-%m-%d)"
  if [ "$(date +%H:%M)" = "$ORA" ] && [ "$ultimo" != "$oggi" ]; then
    esegui_backup || true
    ultimo="$oggi"
  fi
  sleep 30
done
