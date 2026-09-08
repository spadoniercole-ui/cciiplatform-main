// src/lib/origineProposta.ts
//
// Origini ammesse per ciascun tipo di proposta che determina uno Scenario.
// In un file separato (non 'use server') perché i file "use server"
// possono esportare solo funzioni async: una costante qui dentro fa
// fallire la build (stesso principio già visto con RUOLI_ADMIN_SPAZIO).

export type TipoProposta = 'RICEVUTA' | 'DA_DEFINIRE';

export const ORIGINI_PER_TIPO: Record<TipoProposta, string[]> = {
  // Uno spazio ENTE riceve sempre — "Ente" come origine non avrebbe
  // senso (l'ente non può ricevere una proposta da se stesso): chi
  // trasmette la proposta è l'azienda debitrice direttamente, oppure il
  // Tribunale (in sede di omologazione forzosa / cram down).
  RICEVUTA: ['Azienda', 'Tribunale'],
  DA_DEFINIRE: ['Studio', 'Professionista', 'Azienda'],
};
