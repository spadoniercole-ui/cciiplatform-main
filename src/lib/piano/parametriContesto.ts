// src/lib/piano/parametriContesto.ts
//
// IL CONTESTO ECONOMICO DEL PIANO — i parametri che influenzano lo sviluppo di
// un piano aziendale, siano simulati o presentati dall'azienda.
//
// Non sono leve del motore (quelle sono in `parametriSimulazione.ts`, e sono
// numeri con intervalli chiusi): sono fatti del mondo che il piano deve
// tenere presenti — inflazione, spread, costo del carburante, incidenza di una
// crisi internazionale o dell'instabilità politica, tecnologia. Li inserisce a
// mano l'ente, perché è l'ente che conosce il proprio tessuto: la piattaforma
// non ne inventa nessuno.
//
// TRE FORME, e sono tre cose diverse:
//   IMPORTO      un valore in euro (il costo del carburante al litro, un
//                contributo, un canone);
//   PERCENTUALE  un tasso (inflazione, spread, incidenza di un fattore);
//   TENDENZA     una previsione a tendere, in parole («in aumento», «stabile
//                nel 2027, in calo dopo»): non è un numero e non si finge tale.
//
// FINCHÉ LA LISTA È VUOTA, IL PROMPT NON CAMBIA: il blocco si aggiunge solo se
// lo spazio ha scritto qualcosa. Un elenco vuoto non è «nessun fattore»: è una
// domanda a cui l'ente non ha ancora risposto, e la pagina lo dice.
//
// Logica pura, con i suoi test.

export type TipoParametroContesto = 'IMPORTO' | 'PERCENTUALE' | 'TENDENZA';

export const TIPI_PARAMETRO_CONTESTO: TipoParametroContesto[] = [
  'IMPORTO',
  'PERCENTUALE',
  'TENDENZA',
];

export const ETICHETTA_TIPO_CONTESTO: Record<TipoParametroContesto, string> = {
  IMPORTO: 'importo',
  PERCENTUALE: 'percentuale',
  TENDENZA: 'previsione a tendere',
};

export interface ParametroContesto {
  /** Che cosa è: «Inflazione», «Costo del carburante». Il campo descrittivo. */
  descrizione: string;
  /** Il valore come lo scrive l'ente: un numero o una frase breve. */
  valore: string;
  tipo: TipoParametroContesto;
}

/**
 * GLI ESEMPI DA PRECARICARE. Sono voci, non valori: la descrizione e la forma
 * ci sono, il valore lo scrive l'ente. Precaricarli con un numero vorrebbe dire
 * attribuire all'ente un'inflazione che non ha dichiarato.
 */
export const PARAMETRI_CONTESTO_ESEMPIO: ParametroContesto[] = [
  { descrizione: 'Inflazione attesa', valore: '', tipo: 'PERCENTUALE' },
  { descrizione: 'Spread nazionale', valore: '', tipo: 'PERCENTUALE' },
  { descrizione: 'Costo del carburante', valore: '', tipo: 'IMPORTO' },
  { descrizione: 'Crisi internazionali — incidenza', valore: '', tipo: 'PERCENTUALE' },
  { descrizione: 'Instabilità politica — incidenza', valore: '', tipo: 'PERCENTUALE' },
  { descrizione: 'Tecnologia — diffusione attesa', valore: '', tipo: 'TENDENZA' },
];

export const MASSIMO_DESCRIZIONE = 120;
export const MASSIMO_VALORE = 200;
/** Oltre questo numero di voci il prompt diventa un elenco che l'AI non legge. */
export const MASSIMO_PARAMETRI_CONTESTO = 20;

const stringa = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const tipo = (v: unknown): TipoParametroContesto =>
  TIPI_PARAMETRO_CONTESTO.includes(v as TipoParametroContesto)
    ? (v as TipoParametroContesto)
    : 'PERCENTUALE';

/**
 * Le righe che entrano davvero: una descrizione vuota è una riga che l'ente ha
 * iniziato e non ha finito, e non si salva. Il valore può restare vuoto — la
 * voce esiste, il dato non è ancora noto — e in quel caso il prompt lo dice,
 * invece di trattarlo come zero.
 */
export function parametriContestoValidi(righe: unknown): ParametroContesto[] {
  if (!Array.isArray(righe)) return [];
  return righe
    .map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      return {
        descrizione: stringa(o.descrizione).slice(0, MASSIMO_DESCRIZIONE),
        valore: stringa(o.valore).slice(0, MASSIMO_VALORE),
        tipo: tipo(o.tipo),
      };
    })
    .filter((r) => r.descrizione.length > 0)
    .slice(0, MASSIMO_PARAMETRI_CONTESTO);
}

/** Gli errori da mostrare a chi salva: elenco vuoto = tutto accettabile. */
export function validaParametriContesto(righe: unknown): string[] {
  if (!Array.isArray(righe)) return ['I parametri del contesto sono un elenco.'];
  const errori: string[] = [];
  if (righe.length > MASSIMO_PARAMETRI_CONTESTO)
    errori.push(`Al massimo ${MASSIMO_PARAMETRI_CONTESTO} parametri del contesto.`);
  righe.forEach((r, i) => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (!stringa(o.descrizione))
      errori.push(`Riga ${i + 1}: la descrizione è obbligatoria (è il campo che dice che cosa è).`);
    if (stringa(o.valore).length > MASSIMO_VALORE)
      errori.push(`Riga ${i + 1}: il valore supera ${MASSIMO_VALORE} caratteri.`);
    if (!TIPI_PARAMETRO_CONTESTO.includes(o.tipo as TipoParametroContesto))
      errori.push(`Riga ${i + 1}: scegli fra importo, percentuale e previsione a tendere.`);
  });
  return errori;
}

/** Il valore come si scrive nel prompt: la forma dichiarata accanto alla cifra. */
export function valoreContesto(p: ParametroContesto): string {
  if (!p.valore) return 'valore non indicato';
  if (p.tipo === 'PERCENTUALE') return /%/.test(p.valore) ? p.valore : `${p.valore}%`;
  if (p.tipo === 'IMPORTO') return /€/.test(p.valore) ? p.valore : `${p.valore} €`;
  return p.valore;
}

/**
 * Il blocco per il prompt. Vuoto quando non c'è nulla da dire: chi chiama non
 * deve decidere se aggiungerlo.
 */
export function testoParametriContesto(righe: ParametroContesto[]): string {
  const valide = parametriContestoValidi(righe);
  if (valide.length === 0) return '';
  return valide
    .map((p) => `- ${p.descrizione}: ${valoreContesto(p)} (${ETICHETTA_TIPO_CONTESTO[p.tipo]})`)
    .join('\n');
}
