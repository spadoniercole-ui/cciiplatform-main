'use server';

// LE VERIFICHE DELL’ENTE NELLO SCENARIO — quali entrano, e da quando.
//
// La scelta si fa alla creazione dello scenario e resta modificabile dal
// passo 0. Non è una navigazione: è uno stato dello scenario, e serve a
// rispondere alla sola domanda che conta mentre si lavora — questo dato è
// caricato nello scenario, o no?
//
// La contabile non è indipendente dall’amministrativa: si appoggia alla stessa
// visura e al debito dell’ente splittato tra contabilizzato e da contabilizzare,
// che è la voce con cui la contabilità chiude l’esposizione verso l’ente. La
// scheda mostra quell’aggancio e, senza quei dati, non si spunta.

import { richiediAccessoAzienda, richiediAccessoScenario } from '@/lib/autorizzazione';
import { assicuraTabelleScenari } from '@/db/provision';
import type { RisultatoOperazioneScenario } from '@/app/actions/scenari';
import {
  aggancioContabile,
  type AggancioContabile,
  type VisuraContabile,
} from '@/lib/debitiEnte/aggancioContabile';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import type { SnapshotDebitoEnte } from '@/lib/ponte/debitoEnte';
import type { DebitoEntePonte } from '@/lib/ponte/types';
import type { RigaVera, TrattamentoVera } from '@/lib/debitiEnte/veraImport';
import type { StatoDuplicatoVera } from '@/lib/debitiEnte/duplicatiVera';

export interface DisponibilitaVerifiche {
  success: boolean;
  /** Esiste il dato attuale: certificazione dei debiti o posizioni del triage. */
  amministrativa: boolean;
  /** Esiste almeno un bilancio XBRL: il dato storico. */
  contabile: boolean;
  /** Visura, debito split e bilanci: è ciò che rende la contabile agganciabile. */
  aggancio: AggancioContabile;
  error?: string;
}

// Le colonne NUMERIC arrivano da `pg` come stringhe: senza questa conversione
// ogni importo letto dall'aggancio contabile valeva zero.
function numero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Legge dallo spazio ciò che serve all’aggancio: visura dell’ente, debito
 * (certificazione, altrimenti triage) e anni di bilancio XBRL. Ogni lettura è
 * indipendente: una tabella assente non fa fallire le altre, perché la scheda
 * deve poter dire esattamente che cosa manca.
 */
async function leggiAggancio(nomeSchema: string, aziendaId: number): Promise<AggancioContabile> {
  const { pool } = await import('@/lib/db');
  const { snapshotDebitoEnte, snapshotDebitoEnteDaTriage } = await import('@/lib/ponte/debitoEnte');

  let visura: VisuraContabile = { presente: false, nomeFile: null, caricataIl: null };
  try {
    const risposta = await pool.query(
      `SELECT visura_triage_url, visura_triage_nome,
              to_char(visura_triage_il, 'YYYY-MM-DD') AS visura_triage_il
         FROM "${nomeSchema}".aziende
        WHERE id = $1 LIMIT 1`,
      [aziendaId]
    );
    const riga = risposta.rows[0];
    if (riga?.visura_triage_url) {
      visura = {
        presente: true,
        nomeFile: riga.visura_triage_nome ? String(riga.visura_triage_nome) : null,
        caricataIl: riga.visura_triage_il ? String(riga.visura_triage_il) : null,
      };
    }
  } catch {
    // Tabella o colonne assenti su uno spazio nuovo: la visura è un dato da
    // acquisire, non un errore da mostrare.
  }

  let certificazione: SnapshotDebitoEnte | null = null;
  try {
    const risposta = await pool.query(
      `SELECT id, sezione, ambito, voce, importo, contributi, sanzioni, categoria, stato,
              trattamento, periodo, duplicato_stato
         FROM "${nomeSchema}".debiti_vera
        WHERE azienda_id = $1 ORDER BY id ASC`,
      [aziendaId]
    );
    const righe: RigaVera[] = risposta.rows.map((r) => ({
      id: Number(r.id),
      sezione: String(r.sezione ?? ''),
      ambito: (r.ambito ?? 'INPS') as RigaVera['ambito'],
      voce: String(r.voce ?? ''),
      importo: numero(r.importo),
      categoria: String(r.categoria ?? ''),
      stato: String(r.stato ?? ''),
      periodo: r.periodo ? String(r.periodo) : undefined,
      trattamento: String(r.trattamento ?? 'potenziale') as TrattamentoVera,
      contributi: r.contributi === null || r.contributi === undefined ? null : numero(r.contributi),
      sanzioni: r.sanzioni === null || r.sanzioni === undefined ? null : numero(r.sanzioni),
      duplicatoStato: (r.duplicato_stato ?? '') as StatoDuplicatoVera | '',
    }));
    if (righe.length > 0) certificazione = snapshotDebitoEnte(righe);
  } catch {
    // Nessuna certificazione: si prova col triage.
  }

  let triage: DebitoEntePonte | null = null;
  if (!certificazione || certificazione.totale === 0) {
    try {
      const risposta = await pool.query(
        `SELECT descrizione, categoria, importo_anno_corrente
           FROM "${nomeSchema}".debiti_triage
          WHERE azienda_id = $1 AND importo_anno_corrente IS NOT NULL
          ORDER BY categoria, id`,
        [aziendaId]
      );
      triage = snapshotDebitoEnteDaTriage(
        risposta.rows.map((r) => ({
          categoria: String(r.categoria ?? ''),
          descrizione: String(r.descrizione ?? ''),
          importo:
            r.importo_anno_corrente === null || r.importo_anno_corrente === undefined
              ? null
              : numero(r.importo_anno_corrente),
        }))
      );
    } catch {
      // Tabella assente: il debito resta da acquisire.
    }
  }

  let anniBilancio: number[] = [];
  try {
    const risposta = await pool.query(
      `SELECT DISTINCT anno_bilancio FROM "${nomeSchema}".xbrl_storico_azienda
        WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL`,
      [aziendaId]
    );
    anniBilancio = risposta.rows
      .map((r) => Number(r.anno_bilancio))
      .filter((n) => Number.isFinite(n));
  } catch {
    // Nessun bilancio caricato: la contabile resta da costruire.
  }

  // IL DEBITO DELLA VERIFICA AMMINISTRATIVA VINCE SULLE LETTURE.
  //
  // A verifica chiusa la cifra è stata memorizzata (0.185.0): è quella, non
  // l'ultima certificazione importata, a entrare nella contabile. Se la
  // memorizzazione non c'è — verifica mai chiusa, o spazio precedente — si
  // ripiega sulle letture di qui sopra, come prima.
  const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId);

  return aggancioContabile({
    visura,
    certificazione,
    triage,
    anniBilancio,
    memorizzato: memorizzato
      ? {
          contabilizzato: memorizzato.debito.contabilizzato,
          daContabilizzare: memorizzato.debito.daContabilizzare,
          segnalato: memorizzato.debito.segnalato,
          totale: memorizzato.debito.totale,
          righe: memorizzato.debito.righe,
          fonte: memorizzato.debito.fonte,
          ripartito: memorizzato.debito.ripartito,
        }
      : null,
  });
}

/**
 * Quali verifiche esistono davvero su questa azienda. Serve alla creazione
 * per preselezionare la più completa disponibile: completa se ci sono
 * amministrativa e contabile, altrimenti amministrativa, altrimenti la sola
 * contabile storica — che resta l'unica scelta quando il dato attuale manca.
 */
export async function verificheDisponibiliAziendaAction(
  nomeSchema: string,
  aziendaId: number
): Promise<DisponibilitaVerifiche> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return {
        success: false,
        amministrativa: false,
        contabile: false,
        aggancio: (await import('@/lib/debitiEnte/aggancioContabile')).AGGANGIO_VUOTO,
        error: 'Nome schema non valido.',
      };
    }
    const aggancio = await leggiAggancio(nomeSchema, aziendaId);
    return {
      success: true,
      amministrativa: Boolean(aggancio.debito) || aggancio.visura.presente,
      contabile: aggancio.anniBilancio.length > 0,
      aggancio,
    };
  } catch (error: any) {
    console.error('[verificheDisponibiliAziendaAction] Errore:', error);
    return {
      success: false,
      amministrativa: false,
      contabile: false,
      aggancio: (await import('@/lib/debitiEnte/aggancioContabile')).AGGANGIO_VUOTO,
      error: `Impossibile leggere le verifiche dell’azienda: ${error.message || error}`,
    };
  }
}

/**
 * Le due spunte del passo 0. Persistono sullo scenario con la data del
 * caricamento; il server rifiuta una scelta che lascerebbe lo scenario senza
 * nessuna verifica, e rifiuta la contabile se l'aggancio non è completo: non si
 * dichiara «dentro lo scenario» un dato che l'azienda non ha ancora fornito.
 */
export async function impostaVerificheScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  verifiche: { amministrativa: boolean; contabile: boolean }
): Promise<RisultatoOperazioneScenario> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId, {
      modulo: ['scenari'],
      livello: 'SCRITTURA',
    });
    if (!verifiche.amministrativa && !verifiche.contabile) {
      return {
        success: false,
        error: 'Almeno una verifica dell’ente deve restare nello scenario.',
      };
    }
    await assicuraTabelleScenari(nomeSchema);
    const { pool } = await import('@/lib/db');
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const attuale = await db
      .select({
        aziendaId: tabelle.scenari.aziendaId,
        amministrativa: tabelle.scenari.verificaAmministrativa,
        contabile: tabelle.scenari.verificaContabile,
        amministrativaIl: tabelle.scenari.verificaAmministrativaIl,
        contabileIl: tabelle.scenari.verificaContabileIl,
      })
      .from(tabelle.scenari)
      .where(eq(tabelle.scenari.id, scenarioId))
      .limit(1);
    if (attuale.length === 0) return { success: false, error: 'Scenario non trovato.' };
    const prima = attuale[0];

    if (verifiche.contabile && !prima.contabile) {
      const aggancio = await leggiAggancio(nomeSchema, prima.aziendaId);
      if (!aggancio.pronto) {
        return {
          success: false,
          error: `La verifica contabile non è ancora selezionabile: manca ${aggancio.mancanti.join(', ')}.`,
        };
      }
    }

    await pool.query(
      `UPDATE "${nomeSchema}".scenari
          SET verifica_amministrativa = $2,
              verifica_contabile = $3,
              verifica_amministrativa_il = CASE
                WHEN NOT $2 THEN NULL
                WHEN verifica_amministrativa AND verifica_amministrativa_il IS NOT NULL
                  THEN verifica_amministrativa_il
                ELSE now()
              END,
              verifica_contabile_il = CASE
                WHEN NOT $3 THEN NULL
                WHEN verifica_contabile AND verifica_contabile_il IS NOT NULL
                  THEN verifica_contabile_il
                ELSE now()
              END
        WHERE id = $1`,
      [scenarioId, verifiche.amministrativa, verifiche.contabile]
    );

    return { success: true, scenarioId };
  } catch (error: any) {
    console.error('[impostaVerificheScenarioAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare le verifiche dello scenario: ${error.message || error}`,
    };
  }
}
