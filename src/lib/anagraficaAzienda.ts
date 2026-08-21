// src/lib/anagraficaAzienda.ts
//
// Definizione UNICA dei campi che "qualificano" l'azienda e sono quindi
// obbligatori, condivisa tra l'editor (validazione + asterischi) e la barra
// step del layout (semaforo: l'Anagrafica è "verde" solo quando è completa).
// Un solo posto per non avere due idee diverse di "anagrafica completa".

export interface CampoAnagrafica {
  chiave: string;
  label: string;
}

/** Campi obbligatori. Praticamente tutti quelli che qualificano l'azienda:
 * l'unico davvero facoltativo è il numero di sedi secondarie (0 è valido). */
export const CAMPI_OBBLIGATORI_AZIENDA: CampoAnagrafica[] = [
  { chiave: 'ragioneSociale', label: 'Ragione Sociale' },
  { chiave: 'formaGiuridica', label: 'Forma Giuridica' },
  { chiave: 'codiceAteco', label: 'Codice ATECO' },
  { chiave: 'codiceFiscale', label: 'Codice Fiscale' },
  { chiave: 'partitaIva', label: 'Partita IVA' },
  { chiave: 'numeroRea', label: 'Numero REA' },
  { chiave: 'capitaleSociale', label: 'Capitale Sociale' },
  { chiave: 'indirizzoSedeLegale', label: 'Indirizzo' },
  { chiave: 'citta', label: 'Città' },
  { chiave: 'provincia', label: 'Provincia' },
  { chiave: 'cap', label: 'CAP' },
  { chiave: 'rappresentanteLegale', label: 'Rappresentante Legale' },
  { chiave: 'ruoloRappresentanteLegale', label: 'Ruolo del rappresentante' },
  { chiave: 'pec', label: 'PEC' },
];

/** true se un valore (stringa/numero) è considerato "compilato". */
function valorizzato(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return !Number.isNaN(v);
  return String(v).trim().length > 0;
}

/**
 * Verifica che TUTTI i campi obbligatori dell'anagrafica azienda siano
 * valorizzati. Accetta sia l'oggetto Azienda (dal DB) sia lo stato del form.
 */
export function anagraficaAziendaCompleta(dati: Record<string, unknown>): boolean {
  return CAMPI_OBBLIGATORI_AZIENDA.every((c) => valorizzato(dati[c.chiave]));
}

/** Elenco delle sole chiavi obbligatorie non ancora compilate (per messaggi). */
export function campiMancantiAzienda(dati: Record<string, unknown>): string[] {
  return CAMPI_OBBLIGATORI_AZIENDA.filter((c) => !valorizzato(dati[c.chiave])).map((c) => c.label);
}
