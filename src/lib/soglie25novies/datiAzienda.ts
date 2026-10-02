// src/lib/soglie25novies/datiAzienda.ts
//
// UNA sola lettura dei dati delle soglie dell'art. 25-novies per un'azienda,
// usata sia dall'indicatore di attenzione (triage) sia dalla valutazione delle
// soglie (Screening, Riscontri normativi, IAI, scheda Soglie).
//
// Prima le due letture erano separate e divergevano: la valutazione delle
// soglie scriveva `ritardoOltre90Giorni: null` in modo fisso e ignorava le
// posizioni del triage e il V.E.R.A. Il triage calcolava e salvava il ritardo
// dalla lista delle inadempienze o dalle deleghe, ma lo Screening diceva
// comunque «esito non esprimibile per dati mancanti». Ora la fonte è una.
//
// Modulo lato server (usa il pool): lo chiamano solo azioni che hanno già
// verificato l'accesso allo schema.

import { pool } from '@/lib/db';
import { assicuraTabellaAziende, assicuraTabelleVera } from '@/db/provision';
import type { DatiSoglie } from './calcolo';
import { formaAERdaAnagrafica } from './formaAER';
import { ottieniDebitiTriageAction } from '@/app/actions/debitiTriage';
import { valoriSoglieDaPosizioni } from '@/lib/debitiTriage/modello';

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface DatiSoglieAzienda {
  dati: DatiSoglie;
  /** Elenco dei periodi di denuncia non presentati rilevati dal triage (testo), se conservato. */
  denunceNonPresentate: string | null;
  /** true se il triage ha conservato l'esito sulle denunce (anche «nessuna mancante»). */
  esitoDenunceConservato: boolean;
  /** Esposizione verso l'ente: valore manuale, altrimenti somma del V.E.R.A. */
  esposizione: number | null;
}

export async function leggiDatiSoglieAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<DatiSoglieAzienda | null> {
  await assicuraTabellaAziende(nomeSchema);
  await assicuraTabelleVera(nomeSchema);
  const az = await pool.query(
    `SELECT anno_costituzione, forma_giuridica, con_lavoratori_subordinati,
            contributi_scaduti, contributi_dovuti_anno_precedente, anno_contributi_dovuti,
            sanzioni_presunte_vera, premi_inail, iva_scaduta, volume_affari, crediti_affidati_aer,
            ritardo_oltre_90_giorni, periodi_in_ritardo, denunce_non_presentate, soglie_aggiornate_al
       FROM "${nomeSchema}".aziende WHERE id = $1`,
    [aziendaId]
  );
  if (az.rows.length === 0) return null;
  const a = az.rows[0];

  // Esposizione dal V.E.R.A., solo come ripiego (vedi attenzioneScreening).
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
  const esposizione = num(a.contributi_scaduti) ?? (daVera > 0 ? daVera : null);

  // Le posizioni della tabella del triage hanno la precedenza: sono i numeri
  // reali su cui si calcolano le soglie.
  const posizioniRis = await ottieniDebitiTriageAction(nomeSchema, aziendaId);
  const daPosizioni = valoriSoglieDaPosizioni(posizioniRis.righe ?? []);

  const dati: DatiSoglie = {
    conLavoratori:
      a.con_lavoratori_subordinati === null || a.con_lavoratori_subordinati === undefined
        ? null
        : Boolean(a.con_lavoratori_subordinati),
    contributiScaduti:
      daPosizioni.contributiScaduti ?? num(a.contributi_scaduti) ?? esposizione ?? null,
    contributiDovutiAnnoPrecedente:
      daPosizioni.contributiDovutiAnnoPrecedente ?? num(a.contributi_dovuti_anno_precedente),
    annoContributiDovuti: num(a.anno_contributi_dovuti),
    sanzioniPresunte: num(a.sanzioni_presunte_vera),
    premiInail: daPosizioni.premiInail ?? num(a.premi_inail),
    ivaScaduta: daPosizioni.ivaScaduta ?? num(a.iva_scaduta),
    volumeAffari: daPosizioni.volumeAffari ?? num(a.volume_affari),
    creditiAffidati: num(a.crediti_affidati_aer),
    formaAER: formaAERdaAnagrafica(a.forma_giuridica),
    ritardoOltre90Giorni:
      a.ritardo_oltre_90_giorni === null || a.ritardo_oltre_90_giorni === undefined
        ? null
        : Boolean(a.ritardo_oltre_90_giorni),
  };
  return {
    dati,
    esposizione,
    denunceNonPresentate: a.denunce_non_presentate ? String(a.denunce_non_presentate) : null,
    // Stringa vuota = Elenco denunce letto, nessun periodo mancante.
    esitoDenunceConservato:
      a.denunce_non_presentate !== null && a.denunce_non_presentate !== undefined,
  };
}
