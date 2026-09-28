// src/lib/proposta/ricevibilita.ts
//
// Logica pura della verifica di ricevibilità della proposta (nessun accesso
// al DB): estratta da `verificaRicevibilitaProposta`
// (src/app/actions/propostaScenario.ts), che resta l'endpoint e si limita a
// leggere i dati e a delegare qui il calcolo.
//
// - Percorso NON_ENTE: ogni riga della proposta è confrontata con il limite
//   trovato a quattro livelli (categoria esatta → alias → rango legale →
//   Generale).
// - Percorso ENTE: un solo limite (la soglia dell'ente) applicato ai dati
//   estratti dall'AI dal documento della proposta di cram down.

import type { RangoLegale } from '@/lib/proposta/rangoLegale';
import { etichettaRango } from '@/lib/proposta/rangoLegale';

export type ModalitaProposta = 'UNICA_SOLUZIONE' | 'RATEALE';

export interface RigaProposta {
  id: number;
  scenarioId: number;
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  modalita: ModalitaProposta;
  numeroRate: number | null;
  note: string | null;
  rangoLegale: RangoLegale | null;
  rilevantePerEnte: boolean;
}

export interface EsitoRigaProposta extends RigaProposta {
  ricevibile: boolean;
  motivazione: string;
}

export interface EsitoRicevibilita {
  righe: EsitoRigaProposta[];
  complessivamenteRicevibile: boolean;
  /** Solo percorso Ricevente: false quando non c'è ancora nessuna estrazione dal documento — "non ricevibile" per assenza di dati è diverso da "non ricevibile" perché l'importo è sotto soglia, e vanno mostrati in modo diverso all'utente. */
  datiDisponibili?: boolean;
}

/** Campi di una soglia usati dalla verifica (comuni ai limiti per categoria e per rango). */
export interface SogliaRicevibilita {
  percentualeMinima: number;
  unicaSoluzioneAmmessa: boolean;
  rateizzazioneAmmessa: boolean;
  valoreLiquidazioneStimato: number | null;
}

/** Sottoinsieme strutturale di `LimiteRicevibilita` (parametriSpazio). */
export interface LimiteCategoriaRicevibilita extends SogliaRicevibilita {
  categoriaCreditore: string;
  alias?: string[] | null;
}

/** Sottoinsieme strutturale di `LimiteRicevibilitaRango` (parametriSpazio). */
export interface LimiteRangoRicevibilita extends SogliaRicevibilita {
  rangoLegale: RangoLegale;
}

export type LivelloMatch = 'categoria' | 'alias' | 'rango' | 'generale' | 'nessuno';

/** Nome della categoria che fa da soglia di ripiego. */
export const CATEGORIA_GENERALE = 'Generale';

export interface IndiceLimiti<
  L extends LimiteCategoriaRicevibilita = LimiteCategoriaRicevibilita,
  R extends LimiteRangoRicevibilita = LimiteRangoRicevibilita,
> {
  perCategoria: Map<string, L>;
  perAlias: Map<string, L>;
  perRango: Map<RangoLegale, R>;
  generale: L | undefined;
}

export function costruisciIndiceLimiti<
  L extends LimiteCategoriaRicevibilita,
  R extends LimiteRangoRicevibilita,
>(limiti: L[], limitiRango: R[]): IndiceLimiti<L, R> {
  const perCategoria = new Map(limiti.map((l) => [l.categoriaCreditore, l]));
  // Un limite può avere più nomi alternativi (INPS → "Enti
  // previdenziali", "Ente previdenziale"...) — mappa ogni alias,
  // normalizzato in minuscolo per un confronto case-insensitive, al
  // limite a cui appartiene.
  const perAlias = new Map<string, L>();
  for (const l of limiti) {
    for (const a of l.alias || []) {
      if (a.trim()) perAlias.set(a.trim().toLowerCase(), l);
    }
  }
  const perRango = new Map(limitiRango.map((l) => [l.rangoLegale, l]));
  const generale = perCategoria.get(CATEGORIA_GENERALE);
  return { perCategoria, perAlias, perRango, generale };
}

/**
 * Corrispondenza a quattro livelli, non un unico confronto per nome
 * libero: (1) categoria esatta, se configurata con quel nome preciso;
 * (1b) un alias configurato per quella categoria, se il nome esatto non
 * combacia; (2) rango legale della riga, se impostato — un insieme chiuso
 * di 6 valori, non ambiguo come un nome libero; (3) Generale, solo se
 * nessuno dei livelli sopra ha dato risposta.
 */
export function selezionaLimite<
  L extends LimiteCategoriaRicevibilita,
  R extends LimiteRangoRicevibilita,
>(
  riga: Pick<RigaProposta, 'categoriaCreditore' | 'rangoLegale'>,
  indice: IndiceLimiti<L, R>
): { limite: L | R | undefined; livelloMatch: LivelloMatch } {
  let limite: L | R | undefined = indice.perCategoria.get(riga.categoriaCreditore);
  let livelloMatch: LivelloMatch = limite ? 'categoria' : 'nessuno';
  if (!limite) {
    limite = indice.perAlias.get(riga.categoriaCreditore.trim().toLowerCase());
    if (limite) livelloMatch = 'alias';
  }
  if (!limite && riga.rangoLegale) {
    limite = indice.perRango.get(riga.rangoLegale);
    if (limite) livelloMatch = 'rango';
  }
  if (!limite) {
    limite = indice.generale;
    livelloMatch = limite ? 'generale' : 'nessuno';
  }
  return { limite, livelloMatch };
}

/** Importo offerto = dovuto × percentuale / 100. */
export function calcolaImportoOfferto(importoDovuto: number, percentualeOfferta: number): number {
  return (importoDovuto * percentualeOfferta) / 100;
}

/** Il valore di liquidazione stimato conta solo se configurato e > 0. */
function haValoreLiquidazione(s: SogliaRicevibilita): s is SogliaRicevibilita & {
  valoreLiquidazioneStimato: number;
} {
  return s.valoreLiquidazioneStimato !== null && s.valoreLiquidazioneStimato > 0;
}

export const MOTIVAZIONE_NESSUN_LIMITE =
  'Nessun limite configurato — né per questa categoria, né per il suo rango legale (se impostato), né una soglia Generale. Verifica che almeno una di queste esista in Parametri di Spazio prima di considerare questo esito.';

/** Valuta una riga (percorso NON_ENTE) contro il limite già selezionato. */
export function valutaRigaProposta<T extends RigaProposta>(
  riga: T,
  limite: SogliaRicevibilita | undefined,
  livelloMatch: LivelloMatch
): T & { ricevibile: boolean; motivazione: string } {
  if (!limite) {
    return {
      ...riga,
      ricevibile: true,
      motivazione: MOTIVAZIONE_NESSUN_LIMITE,
    };
  }

  const motivi: string[] = [];
  const importoOfferto = calcolaImportoOfferto(riga.importoDovuto, riga.percentualeOfferta);

  // Criterio corretto ex CCII (art. 23, comma 2-bis, e prassi delle
  // transazioni fiscali/contributive): la proposta è ricevibile se
  // offre al creditore non meno di quanto otterrebbe in liquidazione
  // giudiziale. Se per questa categoria è stato stimato un valore di
  // liquidazione, è questo — non la percentuale minima — il test
  // principale.
  if (haValoreLiquidazione(limite)) {
    if (importoOfferto < limite.valoreLiquidazioneStimato) {
      motivi.push(
        `offerta € ${importoOfferto.toLocaleString('it-IT')} inferiore al valore di liquidazione stimato per questa categoria (€ ${limite.valoreLiquidazioneStimato.toLocaleString('it-IT')}) — il creditore otterrebbe di più in liquidazione giudiziale`
      );
    }
  }
  if (riga.percentualeOfferta < limite.percentualeMinima) {
    motivi.push(
      `offerta ${riga.percentualeOfferta}% sotto il minimo richiesto (${limite.percentualeMinima}%)`
    );
  }
  if (riga.modalita === 'UNICA_SOLUZIONE' && !limite.unicaSoluzioneAmmessa) {
    motivi.push("modalità 'unica soluzione' non ammessa per questa categoria");
  }
  if (riga.modalita === 'RATEALE' && !limite.rateizzazioneAmmessa) {
    motivi.push("modalità 'rateale' non ammessa per questa categoria");
  }

  // Nota: il livello 'alias' ricade qui nell'etichetta della soglia
  // Generale (comportamento originale, conservato).
  const etichettaLivello =
    livelloMatch === 'categoria'
      ? 'per questa categoria'
      : livelloMatch === 'rango'
        ? `per il rango legale "${riga.rangoLegale ? etichettaRango(riga.rangoLegale) : ''}" (nessuna soglia specifica trovata per il nome esatto di questa categoria)`
        : 'dalla soglia Generale (nessuna soglia specifica trovata per categoria né per rango legale)';

  let motivazionePositiva: string;
  if (haValoreLiquidazione(limite)) {
    motivazionePositiva = `Offerta € ${importoOfferto.toLocaleString('it-IT')} ≥ valore di liquidazione stimato € ${limite.valoreLiquidazioneStimato.toLocaleString('it-IT')}, verificato ${etichettaLivello} (criterio ex CCII, configurato in Parametri di Spazio).`;
  } else if (limite.percentualeMinima > 0) {
    motivazionePositiva = `Offerta ${riga.percentualeOfferta}% ≥ percentuale minima richiesta ${limite.percentualeMinima}%, verificato ${etichettaLivello} (configurata in Parametri di Spazio).`;
  } else {
    motivazionePositiva = `Nessuna soglia configurata ${etichettaLivello} (né percentuale minima né valore di liquidazione, in Parametri di Spazio) — conforme per assenza di un vincolo da verificare, non per un controllo superato.`;
  }

  return {
    ...riga,
    ricevibile: motivi.length === 0,
    motivazione: motivi.length === 0 ? motivazionePositiva : motivi.join('; '),
  };
}

/** Verifica completa del percorso NON_ENTE (una valutazione per riga). */
export function verificaRicevibilitaRighe<T extends RigaProposta>(
  righeProposta: T[],
  limiti: LimiteCategoriaRicevibilita[],
  limitiRango: LimiteRangoRicevibilita[]
): {
  righe: (T & { ricevibile: boolean; motivazione: string })[];
  complessivamenteRicevibile: boolean;
} {
  const indice = costruisciIndiceLimiti(limiti, limitiRango);
  const righe = righeProposta.map((riga) => {
    const { limite, livelloMatch } = selezionaLimite(riga, indice);
    return valutaRigaProposta(riga, limite, livelloMatch);
  });
  return {
    righe,
    complessivamenteRicevibile: righe.length > 0 && righe.every((r) => r.ricevibile),
  };
}

/** Dati estratti dall'AI dal documento della proposta (percorso ENTE). */
export interface EstrazioneProposta {
  estrazioneRiuscita: boolean;
  importoDovuto: number | null;
  percentualeOfferta: number | null;
  modalita: ModalitaProposta | null;
  numeroRate: number | null;
  motivoMancata: string | null;
}

export const CATEGORIA_RIGA_ENTE = 'Proposta di cram down (estratta dal documento)';

/**
 * Verifica del percorso ENTE: un solo limite (la soglia dell'ente stesso)
 * applicato ai dati estratti dal documento — l'importo offerto non si
 * inserisce a mano.
 */
export function verificaRicevibilitaEnte(
  scenarioId: number,
  estrazione: EstrazioneProposta | null,
  limiteEnte: SogliaRicevibilita | undefined
): EsitoRicevibilita {
  const rigaSintetica: EsitoRigaProposta = {
    id: 0,
    scenarioId,
    categoriaCreditore: CATEGORIA_RIGA_ENTE,
    importoDovuto: estrazione?.importoDovuto ?? 0,
    percentualeOfferta: estrazione?.percentualeOfferta ?? 0,
    modalita: (estrazione?.modalita as ModalitaProposta) ?? 'UNICA_SOLUZIONE',
    numeroRate: estrazione?.numeroRate ?? null,
    note: null,
    rangoLegale: null,
    rilevantePerEnte: true,
    ricevibile: false,
    motivazione: '',
  };

  if (!estrazione || estrazione.importoDovuto === null) {
    return {
      righe: [
        {
          ...rigaSintetica,
          ricevibile: false,
          motivazione:
            'Carica ed analizza la proposta di cram down prima di poter eseguire il riscontro con i parametri dell’ente.',
        },
      ],
      complessivamenteRicevibile: false,
      datiDisponibili: false,
    };
  }
  if (!estrazione.estrazioneRiuscita) {
    return {
      righe: [
        {
          ...rigaSintetica,
          ricevibile: false,
          motivazione:
            estrazione.motivoMancata ||
            "L'AI non è riuscita a estrarre un importo chiaro dal documento — verifica manualmente.",
        },
      ],
      complessivamenteRicevibile: false,
      datiDisponibili: false,
    };
  }
  if (!limiteEnte) {
    return {
      righe: [
        {
          ...rigaSintetica,
          ricevibile: true,
          motivazione: 'Nessuna soglia configurata per questo ente in Parametri di Spazio.',
        },
      ],
      complessivamenteRicevibile: true,
      datiDisponibili: true,
    };
  }

  const importoOfferto = calcolaImportoOfferto(
    rigaSintetica.importoDovuto,
    rigaSintetica.percentualeOfferta
  );
  const motivi: string[] = [];
  if (haValoreLiquidazione(limiteEnte)) {
    if (importoOfferto < limiteEnte.valoreLiquidazioneStimato) {
      motivi.push(
        `offerta € ${importoOfferto.toLocaleString('it-IT')} inferiore al valore di liquidazione stimato (€ ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}) — otterreste di più in liquidazione giudiziale`
      );
    }
  }
  if (rigaSintetica.percentualeOfferta < limiteEnte.percentualeMinima) {
    motivi.push(
      `offerta ${rigaSintetica.percentualeOfferta}% sotto il minimo richiesto (${limiteEnte.percentualeMinima}%)`
    );
  }
  if (rigaSintetica.modalita === 'UNICA_SOLUZIONE' && !limiteEnte.unicaSoluzioneAmmessa) {
    motivi.push("modalità 'unica soluzione' non ammessa");
  }
  if (rigaSintetica.modalita === 'RATEALE' && !limiteEnte.rateizzazioneAmmessa) {
    motivi.push("modalità 'rateale' non ammessa");
  }
  const motivazionePositiva = haValoreLiquidazione(limiteEnte)
    ? `Offerta € ${importoOfferto.toLocaleString('it-IT')} ≥ valore di liquidazione stimato € ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}.`
    : limiteEnte.percentualeMinima > 0
      ? `Offerta ${rigaSintetica.percentualeOfferta}% ≥ percentuale minima richiesta ${limiteEnte.percentualeMinima}%.`
      : 'Nessuna soglia configurata per questo ente — conforme per assenza di un vincolo, non per un controllo superato. Configura la soglia in Parametri di Spazio.';
  const rigaFinale: EsitoRigaProposta = {
    ...rigaSintetica,
    ricevibile: motivi.length === 0,
    motivazione: motivi.length === 0 ? motivazionePositiva : motivi.join('; '),
  };
  return {
    righe: [rigaFinale],
    complessivamenteRicevibile: rigaFinale.ricevibile,
    datiDisponibili: true,
  };
}
