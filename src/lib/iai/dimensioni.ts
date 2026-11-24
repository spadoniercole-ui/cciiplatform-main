// src/lib/iai/dimensioni.ts
//
// LE CINQUE DIMENSIONI — la spiegazione del giudizio, non un secondo giudizio.
//
// Fino alla 0.2xx questo file produceva anche un Indice di Attenzione
// Istruttoria: un numero da 0 a 100, con pesi configurabili dall'ente, vincoli
// di non compensabilità e fasce di lettura («da monitorare», «da sottoporre con
// urgenza»). Accanto al semaforo della verifica — fatti accertati, lacune,
// copertura informativa — quel numero diceva un'altra cosa sulla stessa
// posizione: 41 «da monitorare» sotto un «criticità rilevante». Due giudizi
// sulla stessa materia non sono una ricchezza: chi decide non sa a quale dei
// due credere, e la schermata che li mostra uno sopra l'altro è la confusione
// che questo modulo chiude.
//
// Il numero non c'è più. Resta ciò che il motore misura davvero, dimensione
// per dimensione, con i suoi determinanti e le sue lacune: cinque righe che
// spiegano DA DOVE viene l'attenzione. L'esito resta uno solo e sta in
// `src/lib/screening/indicatore.ts` — soglie di legge, gerarchia non
// compensatoria, ciò che è accertato e ciò che manca.
//
// Perché le dimensioni si tengono comunque: misurano cose che il semaforo non
// legge (procedura concorsuale in visura, stato dell'attività, età della
// visura, dinamica dei ricavi, patrimonio netto sotto il capitale sociale) e le
// misurano con numeri. Sono il «perché» del giudizio, non un punteggio
// alternativo.
//
// Logica pura e deterministica: stessi dati, stesse righe. Nessun parametro
// dell'ente: le soglie normative stanno nei Parametri di Spazio, i pesi non
// esistono più.

export type Dimensione = 'A' | 'B' | 'C' | 'D' | 'E';

export const NOME_DIMENSIONE: Record<Dimensione, string> = {
  A: 'Esposizione verso l’ente',
  B: 'Struttura patrimoniale e finanziaria',
  C: 'Dinamica',
  D: 'Affidabilità dei dati',
  E: 'Quadro procedurale',
};

/** Normalizzazione per distanza dall'obiettivo: 0 all'obiettivo, 100 alla saturazione, lineare in mezzo. */
export function normalizza(valore: number, obiettivo: number, saturazione: number): number {
  if (obiettivo === saturazione) return valore >= saturazione ? 100 : 0;
  const t = (valore - obiettivo) / (saturazione - obiettivo);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Z''-score di Altman (1995): 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4 + 3,25. */
export function altmanZ2(b: {
  attivoCircolante: number;
  passivoCorrente: number | null;
  totaleAttivo: number;
  utiliNonDistribuiti: number | null;
  ebit: number;
  patrimonioNetto: number;
  totaleDebiti: number;
}): number | null {
  if (!(b.totaleAttivo > 0) || !(b.totaleDebiti > 0)) return null;
  const x1 = (b.attivoCircolante - (b.passivoCorrente ?? 0)) / b.totaleAttivo;
  const x2 = (b.utiliNonDistribuiti ?? b.patrimonioNetto) / b.totaleAttivo;
  const x3 = b.ebit / b.totaleAttivo;
  const x4 = b.patrimonioNetto / b.totaleDebiti;
  return 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4 + 3.25;
}

export interface DatiIai {
  ente: {
    /** Esiti delle fattispecie applicabili dell'art. 25-novies per l'ente dello spazio. */
    soglie: {
      ambito: string;
      esito: 'sopra' | 'sotto' | 'non_determinabile';
      esposizione: number | null;
    }[];
    importiNonNoti: number;
    /** null = dato non disponibile (l'esito del triage non e' conservato). */
    denunceAssenti: boolean | null;
    addetti: number | null;
  };
  bilancio: {
    corrente: {
      anno: number | null;
      ricavi: number | null;
      ebitda: number | null;
      utile: number | null;
      totaleAttivo: number | null;
      attivoCircolante: number | null;
      patrimonioNetto: number | null;
      totaleDebiti: number | null;
      /** Debiti di bilancio verso banche/fornitori/fisco/previdenza tutti a zero con debiti totali positivi. */
      debitiNonDisaggregati: boolean;
    } | null;
    precedente: {
      ricavi: number | null;
      utile: number | null;
      patrimonioNetto: number | null;
    } | null;
  };
  fascicolo: { totale: number; titoloEnte: number; dichiarato: number; nonNoti: number };
  visura: {
    disponibile: boolean;
    proceduraPendente: string | null;
    statoAttivitaAnomalo: string | null;
    giorniVisura: number | null;
    capitaleSociale: number | null;
    /**
     * Le variazioni che la visura dichiara — capitale, compagine, oggetto,
     * rappresentante legale, sede, procedure in corso. Facoltative: la visura
     * precaricata non le porta sempre estratte, e quando non ci sono il box E
     * lo dice invece di far credere che nulla sia cambiato.
     */
    variazioni?: { etichetta: string; testo: string; segnala: boolean }[] | null;
  };
}

export interface Componente {
  dimensione: Dimensione;
  /**
   * Intensità dei determinanti su questa dimensione, 0-100: serve alla barra e
   * all'ordine. NON è un voto da leggere da solo, e non si somma alle altre.
   */
  punteggio: number;
  /** Determinanti in chiaro, dal più pesante. */
  motivi: string[];
  /** Dati mancanti che hanno limitato la misura. */
  lacune: string[];
}

const arrot = (n: number) => Math.round(n);

/**
 * Le cinque dimensioni, con determinanti e lacune. Nessun esito complessivo:
 * il giudizio è quello del semaforo della verifica.
 */
export function diagnosticaDimensioni(d: DatiIai): Componente[] {
  const comp: Componente[] = [];

  // ---- A. Esposizione verso l'ente -----------------------------------------
  {
    const motivi: string[] = [];
    const lacune: string[] = [];
    let punti: number[] = [];
    for (const s of d.ente.soglie) {
      if (s.esito === 'sopra') {
        punti.push(100);
        motivi.push(`${s.ambito}: presupposti oggettivi rilevati`);
      } else if (s.esito === 'non_determinabile') {
        punti.push(s.esposizione && s.esposizione > 0 ? 60 : 30);
        lacune.push(`${s.ambito}: esito non esprimibile per dati mancanti`);
      } else {
        punti.push(s.esposizione && s.esposizione > 0 ? 25 : 0);
      }
    }
    if (d.ente.denunceAssenti === true && (d.ente.addetti ?? 0) > 0) {
      punti.push(100);
      motivi.unshift(`nessuna denuncia Uniemens con ${d.ente.addetti} addetti in visura`);
    } else if (d.ente.denunceAssenti === null) {
      lacune.push('esito del triage sulle denunce non conservato');
    }
    if (d.ente.importiNonNoti > 0) {
      punti.push(Math.min(100, 40 + 20 * d.ente.importiNonNoti));
      motivi.push(
        `${d.ente.importiNonNoti} ${d.ente.importiNonNoti === 1 ? 'voce' : 'voci'} a importo non noto: l’esposizione è un minimo`
      );
    }
    if (punti.length === 0) {
      punti = [0];
      lacune.push('nessun dato dell’ente caricato');
    }
    comp.push({ dimensione: 'A', punteggio: arrot(Math.max(...punti)), motivi, lacune });
  }

  // ---- B. Struttura patrimoniale e finanziaria -----------------------------
  {
    const b = d.bilancio.corrente;
    const motivi: string[] = [];
    const lacune: string[] = [];
    const punti: number[] = [];
    if (!b || b.totaleAttivo === null) {
      lacune.push('nessun bilancio XBRL caricato');
      comp.push({ dimensione: 'B', punteggio: 0, motivi, lacune });
    } else {
      const z =
        b.totaleDebiti &&
        b.patrimonioNetto !== null &&
        b.attivoCircolante !== null &&
        b.ebitda !== null
          ? altmanZ2({
              attivoCircolante: b.attivoCircolante,
              passivoCorrente: null,
              totaleAttivo: b.totaleAttivo,
              utiliNonDistribuiti: null,
              ebit: b.ebitda,
              patrimonioNetto: b.patrimonioNetto,
              totaleDebiti: b.totaleDebiti,
            })
          : null;
      if (z !== null) {
        const pz = normalizza(-z, -2.6, -1.1);
        punti.push(pz);
        if (pz >= 50)
          motivi.push(
            `Z''-score di Altman ${z.toFixed(2)} (zona di pericolo sotto 1,1; sicura sopra 2,6)`
          );
      } else lacune.push("Z''-score non calcolabile: manca una voce di bilancio");
      if (b.patrimonioNetto !== null && b.totaleDebiti) {
        const r = b.patrimonioNetto / b.totaleDebiti;
        const pr = normalizza(-r, -0.2, 0.2);
        punti.push(pr);
        if (pr >= 50)
          motivi.push(
            `patrimonio netto ${b.patrimonioNetto < 0 ? 'negativo' : 'esiguo'}: ${arrot(r * 100)}% dei debiti`
          );
      }
      if (b.ebitda !== null && b.ricavi) {
        const m = b.ebitda / b.ricavi;
        const pm = normalizza(-m, -0.05, 0.05);
        punti.push(pm);
        if (pm >= 50)
          motivi.push(
            `EBITDA ${b.ebitda < 0 ? 'negativo' : 'esiguo'}: ${arrot(m * 100)}% dei ricavi`
          );
      }
      comp.push({
        dimensione: 'B',
        punteggio: punti.length ? arrot(punti.reduce((s, x) => s + x, 0) / punti.length) : 0,
        motivi,
        lacune,
      });
    }
  }

  // ---- C. Dinamica ---------------------------------------------------------
  {
    const c = d.bilancio.corrente;
    const pr = d.bilancio.precedente;
    const motivi: string[] = [];
    const lacune: string[] = [];
    const punti: number[] = [];
    if (!c || !pr) lacune.push('serve un secondo esercizio per misurare la dinamica');
    else {
      if (c.ricavi !== null && pr.ricavi) {
        const v = c.ricavi / pr.ricavi - 1;
        const pv = normalizza(-v, -0.05, 0.3);
        punti.push(pv);
        if (pv >= 50) motivi.push(`ricavi ${arrot(v * 100)}% sull’esercizio precedente`);
      }
      if (c.utile !== null && pr.utile !== null) {
        const peggiora = c.utile < pr.utile && c.utile < 0;
        punti.push(peggiora ? 80 : c.utile < 0 ? 50 : 0);
        if (peggiora) motivi.push('risultato d’esercizio passato in perdita o peggiorato');
      }
      if (c.patrimonioNetto !== null && pr.patrimonioNetto !== null) {
        const peggiora = c.patrimonioNetto < pr.patrimonioNetto;
        punti.push(peggiora && c.patrimonioNetto < 0 ? 80 : peggiora ? 40 : 0);
        if (peggiora && c.patrimonioNetto < 0)
          motivi.push('patrimonio netto negativo e in peggioramento');
      }
    }
    comp.push({
      dimensione: 'C',
      punteggio: punti.length ? arrot(punti.reduce((s, x) => s + x, 0) / punti.length) : 0,
      motivi,
      lacune,
    });
  }

  // ---- D. Affidabilita' dei dati -------------------------------------------
  {
    const motivi: string[] = [];
    const lacune: string[] = [];
    let punti = 0;
    if (d.fascicolo.totale === 0) {
      punti = 100;
      lacune.push('fascicolo di evidenza vuoto');
    } else {
      const quotaFragile = (d.fascicolo.dichiarato + d.fascicolo.nonNoti) / d.fascicolo.totale;
      punti = normalizza(quotaFragile, 0.4, 1);
      if (d.fascicolo.nonNoti > 0) {
        punti = Math.max(punti, 40 + 15 * d.fascicolo.nonNoti);
        motivi.push(`${d.fascicolo.nonNoti} importi non noti nel fascicolo`);
      }
      if (d.bilancio.corrente?.debitiNonDisaggregati) {
        punti = Math.max(punti, 70);
        motivi.push(
          'debiti di bilancio non disaggregati per natura (banche, fornitori, fisco, previdenza a zero)'
        );
      }
      if (d.ente.soglie.some((s) => s.esito === 'non_determinabile')) {
        punti = Math.max(punti, 50);
        motivi.push('presupposti dell’ente non esprimibili per dati mancanti');
      }
    }
    if (!d.visura.disponibile) lacune.push('fatti della visura non estratti');
    comp.push({ dimensione: 'D', punteggio: Math.min(100, arrot(punti)), motivi, lacune });
  }

  // ---- E. Quadro procedurale ----------------------------------------------
  {
    const motivi: string[] = [];
    const lacune: string[] = [];
    let punti = 0;
    if (!d.visura.disponibile) lacune.push('visura non disponibile');
    if (d.visura.proceduraPendente) {
      punti = 100;
      motivi.push(`procedura concorsuale risultante dalla visura: ${d.visura.proceduraPendente}`);
    }
    if (d.visura.statoAttivitaAnomalo) {
      punti = Math.max(punti, 80);
      motivi.push(`stato dell’attività: ${d.visura.statoAttivitaAnomalo}`);
    }
    const b = d.bilancio.corrente;
    if (
      b?.patrimonioNetto !== null &&
      b?.patrimonioNetto !== undefined &&
      d.visura.capitaleSociale !== null &&
      b.patrimonioNetto < d.visura.capitaleSociale
    ) {
      punti = Math.max(punti, b.patrimonioNetto < 0 ? 70 : 40);
      motivi.push(
        'patrimonio netto sotto il capitale sociale: rilevano gli artt. 2482-bis/ter c.c. (da verificare, con la sospensione 2020-2022)'
      );
    }
    if (d.visura.giorniVisura !== null && d.visura.giorniVisura > 90) {
      punti = Math.max(punti, 30);
      lacune.push(`visura di ${d.visura.giorniVisura} giorni fa`);
    }
    comp.push({ dimensione: 'E', punteggio: arrot(punti), motivi, lacune });
  }

  return comp;
}

export const DICHIARAZIONE_DIMENSIONI =
  'Le cinque dimensioni spiegano da dove viene l’attenzione: sono determinanti e lacune, non un punteggio complessivo e non un giudizio. L’esito della verifica è quello del semaforo — fatti accertati, dati mancanti, copertura informativa — e non si compensa con una dimensione favorevole: i presupposti di legge e il patrimonio netto negativo sono fatti, non pesi. La struttura di bilancio è misurata con lo Z’’-score di Altman (1995); gli indici diagnostici sono strumenti operativi, non parametri normativi (il sistema dell’originario art. 13 CCII è abrogato).';

/** Basi metodologiche delle dimensioni, da stampare in allegato. */
export const BASI_METODOLOGICHE_IAI: { rif: string; uso: string }[] = [
  {
    rif: 'Altman E.I., Hartzell J., Peck M., Emerging Markets Corporate Bonds: A Scoring System, Salomon Brothers, 1995 (Z’’-score per società non quotate e non manifatturiere; da Altman E.I., Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy, Journal of Finance, 1968).',
    uso: 'dimensione B: struttura patrimoniale e finanziaria (zona di sicurezza sopra 2,6; zona di pericolo sotto 1,1).',
  },
  {
    rif: 'OECD/JRC (Nardo M., Saisana M., Saltelli A., Tarantola S., Hoffman A., Giovannini E.), Handbook on Constructing Composite Indicators: Methodology and User Guide, OECD Publishing, 2008.',
    uso: 'normalizzazione per distanza dall’obiettivo delle misure di dimensione: rende confrontabili grandezze diverse, senza aggregarle in un indice.',
  },
  {
    rif: 'CNDCEC, Crisi d’impresa. Gli indici dell’allerta, ottobre 2019.',
    uso: 'indici diagnostici di bilancio, come strumenti operativi e non parametri normativi (il sistema dell’originario art. 13 CCII è abrogato).',
  },
];

/** Riferimenti normativi che entrano nelle dimensioni, per l'allegato. */
export const RIFERIMENTI_NORMATIVI_IAI: { dimensione: Dimensione; rif: string }[] = [
  {
    dimensione: 'A',
    rif: 'D.Lgs. 14/2019 (CCII), art. 25-novies — segnalazioni dei creditori pubblici qualificati (presupposti oggettivi rilevati / non rilevati).',
  },
  {
    dimensione: 'A',
    rif: 'D.L. 30 settembre 2003, n. 269, art. 44, comma 9 (conv. L. 326/2003) — obbligo di trasmissione mensile delle denunce Uniemens.',
  },
  {
    dimensione: 'B',
    rif: 'D.Lgs. 14/2019 (CCII), art. 3 — adeguatezza degli assetti e rilevazione tempestiva degli squilibri (gli indici sono diagnostici, non soglie di legge).',
  },
  {
    dimensione: 'B',
    rif: 'D.Lgs. 14/2019 (CCII), art. 2, lett. d) — parametri dimensionali dell’impresa minore.',
  },
  {
    dimensione: 'E',
    rif: 'Codice civile, artt. 2482-bis e 2482-ter (s.r.l.), 2446 e 2447 (s.p.a.) — riduzione del capitale per perdite; D.L. 23/2020, art. 6 — sospensione per le perdite 2020-2022.',
  },
  {
    dimensione: 'E',
    rif: 'D.Lgs. 14/2019 (CCII), art. 390 — disciplina transitoria dei procedimenti anteriori (procedure pendenti risultanti dalla visura).',
  },
  {
    dimensione: 'D',
    rif: 'Perimetro dei dati dichiarato in testa all’elaborato: dati di provenienza aziendale riportati come proposti; crediti dell’ente acquisiti sul presupposto degli atti che li fondano.',
  },
];
