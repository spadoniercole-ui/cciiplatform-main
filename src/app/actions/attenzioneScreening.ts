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
import { calcolaSoglie25Novies, type DatiSoglie } from '@/lib/soglie25novies/calcolo';
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
    // Somma del debito contabilizzato sulle sole categorie che concorrono al
    // totale: è il numero da confrontare con la soglia di legge per stabilire
    // se il debito è "importante".
    const esp = await pool
      .query(
        `SELECT COALESCE(SUM(d.importo), 0) AS totale
         FROM "${nomeSchema}".debiti_ente d
         JOIN "${nomeSchema}".categorie_tipo_debito c ON c.codice = d.tipo
        WHERE d.azienda_id = $1 AND c.attivo = TRUE AND c.contribuisce = TRUE`,
        [aziendaId]
      )
      .catch(() => ({ rows: [{ totale: 0 }] }));
    const contabilizzato = Number(esp.rows[0]?.totale ?? 0);
    const esposizione = contabilizzato > 0 ? contabilizzato : num(a.contributi_scaduti);

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
    };
    // Le soglie configurate per lo spazio, non le costanti: altrimenti la
    // pagina dei Parametri sarebbe una configurazione senza effetto.
    const par = await ottieniParametriSoglieAction(nomeSchema);
    const soglie = calcolaSoglie25Novies(dati, undefined, par.parametri);
    const applicabili = soglie.righe.filter((r) => r.applicabile);
    // null = nessuna riga applicabile o esito non determinabile: il perimetro
    // non è chiuso, e l'indicatore deve saperlo.
    const sogliaSuperata =
      applicabili.length === 0 || soglie.nonDeterminabili.length > 0
        ? null
        : soglie.superate.length > 0;

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

    return {
      success: true,
      attenzione: calcolaAttenzione({
        annoCostituzione: num(a.anno_costituzione),
        annoCorrente: new Date().getFullYear(),
        xbrlPresente,
        patrimonioNetto,
        indiciViolati,
        sogliaSuperata,
        esposizione,
        sogliaApplicabile,
        coloreQualitativo,
      }),
    };
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
