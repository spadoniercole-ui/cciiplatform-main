// src/lib/lavorazioni/dipendenze.ts
//
// UN UFFICIO, UN NOME.
//
// La dipendenza di una materia è l'ufficio a cui si manda il debito da
// lavorare. È un testo libero, e finora si scriveva in tre punti diversi: la
// lavorazione della materia, il titolo del codice e la vecchia tabella per
// tipologia di debito. Con lo stesso ufficio scritto tre volte — «Presidio dei
// flussi informativi», «PRESIDIO FLUSSI INFORMATIVI», «Presidio qualità flussi
// informativi» — le posizioni di un solo ufficio si dividevano in tre
// documenti, e nessuno si accorgeva che erano lo stesso destinatario.
//
// QUI SI DECIDE SOLO UNA COSA: quando due nomi sono LO STESSO ufficio. Non si
// indovina il significato e non si riscrive la configurazione dell'ente: si
// confronta la forma (maiuscole, accenti, apostrofi, punteggiatura e spazi non
// contano) e si riconoscono i nomi compatibili — quelli che, tolti gli
// articoli, dicono le stesse parole. La seconda cosa non unisce nulla: serve a
// DIRLO, perché due uffici diversi che si chiamano quasi uguale vanno
// districati da chi configura, non dalla piattaforma.
//
// Perché non unire anche i nomi compatibili. «Ufficio legale» e «Ufficio
// legale Milano» possono essere lo stesso ufficio o due sedi che rispondono a
// pratiche diverse. Unire d'ufficio manderebbe i debiti di una sede all'altra,
// e nessuno saprebbe che è successo: un avviso costa un clic, un documento
// sbagliato costa una contestazione.

/** Spazi compattati e bordi tolti: «Ufficio  legale » → «Ufficio legale». */
export function nomeDipendenza(nome: string | null | undefined): string {
  return (nome ?? '').replace(/\s+/g, ' ').trim();
}

/** Maiuscole, accenti, apostrofi e punteggiatura non distinguono due uffici. */
export function chiaveDipendenza(nome: string | null | undefined): string {
  return nomeDipendenza(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Gli articoli e le preposizioni che non dicono nulla dell'ufficio: due nomi
 * che differiscono solo per questi sono lo stesso nome scritto in due modi.
 */
const PAROLE_VUOTE = new Set([
  'DI',
  'DE',
  'DEL',
  'DELLO',
  'DELLA',
  'DEI',
  'DEGLI',
  'DELLE',
  'DA',
  'DAL',
  'DALLO',
  'DALLA',
  'DAI',
  'DAGLI',
  'DALLE',
  'IL',
  'LO',
  'LA',
  'I',
  'GLI',
  'LE',
  'L',
  'UN',
  'UNO',
  'UNA',
  'E',
  'ED',
]);

/** Le parole che restano quando si tolgono articoli e preposizioni. */
function paroleSignificative(chiave: string): string[] {
  return chiave.split(' ').filter((p) => p !== '' && !PAROLE_VUOTE.has(p));
}

/**
 * I nomi già configurati, senza doppioni, nella grafia in cui sono stati
 * scritti la prima volta. È l'elenco che l'interfaccia propone: scegliere da
 * qui è il modo per non riscrivere lo stesso ufficio con un altro nome.
 */
export function registroDipendenze(
  fonti: Iterable<string | null | undefined>
): { nome: string; chiave: string }[] {
  const perChiave = new Map<string, { nome: string; chiave: string }>();
  for (const fonte of fonti) {
    const nome = nomeDipendenza(fonte);
    if (!nome) continue;
    const chiave = chiaveDipendenza(nome);
    if (!chiave || perChiave.has(chiave)) continue;
    perChiave.set(chiave, { nome, chiave });
  }
  return Array.from(perChiave.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'it-IT'));
}

/**
 * La grafia già in uso per lo stesso ufficio, se c'è.
 *
 * Serve a salvare «ufficio legale» come «Ufficio Legale» quando quella grafia
 * esiste già: il dato vecchio e quello nuovo finiscono così nello stesso
 * documento, senza che nessuno debba ricordarsi come si scriveva.
 */
export function grafiaGiaUsata(
  nome: string | null | undefined,
  registro: { nome: string; chiave: string }[]
): string | null {
  const pulito = nomeDipendenza(nome);
  if (!pulito) return null;
  const chiave = chiaveDipendenza(pulito);
  return registro.find((r) => r.chiave === chiave)?.nome ?? null;
}

/**
 * I gruppi di nomi che sembrano lo stesso ufficio pur essendo scritti
 * diversamente. Solo gli uffici con almeno due parole significative: «Ufficio»
 * e «Ufficio legale» non sono un gruppo, «Presidio flussi informativi» e
 * «Presidio qualità flussi informativi» sì.
 */
export function dipendenzeSosia(nomi: Iterable<string | null | undefined>): string[][] {
  const perChiave = new Map<string, string>();
  for (const fonte of nomi) {
    const nome = nomeDipendenza(fonte);
    if (!nome) continue;
    const chiave = chiaveDipendenza(nome);
    if (chiave && !perChiave.has(chiave)) perChiave.set(chiave, nome);
  }
  const voci = Array.from(perChiave.entries())
    .map(([chiave, nome]) => ({
      nome,
      parole: new Set(paroleSignificative(chiave)),
    }))
    .filter((v) => v.parole.size >= 2);

  const gruppi: string[][] = [];
  const assegnati = new Set<string>();
  for (const a of voci) {
    if (assegnati.has(a.nome)) continue;
    const gruppo = [a.nome];
    for (const b of voci) {
      if (b.nome === a.nome || assegnati.has(b.nome)) continue;
      if (sottoinsieme(a.parole, b.parole) || sottoinsieme(b.parole, a.parole)) {
        gruppo.push(b.nome);
        assegnati.add(b.nome);
      }
    }
    if (gruppo.length > 1) {
      for (const nome of gruppo) assegnati.add(nome);
      gruppi.push(gruppo.sort((x, y) => x.localeCompare(y, 'it-IT')));
    }
  }
  return gruppi;
}

function sottoinsieme(a: Set<string>, b: Set<string>): boolean {
  for (const parola of a) if (!b.has(parola)) return false;
  return true;
}
