// src/lib/registroFonti/regole.ts
//
// Regole di decisione deterministiche, fondate sul registro delle fonti.
//
// Ogni regola restituisce DUE formule: una per il Ricevente, che valuta una
// proposta ricevuta, e una per il Redigente, che la costruisce. La stessa
// norma letta dai due lati produce messaggi diversi: se si scrivesse una
// formula sola, uno dei due spazi riceverebbe il messaggio sbagliato.
//
// Nessuna regola dichiara un esito riservato: il sistema non dice mai che il
// cram down e' "applicabile" o che una proposta e' "conveniente". Rileva
// parametri e perimetri; il giudizio resta al professionista, all'ente e al
// tribunale (matrice di responsabilita' di Libra).

export interface EsitoRegola {
  /** 'bloccato' = manca un dato decisivo: nessuna formula di merito. */
  esito: 'determinato' | 'bloccato';
  fonti: string[];
  perRicevente: string;
  perRedigente: string;
}

// ---------------------------------------------------------------------------
// Parametri del cram down negli accordi di ristrutturazione (art. 63)
// ---------------------------------------------------------------------------

/** Dal 28/09/2024 si applica l'art. 63 sostituito dal D.Lgs. 136/2024. */
export const DECORRENZA_CORRETTIVO_TER = '2024-09-28';

export interface ParametriCramDown extends EsitoRegola {
  percentualeMinima?: number;
  dilazioneMassimaAnni?: number;
  regime?: 'correttivo-ter' | 'transitorio';
}

/**
 * Sceglie la versione della norma in base alla DATA DELLA PROPOSTA, non alla
 * data di oggi: una proposta depositata nel regime transitorio resta
 * governata dalle soglie 30/40, anche se la si esamina dopo.
 *
 * Dati decisivi (RULE-TRACE-63-001, sottoinsieme): data di deposito della
 * proposta e quota degli altri aderenti sull'indebitamento complessivo. Se
 * manca uno dei due, la regola si blocca invece di scegliere una soglia.
 */
export function parametriCramDown63(input: {
  dataProposta: string | null;
  /** Quota degli altri creditori aderenti sull'indebitamento complessivo, 0..1. */
  quotaAltriAderenti: number | null;
}): ParametriCramDown {
  const { dataProposta, quotaAltriAderenti } = input;
  if (!dataProposta || !/^\d{4}-\d{2}-\d{2}$/.test(dataProposta)) {
    const motivo =
      'Manca la data di deposito della proposta: senza, non si sa quale versione dell’art. 63 si applica.';
    return {
      esito: 'bloccato',
      fonti: ['CCII-63-vigente'],
      perRicevente: motivo,
      perRedigente: motivo,
    };
  }
  if (quotaAltriAderenti === null || !(quotaAltriAderenti >= 0 && quotaAltriAderenti <= 1)) {
    const motivo =
      'Manca la quota degli altri creditori aderenti sull’indebitamento complessivo: decide quale delle due soglie si applica.';
    return {
      esito: 'bloccato',
      fonti: ['CCII-63-vigente'],
      perRicevente: motivo,
      perRedigente: motivo,
    };
  }

  const correttivoTer = dataProposta >= DECORRENZA_CORRETTIVO_TER;
  const conAderenti = quotaAltriAderenti >= 0.25;

  if (correttivoTer) {
    const perc = conAderenti ? 50 : 60;
    const fonteId = conAderenti ? 'CCII-63-c4' : 'CCII-63-c5';
    const dilazione = conAderenti ? undefined : 10;
    const vincoli = `${perc}% dei crediti di ciascun ente, esclusi sanzioni e interessi${dilazione ? `, con dilazione non oltre ${dilazione} anni` : ''}`;
    return {
      esito: 'determinato',
      regime: 'correttivo-ter',
      percentualeMinima: perc,
      dilazioneMassimaAnni: dilazione,
      fonti: ['CCII-63-vigente', fonteId],
      perRicevente: `Parametro quantitativo per l’esame dell’omologazione forzosa: ${vincoli} (art. 63, versione in vigore dal 28/09/2024). Il riscontro del parametro non dice se il cram down sia applicabile: lo valuta il tribunale.`,
      perRedigente: `Perché la proposta possa essere sottoposta all’omologazione forzosa, il soddisfacimento del credito pubblico non può essere inferiore al ${vincoli}. È una condizione minima, non una garanzia di omologazione.`,
    };
  }

  const perc = conAderenti ? 30 : 40;
  const dilazione = conAderenti ? undefined : 10;
  const vincoli = `${perc}% dei crediti${dilazione ? `, con dilazione non oltre ${dilazione} anni` : ''}`;
  return {
    esito: 'determinato',
    regime: 'transitorio',
    percentualeMinima: perc,
    dilazioneMassimaAnni: dilazione,
    fonti: ['DL69-2023-1bis'],
    perRicevente: `Proposta depositata prima del 28/09/2024: si applica la disciplina transitoria, con parametro del ${vincoli}. La composizione del denominatore, con o senza sanzioni e interessi, è ancora da confermare sul testo.`,
    perRedigente: `Proposta del periodo transitorio: soglia minima del ${vincoli}. Verificare sul testo la composizione del denominatore prima di fissare la percentuale.`,
  };
}

// ---------------------------------------------------------------------------
// Perimetro della transazione nella composizione negoziata (art. 23, c. 2-bis)
// ---------------------------------------------------------------------------

export type EnteCreditore =
  'INPS' | 'INAIL' | 'AGENZIA_ENTRATE' | 'AGENZIA_RISCOSSIONE' | 'ALTRO_PREVIDENZIALE';

export interface PerimetroCN extends EsitoRegola {
  ammesso: boolean;
}

/**
 * Nella composizione negoziata la transazione riguarda solo i tributi delle
 * agenzie fiscali e i carichi dell'Agente della Riscossione. Contributi e
 * premi ne sono esclusi, e non esiste omologazione forzosa. Per uno spazio
 * INPS e' un blocco esplicito contro l'assimilazione a una transazione
 * contributiva ex art. 63 (Libra, riscontro sulla mappa F).
 */
export function perimetroTransazioneCN(ente: EnteCreditore): PerimetroCN {
  const fonti = ['CCII-23-c2bis'];
  if (ente === 'AGENZIA_ENTRATE' || ente === 'AGENZIA_RISCOSSIONE') {
    return {
      esito: 'determinato',
      ammesso: true,
      fonti,
      perRicevente:
        'Il credito rientra nel perimetro istruttorio della proposta ex art. 23, comma 2-bis. L’accordo richiede la sottoscrizione dell’ente: non è prevista omologazione forzosa.',
      perRedigente:
        'Il debito può essere oggetto della transazione in composizione negoziata. Servono la relazione sulla convenienza rispetto alla liquidazione giudiziale e quella sulla completezza dei dati; senza la sottoscrizione dell’ente non c’è accordo.',
    };
  }
  const natura = ente === 'INAIL' ? 'assicurativo obbligatorio' : 'previdenziale obbligatorio';
  return {
    esito: 'determinato',
    ammesso: false,
    fonti,
    perRicevente: `Il credito è ${natura} e non rientra nel perimetro della transazione fiscale nella composizione negoziata (art. 23, comma 2-bis). Non va istruito come transazione contributiva ex art. 63.`,
    perRedigente: `I debiti ${ente === 'INAIL' ? 'verso l’INAIL' : 'verso l’INPS'} non possono essere oggetto della transazione in composizione negoziata. Vanno trattati con uno strumento diverso: accordo di ristrutturazione con transazione ex art. 63, piano di ristrutturazione soggetto a omologazione o concordato preventivo.`,
  };
}
