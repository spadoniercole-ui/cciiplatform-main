'use server';

// Raccolta dei dati per l'indicatore sintetico di attenzione dello Screening.
//
// Qui si LEGGE soltanto; il giudizio sta in src/lib/screening/indicatore.ts,
// funzione pura con i propri test. Nessun esito viene memorizzato: si
// ricalcola a ogni apertura, così non può divergere dai dati.

import { pool } from '@/lib/db';
import {
  assicuraTabellaAziende,
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
import { leggiDatiSoglieAzienda } from '@/lib/soglie25novies/datiAzienda';
import { sintetizzaSoglie } from '@/lib/soglie25novies/sintesi';
import { richiediAccessoSchema } from '@/lib/autorizzazione';

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
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    // Anche la tabella aziende: le colonne delle soglie e del ritardo
    // vengono aggiunte lì, e questa action le legge. Se l'azienda è stata
    // creata da un percorso che non le ha ancora aggiunte, la SELECT fallisce
    // e l'indicatore non si calcola — senza che nulla dica perché.
    await assicuraTabellaAziende(nomeSchema);
    await assicuraTabellaCategorieTipoDebito(nomeSchema);
    await assicuraTabellaDebitiEnte(nomeSchema);
    await assicuraTabelleVera(nomeSchema);

    // ---- Dati delle soglie: una sola lettura, condivisa con lo Screening ----
    const lettura = await leggiDatiSoglieAzienda(nomeSchema, aziendaId);
    if (!lettura) return { success: false, error: 'Azienda non trovata.' };
    const az = await pool.query(
      `SELECT anno_costituzione, periodi_in_ritardo FROM "${nomeSchema}".aziende WHERE id = $1`,
      [aziendaId]
    );
    const a = az.rows[0] ?? {};
    const dati: DatiSoglie = lettura.dati;
    const esposizione = lettura.esposizione;
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
    // UN FATTO ACCERTATO NON SI PERDE PER UNA LACUNA ALTROVE.
    //
    // Prima bastava UNA riga non determinabile perché l'intero esito
    // diventasse indeterminato. Per uno spazio ENTE, che valuta una sola
    // soglia, era indifferente. Per il REDIGENTE no: lui valuta tutte e
    // quattro le soglie — deve sapere se l'impresa rischia la segnalazione da
    // INPS, INAIL, Agenzia Entrate o Agente della Riscossione — e con quattro
    // righe la probabilità che almeno una manchi è alta. L'esito sarebbe
    // stato "approfondimenti necessari" quasi sempre, cioè rumore.
    //
    // La regola: se una soglia RISULTA superata, è un fatto, e vale anche se
    // altre restano da accertare. Solo quando nessuna è superata e qualcuna
    // non è determinabile non si può concludere — perché la risposta
    // potrebbe stare proprio in quella mancante.
    const sogliaSuperata = sintetizzaSoglie(
      applicabili.length,
      soglie.superate.length,
      soglie.nonDeterminabili.length
    );

    // Se l'esito non è determinabile, il motivo va detto con precisione:
    // "manca l'esposizione" e "l'ente di riferimento non è configurato" sono
    // due problemi diversi che si risolvono in due posti diversi.
    // Il motore scrive gia', riga per riga, PERCHE' un esito non e'
    // determinabile. Buttarlo via e sostituirlo con una frase generica
    // mandava l'operatore a caricare un file che aveva gia' caricato — e' gia'
    // successo due volte. Qui si usa il motivo vero.
    const motiviNonDeterminabili = soglie.nonDeterminabili
      .map((r) => r.motivo)
      .filter((m) => m && m.trim() !== '');

    const motivoSoglieMancanti =
      applicabili.length === 0
        ? enteSpazio === undefined
          ? 'Ente di riferimento non configurato: collega una riga dei Parametri di riscontro della proposta a un ente dell’art. 25-novies.'
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
      // Il dettaglio di COSA è stato superato, con i numeri: il motivo che il
      // motore ha già composto riga per riga, non una frase riassuntiva.
      dettaglioSoglieSuperate: soglie.superate.map(
        (r) => `${r.ambito} — soglia ${r.valore}. ${r.motivo}`
      ),
      ritardoOltre90Giorni: dati.ritardoOltre90Giorni,
      periodiInRitardo: num(a.periodi_in_ritardo),
    });

    // Il motivo preciso al posto di quello generico: "manca l'esposizione" e
    // "l'ente di riferimento non è configurato" si risolvono in due posti
    // diversi, e mandare l'operatore nel posto sbagliato è quanto è già
    // successo con i Parametri di Spazio.
    const sostituto = motivoSoglieMancanti ?? motiviNonDeterminabili[0] ?? null;
    if (sostituto) {
      attenzione.daAccertare = attenzione.daAccertare.map((d) =>
        d.startsWith('Esposizione previdenziale') ? sostituto : d
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
