// src/lib/revisore/perimetro.ts
//
// DICHIARAZIONE DI PERIMETRO — un solo testo, in testa a ogni elaborato e nel
// prompt che lo genera, al posto dell'inventario puntiglioso delle provenienze
// (scelta di Ercole). Dice tre cose: da dove vengono i dati e che valore
// hanno; a quale livello di decisione serve l'elaborato; che cosa NON e'.
//
// Il pubblico e' sempre lo stesso — l'ente — ma cambia il livello degli occhi:
//   TRIAGE     chi immette i file (data entry): esito di verifica;
//   SCREENING  primo livello decisionale: se sottoporre il caso a un
//              dirigente per un confronto con l'azienda o per la richiesta
//              di liquidazione giudiziale;
//   RELAZIONE  livello dirigenziale: valutazione di una proposta, con la
//              valutazione attuale dell'azienda, i dati di settore, gli
//              scenari, e l'intenzione di voto;
//   CORREDO    bozze del Redigente per il professionista.
// Le formule sono quelle di Libra (parte C): completezza riferita al perimetro
// documentale dichiarato; coerenza parametrica, non conformita' giuridica.

import type { TipoOutput } from './livelli';
import { AVVERTENZA_TITOLI_ENTE } from '@/lib/titoliEnte/titoli';

export type FaseElaborato = 'TRIAGE' | 'SCREENING' | 'RELAZIONE' | 'CORREDO';

export const FASE_PER_TIPO: Record<TipoOutput, FaseElaborato> = {
  RELAZIONE_SCREENING: 'SCREENING',
  RELAZIONE_SCENARIO: 'RELAZIONE',
  DOCUMENTO_CORREDO: 'CORREDO',
  ANALISI_PROPOSTA: 'RELAZIONE',
};

const DESTINAZIONE: Record<FaseElaborato, string> = {
  TRIAGE:
    'Esito di verifica: serve a chi immette i file per sapere che cosa è stato letto, che cosa manca e se la posizione merita lo Screening. Non contiene valutazioni.',
  SCREENING:
    'Esito istruttorio di primo livello: serve a decidere se sottoporre il caso al dirigente, per un confronto con l’azienda o per la richiesta di liquidazione giudiziale. Fotografa la situazione alla data dell’elaborazione, prima di qualsiasi proposta.',
  RELAZIONE:
    'Bozza istruttoria di livello dirigenziale: somma i dati storici del triage e dello Screening, la valutazione attuale dell’azienda, il confronto con i dati di settore e gli scenari simulati, a supporto della valutazione della proposta e dell’intenzione di voto dell’ente.',
  CORREDO:
    'Bozza istruttoria per il professionista che assiste il Redigente: va controllata, completata e firmata prima di ogni utilizzo.',
};

export function dichiarazionePerimetro(fase: FaseElaborato): string {
  return `PERIMETRO DEI DATI E DESTINAZIONE DELL’ELABORATO
${DESTINAZIONE[fase]}
I dati di provenienza aziendale (bilancio, situazione debitoria dichiarata, documenti allegati, sistemi interni dell’azienda) sono riportati così come proposti, senza verifica di veridicità, e non costituiscono accertamento: le indicazioni che seguono sono sviluppate su di essi e ne condividono i limiti. I dati ufficiali degli enti sono quelli caricati nell’applicativo alla data dell’elaborazione. I riscontri quantitativi sono riferiti ai dati disponibili a quella data; la completezza è riferita al perimetro documentale dichiarato; la coerenza con i parametri configurati non equivale a conformità giuridica. L’elaborato non accerta crisi o insolvenza, non attesta né assevera, e non costituisce conclusione giuridica: queste restano al professionista, all’ente e al tribunale.
${fase === 'CORREDO' ? '' : AVVERTENZA_TITOLI_ENTE}`;
}

/** Riconosce una dichiarazione di perimetro (o la vecchia intestazione di livello) gia' presente. */
export const MODELLO_DICHIARAZIONE =
  /PERIMETRO DEI DATI|bozza\s+istruttoria|elaborazione\s+tecnica|soggett[oa]\s+a\s+validazione/iu;

/** Versione per il prompt: il modello la rispetta e non la ripete. */
export function perimetroPerPrompt(fase: FaseElaborato): string {
  return `\n\nPERIMETRO DA RISPETTARE (sarà stampato in testa all'elaborato: non ripeterlo nel testo):\n${dichiarazionePerimetro(fase)}\nScrivi per questo livello di lettura e non oltre: non trarre conclusioni che spettano al livello successivo.`;
}
