// src/lib/soglie25novies/rapportoAnni.ts
//
// IL RAPPORTO CONTRIBUTI SCADUTI / DOVUTI, ANNO PER ANNO.
//
// La soglia dell'art. 25-novies, comma 1, lett. a) confronta due grandezze
// che vengono da due file diversi dell'istituto:
//
//   - i contributi DOVUTI, dal saldo delle denunce (DM10 / UNIEMENS), che il
//     file scrive periodo per periodo, quindi si sommano per anno;
//   - i contributi SCADUTI e non versati, dalla Lista Inadempienze, che il
//     file scrive partita per partita, con il periodo di competenza.
//
// Finora di questi due numeri si conservava solo l'ultimo: il dovuto
// dell'anno precedente e lo scaduto di oggi. Il resto veniva letto e
// buttato, così il rapporto si poteva leggere in un solo istante — quello
// del triage — e non lungo il tempo. Ma la domanda che si fa a un'azienda
// non è «quanto devi oggi»: è «da quando». Un rapporto che sale dal 12% al
// 34% racconta una storia diversa da un 34% stabile da tre anni, e la
// differenza sta nella serie, non nell'ultimo punto.
//
// ---------------------------------------------------------------------------
// IL TERZO REQUISITO, ACCANTO AL RAPPORTO
//
// La quota, da sola, non dice se la soglia è superata: la lett. a) richiede
// anche che quel debito sia scaduto da OLTRE 90 GIORNI. Due aziende con lo
// stesso 34% possono stare una dentro e una fuori la fattispecie.
//
// Per questo ogni anno porta anche `oltre90`: la parte dei suoi scaduti che
// alla data della verifica era già scaduta da più di 90 giorni. È la stessa
// partizione che il triage usa per la soglia (`partiteInpsPerAnzianita`),
// solo letta per esercizio. ATTENZIONE AL SENSO: il ritardo si misura alla
// data della verifica, quindi per gli esercizi più vecchi il debito è quasi
// sempre interamente oltre i 90 giorni. La riga dice QUALI esercizi
// compongono il debito che supera il requisito temporale, non quando ci sono
// arrivati — e questo va scritto dove la riga si legge.
//
// ---------------------------------------------------------------------------
// LA SERIE DELLE AZIENDE GIÀ VERIFICATE
//
// I file INPS si leggono nel browser e non si conservano sul server: chi ha
// verificato l'azienda prima di questa funzione ha in database solo i valori
// finali, non i due fogli. Da lì si può però ricavare una serie parziale —
// i contributi scaduti per esercizio stanno nelle posizioni del triage (tre
// anni), il dovuto dell'anno precedente nella scheda — e vale la pena
// mostrarla, dichiarando che è ricostruita, invece di lasciare la scheda
// vuota fino al prossimo caricamento. `serieDaPosizioni` e
// `serieDaValoriConservati` fanno questo; nessuna delle due inventa un lato
// che non c'è.
//
// QUI SI CALCOLA SOLO IL RAPPORTO. Non è il test della norma: quello
// richiede anche il ritardo di oltre 90 giorni e, con lavoratori, i 15.000
// euro. Una quota sopra il 30% non è una soglia superata, ed è per questo
// che il campo si chiama `oltreQuota` e non `violato`: il semaforo resta in
// `calcolo.ts`, dove i requisiti sono congiunti.
//
// NIENTE ZERI INVENTATI. Un anno presente in un file e assente nell'altro
// resta con il lato mancante a null: il rapporto non si calcola. Sul caso
// reale del 2022 il DM10 porta il dovuto e le inadempienze non portano
// nulla, e scrivere «0 su 385.200» direbbe che l'azienda era in regola
// mentre il file semplicemente non copriva quella partita.

import { SOGLIE_25NOVIES } from './calcolo';

/** I due lati del rapporto per un anno. `null` = il file non ne parla. */
export interface ContributiAnno {
  anno: number;
  dovuti: number | null;
  scaduti: number | null;
  /**
   * Dei `scaduti` di questo anno, la parte scaduta da oltre 90 giorni alla
   * data della verifica. `null` = non misurata (anno ricostruito, o file
   * senza date).
   */
  oltre90?: number | null;
}

export interface RapportoAnno extends ContributiAnno {
  /** scaduti / dovuti, in forma decimale (0.34 = 34%); null se non calcolabile. */
  quota: number | null;
  /** La quota supera il 30%: NON è la soglia dell'art. 25-novies. */
  oltreQuota: boolean | null;
  /**
   * Il requisito temporale della lett. a) è integrato per questo esercizio?
   * null = il ritardo di quell'anno non è stato misurato.
   */
  ritardoOltre90: boolean | null;
}

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function somma(valori: readonly (number | null)[]): number | null {
  const buoni = valori.filter(finito);
  return buoni.length === 0 ? null : buoni.reduce((s, v) => s + v, 0);
}

/**
 * Unisce i due anni letti dai file in una serie unica, ordinata.
 *
 * Un anno che compare in uno solo dei due file entra lo stesso, con l'altro
 * lato a null: è un'informazione (il file esisteva ma non copriva l'anno),
 * non un dato da scartare.
 *
 * `oltre90` è il terzo lato, facoltativo: gli anni per cui il ritardo non è
 * stato misurato restano a null.
 */
export function unisciContributiPerAnno(
  dovuti: Record<number, number>,
  scaduti: Record<number, number>,
  oltre90: Record<number, number> = {}
): ContributiAnno[] {
  const anni = new Set<number>(
    [...Object.keys(dovuti), ...Object.keys(scaduti), ...Object.keys(oltre90)].map(Number)
  );
  return [...anni]
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b)
    .map((anno) => ({
      anno,
      dovuti: finito(dovuti[anno]) ? dovuti[anno] : null,
      scaduti: finito(scaduti[anno]) ? scaduti[anno] : null,
      oltre90: finito(oltre90[anno]) ? oltre90[anno] : null,
    }));
}

/**
 * Il rapporto per ciascun anno, con la quota di legge.
 *
 * Con dovuti a zero o negativi il rapporto non esiste — dividere darebbe
 * infinito, e mostrarlo come «oltre soglia» sarebbe un errore di segno
 * opposto a quello che i dati dicono.
 */
export function rapportiPerAnno(
  anni: readonly ContributiAnno[],
  sogliaQuota: number = SOGLIE_25NOVIES.inpsPercentuale
): RapportoAnno[] {
  return [...anni]
    .sort((a, b) => a.anno - b.anno)
    .map(({ anno, dovuti, scaduti, oltre90 }) => {
      const ritardo = oltre90 === null || oltre90 === undefined ? null : oltre90 > 0;
      const base = { anno, dovuti, scaduti, oltre90: oltre90 ?? null, ritardoOltre90: ritardo };
      if (dovuti === null || scaduti === null || !(dovuti > 0))
        return { ...base, quota: null, oltreQuota: null };
      const quota = scaduti / dovuti;
      return { ...base, quota, oltreQuota: quota > sogliaQuota };
    });
}

/** La posizione debitoria del triage, nella forma che serve qui. */
export interface PosizionePerAnno {
  categoria: string;
  importoAnnoCorrente: number | null;
  importoAnnoPrecedente: number | null;
  importoAnnoMeno2: number | null;
  riferimentoAnnoPrecedente: number | null;
}

/** I tre anni del triage, ricavati dalla data di verifica. */
export interface AnniTriage {
  corrente: number;
  precedente: number;
  meno2: number;
}

/**
 * I tre anni del triage da una data di verifica (AAAA-MM-GG).
 *
 * `null` quando la data non si legge: senza una data gli anni non si
 * attribuiscono, e attribuirli a caso scriverebbe debiti nell'esercizio
 * sbagliato.
 */
export function anniDellaVerifica(data: string | Date | null | undefined): AnniTriage | null {
  if (!data) return null;
  const d = data instanceof Date ? data : new Date(`${String(data).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const a = d.getUTCFullYear();
  return { corrente: a, precedente: a - 1, meno2: a - 2 };
}

/**
 * La serie ricostruita dalle POSIZIONI del triage.
 *
 * Le posizioni previdenziali portano il debito dei tre anni del triage e,
 * come termine di paragone, i contributi dovuti dell'anno precedente: è la
 * stessa informazione dei file, già ridotta a numeri e conservata in
 * database. Non contiene il ritardo oltre 90 giorni, che resta a null.
 *
 * Una categoria senza righe valorizzate non produce l'anno: un'assenza non
 * diventa uno zero.
 */
export function serieDaPosizioni(
  righe: readonly PosizionePerAnno[],
  anni: AnniTriage
): ContributiAnno[] {
  const prev = righe.filter((r) => r.categoria === 'PREVIDENZIALE');
  const perCampo = (campo: 'importoAnnoCorrente' | 'importoAnnoPrecedente' | 'importoAnnoMeno2') =>
    somma(prev.map((r) => r[campo]));

  const dovuti: Record<number, number> = {};
  const riferimento = somma(prev.map((r) => r.riferimentoAnnoPrecedente));
  if (riferimento !== null) dovuti[anni.precedente] = riferimento;

  const scaduti: Record<number, number> = {};
  const corrente = perCampo('importoAnnoCorrente');
  const precedente = perCampo('importoAnnoPrecedente');
  const meno2 = perCampo('importoAnnoMeno2');
  if (corrente !== null) scaduti[anni.corrente] = corrente;
  if (precedente !== null) scaduti[anni.precedente] = precedente;
  if (meno2 !== null) scaduti[anni.meno2] = meno2;

  return unisciContributiPerAnno(dovuti, scaduti);
}

/**
 * La serie ricostruita dai VALORI conservati nell'azienda, quando le
 * posizioni del triage non ci sono.
 *
 * Sono i due numeri che la scheda Soglie ha sempre avuto: il dovuto
 * dell'anno precedente e i contributi scaduti certificati a una certa data.
 * Il dovuto si attribuisce all'anno che la scheda dichiara; lo scaduto
 * all'anno della verifica, perché è a quella data che l'importo è
 * certificato — non all'anno di competenza, che il dato conservato non dice.
 *
 * Per questo i due lati possono cadere su anni diversi e il rapporto non si
 * calcola: meglio una serie parziale dichiarata che un rapporto inventato.
 */
export function serieDaValoriConservati(valori: {
  annoDovuti: number | null;
  dovuti: number | null;
  annoScaduti: number | null;
  scaduti: number | null;
}): ContributiAnno[] {
  const dovuti: Record<number, number> = {};
  const scaduti: Record<number, number> = {};
  if (valori.annoDovuti !== null && finito(valori.annoDovuti) && finito(valori.dovuti))
    dovuti[valori.annoDovuti] = valori.dovuti;
  if (valori.annoScaduti !== null && finito(valori.annoScaduti) && finito(valori.scaduti))
    scaduti[valori.annoScaduti] = valori.scaduti;
  return unisciContributiPerAnno(dovuti, scaduti);
}

/**
 * La serie ricostruita da ciò che il triage ha già scritto in database.
 *
 * Prima le posizioni previdenziali (tre anni di scaduti e il dovuto
 * dell'anno precedente), perché sono più vicine ai file; se non ce ne sono,
 * i due valori conservati nella scheda Soglie. Nessuna delle due strade
 * inventa il lato che manca, e nessuna porta il ritardo oltre 90 giorni:
 * per questo `origine` esiste — una serie ricostruita va dichiarata, non
 * presentata come lettura dei file.
 */
export function serieRicostruita(dati: {
  giorno: string | null;
  posizioni: readonly PosizionePerAnno[];
  annoDovuti: number | null;
  dovuti: number | null;
  annoScaduti: number | null;
  scaduti: number | null;
}): { anni: ContributiAnno[]; origine: 'posizioni' | 'valori' | null } {
  const anniTriage = anniDellaVerifica(dati.giorno);
  const daPosizioni = anniTriage ? serieDaPosizioni(dati.posizioni, anniTriage) : [];
  if (daPosizioni.length > 0) return { anni: daPosizioni, origine: 'posizioni' };

  const daValori = serieDaValoriConservati({
    annoDovuti: dati.annoDovuti,
    dovuti: dati.dovuti,
    annoScaduti: dati.annoScaduti,
    scaduti: dati.scaduti,
  });
  return { anni: daValori, origine: daValori.length > 0 ? 'valori' : null };
}

/** Un'azienda dello spazio, con ciò che serve a ricostruirne la serie. */
export interface AziendaDaRicalcolare {
  id: number;
  /** La serie già letta dai file: se c'è, non si tocca. */
  anniDaiFile: ContributiAnno[];
  giorno: string | null;
  posizioni: readonly PosizionePerAnno[];
  annoDovuti: number | null;
  dovuti: number | null;
  annoScaduti: number | null;
  scaduti: number | null;
}

/** Ciò che il ricalcolo d'ufficio scrive in database per un'azienda. */
export interface AggiornamentoSerie {
  aziendaId: number;
  anni: ContributiAnno[];
  origine: 'posizioni' | 'valori';
}

/**
 * Il piano del ricalcolo d'ufficio: per ogni azienda, la serie da scrivere.
 *
 * Le aziende con una serie letta dai file restano fuori anche quando quella
 * ricostruibile sarebbe più lunga: i file sono la fonte, e una ricostruzione
 * non li sostituisce. Chi non ha abbastanza dati non produce una riga — non
 * si scrive una serie vuota al posto di un'assenza.
 */
export function pianoRicalcoloSerie(
  aziende: readonly AziendaDaRicalcolare[]
): AggiornamentoSerie[] {
  const piano: AggiornamentoSerie[] = [];
  for (const a of aziende) {
    if (a.anniDaiFile.length > 0) continue;
    const { anni, origine } = serieRicostruita(a);
    if (anni.length === 0 || origine === null) continue;
    piano.push({ aziendaId: a.id, anni, origine });
  }
  return piano;
}

/**
 * Lettura difensiva del valore JSON salvato in `aziende.contributi_per_anno`.
 *
 * Il driver Postgres può restituire l'oggetto già decodificato oppure la
 * stringa: entrambe le forme sono normali, e un valore illeggibile deve
 * produrre una serie vuota — non un errore che blocca la scheda Indici.
 */
export function contributiPerAnnoDaDb(valore: unknown): ContributiAnno[] {
  let dati: unknown = valore;
  if (typeof dati === 'string') {
    try {
      dati = JSON.parse(dati);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(dati)) return [];
  const numero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const out: ContributiAnno[] = [];
  for (const riga of dati) {
    const r = riga as Record<string, unknown>;
    const anno = numero(r?.anno);
    if (anno === null || anno < 1990 || anno > 2100) continue;
    out.push({
      anno,
      dovuti: numero(r.dovuti),
      scaduti: numero(r.scaduti),
      oltre90: numero(r.oltre90),
    });
  }
  return out.sort((a, b) => a.anno - b.anno);
}
