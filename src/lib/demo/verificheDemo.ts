// src/lib/demo/verificheDemo.ts
//
// LE VERIFICHE DELLA DEMO (0.230.0): amministrativa, contabile, aziendale.
//
// Sta in un modulo a sé perché la demo non è un dato qualsiasi: è il posto in
// cui si vede come il sistema è fatto. E il sistema, oggi, dice questo:
//
//  - la verifica amministrativa è OBBLIGATORIA: c'è su ogni azienda, perché è
//    quella che dice quanto l'ente vanta;
//  - la contabile e l'aziendale sono FACOLTATIVE: un'azienda può averne solo
//    una, o nessuna delle due, e il documento lo dichiara invece di inventare
//    una sezione;
//  - la natura dell'atto (accordo, liquidazione, cram down) sta sullo
//    SCENARIO, non sull'azienda: cambiare atto non azzera le verifiche, e la
//    stessa azienda può valutare due atti con le stesse verifiche già fatte.
//
// Il seed scrive esattamente questo, ed è idempotente: le verifiche non si
// sovrascrivono e gli scenari aggiuntivi non si duplicano.

import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import { snapshotDebitoEnteDaPosizioni } from '@/lib/debitiEnte/debitoEnte';
import { fascicoloDemoPerCodiceFiscale } from './documenti';
import type { AziendaPercorsoDemo } from './percorsoEnte';

type Esecutore = {
  query: (sql: string, valori?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * LE TRE VERIFICHE DELLA DEMO (0.230.0).
 *
 * La demo caricava azienda, bilanci, screening, posizioni e scenario — ma
 * nessuna delle tre verifiche era eseguita: la scheda dello scenario le
 * mostrava tutte da fare. Con l’impostazione attuale la verifica
 * amministrativa è obbligatoria (è quella che dice quanto l’ente vanta), la
 * contabile e l’aziendale sono facoltative, e la natura dell’atto sta sullo
 * scenario. Il seed si adegua:
 *
 *  - `verifica_amministrativa_il` si scrive su OGNI scenario dell’azienda: le
 *    verifiche sono dell’azienda, e cambiare atto non le azzera;
 *  - `verifica_contabile_il` solo dove la contabile è prevista;
 *  - la verifica aziendale è una simulazione salvata, una per azienda: la si
 *    scrive solo se non ce n’è già una, così una simulazione rifatta a mano
 *    non viene sovrascritta.
 */
export async function inserisciVerificheDemo(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo,
  scenarioId: number,
  tipoScenario: string
): Promise<void> {
  const contabile = a.verifiche?.contabile !== false;
  const aziendale = a.verifiche?.aziendale !== false;

  await esegui.query(
    `UPDATE "${nomeSchema}".scenari
        SET verifica_amministrativa_il = COALESCE(verifica_amministrativa_il, $2::timestamp),
            verifica_contabile_il = CASE WHEN $3 THEN COALESCE(verifica_contabile_il, $2::timestamp) ELSE verifica_contabile_il END
      WHERE id = $1`,
    [scenarioId, `${a.dataVerifica}T09:00:00`, contabile]
  );
  if (!aziendale) return;

  const presente = await esegui.query(
    `SELECT 1 FROM "${nomeSchema}".verifica_azienda_simulazioni WHERE azienda_id = $1 LIMIT 1`,
    [aziendaId]
  );
  if (presente.rows.length > 0) return;

  const debitoEnte = a.debiti.reduce((t, d) => t + d.importo, 0);
  // La verifica aziendale è la fotografia del prospetto (0.240.0): la base
  // della demo porta le due annualità depositate, non una proiezione.
  const esito = {
    colonne: [
      { anno: a.finanziario.anno - 1, dati: a.finanziario.precedente },
      { anno: a.finanziario.anno, dati: a.finanziario.corrente },
    ].map((x) => {
      const bundle = costruisciBundleIndici(x.dati);
      return {
        anno: x.anno,
        tipo: 'STORICO' as const,
        dati: x.dati,
        indici: bundle.indici,
        altriIndici: bundle.altriIndici,
        severity: bundle.severity,
      };
    }),
  };
  if (esito.colonne.length === 0) return;

  await esegui.query(
    `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
       (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
        crescita_applicata_pct, colonne, avvertenze, base_per_proposta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      aziendaId,
      'FOTOGRAFIA',
      esito.colonne.length,
      debitoEnte,
      null,
      0,
      JSON.stringify(esito.colonne),
      JSON.stringify([]),
      // La base è quella dichiarata dall'azienda; se non lo è, vale la natura
      // dello scenario: l'accordo si appoggia alla proiezione.
      a.verifiche?.baseAziendale ?? tipoScenario === 'PROPOSTA',
    ]
  );
}

/**
 * IL CORREDO DELLA CONTABILE (0.255.0).
 *
 * Visura storica e parametri dell'ente: le due cose che rendono «completa» la
 * verifica contabile oltre ai bilanci. La visura è il fascicolo demo della
 * stessa azienda (un file statico con la filigrana DEMO, come i provvedimenti),
 * quindi non serve caricare niente e il seed funziona uguale in cloud, in
 * portable e nei test.
 *
 * Idempotente: una visura già acquisita e dei parametri già compilati
 * restano quelli. Il seed non riscrive un lavoro fatto a mano.
 */
export async function inserisciCorredoContabileDemo(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<void> {
  const corredo = a.verifiche?.corredoContabile;
  if (!corredo) return;

  const fascicolo = fascicoloDemoPerCodiceFiscale(a.codiceFiscale);
  if (fascicolo) {
    await esegui.query(
      `UPDATE "${nomeSchema}".aziende
          SET visura_triage_url = COALESCE(visura_triage_url, $2),
              visura_triage_nome = COALESCE(visura_triage_nome, $3),
              visura_triage_il = COALESCE(visura_triage_il, $4::timestamp)
        WHERE id = $1`,
      [aziendaId, fascicolo.percorso, fascicolo.nome, `${a.dataVerifica}T09:00:00`]
    );
  }

  const campi = corredo.campi.slice(0, 10);
  const colonne = ['azienda_id', 'id_ente', ...campi.map((_, i) => `campo_${i + 1}`)];
  const segnaposti = colonne.map((_, i) => `$${i + 1}`).join(', ');
  await esegui.query(
    `INSERT INTO "${nomeSchema}".anagrafica_ente (${colonne.join(', ')})
     VALUES (${segnaposti})
     ON CONFLICT (azienda_id) DO NOTHING`,
    [aziendaId, corredo.idEnte, ...campi]
  );
}

/**
 * IL DEBITO MEMORIZZATO DALLA VERIFICA AMMINISTRATIVA (0.255.0).
 *
 * La demo dichiarava la verifica amministrativa «fatta» ma non memorizzava la
 * cifra: ogni ritratto diceva «nessun debito memorizzato», e la contabile non
 * trovava il debito dell'ente per il ponte. Il numero è la somma delle
 * posizioni demo dell'azienda, con contributi e sanzioni distinti come li
 * distingue la certificazione.
 *
 * La fonte dichiarata sono le posizioni dell'ente: la demo non ha una
 * certificazione per queste posizioni, e il campo «ripartito» resta falso —
 * una posizione non separa contabilizzato e da contabilizzare. Meglio dirlo che
 * mostrare uno zero che sembra una misura.
 *
 * Idempotente: una cifra già memorizzata non si sovrascrive.
 */
export async function inserisciDebitoMemorizzatoDemo(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<void> {
  // La stessa lettura che fa il prodotto quando riallinea la verifica: così
  // la cifra del seed e quella che l'app ricaverebbe sono identiche, e
  // risalvare l'esito non la cancella.
  const debito = snapshotDebitoEnteDaPosizioni(a.debiti);
  if (!debito) return;

  await esegui.query(
    `INSERT INTO "${nomeSchema}".debiti_ente_memorizzati
       (azienda_id, totale, contabilizzato, da_contabilizzare, segnalato, contributi,
        sanzioni, crediti_agente, righe, righe_segnalate, ripartito,
        sanzioni_non_distinte, fonte, fonte_tipo, memorizzato_il)
     VALUES ($1,$2,0,0,0,$3,$4,0,$5,0,FALSE,FALSE,$6,'posizioni',$7::timestamp)
     ON CONFLICT (azienda_id) DO NOTHING`,
    [
      aziendaId,
      debito.totale,
      debito.contributi,
      debito.sanzioni,
      debito.righe,
      debito.fonte,
      `${a.dataVerifica}T09:00:00`,
    ]
  );
}

/**
 * Gli scenari aggiuntivi dell’azienda demo (0.230.0). Si riconosce lo scenario
 * dal nome: se esiste non lo si tocca né si duplica; se non c’è, nasce in
 * corso, con la sua natura e senza istruttoria — i documenti dell’atto li
 * porta l’operatore, e la demo non finge di averli letti.
 */
export async function assicuraScenariAggiuntivi(
  esegui: Esecutore,
  nomeSchema: string,
  aziendaId: number,
  a: AziendaPercorsoDemo
): Promise<{ id: number; tipo: string }[]> {
  const scenari: { id: number; tipo: string }[] = [];
  for (const extra of a.scenariAggiuntivi ?? []) {
    const trovato = await esegui.query(
      `SELECT id FROM "${nomeSchema}".scenari WHERE azienda_id = $1 AND nome = $2 LIMIT 1`,
      [aziendaId, extra.nome]
    );
    if (trovato.rows.length > 0) {
      scenari.push({ id: Number(trovato.rows[0].id), tipo: extra.tipoIstruttoria });
      continue;
    }
    const creato = await esegui.query(
      `INSERT INTO "${nomeSchema}".scenari
         (azienda_id, nome, stato, tipo_proposta, origine_proposta,
          tipo_istruttoria, simulazione_attiva)
       VALUES ($1,$2,'IN_CORSO','RICEVUTA','Ente',$3,FALSE)
       RETURNING id`,
      [aziendaId, extra.nome, extra.tipoIstruttoria]
    );
    scenari.push({ id: Number(creato.rows[0].id), tipo: extra.tipoIstruttoria });
  }
  return scenari;
}
