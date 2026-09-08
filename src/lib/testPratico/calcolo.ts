// src/lib/testPratico/calcolo.ts
//
// Test pratico per la verifica della ragionevole perseguibilità del
// risanamento (art. 13, comma 2 CCII) — Sezione I del documento guida
// del Ministero della Giustizia, Decreto dirigenziale 23 aprile 2026
// (Bollettino Ufficiale n. 10/2026). Fedele al testo ufficiale, voce
// per voce — non un'approssimazione: le voci e le soglie sono quelle
// del documento, non una nostra interpretazione.
//
// Non è un indicatore di crisi sì/no — è uno strumento prognostico:
// quanto tempo servirebbe, con i flussi a regime dell'azienda, per
// estinguere il debito da ristrutturare.

export interface DatiDebitoRistrutturare {
  debitoScaduto: number;
  diCuiIscrizioniARuolo: number;
  debitoRiscadenziatoOMoratorie: number;
  lineeCreditoNonRinnovabili: number;
  rateFinanziamentiScadenza2Anni: number;
  investimentiIniziativeIndustriali: number;
  dismissioniCespitiORami: number;
  nuoviConferimentiEFinanziamenti: number;
  molNettoNegativoPrimoAnno: number;
  stralcioRitenutoRagionevole: number;
}

export interface DatiFlussiARegime {
  molProspetticoNormalizzato: number;
  investimentiMantenimentoAnnui: number;
  imposteRedditoAnnue: number;
  inEquilibrioDalSecondoAnno: boolean;
}

export type FasciaTestPratico =
  | 'DIFFICOLTA_CONTENUTE'
  | 'DIPENDE_DA_INIZIATIVE'
  | 'RICHIEDE_CESSIONE_PROBABILE'
  | 'CESSIONE_NECESSARIA'
  | 'DISEQUILIBRIO_A_REGIME';

export interface RisultatoTestPratico {
  totaleA: number;
  totaleB: number;
  rapporto: number | null;
  fascia: FasciaTestPratico;
  etichetta: string;
  descrizione: string;
  puntoSuccessivo: string;
}

export function calcolaTestPratico(
  debito: DatiDebitoRistrutturare,
  flussi: DatiFlussiARegime
): RisultatoTestPratico {
  const totaleA =
    debito.debitoScaduto +
    debito.debitoRiscadenziatoOMoratorie +
    debito.lineeCreditoNonRinnovabili +
    debito.rateFinanziamentiScadenza2Anni +
    debito.investimentiIniziativeIndustriali -
    debito.dismissioniCespitiORami -
    debito.nuoviConferimentiEFinanziamenti -
    Math.max(0, debito.molNettoNegativoPrimoAnno) -
    debito.stralcioRitenutoRagionevole;

  const totaleB =
    flussi.molProspetticoNormalizzato -
    flussi.investimentiMantenimentoAnnui -
    flussi.imposteRedditoAnnue;

  if (!flussi.inEquilibrioDalSecondoAnno || totaleB <= 0) {
    return {
      totaleA,
      totaleB,
      rapporto: null,
      fascia: 'DISEQUILIBRIO_A_REGIME',
      etichetta: 'Disequilibrio a regime',
      descrizione:
        "L'impresa non presenta, dal secondo anno in poi, flussi annui positivi e stabili — il rapporto debito/flussi non è applicabile nella sua forma base. Servono iniziative in discontinuità rispetto alla normale conduzione (interventi sui processi produttivi, modifiche del modello di business, cessioni o cessazione di rami, aggregazioni con altre imprese).",
      puntoSuccessivo: 'Punti 7 e 8 della Sezione I',
    };
  }

  const rapporto = totaleA / totaleB;

  if (rapporto <= 2) {
    return {
      totaleA,
      totaleB,
      rapporto,
      fascia: 'DIFFICOLTA_CONTENUTE',
      etichetta: 'Difficoltà contenute',
      descrizione:
        "Rapporto non superiore a circa 2 — l'andamento corrente dell'impresa può essere sufficiente a individuare il percorso di risanamento. La formulazione delle proposte ai creditori può basarsi sul solo andamento corrente; la redazione del piano d'impresa assume minore rilevanza.",
      puntoSuccessivo: 'Punto 6 della Sezione I',
    };
  }
  if (rapporto <= 3) {
    return {
      totaleA,
      totaleB,
      rapporto,
      fascia: 'DIPENDE_DA_INIZIATIVE',
      etichetta: 'Dipende dalle iniziative industriali',
      descrizione:
        "Il risanamento dipende dall'efficacia e dall'esito delle iniziative industriali che si intendono adottare. Il piano d'impresa assume qui rilevanza centrale — la Check List (Sezione II) recepisce le migliori pratiche per la sua redazione.",
      puntoSuccessivo: 'Punto 7 della Sezione I',
    };
  }
  if (rapporto <= 6) {
    return {
      totaleA,
      totaleB,
      rapporto,
      fascia: 'RICHIEDE_CESSIONE_PROBABILE',
      etichetta: 'Un MOL positivo non basta',
      descrizione:
        'La sola presenza di un margine operativo lordo positivo non è sufficiente a consentire il risanamento — può rendersi necessaria la cessione dell’azienda o di rami di essa.',
      puntoSuccessivo: 'Punti 7 e 8 della Sezione I',
    };
  }
  return {
    totaleA,
    totaleB,
    rapporto,
    fascia: 'CESSIONE_NECESSARIA',
    etichetta: 'Cessione necessaria',
    descrizione:
      "Rapporto oltre il livello che, in assenza di particolari specificità, segnala l'esigenza di stimare le risorse realizzabili attraverso la cessione dell'azienda o di rami di essa, e compararle con il debito da servire.",
    puntoSuccessivo: 'Punto 8 della Sezione I',
  };
}

export const DATI_DEBITO_VUOTI: DatiDebitoRistrutturare = {
  debitoScaduto: 0,
  diCuiIscrizioniARuolo: 0,
  debitoRiscadenziatoOMoratorie: 0,
  lineeCreditoNonRinnovabili: 0,
  rateFinanziamentiScadenza2Anni: 0,
  investimentiIniziativeIndustriali: 0,
  dismissioniCespitiORami: 0,
  nuoviConferimentiEFinanziamenti: 0,
  molNettoNegativoPrimoAnno: 0,
  stralcioRitenutoRagionevole: 0,
};

export const DATI_FLUSSI_VUOTI: DatiFlussiARegime = {
  molProspetticoNormalizzato: 0,
  investimentiMantenimentoAnnui: 0,
  imposteRedditoAnnue: 0,
  inEquilibrioDalSecondoAnno: false,
};
