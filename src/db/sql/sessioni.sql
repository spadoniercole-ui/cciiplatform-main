-- src/db/sql/sessioni.sql
--
-- Da eseguire UNA VOLTA sul database (public schema) prima di usare il nuovo
-- sistema di login reale. Sostituisce il vecchio meccanismo a token costante
-- ('TOKEN_GHOST_SUPERADMIN_SYSTEM') con sessioni vere, casuali e verificabili.
--
-- Esecuzione consigliata:
--   psql "$DATABASE_URL" -f src/db/sql/sessioni.sql

CREATE TABLE IF NOT EXISTS public.sessioni (
  id SERIAL PRIMARY KEY,
  token VARCHAR(128) NOT NULL UNIQUE,
  ruolo VARCHAR(50) NOT NULL,
  workspace_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessioni_token ON public.sessioni (token);
