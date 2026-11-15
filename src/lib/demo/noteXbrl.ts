// src/lib/demo/noteXbrl.ts
//
// LE NOTE INTEGRATIVE DELLA DEMO (0.232.0).
//
// Il seed caricava il bilancio XBRL con i soli dati di sintesi: `note_fatti`
// restava vuoto e il Piano-ponte — che si appoggia alle note per allineare il
// bilancio alla data della verifica — non aveva nulla da leggere. La demo
// mostrava un'azione che funziona a metà senza dirlo.
//
// Le note vivono in un solo posto, `noteIntegrative.json`, che il generatore
// dei file usa per scrivere l'istanza XBRL e il seed per salvarla in
// `note_fatti`: quello che si salva è quello che c'è nel file, per costruzione.
// Il file XBRL resta la fonte dell'impronta; se non è leggibile, l'impronta si
// calcola sulle note e il dato è dichiarato per quello che è.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pulisciTag } from '@/lib/xbrl/parser';
import type { FactTestuale } from '@/lib/xbrl/types';
import { documentiDemoPerAzienda } from './documenti';
import NOTE_DEMO from './noteIntegrative.json';

export interface NoteDemo {
  fatti: FactTestuale[];
  /** Impronta del file da cui sono lette, o delle note se il file non è leggibile. */
  impronta: string;
  nomeFile: string;
  /** true se l'impronta è quella delle note e non del file XBRL. */
  improntaDalleNote: boolean;
}

/**
 * Le note integrative demo, nell'ordine in cui stanno nell'istanza. Non
 * dipendono dalla lettura del disco: il seed gira anche dove i file statici non
 * sono nel filesystem della funzione.
 */
export function noteIntegrativeDemoPer(ragioneSociale: string, anno?: number): NoteDemo {
  const fatti: FactTestuale[] = NOTE_DEMO.map((n, i) => ({
    tagPulito: pulisciTag(n.tag),
    tagOriginale: `itcc-ci:${n.tag}`,
    contextRef: anno ? `C${anno}` : 'C2025',
    testo: n.testo,
    lingua: 'it',
    ordine: i,
  }));

  const istanza = documentiDemoPerAzienda(ragioneSociale, '.xbrl')[0];
  const improntaNote = createHash('sha256').update(JSON.stringify(NOTE_DEMO), 'utf8').digest('hex');
  if (!istanza) {
    return {
      fatti,
      impronta: improntaNote,
      nomeFile: 'note-demo.json',
      improntaDalleNote: true,
    };
  }
  try {
    const xml = readFileSync(join(process.cwd(), 'public', istanza.percorso), 'utf8');
    return {
      fatti,
      impronta: createHash('sha256').update(xml, 'utf8').digest('hex'),
      nomeFile: istanza.nome,
      improntaDalleNote: false,
    };
  } catch {
    return {
      fatti,
      impronta: improntaNote,
      nomeFile: istanza.nome,
      improntaDalleNote: true,
    };
  }
}
