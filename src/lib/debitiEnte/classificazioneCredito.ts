// LA CLASSIFICAZIONE DEL CREDITO DELL'ENTE, PER LA LIQUIDAZIONE GIUDIZIALE.
//
// La certificazione dice quanto deve l'azienda, non che cosa è quel debito. Ma
// la composizione c'è, riga per riga: i contributi, le sanzioni, lo stato. Da
// lì si ricava la collocazione che il credito avrà nello stato passivo, senza
// chiedere nulla all'operatore e senza toccare un importo che arriva dai
// sistemi dell'ente.
//
// Le regole non sono nostre: sono quelle del codice civile.
//   - contributi previdenziali → privilegio generale mobiliare di I grado
//     (art. 2753 c.c., art. 2778 n. 1 c.c.);
//   - sanzioni civili per ritardato o omesso versamento → accessorio del
//     contributo: metà con privilegio di grado VIII, metà chirografaria
//     (art. 2754 c.c., art. 2778 n. 8 c.c.);
//   - sanzioni amministrative in senso stretto → chirografo (nessuna
//     prelazione: i privilegi sono tipici).
//
// Che cosa la certificazione NON dice, e che qui non si inventa:
//   - le cartelle dell'Agente della Riscossione aggregano il residuo, senza
//     separare contributi e sanzioni: la riga resta «da classificare» finché
//     non arriva il dettaglio della cartella;
//   - i verbali di evasione e le note di rettifica non definite portano una
//     cifra unica: la stessa cosa;
//   - le righe che il file dichiara ancora da lavorare (da verificare, non
//     definite, sospese, da contabilizzare) non sono debito certo: si
//     espongono a parte, con il loro importo, senza classificarle.
//
// Logica pura: nessun accesso al database, nessun arrotondamento inventato.

import { calcolaScenari, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';

export type ClasseCredito =
  | 'CONTRIBUTI'
  | 'SANZIONI_CIVILI'
  | 'SANZIONI_AMMINISTRATIVE'
  | 'NON_DETERMINATO'
  | 'CREDITO_A_FAVORE'
  | 'DA_CLASSIFICARE';

export type GradoCredito = 'I' | 'VIII' | 'CHIROGRAFO';

export const ETICHETTA_CLASSE: Record<ClasseCredito, string> = {
  CONTRIBUTI: 'Contributi previdenziali — privilegio generale mobiliare di I grado',
  SANZIONI_CIVILI: 'Sanzioni civili — accessorie dei contributi',
  SANZIONI_AMMINISTRATIVE: 'Sanzioni amministrative — chirografo',
  NON_DETERMINATO: 'Posizioni non ancora determinate — fuori dal debito certo',
  CREDITO_A_FAVORE: 'Crediti a favore dell’azienda — compensazioni dichiarate',
  DA_CLASSIFICARE: 'Da classificare — il documento non separa contributi e sanzioni',
};

export interface RigaDaClassificare {
  voce: string;
  importo: number;
  /** Dicitura della colonna «Stato» del file, come arriva. */
  stato: string;
  contributi: number | null;
  sanzioni: number | null;
  /** Contributi INPS oppure crediti già affidati all'Agente della Riscossione. */
  ambito?: 'INPS' | 'AGENTE_RISCOSSIONE';
}

export interface QuotaCredito {
  classe: ClasseCredito;
  grado: GradoCredito;
  importo: number;
}

export interface ClassificazioneRiga {
  certo: boolean;
  quote: QuotaCredito[];
}

/**
 * Le diciture che dichiarano un lavoro ancora aperto. Sono le stesse che il
 * file usa nella colonna «Stato» e nei nomi delle voci («Note di rettifica non
 * definite», «Da Verificare», cartella «Sospesa»): se ci sono, la cifra esiste
 * ma non è debito certo, e non entra nella classificazione.
 *
 * «Verificata» e «Calcolati» non sono in elenco: sono verifiche concluse, non
 * lavoro da fare.
 */
const LAVORO_APERTO = /da\s*verific|non\s*definit|da\s*contabil|sospes|contestat|in\s+verifica/i;

export function rigaCerta(riga: Pick<RigaDaClassificare, 'voce' | 'stato'>): boolean {
  return !LAVORO_APERTO.test(`${riga.voce} ${riga.stato}`);
}

const centesimi = (n: number) => Math.round(n * 100) / 100;

/** Classificazione di una riga, con le quote già divise per classe e grado. */
export function classificaRiga(riga: RigaDaClassificare): ClassificazioneRiga {
  const importo = Number.isFinite(riga.importo) ? riga.importo : 0;
  if (Math.abs(importo) < 0.005) return { certo: true, quote: [] };

  // Una posta a credito dell'azienda è dichiarata dal file stesso (flussi di
  // regolarizzazione negativi): non è un debito da graduare.
  if (importo < 0) {
    return {
      certo: true,
      quote: [{ classe: 'CREDITO_A_FAVORE', grado: 'CHIROGRAFO', importo: centesimi(-importo) }],
    };
  }

  if (!rigaCerta(riga)) {
    return {
      certo: false,
      quote: [{ classe: 'NON_DETERMINATO', grado: 'CHIROGRAFO', importo: centesimi(importo) }],
    };
  }

  // Le cartelle dell'Agente della Riscossione non espongono il riparto: il
  // residuo è un totale, e da un totale non si ricava la prelazione.
  if (riga.ambito === 'AGENTE_RISCOSSIONE') {
    return {
      certo: true,
      quote: [{ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: centesimi(importo) }],
    };
  }

  const contributi = riga.contributi;
  const sanzioni = riga.sanzioni;
  if (contributi === null && sanzioni === null) {
    // Verbali, note, voci senza colonne di dettaglio: cifra unica.
    return {
      certo: true,
      quote: [{ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: centesimi(importo) }],
    };
  }

  const quote: QuotaCredito[] = [];
  const quotaContributi = Math.max(0, contributi ?? 0);
  if (quotaContributi > 0.005) {
    quote.push({ classe: 'CONTRIBUTI', grado: 'I', importo: centesimi(quotaContributi) });
  }
  const quotaSanzioni = Math.max(0, sanzioni ?? 0);
  if (quotaSanzioni > 0.005) {
    // Metà con privilegio di grado VIII, metà chirografo. Il centesimo di
    // resto va alla metà chirografaria: il privilegio non si arrotonda in su.
    const privilegiata = centesimi((quotaSanzioni * 50) / 100);
    const chirografaria = centesimi(quotaSanzioni - privilegiata);
    if (privilegiata > 0) {
      quote.push({ classe: 'SANZIONI_CIVILI', grado: 'VIII', importo: privilegiata });
    }
    if (chirografaria > 0) {
      quote.push({ classe: 'SANZIONI_CIVILI', grado: 'CHIROGRAFO', importo: chirografaria });
    }
  }
  const sommaQuote = quote.reduce((a, q) => a + q.importo, 0);
  const resto = centesimi(importo - sommaQuote);
  if (resto > 0.005) {
    // La riga porta più del riparto dichiarato: la differenza non si attribuisce
    // d'ufficio a una classe.
    quote.push({ classe: 'DA_CLASSIFICARE', grado: 'CHIROGRAFO', importo: resto });
  }
  return { certo: true, quote };
}

/**
 * IL RANGO DELLO SCENARIO che corrisponde alla classe. Lo scenario conosce
 * quattro ranghi (prededucibile, privilegiato, chirografario, postergato), la
 * classificazione conosce la classe e il grado: il contributo e la metà
 * privilegiata delle sanzioni civili stanno nel privilegio, la metà
 * chirografaria e le sanzioni amministrative nel chirografo. «Da classificare»
 * non ha rango: attribuirgliene uno sarebbe la ripartizione inventata che si
 * vuole evitare.
 */
export function rangoDellaQuota(q: Pick<QuotaCredito, 'classe' | 'grado'>): RangoCredito | null {
  if (q.classe === 'CONTRIBUTI') return 'PRIVILEGIATO';
  if (q.classe === 'SANZIONI_CIVILI') return q.grado === 'VIII' ? 'PRIVILEGIATO' : 'CHIROGRAFARIO';
  if (q.classe === 'SANZIONI_AMMINISTRATIVE') return 'CHIROGRAFARIO';
  return null;
}

/** L'etichetta breve della quota, per la colonna di una tabella. */
export function etichettaQuota(q: Pick<QuotaCredito, 'classe' | 'grado'>): string {
  switch (q.classe) {
    case 'CONTRIBUTI':
      return 'Contributi · grado I';
    case 'SANZIONI_CIVILI':
      return q.grado === 'VIII' ? 'Sanzioni civili · grado VIII' : 'Sanzioni civili · chirografo';
    case 'SANZIONI_AMMINISTRATIVE':
      return 'Sanzioni amministrative · chirografo';
    case 'NON_DETERMINATO':
      return 'Non determinata';
    case 'CREDITO_A_FAVORE':
      return 'A favore dell’azienda';
    case 'DA_CLASSIFICARE':
      return 'Da classificare';
  }
}

export interface RigaClassificata {
  certo: boolean;
  /** La classe di ogni quota, già leggibile in tabella. */
  quote: (QuotaCredito & { etichetta: string; rango: RangoCredito | null })[];
}

/** La classificazione di una riga, pronta da mostrare: una voce per quota. */
export function classificaRigaCompleta(riga: RigaDaClassificare): RigaClassificata {
  const c = classificaRiga(riga);
  return {
    certo: c.certo,
    quote: c.quote.map((q) => ({ ...q, etichetta: etichettaQuota(q), rango: rangoDellaQuota(q) })),
  };
}

export interface QuotaScenari {
  etichetta: string;
  rango: RangoCredito;
  importo: number;
  tassoLiquidazionePct: number | null;
  nettoLiquidazione: number | null;
  cramDownPct: number | null;
  nettoCramDown: number | null;
}

export interface ScenariPerClasse {
  quote: QuotaScenari[];
  /** Realizzo netto sommato su tutte le quote classificabili. */
  liquidazione: number | null;
  cramDown: number | null;
  /** Il credito che il documento non permette di collocare: resta fuori dai conti. */
  escluso: number;
  /** Perché un'ipotesi non è calcolabile: percentuali mancanti, quota esclusa. */
  mancanti: string[];
  calcolabile: boolean;
}

/**
 * LE DUE IPOTESI APPLICATE ALLE CLASSI, NON AL TOTALE.
 *
 * Il cram down moltiplica il debito per una percentuale unica: va bene per
 * l'accordo, non per la graduazione, dove la percentuale è quella del rango e
 * un credito privilegiato non può essere trattato come uno chirografario. Qui
 * ogni quota prende la percentuale del proprio rango e i netti si sommano. Il
 * «da classificare» resta fuori: non ha un rango, e moltiplicarlo per una
 * percentuale scelta a caso sarebbe la ripartizione inventata.
 */
export function scenariPerClasse(
  righe: RigaDaClassificare[],
  parametri: ParametriScenari
): ScenariPerClasse {
  const perRango = new Map(parametri.ranghi.map((r) => [r.rango, r]));
  const quote: QuotaScenari[] = [];
  const mancanti = new Set<string>();
  let escluso = 0;
  let liquidazione = 0;
  let cramDown = 0;
  let qualcheIpotesi = false;

  for (const riga of righe) {
    for (const q of classificaRiga(riga).quote) {
      const rango = rangoDellaQuota(q);
      if (!rango) {
        escluso += q.importo;
        continue;
      }
      const esito = calcolaScenari({ credito: q.importo, rango, parametri });
      const p = perRango.get(rango);
      quote.push({
        etichetta: etichettaQuota(q),
        rango,
        importo: q.importo,
        tassoLiquidazionePct: p?.tassoLiquidazionePct ?? null,
        nettoLiquidazione: esito.liquidazione.netto,
        cramDownPct: p?.cramDownPct ?? null,
        nettoCramDown: esito.cramDown.netto,
      });
      if (esito.liquidazione.netto !== null) {
        liquidazione += esito.liquidazione.netto;
        qualcheIpotesi = true;
      } else {
        mancanti.add(`Realizzo non calcolabile per «${etichettaQuota(q)}».`);
      }
      if (esito.cramDown.netto !== null) {
        cramDown += esito.cramDown.netto;
        qualcheIpotesi = true;
      } else {
        mancanti.add(`Cram down non calcolabile per «${etichettaQuota(q)}».`);
      }
    }
  }

  return {
    quote,
    liquidazione:
      quote.length === 0 || quote.some((q) => q.nettoLiquidazione === null)
        ? null
        : centesimi(liquidazione),
    cramDown:
      quote.length === 0 || quote.some((q) => q.nettoCramDown === null)
        ? null
        : centesimi(cramDown),
    escluso: centesimi(escluso),
    mancanti: Array.from(mancanti),
    calcolabile: qualcheIpotesi,
  };
}

/** Il credito classificabile, già diviso per rango: è quanto serve alle due
 * ipotesi quando il rango del credito non è stato scelto a mano. */
export interface QuotaPerRango {
  rango: RangoCredito;
  importo: number;
}

/**
 * LE QUOTE CLASSIFICATE, RAGGRUPPATE PER RANGO.
 *
 * Quando il triage non ha ancora scelto il rango del credito, la
 * classificazione della certificazione lo dice lo stesso: i contributi sono
 * privilegiati, la metà privilegiata delle sanzioni civili pure, la metà
 * chirografaria e le sanzioni amministrative sono chirografo. Da qui le due
 * procedure si calcolano per davvero, quota per quota, invece di leggersi come
 * un intervallo fra la percentuale più bassa e la più alta.
 *
 * Restano fuori le quote «da classificare»: non hanno rango, e attribuirgliene
 * uno sarebbe la ripartizione inventata che si vuole evitare. Il loro importo
 * si dichiara a parte (`escluso`), così chi legge sa su quale credito il conto
 * è stato fatto.
 */
export function quotePerRango(righe: RigaDaClassificare[]): {
  quote: QuotaPerRango[];
  escluso: number;
} {
  const perRango = new Map<RangoCredito, number>();
  let escluso = 0;
  for (const riga of righe) {
    for (const q of classificaRiga(riga).quote) {
      const rango = rangoDellaQuota(q);
      if (!rango) {
        escluso += q.importo;
        continue;
      }
      perRango.set(rango, (perRango.get(rango) ?? 0) + q.importo);
    }
  }
  return {
    quote: Array.from(perRango, ([rango, importo]) => ({ rango, importo: centesimi(importo) })),
    escluso: centesimi(escluso),
  };
}

/**
 * DA DOVE VIENE IL «DA CLASSIFICARE». La riga del riquadro somma due cose
 * diverse: le cartelle dell'Agente della Riscossione, che portano un residuo
 * senza riparto, e le voci che il file dichiara con una cifra unica (verbali,
 * note non definite). Tenerle distinte serve alla verifica che chiede
 * l'operatore: la prima è credito già a ruolo, la seconda no.
 *
 * `possibiliDoppioni`: righe fuori dall'ambito dell'Agente con lo stesso
 * importo di una cartella. Non è una prova che sia lo stesso debito, ma è
 * l'unico segnale che il file dà — e va mostrato, non nascosto, perché quella
 * cifra entrerebbe nei conti due volte.
 */
export interface DettaglioDaClassificare {
  adr: number;
  senzaRiparto: number;
  totale: number;
  possibiliDoppioni: { voce: string; importo: number }[];
}

export function dettaglioDaClassificare(righe: RigaDaClassificare[]): DettaglioDaClassificare {
  const adr: number[] = [];
  const senzaRiparto: number[] = [];
  for (const riga of righe) {
    for (const q of classificaRiga(riga).quote) {
      if (q.classe !== 'DA_CLASSIFICARE') continue;
      if (riga.ambito === 'AGENTE_RISCOSSIONE') adr.push(q.importo);
      else senzaRiparto.push(q.importo);
    }
  }
  const importiAdr = new Set(adr.map((n) => centesimi(n)));
  const possibiliDoppioni = righe
    .filter((r) => r.ambito !== 'AGENTE_RISCOSSIONE')
    .filter((r) => importiAdr.has(centesimi(Number(r.importo) || 0)))
    .map((r) => ({ voce: r.voce, importo: centesimi(Number(r.importo) || 0) }));
  const somma = (v: number[]) => centesimi(v.reduce((a, n) => a + n, 0));
  return {
    adr: somma(adr),
    senzaRiparto: somma(senzaRiparto),
    totale: centesimi(somma(adr) + somma(senzaRiparto)),
    possibiliDoppioni,
  };
}

export interface TotaliClassificazione {
  /** Debito certo classificato: contributi + sanzioni (privilegiate e no) + da classificare. */
  certo: number;
  contributi: number;
  sanzioniPrivilegiate: number;
  sanzioniChirografo: number;
  daClassificare: number;
  nonDeterminato: number;
  creditoAFavore: number;
}

const VUOTI: TotaliClassificazione = {
  certo: 0,
  contributi: 0,
  sanzioniPrivilegiate: 0,
  sanzioniChirografo: 0,
  daClassificare: 0,
  nonDeterminato: 0,
  creditoAFavore: 0,
};

/** Totali per classe e grado su tutte le righe della certificazione. */
export function totaliClassificazione(righe: RigaDaClassificare[]): TotaliClassificazione {
  const t = { ...VUOTI };
  for (const riga of righe) {
    for (const q of classificaRiga(riga).quote) {
      switch (q.classe) {
        case 'CONTRIBUTI':
          t.contributi += q.importo;
          t.certo += q.importo;
          break;
        case 'SANZIONI_CIVILI':
          if (q.grado === 'VIII') t.sanzioniPrivilegiate += q.importo;
          else t.sanzioniChirografo += q.importo;
          t.certo += q.importo;
          break;
        case 'SANZIONI_AMMINISTRATIVE':
          t.sanzioniChirografo += q.importo;
          t.certo += q.importo;
          break;
        case 'DA_CLASSIFICARE':
          t.daClassificare += q.importo;
          t.certo += q.importo;
          break;
        case 'NON_DETERMINATO':
          t.nonDeterminato += q.importo;
          break;
        case 'CREDITO_A_FAVORE':
          t.creditoAFavore += q.importo;
          break;
      }
    }
  }
  return {
    certo: centesimi(t.certo),
    contributi: centesimi(t.contributi),
    sanzioniPrivilegiate: centesimi(t.sanzioniPrivilegiate),
    sanzioniChirografo: centesimi(t.sanzioniChirografo),
    daClassificare: centesimi(t.daClassificare),
    nonDeterminato: centesimi(t.nonDeterminato),
    creditoAFavore: centesimi(t.creditoAFavore),
  };
}
