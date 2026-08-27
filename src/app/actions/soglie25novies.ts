'use server';

// Raccolta dei dati per la griglia delle soglie di segnalazione INPS
// (art. 25-novies CCII), mostrata in testata allo Screening dell'azienda.
//
// Divisione dei ruoli, deliberata: qui si LEGGE, in
// src/lib/soglie25novies/calcolo.ts si CALCOLA. Il calcolo è una funzione
// pura, testata a parte; questo file non decide nulla, si limita a portarle
// i numeri veri. Nessuno stato memorizzato: la griglia si ricalcola al volo
// a ogni apertura, così non può mai divergere dai dati correnti.

import { pool } from '@/lib/db';
import {
  assicuraTabellaCategorieTipoDebito,
  assicuraTabellaDebitiEnte,
  assicuraTabelleVera,
} from '@/db/provision';
import { calcolaGriglia25Novies, type Griglia, type RigaAnno } from '@/lib/soglie25novies/calcolo';
import {
  calcolaConfrontoVera,
  type TrattamentoVeraRigaConfronto,
} from '@/lib/debitiEnte/confrontoVera';

export interface RisultatoGriglia25Novies {
  success: boolean;
  griglia?: Griglia;
  /** Categorie previdenziali effettivamente incluse, per trasparenza a video. */
  categorieIncluse?: string[];
  error?: string;
}

function schemaValido(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

/**
 * Costruisce la griglia per un'azienda.
 *
 * PERIMETRO — la soglia dell'art. 25-novies lettera a) riguarda i CONTRIBUTI
 * PREVIDENZIALI, non l'intera esposizione. Il confronto si applica perciò
 * alle sole categorie che concorrono al totale (`contribuisce = TRUE`), che
 * è il modo in cui questa piattaforma già distingue le voci sostanziali da
 * quelle neutre. Sommare anche il tributario gonfierebbe l'esposizione e
 * farebbe scattare "oltre soglia" su una base che la norma non contempla.
 */
export async function ottieniGriglia25NoviesAction(
  nomeSchema: string,
  aziendaId: number,
  prospettiva: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoGriglia25Novies> {
  try {
    if (!schemaValido(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }

    // Le tre tabelle lette qui sono create da funzioni "assicura" separate,
    // chiamate dalle rispettive schermate. Uno schema in cui la Situazione
    // Debitoria o la Posizione V.E.R.A. non sono ancora state aperte non le
    // ha: senza queste chiamate la griglia fallirebbe con un errore Postgres
    // grezzo su una pagina in cui l'utente non ha sbagliato nulla.
    // Idempotenti, come tutte le altre.
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await assicuraTabellaDebitiEnte(nomeSchema);
    await assicuraTabelleVera(nomeSchema);

    // 1) Categorie che concorrono al totale (perimetro previdenziale).
    const catRis = await pool.query(
      `SELECT codice, etichetta FROM "${nomeSchema}".categorie_tipo_debito
       WHERE attivo = TRUE AND contribuisce = TRUE`
    );
    const codiciInclusi = catRis.rows.map((r) => String(r.codice));
    const categorieIncluse = catRis.rows.map((r) => String(r.etichetta));

    // Nessuna categoria configurata: non si inventa un perimetro.
    if (codiciInclusi.length === 0) {
      return {
        success: false,
        error:
          'Nessuna categoria di tipo debito concorre al totale: configurare i Parametri di Spazio prima di usare la griglia delle soglie.',
      };
    }

    // 2) Debito CONTABILIZZATO per anno (Situazione Debitoria).
    //    L'anno viene dalla colonna `data`, presente solo se il tracciato la
    //    portava e l'operatore l'ha mappata: dove manca, la riga confluisce
    //    nel gruppo "anno non attribuito" e il motore lo dichiara.
    const contabRis = await pool.query(
      `SELECT EXTRACT(YEAR FROM data)::int AS anno, COALESCE(SUM(importo), 0) AS totale
         FROM "${nomeSchema}".debiti_ente
        WHERE azienda_id = $1 AND tipo = ANY($2::text[])
        GROUP BY EXTRACT(YEAR FROM data)`,
      [aziendaId, codiciInclusi]
    );

    // 3) SANZIONI PRESUNTE — delegate alla definizione UNICA in
    //    src/lib/debitiEnte/confrontoVera.ts, la stessa che alimenta la
    //    schermata Posizione V.E.R.A. Qui non si ricalcola nulla: si legge.
    const righeEnteRis = await pool.query(
      `SELECT tipo, importo FROM "${nomeSchema}".debiti_ente WHERE azienda_id = $1`,
      [aziendaId]
    );
    const righeVeraRis = await pool.query(
      `SELECT categoria, importo, trattamento FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1`,
      [aziendaId]
    );
    const catTutteRis = await pool.query(
      `SELECT codice, contribuisce FROM "${nomeSchema}".categorie_tipo_debito WHERE attivo = TRUE`
    );

    const confronto = calcolaConfrontoVera(
      righeEnteRis.rows.map((r) => ({ tipo: String(r.tipo), importo: Number(r.importo) })),
      righeVeraRis.rows.map((r) => ({
        categoria: String(r.categoria),
        importo: Number(r.importo),
        trattamento: String(r.trattamento) as TrattamentoVeraRigaConfronto,
      })),
      catTutteRis.rows.map((r) => ({
        codice: String(r.codice),
        contribuisce: Boolean(r.contribuisce),
      }))
    );
    const sanzioniPresunte = confronto.sanzioniPresunte;

    // 4) Dati dichiarati in anagrafica azienda.
    const azRis = await pool.query(
      `SELECT con_lavoratori_subordinati, contributi_dovuti_anno_precedente, anno_contributi_dovuti
         FROM "${nomeSchema}".aziende WHERE id = $1`,
      [aziendaId]
    );
    if (azRis.rows.length === 0) {
      return { success: false, error: 'Azienda non trovata.' };
    }
    const az = azRis.rows[0];

    // 5) Composizione delle righe per anno.
    const righe: RigaAnno[] = contabRis.rows.map((r) => ({
      anno: r.anno === null || r.anno === undefined ? null : Number(r.anno),
      contabilizzato: Number(r.totale),
      sanzioniPresunte: 0,
    }));

    // Le sanzioni presunte non sono attribuibili ad alcun anno: debiti_vera
    // non ha colonne temporali. Confluiscono nel gruppo "anno non attribuito".
    if (sanzioniPresunte !== 0) {
      const senzaAnno = righe.find((r) => r.anno === null);
      if (senzaAnno) {
        senzaAnno.sanzioniPresunte += sanzioniPresunte;
      } else {
        righe.push({ anno: null, contabilizzato: 0, sanzioniPresunte });
      }
    }

    const griglia = calcolaGriglia25Novies({
      righe,
      conLavoratori:
        az.con_lavoratori_subordinati === null || az.con_lavoratori_subordinati === undefined
          ? null
          : Boolean(az.con_lavoratori_subordinati),
      contributiDovutiAnnoPrecedente:
        az.contributi_dovuti_anno_precedente === null ||
        az.contributi_dovuti_anno_precedente === undefined
          ? null
          : Number(az.contributi_dovuti_anno_precedente),
      annoContributiDovuti: az.anno_contributi_dovuti ?? null,
      // Dato non disponibile in piattaforma: il motore usa la formulazione
      // dell'articolo stesso ("e, ove esistente, all'organo di controllo").
      organoDiControlloNominato: null,
      prospettiva,
    });

    // Il Redigente non ha la scheda "Posizione Ente": se nessuno ha caricato
    // una Situazione Debitoria o una Posizione V.E.R.A. per questa azienda, la
    // griglia non ha proprio i numeri. Meglio dirlo che mostrare zeri, che
    // sembrerebbero "nessun debito previdenziale" invece di "nessun dato".
    if (
      prospettiva === 'NON_ENTE' &&
      confronto.totaleContabilizzato === 0 &&
      confronto.totaleVera === 0
    ) {
      griglia.datiMancanti.push(
        "Nessuna posizione debitoria previdenziale caricata per questa azienda: la griglia non dispone di importi. I totali a zero significano 'dato assente', non 'nessun debito'."
      );
    }

    if (confronto.deltaNegativo) {
      griglia.datiMancanti.push(
        `Il contabilizzato dall'ente supera l'importo della Posizione V.E.R.A. di ${Math.round(Math.abs(confronto.deltaGrezzo)).toLocaleString('it-IT')} €: nessuna sanzione presunta è stata calcolata. Verificare l'allineamento dei due perimetri nella Posizione V.E.R.A.`
      );
    }

    const righePotenziali = confronto.righePotenziali;
    if (righePotenziali > 0) {
      griglia.datiMancanti.push(
        `${righePotenziali} ${righePotenziali === 1 ? 'riga' : 'righe'} della Posizione V.E.R.A. con importo ignoto (trattamento "potenziale"): non concorrono ai totali.`
      );
    }

    return { success: true, griglia, categorieIncluse };
  } catch (error: unknown) {
    const e = error as { message?: string };
    console.error('[ottieniGriglia25NoviesAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile costruire la griglia delle soglie: ${e.message || error}`,
    };
  }
}
