// L'ATTENZIONE DELLA VERIFICA CONTABILE, COME CONTESTO DELLA SIMULAZIONE.
//
// Il riquadro «Dove si concentra l'attenzione» dice, dimensione per dimensione,
// che cosa ha acceso il semaforo della contabile: esposizione verso l'ente,
// struttura patrimoniale, dinamica, affidabilità dei dati, quadro procedurale —
// con i determinanti, le intensità e le lacune. È la materia prima più utile che
// la piattaforma abbia quando l'AI deve impostare un piano: le dice su che cosa
// il piano deve rispondere.
//
// Qui quel riquadro diventa due cose, e nient'altro:
//   - un testo compatto per il prompt (dati, non giudizi da ripetere);
//   - i vincoli che il piano deve rispettare, uno per dimensione accesa oltre la
//     soglia dello spazio, più il debito dell'ente se non è in bilancio.
//
// Nessun numero nuovo: le intensità sono quelle del motore delle dimensioni
// (`src/lib/iai/dimensioni.ts`), la soglia è un parametro dello spazio
// (Parametri › Piano e simulazione AI), e il debito è quello accertato in
// amministrativa, ritrovato o no in bilancio.
//
// Logica pura, con i suoi test.

import type { EsitoVerifica } from '@/lib/verifica/esito';
import { gravitaDebito, type DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';
import { ORIZZONTE_MASSIMO } from './ricevente';

/** Che cosa si sta simulando: si sceglie al lancio, non è un parametro fisso. */
export interface LancioSimulazione {
  procedura: 'ACCORDO' | 'LIQUIDAZIONE' | 'CRAM_DOWN';
  /** Percentuale di offerta ipotizzata, se chi simula ne fissa una. */
  percentualeOfferta: number | null;
  prudenza: 'PRUDENTE' | 'NEUTRA' | 'FAVOREVOLE';
}

export const LANCIO_PREDEFINITO: LancioSimulazione = {
  procedura: 'ACCORDO',
  percentualeOfferta: null,
  prudenza: 'PRUDENTE',
};

/**
 * Il lancio come si salva con la variante: i parametri del lancio più gli anni
 * di restituzione del debito, che la pagina teneva solo in memoria. Senza gli
 * anni salvati, richiamare una variante restituiva le scelte dell'AI e perdeva
 * l'orizzonte di restituzione su cui erano state calcolate le rate.
 */
export interface LancioPiano extends LancioSimulazione {
  /** Anni di restituzione del debito; null = come la proposta. */
  anniRientro: number | null;
}

export const LANCIO_PIANO_PREDEFINITO: LancioPiano = {
  ...LANCIO_PREDEFINITO,
  anniRientro: null,
};

const PROCEDURE: LancioSimulazione['procedura'][] = ['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN'];
const PRUDENZE: LancioSimulazione['prudenza'][] = ['PRUDENTE', 'NEUTRA', 'FAVOREVOLE'];

/**
 * Il lancio come arriva dal browser, dall'AI o dal database: valori ammessi
 * soltanto, nessun numero fuori scala. Un campo che non si riconosce torna al
 * valore predefinito invece di far fallire il salvataggio.
 */
export function lancioPianoValido(
  input: unknown,
  orizzonteMassimo: number = ORIZZONTE_MASSIMO
): LancioPiano {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const procedura = PROCEDURE.includes(o.procedura as LancioSimulazione['procedura'])
    ? (o.procedura as LancioSimulazione['procedura'])
    : LANCIO_PREDEFINITO.procedura;
  const prudenza = PRUDENZE.includes(o.prudenza as LancioSimulazione['prudenza'])
    ? (o.prudenza as LancioSimulazione['prudenza'])
    : LANCIO_PREDEFINITO.prudenza;
  const offerta = Number(o.percentualeOfferta);
  const percentualeOfferta =
    o.percentualeOfferta === null ||
    o.percentualeOfferta === undefined ||
    o.percentualeOfferta === ''
      ? null
      : Number.isFinite(offerta)
        ? Math.max(0, Math.min(100, Math.round(offerta * 100) / 100))
        : null;
  const anni = Number(o.anniRientro);
  // 0 è un valore, non un campo vuoto: significa «in un'unica soluzione».
  const anniRientro =
    o.anniRientro === null || o.anniRientro === undefined || o.anniRientro === ''
      ? null
      : Number.isFinite(anni)
        ? Math.max(0, Math.min(orizzonteMassimo, Math.round(anni)))
        : null;
  return { procedura, percentualeOfferta, prudenza, anniRientro };
}

/** Il lancio salvato con una variante; null quando la variante non ne ha. */
export function lancioDaSalvato(input: unknown): LancioPiano | null {
  if (!input || typeof input !== 'object') return null;
  return lancioPianoValido(input);
}

export const ETICHETTA_PROCEDURA: Record<LancioSimulazione['procedura'], string> = {
  ACCORDO: 'accordo con i creditori',
  LIQUIDAZIONE: 'liquidazione giudiziale',
  CRAM_DOWN: 'cram down',
};

export const ETICHETTA_PRUDEENZA: Record<LancioSimulazione['prudenza'], string> = {
  PRUDENTE: 'prudente: le poste attive si tengono basse, le passive alte',
  NEUTRA: 'neutra: si segue il riferimento di settore senza correzioni',
  FAVOREVOLE: 'favorevole: si ammette il miglior esito plausibile, dichiarandolo',
};

/** Il testo dei parametri di lancio: entra nel prompt, non nei numeri del piano. */
export function testoLancio(l: LancioSimulazione | LancioPiano): string {
  const pezzi = [
    `PROCEDURA DA SOSTENERE: ${ETICHETTA_PROCEDURA[l.procedura]}. Il piano deve reggere le rate e la cassa di questa procedura, non una qualunque.`,
    `IMPOSTAZIONE: ${ETICHETTA_PRUDEENZA[l.prudenza]}.`,
  ];
  if (l.percentualeOfferta !== null && l.percentualeOfferta > 0) {
    pezzi.push(
      `OFFERTA IPOTIZZATA: ${l.percentualeOfferta}% del credito dell’ente. Le rate e la cassa si dimensionano su questa percentuale.`
    );
  }
  const anni = (l as LancioPiano).anniRientro;
  if (typeof anni === 'number' && anni > 0) {
    pezzi.push(
      `RESTITUZIONE DEL DEBITO: il debito dell’ente si restituisce in ${anni} anni; le rate si dimensionano su questo arco.`
    );
  } else if (anni === 0) {
    pezzi.push('RESTITUZIONE DEL DEBITO: in un’unica soluzione, tutta nel primo anno del piano.');
  }
  return pezzi.join(' ');
}

/** Gli anni di restituzione come si leggono: vuoto, unica soluzione, N anni. */
export function testoAnniRientro(anni: number | null | undefined): string {
  if (anni === null || anni === undefined) return 'come la proposta';
  if (anni <= 0) return 'un’unica soluzione';
  return `${anni} ${anni === 1 ? 'anno' : 'anni'}`;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * Le dimensioni accese oltre la soglia, in ordine di intensità: sono quelle che
 * entrano nel contesto e nei vincoli.
 */
function accese(esito: Pick<EsitoVerifica, 'dimensioni'>, soglia: number) {
  return esito.dimensioni
    .filter((d) => d.punteggio >= soglia && (d.motivi.length > 0 || d.lacune.length > 0))
    .sort((a, b) => b.punteggio - a.punteggio);
}

/**
 * Il riquadro dell'attenzione in testo: giudizio, dimensioni sopra soglia con
 * intensità, determinanti e lacune, debito dell'ente in bilancio. Vuoto quando
 * non c'è nulla da dire (nessuna dimensione accesa e nessun debito da iscrivere).
 */
export function testoAttenzioneContabile(
  input: {
    esito: Pick<EsitoVerifica, 'giudizio' | 'dimensioni' | 'determinanti'>;
    debitoInBilancio: DebitoInBilancio | null;
  },
  soglia = 50
): string {
  const righe: string[] = [];
  const { esito } = input;
  righe.push(
    `GIUDIZIO DELLA CONTABILE: ${esito.giudizio.etichetta} — ${esito.giudizio.fattoreDeterminante}.`
  );

  const dimensioni = accese(esito, soglia);
  if (dimensioni.length > 0) {
    righe.push('DIMENSIONI ACCESE (intensità 0-100, determinanti e lacune):');
    for (const d of dimensioni) {
      const motivi = d.motivi.length > 0 ? ` ${d.motivi.join('; ')}.` : '';
      const lacune = d.lacune.length > 0 ? ` Lacune: ${d.lacune.join('; ')}.` : '';
      righe.push(`- ${d.dimensione} (intensità ${d.punteggio}):${motivi}${lacune}`);
    }
  }

  const debito = input.debitoInBilancio;
  if (debito && debito.esposizione !== null && gravitaDebito(debito) !== 'neutro') {
    righe.push(
      `DEBITO VERSO L'ENTE IN BILANCIO: ${euro(debito.inBilancio ?? 0)} a fronte di ${euro(debito.esposizione)} accertati. ${debito.testo}`
    );
  }

  return righe.length > 1 ? righe.join('\n') : '';
}

/**
 * Ciò che il piano deve rispettare, in frasi brevi: una per dimensione accesa,
 * più il debito dell'ente quando non è (o è solo in parte) in bilancio. Sono
 * vincoli di contenuto, non numeri: l'AI deve dire come li affronta, il calcolo
 * resta al motore.
 */
export function vincoliDaAttenzioneContabile(
  input: {
    esito: Pick<EsitoVerifica, 'dimensioni'>;
    debitoInBilancio: DebitoInBilancio | null;
  },
  soglia = 50
): string[] {
  const vincoli: string[] = [];
  const perDimensione: Record<string, string> = {
    A: 'L’esposizione verso l’ente è accesa: il piano deve dire con quali rate e con quale cassa la copre.',
    B: 'La struttura patrimoniale è fragile: il piano deve mostrare come ricostituisce il patrimonio (utili, apporti, dismissioni).',
    C: 'La dinamica è in peggioramento: la crescita dei ricavi va ancorata allo storico, non al solo settore.',
    D: 'L’affidabilità dei dati è bassa: le voci non coperte vanno trattate in modo prudente e la lacuna dichiarata.',
    E: 'Il quadro procedurale pesa: la procedura o lo stato dell’attività condizionano tempi e cassa del piano.',
  };
  for (const d of accese(input.esito, soglia)) {
    const frase = perDimensione[d.dimensione];
    if (frase) vincoli.push(frase);
  }
  const debito = input.debitoInBilancio;
  if (debito && debito.esposizione !== null && gravitaDebito(debito) !== 'neutro') {
    vincoli.push(
      `Il debito verso l’ente non è iscritto in bilancio (o lo è solo in parte): il piano deve prevederne l’iscrizione e la copertura.`
    );
  }
  return vincoli;
}
