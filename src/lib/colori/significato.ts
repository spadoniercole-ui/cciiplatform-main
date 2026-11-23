// I COLORI CHE PARLANO — un significato solo, per tutta la piattaforma.
//
// Verde, giallo, rosso e grigio dicono una cosa sola ogni volta che compaiono:
// se il giudizio è favorevole, se c'è da lavorare, se è contrario, oppure se
// un giudizio non c'è ancora. Non sono decorazione e non sono una scala: sono
// quattro parole scritte con il colore.
//
// Il blu, lo sky e i toni neutri non entrano qui: sono azione (il pulsante, la
// voce attiva) o identità di una colonna (la Posizione aggiornata), mai un
// giudizio. Se un blu comincia a significare «buono», il colore ha smesso di
// parlare e ha iniziato a confondere.
//
// Ogni schermata che colora un giudizio accompagna il colore con
// `LegendaColori`: chi legge non deve indovinare, e chi ha una percezione
// diversa dei colori deve poterlo leggere.

export type Tono = 'verde' | 'giallo' | 'rosso' | 'grigio';

export interface Significato {
  /** La parola che il colore scrive. */
  breve: string;
  /** Che cosa vuol dire, per esteso. */
  esteso: string;
}

/** I quattro toni, nell'ordine in cui si leggono in legenda. */
export const TONI: readonly Tono[] = ['verde', 'giallo', 'rosso', 'grigio'];

export const SIGNIFICATO_TONO: Record<Tono, Significato> = {
  verde: { breve: 'favorevole', esteso: 'fatto, oppure dentro la soglia' },
  giallo: { breve: 'attenzione', esteso: 'da completare, oppure da approfondire' },
  rosso: { breve: 'allerta', esteso: 'criticità, oppure valore oltre la soglia' },
  grigio: { breve: 'senza giudizio', esteso: 'non ancora valutabile, o dato mancante' },
};

/** Il pallino della legenda: lo stesso colore del testo che affianca. */
export const PALLINO: Record<Tono, string> = {
  verde: 'bg-emerald-500',
  giallo: 'bg-amber-400',
  rosso: 'bg-red-500',
  grigio: 'bg-slate-300',
};

/**
 * L'esito di un indice di bilancio: oltre la soglia è rosso, dentro è verde.
 * Un valore che il motore non sa calcolare non è un bene né un male: grigio.
 */
export function tonoDaEsitoIndice(esito: 'OK' | 'VIOLATO' | string | null | undefined): Tono {
  if (esito === 'OK') return 'verde';
  if (esito === 'VIOLATO') return 'rosso';
  return 'grigio';
}

/** Lo stato di un passo della scheda: fatto, da fare, oppure non disponibile. */
export function tonoDaStatoPasso(stato: 'completo' | 'attivo' | 'bloccato'): Tono {
  if (stato === 'completo') return 'verde';
  if (stato === 'attivo') return 'giallo';
  return 'grigio';
}

/** Il giudizio qualitativo della Check List usa gli stessi quattro toni. */
export function tonoDaGiudizio(colore: 'verde' | 'giallo' | 'rosso' | 'grigio'): Tono {
  return colore;
}
