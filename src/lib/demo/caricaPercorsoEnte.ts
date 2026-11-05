// src/lib/demo/caricaPercorsoEnte.ts
//
// CARICAMENTO DEL PERCORSO DEMO (0.172.0).
//
// Scrive nel database di uno spazio appena creato le tre posizioni descritte
// in percorsoEnte.ts: anagrafica, posizione debitoria, scheda soglie,
// bilancio XBRL, screening già risposto e scenario aperto. È il percorso
// completo che l'utente vede, non un riempitivo: ogni riga è quella che il
// prodotto leggerebbe se il lavoro fosse stato fatto a mano.
//
// PERCHÉ QUI E NON IN UNA SERVER ACTION. Il caricamento avviene dentro
// creaSpazioAction, quando non esiste ancora una sessione di spazio: non c'è
// un utente a cui chiedere l'autorizzazione, ma un Superadmin che ha appena
// creato il tenant. La guardia resta nella server action; questo modulo è
// chiamato solo da lì.
//
// IDEMPOTENZA. Si riconosce un'azienda dalla ragione sociale: se c'è già, non
// la si duplica e non si toccano i suoi dati. Serve se il caricamento viene
// ripetuto dopo un errore parziale o se lo stesso schema viene riprocessato.
//
// SOLO DATI INVENTATI E RICONOSCIBILI. Ragioni sociali con «Demo», codici
// fiscali fittizi, PEC su dominio «esempio.it». Nessun dato di imprese reali.

import { pool } from '@/lib/db';
import {
  assicuraTabellaAziende,
  assicuraTabellaDebitiEnte,
  assicuraTabellaXbrlAzienda,
  assicuraTabelleParametriSpazio,
  assicuraTabelleScenari,
  assicuraTabelleScenariTriage,
  assicuraTabelleScreeningAzienda,
} from '@/db/provision';
import { ripristinaConfigurazione } from '@/lib/configurazioneSpazio/configurazione';
import {
  DIRETTRICI_DEMO,
  PERCORSO_DEMO,
  bundleDemo,
  type AziendaPercorsoDemo,
} from './percorsoEnte';
import { PARAMETRI_DEMO } from './parametriEnte';
import { documentiProvvedimentoDemo } from './documenti';
import { confrontaProvvedimento } from '@/lib/giudice/confronto';
import type { LetturaProvvedimento, TipoAttoGiudice } from '@/lib/giudice/lettura';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

type Esecutore = {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface EsitoPercorsoDemo {
  creati: number;
  esistenti: number;
}

/**
 * Applica i parametri dello spazio demo in una sola transazione.
 *
 * `ripristinaConfigurazione` sostituisce le tabelle che il file contiene:
 * è voluto, perché la demo deve nascere con le soglie e le ipotesi di
 * scenario dell'export, non con valori casuali ereditati. Le tabelle non
 * incluse nel file restano invece intatte.
 */
async function applicaParametriDemo(nomeSchema: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const esito = await ripristinaConfigurazione(
      async (sql, params) => (await client.query(sql, params)).rows,
      nomeSchema,
      PARAMETRI_DEMO
    );
    if (esito.tabelle.length === 0) {
      throw new Error('Nessuna tabella di parametri demo applicata.');
    }
    await client.query('COMMIT');
  } catch (errore) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }
}

async function inserisciAzienda(
  esegui: Esecutore,
  nomeSchema: string,
  a: AziendaPercorsoDemo
): Promise<number> {
  const r = await esegui.query(
    `INSERT INTO "${nomeSchema}".aziende
       (ragione_sociale, codice_fiscale, partita_iva, codice_ateco, forma_giuridica,
        indirizzo_sede_legale, citta, provincia, cap, capitale_sociale,
        rappresentante_legale, ruolo_rappresentante_legale, numero_rea, pec,
        anno_costituzione, in_verifica, verifica_esito, verifica_eseguita_il,
        verifica_riferita_al, con_lavoratori_subordinati, contributi_scaduti,
        contributi_dovuti_anno_precedente, anno_contributi_dovuti, volume_affari,
        ritardo_oltre_90_giorni, periodi_in_ritardo, soglie_aggiornate_al)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             FALSE, 'PROSEGUI', now(), $16, $17, $18, $19, $20, $21, $22, $23, $16)
     RETURNING id`,
    [
      a.ragioneSociale,
      a.codiceFiscale,
      a.partitaIva,
      a.codiceAteco,
      a.formaGiuridica,
      a.indirizzo,
      a.citta,
      a.provincia,
      a.cap,
      a.capitaleSociale,
      a.rappresentante,
      a.ruoloRappresentante,
      a.numeroRea,
      a.pec,
      a.annoCostituzione,
      a.dataVerifica,
      a.soglie.conLavoratori,
      a.soglie.contributiScaduti,
      a.soglie.contributiDovutiAnnoPrecedente,
      a.soglie.annoContributiDovuti,
      a.soglie.volumeAffari,
      a.soglie.ritardoOltre90Giorni,
      a.soglie.periodiInRitardo,
    ]
  );
  return Number(r.rows[0].id);
}

async function inserisciBilancio(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo,
  periodo: 'corrente' | 'precedente'
): Promise<void> {
  const anno = periodo === 'corrente' ? a.finanziario.anno : a.finanziario.anno - 1;
  const bundle = bundleDemo(a, periodo);
  await esegui.query(
    `INSERT INTO "${nomeSchema}".xbrl_storico_azienda
       (azienda_id, anno_bilancio, nome_file, dati_finanziari, indici,
        altri_indici, situazione_debitoria, severity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (azienda_id, anno_bilancio) DO NOTHING`,
    [
      aziendaId,
      anno,
      `bilancio-demo-${anno}.xbrl`,
      JSON.stringify(a.finanziario[periodo]),
      JSON.stringify(bundle.indici),
      JSON.stringify(bundle.altriIndici),
      JSON.stringify(bundle.situazioneDebitoria),
      bundle.severity,
    ]
  );
}

async function inserisciScreening(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<void> {
  await esegui.query(
    `INSERT INTO "${nomeSchema}".azienda_screening
       (azienda_id, direttrici_usate, sezioni, relazione_testo,
        relazione_generata_il, nome_file_visura, visura_fatti, visura_impronta,
        generato_il, origine)
     VALUES ($1,$2,$3,$4, now(), $5, $6, $7, now(), 'MANUALE')
     ON CONFLICT (azienda_id) DO NOTHING`,
    [
      aziendaId,
      DIRETTRICI_DEMO.map((d) => d.nome).join(', '),
      JSON.stringify(a.screening.sezioni),
      a.screening.relazione,
      `visura-demo-${a.codiceFiscale}.pdf`,
      JSON.stringify(a.visura),
      `demo-${a.codiceFiscale}`,
    ]
  );

  for (const r of a.screening.risposte) {
    await esegui.query(
      `INSERT INTO "${nomeSchema}".azienda_screening_risposte
         (azienda_id, domanda_id, risposta, note, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (azienda_id, domanda_id) DO NOTHING`,
      [aziendaId, r.domandaId, r.risposta, r.note]
    );
  }
}

async function inserisciPosizioni(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<void> {
  for (const d of a.debiti) {
    await esegui.query(
      `INSERT INTO "${nomeSchema}".debiti_ente
         (azienda_id, voce, importo, tipo, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [aziendaId, d.voce, d.importo, d.tipo, d.nota ?? 'posizione del percorso demo']
    );
  }

  await esegui.query(
    `INSERT INTO "${nomeSchema}".triage_scenario (azienda_id, rango, aggiornato_il)
     VALUES ($1,$2, now())
     ON CONFLICT (azienda_id) DO UPDATE SET rango = EXCLUDED.rango, aggiornato_il = now()`,
    [aziendaId, a.rango]
  );
}

async function inserisciScenario(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<number> {
  const r = await esegui.query(
    `INSERT INTO "${nomeSchema}".scenari
       (azienda_id, nome, stato, tipo_proposta, origine_proposta,
        tipo_istruttoria, data_deposito_proposta)
     VALUES ($1,$2,'IN_CORSO','RICEVUTA','Ente',$3,$4)
     RETURNING id`,
    [aziendaId, a.scenario, a.tipoIstruttoria, a.dataDepositoProposta]
  );
  return Number(r.rows[0].id);
}

/**
 * Aggiorna lo scenario demo già esistente, senza duplicarlo.
 *
 * La 0.173.x lo aveva creato sempre come «proposta»; ora i tre percorsi sono
 * distinti. Si riconosce il vecchio nome e lo si rinomina: uno scenario
 * creato a mano dall'utente con un altro nome non viene toccato, e se non
 * esiste alcuno scenario demo se ne crea uno.
 */
async function aggiornaScenarioDemo(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<number> {
  const vecchio = a.scenarioPrecedente ?? a.scenario;
  const trovato = await esegui.query(
    `SELECT id FROM "${nomeSchema}".scenari
      WHERE azienda_id = $1 AND nome IN ($2, $3)
      ORDER BY id ASC LIMIT 1`,
    [aziendaId, a.scenario, vecchio]
  );
  if (trovato.rows.length === 0) return inserisciScenario(esegui, nomeSchema, aziendaId, a);
  const id = Number(trovato.rows[0].id);
  await esegui.query(
    `UPDATE "${nomeSchema}".scenari
        SET nome = $2,
            tipo_istruttoria = CASE WHEN $5 THEN tipo_istruttoria ELSE $3 END,
            data_deposito_proposta = $4
      WHERE id = $1`,
    [id, a.scenario, a.tipoIstruttoria, a.dataDepositoProposta, Boolean(a.aperta)]
  );
  return id;
}

function letturaProvvedimentoDemo(
  a: AziendaPercorsoDemo,
  tipo: 'DECRETO_LIQUIDAZIONE' | 'CRAM_DOWN'
): LetturaProvvedimento {
  const chirografario = tipo === 'CRAM_DOWN';
  const cantieri = a.ragioneSociale === 'Cantieri Brianza Demo S.r.l.';
  const file = cantieri
    ? chirografario
      ? 'dispositivo-cram-down-cantieri-brianza.pdf'
      : 'decreto-liquidazione-cantieri-brianza.pdf'
    : chirografario
      ? 'dispositivo-cram-down-logistica-padana.pdf'
      : 'decreto-liquidazione-tessitura-lario.pdf';
  const contributi = cantieri ? (chirografario ? 51_000 : 48_000) : chirografario ? 10_000 : 72_000;
  const sanzioni = cantieri ? (chirografario ? 8_500 : 8_000) : chirografario ? 1_000 : 8_000;
  return {
    crediti: [
      {
        voce: 'Contributi previdenziali scaduti',
        importo: contributi,
        rango: 'PRIVILEGIATO',
        privilegio: 'Privilegio generale previdenziale',
        percentualeRealizzo: cantieri ? (chirografario ? 85 : 32) : chirografario ? 50 : 30.5,
        documento: file,
        passo: 'Crediti ammessi',
      },
      {
        voce: 'Sanzioni civili contributive',
        importo: sanzioni,
        rango: 'CHIROGRAFARIO',
        privilegio: null,
        percentualeRealizzo: cantieri ? (chirografario ? 85 : 8) : chirografario ? 20 : 6.4,
        documento: file,
        passo: 'Crediti ammessi',
      },
    ],
    speseProceduraPct: cantieri ? (chirografario ? 12 : 18) : chirografario ? 15 : 20,
    tempiMesi: cantieri ? (chirografario ? 18 : 30) : chirografario ? 24 : 36,
    dataAtto: cantieri ? '2026-11-03' : chirografario ? '2026-10-30' : '2026-10-20',
    note: [
      'Documento dimostrativo: crediti, percentuali e tempi sono fittizi.',
      'La lettura è già predisposta nella demo e non richiede una chiamata AI.',
    ],
  };
}

async function inserisciIstruttoriaDemo(
  esegui: Esecutore,
  nomeSchema: string,
  scenarioId: number,
  a: AziendaPercorsoDemo,
  tipoAtto?: 'DECRETO_LIQUIDAZIONE' | 'CRAM_DOWN'
): Promise<void> {
  const tipo = tipoAtto ?? a.tipoIstruttoria;
  if (tipo !== 'DECRETO_LIQUIDAZIONE' && tipo !== 'CRAM_DOWN') return;
  const documenti = documentiProvvedimentoDemo(a.codiceFiscale, tipo).map((d) => ({
    nome: d.nome,
    url: d.percorso,
  }));
  if (documenti.length === 0) return;
  const lettura = letturaProvvedimentoDemo(a, tipo);
  const confronto = confrontaProvvedimento(
    a.debiti.map((d) => ({ voce: d.voce, importo: d.importo })),
    lettura,
    tipo
  );
  const relazione = a.aperta
    ? `La variante ${tipo === 'DECRETO_LIQUIDAZIONE' ? 'della liquidazione giudiziale' : 'del cram down'} riconosce all'ente ${lettura.crediti[0].importo.toLocaleString('it-IT')} euro sui ${a.debiti[0].importo.toLocaleString('it-IT')} a ruolo per i contributi previdenziali e ${lettura.crediti[1].importo.toLocaleString('it-IT')} euro sui ${a.debiti[1].importo.toLocaleString('it-IT')} per le sanzioni. È una lettura dimostrativa: la scelta del percorso resta aperta e va confermata sui documenti che l'azienda depositerà.`
    : tipo === 'DECRETO_LIQUIDAZIONE'
      ? `Il decreto di liquidazione giudiziale riconosce all'ente 72.000 euro sui 80.000 a ruolo per i contributi previdenziali e 8.000 euro sui 12.000 per le sanzioni, con realizzo previsto rispettivamente del 30,5% e del 6,4%. La minore ammissione è di 12.000 euro; la perdita complessiva, al netto del recupero atteso e delle spese di procedura, resta un elemento da verificare. Le difformità segnalate riguardano l'importo ammesso e il rango del credito per sanzioni: sono elementi che possono fondare un approfondimento, non una qualificazione giuridica.`
      : `Il dispositivo di cram down riconosce all'ente 10.000 euro sui 12.000 a ruolo per i contributi previdenziali e 1.000 euro sugli 1.500 per le sanzioni, con soddisfacimento rispettivamente del 50% e del 20%. La minore ammissione è di 2.500 euro; il recupero atteso e la perdita sono calcolati sui dati del dispositivo. Le difformità sono contenute, ma il credito per sanzioni merita una verifica sul rango e sulla percentuale applicata. Questa è un'analisi tecnica dimostrativa, non un parere legale.`;
  await esegui.query(
    `INSERT INTO "${nomeSchema}".istruttoria_giudice
       (scenario_id, documenti, lettura, confronto, relazione, lettura_il, generata_il)
     VALUES ($1,$2,$3,$4,$5, now(), now())
     ON CONFLICT (scenario_id) DO UPDATE SET
       documenti = $2, lettura = $3, confronto = $4, relazione = $5,
       lettura_il = now(), generata_il = now()`,
    [
      scenarioId,
      JSON.stringify(documenti),
      JSON.stringify(lettura),
      JSON.stringify(confronto),
      relazione,
    ]
  );
}

/**
 * Carica il percorso demo nello schema indicato.
 *
 * Restituisce quante aziende sono state create e quante erano già presenti.
 * Non cancella mai righe esistenti.
 */
export async function caricaPercorsoDemoEnte(
  nomeSchema: string,
  opzioni: { soloPercorsi?: boolean } = {}
): Promise<EsitoPercorsoDemo> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');

  // Le tabelle nascono a runtime come per qualunque spazio: qui si portano
  // avanti tutte quelle che il percorso tocca, prima di scrivere una riga.
  await assicuraTabellaAziende(nomeSchema);
  await assicuraTabellaXbrlAzienda(nomeSchema);
  await assicuraTabelleScreeningAzienda(nomeSchema);
  await assicuraTabellaDebitiEnte(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);
  await assicuraTabelleScenariTriage(nomeSchema);

  // Il riallineamento dei soli percorsi (usato quando si apre la pagina
  // Scenari di una demo già attiva) non deve riscrivere i parametri che
  // l'utente può aver modificato: aggiorna nomi, tipi e la quarta azienda.
  if (!opzioni.soloPercorsi) {
    await assicuraTabelleParametriSpazio(nomeSchema);

    // I parametri che fanno funzionare triage, screening e scenario: soglie,
    // riscontro della proposta, ipotesi per rango e schede XBRL. Vengono
    // applicati prima delle aziende, così la fotografia nasce già leggibile.
    await applicaParametriDemo(nomeSchema);

    // Le direttrici dello spazio: senza, lo screening si aprirebbe con le
    // domande ma senza il quadro che le pesa. Si scrivono solo se lo spazio non
    // ne ha già (uno spazio demo nasce vuoto, ma la regola vale anche in caso
    // di riesecuzione).
    await pool.query(
      `UPDATE public.spazi SET direttrici_ente_strutturate = $1::jsonb
        WHERE nome_schema = $2
          AND (direttrici_ente_strutturate IS NULL
               OR direttrici_ente_strutturate = '[]'::jsonb)`,
      [JSON.stringify(DIRETTRICI_DEMO), nomeSchema]
    );
  }

  const nomi = PERCORSO_DEMO.map((a) => a.ragioneSociale);
  const presenti = await pool.query(
    `SELECT id, ragione_sociale FROM "${nomeSchema}".aziende WHERE ragione_sociale = ANY($1::text[])`,
    [nomi]
  );
  const perNome = new Map(
    presenti.rows.map((r) => [String(r.ragione_sociale), Number(r.id)] as const)
  );
  const esistenti = perNome.size;

  const client = await pool.connect();
  let creati = 0;
  try {
    await client.query('BEGIN');
    for (const a of PERCORSO_DEMO) {
      let aziendaId = perNome.get(a.ragioneSociale);
      if (!aziendaId) {
        aziendaId = await inserisciAzienda(client, nomeSchema, a);
        await inserisciBilancio(client, nomeSchema, aziendaId, a, 'corrente');
        await inserisciBilancio(client, nomeSchema, aziendaId, a, 'precedente');
        await inserisciScreening(client, nomeSchema, aziendaId, a);
        await inserisciPosizioni(client, nomeSchema, aziendaId, a);
        creati += 1;
      }
      // Anche sulle aziende già presenti si riallinea lo scenario: la demo
      // della 0.173.x ne aveva uno solo, sempre «proposta». Riapplicare il
      // percorso deve aggiornare il tipo senza duplicare lo scenario né
      // toccare le aziende estranee al set demo.
      const scenarioId =
        aziendaId && perNome.has(a.ragioneSociale)
          ? await aggiornaScenarioDemo(client, nomeSchema, aziendaId, a)
          : await inserisciScenario(client, nomeSchema, aziendaId!, a);
      await inserisciIstruttoriaDemo(client, nomeSchema, scenarioId, a);
    }
    await client.query('COMMIT');
  } catch (errore) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }

  return { creati, esistenti };
}

/**
 * Prepara la valutazione della quarta azienda dopo che l'utente ha scelto il
 * percorso. La scelta è il gesto che rende «aperta» la demo: fino a quel
 * momento non esiste un'istruttoria preconfezionata, poi la piattaforma
 * costruisce il confronto adatto all'atto scelto.
 *
 * Restituisce false quando lo scenario non è quello aperto: il chiamante può
 * continuare con il comportamento normale senza trattare il caso demo.
 */
export async function preparaValutazioneApertaDemo(
  nomeSchema: string,
  scenarioId: number,
  tipo: TipoAttoGiudice
): Promise<boolean> {
  if (!schemaOk(nomeSchema)) return false;
  const r = await pool.query(
    `SELECT a.ragione_sociale, sp.demo
       FROM "${nomeSchema}".scenari s
       JOIN "${nomeSchema}".aziende a ON a.id = s.azienda_id
       JOIN public.spazi sp ON sp.nome_schema = $1
      WHERE s.id = $2`,
    [nomeSchema, scenarioId]
  );
  if (!r.rows[0]?.demo) return false;
  const a = PERCORSO_DEMO.find(
    (x) => x.aperta && x.ragioneSociale === String(r.rows[0].ragione_sociale)
  );
  if (!a) return false;
  if (tipo === 'PROPOSTA') return true;
  if (tipo !== 'DECRETO_LIQUIDAZIONE' && tipo !== 'CRAM_DOWN') return true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await inserisciIstruttoriaDemo(client, nomeSchema, scenarioId, a, tipo);
    await client.query('COMMIT');
  } catch (errore) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }
  return true;
}

/**
 * Acquisisce nel prospetto dello SCENARIO le righe della certificazione dei
 * debiti demo.
 *
 * PERCHÉ SERVE. Il caricamento simulato applicava il file al campo, ma la
 * pagina della Posizione Debitoria restava vuota: le righe del percorso demo
 * erano ferme a livello azienda e nessuno le portava nello scenario. La
 * schermata mostrava la fine del caricamento e poi il nulla, che è peggio di
 * una simulazione dichiarata.
 *
 * Le righe vengono COPIATE, non spostate: l'azienda conserva la sua
 * certificazione e un altro scenario può riprenderla. Se lo scenario ha già
 * una posizione, l'operazione non aggiunge duplicati e lo dichiara.
 *
 * La funzione è riservata agli spazi demo: il chiamante verifica comunque
 * l'accesso all'azienda e allo scenario nella server action.
 */
export interface EsitoAcquisizionePosizioneDemo {
  righe: number;
  totale: number;
  giaPresenti: boolean;
}

export async function acquisisciPosizioneDebitoriaDemoEnte(
  nomeSchema: string,
  aziendaId: number,
  scenarioId: number
): Promise<EsitoAcquisizionePosizioneDemo> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');

  const contesto = await pool.query(
    `SELECT a.ragione_sociale, sp.demo
       FROM "${nomeSchema}".scenari s
       JOIN "${nomeSchema}".aziende a ON a.id = s.azienda_id
       JOIN public.spazi sp ON sp.nome_schema = $1
      WHERE s.id = $2 AND a.id = $3`,
    [nomeSchema, scenarioId, aziendaId]
  );
  const riga = contesto.rows[0];
  if (!riga) throw new Error('Scenario non trovato per questa azienda.');
  if (!riga.demo) {
    throw new Error('L’acquisizione demo è disponibile solo negli spazi demo.');
  }
  const azienda = PERCORSO_DEMO.find((a) => a.ragioneSociale === String(riga.ragione_sociale));
  if (!azienda) throw new Error('Questa azienda non fa parte del percorso demo.');

  await assicuraTabellaDebitiEnte(nomeSchema);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const esistenti = await client.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(importo), 0) AS totale
         FROM "${nomeSchema}".debiti_ente
        WHERE scenario_id = $1 AND azienda_id = $2`,
      [scenarioId, aziendaId]
    );
    const gia = Number(esistenti.rows[0]?.n ?? 0);
    if (gia > 0) {
      await client.query('COMMIT');
      return {
        righe: gia,
        totale: Number(esistenti.rows[0]?.totale ?? 0),
        giaPresenti: true,
      };
    }

    // Prima scelta: le righe che il percorso demo ha già caricato a livello
    // azienda (conservano eventuali note e correzioni). Se non ci sono,
    // perché uno scenario precedente le ha già riprese, si ricostruisce la
    // certificazione dai dati demo.
    const copiate = await client.query(
      `INSERT INTO "${nomeSchema}".debiti_ente
         (azienda_id, scenario_id, voce, importo, importo_versato, tipo, note, data,
          dati_extra, tracciato_id, codice_guida, documento_id)
       SELECT azienda_id, $2, voce, importo, importo_versato, tipo, note, data,
              dati_extra, tracciato_id, codice_guida, documento_id
         FROM "${nomeSchema}".debiti_ente
        WHERE azienda_id = $1 AND scenario_id IS NULL
        ORDER BY id ASC
       RETURNING importo`,
      [aziendaId, scenarioId]
    );
    // `RETURNING` è la fonte del conteggio: `rowCount` non è uguale in tutti
    // i driver Postgres, mentre le righe restituite ci sono sempre.
    let righe = copiate.rows.length;
    let totale = copiate.rows.reduce((somma, r) => somma + Number(r.importo), 0);

    if (righe === 0) {
      for (const d of azienda.debiti) {
        await client.query(
          `INSERT INTO "${nomeSchema}".debiti_ente
             (azienda_id, scenario_id, voce, importo, tipo, note)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            aziendaId,
            scenarioId,
            d.voce,
            d.importo,
            d.tipo,
            'Certificazione demo dei debiti — dato fittizio',
          ]
        );
        righe += 1;
        totale += d.importo;
      }
    }

    await client.query('COMMIT');
    return { righe, totale, giaPresenti: false };
  } catch (errore) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }
}
