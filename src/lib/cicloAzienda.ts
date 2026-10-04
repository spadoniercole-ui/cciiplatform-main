// src/lib/cicloAzienda.ts
//
// NUOVO CICLO DI ISTRUTTORIA su un'azienda già nota.
//
// Rifacendo il triage sulla stessa impresa (stessa P.IVA o codice fiscale) la
// piattaforma riusa la scheda dell'azienda. Fino alla 0.127 riusava anche
// tutto il lavoro precedente: lo screening si presentava già pronto, con la
// Check List compilata, e la nuova verifica leggeva dati vecchi che forse
// aggiornava e forse no. Ora il lavoro precedente va in archivio (sola
// lettura) e si riparte da zero.
//
// Che cosa va in archivio e si azzera:
//   - lo screening (relazione, sezioni, fatti della visura) e le risposte
//     alla sua Check List;
//   - la Check List ministeriale dell'azienda;
//   - le posizioni debitorie del triage e il V.E.R.A.;
//   - i valori della scheda Soglie di segnalazione.
// Che cosa resta: l'anagrafica dell'azienda e quella presso l'ente, i bilanci
// XBRL (sono fatti per esercizio, non lavoro dell'istruttoria), gli scenari
// già aperti, lo storico delle generazioni dello screening.
//
// Si apre un nuovo ciclo solo se c'è qualcosa da archiviare. Accesso al
// database tramite un Esecutore (pool in produzione, PGlite nei test); il
// chiamante gestisce la transazione.

export type Esecutore = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Tabelle del lavoro di istruttoria, tutte con la colonna azienda_id. */
export const TABELLE_CICLO = [
  'azienda_screening',
  'azienda_screening_risposte',
  'azienda_checklist_ministeriale_risposte',
  'debiti_triage',
  'debiti_vera',
] as const;

/** Colonne della scheda Soglie, sulla riga dell'azienda. */
export const COLONNE_SOGLIE = [
  'con_lavoratori_subordinati',
  'contributi_scaduti',
  'contributi_dovuti_anno_precedente',
  'anno_contributi_dovuti',
  'sanzioni_presunte_vera',
  'premi_inail',
  'iva_scaduta',
  'volume_affari',
  'crediti_affidati_aer',
  'soglie_aggiornate_al',
  'ritardo_oltre_90_giorni',
  'periodi_in_ritardo',
  'denunce_non_presentate',
] as const;

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

export async function assicuraTabellaCicli(esegui: Esecutore, schema: string): Promise<void> {
  await esegui(`
    CREATE TABLE IF NOT EXISTS ${q(schema)}.azienda_cicli_archivio (
      id SERIAL PRIMARY KEY,
      azienda_id INTEGER NOT NULL,
      archiviato_il TIMESTAMP NOT NULL DEFAULT now(),
      screening_del TIMESTAMP,
      contenuto JSONB NOT NULL
    )`);
  await esegui(
    `CREATE INDEX IF NOT EXISTS idx_azienda_cicli_archivio_azienda ON ${q(schema)}.azienda_cicli_archivio (azienda_id)`
  );
}

async function tabelleEsistenti(esegui: Esecutore, schema: string): Promise<Set<string>> {
  const r = await esegui(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
    [schema]
  );
  return new Set(r.map((x) => String(x.table_name)));
}

async function colonneAziende(esegui: Esecutore, schema: string): Promise<Set<string>> {
  const r = await esegui(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'aziende'`,
    [schema]
  );
  return new Set(r.map((x) => String(x.column_name)));
}

export interface EsitoNuovoCiclo {
  /** true se c'era lavoro precedente ed è stato archiviato. */
  archiviato: boolean;
  /** Righe archiviate per tabella. */
  righe: Record<string, number>;
}

/**
 * Archivia il lavoro di istruttoria dell'azienda e lo azzera. Va chiamata
 * dentro una transazione. Se non c'è nulla da archiviare non fa niente.
 */
export async function apriNuovoCiclo(
  esegui: Esecutore,
  schema: string,
  aziendaId: number
): Promise<EsitoNuovoCiclo> {
  const esistenti = await tabelleEsistenti(esegui, schema);
  const contenuto: Record<string, unknown> = {};
  const righe: Record<string, number> = {};
  let totale = 0;
  for (const t of TABELLE_CICLO) {
    if (!esistenti.has(t)) continue;
    const r = await esegui(`SELECT * FROM ${q(schema)}.${q(t)} WHERE azienda_id = $1`, [aziendaId]);
    contenuto[t] = r;
    righe[t] = r.length;
    totale += r.length;
  }

  const colonne = await colonneAziende(esegui, schema);
  const soglie = COLONNE_SOGLIE.filter((c) => colonne.has(c));
  if (soglie.length > 0) {
    const r = await esegui(
      `SELECT ${soglie.map(q).join(', ')} FROM ${q(schema)}.aziende WHERE id = $1`,
      [aziendaId]
    );
    const valori = r[0] ?? {};
    const valorizzati = Object.fromEntries(
      Object.entries(valori).filter(([, v]) => v !== null && v !== undefined && v !== '')
    );
    if (Object.keys(valorizzati).length > 0) {
      contenuto.soglie = valorizzati;
      totale += 1;
    }
  }

  if (totale === 0) return { archiviato: false, righe };

  await assicuraTabellaCicli(esegui, schema);
  const screening = (contenuto.azienda_screening as Record<string, unknown>[] | undefined)?.[0];
  await esegui(
    `INSERT INTO ${q(schema)}.azienda_cicli_archivio (azienda_id, screening_del, contenuto)
     VALUES ($1, $2, $3)`,
    [aziendaId, screening?.generato_il ?? null, JSON.stringify(contenuto)]
  );

  for (const t of TABELLE_CICLO) {
    if (!esistenti.has(t)) continue;
    await esegui(`DELETE FROM ${q(schema)}.${q(t)} WHERE azienda_id = $1`, [aziendaId]);
  }
  if (soglie.length > 0) {
    await esegui(
      `UPDATE ${q(schema)}.aziende SET ${soglie.map((c) => `${q(c)} = NULL`).join(', ')} WHERE id = $1`,
      [aziendaId]
    );
  }
  return { archiviato: true, righe };
}

export interface CicloArchiviato {
  id: number;
  archiviatoIl: string;
  screeningDel: string | null;
  relazioneScreening: string | null;
  partiteVera: number;
  posizioniTriage: number;
  risposteChecklist: number;
}

/** Elenco dei cicli archiviati di un'azienda, dal più recente. */
export async function elencaCicli(
  esegui: Esecutore,
  schema: string,
  aziendaId: number
): Promise<CicloArchiviato[]> {
  const esistenti = await tabelleEsistenti(esegui, schema);
  if (!esistenti.has('azienda_cicli_archivio')) return [];
  const r = await esegui(
    `SELECT id, archiviato_il, screening_del, contenuto
       FROM ${q(schema)}.azienda_cicli_archivio WHERE azienda_id = $1 ORDER BY archiviato_il DESC, id DESC`,
    [aziendaId]
  );
  return r.map((x) => {
    const c = (typeof x.contenuto === 'string' ? JSON.parse(x.contenuto) : x.contenuto) as Record<
      string,
      unknown[] | undefined
    >;
    const scr = (c.azienda_screening?.[0] ?? null) as Record<string, unknown> | null;
    const lungh = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : 0);
    return {
      id: Number(x.id),
      archiviatoIl: new Date(String(x.archiviato_il)).toISOString(),
      screeningDel: x.screening_del ? new Date(String(x.screening_del)).toISOString() : null,
      relazioneScreening: scr?.relazione_testo ? String(scr.relazione_testo) : null,
      partiteVera: lungh('debiti_vera'),
      posizioniTriage: lungh('debiti_triage'),
      risposteChecklist:
        lungh('azienda_screening_risposte') + lungh('azienda_checklist_ministeriale_risposte'),
    };
  });
}
