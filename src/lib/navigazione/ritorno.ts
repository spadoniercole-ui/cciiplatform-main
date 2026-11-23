// LA VIA DEL RITORNO.
//
// Il triage rimanda ai Parametri per una ragione precisa: manca l'ufficio di una
// materia, una soglia, una lavorazione. Chi ci va si trova dentro una gestione
// — e ogni pagina di quella gestione aveva come unica uscita «Torna a Parametri
// di Spazio». Fine del giro: la verifica appena lasciata non si ritrovava più,
// e per tornarci bisognava ricostruire l'URL a mano.
//
// Il rimando porta perciò con sé la pagina da cui è partito (`?ritorno=…`), e
// l'uscita dei Parametri punta lì. Le regole sono due, e sono entrambe di
// sicurezza: si accettano solo percorsi interni allo spazio di chi naviga, e
// niente catene — un `ritorno` dentro un `ritorno` non si segue.

export const PARAMETRO_RITORNO = 'ritorno';

/**
 * Lo stesso link con l'indicazione di dove tornare.
 *
 * Non tocca la query già presente (`?materia=3` resta) e non raddoppia il
 * parametro: un link che ne porta già uno viene riscritto, non accodato.
 */
export function conRitorno(href: string, ritorno: string | null | undefined): string {
  if (!ritorno) return href;
  const separatore = href.indexOf('?');
  const percorso = separatore === -1 ? href : href.slice(0, separatore);
  const parametri = new URLSearchParams(separatore === -1 ? '' : href.slice(separatore + 1));
  parametri.set(PARAMETRO_RITORNO, ritorno);
  const query = parametri.toString();
  return query === '' ? percorso : `${percorso}?${query}`;
}

/** Dove si torna quando il link non dice nulla, o dice qualcosa che non va. */
export function destinazionePredefinita(codice: string): string {
  return `/spazio/${codice}/parametri`;
}

/**
 * Il percorso di ritorno, se è lecito; altrimenti la dashboard dei Parametri.
 *
 * Un `ritorno` che punta fuori dallo spazio corrente non si segue: sarebbe un
 * salto in un altro ente, cioè in dati che chi naviga non ha chiesto e non può
 * vedere. Un `ritorno` che contiene a sua volta un `ritorno` viene scartato:
 * le catene di ritorni non servono e si prestano a rimbalzi senza uscita.
 */
export function percorsoRitorno(valore: string | string[] | undefined, codice: string): string {
  const predefinito = destinazionePredefinita(codice);
  const grezzo = Array.isArray(valore) ? valore[0] : valore;
  if (!grezzo) return predefinito;
  const pulito = grezzo.trim();
  // Solo percorsi relativi: niente `//host` (protocollo-relativo) né URL assoluti.
  if (!pulito.startsWith('/') || pulito.startsWith('//')) return predefinito;
  // Niente spazi o caratteri di controllo: un percorso si compone, non si inventa.
  if (/[\s\\]/.test(pulito)) return predefinito;
  if (new URLSearchParams(pulito.split('?')[1] ?? '').has(PARAMETRO_RITORNO)) return predefinito;

  const percorso = pulito.split('?')[0];
  const radice = `/spazio/${codice}`;
  if (percorso !== radice && !percorso.startsWith(`${radice}/`)) return predefinito;
  // La dashboard dei Parametri non è un ritorno utile: sarebbe il giro a vuoto
  // da cui si viene.
  if (percorso === `${radice}/parametri`) return predefinito;
  return pulito;
}

/** L'elenco Aziende: la porta d'ingresso alle posizioni, e il ripiego dell'uscita. */
export function destinazioneAziende(codice: string): string {
  return `/spazio/${codice}/aziende`;
}

/**
 * L'uscita dalla scheda azienda: dove si è entrati, altrimenti l'elenco Aziende.
 *
 * La scheda si apre da più punti — l'elenco Aziende, la griglia delle
 * iconografie, la verifica amministrativa — e chi entra porta con sé la sua
 * origine (`?ritorno=…`). Le regole sono quelle di `percorsoRitorno`: solo
 * percorsi dello spazio di chi naviga, niente catene. Cambia il ripiego: chi
 * non ha un'origine riconoscibile non finisce nei Parametri (che non sono una
 * porta della scheda), ma nell'elenco delle aziende.
 */
export function percorsoRitornoAziende(
  valore: string | string[] | null | undefined,
  codice: string
): string {
  const elenco = destinazioneAziende(codice);
  const percorso = percorsoRitorno(valore ?? undefined, codice);
  // `percorsoRitorno` ripiega sui Parametri: quel valore non è un'origine,
  // è l'assenza di un'origine.
  return percorso === destinazionePredefinita(codice) ? elenco : percorso;
}

/** Dove porta l'uscita della scheda, detto per nome. */
export function etichettaUscitaScheda(destinazione: string, codice: string): string {
  const percorso = destinazione.split('?')[0];
  const base = `/spazio/${codice}`;
  if (percorso === base) return 'Torna alla dashboard';
  if (percorso === destinazioneAziende(codice)) return 'Torna alle aziende';
  if (percorso === `${base}/ritratti`) return 'Torna alle iconografie';
  if (percorso === `${base}/verifica-salute` || percorso.startsWith(`${base}/verifica-salute/`))
    return 'Torna alla verifica amministrativa';
  if (
    percorso === `${base}/verifica-contabile` ||
    percorso.startsWith(`${base}/verifica-contabile/`)
  )
    return 'Torna alla verifica contabile';
  if (percorso === `${base}/verifica-azienda` || percorso.startsWith(`${base}/verifica-azienda/`))
    return 'Torna alla verifica aziendale';
  return 'Torna alle aziende';
}

/** L'etichetta dice dove si torna, non «indietro». */
export function etichettaRitorno(destinazione: string, codice: string): string {
  if (destinazione === destinazionePredefinita(codice)) return 'Torna a Parametri di Spazio';
  if (destinazione.includes('/verifica-salute')) return 'Torna alla verifica';
  if (destinazione.includes('/aziende/')) return "Torna alla scheda dell'azienda";
  return 'Torna alla pagina precedente';
}
