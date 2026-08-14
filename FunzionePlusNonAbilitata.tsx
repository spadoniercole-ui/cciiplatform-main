#!/usr/bin/env bash
# Due controlli che `next build` non cattura sempre in modo affidabile:
#
# 1. File 'use server' che esportano qualcosa di diverso da una funzione
#    async (Next.js lo accetta solo a runtime in produzione) — già
#    capitato 4 volte in questo progetto.
#
# 2. Server Component (nessuna direttiva 'use client' in cima al file)
#    che passa un handler di evento (onClick/onChange/onSubmit ecc.) a un
#    Client Component — non permesso: una funzione non è serializzabile
#    attraverso il confine server/client. Per le rotte dinamiche (quelle
#    con parametri, es. [scenarioId]) `next build` compila ma non
#    RENDERIZZA mai la pagina (nessuna richiesta reale durante la build),
#    quindi questo errore resta invisibile finché non arriva la prima
#    richiesta vera in produzione.
#
# Da eseguire prima di ogni consegna.
set -euo pipefail
cd "$(dirname "$0")/.."

TROVATI=0

for f in $(grep -rl "^'use server';" src/app/actions src/app 2>/dev/null || true); do
  MATCH=$(grep -n "^export const\|^export class\|^export let\|^export var\|^export function" "$f" || true)
  if [ -n "$MATCH" ]; then
    echo "ERRORE: $f esporta un valore non-funzione (o una funzione non-async) da un file 'use server':"
    echo "$MATCH"
    TROVATI=1
  fi
done

for f in $(find src/app -name "layout.tsx" -o -name "page.tsx"); do
  if ! grep -q "^'use client'" "$f" 2>/dev/null; then
    MATCH=$(grep -n "onClick=\|onChange=\|onSubmit=\|onBlur=\|onFocus=" "$f" || true)
    if [ -n "$MATCH" ]; then
      echo "ERRORE: $f è un Server Component (nessun 'use client') ma passa un handler di evento:"
      echo "$MATCH"
      TROVATI=1
    fi
  fi
done

if [ "$TROVATI" -eq 1 ]; then
  echo ""
  echo "Correggi prima di continuare: sposta le costanti in un file separato senza 'use server'; per gli handler di evento, aggiungi 'use client' al componente o rendi l'elemento non interattivo senza passare una funzione da un Server Component."
  exit 1
fi

echo "OK: nessun file 'use server' esporta valori non-funzione, nessun Server Component passa handler di evento."

