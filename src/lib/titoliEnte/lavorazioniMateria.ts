// src/lib/titoliEnte/lavorazioniMateria.ts
//
// LAVORAZIONI DELLA MATERIA — dove si scriveva una volta per codice, ora si
// scrive una volta per materia.
//
// Il titolo di credito dice che cosa fonda il credito. La materia dice il
// presupposto. Il titolo di una partita è quello della sua materia (0.109.98),
// quindi la procedura con cui si incassa e l'ufficio a cui si scrive sono
// proprietà della materia, non del singolo codice di partita: un ente che
// lavora una «regolarizzazione spontanea» la lavora allo stesso modo su tutti i
// codici che cadono lì.
//
// UN PROCESSO, PIÙ LAVORAZIONI. La materia può portare più righe — verifica del
// messaggio, acquisizione della proposta, contabilizzazione — perché lo stesso
// esito (l'emissione di una diffida, la gestione di una procedura) si raggiunge
// con lavorazioni diverse. Ogni riga ha la sua dipendenza e i suoi passi; la
// prima per ordine è quella che il titolo dell'ente eredita.
//
// IL CODICE VINCE. Se un codice ha una sua dipendenza o una sua procedura,
// quella resta: la materia è la predefinita, non una gabbia. La provenienza del
// valore si può dire (dalla materia, oppure propria del codice) e l'interfaccia
// lo mostra, così nessuno crede di aver perso quello che aveva scritto.
//
// Perché non le direttrici dello screening: quelle sono il questionario, questa
// è l'esecuzione. Tenerle separate permette di aggiungere campi di
// qualificazione alla lavorazione senza toccare né il questionario né i titoli.

import type { TitoloEnte } from './titoli';
import {
  normalizzaAttivitaRecupero,
  normalizzaDipendenza,
  validaAttivitaRecupero,
  validaDipendenza,
} from './recupero';

/** Una lavorazione è un nome, non un testo: sta in una riga. */
export const MASSIMO_CARATTERI_TIPOLOGIA = 200;

/** L'esito è un'etichetta («diffida», «procedura di recupero»), non una nota. */
export const MASSIMO_CARATTERI_ESITO = 200;

export interface LavorazioneMateria {
  id: number;
  /** La materia in cui il codice cade: è la chiave dell'associazione. */
  materiaId: number;
  /** Quale lavorazione del processo: «emissione diffida», «verifica del flusso». */
  tipologia: string;
  /** L'ufficio a cui indirizzare la comunicazione con cui si chiede il pagamento. */
  dipendenza: string | null;
  /** I passi, un passo per riga, nell'ordine in cui l'ufficio li esegue. */
  procedura: string | null;
  /** Che cosa produce la lavorazione: «diffida», «procedura di recupero». */
  esito: string | null;
  /** Ordine di lavorazione: la prima per ordine è quella che il titolo eredita. */
  ordine: number;
}

export interface InputLavorazioneMateria {
  id?: number | null;
  materiaId: number;
  tipologia: string;
  dipendenza: string | null;
  procedura: string | null;
  esito: string | null;
}

const esiste = (v: string | null | undefined): v is string => !!v && v.trim() !== '';

/** Testo su una riga sola: spazi e a capo compattati, bordi tolti, `null` se vuoto. */
function unaRiga(testo: string | null | undefined): string | null {
  if (testo === null || testo === undefined) return null;
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito === '' ? null : pulito;
}

export function normalizzaTipologia(testo: string | null | undefined): string {
  return unaRiga(testo) ?? '';
}

export function normalizzaEsito(testo: string | null | undefined): string | null {
  return unaRiga(testo);
}

/** Errore da mostrare all'utente, oppure null. Tipologia e materia obbligatorie. */
export function validaLavorazioneMateria(input: InputLavorazioneMateria): string | null {
  if (!Number.isInteger(input.materiaId) || input.materiaId <= 0)
    return 'Scegli la materia della lavorazione.';
  const tipologia = normalizzaTipologia(input.tipologia);
  if (!tipologia) return 'Indica la lavorazione: è il nome che la distingue nella materia.';
  if (tipologia.length > MASSIMO_CARATTERI_TIPOLOGIA)
    return `La lavorazione non può superare ${MASSIMO_CARATTERI_TIPOLOGIA} caratteri.`;
  const esito = normalizzaEsito(input.esito);
  if (esito && esito.length > MASSIMO_CARATTERI_ESITO)
    return `L'esito non può superare ${MASSIMO_CARATTERI_ESITO} caratteri.`;
  return validaDipendenza(input.dipendenza) ?? validaAttivitaRecupero(input.procedura);
}

export function normalizzaLavorazione(input: InputLavorazioneMateria): InputLavorazioneMateria {
  return {
    id: input.id ?? null,
    materiaId: input.materiaId,
    tipologia: normalizzaTipologia(input.tipologia),
    dipendenza: normalizzaDipendenza(input.dipendenza),
    procedura: normalizzaAttivitaRecupero(input.procedura),
    esito: normalizzaEsito(input.esito),
  };
}

/** Le lavorazioni di una materia, nell'ordine in cui si eseguono. */
export function lavorazioniDellaMateria(
  lavorazioni: LavorazioneMateria[],
  materiaId: number | null | undefined
): LavorazioneMateria[] {
  if (!materiaId) return [];
  return lavorazioni
    .filter((l) => l.materiaId === materiaId)
    .sort((a, b) => a.ordine - b.ordine || a.id - b.id);
}

export interface ValoreEffettivo {
  valore: string | null;
  /** true quando il valore non è del codice ma della sua materia. */
  dallaMateria: boolean;
  /** La lavorazione da cui arriva, quando arriva dalla materia. */
  tipologia: string | null;
}

/**
 * Il valore che si legge davvero per un titolo: quello scritto sul codice se
 * c'è, altrimenti il primo della materia (ordine crescente) che lo possiede.
 * Un codice senza materia non eredita nulla.
 */
function valoreEffettivo(
  proprio: string | null | undefined,
  materiaId: number | null | undefined,
  lavorazioni: LavorazioneMateria[],
  campo: 'dipendenza' | 'procedura'
): ValoreEffettivo {
  if (esiste(proprio)) return { valore: proprio, dallaMateria: false, tipologia: null };
  for (const l of lavorazioniDellaMateria(lavorazioni, materiaId)) {
    if (esiste(l[campo])) return { valore: l[campo], dallaMateria: true, tipologia: l.tipologia };
  }
  return { valore: null, dallaMateria: false, tipologia: null };
}

export function dipendenzaEffettiva(
  titolo: Pick<TitoloEnte, 'dipendenza' | 'materiaId'>,
  lavorazioni: LavorazioneMateria[]
): ValoreEffettivo {
  return valoreEffettivo(titolo.dipendenza, titolo.materiaId, lavorazioni, 'dipendenza');
}

export function proceduraEffettiva(
  titolo: Pick<TitoloEnte, 'attivitaRecupero' | 'materiaId'>,
  lavorazioni: LavorazioneMateria[]
): ValoreEffettivo {
  return valoreEffettivo(titolo.attivitaRecupero, titolo.materiaId, lavorazioni, 'procedura');
}
