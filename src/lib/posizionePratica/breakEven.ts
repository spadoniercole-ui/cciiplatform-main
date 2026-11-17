// IL PUNTO DI PAREGGIO DELL'ACCORDO (0.242.0).
//
// L'accordo non misura un recupero: misura la capacità di risposta. Il tavolo,
// però, fa sempre la stessa domanda e finora la piattaforma non la sapeva
// rispondere con i suoi numeri: «sotto quale recupero questa proposta è
// peggiore della procedura?» e «quanta cassa serve perché stia in piedi?».
//
// Sono due conti, non due previsioni:
//
//   RECUPERO MINIMO   il migliore fra i recuperi calcolabili delle procedure
//                     (liquidazione, cram down). Sotto quella cifra l'accordo
//                     conviene all'azienda, non all'ente.
//
//   FLUSSO NECESSARIO lo scoperto di cassa: quanto deve produrre l'esercizio
//                     perché la disponibilità basti a coprire il credito.
//
// Nessun numero inventato: se il credito o la cassa mancano, il conto si
// dichiara non calcolabile e dice perché.
//
// Logica pura, con i suoi test.

export interface BreakEvenAccordo {
  credito: number | null;
  disponibilita: number | null;
  flusso: number | null;
  /** Credito che la cassa non copre; 0 se lo copre. */
  scoperto: number | null;
  /** Recupero minimo perché l'accordo non sia peggiore della migliore procedura. */
  recuperoMinimo: number | null;
  /** La procedura che fissa il recupero minimo. */
  proceduraConfronto: 'LIQUIDAZIONE' | 'CRAM_DOWN' | null;
  /** Flusso d'esercizio che servirebbe per chiudere lo scoperto in una annualità. */
  flussoNecessario: number | null;
  /** true quando disponibilità + flusso coprono il credito. */
  sostenibile: boolean | null;
  /**
   * Che cosa manca perché i conti si chiudano (0.243.0): un «non calcolabile»
   * senza causa costringe a indovinare, e chi legge non sa che documento
   * chiedere.
   */
  mancanti: string[];
  dettaglio: string;
}

import { formattaEuro } from '@/lib/formato/numeri';

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const euro = (n: number) => formattaEuro(n);
const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function breakEvenAccordo(input: {
  credito: number | null;
  disponibilita: number | null;
  flusso: number | null;
  liquidazioneNetta: number | null;
  cramDownNetto: number | null;
}): BreakEvenAccordo {
  const credito = numero(input.credito);
  const disponibilita = numero(input.disponibilita);
  const flusso = numero(input.flusso);

  if (credito === null || credito <= 0) {
    const mancanti = ['il credito vantato'];
    if (disponibilita === null) mancanti.push('la disponibilità liquide');
    return {
      credito: null,
      disponibilita,
      flusso,
      scoperto: null,
      recuperoMinimo: null,
      proceduraConfronto: null,
      flussoNecessario: null,
      sostenibile: null,
      mancanti,
      dettaglio:
        'Il credito vantato non è accertato: senza di esso né il recupero minimo né lo scoperto di cassa si calcolano.',
    };
  }

  const procedure: { nome: 'LIQUIDAZIONE' | 'CRAM_DOWN'; netto: number }[] = [];
  const liq = numero(input.liquidazioneNetta);
  const cram = numero(input.cramDownNetto);
  if (liq !== null) procedure.push({ nome: 'LIQUIDAZIONE', netto: liq });
  if (cram !== null) procedure.push({ nome: 'CRAM_DOWN', netto: cram });

  let recuperoMinimo: number | null = null;
  let proceduraConfronto: 'LIQUIDAZIONE' | 'CRAM_DOWN' | null = null;
  let notaRecupero = '';
  if (procedure.length > 0) {
    const migliore = procedure.reduce((a, b) => (b.netto > a.netto ? b : a));
    // Una procedura non può restituire più del credito: se i parametri dicono
    // il contrario è un dato da rivedere, e si dichiara invece di correggerlo
    // in silenzio.
    if (migliore.netto > credito) {
      recuperoMinimo = arrotonda(credito);
      proceduraConfronto = migliore.nome;
      notaRecupero = ` La percentuale del rango restituisce più del credito: il confronto si ferma al credito vantato.`;
    } else {
      recuperoMinimo = arrotonda(migliore.netto);
      proceduraConfronto = migliore.nome;
    }
  }

  const scoperto = disponibilita === null ? null : arrotonda(Math.max(0, credito - disponibilita));
  const flussoNecessario =
    scoperto === null || scoperto === 0 ? (scoperto === 0 ? 0 : null) : scoperto;
  const sostenibile =
    disponibilita === null && flusso === null
      ? null
      : (disponibilita ?? 0) + (flusso !== null && flusso > 0 ? flusso : 0) >= credito;

  const pezzi: string[] = [`Credito vantato ${euro(credito)}.`];
  if (disponibilita === null) {
    pezzi.push('La disponibilità liquide non è nota: lo scoperto di cassa non si calcola.');
  } else if (scoperto === 0) {
    pezzi.push(`La cassa (${euro(disponibilita)}) copre il credito: lo scoperto è zero.`);
  } else {
    pezzi.push(
      `La cassa (${euro(disponibilita)}) lascia scoperti ${euro(scoperto as number)}: con il flusso dell’esercizio (${
        flusso === null ? 'non noto' : euro(flusso)
      }) serve ${flusso !== null && flusso > 0 ? `${Math.ceil((scoperto as number) / flusso)} ${Math.ceil((scoperto as number) / flusso) === 1 ? 'annualità' : 'annualità'}` : 'un flusso non noto'}.`
    );
  }
  if (recuperoMinimo === null) {
    pezzi.push('Nessuna procedura è calcolabile: il recupero minimo non si conosce.');
  } else {
    pezzi.push(
      `Sotto ${euro(recuperoMinimo)} di recupero l’accordo rende meno della ${proceduraConfronto === 'LIQUIDAZIONE' ? 'liquidazione' : 'cram down'}.${notaRecupero}`
    );
  }

  const mancanti: string[] = [];
  if (disponibilita === null) mancanti.push('la disponibilità liquide');
  if (procedure.length === 0) mancanti.push('una procedura calcolabile (percentuali del rango)');
  if (disponibilita === null && flusso === null) mancanti.push('il flusso d’esercizio');

  return {
    credito: arrotonda(credito),
    disponibilita,
    flusso,
    scoperto,
    recuperoMinimo,
    proceduraConfronto,
    flussoNecessario,
    sostenibile,
    mancanti,
    dettaglio: pezzi.join(' '),
  };
}
