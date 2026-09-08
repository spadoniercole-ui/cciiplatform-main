// src/lib/soglie25novies/calcolo.ts
//
// Soglie di segnalazione dei creditori pubblici qualificati
// (art. 25-novies, comma 1, CCII).
//
// FONTE — le sette righe replicano verbatim le prime sette voci di SOGLIE in
// src/lib/normativa/dati.ts, che riportano il testo dell'articolo. Se un
// giorno una riforma cambia una soglia, si cambia in Normativa e qui, e i
// test sotto devono rompersi.
//
// ---------------------------------------------------------------------------
// DUE LETTURE DELLA STESSA COSA
//
// RICEVENTE (spazio ENTE): guarda UNA soglia, la propria. Quale sia lo dice
// la colonna `ente_25novies` sulla riga dei Limiti di Ricevibilita'. Se non
// e' impostata, non si applica nulla e lo si dichiara: mostrare le soglie
// INPS a un valutatore INAIL sarebbe un dato sbagliato presentato con la
// stessa sicurezza di uno giusto.
//
// REDIGENTE (spazio NON_ENTE): guarda TUTTE le soglie insieme, perche' e'
// l'insieme a definire quanto tempo ha prima che qualcuno segnali. La resa
// non e' una griglia ma un paragrafo.
//
// ---------------------------------------------------------------------------
// SU COSA GIRA IL TEST: sul CONTRIBUTO, non sul contributo piu' sanzioni
//
// Il delta fra Posizione V.E.R.A. e contabilizzato e', nella prassi, il
// calcolo delle SANZIONI: la contabilita' dell'ente non le espone perche'
// vanno determinate al momento del pagamento; VERA le propone su una
// presunzione, che la piattaforma acquisisce come tale.
//
// Le sanzioni civili sono un accessorio e possono valere il 40-60% del
// contributo. Il test confronta i CONTRIBUTI non versati con il 30% dei
// CONTRIBUTI dovuti: metterle al numeratore contro un denominatore di soli
// contributi gonfierebbe il rapporto per costruzione. Confermato da Ercole
// sulla prassi INPS: la soglia si misura sul contributo.
//
// ---------------------------------------------------------------------------
// "OLTRE SOGLIA" NON E' MAI "SEGNALAZIONE DOVUTA"
//
// Ogni fattispecie dell'art. 25-novies richiede anche il ritardo di oltre
// NOVANTA GIORNI. I dati della piattaforma non lo dimostrano: i tracciati non
// portano la data di scadenza delle singole partite. Il motore percio' non
// afferma mai che una segnalazione e' dovuta: dichiara il superamento,
// elenca cio' che non ha verificato, e raccomanda di accertare il requisito
// temporale prima di procedere.
// ---------------------------------------------------------------------------

/** Enti tenuti alla segnalazione. Elenco chiuso. */
export type Ente25Novies = 'INPS' | 'INAIL' | 'AGENZIA_ENTRATE' | 'AGENZIA_RISCOSSIONE';

export const ETICHETTA_ENTE: Record<Ente25Novies, string> = {
  INPS: 'INPS',
  INAIL: 'INAIL',
  AGENZIA_ENTRATE: 'Agenzia delle Entrate',
  AGENZIA_RISCOSSIONE: 'Agenzia Entrate-Riscossione',
};

export const SOGLIE_25NOVIES = {
  inpsPercentuale: 0.3,
  inpsImportoConLavoratori: 15_000,
  inpsImportoSenzaLavoratori: 5_000,
  inail: 5_000,
  ivaImporto: 5_000,
  ivaPercentualeVolumeAffari: 0.1,
  ivaImportoAssoluto: 20_000,
  aerImpresaIndividuale: 100_000,
  aerSocietaPersone: 200_000,
  aerAltreSocieta: 500_000,
  giorniRitardo: 90,
} as const;

/**
 * Forma giuridica, per scegliere la soglia AER. Non e' un campo nuovo:
 * l'anagrafica azienda la contiene gia'.
 */
export type FormaAER = 'IMPRESA_INDIVIDUALE' | 'SOCIETA_PERSONE' | 'ALTRE_SOCIETA';

/** Dati inseriti a mano dall'operatore, per azienda. */
export interface DatiSoglie {
  /** null = non dichiarato. Sceglie quale delle due righe INPS si applica. */
  conLavoratori: boolean | null;
  /** Contributi previdenziali scaduti e non versati (flusso UNIEMENS). */
  contributiScaduti: number | null;
  /** Totale contributi DOVUTI nell'anno precedente. Base del 30%. */
  contributiDovutiAnnoPrecedente: number | null;
  annoContributiDovuti: number | null;
  /** Sanzioni presunte dal file V.E.R.A. Mostrate, mai nel test. */
  sanzioniPresunte: number | null;
  /** Premi assicurativi non versati (INAIL). */
  premiInail: number | null;
  /** Debito IVA scaduto da liquidazioni periodiche. */
  ivaScaduta: number | null;
  /** Volume d'affari dell'anno precedente. Base del 10%. */
  volumeAffari: number | null;
  /** Crediti affidati all'Agente della Riscossione, scaduti. */
  creditiAffidati: number | null;
  /** Dall'anagrafica azienda; null = forma giuridica non riconosciuta. */
  formaAER: FormaAER | null;
}

export type EsitoSoglia = 'sotto' | 'sopra' | 'non_determinabile';

export interface RigaSoglia {
  ente: Ente25Novies;
  ambito: string;
  descrizione: string;
  valore: string;
  /** Si applica a questa impresa? (es. le righe AER dipendono dalla forma) */
  applicabile: boolean;
  esito: EsitoSoglia;
  motivo: string;
  /** Importo confrontato con la soglia; null se non disponibile. */
  esposizione: number | null;
}

export interface EsitoSoglie {
  righe: RigaSoglia[];
  /** Righe applicabili risultate oltre soglia. */
  superate: RigaSoglia[];
  /** Righe applicabili il cui esito non e' determinabile per dati mancanti. */
  nonDeterminabili: RigaSoglia[];
  datiMancanti: string[];
  /** INPS: contributi sotto soglia, ma con le sanzioni presunte la supererebbe. */
  inpsSopraSoloConSanzioni: boolean;
}

function euro(n: number): string {
  return `${Math.round(n).toLocaleString('it-IT')} €`;
}

const val = (n: number | null | undefined): number | null =>
  n === null || n === undefined || Number.isNaN(n) ? null : n;

/**
 * Calcola tutte le righe. Funzione PURA: nessun database, nessuna AI,
 * aritmetica ricontrollabile a mano.
 *
 * @param soloEnte se valorizzato, restituisce le sole righe di quell'ente
 *                 (uso Ricevente). Omesso = tutte (uso Redigente).
 */
export function calcolaSoglie25Novies(dati: DatiSoglie, soloEnte?: Ente25Novies): EsitoSoglie {
  const righe: RigaSoglia[] = [];
  const datiMancanti: string[] = [];

  // Il requisito temporale non e' mai dimostrabile con i dati odierni.
  datiMancanti.push(
    `Requisito del ritardo di oltre ${SOGLIE_25NOVIES.giorniRitardo} giorni: non ricavabile dai dati disponibili, che non portano la data di scadenza delle singole partite.`
  );

  // ---- INPS -----------------------------------------------------------
  const contributi = val(dati.contributiScaduti);
  const dovuti = val(dati.contributiDovutiAnnoPrecedente);
  const sanzioni = val(dati.sanzioniPresunte) ?? 0;
  const sogliaPerc = dovuti !== null ? dovuti * SOGLIE_25NOVIES.inpsPercentuale : null;

  let inpsSopraSoloConSanzioni = false;

  // Riga 1: CON lavoratori — requisiti CONGIUNTI.
  {
    const applicabile = dati.conLavoratori === true;
    let esito: EsitoSoglia = 'non_determinabile';
    let motivo: string;
    if (contributi === null) {
      motivo = 'Contributi previdenziali scaduti non inseriti: esito non determinabile.';
    } else if (sogliaPerc === null) {
      motivo =
        'Manca il totale dei contributi dovuti nell’anno precedente: il 30% non è calcolabile, quindi il concorso dei due requisiti non è verificabile.';
    } else {
      const oltrePerc = contributi > sogliaPerc;
      const oltreImp = contributi > SOGLIE_25NOVIES.inpsImportoConLavoratori;
      esito = oltrePerc && oltreImp ? 'sopra' : 'sotto';
      motivo =
        `Contributi ${euro(contributi)} — 30% dei dovuti: ${euro(sogliaPerc)} (${oltrePerc ? 'superato' : 'non superato'}); ` +
        `${euro(SOGLIE_25NOVIES.inpsImportoConLavoratori)} (${oltreImp ? 'superato' : 'non superato'}). ` +
        `Requisiti congiunti: ${esito === 'sopra' ? 'entrambi superati' : 'non entrambi superati'}.`;
      if (applicabile && esito === 'sotto' && sanzioni > 0) {
        const tot = contributi + sanzioni;
        inpsSopraSoloConSanzioni =
          tot > sogliaPerc && tot > SOGLIE_25NOVIES.inpsImportoConLavoratori;
      }
    }
    righe.push({
      ente: 'INPS',
      ambito: 'Segnalazione INPS — imprese CON lavoratori',
      descrizione:
        'Ritardo di oltre 90 giorni nel versamento di contributi previdenziali di ammontare superiore alla soglia (entrambi i requisiti).',
      valore: '> 30% dei contributi dovuti nell’anno precedente E > 15.000 €',
      applicabile,
      esito,
      motivo,
      esposizione: contributi,
    });
  }

  // Riga 2: SENZA lavoratori — solo importo.
  {
    const applicabile = dati.conLavoratori === false;
    let esito: EsitoSoglia = 'non_determinabile';
    let motivo = 'Contributi previdenziali scaduti non inseriti: esito non determinabile.';
    if (contributi !== null) {
      const oltre = contributi > SOGLIE_25NOVIES.inpsImportoSenzaLavoratori;
      esito = oltre ? 'sopra' : 'sotto';
      motivo =
        `Contributi ${euro(contributi)} — soglia ${euro(SOGLIE_25NOVIES.inpsImportoSenzaLavoratori)}: ` +
        `${oltre ? 'superata' : 'non superata'}. Nessun vincolo percentuale per questa fattispecie.`;
      if (applicabile && !oltre && sanzioni > 0) {
        inpsSopraSoloConSanzioni =
          contributi + sanzioni > SOGLIE_25NOVIES.inpsImportoSenzaLavoratori;
      }
    }
    righe.push({
      ente: 'INPS',
      ambito: 'Segnalazione INPS — imprese SENZA lavoratori',
      descrizione: 'Ritardo di oltre 90 giorni nel versamento di contributi previdenziali.',
      valore: '> 5.000 €',
      applicabile,
      esito,
      motivo,
      esposizione: contributi,
    });
  }

  if (dati.conLavoratori === null) {
    datiMancanti.push(
      'Presenza di lavoratori subordinati/parasubordinati non dichiarata: non è possibile stabilire quale delle due soglie INPS si applichi.'
    );
  }
  if (sanzioni > 0) {
    datiMancanti.push(
      'Le sanzioni indicate dalla Posizione V.E.R.A. sono una PRESUNZIONE: si determinano al momento del pagamento. Restano fuori dal test, che si misura sui soli contributi.'
    );
  }

  // ---- INAIL ----------------------------------------------------------
  {
    const premi = val(dati.premiInail);
    let esito: EsitoSoglia = 'non_determinabile';
    let motivo = 'Premi assicurativi non versati non inseriti: esito non determinabile.';
    if (premi !== null) {
      const oltre = premi > SOGLIE_25NOVIES.inail;
      esito = oltre ? 'sopra' : 'sotto';
      motivo = `Premi ${euro(premi)} — soglia ${euro(SOGLIE_25NOVIES.inail)}: ${oltre ? 'superata' : 'non superata'}.`;
    }
    righe.push({
      ente: 'INAIL',
      ambito: 'Segnalazione INAIL',
      descrizione: 'Debito per premi assicurativi scaduto da oltre 90 giorni e non versato.',
      valore: '> 5.000 €',
      applicabile: true,
      esito,
      motivo,
      esposizione: premi,
    });
  }

  // ---- Agenzia delle Entrate (IVA) ------------------------------------
  // Due vie autonome: (a) oltre 5.000 € E almeno il 10% del volume d'affari;
  // (b) in ogni caso oltre 20.000 €, senza vincolo percentuale.
  {
    const iva = val(dati.ivaScaduta);
    const volume = val(dati.volumeAffari);
    let esito: EsitoSoglia = 'non_determinabile';
    let motivo = 'Debito IVA scaduto non inserito: esito non determinabile.';
    if (iva !== null) {
      const viaAssoluta = iva > SOGLIE_25NOVIES.ivaImportoAssoluto;
      if (viaAssoluta) {
        esito = 'sopra';
        motivo = `IVA scaduta ${euro(iva)} — oltre ${euro(SOGLIE_25NOVIES.ivaImportoAssoluto)}: segnalazione dovuta in ogni caso, senza vincolo percentuale.`;
      } else if (volume === null) {
        motivo = `IVA scaduta ${euro(iva)} — sotto ${euro(SOGLIE_25NOVIES.ivaImportoAssoluto)}. Manca il volume d’affari: il requisito del 10% non è calcolabile.`;
      } else {
        const sogliaVol = volume * SOGLIE_25NOVIES.ivaPercentualeVolumeAffari;
        const oltreImp = iva > SOGLIE_25NOVIES.ivaImporto;
        const oltrePerc = iva >= sogliaVol;
        esito = oltreImp && oltrePerc ? 'sopra' : 'sotto';
        motivo =
          `IVA scaduta ${euro(iva)} — ${euro(SOGLIE_25NOVIES.ivaImporto)} (${oltreImp ? 'superato' : 'non superato'}); ` +
          `10% del volume d’affari: ${euro(sogliaVol)} (${oltrePerc ? 'raggiunto' : 'non raggiunto'}). ` +
          `Requisiti congiunti: ${esito === 'sopra' ? 'entrambi soddisfatti' : 'non entrambi soddisfatti'}.`;
      }
    }
    righe.push({
      ente: 'AGENZIA_ENTRATE',
      ambito: 'Segnalazione Agenzia delle Entrate (IVA)',
      descrizione:
        'Debito IVA scaduto e non versato risultante dalle liquidazioni periodiche, superiore alla soglia e comunque non inferiore al 10% del volume d’affari dell’anno precedente; segnalazione in ogni caso oltre 20.000 €.',
      valore: '> 5.000 € (e ≥ 10% del volume d’affari) — in ogni caso se > 20.000 €',
      applicabile: true,
      esito,
      motivo,
      esposizione: iva,
    });
  }

  // ---- Agenzia Entrate-Riscossione — tre righe per forma giuridica -----
  {
    const crediti = val(dati.creditiAffidati);
    const forme: { forma: FormaAER; soglia: number; ambito: string; valore: string }[] = [
      {
        forma: 'IMPRESA_INDIVIDUALE',
        soglia: SOGLIE_25NOVIES.aerImpresaIndividuale,
        ambito: 'Segnalazione Agenzia Entrate-Riscossione — imprese individuali',
        valore: '> 100.000 €',
      },
      {
        forma: 'SOCIETA_PERSONE',
        soglia: SOGLIE_25NOVIES.aerSocietaPersone,
        ambito: 'Segnalazione Agenzia Entrate-Riscossione — società di persone',
        valore: '> 200.000 €',
      },
      {
        forma: 'ALTRE_SOCIETA',
        soglia: SOGLIE_25NOVIES.aerAltreSocieta,
        ambito: 'Segnalazione Agenzia Entrate-Riscossione — altre società',
        valore: '> 500.000 €',
      },
    ];
    for (const f of forme) {
      const applicabile = dati.formaAER === f.forma;
      let esito: EsitoSoglia = 'non_determinabile';
      let motivo = 'Crediti affidati all’Agente della Riscossione non inseriti.';
      if (crediti !== null) {
        const oltre = crediti > f.soglia;
        esito = oltre ? 'sopra' : 'sotto';
        motivo = `Crediti affidati ${euro(crediti)} — soglia ${euro(f.soglia)}: ${oltre ? 'superata' : 'non superata'}.`;
      }
      righe.push({
        ente: 'AGENZIA_RISCOSSIONE',
        ambito: f.ambito,
        descrizione: 'Crediti affidati, scaduti da oltre 90 giorni.',
        valore: f.valore,
        applicabile,
        esito,
        motivo,
        esposizione: crediti,
      });
    }
    if (dati.formaAER === null) {
      datiMancanti.push(
        'Forma giuridica non riconosciuta fra quelle previste dall’art. 25-novies: nessuna delle tre soglie dell’Agente della Riscossione è stata applicata.'
      );
    }
  }

  const filtrate = soloEnte ? righe.filter((r) => r.ente === soloEnte) : righe;
  const applicabili = filtrate.filter((r) => r.applicabile);

  return {
    righe: filtrate,
    superate: applicabili.filter((r) => r.esito === 'sopra'),
    nonDeterminabili: applicabili.filter((r) => r.esito === 'non_determinabile'),
    datiMancanti,
    inpsSopraSoloConSanzioni:
      inpsSopraSoloConSanzioni && (!soloEnte || soloEnte === 'INPS') ? true : false,
  };
}
