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

// Le soglie dell'art. 25-novies NON stanno piu' qui: unica sede, src/lib/soglie25novies.

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

  // --- Art. 25-novies: NON si valuta qui (0.109.84) -----------------------
  // Fino alla 0.109.83 questa funzione confrontava con le soglie dell'art.
  // 25-novies i debiti previdenziali e tributari del BILANCIO e l'esposizione
  // V.E.R.A. Era un secondo motore, rimasto fuori dalla riscrittura delle
  // soglie (0.109.78-79), e violava due principi fissati da Ercole: l'XBRL
  // serve solo al quadro generale, mai alle soglie (la voce D.13 somma INPS e
  // INAIL); un credito passato a ruolo esce dalla lettera a). L'unico motore
  // delle soglie e' src/lib/soglie25novies: il pannello dei Riscontri lo
  // interroga direttamente. Qui resta solo la segnalazione che il tema esiste.
  if (b && (b.debitiPrevidenziali > 0 || b.debitiTributari > 0)) {
    articoli.push({
      numero: '25-novies',
      categoria: 'soglia',
      motivo: `Il bilancio espone debiti verso creditori pubblici (previdenziali ${euro(
        b.debitiPrevidenziali
      )}, tributari ${euro(b.debitiTributari)}). Il dato di bilancio è aggregato e non si confronta con le soglie: il riscontro è nella sezione «Presupposti oggettivi dell’art. 25-novies», sui dati ufficiali degli enti.`,
    });
    articoli.push({
      numero: '63',
      categoria: 'leva',
      motivo:
        'Presenza di debiti tributari o contributivi: negli accordi di ristrutturazione il loro trattamento è disciplinato dall’art. 63. Nella composizione negoziata la transazione dell’art. 23, comma 2-bis riguarda i soli crediti fiscali: INPS e INAIL ne sono esclusi.',
    });
    articoli.push({
      numero: '88',
      categoria: 'leva',
      motivo:
        'Presenza di debiti tributari o contributivi: nel concordato preventivo il loro trattamento è disciplinato dall’art. 88.',
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
        dettaglio: `Patrimonio netto ${euro(b.patrimonioNetto)}: il capitale risulta eroso per intero. Il dato rileva ai fini degli artt. 2482-bis e 2482-ter c.c. (s.r.l.) o 2446 e 2447 c.c. (s.p.a.): la piattaforma lo rileva, non accerta alcun obbligo. Da verificare con l’organo amministrativo se la società si è avvalsa della sospensione per le perdite 2020-2022 (D.L. 23/2020, art. 6): non è un’esenzione automatica, richiede l’individuazione dell’esercizio in cui la perdita è emersa, delle delibere adottate e del rinvio formalizzato, e non sottrae gli amministratori ai doveri di conservazione del patrimonio; per le perdite 2020 il quinquennio scade con l’approvazione del bilancio 2025, cioè nel 2026. Sull’ampiezza della sospensione esiste un contrasto interpretativo non consolidato (Triveneto contro CNN). La perdita si determina sulla reale consistenza patrimoniale, considerando riserve e interventi patrimoniali.`,
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
