// UN SOLO MODO DI SCRIVERE I NUMERI (0.243.0).
//
// La stessa pagina mostrava «77.090 €» accanto a «Liquidazione 7782 €»: due
// punti del codice formattavano lo stesso tipo di cifra in modi diversi, e in
// un documento che si stampa e si cita la forma del numero è parte
// dell'informazione. Qui la formattazione sta in un posto solo: chi mostra un
// importo chiama `formattaEuro`, chi mostra un numero chiama `formattaNumero`.
//
// Il valore assente non diventa zero: è un trattino, che si legge «non c'è».
// La stessa regola vale per le date.

/**
 * Un numero con il separatore delle migliaia italiano; il non finito è «—».
 *
 * Il raggruppamento è scritto qui e non delegato a `toLocaleString`: la locale
 * italiana, per convenzione CLDR, non separa i numeri di quattro cifre (7782
 * resta «7782», mentre 77.090 prende il punto). Accanto a un importo più
 * grande la stessa cifra sembra scritta in un altro modo. In un documento che
 * si stampa il separatore c'è sempre, e la forma non dipende dal runtime.
 */
export function formattaNumero(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Un importo in euro; il valore assente è «—», mai «0 €». */
export function formattaEuro(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${formattaNumero(n)} €`;
}

/** Come `formattaEuro`, ma null quando non c'è nulla da scrivere (per i testi). */
export function formattaEuroONull(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? `${formattaNumero(n)} €` : null;
}

/** Una data civile (AAAA-MM-GG o ISO); null se manca o non è una data. */
export function formattaGiorno(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('it-IT');
}

/** Data e ora, per la traccia delle decisioni. */
export function formattaGiornoOra(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** La parte civile di un istante ISO, per i confronti per giorno. */
export function soloGiorno(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
