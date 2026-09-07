-- src/db/sql/analisi_xbrl_storico.sql
--
-- Storico delle analisi XBRL per azienda, necessario per il confronto tra
-- più bilanci/periodi nel tempo (funzione "Andamento Storico" e per la
-- Relazione AI quando include un'analisi di trend). Prima di questa
-- tabella, ogni analisi viveva solo nello stato React della pagina e
-- spariva al refresh: non c'era nulla da confrontare nel tempo.
--
-- Esecuzione consigliata:
--   psql "$DATABASE_URL" -f src/db/sql/analisi_xbrl_storico.sql

CREATE TABLE IF NOT EXISTS public.analisi_xbrl_storico (
  id SERIAL PRIMARY KEY,
  codice_fiscale VARCHAR(32) NOT NULL,
  ragione_sociale TEXT NOT NULL,
  anno_bilancio INTEGER, -- NULL se non determinabile dai contesti XBRL
  nome_file TEXT,
  dati_finanziari JSONB NOT NULL, -- snapshot di DatiFinanziariPeriodo (periodo corrente)
  indici JSONB NOT NULL, -- snapshot di IndiceCcii[] (i 5 indici CCII)
  altri_indici JSONB NOT NULL DEFAULT '[]',
  situazione_debitoria JSONB NOT NULL,
  severity VARCHAR(10) NOT NULL, -- GREEN | YELLOW | RED
  created_at TIMESTAMP NOT NULL DEFAULT now(),

  -- Un'azienda può avere al più un'analisi salvata per anno di bilancio:
  -- un nuovo salvataggio per lo stesso anno sovrascrive il precedente
  -- (upsert), non lo duplica. Comportamento standard Postgres: righe con
  -- anno_bilancio NULL sono sempre considerate distinte tra loro, quindi
  -- più caricamenti "senza anno determinato" convivono senza conflitto.
  CONSTRAINT uq_azienda_anno UNIQUE (codice_fiscale, anno_bilancio)
);

CREATE INDEX IF NOT EXISTS idx_storico_codice_fiscale ON public.analisi_xbrl_storico (codice_fiscale);
