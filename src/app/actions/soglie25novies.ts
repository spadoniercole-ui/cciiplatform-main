'use server';

// Valori a inserimento manuale per le soglie di segnalazione dell'art.
// 25-novies, e loro valutazione.
//
// Stanno sull'AZIENDA, non sullo scenario: il debito e' il punto di partenza
// di ogni analisi e non cambia da uno scenario all'altro. Si compilano una
// volta nella fase di raccolta delle informazioni azienda e da li' vengono
// riportati in ogni scenario.
//
// Qui si LEGGE e si SCRIVE; il calcolo sta in src/lib/soglie25novies/calcolo.ts,
// funzione pura testata a parte. Nessun esito viene memorizzato: si ricalcola
// a ogni apertura, cosi' non puo' divergere dai dati.

import { pool } from '@/lib/db';
import { assicuraTabellaAziende, assicuraTabelleParametriSpazio } from '@/db/provision';
import { ottieniParametriSoglieAction } from '@/app/actions/parametriSoglie';
import {
  calcolaSoglie25Novies,
  type DatiSoglie,
  type EsitoSoglie,
  type Ente25Novies,
  type FormaAER,
} from '@/lib/soglie25novies/calcolo';
import { formaAERdaAnagrafica } from '@/lib/soglie25novies/formaAER';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { leggiDatiSoglieAzienda } from '@/lib/soglie25novies/datiAzienda';
import type { ValoriUsati } from '@/lib/soglie25novies/fonti';
import {
  contributiPerAnnoDaDb,
  pianoRicalcoloSerie,
  serieRicostruita,
  type AziendaDaRicalcolare,
  type ContributiAnno,
  type PosizionePerAnno,
} from '@/lib/soglie25novies/rapportoAnni';

export interface ValoriSoglie {
  conLavoratoriSubordinati: boolean | null;
  contributiScaduti: number | null;
  contributiDovutiAnnoPrecedente: number | null;
  annoContributiDovuti: number | null;
  sanzioniPresunteVera: number | null;
  premiInail: number | null;
  ivaScaduta: number | null;
  volumeAffari: number | null;
  creditiAffidatiAer: number | null;
  soglieAggiornateAl: string | null;
  /** Terzo requisito art. 25-novies, accertato dall'Elenco Deleghe. */
  ritardoOltre90Giorni: boolean | null;
  periodiInRitardo: number | null;
  denunceNonPresentate: string | null;
}

export interface RisultatoValoriSoglie {
  success: boolean;
  valori?: ValoriSoglie;
  /** Forma giuridica riconosciuta dall'anagrafica; null = non riconosciuta. */
  formaAER?: FormaAER | null;
  formaGiuridicaTesto?: string | null;
  error?: string;
}

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export async function ottieniValoriSoglieAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoValoriSoglie> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool.query(
      `SELECT con_lavoratori_subordinati, contributi_scaduti, contributi_dovuti_anno_precedente,
              anno_contributi_dovuti, sanzioni_presunte_vera, premi_inail, iva_scaduta,
              volume_affari, crediti_affidati_aer, soglie_aggiornate_al, forma_giuridica,
              ritardo_oltre_90_giorni, periodi_in_ritardo, denunce_non_presentate
         FROM "${nomeSchema}".aziende WHERE id = $1`,
      [aziendaId]
    );
    if (r.rows.length === 0) return { success: false, error: 'Azienda non trovata.' };
    const a = r.rows[0];
    return {
      success: true,
      valori: {
        conLavoratoriSubordinati:
          a.con_lavoratori_subordinati === null || a.con_lavoratori_subordinati === undefined
            ? null
            : Boolean(a.con_lavoratori_subordinati),
        contributiScaduti: num(a.contributi_scaduti),
        contributiDovutiAnnoPrecedente: num(a.contributi_dovuti_anno_precedente),
        annoContributiDovuti: num(a.anno_contributi_dovuti),
        sanzioniPresunteVera: num(a.sanzioni_presunte_vera),
        premiInail: num(a.premi_inail),
        ivaScaduta: num(a.iva_scaduta),
        volumeAffari: num(a.volume_affari),
        creditiAffidatiAer: num(a.crediti_affidati_aer),
        soglieAggiornateAl: a.soglie_aggiornate_al
          ? new Date(a.soglie_aggiornate_al).toISOString().slice(0, 10)
          : null,
        ritardoOltre90Giorni:
          a.ritardo_oltre_90_giorni === null || a.ritardo_oltre_90_giorni === undefined
            ? null
            : Boolean(a.ritardo_oltre_90_giorni),
        periodiInRitardo: num(a.periodi_in_ritardo),
        denunceNonPresentate: a.denunce_non_presentate ? String(a.denunce_non_presentate) : null,
      },
      formaAER: formaAERdaAnagrafica(a.forma_giuridica),
      formaGiuridicaTesto: a.forma_giuridica ?? null,
    };
  } catch (error: unknown) {
    console.error('[ottieniValoriSoglieAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

/**
 * Salva SOLO i valori forniti, lasciando intatti gli altri.
 *
 * Serve alla Verifica salute azienda, che conosce due valori su nove: usando
 * il salvataggio completo scriverebbe `null` su tutti gli altri, cancellando
 * premi INAIL, IVA e volume d'affari già inseriti da qualcun altro. Una
 * funzione di triage non deve poter distruggere il lavoro di un'istruttoria.
 */
export async function salvaValoriSoglieParzialeAction(
  nomeSchema: string,
  aziendaId: number,
  valori: Partial<ValoriSoglie>
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    const colonne: Record<keyof ValoriSoglie, string> = {
      conLavoratoriSubordinati: 'con_lavoratori_subordinati',
      contributiScaduti: 'contributi_scaduti',
      contributiDovutiAnnoPrecedente: 'contributi_dovuti_anno_precedente',
      annoContributiDovuti: 'anno_contributi_dovuti',
      sanzioniPresunteVera: 'sanzioni_presunte_vera',
      premiInail: 'premi_inail',
      ivaScaduta: 'iva_scaduta',
      volumeAffari: 'volume_affari',
      creditiAffidatiAer: 'crediti_affidati_aer',
      soglieAggiornateAl: 'soglie_aggiornate_al',
      ritardoOltre90Giorni: 'ritardo_oltre_90_giorni',
      periodiInRitardo: 'periodi_in_ritardo',
      denunceNonPresentate: 'denunce_non_presentate',
    };

    const set: string[] = [];
    const params: unknown[] = [aziendaId];
    for (const [chiave, colonna] of Object.entries(colonne)) {
      const v = valori[chiave as keyof ValoriSoglie];
      // `undefined` = non fornito, si lascia com'è. `null` esplicito =
      // cancellazione voluta.
      if (v === undefined) continue;
      params.push(v);
      set.push(`${colonna} = $${params.length}`);
    }
    if (set.length === 0) return { success: true };

    await pool.query(`UPDATE "${nomeSchema}".aziende SET ${set.join(', ')} WHERE id = $1`, params);
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaValoriSoglieParzialeAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

export async function salvaValoriSoglieAction(
  nomeSchema: string,
  aziendaId: number,
  valori: ValoriSoglie
): Promise<{ success: boolean; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await pool.query(
      `UPDATE "${nomeSchema}".aziende SET
         con_lavoratori_subordinati = $2,
         contributi_scaduti = $3,
         contributi_dovuti_anno_precedente = $4,
         anno_contributi_dovuti = $5,
         sanzioni_presunte_vera = $6,
         premi_inail = $7,
         iva_scaduta = $8,
         volume_affari = $9,
         crediti_affidati_aer = $10,
         soglie_aggiornate_al = $11
       WHERE id = $1`,
      [
        aziendaId,
        valori.conLavoratoriSubordinati,
        valori.contributiScaduti,
        valori.contributiDovutiAnnoPrecedente,
        valori.annoContributiDovuti,
        valori.sanzioniPresunteVera,
        valori.premiInail,
        valori.ivaScaduta,
        valori.volumeAffari,
        valori.creditiAffidatiAer,
        valori.soglieAggiornateAl,
      ]
    );
    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaValoriSoglieAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

/**
 * I contributi INPS letti dai file, conservati ANNO PER ANNO.
 *
 * Li scrive il triage appena ha finito di leggere DM10 e Lista Inadempienze:
 * due numeri per esercizio, non un testo. Da qui li leggono la scheda Soglie
 * (che così non chiede a mano un dato già nei documenti) e la scheda Indici
 * (che mostra il rapporto scaduti / dovuti accanto agli indici dello stesso
 * anno). Si riscrive tutta a ogni caricamento: è una fotografia, e una
 * fotografia vecchia non deve convivere con una nuova.
 */
export async function salvaContributiPerAnnoAction(
  nomeSchema: string,
  aziendaId: number,
  anni: ContributiAnno[]
): Promise<{ success: boolean; salvati?: number; error?: string }> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaAziende(nomeSchema);
    const puliti = anni
      .filter((a) => Number.isFinite(a.anno))
      .map((a) => ({
        anno: a.anno,
        dovuti: a.dovuti,
        scaduti: a.scaduti,
        // Il ritardo oltre 90 giorni fa parte della serie: lasciarlo fuori
        // dal salvataggio lo faceva sparire al primo ricaricamento della
        // scheda, che rilegge da qui.
        oltre90: a.oltre90 ?? null,
      }))
      .sort((a, b) => a.anno - b.anno);
    await pool.query(
      `UPDATE "${nomeSchema}".aziende
          SET contributi_per_anno = $2::jsonb, contributi_per_anno_origine = 'file'
        WHERE id = $1`,
      [aziendaId, JSON.stringify(puliti)]
    );
    return { success: true, salvati: puliti.length };
  } catch (error: unknown) {
    console.error('[salvaContributiPerAnnoAction] Errore:', error);
    return { success: false, error: `Salvataggio non riuscito: ${(error as Error).message}` };
  }
}

export interface RisultatoContributiPerAnno {
  success: boolean;
  anni?: ContributiAnno[];
  /** Da dove viene la serie (vedi sotto). */
  origine?: 'file' | 'posizioni' | 'valori';
  /** Giorno a cui si riferiscono i valori ricostruiti, se noto. */
  ricostruitaIl?: string | null;
  error?: string;
}

/**
 * I contributi per anno dell'azienda.
 *
 * Prima si leggeva solo la serie scritta dal triage leggendo DM10 e Lista
 * Inadempienze. Per le aziende verificate prima che quella serie esistesse
 * la scheda restava vuota fino a un nuovo caricamento dei file, che però non
 * sono conservati sul server: chi non li ha più non vedeva nulla.
 *
 * Perciò, se la serie non c'è, si ricostruisce da ciò che il triage ha già
 * scritto in database — le posizioni previdenziali (tre anni di scaduti e il
 * dovuto dell'anno precedente) e, in mancanza, i due valori della scheda
 * Soglie. La ricostruzione è parziale e viene dichiarata (`origine`): non si
 * presenta come la serie letta dai file.
 */
export async function ottieniContributiPerAnnoAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoContributiPerAnno> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaAziende(nomeSchema);
    const r = await pool.query(
      `SELECT contributi_per_anno, contributi_per_anno_origine, anno_contributi_dovuti,
              contributi_dovuti_anno_precedente, contributi_scaduti, soglie_aggiornate_al
         FROM "${nomeSchema}".aziende WHERE id = $1`,
      [aziendaId]
    );
    if (r.rows.length === 0) return { success: false, error: 'Azienda non trovata.' };
    const a = r.rows[0];
    const daFile = contributiPerAnnoDaDb(a.contributi_per_anno);
    // L'origine si conserva con la serie: una serie ricostruita dal ricalcolo
    // d'ufficio, riletta qui, non deve passare per la lettura dei file — che
    // è esattamente ciò che faceva scrivendola senza marchio.
    const origineSalvata = (a.contributi_per_anno_origine ?? null) as
      'file' | 'posizioni' | 'valori' | null;
    if (daFile.length > 0)
      return {
        success: true,
        anni: daFile,
        origine: origineSalvata ?? 'file',
        ricostruitaIl:
          origineSalvata && origineSalvata !== 'file'
            ? a.soglie_aggiornate_al
              ? new Date(a.soglie_aggiornate_al).toISOString().slice(0, 10)
              : null
            : null,
      };

    // La data del triage serve ad attribuire gli anni: senza, le posizioni
    // non si datano e si resta sui soli valori che portano il proprio anno.
    const giorno = a.soglie_aggiornate_al
      ? new Date(a.soglie_aggiornate_al).toISOString().slice(0, 10)
      : null;

    const pos = await pool
      .query(
        `SELECT categoria, importo_anno_corrente, importo_anno_precedente, importo_anno_meno2,
                riferimento_anno_precedente
           FROM "${nomeSchema}".debiti_triage WHERE azienda_id = $1`,
        [aziendaId]
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const ricostruita = serieRicostruita({
      giorno,
      posizioni: pos.rows.map((x: Record<string, unknown>) => ({
        categoria: String(x.categoria ?? ''),
        importoAnnoCorrente: num(x.importo_anno_corrente),
        importoAnnoPrecedente: num(x.importo_anno_precedente),
        importoAnnoMeno2: num(x.importo_anno_meno2),
        riferimentoAnnoPrecedente: num(x.riferimento_anno_precedente),
      })),
      annoDovuti: num(a.anno_contributi_dovuti),
      dovuti: num(a.contributi_dovuti_anno_precedente),
      annoScaduti: giorno ? Number(giorno.slice(0, 4)) : null,
      scaduti: num(a.contributi_scaduti),
    });
    return {
      success: true,
      anni: ricostruita.anni,
      origine: ricostruita.origine ?? undefined,
      ricostruitaIl: giorno,
    };
  } catch (error: unknown) {
    console.error('[ottieniContributiPerAnnoAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export interface EsitoRicalcoloSerie {
  success: boolean;
  /** Aziende guardate: quelle passate da una verifica o con posizioni del triage. */
  esaminate?: number;
  /** Serie ricostruite e scritte in database. */
  ricostruite?: number;
  daPosizioni?: number;
  daValori?: number;
  /** Serie già lette dai file: lasciate intatte. */
  daFile?: number;
  /** Aziende senza abbastanza dati: nessuna serie scritta. */
  senzaDati?: number;
  error?: string;
}

/**
 * Ricostruisce d'ufficio la serie dei contributi per anno di tutte le aziende
 * dello spazio, e la conserva.
 *
 * La ricostruzione alla lettura (scheda Indici) copre le aziende una per una.
 * Per guardare il quadro d'insieme — quali posizioni hanno un rapporto che
 * sale, e da quando — serviva aprirle tutte: qui si fa una volta, e il
 * risultato resta in `contributi_per_anno` con la sua origine.
 *
 * Il perimetro sono le aziende passate da una verifica (che ha lasciato la
 * data e i valori) e quelle che hanno posizioni del triage. Le serie già lette
 * dai file non si toccano: la ricostruzione non sostituisce la fonte. Chi non
 * ha abbastanza dati resta fuori dal conteggio delle ricostruite, e viene
 * dichiarato: non si scrive una serie vuota al posto di un'assenza.
 */
export async function ricostruisciContributiPerAnnoSpazioAction(
  nomeSchema: string
): Promise<EsitoRicalcoloSerie> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaAziende(nomeSchema);

    const posizioni = await pool
      .query(
        `SELECT azienda_id, categoria, importo_anno_corrente, importo_anno_precedente,
                importo_anno_meno2, riferimento_anno_precedente
           FROM "${nomeSchema}".debiti_triage`
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const perAzienda = new Map<number, PosizionePerAnno[]>();
    for (const x of posizioni.rows as Record<string, unknown>[]) {
      const id = Number(x.azienda_id);
      if (!Number.isFinite(id)) continue;
      const elenco = perAzienda.get(id) ?? [];
      elenco.push({
        categoria: String(x.categoria ?? ''),
        importoAnnoCorrente: num(x.importo_anno_corrente),
        importoAnnoPrecedente: num(x.importo_anno_precedente),
        importoAnnoMeno2: num(x.importo_anno_meno2),
        riferimentoAnnoPrecedente: num(x.riferimento_anno_precedente),
      });
      perAzienda.set(id, elenco);
    }

    const aziende = await pool.query(
      `SELECT id, contributi_per_anno, anno_contributi_dovuti,
              contributi_dovuti_anno_precedente, contributi_scaduti, soglie_aggiornate_al
         FROM "${nomeSchema}".aziende
        WHERE soglie_aggiornate_al IS NOT NULL
           OR contributi_scaduti IS NOT NULL
           OR contributi_dovuti_anno_precedente IS NOT NULL
           OR anno_contributi_dovuti IS NOT NULL
           OR id = ANY($1::int[])
        ORDER BY id`,
      [Array.from(perAzienda.keys())]
    );

    const daGuardare: AziendaDaRicalcolare[] = aziende.rows.map((a: Record<string, unknown>) => {
      const giorno = a.soglie_aggiornate_al
        ? new Date(a.soglie_aggiornate_al as string).toISOString().slice(0, 10)
        : null;
      return {
        id: Number(a.id),
        anniDaiFile: contributiPerAnnoDaDb(a.contributi_per_anno),
        giorno,
        posizioni: perAzienda.get(Number(a.id)) ?? [],
        annoDovuti: num(a.anno_contributi_dovuti),
        dovuti: num(a.contributi_dovuti_anno_precedente),
        annoScaduti: giorno ? Number(giorno.slice(0, 4)) : null,
        scaduti: num(a.contributi_scaduti),
      };
    });

    const piano = pianoRicalcoloSerie(daGuardare);
    for (const aggiornamento of piano) {
      await pool.query(
        `UPDATE "${nomeSchema}".aziende
            SET contributi_per_anno = $2::jsonb, contributi_per_anno_origine = $3
          WHERE id = $1`,
        [aggiornamento.aziendaId, JSON.stringify(aggiornamento.anni), aggiornamento.origine]
      );
    }

    const ricostruite = new Set(piano.map((p) => p.aziendaId));
    return {
      success: true,
      esaminate: daGuardare.length,
      ricostruite: piano.length,
      daPosizioni: piano.filter((p) => p.origine === 'posizioni').length,
      daValori: piano.filter((p) => p.origine === 'valori').length,
      daFile: daGuardare.filter((a) => a.anniDaiFile.length > 0).length,
      senzaDati: daGuardare.filter((a) => a.anniDaiFile.length === 0 && !ricostruite.has(a.id))
        .length,
    };
  } catch (error: unknown) {
    console.error('[ricostruisciContributiPerAnnoSpazioAction] Errore:', error);
    return { success: false, error: `Ricalcolo non riuscito: ${(error as Error).message}` };
  }
}

export interface RisultatoEsitoSoglie {
  success: boolean;
  esito?: EsitoSoglie;
  /** Ente di riferimento dello spazio ENTE; null se non configurato. */
  ente?: Ente25Novies | null;
  /** Categorie dei Limiti di Ricevibilita' prive di collegamento all'ente. */
  categorieSenzaEnte?: string[];
  error?: string;
  /** Valore usato per ciascun importo e la sua fonte (triage, scheda, V.E.R.A.). */
  usati?: ValoriUsati;
}

/**
 * Valuta le soglie.
 *
 * @param tipoSpazio ENTE = una sola soglia, la propria (letta da
 *                   `ente_25novies` sui Limiti di Ricevibilita');
 *                   NON_ENTE = tutte, perche' e' l'insieme a definire il
 *                   tempo che l'impresa ha.
 */
export async function valutaSoglieAction(
  nomeSchema: string,
  aziendaId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE',
  /**
   * I VALORI APPENA LETTI DAI FOGLI, che hanno la precedenza su ciò che è
   * salvato.
   *
   * Serve al triage: nel momento in cui valuta le soglie ha in mano i numeri
   * appena estratti dai documenti, mentre il database può ancora avere i campi
   * vuoti — o averli scritti un istante prima da un salvataggio che non è
   * arrivato. Senza questo passaggio la pagina mostrava i valori e la finestra
   * delle soglie li dichiarava «non determinabili»: due schermate, due verità,
   * sullo stesso fascicolo e nello stesso minuto.
   *
   * `undefined` = non fornito, vale ciò che è salvato: un campo che il triage
   * non conosce non deve cancellare quello scritto in scheda.
   */
  daSessione?: Partial<DatiSoglie>
): Promise<RisultatoEsitoSoglie> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);

    // Stessa lettura dell'indicatore del triage: posizioni della tabella,
    // anagrafica, V.E.R.A. e — soprattutto — il ritardo oltre 90 giorni che
    // il triage ha calcolato dalle inadempienze/deleghe. Prima qui era fisso
    // a null e lo Screening diceva «esito non esprimibile».
    const lettura = await leggiDatiSoglieAzienda(nomeSchema, aziendaId);
    if (!lettura) return { success: false, error: 'Azienda non trovata.' };

    let ente: Ente25Novies | null = null;
    let categorieSenzaEnte: string[] = [];
    if (tipoSpazio === 'ENTE') {
      const r = await pool.query(
        `SELECT categoria_creditore, ente_25novies FROM "${nomeSchema}".limiti_ricevibilita`
      );
      const conEnte = r.rows.filter((x) => x.ente_25novies);
      // Se piu' righe puntano a enti diversi lo spazio e' configurato in modo
      // ambiguo: non si sceglie per conto proprio.
      const distinti = Array.from(new Set(conEnte.map((x) => String(x.ente_25novies))));
      ente = distinti.length === 1 ? (distinti[0] as Ente25Novies) : null;
      categorieSenzaEnte = r.rows
        .filter((x) => !x.ente_25novies && String(x.categoria_creditore) !== 'Generale')
        .map((x) => String(x.categoria_creditore));
    }

    // Solo le chiavi fornite: uno spread con `undefined` cancellerebbe il
    // valore salvato, che è l'esatto contrario di «non lo conosco».
    const dallaSessione: Partial<DatiSoglie> = {};
    for (const [chiave, valore] of Object.entries(daSessione ?? {})) {
      if (valore !== undefined) (dallaSessione as Record<string, unknown>)[chiave] = valore;
    }
    const dati: DatiSoglie = {
      ...lettura.dati,
      ...dallaSessione,
      vociImportoIgnoto: await contaVociVeraIgnote(nomeSchema, aziendaId),
    };

    // Soglie configurate per lo spazio, non costanti.
    const par = await ottieniParametriSoglieAction(nomeSchema);
    const esito = calcolaSoglie25Novies(
      dati,
      tipoSpazio === 'ENTE' ? (ente ?? undefined) : undefined,
      par.parametri
    );

    if (tipoSpazio === 'ENTE' && ente === null) {
      esito.datiMancanti.unshift(
        'Ente di riferimento non determinato: nessuna riga dei Parametri di riscontro della proposta è collegata a un ente dell’art. 25-novies, oppure più righe puntano a enti diversi. Nessuna soglia è stata applicata.'
      );
    }

    return { success: true, esito, ente, categorieSenzaEnte, usati: lettura.usati };
  } catch (error: unknown) {
    console.error('[valutaSoglieAction] Errore:', error);
    return { success: false, error: `Valutazione non riuscita: ${(error as Error).message}` };
  }
}

/** Voci V.E.R.A. «potenziali» a importo non noto per l'azienda (0 se la tabella manca). */
async function contaVociVeraIgnote(nomeSchema: string, aziendaId: number): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "${nomeSchema}".debiti_vera WHERE azienda_id = $1 AND trattamento = 'potenziale'`,
      [aziendaId]
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
