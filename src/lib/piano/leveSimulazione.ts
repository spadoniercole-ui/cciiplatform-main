// src/lib/piano/leveSimulazione.ts
//
// LE CINQUE DOMANDE DEL LANCIO — la scelta di che cosa mettere in gioco quando
// si simula il piano.
//
// Non sono parametri dello spazio (quelli valgono per tutte le aziende: stanno
// nei Parametri) e non sono risultati: sono il perimetro dell'ipotesi, e si
// scelgono scenario per scenario, al momento del lancio. Ognuna è un sì/no con
// una misura in percentuale, che la piattaforma propone — una misura suggerita,
// non una misura decisa: chi simula la cambia o la lascia.
//
// Perché una misura suggerita e non un campo vuoto: un sì senza misura non dice
// all'AI quanto pesa la leva, e l'AI finirebbe per inventare la parte che manca.
//
// Logica pura, con i suoi test.

export type IdLeva = 'PERSONALE' | 'TECNOLOGIA' | 'PRODUZIONE' | 'MERCATI' | 'CLIENTELA';

export interface DefinizioneLeva {
  id: IdLeva;
  /** La domanda come si legge nel pannello. */
  domanda: string;
  /** Che cosa misura la percentuale, detto per esteso. */
  misura: string;
  /** La misura che la piattaforma propone quando si risponde «sì». */
  suggeritaPct: number;
  /** Perché la leva entra nel piano, in una riga. */
  effetto: string;
}

export const LEVE: DefinizioneLeva[] = [
  {
    id: 'PERSONALE',
    domanda: 'Tagli del personale',
    misura: 'riduzione dell’organico',
    suggeritaPct: 10,
    effetto:
      'abbassa il costo del personale e la capacità produttiva: va detto dove il piano regge',
  },
  {
    id: 'TECNOLOGIA',
    domanda: 'Investimenti in tecnologia',
    misura: 'dei ricavi destinata agli investimenti',
    suggeritaPct: 5,
    effetto: 'alza gli investimenti e gli ammortamenti nei primi anni, e i ricavi solo dopo',
  },
  {
    id: 'PRODUZIONE',
    domanda: 'Diversificazione della produzione',
    misura: 'dei ricavi attesi dalle nuove linee',
    suggeritaPct: 15,
    effetto: 'porta ricavi nuovi ma anche costi e immobilizzi: il piano deve dirlo',
  },
  {
    id: 'MERCATI',
    domanda: 'Diversificazione dei mercati',
    misura: 'dei ricavi attesi dai nuovi mercati',
    suggeritaPct: 15,
    effetto: 'allarga i ricavi fuori dal mercato attuale, con più crediti e più rischio',
  },
  {
    id: 'CLIENTELA',
    domanda: 'Cambio del target di clientela',
    misura: 'dei ricavi attesi dal nuovo target',
    suggeritaPct: 20,
    effetto: 'cambia mix e tempi di incasso: il piano deve tenerne conto',
  },
];

export const ETICHETTA_LEVA: Record<IdLeva, string> = {
  PERSONALE: 'tagli del personale',
  TECNOLOGIA: 'investimenti in tecnologia',
  PRODUZIONE: 'diversificazione della produzione',
  MERCATI: 'diversificazione dei mercati',
  CLIENTELA: 'cambio del target di clientela',
};

export interface SceltaLeva {
  attiva: boolean;
  /** La misura in percentuale: 0-100. */
  misura: number;
}

export type LeveSimulazione = Record<IdLeva, SceltaLeva>;

/** Tutte spente, con la misura suggerita pronta: chi apre il pannello la vede e decide. */
export const LEVE_PREDEFINITE: LeveSimulazione = LEVE.reduce((acc, l) => {
  acc[l.id] = { attiva: false, misura: l.suggeritaPct };
  return acc;
}, {} as LeveSimulazione);

/** La misura suggerita per una leva, anche quando l'id arriva da fuori. */
export function misuraSuggerita(id: IdLeva): number {
  return LEVE.find((l) => l.id === id)?.suggeritaPct ?? 0;
}

const clampPct = (n: unknown, fallback: number): number => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, v));
};

/**
 * Le scelte come arrivano dal browser: ogni leva c'è, con una misura dentro
 * 0-100. Una leva spenta tiene comunque la sua misura (non si perde quando si
 * spegne e riaccende), ma nel prompt non entra.
 */
export function leveValide(input: unknown): LeveSimulazione {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const esito = { ...LEVE_PREDEFINITE };
  for (const l of LEVE) {
    const scelta = (o[l.id] && typeof o[l.id] === 'object' ? o[l.id] : {}) as Record<
      string,
      unknown
    >;
    esito[l.id] = {
      attiva: scelta.attiva === true,
      misura: clampPct(scelta.misura, l.suggeritaPct),
    };
  }
  return esito;
}

/** Le leve accese, in testo per il prompt. Vuoto quando sono tutte spente. */
export function testoLeve(leve: LeveSimulazione): string {
  const accese = LEVE.filter((l) => leve[l.id]?.attiva);
  if (accese.length === 0) return '';
  return accese
    .map((l) => {
      const misura = Math.round(leve[l.id].misura);
      return `- ${l.domanda}: SÌ, ${misura}% (${l.misura}). ${l.effetto}.`;
    })
    .join('\n');
}

/** Quante leve sono accese: la pagina lo dice accanto al pulsante. */
export function contaLeve(leve: LeveSimulazione): number {
  return LEVE.filter((l) => leve[l.id]?.attiva).length;
}
