#!/bin/bash
# Hook SessionStart per Claude Code on the web: installa le dipendenze npm
# così che type-check, lint e test siano eseguibili in ogni sessione cloud.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (non npm ci) per sfruttare la cache del container tra le sessioni.
npm install --no-audit --no-fund
