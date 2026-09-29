#!/bin/sh
# server/ripristina.sh — ripristina il database da un backup di backup.sh.
#
#   ./ripristina.sh backup/ccii-20260929-020000.dump
#
# ATTENZIONE: sostituisce TUTTI i dati attuali (tutti gli spazi) con quelli
# del backup. Prima del ripristino esegue comunque un backup dello stato
# attuale, per poter tornare indietro.
set -eu
cd "$(dirname "$0")"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 <file .dump>" >&2
  exit 1
fi

printf "Il database attuale verrà SOSTITUITO con %s. Scrivi RIPRISTINA per continuare: " "$FILE"
read -r conferma
[ "$conferma" = "RIPRISTINA" ] || { echo "Annullato."; exit 1; }

echo "== Backup di sicurezza dello stato attuale"
docker compose run --rm backup subito

echo "== Arresto della piattaforma"
docker compose stop app

echo "== Ripristino"
docker compose exec -T db sh -c \
  'dropdb -U ccii --if-exists --force ccii && createdb -U ccii ccii && pg_restore -U ccii -d ccii --no-owner' \
  < "$FILE"

echo "== Riavvio della piattaforma"
docker compose start app
echo "Ripristino completato."
