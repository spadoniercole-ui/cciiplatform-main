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
import { assicuraTabelleParametriSpazio } from '@/db/provision';
import {
  calcolaSoglie25Novies,
  type DatiSoglie,
  type EsitoSoglie,
  type Ente25Novies,
  type FormaAER,
} from '@/lib/soglie25novies/calcolo';
import { formaAERdaAnagrafica } from '@/lib/soglie25novies/formaAER';
import { calcolaCoerenza, type EsitoCoerenza } from '@/lib/soglie25novies/coerenza';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { ottieniDebitiVera } from '@/app/actions/posizioneVera';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';

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
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const r = await pool.query(
      `SELECT con_lavoratori_subordinati, contributi_scaduti, contributi_dovuti_anno_precedente,
              anno_contributi_dovuti, sanzioni_presunte_vera, premi_inail, iva_scaduta,
              volume_affari, crediti_affidati_aer, soglie_aggiornate_al, forma_giuridica
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
      },
      formaAER: formaAERdaAnagrafica(a.forma_giuridica),
      formaGiuridicaTesto: a.forma_giuridica ?? null,
    };
  } catch (error: unknown) {
    console.error('[ottieniValoriSoglieAction] Errore:', error);
    return { success: false, error: `Lettura non riuscita: ${(error as Error).message}` };
  }
}

export async function salvaValoriSoglieAction(
  nomeSchema: string,
  aziendaId: number,
  valori: ValoriSoglie
): Promise<{ success: boolean; error?: string }> {
  try {
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

export interface RisultatoEsitoSoglie {
  success: boolean;
  esito?: EsitoSoglie;
  /** Ente di riferimento dello spazio ENTE; null se non configurato. */
  ente?: Ente25Novies | null;
  /** Categorie dei Limiti di Ricevibilita' prive di collegamento all'ente. */
  categorieSenzaEnte?: string[];
  error?: string;
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
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoEsitoSoglie> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleParametriSpazio(nomeSchema);

    const lettura = await ottieniValoriSoglieAction(nomeSchema, aziendaId);
    if (!lettura.success || !lettura.valori) {
      return { success: false, error: lettura.error };
    }
    const v = lettura.valori;

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

    const dati: DatiSoglie = {
      conLavoratori: v.conLavoratoriSubordinati,
      contributiScaduti: v.contributiScaduti,
      contributiDovutiAnnoPrecedente: v.contributiDovutiAnnoPrecedente,
      annoContributiDovuti: v.annoContributiDovuti,
      sanzioniPresunte: v.sanzioniPresunteVera,
      premiInail: v.premiInail,
      ivaScaduta: v.ivaScaduta,
      volumeAffari: v.volumeAffari,
      creditiAffidati: v.creditiAffidatiAer,
      formaAER: lettura.formaAER ?? null,
    };

    const esito = calcolaSoglie25Novies(
      dati,
      tipoSpazio === 'ENTE' ? (ente ?? undefined) : undefined
    );

    if (tipoSpazio === 'ENTE' && ente === null) {
      esito.datiMancanti.unshift(
        'Ente di riferimento non determinato: nessuna riga dei Limiti di Ricevibilità è collegata a un ente dell’art. 25-novies, oppure più righe puntano a enti diversi. Nessuna soglia è stata applicata.'
      );
    }

    return { success: true, esito, ente, categorieSenzaEnte };
  } catch (error: unknown) {
    console.error('[valutaSoglieAction] Errore:', error);
    return { success: false, error: `Valutazione non riuscita: ${(error as Error).message}` };
  }
}

export interface RisultatoCoerenzaSoglie {
  success: boolean;
  coerenza?: EsitoCoerenza;
  totaleImportiMappa?: number;
  totaleDebitoria?: number | null;
  anniDebitoria?: number[];
  totaleVera?: number | null;
  error?: string;
}

/**
 * Controlli di coerenza (non bloccanti) fra la mappa soglie e i dati
 * oggettivi (Posizione Debitoria + VERA). Ricalcolati al volo, mai memorizzati.
 */
export async function verificaCoerenzaSoglieAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoCoerenzaSoglie> {
  try {
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    const [lettura, debitiRis, veraRis, categorieRis] = await Promise.all([
      ottieniValoriSoglieAction(nomeSchema, aziendaId),
      ottieniDebitiEnte(nomeSchema, aziendaId),
      ottieniDebitiVera(nomeSchema, aziendaId),
      ottieniCategorieTipoDebito(nomeSchema),
    ]);
    if (!lettura.success || !lettura.valori) {
      return { success: false, error: lettura.error };
    }
    const v = lettura.valori;

    // Somma degli importi «da segnalazione» inseriti nella mappa.
    const importi = [v.contributiScaduti, v.premiInail, v.ivaScaduta, v.creditiAffidatiAer];
    const totaleImportiMappa = importi.reduce<number>((acc, n) => acc + (n ?? 0), 0);
    const mappaCompilata = importi.some((n) => n !== null && n !== undefined);

    // Esposizione + anni dalla Posizione Debitoria (solo categorie che contribuiscono).
    let totaleDebitoria: number | null = null;
    const anniSet = new Set<number>();
    if (debitiRis.success && debitiRis.righe.length > 0) {
      const noContrib = new Set(
        (categorieRis.success ? categorieRis.categorie : [])
          .filter((c) => c.contribuisce === false)
          .map((c) => c.codice)
      );
      totaleDebitoria = debitiRis.righe
        .filter((r) => !noContrib.has(r.tipo))
        .reduce((acc, r) => acc + (r.importo - (r.importoVersato ?? 0)), 0);
      for (const r of debitiRis.righe) {
        if (r.data) {
          const anno = Number(String(r.data).slice(0, 4));
          if (!Number.isNaN(anno)) anniSet.add(anno);
        }
      }
    }
    const anniDebitoria = Array.from(anniSet).sort();

    // Esposizione VERA (contabilizzato + da contabilizzare).
    let totaleVera: number | null = null;
    if (veraRis.success && veraRis.righe.length > 0) {
      totaleVera = veraRis.righe
        .filter((r) => r.trattamento === 'contabilizzato' || r.trattamento === 'da_contabilizzare')
        .reduce((acc, r) => acc + r.importo, 0);
    }

    const coerenza = calcolaCoerenza({
      totaleImportiMappa,
      mappaCompilata,
      annoRiferimento: v.annoContributiDovuti,
      totaleDebitoria,
      anniDebitoria,
      totaleVera,
    });

    return {
      success: true,
      coerenza,
      totaleImportiMappa,
      totaleDebitoria,
      anniDebitoria,
      totaleVera,
    };
  } catch (error: unknown) {
    console.error('[verificaCoerenzaSoglieAction] Errore:', error);
    return { success: false, error: `Verifica coerenza non riuscita: ${(error as Error).message}` };
  }
}
