-- ============================================================================
-- RESET COMPLETO DEL DATABASE — CCIIWEB4.0
-- ============================================================================
-- Cosa fa: elimina OGNI spazio (schema tenant), OGNI licenza, OGNI sessione
-- attiva, e tutte le tabelle globali di supporto (indici email→schema,
-- storico XBRL, mappature tag, cache dati di settore, modello base Check
-- List). Dopo l'esecuzione, l'unica cosa che resta funzionante è il login
-- superadmin — che non vive nel database: è definito dalle variabili
-- d'ambiente SUPERADMIN_USER / SUPERADMIN_PASSWORD sul server, quindi
-- questo script non lo tocca in alcun modo, né deve.
--
-- Cosa NON fa: non tocca il database Postgres stesso, non tocca ruoli o
-- permessi, non tocca estensioni. Elimina solo lo schema "public" del
-- CCIIWEB4.0 (tabelle applicative) e tutti gli schemi "tenant_*".
--
-- IRREVERSIBILE. Non c'è un modo per annullarlo dopo l'esecuzione — se sul
-- database ci sono spazi con dati reali che servono ancora, fare un backup
-- prima (pg_dump) o non eseguirlo.
--
-- Verificato contro il codice sorgente reale del progetto (non scritto a
-- memoria): i nomi delle tabelle e degli schemi elencati sotto sono quelli
-- effettivamente creati da src/db/provision.ts, src/db/ensureTables.ts e
-- src/db/sql/*.sql al momento di questa consegna (versione 0.44.1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Elimina ogni schema tenant (uno per spazio) — nominati sempre
--    "tenant_<codice_spazio_normalizzato>" (src/db/provision.ts).
--    Trovati dinamicamente, non elencati a mano: non serve sapere in
--    anticipo quanti spazi esistono o come si chiamano.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  schema_tenant TEXT;
BEGIN
  FOR schema_tenant IN
    SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname LIKE 'tenant\_%'
  LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_tenant);
    RAISE NOTICE 'Schema eliminato: %', schema_tenant;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Svuota le tabelle globali (schema public) — elenco completo verificato:
--    spazi, licenze_spazio, licenze (src/db/sql/spazi.sql, licenze.sql)
--    sessioni (src/db/sql/sessioni.sql)
--    analisi_xbrl_storico (src/db/sql/analisi_xbrl_storico.sql)
--    xbrl_tag_mappings (src/db/sql/xbrl_tag_mappings.sql)
--    admin_spazio_index, utente_spazio_index (src/db/ensureTables.ts)
--    checklist_modello_base (src/app/actions/checklistModelloBase.ts)
--    dati_settore_cache, dati_settore_ultima_chiamata (src/db/provision.ts)
--    RESTART IDENTITY: azzera anche i contatori seriali (id che ripartono da 1).
--    CASCADE: gestisce eventuali riferimenti tra queste tabelle senza dover
--    rispettare un ordine specifico.
--    "IF EXISTS" tabella per tabella: lo script non si blocca se una di
--    queste, per qualche motivo, non fosse mai stata creata su questo
--    database (es. una consegna non ancora arrivata all'ambiente in uso).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tabella TEXT;
BEGIN
  FOREACH tabella IN ARRAY ARRAY[
    'spazi',
    'licenze_spazio',
    'licenze',
    'sessioni',
    'analisi_xbrl_storico',
    'xbrl_tag_mappings',
    'admin_spazio_index',
    'utente_spazio_index',
    'checklist_modello_base',
    'dati_settore_cache',
    'dati_settore_ultima_chiamata'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tabella
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', tabella);
      RAISE NOTICE 'Tabella svuotata: public.%', tabella;
    ELSE
      RAISE NOTICE 'Tabella non trovata (saltata): public.%', tabella;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Verifica finale — deve restituire ZERO righe su entrambe le query se
--    il reset è andato a buon fine.
-- ----------------------------------------------------------------------------
SELECT nspname AS schema_tenant_residuo
FROM pg_catalog.pg_namespace
WHERE nspname LIKE 'tenant\_%';

SELECT
  (SELECT count(*) FROM public.spazi) AS spazi_residui,
  (SELECT count(*) FROM public.licenze) AS licenze_residue,
  (SELECT count(*) FROM public.sessioni) AS sessioni_residue;
