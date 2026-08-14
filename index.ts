'use server';

// Modello BASE della Check List Ministeriale — il seme da cui ogni NUOVO
// spazio parte alla prima apertura della propria Check List (vedi
// checklistConfig.ts). Prima era editabile dal superadmin via un
// textarea JSON grezzo: rimosso — le 56 domande sono un riferimento
// normativo (Sezione II del decreto ministeriale), non un parametro
// commerciale da poter alterare in produzione con un editor di testo.
// Se il decreto cambia, si aggiorna CHECKLIST_MINISTERIALE nel codice
// (una modifica tracciata, verificata, non un campo di testo libero) —
// lo snapshot per-spazio (checklist_ministeriale_snapshot) continua a
// funzionare esattamente come prima, semplicemente attinge sempre da qui
// invece che da una copia nel database.

import { CHECKLIST_MINISTERIALE, type SezioneChecklist } from '@/lib/checklist/ministeriale';

export interface RisultatoModelloBase {
  success: boolean;
  sezioni: SezioneChecklist[];
}

export async function ottieniModelloBase(): Promise<RisultatoModelloBase> {
  return { success: true, sezioni: CHECKLIST_MINISTERIALE };
}
