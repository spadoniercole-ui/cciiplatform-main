'use server';

// Raccolta dei dati per l'indicatore sintetico di attenzione dello Screening.
//
// Qui si LEGGE soltanto; il giudizio sta in src/lib/screening/indicatore.ts,
// funzione pura con i propri test. Nessun esito viene memorizzato: si
// ricalcola a ogni apertura, così non può divergere dai dati.

import { pool } from '@/lib/db';
import {
  assicuraTabellaCategorieTipoDebito,
  assicuraTabellaDebitiEnte,
  assicuraTabelleVera,
} from '@/db/provision';
import { calcolaAttenzione, type Attenzione } from '@/lib/screening/indicatore';
import {
  calcolaSoglie25Novies,
  type DatiSoglie,
  type Ente25Novies,
} from '@/lib/soglie25novies/calcolo';
import { ottieniParametriSoglieAction } from '@/app/actions/parametriSoglie';
import { formaAERdaAnagrafica } from '@/lib/soglie25novies/formaAER';

export interface RisultatoAttenzione {
  success: boolean;
  attenzione?: Attenzione;
  error?: string;
}

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export async function ottieniAttenzioneScreeningAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoAttenzione> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await assicuraTabellaDebitiEnte(nomeSchema);
    await assicuraTabelleVera(nomeSchema);

    // ---- Anagrafica -------------------------------------------------------
    const az = await pool.query(
      `SELECT anno_costituzione, forma_giuridica, con_lavoratori_subordinati,
              contributi_scaduti, contributi_dovuti_anno_precedente, sanzioni_presunte_vera,
              premi_inail, iva_scaduta, volume_affari, crediti_affidati_aer
         FROM "${nomeSchema}".aziende WHERE id = $1`,
      [aziendaId]
    );
    if (az.rows.length === 0) return { success: false, error: 'Azienda non trovata.' };
    const a = az.rows[0];

    // ---- Esposizione verso l'ente ----------------------------------------
    // A livello AZIENDA la fonte è la Posizione V.E.R.A., non la Situazione
    // Debitoria.
    //
    // Il V.E.R.A. è il documento con cui l'istituto certifica lo stato del
    // passivo: comprende le partite in lavorazione e le sanzioni, ed è la
    // fotografia dell'esposizione reale — stabile, valida per tutti gli
    // scenari. Il contabilizzato è un'altra grandezza, che risponde a
    // un'altra domanda ("su cosa si fanno i conti quando arriva una
    // proposta"), ed è per questo che la Situazione Debitoria è tornata
    // dentro lo scenario. Leggerla qui significherebbe far dipendere il
    // triage da un dato che appartiene a un momento successivo.
    //
    // Il join sulle categorie è permissivo: in triage i titoli non sono
    // mappati, quindi la categoria è spesso assente, e un join stretto
    // escluderebbe l'intero file riportando zero.
    const espVera = await pool
      .query(
        `SELECT COALESCE(SUM(v.importo), 0) AS totale
           FROM "${nomeSchema}".debiti_vera v
           LEFT JOIN "${nomeSchema}".categorie_tipo_debito c ON c.codice = v.categoria
          WHERE v.azienda_id = $1
            AND v.trattamento IN ('contabilizzato', 'da_contabilizzare')
            AND (c.contribuisce IS NULL OR c.contribuisce = TRUE)`,
        [aziendaId]
      )
      .catch(() => ({ rows: [{ totale: 0 }] }));
    const daVera = Number(espVera.rows[0]?.totale ?? 0);

    // Il valore inserito a mano ha comunque la precedenza: è una
    // dichiarazione esplicita dell'operatore, non una deduzione.
    const esposizione = num(a.contributi_scaduti) ?? (daVera > 0 ? daVera : null);

    // ---- Soglie di segnalazione ------------------------------------------
    const dati: DatiSoglie = {
      conLavoratori:
        a.con_lavoratori_subordinati === null || a.con_lavoratori_subordinati === undefined
          ? null
          : Boolean(a.con_lavoratori_subordinati),
      // La colonna manuale se c'è; altrimenti l'esposizione effettivamente
      // caricata (Situazione Debitoria e Posizione V.E.R.A.).
      //
      // Senza questo ripiego il file V.E.R.A. non arrivava MAI al calcolo
      // delle soglie: finisce in `debiti_vera`, mentre il test leggeva solo
      // la colonna `contributi_scaduti` dell'anagrafica. Chi caricava il
      // V.E.R.A. dalla Verifica salute azienda si vedeva dire "soglie non
      // determinabili" pur avendo fornito l'esposizione.
      contributiScaduti: num(a.contributi_scaduti) ?? esposizione ?? null,
      contributiDovutiAnnoPrecedente: num(a.contributi_dovuti_anno_precedente),
      annoContributiDovuti: null,
      sanzioniPresunte: num(a.sanzioni_presunte_vera),
      premiInail: num(a.premi_inail),
      ivaScaduta: num(a.iva_scaduta),
      volumeAffari: num(a.volume_affari),
      creditiAffidati: num(a.crediti_affidati_aer),
      formaAER: formaAERdaAnagrafica(a.forma_giuridica),
      ritardoOltre90Giorni:
        a.ritardo_oltre_90_giorni === null || a.ritardo_oltre_90_giorni === undefined
          ? null
          : Boolean(a.ritardo_oltre_90_giorni),
    };
    // Le soglie configurate per lo spazio, non le costanti: altrimenti la
    // pagina dei Parametri sarebbe una configurazione senza effetto.
    const par = await ottieniParametriSoglieAction(nomeSchema);
    // L'ENTE DI RIFERIMENTO dello spazio: uno spazio ENTE valuta SOLO la
    // propria soglia.
    //
    // Passando `undefined` si valutavano TUTTE le righe — INPS, INAIL,
    // Agenzia delle Entrate, Agente della Riscossione — e per uno spazio INPS
    // le altre tre non hanno e non avranno mai dati: restavano non
    // determinabili, e una sola di quelle azzerava l'intero esito. Il
    // risultato era che l'esposizione INPS, anche caricata e corretta, non
    // veniva mai guardata: "approfondimenti necessari" perpetuo.
    //
    // È la stessa regola che avevo scritto nel motore e non applicata qui.
    const enteRis = await pool
      .query(
        `SELECT DISTINCT ente_25novies FROM "${nomeSchema}".limiti_ricevibilita
          WHERE ente_25novies IS NOT NULL`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    // Un solo ente configurato: è quello dello spazio. Più d'uno (o nessuno)
    // significa spazio non ENTE, o configurazione ambigua: si valuta tutto.
    const enteSpazio =
      enteRis.rows.length === 1
        ? (String(enteRis.rows[0].ente_25novies) as Ente25Novies)
        : undefined;

    const soglie = calcolaSoglie25Novies(dati, enteSpazio, par.parametri);
    const applicabili = soglie.righe.filter((r) => r.applicabile);
    // null = nessuna riga applicabile o esito non determinabile: il perimetro
    // non è chiuso, e l'indicatore deve saperlo.
    const sogliaSuperata =
      applicabili.length === 0 || soglie.nonDeterminabili.length > 0
        ? null
        : soglie.superate.length > 0;

    // Se l'esito non è determinabile, il motivo va detto con precisione:
    // "manca l'esposizione" e "l'ente di riferimento non è configurato" sono
    // due problemi diversi che si risolvono in due posti diversi.
    const motivoSoglieMancanti =
      applicabili.length === 0
        ? enteSpazio === undefined
          ? 'Ente di riferimento non configurato: collega una riga dei Limiti di Ricevibilità a un ente dell’art. 25-novies.'
          : 'Nessuna soglia applicabile: dichiara in anagrafica la presenza di lavoratori subordinati/parasubordinati.'
        : null;

    // Soglia di legge applicabile, per stabilire se il debito è "importante".
    const rigaApplicabile = applicabili[0];
    const sogliaApplicabile = rigaApplicabile ? estraiSogliaNumerica(rigaApplicabile.valore) : null;

    // ---- Bilancio XBRL ----------------------------------------------------
    // Ogni lettura qui è OPZIONALE: queste tabelle nascono solo quando la
    // rispettiva scheda viene usata la prima volta. Una tabella assente
    // significa "dato non disponibile" — che per l'indicatore è
    // un'informazione legittima — non un errore che debba far fallire
    // l'intero calcolo e sparire il semaforo dalla pagina.
    const xbrl = await pool
      .query(
        `SELECT dati_finanziari, indici, altri_indici
           FROM "${nomeSchema}".xbrl_storico_azienda WHERE azienda_id = $1
          ORDER BY anno_bilancio DESC NULLS LAST LIMIT 1`,
        [aziendaId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const xbrlPresente = xbrl.rows.length > 0;
    let patrimonioNetto: number | null = null;
    let indiciViolati: number | null = null;
    if (xbrlPresente) {
      const r = xbrl.rows[0];
      patrimonioNetto = num(r.dati_finanziari?.patrimonioNetto);
      const tutti = [...(r.indici ?? []), ...(r.altri_indici ?? [])];
      indiciViolati = tutti.filter((i: { esito?: string }) => i.esito === 'VIOLATO').length;
    }

    // ---- Quadro qualitativo ----------------------------------------------
    const check = await pool
      .query(`SELECT colore FROM "${nomeSchema}".checklist_quadro WHERE azienda_id = $1 LIMIT 1`, [
        aziendaId,
      ])
      .catch(() => ({ rows: [] as { colore?: string }[] }));
    const coloreQualitativo =
      (check.rows[0]?.colore as 'verde' | 'giallo' | 'rosso' | 'grigio' | undefined) ?? null;

    const attenzione = calcolaAttenzione({
      annoCostituzione: num(a.anno_costituzione),
      annoCorrente: new Date().getFullYear(),
      xbrlPresente,
      patrimonioNetto,
      indiciViolati,
      sogliaSuperata,
      esposizione,
      sogliaApplicabile,
      coloreQualitativo,
    });

    // Il motivo preciso al posto di quello generico: "manca l'esposizione" e
    // "l'ente di riferimento non è configurato" si risolvono in due posti
    // diversi, e mandare l'operatore nel posto sbagliato è quanto è già
    // successo con i Parametri di Spazio.
    if (motivoSoglieMancanti) {
      attenzione.daAccertare = attenzione.daAccertare.map((d) =>
        d.startsWith('Esposizione previdenziale') ? motivoSoglieMancanti : d
      );
    }

    return { success: true, attenzione };
  } catch (error: unknown) {
    console.error('[ottieniAttenzioneScreeningAction] Errore:', error);
    return { success: false, error: `Indicatore non calcolabile: ${(error as Error).message}` };
  }
}

/**
 * Estrae il primo importo in euro dal testo della soglia (es. "> 5.000 €").
 * Serve solo a stabilire se il debito è "importante" ai fini della giovane
 * impresa: si usa la soglia di legge, non un numero inventato da noi.
 */
function estraiSogliaNumerica(valore: string): number | null {
  const m = valore.match(/([\d.]+)\s*€/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
}
