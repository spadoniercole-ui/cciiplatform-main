-- src/db/sql/licenze.sql
--
-- Licenze commerciali. Una licenza commerciale può governare 1 o più Spazi
-- di Lavoro (vedi licenze_spazio.licenza_commerciale_id in spazi.sql).
--
-- Questa tabella esisteva già nel database prima che questo script fosse
-- scritto (creata manualmente in una fase precedente): questo file serve a
-- documentarne la struttura e a garantire che le nuove colonne (stato,
-- date di sospensione/cessazione) ci siano anche su database creati prima.
--
-- Esecuzione consigliata:
--   psql "$DATABASE_URL" -f src/db/sql/licenze.sql
--
-- NOTA: da qui in poi le azioni server (creaLicenzaCommercialeAction,
-- creaSpazioAction, ecc.) eseguono comunque queste stesse istruzioni in
-- automatico ad ogni chiamata (idempotenti, IF NOT EXISTS): eseguire questo
-- script a mano non è più strettamente necessario, ma resta utile per chi
-- vuole preparare il database in anticipo o documentarne la struttura.

CREATE TABLE IF NOT EXISTS public.licenze (
  id_licenza VARCHAR(50) PRIMARY KEY,
  ragione_sociale TEXT NOT NULL,
  codice_fiscale VARCHAR(32),
  partita_iva VARCHAR(32),
  indirizzo TEXT,
  cap VARCHAR(10),
  citta VARCHAR(100),
  pec VARCHAR(150),
  max_spazi INTEGER NOT NULL DEFAULT 5,
  max_aziende INTEGER NOT NULL DEFAULT 10,
  max_utenti INTEGER NOT NULL DEFAULT 15,
  data_attivazione TIMESTAMP NOT NULL DEFAULT now(),
  data_scadenza DATE,
  stato_disattiva BOOLEAN NOT NULL DEFAULT FALSE
);

-- Stato commerciale esplicito: sospensione o cessazione anticipata, non
-- solo attesa della scadenza naturale.
ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS stato VARCHAR(20) NOT NULL DEFAULT 'ATTIVA';
ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS data_sospensione TIMESTAMP;
ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS data_cessazione TIMESTAMP;
ALTER TABLE public.licenze ADD COLUMN IF NOT EXISTS motivo_stato TEXT;
