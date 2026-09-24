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
/**
 * Chi opera nello spazio.
 *
 * I primi quattro sono creditori pubblici qualificati: ciascuno valuta la
 * PROPRIA soglia, perche' sta decidendo se segnalare.
 *
 * `NON_PUBBLICO` e' un soggetto che analizza la situazione in ottica CCII
 * senza essere creditore qualificato — il professionista che redige, o un
 * terzo che deve valutare l'impatto di una proposta. Per lui le soglie
 * servono TUTTE: un'azienda con dipendenti e' obbligatoriamente in relazione
 * con INPS, INAIL e Agenzia delle Entrate, e li' si gioca la differenza fra
 * uno stralcio commerciale — dove nella peggiore ipotesi e' il creditore ad
 * assorbire l'insussistenza — e una posizione previdenziale, che ha risvolti
 * su pensioni e sostegni al reddito e richiede percentuali diverse. Capire
 * il debito previdenziale, assicurativo e fiscale e' percio' il primo passo
 * di qualunque proposta seria.
 */
export type Ente25Novies =
  'INPS' | 'INAIL' | 'AGENZIA_ENTRATE' | 'AGENZIA_RISCOSSIONE' | 'NON_PUBBLICO';

export const ETICHETTA_ENTE: Record<Ente25Novies, string> = {
  NON_PUBBLICO: 'Soggetto non pubblico (analisi in ottica CCII)',
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
  /** Voci V.E.R.A. a importo non noto: con almeno una, «sotto soglia» vale solo sui dati quantificati. */
  vociImportoIgnoto?: number;
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
  /**
   * Ritardo di oltre 90 giorni nel versamento: il TERZO requisito.
   *
   * Finora era sempre `null` — "non ricavabile dai dati disponibili" — perché
   * nessun documento portava la data di versamento. L'Elenco Deleghe (F24) la
   * porta, e con quella il requisito diventa accertabile.
   *
   * Attenzione a non confonderlo con il ritardo nella PRESENTAZIONE della
   * denuncia: un'azienda può presentare tutti i flussi puntualmente e non
   * versare un euro. La norma parla di versamento.
   */
  ritardoOltre90Giorni: boolean | null;
  /**
   * Ritardo di oltre 90 giorni sui premi INAIL. Opzionale: oggi nessun
   * documento caricabile lo porta, quindi resta non verificato e l'esito INAIL
   * sopra soglia si dichiara non determinabile invece di darlo per integrato.
   */
  ritardoInail?: boolean | null;
  /**
   * Requisiti della lettera d) oltre all'importo, verificati insieme:
   * carico affidato dal 1° luglio 2022 (comma 4), autodichiarato o
   * definitivamente accertato, scaduto da oltre 90 giorni e non in
   * rateizzazione regolare (la rateizzazione interrompe il conteggio sul
   * debito originario). La parte SOSPESA dal giudice va gia' esclusa
   * dall'importo: un debito sotto contenzioso non e' definitivamente
   * accertato. null = non verificati, e l'esito sopra soglia resta non
   * determinabile.
   */
  requisitiAerVerificati?: boolean | null;
}

export type EsitoSoglia = 'sotto' | 'sopra' | 'non_determinabile';

export interface RigaSoglia {
  ente: Ente25Novies;
  /** Identificativo nel registro delle fonti (src/lib/registroFonti). */
  fonte?: string;
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
/**
 * @param parametri soglie configurate per lo spazio. Omesse = valori di
 *        legge. Esistono perché una riforma non imponga una nuova release,
 *        non perché ogni ente scelga le proprie soglie.
 */
export function calcolaSoglie25Novies(
  dati: DatiSoglie,
  soloEnte?: Ente25Novies,
  // `-readonly` e il tipo number: senza, `as const` rende i valori letterali
  // (5000 e non number) e un parametro diverso non sarebbe assegnabile.
  parametri?: Partial<{ -readonly [K in keyof typeof SOGLIE_25NOVIES]: number }>
): EsitoSoglie {
  const S = { ...SOGLIE_25NOVIES, ...(parametri ?? {}) };
  const righe: RigaSoglia[] = [];
  const datiMancanti: string[] = [];

  // ---- Requisito temporale, PER FATTISPECIE ----------------------------
  //
  // Prima era un campo unico, ricavato dalle deleghe INPS e riportato come
  // lacuna generale. Ma il ritardo di oltre 90 giorni e' un requisito di
  // ciascuna lettera — INPS, INAIL, Agente della Riscossione — con le sue
  // fonti, e NON si applica all'IVA dell'Agenzia delle Entrate, che ha una
  // disciplina temporale propria (verifica di Libra, parte B).
  //
  // Regola: un importo oltre soglia senza il requisito temporale non e' un
  // presupposto integrato. Se il ritardo manca, l'esito e' negativo; se non
  // e' verificabile, l'esito non e' determinabile — e lo si dice.
  const conRequisitoTemporale = (
    esito: EsitoSoglia,
    motivo: string,
    ritardo: boolean | null | undefined,
    importoNoto: boolean,
    serveA: string
  ): { esito: EsitoSoglia; motivo: string } => {
    if (esito === 'sotto') return { esito, motivo };
    if (ritardo === false && importoNoto) {
      return {
        esito: 'sotto',
        motivo: `${motivo} Requisito temporale (oltre ${S.giorniRitardo} giorni): NON integrato — i presupposti oggettivi non risultano integrati, qualunque sia l’importo.`,
      };
    }
    if (esito !== 'sopra') return { esito, motivo };
    if (ritardo === true) {
      return {
        esito: 'sopra',
        motivo: `${motivo} Requisito temporale (oltre ${S.giorniRitardo} giorni): integrato.`,
      };
    }
    return {
      esito: 'non_determinabile',
      motivo: `${motivo} Requisito temporale (oltre ${S.giorniRitardo} giorni): non verificato — ${serveA}.`,
    };
  };

  datiMancanti.push(
    'Applicabilità nel tempo (art. 25-novies, comma 4) non verificata sui dati caricati: la norma si applica ai debiti INPS accertati dal 1° gennaio 2022, INAIL dall’entrata in vigore del Codice, alle LIPE dal secondo trimestre 2022 e ai carichi affidati all’Agente della Riscossione dal 1° luglio 2022.'
  );

  // ---- INPS -----------------------------------------------------------
  const contributi = val(dati.contributiScaduti);
  const dovuti = val(dati.contributiDovutiAnnoPrecedente);
  const sanzioni = val(dati.sanzioniPresunte) ?? 0;
  const sogliaPerc = dovuti !== null ? dovuti * S.inpsPercentuale : null;

  let inpsSopraSoloConSanzioni = false;

  // Riga 1: CON lavoratori — requisiti CONGIUNTI.
  {
    const applicabile = dati.conLavoratori === true;
    let esito: EsitoSoglia = 'non_determinabile';
    let motivo: string;
    if (contributi === null) {
      motivo = 'Contributi previdenziali scaduti non inseriti: esito non determinabile.';
    } else if (sogliaPerc === null) {
      // Il concorso dei due requisiti non e' verificabile, ma la soglia
      // ASSOLUTA e' un fatto e va detto: tacere che 1,2 milioni superano di
      // settanta volte i 15.000 perche' manca l'altro requisito nasconde
      // l'informazione piu' rilevante dietro una formula corretta.
      const oltreAssoluta = contributi > S.inpsImportoConLavoratori;
      motivo =
        `Soglia assoluta di ${euro(S.inpsImportoConLavoratori)}: ${euro(contributi)} — ` +
        `${oltreAssoluta ? 'SUPERATA' : 'non superata'}. ` +
        'Manca invece il totale dei contributi dovuti nell’anno precedente: il 30% non è ' +
        'calcolabile, quindi il concorso dei due requisiti non è verificabile.';
    } else {
      const oltrePerc = contributi > sogliaPerc;
      const oltreImp = contributi > S.inpsImportoConLavoratori;
      esito = oltrePerc && oltreImp ? 'sopra' : 'sotto';
      motivo =
        `Contributi ${euro(contributi)} — 30% dei dovuti: ${euro(sogliaPerc)} (${oltrePerc ? 'superato' : 'non superato'}); ` +
        `${euro(S.inpsImportoConLavoratori)} (${oltreImp ? 'superato' : 'non superato'}). ` +
        `Requisiti congiunti: ${esito === 'sopra' ? 'entrambi superati' : 'non entrambi superati'}.`;
      // Rilievo di Libra: se ci sono partite a importo ignoto, «sotto soglia»
      // vale solo sui dati quantificati e la verifica sul perimetro complessivo
      // resta sospesa. Non e' un esito, e' una distinzione da dire.
      if (esito === 'sotto' && (dati.vociImportoIgnoto ?? 0) > 0) {
        esito = 'non_determinabile';
        motivo += ` Sui dati quantificati la soglia non è raggiunta; con ${dati.vociImportoIgnoto} ${dati.vociImportoIgnoto === 1 ? 'partita' : 'partite'} a importo non noto la verifica sul perimetro contributivo complessivo resta sospesa.`;
      }
      if (applicabile && esito === 'sotto' && sanzioni > 0) {
        const tot = contributi + sanzioni;
        inpsSopraSoloConSanzioni = tot > sogliaPerc && tot > S.inpsImportoConLavoratori;
      }
    }
    ({ esito, motivo } = conRequisitoTemporale(
      esito,
      motivo,
      dati.ritardoOltre90Giorni,
      contributi !== null,
      'serve l’Elenco Deleghe (F24), che porta la data di versamento'
    ));
    if (esito === 'sopra')
      motivo +=
        ' L’ente invia la segnalazione entro 60 giorni dal verificarsi dei presupposti (art. 25-novies, comma 2, lett. b).';
    righe.push({
      ente: 'INPS',
      fonte: 'CCII-25novies-c1-a',
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
      const oltre = contributi > S.inpsImportoSenzaLavoratori;
      esito = oltre ? 'sopra' : 'sotto';
      motivo =
        `Contributi ${euro(contributi)} — soglia ${euro(S.inpsImportoSenzaLavoratori)}: ` +
        `${oltre ? 'superata' : 'non superata'}. Nessun vincolo percentuale per questa fattispecie.`;
      if (applicabile && !oltre && sanzioni > 0) {
        inpsSopraSoloConSanzioni = contributi + sanzioni > S.inpsImportoSenzaLavoratori;
      }
    }
    ({ esito, motivo } = conRequisitoTemporale(
      esito,
      motivo,
      dati.ritardoOltre90Giorni,
      contributi !== null,
      'serve l’Elenco Deleghe (F24), che porta la data di versamento'
    ));
    if (esito === 'sopra')
      motivo +=
        ' L’ente invia la segnalazione entro 60 giorni dal verificarsi dei presupposti (art. 25-novies, comma 2, lett. b).';
    righe.push({
      ente: 'INPS',
      fonte: 'CCII-25novies-c1-a',
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
      const oltre = premi > S.inail;
      esito = oltre ? 'sopra' : 'sotto';
      motivo = `Premi ${euro(premi)} — soglia ${euro(S.inail)}: ${oltre ? 'superata' : 'non superata'}.`;
    }
    ({ esito, motivo } = conRequisitoTemporale(
      esito,
      motivo,
      dati.ritardoInail,
      premi !== null,
      'servono la scadenza dei premi e il loro stato di pagamento'
    ));
    if (esito === 'sopra')
      motivo +=
        ' L’ente invia la segnalazione entro 60 giorni dal verificarsi dei presupposti (art. 25-novies, comma 2, lett. b).';
    righe.push({
      ente: 'INAIL',
      fonte: 'CCII-25novies-c1-b',
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
      const viaAssoluta = iva > S.ivaImportoAssoluto;
      if (viaAssoluta) {
        esito = 'sopra';
        // "Segnalazione dovuta" contraddiceva la regola scritta in testa a
        // questo file: oltre soglia non e' mai segnalazione dovuta. Il
        // riscontro dice solo che i presupposti oggettivi risultano integrati.
        motivo = `IVA scaduta ${euro(iva)} — oltre ${euro(S.ivaImportoAssoluto)}: presupposti oggettivi rilevati per la via alternativa, senza vincolo percentuale (art. 25-novies, comma 1, lett. c).`;
      } else if (volume === null) {
        motivo = `IVA scaduta ${euro(iva)} — sotto ${euro(S.ivaImportoAssoluto)}. Manca il volume d’affari: il requisito del 10% non è calcolabile.`;
      } else {
        const sogliaVol = volume * S.ivaPercentualeVolumeAffari;
        const oltreImp = iva > S.ivaImporto;
        const oltrePerc = iva >= sogliaVol;
        esito = oltreImp && oltrePerc ? 'sopra' : 'sotto';
        motivo =
          `IVA scaduta ${euro(iva)} — ${euro(S.ivaImporto)} (${oltreImp ? 'superato' : 'non superato'}); ` +
          `10% del volume d’affari: ${euro(sogliaVol)} (${oltrePerc ? 'raggiunto' : 'non raggiunto'}). ` +
          `Requisiti congiunti: ${esito === 'sopra' ? 'entrambi soddisfatti' : 'non entrambi soddisfatti'}.`;
      }
    }
    if (esito !== 'non_determinabile' || iva !== null) {
      // Il requisito dei 90 giorni NON si applica qui (verifica di Libra):
      // l'IVA ha il proprio termine di invio.
      motivo +=
        ' Il riscontro vale solo per debito IVA risultante dalle liquidazioni periodiche (LIPE); non si applica il requisito dei 90 giorni.';
      if (esito === 'sopra') {
        motivo +=
          ' L’Agenzia invia la segnalazione con la comunicazione di irregolarità e comunque entro 150 giorni dal termine di presentazione della LIPE (art. 25-novies, comma 2, lett. a).';
      }
    }
    righe.push({
      ente: 'AGENZIA_ENTRATE',
      fonte: 'CCII-25novies-c1-c',
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
        soglia: S.aerImpresaIndividuale,
        ambito: 'Segnalazione Agenzia Entrate-Riscossione — imprese individuali',
        valore: '> 100.000 €',
      },
      {
        forma: 'SOCIETA_PERSONE',
        soglia: S.aerSocietaPersone,
        ambito: 'Segnalazione Agenzia Entrate-Riscossione — società di persone',
        valore: '> 200.000 €',
      },
      {
        forma: 'ALTRE_SOCIETA',
        soglia: S.aerAltreSocieta,
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
        motivo = `Crediti affidati ${euro(crediti)}, al netto della parte sospesa dal giudice — soglia ${euro(f.soglia)}: ${oltre ? 'superata' : 'non superata'}.`;
      }
      ({ esito, motivo } = conRequisitoTemporale(
        esito,
        motivo,
        dati.requisitiAerVerificati,
        crediti !== null,
        'servono la data di affidamento (dal 1° luglio 2022), la natura autodichiarata o definitivamente accertata, la scadenza oltre 90 giorni e lo stato di rateizzazione, che nessun file caricato riporta'
      ));
      if (esito === 'sopra')
        motivo +=
          ' L’ente invia la segnalazione entro 60 giorni dal verificarsi dei presupposti (art. 25-novies, comma 2, lett. b).';
      righe.push({
        ente: 'AGENZIA_RISCOSSIONE',
        fonte: 'CCII-25novies-c1-d',
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

  // NON_PUBBLICO non e' un ente con una propria soglia: filtrare su quel
  // valore non troverebbe nessuna riga e l'esito sarebbe "nessuna soglia
  // applicabile" — falso, perche' per lui sono pertinenti TUTTE. Un creditore
  // pubblico valuta la propria; chi analizza le valuta tutte.
  const filtrate =
    soloEnte && soloEnte !== 'NON_PUBBLICO' ? righe.filter((r) => r.ente === soloEnte) : righe;
  const applicabili = filtrate.filter((r) => r.applicabile);

  return {
    righe: filtrate,
    superate: applicabili.filter((r) => r.esito === 'sopra'),
    nonDeterminabili: applicabili.filter((r) => r.esito === 'non_determinabile'),
    datiMancanti,
    inpsSopraSoloConSanzioni:
      inpsSopraSoloConSanzioni && (!soloEnte || soloEnte === 'INPS' || soloEnte === 'NON_PUBBLICO')
        ? true
        : false,
  };
}
