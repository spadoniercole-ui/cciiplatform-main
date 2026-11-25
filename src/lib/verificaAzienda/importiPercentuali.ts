// GLI IMPORTI CHE VENGONO DALLE PERCENTUALI (0.256.4, rivisti nella 0.256.20).
//
// La domanda a cui rispondono è una sola: «se applico le percentuali che ho
// impostato, quanti soldi sono?». Tre righe, tre percentuali diverse:
//
//   ACCORDO      la SOGLIA DI RISCONTRO DELLA PROPOSTA (Parametri di Spazio,
//                «Parametri di riscontro della proposta», colonna
//                `limiti_ricevibilita.percentuale_minima`): il debito per un
//                eventuale accordo deve rispettare quella percentuale.
//                Fino alla 0.256.19 qui si usava la media proposta del
//                Redigente (30% di default), che è un'altra cosa: quella
//                pre-compila le righe della proposta, questa dice quanto deve
//                offrire il debitore perché la proposta sia riscontrata.
//   LIQUIDAZIONE credito × tasso di realizzo del rango, meno le spese di
//                procedura: è quello che resta in mano all'ente.
//   CRAM DOWN    credito × percentuale di soddisfacimento del rango, senza
//                costi: la percentuale è già l'esito dell'omologazione.
//
// QUANDO IL RANGO NON È SCELTO. Il tipo di credito non si conosce nella fase in
// cui questi numeri si producono: lo stesso ente può vantare crediti di
// categorie diverse. In quel caso la riga non si dichiara «non calcolabile» e
// basta: mostra un INTERVALLO, dalla percentuale più bassa alla più alta della
// tabella «Scenari del triage». È un conto grossolano, e serve a dare un
// avvertimento — non a fissare un importo.
//
// PERCHÉ UN MODULO SOLO. Gli stessi tre importi si leggono nella posizione
// dell'ente (riquadri «Accordo» e «Procedure») e nella verifica azienda (la
// prima riga del confronto). Due calcoli per la stessa cosa sono due occasioni
// di divergere: qui la regola sta una volta, e chi la mostra la legge.
//
// NESSUN NUMERO INVENTATO. Se manca il credito, la soglia o la percentuale, la
// riga si dichiara non calcolabile col motivo; non diventa zero, che si
// leggerebbe come «recupero nullo».
//
// Logica pura, con i suoi test.

import { calcolaScenari, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';

export type CodiceImportoPercentuale = 'ACCORDO' | 'LIQUIDAZIONE' | 'CRAM_DOWN';

/** L'importo quando il rango non è scelto: dal più basso al più alto della tabella. */
export interface IntervalloImporto {
  percentualeDa: number;
  percentualeA: number;
  importoDa: number;
  importoA: number;
}

export interface ImportoPercentuale {
  codice: CodiceImportoPercentuale;
  etichetta: string;
  /** Da dove viene la percentuale: si mostra accanto al numero. */
  fonte: string;
  percentuale: number | null;
  /** L'importo che tocca all'ente; per la liquidazione è già al netto dei costi. */
  importo: number | null;
  calcolabile: boolean;
  motivo: string | null;
  /**
   * Senza rango scelto: fra quale percentuale e quale importo sta la cifra.
   * Null quando il rango è noto (allora c'è `importo`) o quando la tabella non
   * ha nemmeno una percentuale utilizzabile.
   */
  intervallo: IntervalloImporto | null;
  /**
   * Quando il conto è fatto sulle quote classificate della certificazione: il
   * credito che la classificazione lascia fuori dai conti (posizioni non
   * determinate, cartelle dell'Agente senza riparto, crediti a favore) si
   * dichiara qui, perché la cifra mostrata non è il credito intero.
   */
  escluso?: number;
}

export interface InputImportiPercentuali {
  credito: number | null;
  rango: RangoCredito | null;
  parametri: ParametriScenari;
  /**
   * `limiti_ricevibilita.percentuale_minima` dell'ente: la soglia di riscontro
   * della proposta, cioè la percentuale minima del debito che un accordo deve
   * rispettare.
   */
  sogliaRiscontro: number | null;
  /**
   * Le quote della certificazione già divise per rango (vedi
   * `quotePerRango`). Se il rango del credito non è scelto a mano, sono queste
   * a dire a quale rango appartiene il credito: le due procedure si calcolano
   * per davvero, invece di leggersi come intervallo.
   */
  quoteClassificate?: { rango: RangoCredito; importo: number }[];
  /** Il credito che la classificazione lascia fuori dai conti (le quote senza rango). */
  esclusoClassificazione?: number;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

const numeroValido = (n: number | null): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

const percentualeValida = (p: number | null): p is number =>
  typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100;

const motivoIntervallo =
  'il rango del credito non è scelto: si va dalla percentuale più bassa alla più alta della tabella Scenari del triage';

/**
 * I tre importi, nell'ordine in cui si leggono: prima l'accordo, poi le due
 * procedure. L'ordine è parte del contratto: chi mostra «la prima riga del
 * confronto» si aspetta l'accordo.
 */
export function importiDaPercentuali(input: InputImportiPercentuali): ImportoPercentuale[] {
  const credito = numeroValido(input.credito) ? input.credito : null;
  const soglia = percentualeValida(input.sogliaRiscontro) ? input.sogliaRiscontro : null;
  const costi = percentualeValida(input.parametri.costiProceduraPct)
    ? input.parametri.costiProceduraPct
    : null;

  const accordo: ImportoPercentuale = {
    codice: 'ACCORDO',
    etichetta: 'Accordo alla soglia di riscontro',
    fonte: 'soglia di riscontro della proposta configurata in Parametri di Spazio',
    percentuale: soglia,
    importo: credito !== null && soglia !== null ? arrotonda((credito * soglia) / 100) : null,
    calcolabile: credito !== null && soglia !== null,
    motivo:
      credito === null
        ? 'il credito dell’ente non è accertato'
        : soglia === null
          ? 'la soglia di riscontro della proposta non è configurata per l’ente'
          : null,
    intervallo: null,
  };

  const esito = calcolaScenari({
    credito: input.credito,
    rango: input.rango,
    parametri: input.parametri,
  });

  // «dati incompleti» non dice nulla a chi legge: quando il motore non è più
  // specifico, si elenca ciò che manca davvero.
  const motivoIpotesi = (ipotesi: typeof esito.liquidazione): string => {
    const motivo = ipotesi.motivo?.trim();
    if (motivo && motivo !== 'dati incompleti') return motivo;
    return esito.mancanti.length > 0
      ? `manca ${esito.mancanti.join('; manca ')}`
      : 'non calcolabile con i parametri attuali';
  };

  /** Il minimo e il massimo fra i ranghi configurati, per la percentuale nota. */
  const intervalloDa = (
    valore: (pct: number) => number | null,
    percentuali: number[]
  ): IntervalloImporto | null => {
    if (credito === null || percentuali.length === 0) return null;
    const importi = percentuali
      .map((pct) => {
        const importo = valore(pct);
        return importo === null ? null : { pct, importo: arrotonda(importo) };
      })
      .filter((x): x is { pct: number; importo: number } => x !== null);
    if (importi.length === 0) return null;
    const conMin = importi.reduce((min, x) => (x.importo < min.importo ? x : min));
    const conMax = importi.reduce((max, x) => (x.importo > max.importo ? x : max));
    return {
      percentualeDa: Math.min(...importi.map((x) => x.pct)),
      percentualeA: Math.max(...importi.map((x) => x.pct)),
      importoDa: conMin.importo,
      importoA: conMax.importo,
    };
  };

  const percentualiLiquidazione = input.parametri.ranghi
    .map((r) => r.tassoLiquidazionePct)
    .filter(percentualeValida);
  const percentualiCram = input.parametri.ranghi
    .map((r) => r.cramDownPct)
    .filter(percentualeValida);

  // La liquidazione ha un costo: ogni rango si legge al netto delle spese di
  // procedura, come nel motore degli scenari.
  const intervalloLiquidazione =
    costi === null
      ? null
      : intervalloDa(
          (pct) => (credito === null ? null : ((credito * pct) / 100) * (1 - costi / 100)),
          percentualiLiquidazione
        );
  const intervalloCram = intervalloDa(
    (pct) => (credito === null ? null : (credito * pct) / 100),
    percentualiCram
  );

  // SENZA RANGO SCELTO, MA CON LE QUOTE CLASSIFICATE. Il tipo di credito non
  // è scelto a mano, però la certificazione lo dice: i contributi sono
  // privilegiati, la metà delle sanzioni civili pure, il resto chirografo. Ogni
  // quota prende la percentuale del PROPRIO rango e i netti si sommano. È il
  // conto puntuale al posto dell'intervallo; le quote senza rango (cartelle
  // dell'Agente, voci a cifra unica) restano fuori e si dichiarano.
  const quote = (input.quoteClassificate ?? []).filter(
    (q) => numeroValido(q.importo) && q.importo > 0
  );
  const perQuote = input.rango === null && quote.length > 0;

  const sommaSuQuote = (quale: 'liquidazione' | 'cramDown'): number | null => {
    let totale = 0;
    for (const q of quote) {
      const netto = calcolaScenari({
        credito: q.importo,
        rango: q.rango,
        parametri: input.parametri,
      })[quale].netto;
      if (netto === null) return null;
      totale += netto;
    }
    return arrotonda(totale);
  };

  const daIpotesi = (
    codice: 'LIQUIDAZIONE' | 'CRAM_DOWN',
    ipotesi: typeof esito.liquidazione,
    etichetta: string,
    fonte: string,
    intervallo: IntervalloImporto | null,
    daQuote: number | null
  ): ImportoPercentuale => {
    if (perQuote && daQuote !== null) {
      return {
        codice,
        etichetta,
        fonte: 'quote classificate della certificazione, ognuna alla percentuale del proprio rango',
        percentuale: null,
        importo: daQuote,
        calcolabile: true,
        motivo: null,
        intervallo: null,
        escluso: input.esclusoClassificazione ?? 0,
      };
    }
    return {
      codice,
      etichetta,
      fonte,
      percentuale: ipotesi.percentuale,
      importo: ipotesi.calcolabile ? ipotesi.netto : null,
      calcolabile: ipotesi.calcolabile,
      motivo: ipotesi.calcolabile ? null : intervallo ? motivoIntervallo : motivoIpotesi(ipotesi),
      intervallo: ipotesi.calcolabile ? null : intervallo,
    };
  };

  return [
    accordo,
    daIpotesi(
      'LIQUIDAZIONE',
      esito.liquidazione,
      'Liquidazione giudiziale',
      'tasso di realizzo del rango, al netto delle spese di procedura',
      intervalloLiquidazione,
      sommaSuQuote('liquidazione')
    ),
    daIpotesi(
      'CRAM_DOWN',
      esito.cramDown,
      'Cram down',
      'percentuale di soddisfacimento del rango',
      intervalloCram,
      sommaSuQuote('cramDown')
    ),
  ];
}

/** La riga dell'accordo: serve a chi la vuole in testa al confronto. */
export function importoAccordo(righe: ImportoPercentuale[]): ImportoPercentuale | null {
  return righe.find((r) => r.codice === 'ACCORDO') ?? null;
}
