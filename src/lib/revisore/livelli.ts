// src/lib/revisore/livelli.ts
//
// I QUATTRO LIVELLI DI OUTPUT — parte D.9 dei materiali di Libra — e le
// formule obbligatorie per le lacune (parte D.2).
//
// Ogni testo che la piattaforma produce dichiara a quale livello appartiene.
// Il livello 4 (conclusione attestativa o giuridica) non e' mai emesso dal
// software: e' riservato al professionista, al creditore competente o
// all'autorita' giudiziaria.

export type LivelloOutput = 1 | 2 | 3 | 4;

export interface DescrizioneLivello {
  livello: LivelloOutput;
  nome: string;
  datiRichiesti: string;
  esitoConsentito: string;
  emessoDalSoftware: boolean;
}

export const LIVELLI_OUTPUT: Record<LivelloOutput, DescrizioneLivello> = {
  1: {
    livello: 1,
    nome: 'Riscontro documentale',
    datiRichiesti: 'Dati minimi, fonte e data verificabili.',
    esitoConsentito: 'Dato rilevato; soglia superata o non superata; documento presente o assente.',
    emessoDalSoftware: true,
  },
  2: {
    livello: 2,
    nome: 'Esito istruttorio',
    datiRichiesti: 'Tutti i dati bloccanti dell’esito specifico.',
    esitoConsentito:
      'Istruttoria completa o incompleta; confronto quantitativo disponibile; presupposti oggettivi rilevati.',
    emessoDalSoftware: true,
  },
  3: {
    livello: 3,
    nome: 'Bozza professionale',
    datiRichiesti: 'Livello 2, più metodologia, documenti probatori e professionista identificato.',
    esitoConsentito: 'Bozza per validazione professionale; mai conclusione autonoma del software.',
    emessoDalSoftware: true,
  },
  4: {
    livello: 4,
    nome: 'Conclusione attestativa o giuridica',
    datiRichiesti:
      'Dati completi, verificati e validati; incarico e responsabilità del professionista.',
    esitoConsentito:
      'Riservato al professionista, al creditore competente o all’autorità giudiziaria.',
    emessoDalSoftware: false,
  },
};

/** I testi generati che passano dal revisore. */
export type TipoOutput =
  'RELAZIONE_SCENARIO' | 'RELAZIONE_SCREENING' | 'DOCUMENTO_CORREDO' | 'ANALISI_PROPOSTA';

export const LIVELLO_PER_TIPO: Record<TipoOutput, LivelloOutput> = {
  RELAZIONE_SCENARIO: 3,
  RELAZIONE_SCREENING: 2,
  DOCUMENTO_CORREDO: 3,
  ANALISI_PROPOSTA: 2,
};

export const ETICHETTA_TIPO_OUTPUT: Record<TipoOutput, string> = {
  RELAZIONE_SCENARIO: 'Relazione dello scenario',
  RELAZIONE_SCREENING: 'Relazione di Screening',
  DOCUMENTO_CORREDO: 'Documento di corredo',
  ANALISI_PROPOSTA: 'Analisi della proposta',
};

/**
 * Intestazione che dichiara il limite dell'output (controllo REV-024). La
 * piattaforma la antepone da se' a ogni testo che stampa: il controllo resta,
 * perche' un testo puo' arrivare al revisore anche da altre strade.
 */
/** @deprecated dalla 0.109.95: la testa dell'elaborato e' la dichiarazione di perimetro (perimetro.ts). */
export function intestazioneLivello(tipo: TipoOutput): string {
  const livello = LIVELLO_PER_TIPO[tipo];
  if (livello === 3) {
    return 'BOZZA ISTRUTTORIA — elaborazione tecnica soggetta a validazione del professionista competente. Non costituisce attestazione, asseverazione né conclusione giuridica.';
  }
  return 'ELABORAZIONE TECNICA — esito istruttorio sui dati disponibili, soggetto a validazione. Non accerta crisi o insolvenza e non costituisce conclusione giuridica.';
}

/** Formule obbligatorie per le lacune (Libra D.2). I segnaposto fra [ ] si compilano. */
export const FORMULE_LACUNA = {
  'LAC-B-001':
    'Esito non esprimibile: manca l’informazione indispensabile [nome dato] per verificare il presupposto di cui a [source_id]. Non è stata formulata alcuna conclusione sul merito.',
  'LAC-B-002':
    'Esito non esprimibile: il dato [nome dato] è disponibile ma non verificato rispetto alla fonte [fonte richiesta]. Il dato non è stato utilizzato come base di una conclusione.',
  'LAC-D-001':
    'Esito parziale: l’analisi è basata sui dati disponibili alla data del [data]. Manca [nome dato], la cui assenza riduce il grado di completezza dell’esito senza impedire il riscontro indicato.',
  'LAC-D-002':
    'Esito parziale su dati non aggiornati: il dato [nome dato] ha data di riferimento [data]. Non è stata verificata la permanenza della situazione alla data dell’elaborazione.',
  'LAC-D-003':
    'Elaborazione condizionata: il valore [nome valore] deriva da un’assunzione non ancora validata dal soggetto responsabile. Non costituisce dato certificato né valutazione professionale.',
  'LAC-N-001':
    'Il presente esito rileva esclusivamente il dato/parametro indicato. Restano da valutare professionalmente i presupposti giuridici e fattuali non automatizzabili.',
} as const;

export type CodiceLacuna = keyof typeof FORMULE_LACUNA;

export function formulaLacuna(codice: CodiceLacuna, valori: Record<string, string>): string {
  return FORMULE_LACUNA[codice].replace(/\[([^\]]+)\]/g, (tutto, chiave: string) =>
    valori[chiave] !== undefined ? valori[chiave] : tutto
  );
}
