// src/lib/portableBootstrap.ts
//
// Primo avvio dell'edizione portable. Per rendere il pacchetto davvero
// utile alla distribuzione (una demo che si mostra "chiavi in mano"),
// crea DUE spazi di lavoro fissi sulla stessa istanza locale:
//
//   - un Redigente (NON_ENTE): il professionista che PREDISPONE la proposta;
//   - un Ricevente (ENTE):     l'ente creditore che VALUTA la proposta.
//
// È lo stesso caso reale visto dai due lati: la stessa azienda che da una
// parte è quella valutata, dall'altra è quella che propone. Due login
// separati (email distinte — richiesto dal vincolo di unicità globale su
// admin_spazio_index.email): si entra con l'uno o con l'altro, si esce e
// si rientra per cambiare lato, esattamente come nel cloud. Nessun
// superadmin, nessun pannello di gestione multi-spazio.
//
// Oltre ai due spazi, semina una DEMO coerente e già navigabile: la
// stessa azienda su entrambi i lati, con la proposta ai creditori sul
// Redigente e, sul Ricevente, l'intera "parte ente" (anagrafica ente,
// posizione debitoria, limiti di ricevibilità e la proposta ricevuta con
// la riga rilevante già segnata). Disattivabile con PORTABLE_SEED_DEMO=0.
//
// Riusa le stesse funzioni di provisioning del percorso cloud, così lo
// schema è identico. I valori arrivano da variabili d'ambiente impostate
// dal launcher (config.bat), con default sensati per un primo avvio.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */

type ConfigSpazio = {
  codice: string;
  descrizione: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  admin: {
    nome: string;
    cognome: string;
    email: string;
    cellulare: string;
    password: string;
  };
};

type SpazioCreato = { spazioId: number; nomeSchema: string };

/** Guardia identica a quella delle Server Action: un nome schema è sempre
 * derivato dal codice (lowercase, trattini→underscore), mai da input
 * libero, ma lo si valida comunque prima di interpolarlo in una query. */
function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/** Crea UN singolo spazio (spazio + licenza tecnica + schema tenant +
 * Admin di Spazio + indice email→schema). Idempotente per codice: se uno
 * spazio con quel codice esiste già, restituisce comunque id e nome dello
 * schema (utile alla semina della demo) senza duplicare né sovrascrivere
 * nulla — così un riavvio non rifà il lavoro già fatto. */
async function creaSpazioPortable(cfg: ConfigSpazio): Promise<SpazioCreato> {
  const { pool } = await import('@/lib/db');
  const { provisionaSchemaSpazio, creaAdminSpazio } = await import('@/db/provision');

  const codice = cfg.codice.trim();
  const email = cfg.admin.email.trim().toLowerCase();

  // Idempotenza per codice: se lo spazio esiste già, restituisci i suoi
  // riferimenti senza ricrearlo.
  const esistente = await pool.query(
    'SELECT id, nome_schema FROM spazi WHERE codice = $1 LIMIT 1',
    [codice]
  );
  if (esistente.rows.length > 0) {
    return { spazioId: esistente.rows[0].id, nomeSchema: esistente.rows[0].nome_schema };
  }

  // 1) Spazio + licenza tecnica (tutte le funzioni "plus" attive: in
  //    locale non c'è un modello commerciale che le venda a parte).
  const spazioInserito = await pool.query(
    `INSERT INTO spazi (codice, descrizione, tipo_spazio, giudicante) VALUES ($1, $2, $3, FALSE) RETURNING id`,
    [codice, cfg.descrizione, cfg.tipoSpazio]
  );
  const spazioId = spazioInserito.rows[0].id;

  await pool.query(
    `INSERT INTO licenze_spazio
       (spazio_id, chiave_licenza, tier, max_utenti, max_aziende, plus_dati_settore, plus_simulazione, plus_relazione_ai)
     VALUES ($1, $2, 'LOCALE', 999, 999, TRUE, TRUE, TRUE)`,
    [spazioId, `LOCAL-${codice}`]
  );

  // 2) Schema tenant isolato + tabelle master.
  const nomeSchema = await provisionaSchemaSpazio(codice);
  await pool.query('UPDATE spazi SET nome_schema = $1, schema_provisionato = TRUE WHERE id = $2', [
    nomeSchema,
    spazioId,
  ]);

  // 3) Admin di Spazio + indice email -> schema per il login.
  const passwordHash = await bcrypt.hash(cfg.admin.password, 10);
  const codiceConvalida = crypto.randomBytes(6).toString('hex');
  await creaAdminSpazio(nomeSchema, {
    nome: cfg.admin.nome,
    cognome: cfg.admin.cognome,
    email,
    cellulare: cfg.admin.cellulare,
    passwordHash,
    passwordTemporanea: '',
    codiceConvalida,
  });

  await pool.query(
    `INSERT INTO admin_spazio_index (email, nome_schema, spazio_id, codice_spazio)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET nome_schema = EXCLUDED.nome_schema, spazio_id = EXCLUDED.spazio_id, codice_spazio = EXCLUDED.codice_spazio`,
    [email, nomeSchema, spazioId, codice]
  );

  console.info(
    `[portable] Spazio "${cfg.descrizione}" (${codice}, ${cfg.tipoSpazio}) creato. Login: ${email}`
  );
  return { spazioId, nomeSchema };
}

// ============================================================
//  DEMO — dataset condiviso, la STESSA azienda vista dai due lati
// ============================================================

/** L'azienda in crisi: stessa anagrafica su Redigente e Ricevente. */
const AZIENDA_DEMO = {
  ragioneSociale: 'Meccanica Lombarda S.r.l.',
  codiceFiscale: '03948570965',
  partitaIva: '03948570965',
  codiceAteco: '25.62.00', // lavorazioni meccaniche
  formaGiuridica: 'S.r.l.',
  indirizzo: "Via dell'Industria 14",
  citta: 'Milano',
  provincia: 'MI',
  cap: '20139',
  capitaleSociale: 50000,
  rappresentante: 'Mario Rossi',
  ruoloRappresentante: 'Amministratore Unico',
  numeroRea: 'MI-1948572',
  pec: 'meccanicalombarda@pec.it',
};

/** La proposta ai creditori — identica sui due lati (di là la si scrive,
 * di qua la si riceve). La riga INPS è quella che interessa all'ente
 * Ricevente (rilevante_per_ente). Il "dovuto" INPS (120.000) coincide con
 * la somma della posizione debitoria dell'ente più sotto. */
const PROPOSTA: {
  categoria: string;
  dovuto: number;
  offerta: number;
  modalita: 'UNICA_SOLUZIONE' | 'RATEALE';
  rate: number | null;
  rango: string;
  rilevanteEnte: boolean;
}[] = [
  {
    categoria: 'Banca Ipotecaria S.p.A.',
    dovuto: 400000,
    offerta: 100,
    modalita: 'UNICA_SOLUZIONE',
    rate: null,
    rango: 'PRIVILEGIATO_IPOTECA',
    rilevanteEnte: false,
  },
  {
    categoria: 'INPS',
    dovuto: 120000,
    offerta: 40,
    modalita: 'RATEALE',
    rate: 60,
    rango: 'PRIVILEGIATO_GENERALE',
    rilevanteEnte: true,
  },
  {
    categoria: 'Erario - Agenzia delle Entrate',
    dovuto: 90000,
    offerta: 30,
    modalita: 'RATEALE',
    rate: 48,
    rango: 'PRIVILEGIATO_GENERALE',
    rilevanteEnte: false,
  },
  {
    categoria: 'Fornitori chirografari',
    dovuto: 250000,
    offerta: 20,
    modalita: 'UNICA_SOLUZIONE',
    rate: null,
    rango: 'CHIROGRAFARIO',
    rilevanteEnte: false,
  },
];

/** Etichette dell'Anagrafica Ente tipiche di un ente previdenziale (INPS),
 * al posto dei generici "Campo 1..5". */
const ANAGRAFICA_CONFIG = [
  { campo: 1, etichetta: 'Matricola INPS' },
  { campo: 2, etichetta: 'Posizione Gestione Separata' },
  { campo: 3, etichetta: 'Codice CSC' },
  { campo: 4, etichetta: 'Codice Autorizzazione (CA)' },
  { campo: 5, etichetta: 'Sede competente' },
];

/** Valori dell'Anagrafica Ente per l'azienda demo. */
const ANAGRAFICA_VALORI = {
  idEnte: 'INPS',
  campo1: '4812345678',
  campo2: 'GS-0099123',
  campo3: '11305',
  campo4: '7B',
  campo5: 'Milano',
};

/** Posizione debitoria che l'ente (INPS) dichiara verso l'azienda — le
 * quattro nature CLE/CEN/CEC/CEA sono tutte rappresentate. Somma =
 * 120.000, coerente con il "dovuto" della riga INPS della proposta. */
const DEBITI_ENTE: {
  voce: string;
  importo: number;
  tipo: string;
  data: string;
  note: string | null;
}[] = [
  {
    voce: 'Contributi IVS dipendenti 2023',
    importo: 45000,
    tipo: 'CLE',
    data: '2023-12-16',
    note: null,
  },
  {
    voce: 'Contributi Gestione Separata 2023',
    importo: 18000,
    tipo: 'CEN',
    data: '2024-02-16',
    note: 'avviso di addebito notificato',
  },
  {
    voce: 'Sanzioni civili e interessi',
    importo: 22000,
    tipo: 'CEA',
    data: '2024-05-31',
    note: 'a ruolo — Agenzia delle Entrate-Riscossione',
  },
  {
    voce: 'Contributi in contenzioso 2022',
    importo: 35000,
    tipo: 'CEC',
    data: '2022-11-16',
    note: 'ricorso pendente',
  },
];

/** Trova o crea l'azienda demo in uno schema tenant. Idempotente: se
 * esiste già (per ragione sociale), restituisce il suo id senza reinserire
 * — così la semina non si ripete a un riavvio. */
async function assicuraAziendaDemo(
  pool: any,
  schema: string
): Promise<{ id: number; creata: boolean }> {
  const es = await pool.query(
    `SELECT id FROM "${schema}".aziende WHERE ragione_sociale = $1 LIMIT 1`,
    [AZIENDA_DEMO.ragioneSociale]
  );
  if (es.rows.length > 0) return { id: es.rows[0].id, creata: false };

  const ins = await pool.query(
    `INSERT INTO "${schema}".aziende
       (ragione_sociale, codice_fiscale, partita_iva, codice_ateco, forma_giuridica,
        indirizzo_sede_legale, citta, provincia, cap, capitale_sociale,
        rappresentante_legale, ruolo_rappresentante_legale, numero_rea, pec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      AZIENDA_DEMO.ragioneSociale,
      AZIENDA_DEMO.codiceFiscale,
      AZIENDA_DEMO.partitaIva,
      AZIENDA_DEMO.codiceAteco,
      AZIENDA_DEMO.formaGiuridica,
      AZIENDA_DEMO.indirizzo,
      AZIENDA_DEMO.citta,
      AZIENDA_DEMO.provincia,
      AZIENDA_DEMO.cap,
      AZIENDA_DEMO.capitaleSociale,
      AZIENDA_DEMO.rappresentante,
      AZIENDA_DEMO.ruoloRappresentante,
      AZIENDA_DEMO.numeroRea,
      AZIENDA_DEMO.pec,
    ]
  );
  return { id: ins.rows[0].id, creata: true };
}

/** Inserisce le righe della proposta ai creditori per uno scenario. Sul
 * Redigente rilevante_per_ente è sempre FALSE (non ha senso lì); sul
 * Ricevente si rispetta il flag del dataset (una sola riga a TRUE). */
async function inserisciProposta(
  pool: any,
  schema: string,
  scenarioId: number,
  rispettaRilevante: boolean
): Promise<void> {
  for (const r of PROPOSTA) {
    await pool.query(
      `INSERT INTO "${schema}".proposta_creditori
         (scenario_id, categoria_creditore, importo_dovuto, percentuale_offerta, modalita, numero_rate, rango_legale, rilevante_per_ente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        scenarioId,
        r.categoria,
        r.dovuto,
        r.offerta,
        r.modalita,
        r.rate,
        r.rango,
        rispettaRilevante ? r.rilevanteEnte : false,
      ]
    );
  }
}

/** Demo lato REDIGENTE: azienda + scenario "da definire" + proposta. */
async function seedRedigente(pool: any, nomeSchema: string): Promise<void> {
  if (!validaSchema(nomeSchema)) return;
  const azienda = await assicuraAziendaDemo(pool, nomeSchema);
  if (!azienda.creata) return; // già seminato in un avvio precedente

  const sc = await pool.query(
    `INSERT INTO "${nomeSchema}".scenari (azienda_id, nome, stato, tipo_proposta, origine_proposta)
     VALUES ($1, $2, 'BOZZA', 'DA_DEFINIRE', 'Studio') RETURNING id`,
    [azienda.id, 'Piano di risanamento — Meccanica Lombarda S.r.l.']
  );
  await inserisciProposta(pool, nomeSchema, sc.rows[0].id, false);

  console.info(
    `[portable] Demo Redigente pronta: azienda "${AZIENDA_DEMO.ragioneSociale}" + proposta (${PROPOSTA.length} creditori).`
  );
}

/** Demo lato RICEVENTE (ENTE): azienda + tutta la "parte ente"
 * (anagrafica ente, posizione debitoria, limiti di ricevibilità) +
 * scenario "ricevuta" con la proposta e la riga INPS già segnata come
 * rilevante per l'ente. */
async function seedRicevente(pool: any, provision: any, nomeSchema: string): Promise<void> {
  if (!validaSchema(nomeSchema)) return;

  // Le tabelle "ente" non sono create dal provisioning di base: si creano
  // alla prima apertura della relativa sezione. Qui le garantiamo prima
  // di inserirvi i dati (idempotenti).
  await provision.assicuraTabellaDebitiEnte(nomeSchema);
  await provision.assicuraTabelleAnagraficaEnte(nomeSchema);
  await provision.assicuraTabelleParametriSpazio(nomeSchema); // limiti_ricevibilita

  const azienda = await assicuraAziendaDemo(pool, nomeSchema);
  if (!azienda.creata) return; // già seminato in un avvio precedente

  // Anagrafica Ente — etichette (livello spazio) + valori (per azienda).
  for (const c of ANAGRAFICA_CONFIG) {
    await pool.query(
      `INSERT INTO "${nomeSchema}".anagrafica_ente_config (campo, etichetta, attivo)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (campo) DO UPDATE SET etichetta = EXCLUDED.etichetta, attivo = TRUE`,
      [c.campo, c.etichetta]
    );
  }
  await pool.query(
    `INSERT INTO "${nomeSchema}".anagrafica_ente (azienda_id, id_ente, campo_1, campo_2, campo_3, campo_4, campo_5)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (azienda_id) DO NOTHING`,
    [
      azienda.id,
      ANAGRAFICA_VALORI.idEnte,
      ANAGRAFICA_VALORI.campo1,
      ANAGRAFICA_VALORI.campo2,
      ANAGRAFICA_VALORI.campo3,
      ANAGRAFICA_VALORI.campo4,
      ANAGRAFICA_VALORI.campo5,
    ]
  );

  // Posizione debitoria dell'ente (step 0 del percorso Ricevente).
  for (const d of DEBITI_ENTE) {
    await pool.query(
      `INSERT INTO "${nomeSchema}".debiti_ente (azienda_id, voce, importo, tipo, data, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [azienda.id, d.voce, d.importo, d.tipo, d.data, d.note]
    );
  }

  // Criterio di convenienza (art. 63/88 CCII): la proposta è ricevibile se
  // offre non meno del valore stimato in liquidazione. Qui l'offerta INPS
  // (40% di 120.000 = 48.000) supera il valore di liquidazione stimato
  // (30.000): la proposta risulta ricevibile — una demo "che torna".
  await pool.query(
    `INSERT INTO "${nomeSchema}".limiti_ricevibilita
       (categoria_creditore, percentuale_minima, unica_soluzione_ammessa, rateizzazione_ammessa, valore_liquidazione_stimato)
     VALUES ($1, $2, TRUE, TRUE, $3)
     ON CONFLICT (categoria_creditore) DO NOTHING`,
    ['INPS', 30, 30000]
  );

  // Scenario RICEVUTA + proposta ricevuta (riga INPS rilevante per l'ente).
  const sc = await pool.query(
    `INSERT INTO "${nomeSchema}".scenari (azienda_id, nome, stato, tipo_proposta, origine_proposta)
     VALUES ($1, $2, 'IN_CORSO', 'RICEVUTA', 'Azienda') RETURNING id`,
    [azienda.id, 'Proposta ricevuta — Meccanica Lombarda S.r.l.']
  );
  await inserisciProposta(pool, nomeSchema, sc.rows[0].id, true);

  console.info(
    `[portable] Demo Ricevente pronta: azienda + anagrafica ente + posizione debitoria (${DEBITI_ENTE.length} voci) + proposta ricevuta.`
  );
}

/** Semina la demo su entrambi gli spazi. Non blocca mai l'avvio: un
 * errore in questa fase viene loggato ma non propagato (l'app resta
 * perfettamente usabile anche senza i dati di esempio). Disattivabile con
 * PORTABLE_SEED_DEMO=0. */
async function seedDemoPortable(redigente: SpazioCreato, ricevente: SpazioCreato): Promise<void> {
  if ((process.env.PORTABLE_SEED_DEMO || '1') === '0') {
    console.info('[portable] Semina demo disattivata (PORTABLE_SEED_DEMO=0).');
    return;
  }
  const { pool } = await import('@/lib/db');
  const provision = await import('@/db/provision');

  try {
    await seedRedigente(pool, redigente.nomeSchema);
  } catch (e) {
    console.error('[portable] Semina demo Redigente fallita (non blocca l’avvio):', e);
  }
  try {
    await seedRicevente(pool, provision, ricevente.nomeSchema);
  } catch (e) {
    console.error('[portable] Semina demo Ricevente fallita (non blocca l’avvio):', e);
  }
}

export async function bootstrapPortable(): Promise<void> {
  const { assicuraTabelleSpazi, assicuraIndiceAdminSpazio } = await import('@/db/ensureTables');

  await assicuraTabelleSpazi();
  await assicuraIndiceAdminSpazio();

  // Spazio Redigente (professionista che predispone la proposta).
  const redigente: ConfigSpazio = {
    codice: (process.env.PORTABLE_RED_SPACE_CODICE || 'REDIGENTE-LOCALE-2026-001').trim(),
    descrizione: process.env.PORTABLE_RED_SPACE_DESCRIZIONE || 'Redigente (studio che propone)',
    tipoSpazio: 'NON_ENTE',
    admin: {
      nome: process.env.PORTABLE_RED_ADMIN_NOME || 'Admin',
      cognome: process.env.PORTABLE_RED_ADMIN_COGNOME || 'Redigente',
      email: process.env.PORTABLE_RED_ADMIN_EMAIL || 'redigente@locale',
      cellulare: process.env.PORTABLE_RED_ADMIN_CELLULARE || '',
      password: process.env.PORTABLE_RED_ADMIN_PASSWORD || 'redigente1234',
    },
  };

  // Spazio Ricevente (ente creditore che valuta la proposta).
  const ricevente: ConfigSpazio = {
    codice: (process.env.PORTABLE_ENTE_SPACE_CODICE || 'RICEVENTE-LOCALE-2026-001').trim(),
    descrizione: process.env.PORTABLE_ENTE_SPACE_DESCRIZIONE || 'Ricevente (ente che valuta)',
    tipoSpazio: 'ENTE',
    admin: {
      nome: process.env.PORTABLE_ENTE_ADMIN_NOME || 'Admin',
      cognome: process.env.PORTABLE_ENTE_ADMIN_COGNOME || 'Ricevente',
      email: process.env.PORTABLE_ENTE_ADMIN_EMAIL || 'ricevente@locale',
      cellulare: process.env.PORTABLE_ENTE_ADMIN_CELLULARE || '',
      password: process.env.PORTABLE_ENTE_ADMIN_PASSWORD || 'ricevente1234',
    },
  };

  // Le due email devono essere diverse: admin_spazio_index.email è la
  // chiave del login ed è unica su tutta l'istanza. Se coincidono, il
  // secondo spazio non avrebbe un login proprio.
  if (redigente.admin.email.trim().toLowerCase() === ricevente.admin.email.trim().toLowerCase()) {
    throw new Error(
      '[portable] Le email di Redigente e Ricevente coincidono: servono due login distinti (una email per ciascuno spazio).'
    );
  }

  // Ordine deliberato: prima il Redigente, poi il Ricevente. Sono
  // indipendenti; creaSpazioPortable è idempotente per codice.
  const redCreato = await creaSpazioPortable(redigente);
  const enteCreato = await creaSpazioPortable(ricevente);

  console.info(
    `[portable] Due spazi pronti — Redigente: ${redigente.admin.email} | Ricevente: ${ricevente.admin.email}`
  );

  // Demo coerente sui due lati (stessa azienda; parte ente completa sul
  // Ricevente). Non blocca l'avvio in caso di errore.
  await seedDemoPortable(redCreato, enteCreato);
}
