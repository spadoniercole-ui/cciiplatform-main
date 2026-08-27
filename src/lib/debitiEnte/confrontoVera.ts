// src/lib/debitiEnte/confrontoVera.ts
//
// DEFINIZIONE UNICA del confronto fra la Situazione Debitoria contabilizzata
// dall'ente e la Posizione V.E.R.A.
//
// Esiste per la stessa ragione di anagraficaAzienda.ts e passwordTemporanea.ts:
// il numero era calcolato in piu' punti (la schermata Posizione V.E.R.A., il
// contesto dello Screening, la griglia delle soglie), ognuno con la propria
// copia della regola. Copie diverse divergono, e qui divergere significa
// mostrare due cifre diverse a un funzionario dell'ente sulla stessa azienda.
//
// COSA SIGNIFICA IL DELTA
// Non e' genericamente "debito non contabilizzato": nella prassi e' il calcolo
// delle SANZIONI. La contabilita' dell'ente non le espone, perche' vanno
// determinate al momento del pagamento; la Posizione V.E.R.A. le propone su
// una presunzione, che la piattaforma acquisisce come tale. Da qui la scelta
// di chiamarle sanzioni presunte ovunque, e di tenerle fuori dal test delle
// soglie dell'art. 25-novies, che si misura sui soli contributi.
//
// Funzione PURA: nessun accesso al database, nessuna AI.

/** Trattamento di una riga VERA, deciso dalla catena Natura+Stato. */
export type TrattamentoVeraRigaConfronto =
  'contabilizzato' | 'da_contabilizzare' | 'potenziale' | 'ignora';

export interface RigaEnteConfronto {
  /** Codice categoria. */
  tipo: string;
  importo: number;
}

export interface RigaVeraConfronto {
  /** Codice categoria. */
  categoria: string;
  importo: number;
  trattamento: TrattamentoVeraRigaConfronto;
}

export interface CategoriaConfronto {
  codice: string;
  /** false = categoria neutra: non concorre ai totali ne' ai delta. */
  contribuisce: boolean;
}

export interface RigaConfrontoCategoria {
  codice: string;
  contabilizzato: number;
  vera: number;
  /** vera − contabilizzato. Positivo = sanzioni presunte. */
  delta: number;
  neutra: boolean;
}

export interface ConfrontoVera {
  perCategoria: RigaConfrontoCategoria[];
  /** Totali sulle sole categorie che concorrono. */
  totaleContabilizzato: number;
  totaleVera: number;
  /** Delta complessivo GREZZO: puo' essere negativo. */
  deltaGrezzo: number;
  /**
   * Sanzioni presunte = delta, mai negativo.
   *
   * Un delta negativo significa che l'ente ha contabilizzato PIU' di quanto
   * la V.E.R.A. riporti: non e' una sanzione, ed e' quasi sempre un
   * disallineamento di perimetro fra i due documenti. Sottrarlo abbasserebbe
   * la base del test delle soglie per un motivo che con le soglie non
   * c'entra nulla. Si azzera e si segnala con `deltaNegativo`.
   */
  sanzioniPresunte: number;
  deltaNegativo: boolean;
  /** Righe a importo ignoto: contate, mai stimate. */
  righePotenziali: number;
}

/** Solo i trattamenti con importo NOTO alimentano gli importi. */
function haImportoNoto(t: TrattamentoVeraRigaConfronto): boolean {
  return t === 'contabilizzato' || t === 'da_contabilizzare';
}

export function calcolaConfrontoVera(
  righeEnte: RigaEnteConfronto[],
  righeVera: RigaVeraConfronto[],
  categorie: CategoriaConfronto[]
): ConfrontoVera {
  const neutre = new Set(categorie.filter((c) => !c.contribuisce).map((c) => c.codice));
  const righeImporto = righeVera.filter((r) => haImportoNoto(r.trattamento));

  const codici = Array.from(
    new Set<string>([
      ...categorie.map((c) => c.codice),
      ...righeEnte.map((r) => r.tipo),
      ...righeImporto.map((r) => r.categoria),
    ])
  );

  const perCategoria: RigaConfrontoCategoria[] = codici
    .map((codice) => {
      const contabilizzato = righeEnte
        .filter((r) => r.tipo === codice)
        .reduce((a, r) => a + r.importo, 0);
      const vera = righeImporto
        .filter((r) => r.categoria === codice)
        .reduce((a, r) => a + r.importo, 0);
      return {
        codice,
        contabilizzato,
        vera,
        delta: vera - contabilizzato,
        neutra: neutre.has(codice),
      };
    })
    .filter((x) => x.contabilizzato !== 0 || x.vera !== 0);

  const utili = perCategoria.filter((x) => !x.neutra);
  const totaleContabilizzato = utili.reduce((a, x) => a + x.contabilizzato, 0);
  const totaleVera = utili.reduce((a, x) => a + x.vera, 0);
  const deltaGrezzo = totaleVera - totaleContabilizzato;

  return {
    perCategoria,
    totaleContabilizzato,
    totaleVera,
    deltaGrezzo,
    sanzioniPresunte: Math.max(0, deltaGrezzo),
    deltaNegativo: deltaGrezzo < -0.005,
    righePotenziali: righeVera.filter((r) => r.trattamento === 'potenziale').length,
  };
}
