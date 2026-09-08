// src/lib/normativa/riscontri.ts
//
// Riscontri normativi DETERMINISTICI a valle dello screening: individua gli
// articoli e le soglie «movimentati» dall'analisi partendo ESCLUSIVAMENTE dai
// numeri reali (bilancio XBRL, posizione ente, VERA). Nessuna inferenza
// dell'AI: solo aritmetica sulle soglie di legge, cosi il risultato e
// verificabile e inattaccabile.
//
// Principio guida: non si asserisce mai un obbligo (es. «segnalazione
// dovuta») quando i dati non provano TUTTE le condizioni di legge. Dove il
// dato disponibile copre solo una parte della fattispecie (es. l'importo ma
// non il requisito temporale «scaduto da oltre 90 giorni»), il riscontro lo
// dichiara apertamente come cautela (campo `cautela`) e lo elenca tra i
// `datiMancanti`.

// ---- Soglie di legge (fonte: CCII artt. 2 e 25-novies) --------------------
export const SOGLIA_IMPRESA_MINORE = {
  attivo: 300_000,
  ricavi: 200_000,
  debiti: 500_000,
} as const;

export const SOGLIA_25NOVIES = {
  inpsConDipendenti: 15_000, // e >30% dei contributi dell'anno precedente
  inpsSenzaDipendenti: 5_000,
  inail: 5_000,
  adeIva: 5_000, // e >=10% del volume d'affari; in ogni caso oltre 20.000
  adeIvaAssoluta: 20_000,
  aerImpresaIndividuale: 100_000,
  aerSocietaPersone: 200_000,
  aerAltreSocieta: 500_000,
} as const;

export type EsitoSoglia = 'sotto' | 'sopra' | 'non_disponibile';

export interface RiscontroSoglia {
  /** Etichetta del parametro, es. "Attivo patrimoniale (impresa minore)". */
  parametro: string;
  /** Valore rilevato dai dati (euro). null se non disponibile. */
  valoreRilevato: number | null;
  /** Descrizione testuale della soglia di legge. */
  soglia: string;
  /** Valore-soglia usato per il confronto (euro). */
  sogliaValore: number;
  esito: EsitoSoglia;
  /** Da dove viene il numero rilevato. */
  fonte: string;
  /** Articolo CCII di riferimento. */
  articolo: string;
  /** Cautela: cosa la sola aritmetica NON prova (requisiti ulteriori di legge). */
  cautela?: string;
}

export interface RiscontroIndicatore {
  nome: string;
  dettaglio: string;
  articolo: string;
}

export interface ArticoloMovimentato {
  numero: string;
  motivo: string;
  /** 'soglia' = soglia di legge valutata; 'indicatore' = segnale di crisi;
   *  'leva' = strumento applicabile per la presenza di quei debiti. */
  categoria: 'soglia' | 'indicatore' | 'leva';
}

export interface Riscontri {
  soglie: RiscontroSoglia[];
  indicatori: RiscontroIndicatore[];
  articoli: ArticoloMovimentato[];
  /** Cosa non e stato possibile verificare automaticamente (trasparenza). */
  datiMancanti: string[];
  /** Sintesi impresa minore: true/false/null(non calcolabile). */
  impresaMinore: boolean | null;
}

export interface BilancioRiscontri {
  anno: number | null;
  totaleAttivo: number;
  ricaviVendite: number;
  valoreProduzione: number;
  totaleDebiti: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  ebitda: number;
  patrimonioNetto: number;
  utileEsercizio: number;
  /** Nomi degli indici CCII con esito VIOLATO. */
  indiciViolati: string[];
  severity: 'GREEN' | 'YELLOW' | 'RED';
}

export interface InputRiscontri {
  /** Dati dell'ultimo bilancio XBRL, se presente. */
  bilancio?: BilancioRiscontri | null;
  /** Esposizione totale verso l'ente (posizione debitoria di dettaglio), saldo. */
  esposizioneEnte?: number | null;
  /** Esposizione totale VERA (contabilizzato + da contabilizzare). */
  esposizioneVera?: number | null;
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Calcola i riscontri normativi. Funzione PURA: stesso input -> stesso output,
 * nessun accesso a rete/DB/orologio. Tutta la logica «inattaccabile» vive qui.
 */
export function calcolaRiscontri(input: InputRiscontri): Riscontri {
  const soglie: RiscontroSoglia[] = [];
  const indicatori: RiscontroIndicatore[] = [];
  const articoli: ArticoloMovimentato[] = [];
  const datiMancanti: string[] = [];
  let impresaMinore: boolean | null = null;

  const b = input.bilancio ?? null;

  // --- Parametri dimensionali: impresa minore (art. 2) -------------------
  if (b) {
    const annoTxt = b.anno ? `bilancio ${b.anno}` : 'ultimo bilancio';
    const ricavi = b.ricaviVendite > 0 ? b.ricaviVendite : b.valoreProduzione;
    const soglieMinore: [string, number, number][] = [
      ['Attivo patrimoniale', b.totaleAttivo, SOGLIA_IMPRESA_MINORE.attivo],
      ['Ricavi', ricavi, SOGLIA_IMPRESA_MINORE.ricavi],
      ['Debiti complessivi', b.totaleDebiti, SOGLIA_IMPRESA_MINORE.debiti],
    ];
    let tuttiSotto = true;
    for (const [nome, valore, soglia] of soglieMinore) {
      const esito: EsitoSoglia = valore <= soglia ? 'sotto' : 'sopra';
      if (esito === 'sopra') tuttiSotto = false;
      soglie.push({
        parametro: `${nome} (impresa minore)`,
        valoreRilevato: valore,
        soglia: `≤ ${euro(soglia)}`,
        sogliaValore: soglia,
        esito,
        fonte: `Bilancio XBRL (${annoTxt})`,
        articolo: '2',
      });
    }
    impresaMinore = tuttiSotto;
    articoli.push({
      numero: '2',
      categoria: 'soglia',
      motivo: tuttiSotto
        ? 'I tre parametri dimensionali risultano sotto le soglie: profilo compatibile con «impresa minore» (da confermare sui tre esercizi).'
        : 'Almeno un parametro dimensionale supera la soglia dell’impresa minore.',
    });
    datiMancanti.push(
      'Impresa minore: la legge richiede i valori dei TRE esercizi antecedenti; il riscontro automatico usa l’ultimo bilancio disponibile.'
    );
  } else {
    datiMancanti.push(
      'Bilancio XBRL assente: parametri dimensionali (impresa minore) e indici di bilancio non calcolabili automaticamente.'
    );
  }

  // --- Soglie segnalazione creditori pubblici (art. 25-novies) -----------
  // Base di calcolo: i buckets di bilancio (previdenziali, tributari). Sono
  // aggregati e privi della dimensione temporale: si dichiara la cautela.
  if (b) {
    // INPS/INAIL (previdenziali aggregati)
    const esitoPrev: EsitoSoglia =
      b.debitiPrevidenziali > SOGLIA_25NOVIES.inpsSenzaDipendenti ? 'sopra' : 'sotto';
    soglie.push({
      parametro: 'Debiti previdenziali (segnalazione INPS/INAIL)',
      valoreRilevato: b.debitiPrevidenziali,
      soglia: `> ${euro(SOGLIA_25NOVIES.inpsSenzaDipendenti)} (senza dipendenti) · > ${euro(
        SOGLIA_25NOVIES.inpsConDipendenti
      )} e >30% anno prec. (con dipendenti)`,
      sogliaValore: SOGLIA_25NOVIES.inpsSenzaDipendenti,
      esito: esitoPrev,
      fonte: `Bilancio XBRL (${b.anno ? `bilancio ${b.anno}` : 'ultimo'})`,
      articolo: '25-novies',
      cautela:
        'Dato di bilancio aggregato (INPS+INAIL) e a fine esercizio: non prova il requisito «scaduto da oltre 90 giorni» né il raffronto con l’anno precedente. Verificare sulla posizione debitoria di dettaglio.',
    });
    // Agenzia Entrate (tributari aggregati)
    const esitoTrib: EsitoSoglia = b.debitiTributari > SOGLIA_25NOVIES.adeIva ? 'sopra' : 'sotto';
    soglie.push({
      parametro: 'Debiti tributari (segnalazione Agenzia Entrate)',
      valoreRilevato: b.debitiTributari,
      soglia: `> ${euro(SOGLIA_25NOVIES.adeIva)} e ≥10% volume d’affari · in ogni caso > ${euro(
        SOGLIA_25NOVIES.adeIvaAssoluta
      )}`,
      sogliaValore: SOGLIA_25NOVIES.adeIva,
      esito: esitoTrib,
      fonte: `Bilancio XBRL (${b.anno ? `bilancio ${b.anno}` : 'ultimo'})`,
      articolo: '25-novies',
      cautela:
        'La soglia di legge riguarda la sola IVA da liquidazioni periodiche; il dato di bilancio aggrega i debiti tributari e non isola l’IVA né la scadenza. Verificare sulla posizione di dettaglio.',
    });

    if (b.debitiPrevidenziali > 0 || b.debitiTributari > 0) {
      articoli.push({
        numero: '25-novies',
        categoria: 'soglia',
        motivo: `Esposizione verso creditori pubblici rilevata (previdenziali ${euro(
          b.debitiPrevidenziali
        )}, tributari ${euro(b.debitiTributari)}): valutata sulle soglie di segnalazione.`,
      });
      articoli.push({
        numero: '63',
        categoria: 'leva',
        motivo:
          'Presenza di debiti tributari/contributivi: applicabile la transazione fiscale e contributiva (cram down) negli accordi di ristrutturazione.',
      });
      articoli.push({
        numero: '88',
        categoria: 'leva',
        motivo:
          'Presenza di debiti tributari/contributivi: applicabile il trattamento dei crediti tributari e contributivi nel concordato preventivo.',
      });
    }
    datiMancanti.push(
      'Segnalazioni art. 25-novies: requisito temporale (scaduto da oltre 90 giorni), numero dipendenti e raffronto con l’anno precedente non ricavabili dai soli dati di bilancio.'
    );
  }

  // Esposizione verso l'ente / VERA come dato "certo per certo" informativo.
  if (typeof input.esposizioneEnte === 'number' && input.esposizioneEnte > 0) {
    soglie.push({
      parametro: 'Esposizione verso l’ente (posizione di dettaglio)',
      valoreRilevato: input.esposizioneEnte,
      soglia: 'Riferimento: soglie art. 25-novies del creditore pubblico competente',
      sogliaValore: SOGLIA_25NOVIES.inpsSenzaDipendenti,
      esito: 'non_disponibile',
      fonte: 'Posizione debitoria Ente',
      articolo: '25-novies',
      cautela:
        'Esposizione di dettaglio importata: confrontare con la soglia specifica del creditore pubblico competente e con il requisito temporale.',
    });
  }
  if (typeof input.esposizioneVera === 'number' && input.esposizioneVera > 0) {
    soglie.push({
      parametro: 'Esposizione V.E.R.A. (contabilizzato + da contabilizzare)',
      valoreRilevato: input.esposizioneVera,
      soglia: 'Riferimento: soglie art. 25-novies',
      sogliaValore: SOGLIA_25NOVIES.inpsSenzaDipendenti,
      esito: 'non_disponibile',
      fonte: 'Posizione V.E.R.A.',
      articolo: '25-novies',
      cautela: 'Esposizione VERA di dettaglio: valutare per singola natura e scadenza.',
    });
  }

  // --- Indicatori di crisi (art. 2 lett. a / art. 3) ---------------------
  if (b) {
    if (b.ebitda < 0) {
      indicatori.push({
        nome: 'EBITDA negativo',
        dettaglio: `EBITDA ${euro(b.ebitda)}: la gestione operativa non genera cassa.`,
        articolo: '3',
      });
    }
    if (b.patrimonioNetto < 0) {
      indicatori.push({
        nome: 'Patrimonio netto negativo',
        dettaglio: `Patrimonio netto ${euro(b.patrimonioNetto)}: erosione integrale del capitale.`,
        articolo: '3',
      });
    }
    if (b.utileEsercizio < 0) {
      indicatori.push({
        nome: 'Perdita d’esercizio',
        dettaglio: `Risultato ${euro(b.utileEsercizio)}.`,
        articolo: '3',
      });
    }
    for (const nome of b.indiciViolati) {
      indicatori.push({
        nome: `Indice CCII violato: ${nome}`,
        dettaglio: 'Indice di allerta oltre la soglia CNDCEC/CCII.',
        articolo: '3',
      });
    }
    if (indicatori.length > 0 || b.severity !== 'GREEN') {
      articoli.push({
        numero: '3',
        categoria: 'indicatore',
        motivo:
          b.severity === 'RED'
            ? 'Segnali di crisi rilevati (severità alta): rilevazione tempestiva e adeguatezza degli assetti.'
            : indicatori.length > 0
              ? 'Segnali di crisi rilevati dagli indici/valori di bilancio.'
              : 'Severità non verde sui dati di bilancio.',
      });
    }
  }

  // Dedup articoli mantenendo il primo motivo (piu specifico).
  const visti = new Set<string>();
  const articoliUnici = articoli.filter((a) => {
    const k = `${a.numero}|${a.categoria}`;
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });

  return { soglie, indicatori, articoli: articoliUnici, datiMancanti, impresaMinore };
}
