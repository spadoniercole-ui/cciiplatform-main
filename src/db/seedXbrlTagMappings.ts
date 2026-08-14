// src/db/seedXbrlTagMappings.ts
//
// Unica fonte di verità per il contenuto di public.xbrl_tag_mappings —
// prima viveva solo in src/db/sql/xbrl_tag_mappings.sql, da eseguire a
// mano con psql: un passo facile da dimenticare (dopo un azzeramento
// completo, o su un ambiente mai avviato prima), e che fallisce in
// silenzio — senza questa tabella il motore XBRL cade sul fallback
// statico più piccolo senza nessun errore visibile. Ora è chiamata
// automaticamente ovunque serva (assicuraTabelleSpazi, azzeraDatabase):
// idempotente, ON CONFLICT DO NOTHING, sicura da richiamare quante volte
// serve.

import { pool } from '@/lib/db';

const MAPPATURE: { alias: string; canonica: string; nota: string }[] = [
  {
    alias: 'valoreproduzionericavivenditeprestazioni',
    canonica: 'ricaviVendite',
    nota: 'Conto economico A.1',
  },
  {
    alias: 'ricavidellevenditeedelleprestazioni',
    canonica: 'ricaviVendite',
    nota: 'Variante tassonomia',
  },
  {
    alias: 'totalevaloreproduzione',
    canonica: 'valoreProduzione',
    nota: 'Conto economico A) totale',
  },
  {
    alias: 'totalecostiproduzione',
    canonica: 'costiProduzione',
    nota: 'Conto economico B) totale',
  },
  { alias: 'differenzavalorecostiproduzione', canonica: 'ebit', nota: 'A-B, EBIT' },
  {
    alias: 'margineoperativolordo',
    canonica: 'ebitdaDichiarato',
    nota: 'MOL se presente esplicitamente in tassonomia',
  },
  {
    alias: 'interessiedaltrionerifinanziari',
    canonica: 'oneriFinanziari',
    nota: 'Conto economico C.17',
  },
  { alias: 'proventionerifinanziari', canonica: 'oneriFinanziari', nota: 'Variante aggregata' },
  { alias: 'utileperditaesercizio', canonica: 'utileEsercizio', nota: 'Risultato di esercizio' },
  { alias: 'risultatoesercizio', canonica: 'utileEsercizio', nota: 'Variante tassonomia' },
  {
    alias: 'totaleammortamentierettifichedivalutazione',
    canonica: 'ammortamenti',
    nota: 'Conto economico B.10',
  },
  {
    alias: 'ammortamentoimmobilizzazionimateriali',
    canonica: 'ammortamenti',
    nota: 'Componente ammortamenti',
  },
  {
    alias: 'ammortamentoimmobilizzazioniimmateriali',
    canonica: 'ammortamenti',
    nota: 'Componente ammortamenti',
  },
  { alias: 'totaleattivocircolante', canonica: 'attivoCircolante', nota: 'Stato patrimoniale C)' },
  {
    alias: 'totaledisponibilitaliquide',
    canonica: 'disponibilitaLiquide',
    nota: 'Stato patrimoniale C.IV',
  },
  {
    alias: 'depositibancariepostali',
    canonica: 'disponibilitaLiquide',
    nota: 'Variante tassonomia',
  },
  { alias: 'totaleimmobilizzazioni', canonica: 'immobilizzazioni', nota: 'Stato patrimoniale B)' },
  { alias: 'totalepatrimonionetto', canonica: 'patrimonioNetto', nota: 'Stato patrimoniale A)' },
  { alias: 'patrimonionetto', canonica: 'patrimonioNetto', nota: 'Variante tassonomia' },
  { alias: 'totaledebiti', canonica: 'totaleDebiti', nota: 'Stato patrimoniale D)' },
  { alias: 'debiti', canonica: 'totaleDebiti', nota: 'Variante tassonomia' },
  { alias: 'debitiversobanche', canonica: 'debitiBanche', nota: 'Stato patrimoniale D.4' },
  {
    alias: 'debitiversobancheentro12mesi',
    canonica: 'debitiBanche',
    nota: 'Variante entro esercizio',
  },
  { alias: 'debitiversofornitori', canonica: 'debitiFornitori', nota: 'Stato patrimoniale D.7' },
  {
    alias: 'debitiversofornitorientro12mesi',
    canonica: 'debitiFornitori',
    nota: 'Variante entro esercizio',
  },
  { alias: 'debititributari', canonica: 'debitiTributari', nota: 'Stato patrimoniale D.12' },
  {
    alias: 'debititributarientro12mesi',
    canonica: 'debitiTributari',
    nota: 'Variante entro esercizio',
  },
  {
    alias: 'debitiversoistitutiprevidenzasicurezzasociale',
    canonica: 'debitiPrevidenziali',
    nota: 'Stato patrimoniale D.13',
  },
  {
    alias: 'debitiversoistitutiprevidenzaesicurezzasocialeentro12mesi',
    canonica: 'debitiPrevidenziali',
    nota: 'Variante entro esercizio',
  },
  {
    alias: 'debitiesigibilientroesercizio',
    canonica: 'passivoCorrente',
    nota: 'Proxy passivo a breve',
  },
  { alias: 'totaleattivo', canonica: 'totaleAttivo', nota: 'Totale attivo di stato patrimoniale' },
  {
    alias: 'creditiversoclienti',
    canonica: 'creditiClienti',
    nota: 'Stato patrimoniale C.II.1 — giorni medi di incasso, Simulazione Redigente',
  },
  {
    alias: 'creditiversoclientientro12mesi',
    canonica: 'creditiClienti',
    nota: 'Variante entro esercizio',
  },
];

export async function seedXbrlTagMappings(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.xbrl_tag_mappings (
      id SERIAL PRIMARY KEY,
      alias_tag TEXT NOT NULL UNIQUE,
      canonical_key TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  for (const m of MAPPATURE) {
    await pool.query(
      `INSERT INTO public.xbrl_tag_mappings (alias_tag, canonical_key, note) VALUES ($1, $2, $3)
       ON CONFLICT (alias_tag) DO NOTHING`,
      [m.alias, m.canonica, m.nota]
    );
  }
}
