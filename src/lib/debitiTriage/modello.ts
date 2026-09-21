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
  /**
   * Nome del file da cui la riga è stata estratta, durante il triage. Serve a
   * togliere tutte le righe di un file quando si risolve una sovrapposizione.
   * Non si salva: dopo la conferma la provenienza è `prospettoId`.
   */
  origine?: string;
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

/**
 * Dalle posizioni della tabella ai valori che il test delle soglie legge.
 *
 * È il collegamento che mancava: la tabella è stata costruita per raccogliere
 * i numeri reali su cui si calcolano le soglie, ma fino alla 0.109.73
 * l'indicatore non la leggeva affatto — continuava a basarsi solo sul
 * V.E.R.A. e sui campi dell'anagrafica. Chi inseriva le posizioni a mano non
 * vedeva cambiare nulla.
 *
 * Per ogni categoria: il debito è quello dell'anno del triage, il termine di
 * paragone è la colonna di riferimento dell'anno precedente. Una categoria
 * senza righe torna null, non zero — altrimenti un'assenza diventerebbe un
 * "debito zero" e la soglia risulterebbe non superata per mancanza di dati.
 */
export function valoriSoglieDaPosizioni(righe: RigaDebitoTriage[]): {
  contributiScaduti: number | null;
  contributiDovutiAnnoPrecedente: number | null;
  premiInail: number | null;
  ivaScaduta: number | null;
  volumeAffari: number | null;
} {
  const somma = (c: CategoriaDebito): number | null => {
    const r = righe.filter((x) => x.categoria === c && x.importoAnnoCorrente !== null);
    return r.length === 0 ? null : r.reduce((s, x) => s + (x.importoAnnoCorrente ?? 0), 0);
  };
  return {
    contributiScaduti: somma('PREVIDENZIALE'),
    contributiDovutiAnnoPrecedente: riferimentoDi(righe, 'PREVIDENZIALE'),
    premiInail: somma('ASSICURATIVO'),
    ivaScaduta: somma('FISCALE'),
    volumeAffari: riferimentoDi(righe, 'FISCALE'),
  };
}

// ---------------------------------------------------------------------------
// SOVRAPPOSIZIONI
//
// Il rischio segnalato da Ercole: caricare due documenti che descrivono lo
// stesso debito e sommarli. Dove esiste una regola che li concilia — le
// inadempienze già iscritte a ruolo si escludono se ci sono i ruoli — la si
// applica. Dove non esiste, si FERMA la conferma e si chiede di scegliere:
// nessun default silenzioso.

export interface Sovrapposizione {
  chiave: string;
  titolo: string;
  spiegazione: string;
  scelte: { valore: string; etichetta: string }[];
}

export interface FileMappato {
  nome: string;
  ente: string;
  forma: string;
}

export function trovaSovrapposizioni(
  righe: RigaDebitoTriage[],
  mappati: FileMappato[],
  tipiRiconosciuti: string[]
): Sovrapposizione[] {
  const out: Sovrapposizione[] = [];

  // 1. Due saldi dello stesso ente: descrivono entrambi il debito aperto oggi.
  const perEnte = new Map<string, FileMappato[]>();
  for (const f of mappati.filter((x) => x.forma === 'SALDO')) {
    perEnte.set(f.ente, [...(perEnte.get(f.ente) ?? []), f]);
  }
  for (const [ente, files] of perEnte) {
    if (files.length < 2) continue;
    out.push({
      chiave: `saldo:${ente}`,
      titolo: `Due saldi dello stesso ente (${ente})`,
      spiegazione: `«${files[0].nome}» e «${files[1].nome}» descrivono entrambi il debito aperto oggi verso lo stesso ente. Se uno contiene l’altro, sommarli raddoppia il debito.`,
      scelte: [
        { valore: 'PRIMO', etichetta: `Tieni solo «${files[0].nome}»` },
        { valore: 'SECONDO', etichetta: `Tieni solo «${files[1].nome}»` },
        { valore: 'ENTRAMBI', etichetta: 'Tienili entrambi: non si sovrappongono' },
      ],
    });
  }

  // 2. Posizioni previdenziali in tabella E fogli dell'istituto sullo stesso
  //    debito. La tabella avrebbe la precedenza in silenzio, e i fogli
  //    verrebbero ignorati senza che nessuno lo sappia.
  const prevInTabella = righe.some(
    (r) => r.categoria === 'PREVIDENZIALE' && r.importoAnnoCorrente !== null
  );
  // 3. V.E.R.A. insieme a Lista Inadempienze o Ruoli Esattoriali.
  //    Il V.E.R.A. è la fotografia completa della posizione e li comprende
  //    entrambi, senza una chiave che permetta di togliere la parte comune.
  //    Fino alla 0.109.76 questo caso NON era segnalato: gli elenchi
  //    finivano nel non versato, che l'indicatore legge prima del V.E.R.A.,
  //    e il V.E.R.A. veniva ignorato senza che nessuno lo sapesse — il
  //    default silenzioso che la regola di Ercole vieta.
  const haVera = tipiRiconosciuti.includes('VERA');
  const haElenchi = tipiRiconosciuti.includes('INADEMPIENZE') || tipiRiconosciuti.includes('RUOLI');
  if (haVera && haElenchi) {
    out.push({
      chiave: 'vera:elenchi',
      titolo: 'Il V.E.R.A. comprende già inadempienze e ruoli',
      spiegazione:
        'Il V.E.R.A. è la fotografia completa della posizione: contiene le partite della Lista Inadempienze e quelle iscritte a ruolo. Sommati, lo stesso importo verrebbe contato più volte. Scegli quale fonte rappresenta il debito.',
      scelte: [
        {
          valore: 'VERA',
          etichetta:
            'Usa il V.E.R.A. — l’esposizione complessiva; inadempienze e ruoli non si sommano',
        },
        {
          valore: 'ELENCHI',
          etichetta:
            'Usa inadempienze e ruoli — il dettaglio per partita, già riconciliato fra loro; il V.E.R.A. non si somma',
        },
      ],
    });
  }

  const fogli = tipiRiconosciuti.filter((t) => ['INADEMPIENZE', 'RUOLI', 'VERA'].includes(t));
  if (prevInTabella && fogli.length > 0) {
    out.push({
      chiave: 'prev:fogli',
      titolo: 'Debito previdenziale da due fonti',
      spiegazione:
        'In tabella ci sono posizioni previdenziali, e hai caricato anche i fogli dell’istituto che descrivono lo stesso debito. Non si possono sommare: bisogna scegliere quale usare.',
      scelte: [
        {
          valore: 'TABELLA',
          etichetta: 'Usa la tabella — i fogli non contano per il previdenziale',
        },
        { valore: 'FOGLI', etichetta: 'Usa i fogli dell’istituto — togli le righe previdenziali' },
      ],
    });
  }
  return out;
}
