// src/lib/checklist/validazione.ts
//
// Validazione della forma di un array di sezioni (sezione → domande →
// peso) prima di salvarlo come modello di Check List custom — non ci si
// fida di un JSON incollato dall'utente (import di uno scheletro, o
// modifica manuale). In un file separato (non 'use server') così può
// essere importato sia da azioni server sia da componenti client (per
// validare prima ancora di inviare al server).

import type { SezioneChecklist, PesoDomanda } from './ministeriale';

const PESI_VALIDI: PesoDomanda[] = ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE'];

/** Restituisce un messaggio d'errore in italiano se la struttura non è
 * valida, `null` se va bene. Oltre alla forma controlla che ogni domanda
 * abbia id e testo non vuoti e che gli id siano unici su tutta la Check
 * List: le risposte sono indicizzate per id, due domande con lo stesso id
 * si sovrapporrebbero. */
export function erroreSezioniChecklist(valore: unknown): string | null {
  // Un array vuoto è valido: un modello nasce con nome e descrizione,
  // zero sezioni ("guscio"), e si riempie dopo con l'export/import Excel
  // — non deve bloccare la creazione iniziale.
  if (!Array.isArray(valore)) return 'Struttura non valida: è atteso un elenco di sezioni.';
  const idVisti = new Set<string>();
  for (const sezione of valore) {
    if (
      !sezione ||
      typeof sezione.numero !== 'string' ||
      typeof sezione.titolo !== 'string' ||
      !Array.isArray(sezione.domande)
    ) {
      return 'Struttura non valida: ogni sezione deve avere numero, titolo e un elenco di domande.';
    }
    for (const d of sezione.domande as any[]) {
      if (
        !d ||
        typeof d.id !== 'string' ||
        typeof d.domanda !== 'string' ||
        !PESI_VALIDI.includes(d.peso) ||
        (d.aCuraDi !== 'imprenditore' && d.aCuraDi !== 'esperto')
      ) {
        return (
          `Struttura non valida nella sezione "${sezione.numero}": ogni domanda deve avere id, ` +
          'testo, peso STRUTTURALE/RILEVANTE/DOCUMENTALE e a cura di imprenditore/esperto.'
        );
      }
      const id = d.id.trim();
      if (!id) return `Nella sezione "${sezione.numero}" c'è una domanda senza id.`;
      if (!d.domanda.trim()) return `La domanda "${id}" non ha testo.`;
      if (idVisti.has(id)) {
        return `L'id di domanda "${id}" è usato più volte: ogni domanda deve avere un id unico.`;
      }
      idVisti.add(id);
    }
  }
  return null;
}

export function validaSezioniChecklist(valore: unknown): valore is SezioneChecklist[] {
  return erroreSezioniChecklist(valore) === null;
}
