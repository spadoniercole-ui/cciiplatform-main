// src/lib/simulazione/calcoloRedigente.ts
//
// Simulazione per chi REDIGE la proposta (tipoProposta = DA_DEFINIRE) —
// concettualmente diversa dalla Simulazione a tre scenari già costruita
// per chi la RICEVE (calcolo.ts): niente ottimistico/neutrale/
// pessimistico, niente proiezione a 3 anni. Un solo stato, corretto leva
// per leva (personale, giorni di incasso/pagamento, aliquote) finché gli
// indici non tornano in equilibrio — l'obiettivo di chi scrive una
// proposta non è "vedere cosa potrebbe succedere", è "trovare la
// combinazione che regge". Calcolo interamente deterministico, pensato
// per reagire ad ogni movimento di uno slider senza un pulsante "salva".

export type CategoriaPersonale = 'operai' | 'impiegati' | 'quadri' | 'dirigenti';

export interface DatiCategoriaPersonale {
  numero: number;
  retribuzioneLordaMensileMedia: number;
}

export type PersonalePerCategoria = Record<CategoriaPersonale, DatiCategoriaPersonale>;

export interface AliquotePersonale {
  /** % a carico dell'azienda, oltre alla retribuzione lorda — previdenziale (INPS). */
  previdenziale: number;
  /** % a carico dell'azienda — assicurativo (INAIL). */
  inail: number;
}

export type AliquotePerCategoria = Record<CategoriaPersonale, AliquotePersonale>;

export const ALIQUOTE_PERSONALE_DEFAULT: AliquotePerCategoria = {
  operai: { previdenziale: 36, inail: 10 },
  impiegati: { previdenziale: 40, inail: 0.72 },
  quadri: { previdenziale: 42, inail: 0.72 },
  dirigenti: { previdenziale: 45, inail: 0.72 },
};

export interface InputRedigente {
  valoreProduzione: number;
  costiProduzioneAltri: number;
  ammortamenti: number;

  personale: PersonalePerCategoria;
  aliquotePersonale: AliquotePerCategoria;

  giorniMediIncassoClienti: number;
  giorniMediPagamentoFornitori: number;
  giorniBaseline: number;

  aliquotaImposteSulReddito: number;
  aliquotaIrap: number;

  totaleDebitiProposta: number;
  numeroRateMedie: number;

  totaleDebiti: number;
  patrimonioNetto: number;
}

export interface RisultatoRedigente {
  costoPersonaleTotale: number;
  costiProduzioneTotali: number;
  ebit: number;
  ebitda: number;
  variazioneCapitaleCircolante: number;
  imposte: number;
  flussoDisponibile: number;
  rataAnnua: number;
  dscr: number | null;
  indiceDebitiCapitale: number | null;
  viabile: boolean;
}

function calcolaCostoCategoria(dati: DatiCategoriaPersonale, aliquote: AliquotePersonale): number {
  const retribuzioneLordaAnnua = dati.numero * dati.retribuzioneLordaMensileMedia * 12;
  const contributi = retribuzioneLordaAnnua * ((aliquote.previdenziale + aliquote.inail) / 100);
  return retribuzioneLordaAnnua + contributi;
}

export function calcolaRedigente(input: InputRedigente): RisultatoRedigente {
  const categorie: CategoriaPersonale[] = ['operai', 'impiegati', 'quadri', 'dirigenti'];
  const costoPersonaleTotale = categorie.reduce(
    (acc, cat) => acc + calcolaCostoCategoria(input.personale[cat], input.aliquotePersonale[cat]),
    0
  );

  const costiProduzioneTotali = input.costiProduzioneAltri + costoPersonaleTotale;
  const ebit = input.valoreProduzione - costiProduzioneTotali;
  const ebitda = ebit + input.ammortamenti;

  const ricaviGiornalieri = input.valoreProduzione / 365;
  const costiGiornalieriFornitori = input.costiProduzioneAltri / 365;
  const deltaGiorniIncasso = input.giorniMediIncassoClienti - input.giorniBaseline;
  const deltaGiorniPagamento = input.giorniMediPagamentoFornitori - input.giorniBaseline;
  const variazioneCapitaleCircolante =
    -(ricaviGiornalieri * deltaGiorniIncasso) + costiGiornalieriFornitori * deltaGiorniPagamento;

  const imposte =
    ebit > 0 ? ebit * ((input.aliquotaImposteSulReddito + input.aliquotaIrap) / 100) : 0;

  const flussoDisponibile = ebitda - imposte + variazioneCapitaleCircolante;

  const rataAnnua =
    input.numeroRateMedie > 0 ? (input.totaleDebitiProposta / input.numeroRateMedie) * 12 : 0;
  const dscr = rataAnnua > 0 ? flussoDisponibile / rataAnnua : null;

  const indiceDebitiCapitale =
    input.patrimonioNetto !== 0 ? input.totaleDebiti / input.patrimonioNetto : null;

  return {
    costoPersonaleTotale,
    costiProduzioneTotali,
    ebit,
    ebitda,
    variazioneCapitaleCircolante,
    imposte,
    flussoDisponibile,
    rataAnnua,
    dscr,
    indiceDebitiCapitale,
    viabile: dscr !== null && dscr >= 1,
  };
}
