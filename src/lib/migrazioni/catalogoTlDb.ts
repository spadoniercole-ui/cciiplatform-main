// src/lib/migrazioni/catalogoTlDb.ts
//
// IL CATALOGO DELLE TL, NEL DATABASE.
//
// Due cose sole: la tabella `catalogo_tl` nasce (idempotente, come tutto il
// resto dello schema) e la configurazione storica ci viene copiata una volta.
//
// Perché una tabella nuova e non `materie_lavorazione`: quella è la
// configurazione per MATERIA (i codici di partita che si lavorano allo stesso
// modo), questa è per CODICE DI LAVORAZIONE — la categoria di debito — e la
// stessa TL può valere su più materie. Una riga storica non dice in quale
// materia cade, e inventarne una avrebbe spostato i debiti su un ufficio che
// nessuno ha scelto. Qui il codice resta quello che era, la descrizione lo
// distingue, e l'ufficio è già agganciato.
//
// L'esecutore è iniettato (una funzione `(sql, params) => righe`) come in
// `lib/configurazioneSpazio`: la server action passa il pool, il test passa
// PGlite, e la migrazione si prova sul database vero senza simulacri.

import { TIPI_DEBITO_ENTE } from '@/lib/debitiEnte/tipoDebito';
import {
  pianificaCatalogoTl,
  type PianoCatalogoTl,
  type RigaStoricaLavorazione,
} from './catalogoTl';

export type Esecutore = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const SCHEMA_VALIDO = /^[a-z0-9_]+$/;

// Il DDL del catalogo, una volta per processo e per schema: la lettura del
// triage lo chiama a ogni apertura, e un CREATE/ALTER idempotente prende
// comunque un lock sulla tabella (la stessa ragione della memo in
// `src/db/provision.ts`). Chi azzera o ripristina lo schema chiama
// `dimenticaCatalogoTlGarantito`.
const cataloghiGarantiti = new Set<string>();

/** Dimentica il DDL eseguito: da chiamare quando lo schema viene sostituito. */
export function dimenticaCatalogoTlGarantito(nomeSchema?: string): void {
  if (!nomeSchema) {
    cataloghiGarantiti.clear();
    return;
  }
  cataloghiGarantiti.delete(nomeSchema);
}

function q(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

function schemaValido(nomeSchema: string): string {
  if (!SCHEMA_VALIDO.test(nomeSchema)) throw new Error('Nome schema non valido.');
  return q(nomeSchema);
}

/** La tabella non esiste (spazio che non ha mai usato la configurazione storica). */
function tabellaMancante(error: unknown): boolean {
  const codice = (error as { code?: string } | null)?.code;
  return codice === '42P01' || /does not exist/i.test((error as Error)?.message ?? '');
}

/**
 * Crea il catalogo delle TL e, dove c'è ancora, la colonna che segna le righe
 * storiche già migrate. Idempotente: ogni spazio la riceve al primo accesso.
 */
export async function assicuraCatalogoTl(esegui: Esecutore, nomeSchema: string): Promise<void> {
  const s = schemaValido(nomeSchema);
  if (cataloghiGarantiti.has(nomeSchema)) return;
  await esegui(`CREATE TABLE IF NOT EXISTS ${s}.catalogo_tl (
    id SERIAL PRIMARY KEY,
    codice TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    direttrice TEXT NOT NULL,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    ordine INTEGER NOT NULL DEFAULT 0,
    aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // L'identità di una TL è la coppia: lo stesso codice compare molte volte,
  // con descrizioni diverse. Il codice da solo NON è univoco, di proposito.
  await esegui(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_tl_unica
       ON ${s}.catalogo_tl (codice, descrizione)`
  );
  // Il segno sulla riga storica: senza, ogni apertura rileggerebbe la tabella
  // e una TL cancellata a mano tornerebbe nel catalogo.
  await esegui(
    `ALTER TABLE IF EXISTS ${s}.lavorazioni_tipo_debito
       ADD COLUMN IF NOT EXISTS migrata_il TIMESTAMPTZ`
  );
  cataloghiGarantiti.add(nomeSchema);
}

export interface EsitoMigrazione {
  /** true quando la tabella storica non c'è: niente da migrare. */
  assente: boolean;
  /** Le TL scritte nel catalogo. */
  copiate: number;
  /** Righe storiche lette e non copiate (motivo nel piano). */
  scartate: number;
  giaPresenti: number;
  fuoriElenco: string[];
  /** Quante righe storiche sono state marcate come migrate. */
  marcate: number;
}

const NIENTE: EsitoMigrazione = {
  assente: false,
  copiate: 0,
  scartate: 0,
  giaPresenti: 0,
  fuoriElenco: [],
  marcate: 0,
};

/**
 * Copia nel catalogo le righe della configurazione storica non ancora migrate.
 *
 * Non si esegue dentro una transazione, e non serve: ogni passo è idempotente
 * e l'ordine è quello giusto. Se il processo si interrompe dopo gli INSERT e
 * prima delle marcature, il giro successivo ritrova le stesse coppie, le salta
 * (`ON CONFLICT DO NOTHING`) e completa le marcature. Nessuna riga storica viene
 * cancellata né modificata: la si legge soltanto.
 */
export async function migraLavorazioniTipoDebitoInCatalogo(
  esegui: Esecutore,
  nomeSchema: string
): Promise<EsitoMigrazione> {
  await assicuraCatalogoTl(esegui, nomeSchema);
  const s = schemaValido(nomeSchema);

  let storiche: RigaStoricaLavorazione[];
  try {
    const lette = await esegui(
      `SELECT id, categoria, lavorazione, destinatario, attivo, ordine
         FROM ${s}.lavorazioni_tipo_debito
        WHERE migrata_il IS NULL
        ORDER BY ordine ASC, id ASC`
    );
    storiche = lette.map((r) => ({
      id: Number(r.id),
      categoria: String(r.categoria ?? ''),
      lavorazione: String(r.lavorazione ?? ''),
      destinatario: String(r.destinatario ?? ''),
      attivo: r.attivo !== false,
      ordine: Number(r.ordine ?? 0),
    }));
  } catch (error) {
    if (tabellaMancante(error)) return { ...NIENTE, assente: true };
    throw error;
  }
  if (storiche.length === 0) return NIENTE;

  const esistenti = await esegui(`SELECT codice, descrizione FROM ${s}.catalogo_tl`);

  // Le categorie che esistono ancora: quelle configurate nello spazio più i
  // quattro codici legacy, che restano validi per i dati già inseriti.
  let categorieValide: string[] = TIPI_DEBITO_ENTE.map((t) => t.valore);
  try {
    const categorie = await esegui(`SELECT codice FROM ${s}.categorie_tipo_debito`);
    categorieValide = [...categorieValide, ...categorie.map((r) => String(r.codice ?? ''))];
  } catch (error) {
    if (!tabellaMancante(error)) throw error;
  }

  let direttrici: { nome: string }[] = [];
  try {
    const spazio = await esegui(
      `SELECT direttrici_ente_strutturate FROM public.spazi WHERE nome_schema = $1`,
      [nomeSchema]
    );
    direttrici = (spazio[0]?.direttrici_ente_strutturate as { nome: string }[] | null) ?? [];
  } catch {
    // Uno spazio senza direttrici non blocca la migrazione: il destinatario
    // resta quello che era, come per un ufficio fuori elenco.
    direttrici = [];
  }

  const piano: PianoCatalogoTl = pianificaCatalogoTl({
    storiche,
    esistenti: esistenti.map((r) => ({
      codice: String(r.codice ?? ''),
      descrizione: String(r.descrizione ?? ''),
    })),
    direttrici,
    categorieValide,
  });

  for (const riga of piano.righe) {
    await esegui(
      `INSERT INTO ${s}.catalogo_tl (codice, descrizione, direttrice, attivo, ordine)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (codice, descrizione) DO NOTHING`,
      [riga.codice, riga.descrizione, riga.direttrice, riga.attivo, riga.ordine]
    );
  }

  // Si marcano TUTTE le righe lette: anche quelle scartate (una categoria
  // cancellata non deve tornare) e quelle già presenti (la TL c'è già).
  await esegui(
    `UPDATE ${s}.lavorazioni_tipo_debito
        SET migrata_il = now()
      WHERE id = ANY($1::int[])`,
    [storiche.map((r) => r.id)]
  );

  return {
    assente: false,
    copiate: piano.righe.length,
    scartate: piano.scartate.length,
    giaPresenti: piano.giaPresenti,
    fuoriElenco: piano.fuoriElenco,
    marcate: storiche.length,
  };
}

export interface EsitoScartoStorico {
  /** Righe storiche segnate come non più migrabili (0 se la tabella non c'è). */
  segnate: number;
}

/**
 * Una categoria cancellata non deve ricomparire: le righe storiche che la
 * nominano si marcano come migrate senza essere copiate. Le TL che erano già
 * nel catalogo le toglie il chiamante, nella stessa transazione.
 *
 * Se la tabella storica non esiste più (ritiro completato) non fa nulla.
 */
export async function segnaRigheStoricheDellaCategoria(
  esegui: Esecutore,
  nomeSchema: string,
  codice: string
): Promise<EsitoScartoStorico> {
  const s = schemaValido(nomeSchema);
  let esiste = false;
  try {
    await esegui(
      `ALTER TABLE IF EXISTS ${s}.lavorazioni_tipo_debito
         ADD COLUMN IF NOT EXISTS migrata_il TIMESTAMPTZ`
    );
    esiste = true;
  } catch (error) {
    if (!tabellaMancante(error)) throw error;
  }
  if (!esiste) return { segnate: 0 };
  try {
    const r = await esegui(
      `UPDATE ${s}.lavorazioni_tipo_debito
          SET migrata_il = COALESCE(migrata_il, now())
        WHERE upper(btrim(categoria)) = upper(btrim($1))
        RETURNING id`,
      [codice]
    );
    return { segnate: r.length };
  } catch (error) {
    if (tabellaMancante(error)) return { segnate: 0 };
    throw error;
  }
}
