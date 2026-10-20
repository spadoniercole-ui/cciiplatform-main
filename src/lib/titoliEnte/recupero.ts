// src/lib/titoliEnte/recupero.ts
//
// ATTIVITÀ DI RECUPERO DEL CREDITO — il «come si incassa», accanto al «che
// cosa lo fonda» e al «chi lo lavora».
//
// Il titolo di credito dice il fatto e la norma (denuncia non versata, nota di
// rettifica, verbale, diffida, cartella) e la materia dice il presupposto. Qui
// l'ente scrive la PROCEDURA che i suoi uffici seguono davvero per recuperare
// quel credito, numerata a mano: verificare la notifica, correggere il conto
// del lavoratore, controllare la proposta VIG su importo, periodo e codice
// fiscale, contabilizzare. È un campo libero, non una macchina a stati: le
// procedure degli enti non stanno in un elenco chiuso di passi, e imporre uno
// schema costringerebbe a mentire.
//
// PERCHÉ LE FUNZIONI SONO QUI E NON NEL COMPONENTE. Nella fase successiva al
// triage questa procedura viene mostrata, partita per partita, all'operatore
// che deve lavorarla: gli stessi testi devono produrre la stessa sequenza in
// ogni punto dell'applicazione. Interpretare il testo (righe, numerazione,
// righe vuote) è quindi una decisione di dominio, verificabile con i test.
//
// COSA NON FA. Non inventa passi, non riordina, non corregge la numerazione
// scritta dall'ente: si limita a togliere l'involucro (spazi, CR di Windows,
// numerazione e trattini) per poter disegnare un elenco. Un testo senza a capo
// resta un passo solo: meglio un passo lungo che un testo spezzato a caso.
//
// LA DIPENDENZA (0.133.5). Accanto alla procedura sta l'ufficio che la esegue:
// la comunicazione con cui si chiede all'azienda di pagare va indirizzata a
// qualcuno, e quel qualcuno cambia da ente a ente (sede, ufficio recupero
// crediti, ragioneria). È un'indicazione di recapito, non una fonte da
// riscontrare: si salva com'è scritta.

/** Oltre questa soglia la procedura non è più leggibile in un riquadro. */
export const MASSIMO_CARATTERI_ATTIVITA_RECUPERO = 2000;

/** Una dipendenza è un nome d'ufficio, non un testo lungo: sta in una riga. */
export const MASSIMO_CARATTERI_DIPENDENZA = 200;

/** Toglie l'involucro di un passo: numerazione «1.»/«1)», trattino, punto elenco. */
function spogliaNumerazione(riga: string): string {
  return riga.replace(/^\s*(?:\d{1,2}\s*[.)-]|[-–•*])\s*/, '').trim();
}

/**
 * Testo salvabile: righe normalizzate (CRLF → LF), niente spazi o righe vuote
 * ai bordi. `null` quando non c'è nulla da salvare — così «nessuna procedura
 * configurata» ha un solo valore possibile, non tre (null, '', '   ').
 */
export function normalizzaAttivitaRecupero(testo: string | null | undefined): string | null {
  if (testo === null || testo === undefined) return null;
  const righe = testo
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((r) => r.replace(/[ \t]+$/g, ''))
    // Una riga fatta della sola numerazione o del solo trattino non è un passo.
    .filter((r) => spogliaNumerazione(r) !== '');
  if (righe.length === 0) return null;
  return righe.join('\n').trim();
}

/**
 * I passi, nell'ordine scritto dall'ente. La numerazione iniziale («1.»,
 * «2)», «-», «•») viene tolta perché l'elenco la ridisegna da sé: se restasse,
 * a schermo si leggerebbe «1. 1. Verificare…». Un testo su una riga sola è un
 * passo solo.
 */
export function passiAttivitaRecupero(testo: string | null | undefined): string[] {
  const normalizzato = normalizzaAttivitaRecupero(testo);
  if (!normalizzato) return [];
  return normalizzato
    .split('\n')
    .map(spogliaNumerazione)
    .filter((riga) => riga !== '');
}

/** Errore da mostrare all'utente, oppure null. Il testo vuoto è ammesso. */
export function validaAttivitaRecupero(testo: string | null | undefined): string | null {
  const normalizzato = normalizzaAttivitaRecupero(testo);
  if (normalizzato === null) return null;
  if (normalizzato.length > MASSIMO_CARATTERI_ATTIVITA_RECUPERO)
    return `La procedura non può superare ${MASSIMO_CARATTERI_ATTIVITA_RECUPERO} caratteri.`;
  return null;
}

/**
 * L'ufficio a cui indirizzare la comunicazione, in una riga sola: spazi e a capo
 * diventano uno spazio, i bordi si tolgono. `null` quando non c'è nulla, così
 * «dipendenza non indicata» ha un solo valore possibile.
 */
export function normalizzaDipendenza(testo: string | null | undefined): string | null {
  if (testo === null || testo === undefined) return null;
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito === '' ? null : pulito;
}

/** Errore da mostrare all'utente, oppure null. Il campo vuoto è ammesso. */
export function validaDipendenza(testo: string | null | undefined): string | null {
  const normalizzato = normalizzaDipendenza(testo);
  if (normalizzato === null) return null;
  if (normalizzato.length > MASSIMO_CARATTERI_DIPENDENZA)
    return `La dipendenza non può superare ${MASSIMO_CARATTERI_DIPENDENZA} caratteri.`;
  return null;
}

/**
 * Il testo da mostrare accanto al codice: i passi in linea, o una frase che
 * dice che manca. Vuoto quando non c'è nulla da dire (il chiamante decide se
 * mostrare la riga).
 */
export function riassuntoAttivitaRecupero(testo: string | null | undefined): string {
  const passi = passiAttivitaRecupero(testo);
  if (passi.length === 0) return '';
  return passi.length === 1 ? '1 passo' : `${passi.length} passi`;
}
