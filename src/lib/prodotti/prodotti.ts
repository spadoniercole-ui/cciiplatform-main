// src/lib/prodotti/prodotti.ts
//
// IL PRODOTTO È IL FATTO CONCRETO SU CUI L'ENTE LAVORA (0.161.0).
//
// La catena dei Parametri ha un ordine, e questo modulo è il secondo anello:
//
//   1. DIRETTRICI  — i nomi delle aree/uffici. Nient'altro.
//   2. PRODOTTI    — il fatto concreto («DURC», «Diffide») dentro una
//                    direttrice, con il flag che lo manda in check list e le
//                    domande che il triage porrà.
//   3. TS          — il codice della lavorazione, associato al prodotto e alla
//                    sua direttrice.
//   4. PROCESSO    — le attività con cui l'ufficio gestisce quel prodotto.
//
// Perché il prodotto non sta più dentro le direttrici: prima un prodotto era
// una stringa in un elenco, senza un posto dove dire «questo va in check list»
// né quali domande fare. Il flag e le domande sono proprietà del prodotto, non
// della direttrice: la stessa direttrice può avere un prodotto presidiato e uno
// no.
//
// LA RISPOSTA PUÒ ESSERE CHIUSA O LIBERA. Una domanda amministrativa ha spesso
// una risposta secca («il versamento risulta?»), ma altre volte chiede un fatto
// che va raccontato («quali misure ha adottato l'azienda?»). Il tipo lo decide
// chi configura, non chi risponde: un sì/no dove serve un testo produce
// un'informazione che non c'è.
//
// IL TESTO LIBERO HA UN LIMITE, E NON È UN CAPRICCIO. Una risposta sintetica e
// puntuale è quella che entra in un verbale; un campo senza limite invita a
// incollare una relazione. Mille caratteri sono il tetto scelto dall'ente.
//
// Logica pura: nessun accesso al database, così si verifica con i test.

import { unaRiga } from '@/lib/titoliEnte/catalogoTl';

/** Come si risponde a una domanda della check list. */
export type TipoDomanda = 'SI_NO' | 'TESTO_LIBERO';

/** Il tetto del campo libero: una risposta sintetica, non una relazione. */
export const MASSIMO_CARATTERI_RISPOSTA_LIBERA = 1000;

/** Il nome del prodotto è un'etichetta: sta in una riga, non in un paragrafo. */
export const MASSIMO_CARATTERI_NOME_PRODOTTO = 160;

/** La domanda è una frase: oltre, non è più una domanda. */
export const MASSIMO_CARATTERI_DOMANDA = 500;

export const ETICHETTA_TIPO_DOMANDA: Record<TipoDomanda, string> = {
  SI_NO: 'Risposta chiusa (Sì / No)',
  TESTO_LIBERO: 'Testo libero',
};

export interface DomandaProdotto {
  /**
   * L'identità della domanda, STABILE nel tempo: le risposte del triage sono
   * agganciate a questo id. Riscrivere il testo non le perde; cancellare la
   * domanda sì, ed è coerente — non esiste più la domanda a cui rispondevano.
   */
  id: string;
  testo: string;
  tipo: TipoDomanda;
  /** Solo per TESTO_LIBERO: il tetto del campo. null per SI_NO. */
  maxCaratteri: number | null;
}

export interface ProdottoEnte {
  id: number;
  /** Il nome della direttrice: è la chiave dell'appartenenza. */
  direttrice: string;
  nome: string;
  /** Attivo = il prodotto entra nella check list dinamica del triage. */
  inChecklist: boolean;
  domande: DomandaProdotto[];
  ordine: number;
}

export interface InputProdottoEnte {
  id?: number | null;
  direttrice: string;
  nome: string;
  inChecklist: boolean;
  domande: DomandaProdotto[];
}

/** La chiave di un prodotto: direttrice + nome, senza dipendere dalla grafia. */
export function chiaveProdotto(direttrice: string, nome: string): string {
  return `${unaRiga(direttrice).toLowerCase()}|${unaRiga(nome).toLowerCase()}`;
}

/** Una domanda nella forma che il database e la schermata si aspettano. */
export function normalizzaDomanda(
  domanda: Partial<DomandaProdotto> | null | undefined,
  indice: number
): DomandaProdotto {
  const tipo: TipoDomanda = domanda?.tipo === 'SI_NO' ? 'SI_NO' : 'TESTO_LIBERO';
  const id = unaRiga(domanda?.id ?? '') || `q${indice + 1}`;
  const max =
    tipo === 'TESTO_LIBERO'
      ? Math.min(
          MASSIMO_CARATTERI_RISPOSTA_LIBERA,
          Math.max(1, Number(domanda?.maxCaratteri) || MASSIMO_CARATTERI_RISPOSTA_LIBERA)
        )
      : null;
  return { id, testo: unaRiga(domanda?.testo ?? ''), tipo, maxCaratteri: max };
}

export function normalizzaProdotto(input: InputProdottoEnte): InputProdottoEnte {
  const viste = new Set<string>();
  const domande = (input.domande ?? [])
    .map((d, i) => normalizzaDomanda(d, i))
    // Due domande con lo stesso id sarebbero due risposte che si
    // sovrascrivono: la seconda vince in silenzio nel database.
    .filter((d) => {
      if (!d.id || viste.has(d.id)) return false;
      viste.add(d.id);
      return true;
    })
    .filter((d) => d.testo !== '');
  return {
    id: input.id ?? null,
    direttrice: unaRiga(input.direttrice),
    nome: unaRiga(input.nome),
    inChecklist: input.inChecklist === true,
    domande,
  };
}

/**
 * Errore da mostrare, oppure null.
 *
 * Il flag senza domande è il caso da bloccare: l'operatore direbbe «questo
 * prodotto va in check list» e il triage non avrebbe nulla da chiedere — il
 * silenzio sembrerebbe una verifica fatta.
 */
export function validaProdotto(input: InputProdottoEnte): string | null {
  const direttrice = unaRiga(input.direttrice);
  if (!direttrice) return 'Scegli la direttrice del prodotto.';
  const nome = unaRiga(input.nome);
  if (!nome) return 'Indica il nome del prodotto.';
  if (nome.length > MASSIMO_CARATTERI_NOME_PRODOTTO)
    return `Il nome del prodotto non può superare ${MASSIMO_CARATTERI_NOME_PRODOTTO} caratteri.`;

  const domande = input.domande ?? [];
  if (input.inChecklist === true && domande.length === 0)
    return 'Se il prodotto entra in check list, scrivi almeno una domanda: senza, il triage non ha nulla da chiedere.';

  for (const [i, domanda] of domande.entries()) {
    const testo = unaRiga(domanda.testo);
    if (!testo) return `La domanda ${i + 1} non ha testo.`;
    if (testo.length > MASSIMO_CARATTERI_DOMANDA)
      return `La domanda ${i + 1} non può superare ${MASSIMO_CARATTERI_DOMANDA} caratteri.`;
    if (domanda.tipo === 'TESTO_LIBERO') {
      const max = Number(domanda.maxCaratteri ?? MASSIMO_CARATTERI_RISPOSTA_LIBERA);
      if (!Number.isFinite(max) || max < 1 || max > MASSIMO_CARATTERI_RISPOSTA_LIBERA)
        return `La risposta libera della domanda ${i + 1} deve stare entro ${MASSIMO_CARATTERI_RISPOSTA_LIBERA} caratteri.`;
    }
  }
  return null;
}

/** Una riga del database nella forma del modello. */
export function rigaProdotto(r: Record<string, unknown>): ProdottoEnte {
  const grezze = Array.isArray(r.domande) ? (r.domande as Record<string, unknown>[]) : [];
  return {
    id: Number(r.id),
    direttrice: String(r.direttrice ?? ''),
    nome: String(r.nome ?? ''),
    inChecklist: r.in_checklist === true,
    domande: grezze.map((d, i) => normalizzaDomanda(d as Partial<DomandaProdotto>, i)),
    ordine: Number(r.ordine ?? 0),
  };
}

/** I prodotti di una direttrice, nell'ordine in cui sono stati scritti. */
export function prodottiDellaDirettrice(
  prodotti: ProdottoEnte[],
  direttrice: string
): ProdottoEnte[] {
  const chiave = unaRiga(direttrice).toLowerCase();
  return prodotti
    .filter((p) => unaRiga(p.direttrice).toLowerCase() === chiave)
    .sort((a, b) => a.ordine - b.ordine || a.id - b.id);
}

/** I prodotti che mandano il triage in check list, con almeno una domanda. */
export function prodottiInChecklist(prodotti: ProdottoEnte[]): ProdottoEnte[] {
  return prodotti
    .filter((p) => p.inChecklist && p.domande.length > 0)
    .sort((a, b) => a.direttrice.localeCompare(b.direttrice, 'it') || a.ordine - b.ordine);
}

/**
 * L'elenco piatto delle domande da porre per questa azienda: una voce per
 * domanda, nell'ordine prodotto → domanda.
 */
export interface VoceChecklistProdotto {
  prodottoId: number;
  prodotto: string;
  direttrice: string;
  domandaId: string;
  domanda: string;
  tipo: TipoDomanda;
  maxCaratteri: number | null;
}

export function vociChecklistProdotti(prodotti: ProdottoEnte[]): VoceChecklistProdotto[] {
  return prodottiInChecklist(prodotti).flatMap((p) =>
    p.domande.map((d) => ({
      prodottoId: p.id,
      prodotto: p.nome,
      direttrice: p.direttrice,
      domandaId: d.id,
      domanda: d.testo,
      tipo: d.tipo,
      maxCaratteri: d.maxCaratteri,
    }))
  );
}

/** La risposta data a una voce: chiusa (sì/no) oppure libera. */
export interface RispostaChecklistProdotto {
  prodottoId: number;
  domandaId: string;
  siNo: boolean | null;
  testo: string | null;
}

/** La risposta vale come «data»? Un testo vuoto non è una risposta. */
export function rispostaData(
  voce: VoceChecklistProdotto,
  risposte: RispostaChecklistProdotto[]
): boolean {
  const r = risposte.find(
    (x) => x.prodottoId === voce.prodottoId && x.domandaId === voce.domandaId
  );
  if (!r) return false;
  if (voce.tipo === 'SI_NO') return r.siNo === true || r.siNo === false;
  return unaRiga(r.testo ?? '') !== '';
}

/** Che cosa manca, con il nome del prodotto: un elenco di id non dice nulla. */
export function mancanzeChecklistProdotti(
  voci: VoceChecklistProdotto[],
  risposte: RispostaChecklistProdotto[]
): string[] {
  const out: string[] = [];
  for (const v of voci) {
    if (rispostaData(v, risposte)) continue;
    out.push(`«${v.prodotto}»: rispondere a «${v.domanda}».`);
  }
  return out;
}

export type QualificazioneChecklist =
  'SISTEMICA' | 'DA_APPROFONDIRE' | 'SQUILIBRIO' | 'NON_VALUTABILE';

export interface SintesiChecklistProdotti {
  totale: number;
  risposte: number;
  mancanti: number;
  mancanze: string[];
  /** Solo le domande a risposta chiusa: sono quelle che si possono contare. */
  chiuse: number;
  si: number;
  no: number;
  qualificazione: QualificazioneChecklist;
  etichetta: string;
  dettaglio: string;
  voci: {
    prodotto: string;
    domanda: string;
    tipo: TipoDomanda;
    risposta: string;
  }[];
}

/**
 * Il quadro della check list dei prodotti.
 *
 * LA QUALIFICAZIONE È DELL'OPERATORE, NON DELLA LEGGE. Il conteggio dei sì/no
 * serve a leggere in un colpo d'occhio se la storia dell'azienda racconta
 * un'azione voluta o uno squilibrio, ma resta una qualificazione istruttoria:
 * non è un accertamento di crisi e non sostituisce le soglie, che si misurano
 * sugli importi. Le domande a testo libero non entrano nel conteggio — non
 * sono numerabili — ma restano nel quadro con la loro risposta.
 */
export function sintesiChecklistProdotti(
  voci: VoceChecklistProdotto[],
  risposte: RispostaChecklistProdotto[]
): SintesiChecklistProdotti {
  const mancanze = mancanzeChecklistProdotti(voci, risposte);
  const chiuseVoci = voci.filter((v) => v.tipo === 'SI_NO');
  const si = chiuseVoci.filter(
    (v) =>
      risposte.find((r) => r.prodottoId === v.prodottoId && r.domandaId === v.domandaId)?.siNo ===
      true
  ).length;
  const no = chiuseVoci.filter(
    (v) =>
      risposte.find((r) => r.prodottoId === v.prodottoId && r.domandaId === v.domandaId)?.siNo ===
      false
  ).length;
  const risposteDate = voci.filter((v) => rispostaData(v, risposte)).length;

  let qualificazione: QualificazioneChecklist = 'NON_VALUTABILE';
  if (chiuseVoci.length > 0 && risposteDate > 0) {
    if (no === 0 && si > 0) qualificazione = 'SISTEMICA';
    else if (si === 0 && no > 0) qualificazione = 'SQUILIBRIO';
    else if (si > 0 || no > 0) qualificazione = 'DA_APPROFONDIRE';
  }

  const ETICHETTE: Record<QualificazioneChecklist, { etichetta: string; dettaglio: string }> = {
    SISTEMICA: {
      etichetta: 'Azione sistemica e voluta',
      dettaglio:
        'Tutte le domande a risposta chiusa sono state riscontrate: la storia dell’azienda racconta un comportamento presidiato e consapevole, non un incidente isolato.',
    },
    SQUILIBRIO: {
      etichetta: 'Squilibrio da aprire a un tavolo di trattativa',
      dettaglio:
        'Nessuna delle domande a risposta chiusa risulta riscontrata: il quadro descrive uno squilibrio, e la via da esplorare è il tavolo di trattativa con l’ente, non la contestazione.',
    },
    DA_APPROFONDIRE: {
      etichetta: 'Quadro misto: da approfondire',
      dettaglio:
        'Le risposte chiuse non sono tutte nella stessa direzione: alcune cose risultano, altre no. Il quadro va letto insieme alle soglie e alle note delle domande libere.',
    },
    NON_VALUTABILE: {
      etichetta: 'Qualificazione non misurabile',
      dettaglio:
        'Non ci sono domande a risposta chiusa con una risposta, oppure il prodotto non è in check list: la qualificazione si ricava dalle sole domande a testo libero.',
    },
  };

  return {
    totale: voci.length,
    risposte: risposteDate,
    mancanti: mancanze.length,
    mancanze,
    chiuse: chiuseVoci.length,
    si,
    no,
    qualificazione,
    ...ETICHETTE[qualificazione],
    voci: voci.map((v) => {
      const r = risposte.find((x) => x.prodottoId === v.prodottoId && x.domandaId === v.domandaId);
      return {
        prodotto: v.prodotto,
        domanda: v.domanda,
        tipo: v.tipo,
        risposta:
          v.tipo === 'SI_NO'
            ? r?.siNo === true
              ? 'Sì'
              : r?.siNo === false
                ? 'No'
                : 'Senza risposta'
            : unaRiga(r?.testo ?? '') || 'Senza risposta',
      };
    }),
  };
}
