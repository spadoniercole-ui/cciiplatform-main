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

export function validaSezioniChecklist(valore: unknown): valore is SezioneChecklist[] {
  // Un array vuoto è valido: un modello nasce con nome e descrizione,
  // zero sezioni ("guscio"), e si riempie dopo con l'export/import Excel
  // — non deve bloccare la creazione iniziale.
  if (!Array.isArray(valore)) return false;
  return valore.every(
    (sezione) =>
      sezione &&
      typeof sezione.numero === 'string' &&
      typeof sezione.titolo === 'string' &&
      Array.isArray(sezione.domande) &&
      sezione.domande.every(
        (d: any) =>
          d &&
          typeof d.id === 'string' &&
          typeof d.domanda === 'string' &&
          PESI_VALIDI.includes(d.peso) &&
          (d.aCuraDi === 'imprenditore' || d.aCuraDi === 'esperto')
      )
  );
}
