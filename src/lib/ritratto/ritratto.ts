// src/lib/ritratto/ritratto.ts
//
// IL RITRATTO DELL'AZIENDA — quattro riquadri che fotografano quello che il
// sistema ha già sviluppato su una posizione, senza un numero nuovo.
//
// ---------------------------------------------------------------------------
// COSA COMPONE
//
//   1. TESTATA      — chi è l'impresa e che cosa l'ente ne sa già (anagrafica,
//                     identificativi, debito memorizzato, data della verifica);
//   2. DIRETTRICI   — le tre verifiche, con il loro stadio e che cosa manca a
//                     ciascuna per essere fatta;
//   3. GIUDIZIO     — l'esito unico della verifica, con la sua copertura e le
//                     due liste: ciò che è accertato e ciò che resta da
//                     accertare;
//   4. DIMENSIONI   — le cinque dimensioni A-E che spiegano il giudizio, con i
//                     loro determinanti e le loro lacune.
//
// ---------------------------------------------------------------------------
// NON RICALCOLA NULLA
//
// Il giudizio arriva da `componiEsitoVerifica` (che riceve il semaforo già
// formato da `calcolaAttenzione`) e lo stadio delle tre verifiche da
// `statoDirettrici`. Questo modulo non decide verdi, non rifà soglie e non
// tocca i bilanci: sceglie che cosa mostrare, in che ordine, e — soprattutto —
// che cosa DICHIARARE mancante. Un ritratto che tace una lacuna non è
// sintetico: è falso.
//
// NON C'È UN TOTALE. Le cinque dimensioni non si sommano, non hanno pesi e non
// producono un voto: la barra dice quanto pesa ciascuna, il giudizio resta
// quello del semaforo. Reintrodurre qui un punteggio composito per via grafica
// sarebbe rifare, un gradino più in basso, l'errore che l'indice 0-100 ha
// chiuso: due giudizi sulla stessa posizione e nessuno che dica quale credere.
//
// Funzione pura, con i suoi test.

import type { EsitoAttenzione } from '@/lib/screening/indicatore';
import { NOME_DIMENSIONE, type Componente, type Dimensione } from '@/lib/iai/dimensioni';
import type { Determinante, EsitoVerifica } from '@/lib/verifica/esito';
import type { Stadio, StatoDirettrici } from '@/lib/verificaAzienda/direttrici';

// ---- Le fonti ------------------------------------------------------------

export interface FonteAnagraficaRitratto {
  ragioneSociale: string;
  formaGiuridica: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  /** «Milano (MI)», quando la sede è dichiarata. */
  sede: string | null;
  attiva: boolean;
  identificativi: { etichetta: string; valore: string }[];
}

export interface FonteContabileRitratto {
  anniXbrl: number;
  visuraIl: string | null;
  parametriPresenti: boolean;
  completa: boolean;
}

export interface FonteAmministrativaRitratto {
  verificataIl: string | null;
  debitoMemorizzato: number | null;
  debitoMemorizzatoIl: string | null;
}

export interface FontiRitratto {
  anagrafica: FonteAnagraficaRitratto;
  /** Già decise da `statoDirettrici`: qui si leggono, non si rifanno. */
  direttrici: StatoDirettrici;
  amministrativa: FonteAmministrativaRitratto | null;
  contabile: FonteContabileRitratto | null;
  /** Già composto da `componiEsitoVerifica`: il giudizio non si tocca. */
  esito: EsitoVerifica | null;
}

// ---- I quattro riquadri --------------------------------------------------

export interface RiquadroTestata {
  nome: string;
  /** «S.r.l. · Milano (MI)» */
  sottotitolo: string | null;
  identificativi: { etichetta: string; valore: string }[];
  attiva: boolean;
  debito: { importo: number; testo: string; il: string | null } | null;
  verificataIl: string | null;
}

export interface VoceDirettrice {
  id: 'amministrativa' | 'contabile' | 'aziendale';
  nome: string;
  cosa: string;
  stato: Stadio;
  /** In una parola, per il pallino: «Fatto», «Cominciata»… */
  etichettaStato: string;
  /** Che cosa manca per farla, quando manca qualcosa. */
  richiede: string | null;
}

export interface RiquadroDirettrici {
  voci: VoceDirettrice[];
  /** Quante sono verdi, su tre: si dice, non si interpreta. */
  fatte: number;
  nota: string;
}

export interface RiquadroGiudizio {
  presente: boolean;
  esito: EsitoAttenzione | null;
  etichetta: string | null;
  /** «attenzione alta», «attenzione», «attenzione contenuta». */
  parola: string | null;
  fattoreDeterminante: string | null;
  copertura: { determinate: number; totali: number; testo: string; limitata: boolean } | null;
  accertato: string[];
  daAccertare: string[];
  determinanti: Determinante[];
  sintesi: string;
  nota: string;
}

export type StatoLettura = 'LETTA' | 'PARZIALE' | 'NON_LETTA';

export interface VoceDimensione {
  lettera: Dimensione;
  nome: string;
  /** Intensità dei determinanti: serve alla barra, non è un voto. */
  punteggio: number;
  stato: StatoLettura;
  motivi: string[];
  lacune: string[];
}

export interface RiquadroDimensioni {
  presente: boolean;
  voci: VoceDimensione[];
  lette: number;
  nota: string;
}

export interface Ritratto {
  testata: RiquadroTestata;
  direttrici: RiquadroDirettrici;
  giudizio: RiquadroGiudizio;
  dimensioni: RiquadroDimensioni;
  /** Che cosa il ritratto non può dire, e perché: in chiaro, sotto i riquadri. */
  mancanze: string[];
}

// ---- Formattazione -------------------------------------------------------

/** La data come la legge un ufficio: `gg/mm/aaaa`, senza fusi orari di mezzo. */
function data(iso: string | null): string | null {
  if (!iso) return null;
  const soloData = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (soloData) return `${soloData[3]}/${soloData[2]}/${soloData[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('it-IT');
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

const ETICHETTA_STADIO: Record<Stadio, string> = {
  COMPLETO: 'Fatta',
  PARZIALE: 'Cominciata',
  MANCANTE: 'Da fare',
  NON_DISPONIBILE: 'Non disponibile',
};

const PAROLA_ESITO: Record<EsitoAttenzione, string> = {
  ROSSO: 'attenzione alta',
  GIALLO: 'attenzione',
  ATTENZIONE_MINIMA: 'attenzione contenuta',
};

/** Elenco in italiano: «visura, parametri e un bilancio». */
function elenco(voci: string[]): string {
  if (voci.length <= 1) return voci[0] ?? '';
  return `${voci.slice(0, -1).join(', ')} e ${voci[voci.length - 1]}`;
}

/** «manca» / «mancano», per non scrivere «manca la visura e i parametri». */
function verboMancanze(voci: string[]): string {
  return voci.length === 1 ? 'manca' : 'mancano';
}

/**
 * Che cosa manca alla contabile per essere completa. Si legge dai segnali che
 * la contabile espone già: qui non si interroga nessuna tabella.
 */
function mancanzeContabili(contabile: FonteContabileRitratto | null): string[] {
  if (!contabile) return ['la verifica contabile non è ancora stata aperta'];
  const voci: string[] = [];
  if (!contabile.visuraIl) voci.push('la visura storica');
  if (!contabile.parametriPresenti) voci.push('i parametri dell’ente');
  if (contabile.anniXbrl === 0) voci.push('un bilancio XBRL');
  return voci;
}

/**
 * Lo stato di lettura di una dimensione, dai suoi stessi esiti: se ha lacune
 * non è letta per intero, e senza determinanti né intensità non è letta
 * affatto. Non è un ricalcolo: è la classificazione di ciò che il motore ha
 * già prodotto.
 */
function statoLettura(c: Componente): StatoLettura {
  if (c.lacune.length === 0) return 'LETTA';
  return c.motivi.length > 0 || c.punteggio > 0 ? 'PARZIALE' : 'NON_LETTA';
}

// ---- Composizione --------------------------------------------------------

export function componiRitratto(fonti: FontiRitratto): Ritratto {
  const a = fonti.anagrafica;

  // 1. Testata -------------------------------------------------------------
  const sottotitolo = [a.formaGiuridica, a.sede].filter(Boolean).join(' · ') || null;
  const debito =
    fonti.amministrativa?.debitoMemorizzato !== null &&
    fonti.amministrativa?.debitoMemorizzato !== undefined
      ? {
          importo: fonti.amministrativa.debitoMemorizzato,
          testo: euro(fonti.amministrativa.debitoMemorizzato),
          il: data(fonti.amministrativa.debitoMemorizzatoIl ?? null),
        }
      : null;
  const testata: RiquadroTestata = {
    nome: a.ragioneSociale,
    sottotitolo,
    identificativi: a.identificativi,
    attiva: a.attiva,
    debito,
    verificataIl: data(fonti.amministrativa?.verificataIl ?? null),
  };

  // 2. Direttrici ----------------------------------------------------------
  const contabileMancanze = mancanzeContabili(fonti.contabile);
  const voci: VoceDirettrice[] = [
    {
      id: 'amministrativa',
      nome: 'Verifica amministrativa',
      cosa: 'Il triage: esito, esposizione verso l’ente, copertura informativa.',
      stato: fonti.direttrici.amministrativa,
      etichettaStato: ETICHETTA_STADIO[fonti.direttrici.amministrativa],
      richiede:
        fonti.direttrici.amministrativa === 'COMPLETO'
          ? null
          : 'La verifica amministrativa non è ancora stata eseguita per questa posizione.',
    },
    {
      id: 'contabile',
      nome: 'Verifica contabile',
      cosa: 'Il dato depositato: visura storica, parametri dell’ente, bilanci XBRL.',
      stato: fonti.direttrici.contabile,
      etichettaStato: ETICHETTA_STADIO[fonti.direttrici.contabile],
      richiede:
        fonti.direttrici.contabile === 'COMPLETO'
          ? null
          : fonti.direttrici.contabile === 'NON_DISPONIBILE'
            ? 'L’accesso non legge la verifica contabile di questa azienda (posizione disabilitata o non disponibile).'
            : `${verboMancanze(contabileMancanze) === 'manca' ? 'Manca' : 'Mancano'} ${elenco(
                contabileMancanze
              )}.`,
    },
    {
      id: 'aziendale',
      nome: 'Verifica aziendale',
      cosa: 'Le due verifiche lette insieme, con la fotografia salvata come base.',
      stato: fonti.direttrici.aziendale,
      etichettaStato: ETICHETTA_STADIO[fonti.direttrici.aziendale],
      richiede:
        fonti.direttrici.aziendale === 'COMPLETO'
          ? null
          : fonti.direttrici.aziendale === 'PARZIALE'
            ? 'Le due verifiche sono pronte: manca la fotografia salvata come base della proposta.'
            : fonti.direttrici.aziendale === 'NON_DISPONIBILE'
              ? 'L’accesso non legge la verifica aziendale di questa posizione.'
              : 'Si compone quando amministrativa e contabile hanno entrambe qualcosa da dire.',
    },
  ];
  const fatte = voci.filter((v) => v.stato === 'COMPLETO').length;
  const direttrici: RiquadroDirettrici = {
    voci,
    fatte,
    nota: `${fatte} ${fatte === 1 ? 'verifica fatta' : 'verifiche fatte'} su 3. La verifica aziendale si accende sulla fotografia salvata, non sul debito memorizzato.`,
  };

  // 3. Giudizio ------------------------------------------------------------
  const e = fonti.esito;
  const giudizio: RiquadroGiudizio = e
    ? {
        presente: true,
        esito: e.giudizio.esito,
        etichetta: e.giudizio.etichetta,
        parola: PAROLA_ESITO[e.giudizio.esito],
        fattoreDeterminante: e.giudizio.fattoreDeterminante,
        copertura: {
          determinate: e.giudizio.copertura.determinate,
          totali: e.giudizio.copertura.totali,
          testo: `${e.giudizio.copertura.determinate} dimensioni su ${e.giudizio.copertura.totali}`,
          limitata: e.giudizio.copertura.determinate < e.giudizio.copertura.totali,
        },
        accertato: e.giudizio.accertato,
        daAccertare: e.giudizio.daAccertare,
        determinanti: e.determinanti,
        sintesi: [
          e.giudizio.etichetta,
          PAROLA_ESITO[e.giudizio.esito],
          `copertura ${e.giudizio.copertura.determinate}/${e.giudizio.copertura.totali}`,
          fonti.amministrativa?.verificataIl
            ? `verificata il ${data(fonti.amministrativa.verificataIl)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        nota: 'Un solo giudizio: i presupposti di legge e il patrimonio netto negativo sono fatti e non si compensano con una dimensione favorevole.',
      }
    : {
        presente: false,
        esito: null,
        etichetta: null,
        parola: null,
        fattoreDeterminante: null,
        copertura: null,
        accertato: [],
        daAccertare: [],
        determinanti: [],
        sintesi: 'Nessuna verifica registrata: il ritratto mostra solo anagrafica e direttrici.',
        nota: 'Il giudizio è quello del semaforo della verifica: senza verifica non c’è nulla da mostrare, e non si inventa un verde.',
      };

  // 4. Dimensioni ----------------------------------------------------------
  const componenti: Componente[] = e ? e.dimensioni : [];
  const vociDimensioni: VoceDimensione[] = componenti.map((c) => ({
    lettera: c.dimensione,
    nome: NOME_DIMENSIONE[c.dimensione],
    punteggio: c.punteggio,
    stato: statoLettura(c),
    motivi: c.motivi,
    lacune: c.lacune,
  }));
  const dimensioni: RiquadroDimensioni = {
    presente: vociDimensioni.length > 0,
    voci: vociDimensioni,
    lette: vociDimensioni.filter((v) => v.stato === 'LETTA').length,
    nota: 'Le cinque dimensioni spiegano da dove viene l’attenzione: la barra dice quanto pesa ciascuna, non è un voto e non si somma alle altre. Il giudizio resta quello del semaforo.',
  };

  // 5. Che cosa il ritratto non dice ---------------------------------------
  const mancanze: string[] = [];
  if (!e) {
    mancanze.push(
      'Nessuna verifica della posizione: mancano il giudizio, la copertura e le cinque dimensioni.'
    );
  }
  if (fonti.direttrici.amministrativa !== 'COMPLETO') {
    mancanze.push(
      'Verifica amministrativa non eseguita: il debito e l’esito dell’ente non sono nel ritratto.'
    );
  }
  if (fonti.direttrici.contabile === 'NON_DISPONIBILE') {
    mancanze.push(
      'Verifica contabile non leggibile da questo accesso: il ritratto non ne cita i dati.'
    );
  } else if (fonti.direttrici.contabile !== 'COMPLETO') {
    mancanze.push(
      `Verifica contabile incompleta: ${verboMancanze(contabileMancanze)} ${elenco(
        contabileMancanze
      )}.`
    );
  }
  if (fonti.direttrici.aziendale === 'NON_DISPONIBILE') {
    mancanze.push(
      'Verifica aziendale non leggibile da questo accesso: il ritratto non cita una proiezione.'
    );
  } else if (fonti.direttrici.aziendale !== 'COMPLETO') {
    mancanze.push(
      'Verifica aziendale non chiusa: la fotografia non è ancora salvata come base, quindi il ritratto non cita una proiezione.'
    );
  }
  const nonLette = vociDimensioni.filter((v) => v.stato === 'NON_LETTA').map((v) => v.lettera);
  if (nonLette.length > 0) {
    mancanze.push(
      `Dimensioni non misurate: ${nonLette.join(', ')}. Il giudizio vale entro i dati disponibili e la copertura lo dichiara.`
    );
  }

  return { testata, direttrici, giudizio, dimensioni, mancanze };
}
