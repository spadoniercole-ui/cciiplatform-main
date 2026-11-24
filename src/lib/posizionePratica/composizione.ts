// LA POSIZIONE GIÀ COMPOSTA (0.242.2).
//
// La pagina della Posizione leggeva sei fonti e poi componeva: quadratura del
// credito, quadro qualitativo, letture a confronto, richieste all'azienda,
// prontezza, invecchiamento, punto di pareggio, piano in essere. Con quella
// logica dentro il componente, l'unico modo di verificarla era aprire la pagina
// con i dati giusti — e nessun test poteva dire se una regola era cambiata.
//
// Qui la composizione è una funzione pura: riceve ciò che è stato letto e
// restituisce la posizione. La pagina fa solo il rendering. Le fonti restano
// dove sono (`leggiVerificaAzienda`, `leggiQualitativaAzienda`,
// `leggiPercentualeCriticitaPesata`, …): questo modulo non legge il database e
// non chiama motori.
//
// Una nota sul tempo: `adesso` è un ingresso, non un effetto collaterale, così
// la validità di una posizione si può provare senza aspettare sei mesi.

import { valutaValidita, type Validita } from '@/lib/screening/validitaVerifica';
import type { Attenzione } from '@/lib/screening/indicatore';
import type { DebitoMemorizzato } from '@/lib/debitiEnte/memorizzazione';
import type { FotografiaVerificaAzienda } from '@/lib/verificaAzienda/fotografia';
import type { LetturaCongruenza } from '@/lib/flussiEnte/leggiCongruenza';
import type { LetturaQualitativa } from '@/lib/checklist/letturaQualitativa';
import { quadraturaCredito, type Quadratura, type VoceQuadratura } from './quadratura';
import { valutaProntezza, type EsitoProntezza } from './prontezza';
import { valutaInvecchiamento, type Invecchiamento } from './invecchiamento';
import { confrontoLetture, indiciDaAccertato, type ConfrontoLetture } from './divergenze';
import { richiesteDa, testoRichiesta, type Richiesta } from './richieste';
import { breakEvenAccordo, type BreakEvenAccordo } from './breakEven';
import { pianoInEssere, type PianoInEssere } from './pianoInEssere';
import { etichettaEsito, type EsitoDecisione } from './decisioni';

/**
 * Ciò che le fonti hanno già letto. Nessun campo è obbligatorio: una fonte
 * mancante non è un errore, è una lacuna che la composizione deve saper
 * dichiarare.
 */
export interface DatiPosizione {
  ragioneSociale: string;
  /** Quando è stata eseguita la verifica amministrativa: la data di riferimento. */
  eseguitaIl: string | null;
  attenzione: Attenzione | null;
  debito: DebitoMemorizzato | null;
  debitoMemorizzatoIl: string | null;
  /** Il totale della certificazione dei debiti, la fonte a monte. */
  certificazioneTotale: number | null;
  /** L'esposizione contributiva delle soglie: un sottoinsieme, fuori dalla quadratura. */
  esposizioneContributiva: number | null;
  qualitativa: LetturaQualitativa | null;
  fotografia: FotografiaVerificaAzienda | null;
  congruenza: LetturaCongruenza | null;
  /** Chi ha eseguito la verifica amministrativa (0.243.0). */
  eseguitaDa?: string | null;
  /** true quando la verifica amministrativa è stata eseguita in ispezione (0.244.0). */
  eseguitaInIspezione?: boolean;
  /** Lo stato della contabile per questa azienda; null se non si è potuto leggere. */
  contabile: {
    completa: boolean;
    visuraIl: string | null;
    mancanti: string[];
    /** Quando è stata aperta e da chi: la cronologia degli atti. */
    apertaIl?: string | null;
    autore?: string | null;
    /** true quando è stata aperta in salvagente: non è un atto dell'ente. */
    inIspezione?: boolean;
  } | null;
  /** Le decisioni già registrate, per la cronologia (data, esito, autore). */
  decisioni?: { decisaIl: string; esito: EsitoDecisione; autore: string }[];
}

/**
 * Un atto della pratica, con la sua data e chi l'ha compiuto (0.243.0).
 * La pagina era ordinata per argomento: nessuno poteva dire che cosa era
 * successo prima e che cosa dopo.
 */
export interface AttoPosizione {
  fonte: 'amministrativa' | 'contabile' | 'azienda' | 'flussi' | 'debito' | 'visura' | 'decisione';
  cosa: string;
  /** ISO: si ordina per istante, si mostra per giorno. */
  data: string;
  autore: string | null;
  /** L'atto è stato compiuto in ispezione, non dall'ente. */
  ispezione: boolean;
}

// Si restituisce solo ciò che la pagina rende: il lettore della posizione ha
// una sola forma (questa), e un campo in più sarebbe un campo che nessuno
// aggiorna quando cambia la regola. Il quadro qualitativo e la copertura
// arrivano già dentro `confronto` e `coperturaTesto`; la ragione sociale
// serve alla richiesta, non alla posizione composta.
export interface PosizioneComposta {
  validita: Validita;
  /** «4/4», oppure null se l'indicatore non si è potuto leggere. */
  coperturaTesto: string | null;
  /** Le dimensioni che restano fuori: la pagina dice quali, non solo quante. */
  coperturaMancante: string[];
  quadratura: Quadratura;
  confronto: ConfrontoLetture;
  richieste: Richiesta[];
  testoRichiesta: string;
  prontezza: EsitoProntezza;
  invecchiamento: Invecchiamento;
  breakEven: BreakEvenAccordo;
  piano: PianoInEssere;
  /** Gli atti della pratica, dal più recente al più vecchio. */
  cronologia: AttoPosizione[];
  /** Il credito vantato: quello che la decisione annota. */
  credito: number | null;
}

/**
 * L'IMPRONTA DELLA POSIZIONE (0.244.0).
 *
 * Credito, copertura, grado, blocchi, quadratura e scoperto: i numeri su cui
 * si firma. La pagina la mostra al modulo, l'azione la ricalcola e rifiuta se
 * non coincide — così una decisione non può essere annotata con i numeri di
 * una posizione che nel frattempo è cambiata. Stringa leggibile e non hash:
 * se un giorno va confrontata a mano, si legge.
 */
export function improntaPosizione(p: PosizioneComposta): string {
  return [
    `credito:${p.credito ?? 'non accertato'}`,
    `copertura:${p.coperturaTesto ?? '—'}`,
    `fuori:${p.coperturaMancante.join('|') || '—'}`,
    `grado:${p.prontezza.grado}`,
    `blocchi:${p.prontezza.blocchi.length}`,
    `quadratura:${p.quadratura.esito}`,
    `scoperto:${p.breakEven.scoperto ?? '—'}`,
  ].join('\n');
}

const euroData = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('it-IT');
};

const netto = (
  fotografia: FotografiaVerificaAzienda | null,
  codice: 'LIQUIDAZIONE' | 'CRAM_DOWN'
) => fotografia?.scenari.find((s) => s.codice === codice)?.recupero ?? null;

export function componiPosizione(
  dati: DatiPosizione,
  adesso: Date = new Date()
): PosizioneComposta {
  const { attenzione, debito, fotografia, qualitativa, congruenza, contabile } = dati;

  const validita = valutaValidita(dati.eseguitaIl, adesso);

  // ---- Il credito e la sua quadratura -------------------------------------
  const notaDebito = debito
    ? `Fonte ${debito.fonte}${euroData(dati.debitoMemorizzatoIl) ? `, ${euroData(dati.debitoMemorizzatoIl)}` : ''}.`
    : 'La verifica amministrativa non ha ancora chiuso il debito.';

  const vociCredito: VoceQuadratura[] = [
    {
      fonte: 'amministrativa',
      etichetta: 'Debito accertato (verifica amministrativa)',
      valore: debito?.totale ?? null,
      nota: notaDebito,
    },
    {
      fonte: 'certificazione',
      etichetta: 'Certificazione dei debiti',
      valore: dati.certificazioneTotale,
      nota: 'La fonte a monte: il debito certo dell’ultima certificazione letta.',
    },
    {
      fonte: 'soglie',
      etichetta: 'Esposizione contributiva (soglie)',
      valore: dati.esposizioneContributiva,
      confrontabile: false,
      nota: 'Solo contributi, al netto di sanzioni e crediti già a ruolo: è un sottoinsieme del debito.',
    },
  ];
  const quadratura = quadraturaCredito(vociCredito);

  // ---- Il quadro qualitativo: dalla lettura unica -------------------------
  const qualitativo = {
    colore: qualitativa?.colore ?? null,
    dettaglio: qualitativa?.dettaglio ?? qualitativa?.motivo ?? null,
  };

  const credito = fotografia?.credito ?? debito?.totale ?? null;
  const scenari = fotografia?.scenari ?? [];

  const confronto = confrontoLetture({
    amministrativa: attenzione
      ? {
          esito: attenzione.esito,
          etichetta: attenzione.etichetta,
          fattore: attenzione.fattoreDeterminante,
          copertura: attenzione.copertura,
        }
      : null,
    qualitativo,
    indiciViolati: indiciDaAccertato(attenzione?.accertato),
    fotografia: fotografia
      ? {
          capacita: fotografia.capacita.esito,
          coperturaPct: fotografia.capacita.coperturaPct,
          dettaglio: fotografia.capacita.dettaglio,
        }
      : null,
    scenari: {
      calcolabili: scenari.filter((s) => s.calcolabile).length,
      totali: scenari.length,
      liquidazione: netto(fotografia, 'LIQUIDAZIONE'),
      cramDown: netto(fotografia, 'CRAM_DOWN'),
      credito,
    },
  });

  // ---- Le lacune, in una richiesta ---------------------------------------
  const richieste = richiesteDa({
    daAccertare: attenzione?.daAccertare ?? [],
    dimensioniScoperte: (attenzione?.dimensioniScoperte ?? []).map((d) => ({
      nome: d.nome,
      motivo: d.portante
        ? 'dimensione portante: senza di essa il perimetro non è circoscrivibile'
        : null,
    })),
    mancanzeChecklist: (qualitativa?.sintesi?.mancanze ?? []).map(String),
    flussi: congruenza
      ? {
          senzaDenuncia: congruenza.esiti.reduce((n, e) => n + e.senzaDenuncia.length, 0),
          senzaDelega: congruenza.esiti.reduce((n, e) => n + e.senzaDelega.length, 0),
        }
      : null,
  });
  const testoDellaRichiesta = testoRichiesta({
    ragioneSociale: dati.ragioneSociale,
    richieste,
  });

  // ---- Quanto è pronta la posizione --------------------------------------
  const prontezza = valutaProntezza({
    amministrativa: {
      eseguita: Boolean(dati.eseguitaIl),
      esito: attenzione?.esito ?? null,
      copertura: attenzione?.copertura ?? null,
    },
    quadratura: quadratura.esito,
    validita: { stato: validita.stato, etichetta: validita.etichetta },
    richiesteAperte: richieste.length,
  });

  // ---- Date e invecchiamento ---------------------------------------------
  const invecchiamento = valutaInvecchiamento({
    verifica: { fonte: 'amministrativa', data: dati.eseguitaIl, cosa: 'verifica amministrativa' },
    dati: [
      { fonte: 'debito', data: dati.debitoMemorizzatoIl, cosa: 'debito verificato' },
      { fonte: 'visura', data: contabile?.visuraIl ?? null, cosa: 'visura camerale ricaricata' },
    ],
  });

  // ---- Accordo, procedure, piano in essere -------------------------------
  const breakEven = breakEvenAccordo({
    credito,
    disponibilita: fotografia?.capacita.disponibilita ?? null,
    flusso: fotografia?.capacita.flusso ?? null,
    liquidazioneNetta: netto(fotografia, 'LIQUIDAZIONE'),
    cramDownNetto: netto(fotografia, 'CRAM_DOWN'),
  });

  const piano = pianoInEssere({
    esiti: (congruenza?.esiti ?? []).map((e) => ({
      ente: e.ente,
      flusso: e.flusso,
      attesi: e.attesi,
      senzaDenuncia: e.senzaDenuncia.length,
      senzaDelega: e.senzaDelega.length,
      sospesi: e.sospesi.length,
      completo: e.completo,
    })),
  });

  // ---- La cronologia degli atti -----------------------------------------
  const atti: AttoPosizione[] = [];
  const aggiungiAtto = (
    fonte: AttoPosizione['fonte'],
    cosa: string,
    data: string | null | undefined,
    autore: string | null | undefined,
    ispezione = false
  ) => {
    if (!data) return;
    const quando = new Date(data);
    if (Number.isNaN(quando.getTime())) return;
    atti.push({ fonte, cosa, data: quando.toISOString(), autore: autore ?? null, ispezione });
  };
  aggiungiAtto(
    'amministrativa',
    'Verifica amministrativa eseguita',
    dati.eseguitaIl,
    dati.eseguitaDa ?? null,
    dati.eseguitaInIspezione === true
  );
  aggiungiAtto(
    'contabile',
    'Verifica contabile aperta',
    contabile?.apertaIl ?? null,
    contabile?.autore ?? null,
    contabile?.inIspezione === true
  );
  aggiungiAtto('visura', 'Visura camerale ricaricata', contabile?.visuraIl ?? null, null);
  aggiungiAtto(
    'flussi',
    'Congruenza dei flussi verificata',
    congruenza?.dataVerifica ?? null,
    null
  );
  // VERIFICATO, NON RIACCERTATO (0.256.11): la data registrata è quella in cui
  // il credito è stato riletto e confermato, non un nuovo accertamento.
  aggiungiAtto('debito', 'Debito verificato', dati.debitoMemorizzatoIl, null);
  for (const d of dati.decisioni ?? []) {
    aggiungiAtto('decisione', `Decisione: ${etichettaEsito(d.esito)}`, d.decisaIl, d.autore);
  }
  // Dal più recente: la prima riga è l'ultimo atto, che è quello che conta.
  atti.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return {
    validita,
    coperturaTesto: attenzione
      ? `${attenzione.copertura.determinate}/${attenzione.copertura.totali}`
      : null,
    coperturaMancante: (attenzione?.dimensioniScoperte ?? []).map((d) => d.nome),
    quadratura,
    confronto,
    richieste,
    testoRichiesta: testoDellaRichiesta,
    prontezza,
    invecchiamento,
    breakEven,
    piano,
    cronologia: atti,
    credito,
  };
}
