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
import { scegliValore, type ValoriUsati } from './fonti';

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface DatiSoglieAzienda {
  dati: DatiSoglie;
  /** Elenco dei periodi di denuncia non presentati rilevati dal triage (testo), se conservato. */
  denunceNonPresentate: string | null;
  /** true se il triage ha conservato l'esito sulle denunce (anche «nessuna mancante»). */
  esitoDenunceConservato: boolean;
  /**
   * Esposizione contributiva verso l'ente: valore manuale, altrimenti i
   * contributi del V.E.R.A. (al netto di sanzioni e crediti già a ruolo).
   */
  esposizione: number | null;
  /** Valore effettivamente usato per ciascun importo e la sua fonte (vedi fonti.ts). */
  usati: ValoriUsati;
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
  //
  // Le tre poste NON si sommano: i contributi alimentano la soglia INPS
  // (lett. a), le sanzioni sono presunte e restano fuori dal test, i crediti
  // già affidati all'Agente della Riscossione appartengono alla lett. d).
  // Prima si sommava tutto e un'impresa con 23.600 € di cartelle ma 16.756 €
  // di contributi risultava sopra la soglia INPS per un debito che non era
  // più dell'Istituto.
  const espVera = await pool
    .query(
      `SELECT
         COALESCE(SUM(COALESCE(v.contributi, v.importo))
           FILTER (WHERE v.ambito <> 'AGENTE_RISCOSSIONE'), 0) AS contributi,
         COALESCE(SUM(COALESCE(v.sanzioni, 0))
           FILTER (WHERE v.ambito <> 'AGENTE_RISCOSSIONE'), 0) AS sanzioni,
         COALESCE(SUM(v.importo)
           FILTER (WHERE v.ambito = 'AGENTE_RISCOSSIONE'), 0) AS agenti
         FROM "${nomeSchema}".debiti_vera v
         LEFT JOIN "${nomeSchema}".categorie_tipo_debito c ON c.codice = v.categoria
        WHERE v.azienda_id = $1
          AND v.trattamento IN ('contabilizzato', 'da_contabilizzare')
          AND (c.contribuisce IS NULL OR c.contribuisce = TRUE)`,
      [aziendaId]
    )
    .catch(() => ({ rows: [{ contributi: 0, sanzioni: 0, agenti: 0 }] }));
  const daVera = Number(espVera.rows[0]?.contributi ?? 0);
  const sanzioniVera = Number(espVera.rows[0]?.sanzioni ?? 0);
  const daVeraAgente = Number(espVera.rows[0]?.agenti ?? 0);
  const esposizione = num(a.contributi_scaduti) ?? (daVera > 0 ? daVera : null);

  // Le posizioni della tabella del triage hanno la precedenza: sono i numeri
  // reali su cui si calcolano le soglie.
  const posizioniRis = await ottieniDebitiTriageAction(nomeSchema, aziendaId);
  const daPosizioni = valoriSoglieDaPosizioni(posizioniRis.righe ?? []);

  const usati: ValoriUsati = {};
  const scegli = <K extends keyof ValoriUsati>(
    k: K,
    pos: number | null | undefined,
    man: number | null,
    vera: number | null = null
  ): number | null => {
    const u = scegliValore(pos, man, vera);
    if (u) usati[k] = u;
    return u ? u.valore : null;
  };

  const dati: DatiSoglie = {
    conLavoratori:
      a.con_lavoratori_subordinati === null || a.con_lavoratori_subordinati === undefined
        ? null
        : Boolean(a.con_lavoratori_subordinati),
    contributiScaduti: scegli(
      'contributiScaduti',
      daPosizioni.contributiScaduti,
      num(a.contributi_scaduti),
      daVera
    ),
    contributiDovutiAnnoPrecedente: scegli(
      'contributiDovutiAnnoPrecedente',
      daPosizioni.contributiDovutiAnnoPrecedente,
      num(a.contributi_dovuti_anno_precedente)
    ),
    annoContributiDovuti: num(a.anno_contributi_dovuti),
    // Le sanzioni del V.E.R.A. si mostrano nella riconciliazione; il valore
    // manuale, se inserito, resta quello che vince.
    sanzioniPresunte: num(a.sanzioni_presunte_vera) ?? (sanzioniVera > 0 ? sanzioniVera : null),
    premiInail: scegli('premiInail', daPosizioni.premiInail, num(a.premi_inail)),
    ivaScaduta: scegli('ivaScaduta', daPosizioni.ivaScaduta, num(a.iva_scaduta)),
    volumeAffari: scegli('volumeAffari', daPosizioni.volumeAffari, num(a.volume_affari)),
    // I crediti dell'Agente della Riscossione arrivano dal file «Ruoli
    // esattoriali» o, in mancanza, dalle cartelle dentro il V.E.R.A.
    creditiAffidati: num(a.crediti_affidati_aer) ?? (daVeraAgente > 0 ? daVeraAgente : null),
    formaAER: formaAERdaAnagrafica(a.forma_giuridica),
    ritardoOltre90Giorni:
      a.ritardo_oltre_90_giorni === null || a.ritardo_oltre_90_giorni === undefined
        ? null
        : Boolean(a.ritardo_oltre_90_giorni),
  };
  return {
    dati,
    usati,
    esposizione,
    denunceNonPresentate: a.denunce_non_presentate ? String(a.denunce_non_presentate) : null,
    // Stringa vuota = Elenco denunce letto, nessun periodo mancante.
    esitoDenunceConservato:
      a.denunce_non_presentate !== null && a.denunce_non_presentate !== undefined,
  };
}
