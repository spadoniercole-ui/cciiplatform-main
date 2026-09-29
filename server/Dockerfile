# server/Dockerfile
#
# Immagine dell'edizione SERVER on-premise di CCIIPlatform (stessa piattaforma
# del cloud: multi-spazio, superadmin, licenze). Da costruire con
# docker compose (vedi server/docker-compose.yml e docs/INSTALLAZIONE-SERVER.md);
# il contesto di build è la radice del repository.

# --- dipendenze ---------------------------------------------------------------
FROM node:22-alpine AS dipendenze
WORKDIR /app
COPY package.json package-lock.json ./
# SheetJS (xlsx) 0.20.x non è su npm: il pacchetto è nel repository.
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund

# --- build --------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dipendenze /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_COPYRIGHT=""
ENV NEXT_PUBLIC_COPYRIGHT=$NEXT_PUBLIC_COPYRIGHT \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- esecuzione ---------------------------------------------------------------
FROM node:22-alpine AS esecuzione
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    EDIZIONE_SERVER=1 \
    DATABASE_SSL=0 \
    ARCHIVIO_FILE_DIR=/dati/file \
    BACKUP_DIR=/dati/backup-interfaccia \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /dati/file /dati/backup-interfaccia && chown -R node:node /dati

USER node
VOLUME ["/dati"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
