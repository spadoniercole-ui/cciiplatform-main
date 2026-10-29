// src/lib/triage/etaVerifica.ts
//
// QUANTO SONO VECCHI I NUMERI DI UNA VERIFICA.
//
// Il triage produce una fotografia: le posizioni lette dal V.E.R.A., i valori
// dei fogli, la data a cui si riferiscono i conti. Quella fotografia non
// invecchia da sola — resta esattamente com'era — ma il mondo sotto di lei sì,
// e la finestra che il foglio stesso dichiara è di trenta giorni per tornare a
// controllare se i reparti si sono attivati.
//
// Riaprendo una verifica dopo quel termine la videata sembra identica a quella
// del primo giorno: stessi numeri, stesso esito, nessuna traccia del tempo
// passato. Qui si calcola l'età, perché la scheda possa dirlo invece di
// lasciarlo dedurre da una data in mezzo a un paragrafo.
//
// Logica pura, senza fusi: le date sono giorni («AAAA-MM-GG») e si confrontano
// in UTC. Passare da `Date` locali sposterebbe il giorno a seconda di chi
// guarda, e una finestra sbagliata di un giorno su un termine di legge non è un
// dettaglio.

export interface EtaVerifica {
  /** Giorni trascorsi fra la data di riferimento e oggi (0 = oggi). */
  giorni: number;
  /** Giorno entro cui si doveva tornare a verificare («AAAA-MM-GG»). */
  riverifica: string;
  /** true quando il termine dei controlli è superato. */
  daRicontrollare: boolean;
}

/** Mezzanotte UTC del giorno indicato, o null se il testo non è una data. */
function mezzanotteUtc(giorno: string): number | null {
  const m = (giorno ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

const comeIso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * L'età di una verifica rispetto alla sua finestra di ricontrollo.
 *
 * `null` quando una delle due date non è leggibile: meglio nessun avviso che
 * un avviso calcolato su una data inventata. Una data di riferimento nel
 * futuro (una verifica registrata con il giorno sbagliato) non produce un
 * allarme: i giorni risultano negativi e il termine non è superato.
 */
export function etaVerifica(
  dataVerifica: string,
  oggi: string,
  giorniFinestra = 30
): EtaVerifica | null {
  const v = mezzanotteUtc(dataVerifica);
  const o = mezzanotteUtc(oggi);
  if (v === null || o === null) return null;
  const giorni = Math.round((o - v) / 86_400_000);
  return {
    giorni,
    riverifica: comeIso(v + giorniFinestra * 86_400_000),
    daRicontrollare: giorni > giorniFinestra,
  };
}
