// src/lib/triage/checkListRiepilogo.ts
//
// LA CHECK LIST CON LE RISPOSTE, PER IL FOGLIO STAMPATO.
//
// Il riepilogo del triage porta la check di perimetro — come l'azienda si sta
// muovendo sui crediti — e accanto deve portare il questionario con le
// risposte date: sono la stessa verifica guardata da due lati. Senza le
// domande, chi riceve il foglio legge un esito («attenzione», un punteggio)
// senza poter vedere su che cosa è stato costruito, e per controllarlo deve
// riaprire la piattaforma — che il foglio esiste proprio per non doverlo fare.
//
// UNA DOMANDA SENZA RISPOSTA SI STAMPA COME TALE. Un questionario a metà non
// è un questionario con dei «no»: la differenza fra «non risulta» e «non ho
// ancora guardato» è l'unica informazione che il foglio non può perdere, e
// scriverla come risposta negativa la cancellerebbe.
//
// Logica pura: riceve sezioni e risposte già lette, non tocca il database.

export interface DomandaRiepilogoCheckList {
  id: string;
  testo: string;
  /** null = domanda ancora senza risposta (distinta da un «No»). */
  risposta: boolean | null;
}

export interface SezioneRiepilogoCheckList {
  numero: string;
  titolo: string;
  domande: DomandaRiepilogoCheckList[];
}

export interface CheckListRiepilogo {
  sezioni: SezioneRiepilogoCheckList[];
  totali: number;
  risposte: number;
  /** L'esito delle direttrici, quando tutte le domande hanno una risposta. */
  esito: { etichetta: string; punteggio: number | null } | null;
  generataIl: string | null;
}

/**
 * Prepara la check list per il foglio. `null` quando non c'è nulla da
 * stampare: un questionario mai generato non è una sezione mancante del
 * riepilogo, e un titolo vuoto farebbe dubitare del resto.
 */
export function riepilogoCheckList(input: {
  sezioni: { numero: string; titolo: string; domande: { id: string; domanda: string }[] }[];
  risposte: { domandaId: string; risposta: boolean | null }[];
  esito?: { etichetta: string; punteggio: number | null } | null;
  generatoIl?: string | null;
}): CheckListRiepilogo | null {
  const risposte = input.risposte ?? [];
  const sezioni: SezioneRiepilogoCheckList[] = (input.sezioni ?? [])
    .map((s) => ({
      numero: String(s.numero ?? ''),
      titolo: String(s.titolo ?? ''),
      domande: (s.domande ?? [])
        // Una domanda senza testo non è una domanda: non si stampa una riga
        // vuota con accanto «senza risposta», che sembrerebbe una mancanza
        // dell'operatore.
        .filter((d) => String(d.domanda ?? '').trim().length > 0)
        .map((d) => ({
          id: String(d.id),
          testo: String(d.domanda).trim(),
          risposta: risposte.find((r) => r.domandaId === d.id)?.risposta ?? null,
        })),
    }))
    .filter((s) => s.domande.length > 0);

  if (sezioni.length === 0) return null;

  const domande = sezioni.flatMap((s) => s.domande);
  return {
    sezioni,
    totali: domande.length,
    risposte: domande.filter((d) => d.risposta !== null).length,
    esito: input.esito ?? null,
    generataIl: input.generatoIl ?? null,
  };
}
