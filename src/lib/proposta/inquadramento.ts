// src/lib/proposta/inquadramento.ts
//
// INQUADRAMENTO DELLA PROPOSTA — collega la scheda Proposta alle regole del
// registro delle fonti (src/lib/registroFonti/regole.ts).
//
// Tre dati che lo scenario prima non aveva: strumento scelto, data di
// deposito, quota degli altri creditori aderenti. Da questi dipende QUALE
// regola si applica; la regola poi restituisce due formule (Ricevente e
// Redigente) e questo modulo sceglie quella del percorso in corso.
//
// Logica pura, senza database ne' React: e' cio' che i test collaudano.
//
// Principi rispettati:
//   - mai un default silenzioso: se un dato manca la regola si blocca e dice
//     quale dato manca;
//   - la quota degli aderenti e' CALCOLATA dalle righe ma CORREGGIBILE: quando
//     il valore a mano diverge dal calcolo, lo scostamento resta visibile;
//   - uno strumento senza regola collaudata non produce parametri: produce
//     l'avviso "regola non ancora nel registro delle fonti";
//   - una fonte non ancora riscontrata viene dichiarata tale accanto al
//     parametro che sostiene.

import { fonte, puoSostenereEsito } from '@/lib/registroFonti/fonti';
import {
  parametriCramDown63,
  perimetroTransazioneCN,
  type EnteCreditore,
  type ParametriCramDown,
  type PerimetroCN,
} from '@/lib/registroFonti/regole';

// ---------------------------------------------------------------------------
// Strumenti
// ---------------------------------------------------------------------------

export type StrumentoProposta =
  'ADR_57' | 'ADR_60' | 'ADR_61' | 'CN_23_2BIS' | 'CONCORDATO_PREVENTIVO' | 'PRO_64BIS' | 'ALTRO';

/** Quale regola collaudata del registro governa lo strumento. null = nessuna, per ora. */
export type RegolaStrumento = 'CRAMDOWN_63' | 'PERIMETRO_CN' | null;

export interface VoceStrumento {
  valore: StrumentoProposta;
  etichetta: string;
  riferimento: string;
  regola: RegolaStrumento;
}

export const STRUMENTI_PROPOSTA: VoceStrumento[] = [
  {
    valore: 'ADR_57',
    etichetta: 'Accordo di ristrutturazione dei debiti',
    riferimento: 'art. 57, con transazione ex art. 63',
    regola: 'CRAMDOWN_63',
  },
  {
    valore: 'ADR_60',
    etichetta: 'Accordo di ristrutturazione agevolato',
    riferimento: 'art. 60, con transazione ex art. 63',
    regola: 'CRAMDOWN_63',
  },
  {
    valore: 'ADR_61',
    etichetta: 'Accordo di ristrutturazione ad efficacia estesa',
    riferimento: 'art. 61, con transazione ex art. 63',
    regola: 'CRAMDOWN_63',
  },
  {
    valore: 'CN_23_2BIS',
    etichetta: 'Composizione negoziata — accordo transattivo',
    riferimento: 'art. 23, comma 2-bis',
    regola: 'PERIMETRO_CN',
  },
  {
    valore: 'CONCORDATO_PREVENTIVO',
    etichetta: 'Concordato preventivo',
    riferimento: 'trattamento dei crediti tributari e contributivi, art. 88',
    regola: null,
  },
  {
    valore: 'PRO_64BIS',
    etichetta: 'Piano di ristrutturazione soggetto a omologazione',
    riferimento: 'art. 64-bis',
    regola: null,
  },
  { valore: 'ALTRO', etichetta: 'Altro strumento', riferimento: 'da precisare', regola: null },
];

export function voceStrumento(valore: string | null | undefined): VoceStrumento | undefined {
  return STRUMENTI_PROPOSTA.find((s) => s.valore === valore);
}

export function strumentoValido(valore: unknown): valore is StrumentoProposta {
  return typeof valore === 'string' && STRUMENTI_PROPOSTA.some((s) => s.valore === valore);
}

// ---------------------------------------------------------------------------
// Adesione dei creditori e quota degli altri aderenti
// ---------------------------------------------------------------------------

/**
 * Posizione di una riga rispetto all'accordo.
 *  - PUBBLICO: fisco o previdenza/assistenza obbligatoria. Conta
 *    nell'indebitamento complessivo, MAI fra gli "altri" aderenti.
 *  - ADERENTE: altro creditore che aderisce, per l'importo indicato (una riga
 *    e' una CATEGORIA: puo' aderire solo in parte, es. alcuni fornitori).
 *  - NON_ADERENTE: altro creditore che non aderisce.
 *  - null: non indicata. Basta una riga non indicata e la quota non si calcola.
 */
export type AdesioneRiga = 'PUBBLICO' | 'ADERENTE' | 'NON_ADERENTE';

export const ADESIONI_RIGA: { valore: AdesioneRiga; etichetta: string }[] = [
  { valore: 'PUBBLICO', etichetta: 'Creditore pubblico (fisco, previdenza, assicurazione)' },
  { valore: 'ADERENTE', etichetta: 'Altro creditore — voto favorevole' },
  { valore: 'NON_ADERENTE', etichetta: 'Altro creditore — voto contrario' },
];

export function adesioneValida(valore: unknown): valore is AdesioneRiga {
  return valore === 'PUBBLICO' || valore === 'ADERENTE' || valore === 'NON_ADERENTE';
}

/**
 * Il nome della categoria fa pensare a un creditore pubblico? Serve SOLO a
 * proporre la classificazione: la proposta compare evidenziata e vale
 * soltanto se l'operatore la conferma salvando. Volutamente stretta: meglio
 * non proporre nulla che proporre "pubblico" per una compagnia di
 * assicurazione privata.
 */
export function nomeIndicaCreditorePubblico(nome: string): boolean {
  const n = nome.toLowerCase();
  return /\b(inps|inail|ader|erario)\b|agenzia\s+(delle\s+)?entrate|riscossione|tribut|fiscal|previdenzial|contributiv/.test(
    n
  );
}

export interface RigaPerQuota {
  categoriaCreditore: string;
  importoDovuto: number;
  adesione: AdesioneRiga | null;
  /** Solo per ADERENTE: null = aderisce per l'intero importo della riga. */
  importoAderente: number | null;
}

export interface QuotaCalcolata {
  calcolabile: boolean;
  /** 0..1, solo se calcolabile. */
  quota: number | null;
  numeratore: number;
  denominatore: number;
  numeroRighe: number;
  righeSenzaAdesione: string[];
  /** Solo i voti favorevoli gia' espressi, sul totale. null se non c'e' un totale. */
  quotaCerta: number | null;
  /** Favorevoli piu' non espressi: il massimo raggiungibile. */
  quotaPotenziale: number | null;
  /** Perche' non e' calcolabile, in chiaro. */
  motivo: string | null;
}

export function calcolaQuotaAltriAderenti(righe: RigaPerQuota[]): QuotaCalcolata {
  const dovuto = (r: RigaPerQuota) => (r.importoDovuto > 0 ? r.importoDovuto : 0);
  const denominatore = righe.reduce((s, r) => s + dovuto(r), 0);
  const base = {
    numeratore: 0,
    denominatore,
    numeroRighe: righe.length,
    righeSenzaAdesione: [] as string[],
    quotaCerta: null as number | null,
    quotaPotenziale: null as number | null,
  };

  if (righe.length === 0) {
    return {
      ...base,
      calcolabile: false,
      quota: null,
      motivo: 'La proposta non ha righe: non c’è un indebitamento complessivo su cui calcolare.',
    };
  }
  if (denominatore <= 0) {
    return {
      ...base,
      calcolabile: false,
      quota: null,
      motivo: 'Il totale degli importi dovuti è zero.',
    };
  }

  let numeratore = 0;
  let nonEspresso = 0;
  const righeSenzaAdesione: string[] = [];
  for (const r of righe) {
    if (r.adesione === null) {
      righeSenzaAdesione.push(r.categoriaCreditore);
      nonEspresso += dovuto(r);
    } else if (r.adesione === 'ADERENTE') {
      const favorevole = r.importoAderente === null ? dovuto(r) : r.importoAderente;
      // Non puo' votare a favore per piu' di quanto e' dovuto alla categoria.
      numeratore += Math.min(Math.max(favorevole, 0), dovuto(r));
    }
  }
  const quotaCerta = numeratore / denominatore;
  const quotaPotenziale = (numeratore + nonEspresso) / denominatore;
  const comune = { ...base, numeratore, righeSenzaAdesione, quotaCerta, quotaPotenziale };

  if (righeSenzaAdesione.length === 0) {
    return { ...comune, calcolabile: true, quota: quotaCerta, motivo: null };
  }

  // Voti incompleti. Se certa e potenziale stanno dallo stesso lato del 25%,
  // i voti mancanti non possono cambiare la soglia: il parametro e' gia'
  // determinato, senza presumere nulla. Altrimenti ci si ferma.
  if (quotaCerta >= 0.25 === quotaPotenziale >= 0.25) {
    return { ...comune, calcolabile: true, quota: quotaCerta, motivo: null };
  }
  return {
    ...comune,
    calcolabile: false,
    quota: null,
    motivo: `Intenzione di voto non espressa per ${righeSenzaAdesione.length === 1 ? 'una riga' : `${righeSenzaAdesione.length} righe`}: i favorevoli certi e quelli ancora possibili stanno ai due lati del 25%, quindi la soglia dipende da voti non ancora noti.`,
  };
}

// ---------------------------------------------------------------------------
// Composizione: dai tre dati alle formule del registro
// ---------------------------------------------------------------------------

export type PercorsoProposta = 'RICEVENTE' | 'REDIGENTE';

export interface FonteCitata {
  id: string;
  norma: string;
  /** false = fonte non ancora riscontrata: il parametro e' riportato, non consolidato. */
  sostieneEsito: boolean;
  notaVerifica: string;
}

export interface QuotaEffettiva {
  /** 0..1; null = ne' calcolata ne' inserita. */
  valore: number | null;
  origine: 'MANUALE' | 'CALCOLATA' | null;
  calcolata: QuotaCalcolata;
  manuale: number | null;
  /** Valore a mano diverso dal calcolo di almeno mezzo punto percentuale. */
  scostamento: boolean;
  /** Il valore a mano sta dall'altra parte del 25% rispetto al calcolo: cambia la soglia. */
  scostamentoCambiaSoglia: boolean;
}

export interface VocePerimetro {
  ente: EnteCreditore;
  etichettaEnte: string;
  ammesso: boolean;
  formula: string;
}

export interface InquadramentoProposta {
  strumento: VoceStrumento | null;
  percorso: PercorsoProposta;
  stato: 'DA_COMPILARE' | 'REGOLA_NON_IN_REGISTRO' | 'BLOCCATO' | 'DETERMINATO';
  /** Testo principale, gia' nella formula del percorso in corso. */
  formula: string | null;
  cramDown: {
    regime: ParametriCramDown['regime'];
    percentualeMinima: number | null;
    dilazioneMassimaAnni: number | null;
  } | null;
  perimetro: VocePerimetro[];
  quota: QuotaEffettiva;
  avvisi: string[];
  fonti: FonteCitata[];
}

const ETICHETTA_ENTE_CREDITORE: Record<EnteCreditore, string> = {
  INPS: 'INPS',
  INAIL: 'INAIL',
  AGENZIA_ENTRATE: 'Agenzia delle Entrate',
  AGENZIA_RISCOSSIONE: 'Agenzia Entrate-Riscossione',
  ALTRO_PREVIDENZIALE: 'Altro ente previdenziale',
};

const ENTI_PERIMETRO_REDIGENTE: EnteCreditore[] = [
  'AGENZIA_ENTRATE',
  'AGENZIA_RISCOSSIONE',
  'INPS',
  'INAIL',
];

function citaFonti(ids: string[]): FonteCitata[] {
  const uniche = Array.from(new Set(ids));
  return uniche.map((id) => {
    const f = fonte(id);
    return {
      id,
      norma: f?.norma ?? id,
      sostieneEsito: puoSostenereEsito(id),
      notaVerifica: f?.verifica ?? 'Fonte non presente nel registro.',
    };
  });
}

export function componiQuota(righe: RigaPerQuota[], quotaManuale: number | null): QuotaEffettiva {
  const calcolata = calcolaQuotaAltriAderenti(righe);
  const manuale =
    quotaManuale !== null && quotaManuale >= 0 && quotaManuale <= 1 ? quotaManuale : null;
  const valore = manuale !== null ? manuale : calcolata.quota;
  const origine = manuale !== null ? 'MANUALE' : calcolata.calcolabile ? 'CALCOLATA' : null;
  const confrontabile = manuale !== null && calcolata.quota !== null;
  const scostamento = confrontabile && Math.abs(manuale! - calcolata.quota!) >= 0.005;
  const scostamentoCambiaSoglia = confrontabile && manuale! >= 0.25 !== calcolata.quota! >= 0.25;
  return { valore, origine, calcolata, manuale, scostamento, scostamentoCambiaSoglia };
}

export function inquadraProposta(input: {
  strumento: string | null;
  /** AAAA-MM-GG */
  dataDeposito: string | null;
  /** 0..1; null = usa il valore calcolato dalle righe. */
  quotaManuale: number | null;
  righe: RigaPerQuota[];
  percorso: PercorsoProposta;
  /** Ente dello spazio (percorso Ricevente); null se non determinato. */
  enteSpazio: EnteCreditore | null;
}): InquadramentoProposta {
  const { percorso } = input;
  const strumento = voceStrumento(input.strumento) ?? null;
  const quota = componiQuota(input.righe, input.quotaManuale);
  const vuoto = {
    strumento,
    percorso,
    formula: null,
    cramDown: null,
    perimetro: [] as VocePerimetro[],
    quota,
    avvisi: [] as string[],
    fonti: [] as FonteCitata[],
  };

  if (!strumento) {
    return {
      ...vuoto,
      stato: 'DA_COMPILARE',
      formula:
        'Strumento non indicato: da esso dipende quale norma governa la proposta. Nessun parametro viene mostrato finché non è scelto.',
    };
  }

  if (strumento.regola === null) {
    return {
      ...vuoto,
      stato: 'REGOLA_NON_IN_REGISTRO',
      formula: `Regola non ancora nel registro delle fonti. Per «${strumento.etichetta}» (${strumento.riferimento}) la piattaforma non mostra parametri né perimetri: la disciplina non è stata ancora riscontrata e collaudata.`,
    };
  }

  // ---- Composizione negoziata: perimetro, nessun cram down ----------------
  if (strumento.regola === 'PERIMETRO_CN') {
    const avvisi: string[] = [];
    let enti: EnteCreditore[];
    if (percorso === 'RICEVENTE') {
      if (!input.enteSpazio) {
        return {
          ...vuoto,
          stato: 'BLOCCATO',
          formula:
            'Ente di riferimento dello spazio non determinato: collegare una categoria dei Parametri di riscontro della proposta a un ente dell’art. 25-novies. Senza, non si può dire se il credito rientra nel perimetro.',
          fonti: citaFonti(['CCII-23-c2bis']),
        };
      }
      enti = [input.enteSpazio];
    } else {
      enti = ENTI_PERIMETRO_REDIGENTE;
    }
    const esiti: { ente: EnteCreditore; esito: PerimetroCN }[] = enti.map((ente) => ({
      ente,
      esito: perimetroTransazioneCN(ente),
    }));
    const perimetro: VocePerimetro[] = esiti.map(({ ente, esito }) => ({
      ente,
      etichettaEnte: ETICHETTA_ENTE_CREDITORE[ente],
      ammesso: esito.ammesso,
      formula: percorso === 'RICEVENTE' ? esito.perRicevente : esito.perRedigente,
    }));
    if (input.dataDeposito && input.dataDeposito < '2024-09-28') {
      avvisi.push(
        'La data indicata è anteriore al 28/09/2024, giorno da cui esiste il comma 2-bis dell’art. 23: verificare la data o lo strumento.'
      );
    }
    avvisi.push(
      'In questo strumento non esiste omologazione forzosa: la quota degli altri aderenti non produce alcuna soglia.'
    );
    return {
      ...vuoto,
      stato: 'DETERMINATO',
      formula:
        percorso === 'RICEVENTE'
          ? perimetro[0].formula
          : 'Perimetro della transazione nella composizione negoziata, ente per ente.',
      perimetro,
      avvisi,
      fonti: citaFonti(esiti.flatMap((e) => e.esito.fonti)),
    };
  }

  // ---- Accordi di ristrutturazione: parametri dell'art. 63 -----------------
  const esito = parametriCramDown63({
    dataProposta: input.dataDeposito,
    quotaAltriAderenti: quota.valore,
  });
  const formula = percorso === 'RICEVENTE' ? esito.perRicevente : esito.perRedigente;
  const avvisi: string[] = [];

  if (esito.esito === 'bloccato') {
    if (input.dataDeposito && quota.valore === null) {
      // Due momenti a specchio: il Ricevente prende la quota dall'attestazione
      // e non si esprime sul voto altrui; il Redigente lavora sulle intenzioni
      // di voto raccolte.
      if (percorso === 'RICEVENTE') {
        avvisi.push(
          'La quota degli altri aderenti si ricava dall’attestazione allegata alla proposta: inserirla a mano.'
        );
      } else if (quota.calcolata.motivo) {
        avvisi.push(quota.calcolata.motivo);
      }
    }
    return {
      ...vuoto,
      stato: 'BLOCCATO',
      formula,
      avvisi,
      fonti: citaFonti(esito.fonti),
    };
  }

  if (esito.regime === 'transitorio') {
    avvisi.push(
      'Decorrenza della disciplina transitoria non ancora riscontrata: per una proposta anteriore all’entrata in vigore dell’art. 1-bis del D.L. 69/2023 questo parametro potrebbe non applicarsi.'
    );
  }
  if (quota.scostamentoCambiaSoglia) {
    avvisi.push(
      'La quota inserita a mano e quella calcolata dalle righe stanno ai due lati del 25%: la soglia mostrata dipende dal valore a mano. Accertare quale dei due è corretto.'
    );
  } else if (quota.scostamento) {
    avvisi.push('La quota inserita a mano è diversa da quella calcolata dalle righe.');
  }
  avvisi.push(
    'Le percentuali di adesione richieste dall’accordo stesso (artt. 57, 60 e 61) non sono ancora nel registro delle fonti: qui compaiono solo i parametri dell’art. 63.'
  );

  const fonti = citaFonti(esito.fonti);
  if (fonti.some((f) => !f.sostieneEsito)) {
    avvisi.unshift(
      'Il parametro poggia su una fonte non ancora riscontrata sul testo: è riportato, non consolidato.'
    );
  }

  return {
    ...vuoto,
    stato: 'DETERMINATO',
    formula,
    cramDown: {
      regime: esito.regime,
      percentualeMinima: esito.percentualeMinima ?? null,
      dilazioneMassimaAnni: esito.dilazioneMassimaAnni ?? null,
    },
    avvisi,
    fonti,
  };
}

/** Ente dello spazio (Ente25Novies) -> ente creditore delle regole. NON_PUBBLICO non ne ha. */
export function enteCreditoreDaEnteSpazio(ente: string | null | undefined): EnteCreditore | null {
  if (
    ente === 'INPS' ||
    ente === 'INAIL' ||
    ente === 'AGENZIA_ENTRATE' ||
    ente === 'AGENZIA_RISCOSSIONE'
  ) {
    return ente;
  }
  return null;
}

/** Validazione di una data AAAA-MM-GG realmente esistente. */
export function dataIsoValida(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const d = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === testo;
}
