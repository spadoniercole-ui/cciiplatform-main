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
import {
  DIRETTRICI_DEMO,
  PERCORSO_DEMO,
  bundleDemo,
  type AziendaPercorsoDemo,
} from './percorsoEnte';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

type Esecutore = {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface EsitoPercorsoDemo {
  creati: number;
  esistenti: number;
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
): Promise<void> {
  await esegui.query(
    `INSERT INTO "${nomeSchema}".scenari
       (azienda_id, nome, stato, tipo_proposta, origine_proposta,
        tipo_istruttoria, data_deposito_proposta)
     VALUES ($1,$2,'IN_CORSO','RICEVUTA','Ente','PROPOSTA',$3)`,
    [aziendaId, a.scenario, a.dataDepositoProposta]
  );
}

/**
 * Carica il percorso demo nello schema indicato.
 *
 * Restituisce quante aziende sono state create e quante erano già presenti.
 * Non cancella mai righe esistenti.
 */
export async function caricaPercorsoDemoEnte(nomeSchema: string): Promise<EsitoPercorsoDemo> {
  if (!schemaOk(nomeSchema)) throw new Error('Nome schema non valido.');

  // Le tabelle nascono a runtime come per qualunque spazio: qui si portano
  // avanti tutte quelle che il percorso tocca, prima di scrivere una riga.
  await assicuraTabellaAziende(nomeSchema);
  await assicuraTabellaXbrlAzienda(nomeSchema);
  await assicuraTabelleScreeningAzienda(nomeSchema);
  await assicuraTabellaDebitiEnte(nomeSchema);
  await assicuraTabelleScenari(nomeSchema);
  await assicuraTabelleScenariTriage(nomeSchema);
  await assicuraTabelleParametriSpazio(nomeSchema);

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

  // La soglia dell'ente di riferimento: senza una riga con `ente_25novies`,
  // il triage non sa quale soglia applicare e ogni posizione finirebbe in
  // «approfondimenti necessari». La riga INPS è quella che rende leggibile il
  // semaforo; non sovrascrive una configurazione già presente.
  await pool.query(
    `INSERT INTO "${nomeSchema}".limiti_ricevibilita
       (categoria_creditore, percentuale_minima, unica_soluzione_ammessa,
        rateizzazione_ammessa, ente_25novies, note)
     VALUES ('INPS', 0, TRUE, TRUE, 'INPS', $1)
     ON CONFLICT (categoria_creditore) DO UPDATE
       SET ente_25novies = COALESCE("${nomeSchema}".limiti_ricevibilita.ente_25novies, EXCLUDED.ente_25novies)`,
    ['Configurazione demo: soglia di segnalazione dell’ente di riferimento.']
  );

  const nomi = PERCORSO_DEMO.map((a) => a.ragioneSociale);
  const presenti = await pool.query(
    `SELECT ragione_sociale FROM "${nomeSchema}".aziende WHERE ragione_sociale = ANY($1::text[])`,
    [nomi]
  );
  const esistenti = new Set(presenti.rows.map((r) => String(r.ragione_sociale)));
  const mancanti = PERCORSO_DEMO.filter((a) => !esistenti.has(a.ragioneSociale));

  if (mancanti.length === 0) {
    return { creati: 0, esistenti: esistenti.size };
  }

  const client = await pool.connect();
  let creati = 0;
  try {
    await client.query('BEGIN');
    for (const a of mancanti) {
      const aziendaId = await inserisciAzienda(client, nomeSchema, a);
      await inserisciBilancio(client, nomeSchema, aziendaId, a, 'corrente');
      await inserisciBilancio(client, nomeSchema, aziendaId, a, 'precedente');
      await inserisciScreening(client, nomeSchema, aziendaId, a);
      await inserisciPosizioni(client, nomeSchema, aziendaId, a);
      await inserisciScenario(client, nomeSchema, aziendaId, a);
      creati += 1;
    }
    await client.query('COMMIT');
  } catch (errore) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw errore;
  } finally {
    client.release();
  }

  return { creati, esistenti: esistenti.size };
}
