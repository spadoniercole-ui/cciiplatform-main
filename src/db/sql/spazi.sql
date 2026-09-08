-- src/db/sql/spazi.sql
--
-- Spazi di lavoro, con licenza operativa dedicata collegata a una licenza
-- commerciale (tabella `licenze`, gestita da ModuloLicenza.tsx — una
-- licenza commerciale può governare 1 o più spazi). Alla creazione dello
-- spazio viene creato anche l'Admin di Spazio, nello schema isolato
-- provisionato per quello spazio (non in questa tabella).
--
-- Esecuzione consigliata:
--   psql "$DATABASE_URL" -f src/db/sql/spazi.sql

CREATE TABLE IF NOT EXISTS public.spazi (
  id SERIAL PRIMARY KEY,
  codice VARCHAR(50) NOT NULL UNIQUE, -- es. WP-2026-001, generato dal server
  descrizione TEXT NOT NULL,
  stato VARCHAR(20) NOT NULL DEFAULT 'ATTIVO', -- ATTIVO | SOSPESO | CHIUSO
  nome_schema VARCHAR(100), -- es. tenant_wp_2026_001, valorizzato dopo il provisioning
  schema_provisionato BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_spazio VARCHAR(20) NOT NULL DEFAULT 'NON_ENTE', -- ENTE | NON_ENTE — condiziona ricevibilità, categorie di credito, feedback sulla Proposta
  giudicante BOOLEAN NOT NULL DEFAULT FALSE, -- predisposto per un futuro sviluppo, non ancora operativo altrove nel codice
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.licenze_spazio (
  id SERIAL PRIMARY KEY,
  spazio_id INTEGER NOT NULL REFERENCES public.spazi(id) ON DELETE CASCADE,
  licenza_commerciale_id VARCHAR(50) REFERENCES public.licenze(id_licenza),
  chiave_licenza VARCHAR(150) NOT NULL UNIQUE, -- identificativo dell'operativa, distinto dalla commerciale
  tier VARCHAR(20) NOT NULL DEFAULT 'MICRO', -- MICRO | PMI | HOLDING | CUSTOM
  stato VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | EXPIRED | CLOSED
  max_utenti INTEGER NOT NULL DEFAULT 5,
  max_aziende INTEGER NOT NULL DEFAULT 1,
  data_attivazione TIMESTAMP NOT NULL DEFAULT now(),
  data_scadenza TIMESTAMP, -- NULL = nessuna scadenza
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenze_spazio_spazio_id ON public.licenze_spazio (spazio_id);
CREATE INDEX IF NOT EXISTS idx_licenze_spazio_licenza_commerciale ON public.licenze_spazio (licenza_commerciale_id);

-- Difensivo: se questo script era già stato eseguito prima dell'introduzione
-- del provisioning schema o della licenza commerciale, ALTER TABLE ... ADD
-- COLUMN IF NOT EXISTS aggiorna anche una tabella creata in precedenza senza
-- doverla ricreare da capo.
ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS nome_schema VARCHAR(100);
ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS schema_provisionato BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS tipo_spazio VARCHAR(20) NOT NULL DEFAULT 'NON_ENTE';
ALTER TABLE public.spazi ADD COLUMN IF NOT EXISTS giudicante BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.licenze_spazio ADD COLUMN IF NOT EXISTS licenza_commerciale_id VARCHAR(50) REFERENCES public.licenze(id_licenza);
