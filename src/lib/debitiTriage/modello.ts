// src/lib/debitiTriage/modello.ts
//
// LE POSIZIONI DEBITORIE DEL TRIAGE.
//
// ---------------------------------------------------------------------------
// LA REGOLA, fissata da Ercole
//
// Il bilancio XBRL serve alla fotografia d'insieme, agli indici e alle
// rappresentazioni grafiche. NON serve al test delle soglie.
//
// Le soglie si calcolano SOLO su numeri reali caricati, riferiti a tre anni:
// l'anno di elaborazione del triage, il precedente e quello ancora prima —
// il terzo non per il test, ma per vedere un andamento.
//
// Il motivo per cui il bilancio non basta è strutturale, non di qualità dei
// dati: la voce D.13 dello schema civilistico è «debiti verso istituti di
// previdenza e di sicurezza sociale», e mette INPS e INAIL nella stessa
// riga. Nessuna azienda li separa, perché il bilancio non glielo chiede.
// Un test che riguarda un ente solo non può poggiare su un dato che ne
// contiene due.
//
// ---------------------------------------------------------------------------
// PERCHÉ QUESTA STRUTTURA E NON I TRACCIATI INPS
//
// I tre fogli INPS — denunce UNIEMENS, deleghe F24, lista inadempienze —
// sono artefatti di QUELL'ente. L'Agenzia delle Entrate ha il cassetto
// fiscale e le LIPE, l'INAIL ha i propri estratti, un ente commerciale non ha
// niente di simile. Costruire l'impianto portante su quei tre file avrebbe
// significato una variante per ogni ente nuovo.
//
// Qui la struttura è generica: righe con categoria, importi per anno, e la
// provenienza. I fogli INPS restano una SCORCIATOIA che compila queste
// stesse righe più in fretta — stessa destinazione, percorso più breve.
// Il motore delle soglie non sa da dove arrivano i numeri, ed è questo che
// rende l'aggiunta di un ente una configurazione invece che uno sviluppo.
//
// ---------------------------------------------------------------------------
// LE SOGLIE NON HANNO TUTTE LA STESSA FORMA
//
// Ogni ente confronta il debito con un termine di paragone diverso:
//
//   INPS con lavoratori   30% dei CONTRIBUTI DOVUTI dell'anno precedente,
//                         congiunto a 15.000 €
//   INPS senza lavoratori 5.000 € secchi
//   INAIL                 5.000 € secchi
//   Agenzia Entrate       5.000 €, il 10% del VOLUME D'AFFARI, e 20.000 €
//   Agente Riscossione    100k / 200k / 500k secondo la FORMA GIURIDICA
//
// Perciò la riga non può avere gli stessi campi per tutti: accanto al debito
// serve, per le sole categorie che lo richiedono, la grandezza con cui va
// confrontato. Chiedere il volume d'affari su una riga previdenziale, o i
// contributi dovuti su una riga commerciale, sarebbe chiedere un dato che
// non serve a nulla.

/**
 * Le categorie. Le prime tre sono creditori pubblici qualificati e
 * concorrono al test dell'art. 25-novies; le altre due no — servono al
 * totale, agli indici e ai rapporti che si calcolano quando arriva una
 * proposta (l'adesione dei creditori privati rispetto al debito complessivo,
 * artt. 63 e 88). Sommarle al test gonfierebbe un numero di legge con debiti
 * che la legge non considera.
 */
export type CategoriaDebito =
  'PREVIDENZIALE' | 'ASSICURATIVO' | 'FISCALE' | 'COMMERCIALE' | 'ALTRO';

export const CATEGORIE: {
  codice: CategoriaDebito;
  etichetta: string;
  ente: string | null;
  /** Concorre al test dell'art. 25-novies? */
  qualificato: boolean;
  /** Grandezza aggiuntiva richiesta dalla soglia di questo ente. */
  riferimento: 'CONTRIBUTI_DOVUTI' | 'VOLUME_AFFARI' | null;
  aiuto: string;
}[] = [
  {
    codice: 'PREVIDENZIALE',
    etichetta: 'Previdenziale',
    ente: 'INPS',
    qualificato: true,
    riferimento: 'CONTRIBUTI_DOVUTI',
    aiuto:
      'La soglia con lavoratori è il 30% dei contributi dovuti nell’anno precedente, congiunto a 15.000 €. Senza il dovuto resta calcolabile solo la soglia assoluta.',
  },
  {
    codice: 'ASSICURATIVO',
    etichetta: 'Assicurativo',
    ente: 'INAIL',
    qualificato: true,
    riferimento: null,
    aiuto:
      'Soglia assoluta sui premi non versati. Va tenuto distinto dal previdenziale: il bilancio li accorpa, la soglia no.',
  },
  {
    codice: 'FISCALE',
    etichetta: 'Fiscale',
    ente: 'Agenzia delle Entrate',
    qualificato: true,
    riferimento: 'VOLUME_AFFARI',
    aiuto: 'La soglia IVA si misura anche in percentuale sul volume d’affari.',
  },
  {
    codice: 'COMMERCIALE',
    etichetta: 'Commerciale',
    ente: null,
    qualificato: false,
    riferimento: null,
    aiuto:
      'Non concorre al test dell’art. 25-novies. Serve al totale, agli indici e al rapporto fra creditori privati e debito complessivo quando arriva una proposta.',
  },
  {
    codice: 'ALTRO',
    etichetta: 'Altri debiti',
    ente: null,
    qualificato: false,
    riferimento: null,
    aiuto: 'Come sopra: entra nel quadro d’insieme, mai nella soglia.',
  },
];

/** Una riga di posizione debitoria, su tre anni. */
export interface RigaDebitoTriage {
  id?: number;
  descrizione: string;
  categoria: CategoriaDebito;
  /** Debito nell'anno di elaborazione del triage. */
  importoAnnoCorrente: number | null;
  importoAnnoPrecedente: number | null;
  importoAnnoMeno2: number | null;
  /**
   * Il termine di paragone richiesto dalla soglia di questa categoria,
   * riferito all'ANNO PRECEDENTE — che è l'anno su cui la norma misura.
   * null dove la categoria non ne ha bisogno.
   */
  riferimentoAnnoPrecedente: number | null;
  /** Prospetto da cui la riga proviene; null se inserita a mano. */
  prospettoId: number | null;
}

/** I tre anni, ricavati dalla data di verifica: nulla da chiedere. */
export function anniDelTriage(dataVerifica: Date): {
  corrente: number;
  precedente: number;
  meno2: number;
} {
  const a = dataVerifica.getUTCFullYear();
  return { corrente: a, precedente: a - 1, meno2: a - 2 };
}

/** Totale per categoria su un dato anno. */
export function totalePerCategoria(
  righe: RigaDebitoTriage[],
  anno: 'corrente' | 'precedente' | 'meno2'
): Record<CategoriaDebito, number> {
  const campo =
    anno === 'corrente'
      ? 'importoAnnoCorrente'
      : anno === 'precedente'
        ? 'importoAnnoPrecedente'
        : 'importoAnnoMeno2';
  const out = {
    PREVIDENZIALE: 0,
    ASSICURATIVO: 0,
    FISCALE: 0,
    COMMERCIALE: 0,
    ALTRO: 0,
  } as Record<CategoriaDebito, number>;
  for (const r of righe) out[r.categoria] += r[campo] ?? 0;
  return out;
}

/**
 * Esposizione che concorre al test dell'art. 25-novies, per categoria.
 *
 * Esclude commerciali e altri: non sono creditori pubblici qualificati, e
 * includerli significherebbe misurare una soglia di legge su debiti che la
 * legge non considera.
 */
export function esposizioneQualificata(
  righe: RigaDebitoTriage[],
  anno: 'corrente' | 'precedente' | 'meno2' = 'corrente'
): Record<CategoriaDebito, number> {
  const tutte = totalePerCategoria(righe, anno);
  const out = { ...tutte };
  for (const c of CATEGORIE) if (!c.qualificato) out[c.codice] = 0;
  return out;
}

/**
 * Il termine di paragone dichiarato per una categoria.
 *
 * Si SOMMA sulle righe che lo portano: un'azienda può avere più posizioni
 * previdenziali (gestioni diverse) e il dovuto complessivo è la somma. Se
 * nessuna riga lo porta, torna null — e il test che ne dipende si dichiara
 * non calcolabile invece di usare zero, che darebbe una soglia del 30% pari
 * a zero e renderebbe "oltre soglia" qualunque importo.
 */
export function riferimentoDi(
  righe: RigaDebitoTriage[],
  categoria: CategoriaDebito
): number | null {
  const valori = righe
    .filter((r) => r.categoria === categoria && r.riferimentoAnnoPrecedente !== null)
    .map((r) => r.riferimentoAnnoPrecedente as number);
  return valori.length === 0 ? null : valori.reduce((s, v) => s + v, 0);
}

/** Andamento fra i tre anni, per il quadro d'insieme. */
export function andamento(righe: RigaDebitoTriage[]): {
  corrente: number;
  precedente: number;
  meno2: number;
  variazionePercentuale: number | null;
} {
  const somma = (a: 'corrente' | 'precedente' | 'meno2') =>
    Object.values(totalePerCategoria(righe, a)).reduce((s, v) => s + v, 0);
  const c = somma('corrente');
  const p = somma('precedente');
  return {
    corrente: c,
    precedente: p,
    meno2: somma('meno2'),
    // Senza un anno precedente non c'è variazione: zero direbbe "stabile",
    // che è un'affermazione, mentre qui non si sa.
    variazionePercentuale: p === 0 ? null : Math.round(((c - p) / p) * 1000) / 10,
  };
}
