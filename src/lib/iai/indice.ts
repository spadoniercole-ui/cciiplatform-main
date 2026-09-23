// src/lib/iai/indice.ts
//
// INDICE DI ATTENZIONE ISTRUTTORIA (IAI) — la copertina dello Screening.
//
// Indice composito 0-100 costruito secondo i passi del manuale OCSE-JRC sugli
// indicatori compositi (Nardo, Saisana, Saltelli, Tarantola, 2005/2008):
// indicatori scelti, normalizzazione per distanza dall'obiettivo,
// ponderazione dichiarata, aggregazione con vincoli di NON compensabilita'
// (Munda 2005). Per la struttura di bilancio si usa lo Z''-score di Altman
// (1995, versione per societa' non quotate e non manifatturiere).
//
// Che cosa NON e': un accertamento. Dice quanta attenzione la posizione
// merita dal livello decisionale successivo. Lessico di Libra: niente
// «crisi» o «insolvenza» come esito, niente «solido».
//
// Logica pura e deterministica: stessi dati, stesso numero. Ogni parametro
// (obiettivo, saturazione, peso, vincolo) e' un dato, con i valori proposti
// da Claude come default e destinato ai Parametri di Spazio.

export type Dimensione = 'A' | 'B' | 'C' | 'D' | 'E';

export const NOME_DIMENSIONE: Record<Dimensione, string> = {
  A: 'Esposizione verso l’ente',
  B: 'Struttura patrimoniale e finanziaria',
  C: 'Dinamica',
  D: 'Affidabilità dei dati',
  E: 'Quadro procedurale',
};

export interface ParametriIai {
  pesi: Record<Dimensione, number>;
  /** Vincoli di non compensabilita': l'indice non scende sotto il minimo se il vincolo scatta. */
  vincoli: {
    proceduraPendente: number;
    denunceAssentiConAddetti: number;
    sogliaEnteSuperata: number;
  };
  fasce: { fine: number; nome: string; lettura: string }[];
}

export const PARAMETRI_IAI_PREDEFINITI: ParametriIai = {
  pesi: { A: 30, B: 25, C: 15, D: 15, E: 15 },
  vincoli: { proceduraPendente: 70, denunceAssentiConAddetti: 75, sogliaEnteSuperata: 56 },
  fasce: [
    {
      fine: 30,
      nome: 'Attenzione contenuta',
      lettura:
        'Non si sottopone: la posizione non presenta, sui dati disponibili, elementi che richiedano un passaggio al livello successivo.',
    },
    {
      fine: 55,
      nome: 'Da monitorare',
      lettura:
        'Si tiene la posizione sotto osservazione, con un nuovo Screening alla prossima scadenza utile.',
    },
    {
      fine: 75,
      nome: 'Da sottoporre al dirigente',
      lettura: 'Si sottopone al dirigente per un confronto con l’azienda.',
    },
    {
      fine: 100,
      nome: 'Da sottoporre con urgenza',
      lettura:
        'Si sottopone con urgenza al dirigente, per valutare anche la richiesta di liquidazione giudiziale.',
    },
  ],
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
  };
}

export interface Componente {
  dimensione: Dimensione;
  punteggio: number;
  /** Determinanti in chiaro, dal piu' pesante. */
  motivi: string[];
  /** Dati mancanti che hanno limitato la misura. */
  lacune: string[];
}

export interface EsitoIai {
  indice: number;
  fascia: { nome: string; lettura: string; indiceFascia: number };
  componenti: Componente[];
  vincoliScattati: { nome: string; minimo: number }[];
  /** Tre righe generate dai numeri, non dall'AI. */
  sintesi: string;
  parametri: ParametriIai;
}

const arrot = (n: number) => Math.round(n);

export function calcolaIai(d: DatiIai, p: ParametriIai = PARAMETRI_IAI_PREDEFINITI): EsitoIai {
  const comp: Componente[] = [];
  const vincoli: { nome: string; minimo: number }[] = [];

  // ---- A. Esposizione verso l'ente -----------------------------------------
  {
    const motivi: string[] = [];
    const lacune: string[] = [];
    let punti: number[] = [];
    for (const s of d.ente.soglie) {
      if (s.esito === 'sopra') {
        punti.push(100);
        motivi.push(`${s.ambito}: presupposti oggettivi rilevati`);
        vincoli.push({
          nome: `Presupposti dell’art. 25-novies rilevati (${s.ambito})`,
          minimo: p.vincoli.sogliaEnteSuperata,
        });
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
      vincoli.push({
        nome: 'Denunce Uniemens assenti con addetti dichiarati',
        minimo: p.vincoli.denunceAssentiConAddetti,
      });
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

  // ---- C. Dinamica ------------------------------------------------------
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

  // ---- D. Affidabilita' dei dati --------------------------------------------
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

  // ---- E. Quadro procedurale --------------------------------------------
  {
    const motivi: string[] = [];
    const lacune: string[] = [];
    let punti = 0;
    if (!d.visura.disponibile) lacune.push('visura non disponibile');
    if (d.visura.proceduraPendente) {
      punti = 100;
      motivi.push(`procedura concorsuale risultante dalla visura: ${d.visura.proceduraPendente}`);
      vincoli.push({
        nome: 'Procedura concorsuale pendente in visura',
        minimo: p.vincoli.proceduraPendente,
      });
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

  // ---- Aggregazione con vincoli ------------------------------------------------
  const sommaPesi = (Object.values(p.pesi) as number[]).reduce((s, x) => s + x, 0);
  const media = comp.reduce((s, c) => s + c.punteggio * p.pesi[c.dimensione], 0) / sommaPesi;
  const minimo = vincoli.reduce((m, v) => Math.max(m, v.minimo), 0);
  const indice = arrot(Math.min(100, Math.max(media, minimo)));
  const indiceFascia = p.fasce.findIndex((f) => indice <= f.fine);
  const fascia = p.fasce[indiceFascia === -1 ? p.fasce.length - 1 : indiceFascia];

  const determinanti = comp
    .filter((c) => c.punteggio >= 50 && c.motivi.length)
    .sort((a, b) => b.punteggio * p.pesi[b.dimensione] - a.punteggio * p.pesi[a.dimensione])
    .slice(0, 3)
    .map((c) => `${c.motivi[0]} (${c.dimensione})`);
  const lacune = comp.flatMap((c) => c.lacune).slice(0, 2);
  const sintesi = [
    `IAI ${indice}, fascia «${fascia.nome}»${vincoli.length ? ` — ${vincoli.length === 1 ? 'un vincolo scattato' : `${vincoli.length} vincoli scattati`}` : ''}.`,
    determinanti.length
      ? `Determinano l’esito: ${determinanti.join('; ')}.`
      : 'Nessuna componente sopra la metà della scala.',
    lacune.length ? `Limiti della misura: ${lacune.join('; ')}.` : 'Nessuna lacuna nei dati usati.',
  ].join('\n');

  return {
    indice,
    fascia: { ...fascia, indiceFascia: Math.max(0, indiceFascia) },
    componenti: comp,
    vincoliScattati: vincoli,
    sintesi,
    parametri: p,
  };
}

export const DICHIARAZIONE_IAI =
  'Indicatore composito di orientamento istruttorio, costruito secondo la metodologia OCSE-JRC per gli indicatori compositi (normalizzazione per distanza dall’obiettivo, ponderazione dichiarata, aggregazione con vincoli di non compensabilità); struttura di bilancio misurata con lo Z’’-score di Altman (1995). Non costituisce accertamento di crisi o insolvenza né giudizio sulla proposta: orienta il livello decisionale successivo. Parametri e pesi sono dichiarati e modificabili dall’ente.';
