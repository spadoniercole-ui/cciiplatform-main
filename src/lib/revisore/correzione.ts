// src/lib/revisore/correzione.ts
//
// PASSATA CORRETTIVA — il revisore non blocca piu' il testo: lo fa
// correggere. Regola di Ercole: un rilievo su un testo che l'utente non puo'
// modificare e' lavoro sprecato; le informazioni elaborate dal revisore vanno
// rimesse DENTRO il documento.
//
// Il ciclo, deterministico salvo la riscrittura:
//   1. il testo generato passa dal revisore a regole;
//   2. se ci sono rilievi bloccanti, il testo e i rilievi vanno al modello con
//      l'istruzione di riscrivere SOLO le frasi segnalate, senza cambiare dati
//      ne' struttura;
//   3. il testo corretto ripassa dal revisore; si tiene la versione con meno
//      blocchi (mai una riscrittura peggiore dell'originale);
//   4. cio' che resta viene riportato in calce, nel documento stesso.
//
// Questo modulo costruisce il prompt e sceglie la versione: e' logica pura.
// La chiamata al modello sta nelle azioni.

import { revisionaTesto, type Revisione } from './revisore';
import type { TipoOutput } from './livelli';
import type { Evidenza } from '@/lib/fascicolo/evidenza';

export function promptCorrezione(testo: string, revisione: Revisione): string {
  const rilievi = revisione.risultati
    .filter((r) => r.esito === 'BLOCCO' || r.esito === 'SEGNALAZIONE')
    .flatMap((r) =>
      r.rilievi.map(
        (x) =>
          `- [${r.controllo.id}] Passo: «${x.trovato}» (…${x.contesto}…). Regola: ${r.controllo.verifica} Come correggere: ${x.nota}`
      )
    );
  return `Sei il revisore di un testo istruttorio prodotto da un applicativo. Il testo che segue ha superato quasi tutti i controlli; restano i rilievi elencati sotto. Riscrivi il testo applicando SOLO le correzioni indicate: non cambiare numeri, date, fatti, struttura, titoli o ordine dei paragrafi; non aggiungere contenuti; non accorciare. Dove il rilievo chiede di indicare una fonte che non conosci con certezza, scrivi «[fonte da inserire nel registro]». Dove chiede di dichiarare che una disciplina è abrogata, dillo nella stessa frase. Restituisci SOLO il testo corretto, integrale, senza commenti.

RILIEVI DA RISOLVERE:
${rilievi.join('\n')}

TESTO:
${testo}`;
}

export interface EsitoCorrezione {
  testo: string;
  revisione: Revisione;
  /** true se la riscrittura e' stata adottata (meno blocchi dell'originale). */
  corretto: boolean;
  blocchiPrima: number;
  blocchiDopo: number;
}

/**
 * Sceglie fra originale e riscrittura: si adotta la riscrittura solo se ha
 * meno blocchi e una lunghezza compatibile (una risposta troncata o un
 * commento al posto del testo non passano).
 */
export function scegliVersione(
  originale: string,
  riscritto: string | null,
  tipo: TipoOutput,
  fascicolo: Evidenza[] | null
): EsitoCorrezione {
  const revOrig = revisionaTesto(originale, tipo, { fascicolo });
  const blocchiPrima = revOrig.conteggi.BLOCCO;
  if (!riscritto)
    return {
      testo: originale,
      revisione: revOrig,
      corretto: false,
      blocchiPrima,
      blocchiDopo: blocchiPrima,
    };
  const lunghezzaOk =
    riscritto.length >= originale.length * 0.7 && riscritto.length <= originale.length * 1.4;
  const revNuova = revisionaTesto(riscritto, tipo, { fascicolo });
  if (lunghezzaOk && revNuova.conteggi.BLOCCO < blocchiPrima) {
    return {
      testo: riscritto,
      revisione: revNuova,
      corretto: true,
      blocchiPrima,
      blocchiDopo: revNuova.conteggi.BLOCCO,
    };
  }
  return {
    testo: originale,
    revisione: revOrig,
    corretto: false,
    blocchiPrima,
    blocchiDopo: blocchiPrima,
  };
}

/** Appendice da mettere in calce al documento: i rilievi rimasti, in chiaro. */
export function appendiceRilievi(revisione: Revisione): string {
  const restanti = revisione.risultati.filter(
    (r) => r.esito === 'BLOCCO' || r.esito === 'SEGNALAZIONE'
  );
  if (restanti.length === 0) return '';
  const righe = restanti.flatMap((r) =>
    r.rilievi.length
      ? r.rilievi.map(
          (x) =>
            `- ${r.controllo.id} (${r.esito === 'BLOCCO' ? 'da risolvere' : 'da verificare'}): «${x.trovato}» — ${x.nota}`
        )
      : [
          `- ${r.controllo.id} (${r.esito === 'BLOCCO' ? 'da risolvere' : 'da verificare'}): ${r.messaggio}`,
        ]
  );
  return `\n\n───────────────────────────────\nRILIEVI DEL REVISORE AUTOMATICO NON RISOLTI (${restanti.length})\nQuesti rilievi sono parte integrante del documento: chi lo utilizza ne tiene conto. ${revisione.conteggi.NON_VERIFICATO} controlli non sono eseguibili automaticamente e restano a carico della revisione professionale.\n${righe.join('\n')}`;
}
