-- src/db/sql/xbrl_tag_mappings.sql
--
-- AGGIORNAMENTO: questo script NON serve più essere eseguito a mano.
-- Il suo contenuto vive ora in src/db/seedXbrlTagMappings.ts (unica
-- fonte di verità, per evitare che i due si disallineino nel tempo),
-- richiamato automaticamente sia da assicuraTabelleSpazi() (ad ogni
-- avvio rilevante) sia da azzeraDatabaseCompletoAction() (subito dopo
-- aver svuotato la tabella, nella stessa operazione) — prima era un
-- passo manuale facile da dimenticare, che oltretutto falliva in
-- silenzio se saltato (il motore XBRL cade sul fallback statico senza
-- errore visibile). Questo file resta solo come riferimento leggibile
-- dei dati, se mai serve eseguirlo a mano su un ambiente isolato senza
-- passare dall'applicazione.
--
-- Esecuzione manuale (solo se davvero necessaria):
--   psql "$DATABASE_URL" -f src/db/sql/xbrl_tag_mappings.sql

CREATE TABLE IF NOT EXISTS public.xbrl_tag_mappings (
  id SERIAL PRIMARY KEY,
  alias_tag TEXT NOT NULL UNIQUE,
  canonical_key TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Seed: tag più frequenti nella tassonomia italiana ITCC-CI.
-- alias_tag è già "pulito" (senza namespace, minuscolo, solo alfanumerico),
-- coerente con la funzione pulisciTag() in src/lib/xbrl/parser.ts.
INSERT INTO public.xbrl_tag_mappings (alias_tag, canonical_key, note) VALUES
  ('valoreproduzionericavivenditeprestazioni', 'ricaviVendite', 'Conto economico A.1'),
  ('ricavidellevenditeedelleprestazioni', 'ricaviVendite', 'Variante tassonomia'),
  ('totalevaloreproduzione', 'valoreProduzione', 'Conto economico A) totale'),
  ('totalecostiproduzione', 'costiProduzione', 'Conto economico B) totale'),
  ('differenzavalorecostiproduzione', 'ebit', 'A-B, EBIT'),
  ('margineoperativolordo', 'ebitdaDichiarato', 'MOL se presente esplicitamente in tassonomia'),
  ('interessiedaltrionerifinanziari', 'oneriFinanziari', 'Conto economico C.17'),
  ('proventionerifinanziari', 'oneriFinanziari', 'Variante aggregata'),
  ('utileperditaesercizio', 'utileEsercizio', 'Risultato di esercizio'),
  ('risultatoesercizio', 'utileEsercizio', 'Variante tassonomia'),
  ('totaleammortamentierettifichedivalutazione', 'ammortamenti', 'Conto economico B.10'),
  ('ammortamentoimmobilizzazionimateriali', 'ammortamenti', 'Componente ammortamenti'),
  ('ammortamentoimmobilizzazioniimmateriali', 'ammortamenti', 'Componente ammortamenti'),
  ('totaleattivocircolante', 'attivoCircolante', 'Stato patrimoniale C)'),
  ('totaledisponibilitaliquide', 'disponibilitaLiquide', 'Stato patrimoniale C.IV'),
  ('depositibancariepostali', 'disponibilitaLiquide', 'Variante tassonomia'),
  ('totaleimmobilizzazioni', 'immobilizzazioni', 'Stato patrimoniale B)'),
  ('totalepatrimonionetto', 'patrimonioNetto', 'Stato patrimoniale A)'),
  ('patrimonionetto', 'patrimonioNetto', 'Variante tassonomia'),
  ('totaledebiti', 'totaleDebiti', 'Stato patrimoniale D)'),
  ('debiti', 'totaleDebiti', 'Variante tassonomia'),
  ('debitiversobanche', 'debitiBanche', 'Stato patrimoniale D.4'),
  ('debitiversobancheentro12mesi', 'debitiBanche', 'Variante entro esercizio'),
  ('debitiversofornitori', 'debitiFornitori', 'Stato patrimoniale D.7'),
  ('debitiversofornitorientro12mesi', 'debitiFornitori', 'Variante entro esercizio'),
  ('debititributari', 'debitiTributari', 'Stato patrimoniale D.12'),
  ('debititributarientro12mesi', 'debitiTributari', 'Variante entro esercizio'),
  ('debitiversoistitutiprevidenzasicurezzasociale', 'debitiPrevidenziali', 'Stato patrimoniale D.13'),
  ('debitiversoistitutiprevidenzaesicurezzasocialeentro12mesi', 'debitiPrevidenziali', 'Variante entro esercizio'),
  ('debitiesigibilientroesercizio', 'passivoCorrente', 'Proxy passivo a breve'),
  ('totaleattivo', 'totaleAttivo', 'Totale attivo di stato patrimoniale'),
  ('creditiversoclienti', 'creditiClienti', 'Stato patrimoniale C.II.1 — usato per i giorni medi di incasso nella Simulazione Redigente'),
  ('creditiversoclientientro12mesi', 'creditiClienti', 'Variante entro esercizio')
ON CONFLICT (alias_tag) DO NOTHING;
