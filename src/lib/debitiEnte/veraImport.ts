// Import del file VERA (INPS "DettaglioRichiesta"): legge TUTTE le sezioni
// del foglio indicato, ognuna con la sua natura data dal TITOLO di sezione
// (l'escamotage della colonna-guida applicato al titolo). Browser-safe.
//
// v1: per la verifica certo-per-certo a livello di categoria serve, per ogni
// sezione, la somma dell'importo. La colonna importo si individua per
// etichetta ("Totale debito" → "Importo"/"Residuo" → ultima numerica); la
// voce è la prima colonna testuale. Nessuna mappatura colonna-per-colonna:
// ciò che l'operatore mappa è solo il titolo di sezione → categoria.

import {
  cellaVuota,
  estraiTutteLeSezioni,
  normalizzaEtichetta,
  testoCella,
  type SezioneConTitolo,
} from './tracciatoCore';
import { leggiFoglioAoa, elencoFogli } from './tracciatoExcel';
import { parseNumero } from './tracciatoImport';

const FOGLIO_VERA_DEFAULT = 'Dettaglio Verifica';

function indiceImporto(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  let i = norm.findIndex((h) => h === 'totale debito');
  if (i < 0) i = norm.findIndex((h) => h.includes('importo') || h.includes('residuo'));
  return i;
}

function indiceCredito(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  let i = norm.findIndex((h) => h === 'totale credito');
  if (i < 0) i = norm.findIndex((h) => h.includes('credito'));
  return i;
}

function indiceVoce(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  // La "voce" per VERA è la NATURA dell'omissione (F24 Non presentato, 18 -
  // Verbale Evasione, Denunce non trasmesse…): è ciò che conta per la catena
  // Natura+Stato. Ha PRIORITÀ su Posizione/Gestione, che sono solo identificativi.
  let i = norm.findIndex((h) => /(natura|omission|tipolog)/.test(h));
  if (i < 0) i = norm.findIndex((h) => /(descriz|causale|voce)/.test(h));
  if (i < 0) i = norm.findIndex((h) => /(posizione|gestione)/.test(h));
  return i >= 0 ? i : 0;
}

// Colonna "Stato": la dicitura distingue, DENTRO VERA, i debiti già
// contabilizzati (cella vuota) da quelli NON contabilizzati (cella valorizzata
// — certi ma non ancora esigibili, da lavorare). La dicitura non cambia tra i
// file VERA. Se la colonna manca (es. ADR, Gestione Separata) tutte le righe
// sono contabilizzate.
function indiceStato(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'stato');
}

/**
 * Sezione dei VERSAMENTI (la «Sezione F24» del VERA): elenca i pagamenti
 * fatti, non debiti. Letta come debito produceva righe «voce <matricola>»
 * a importo zero, cioè posizioni potenziali inesistenti.
 */
export function eSezioneVersamenti(intestazioni: string[]): boolean {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.some((h) => h === 'tipo versamento' || h === 'data versamento');
}

function indicePeriodo(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'periodo');
}

function indiceSospeso(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'sospeso');
}

function indiceContributi(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'contributi');
}

function indiceSanzioni(intestazioni: string[]): number {
  const norm = intestazioni.map(normalizzaEtichetta);
  return norm.findIndex((h) => h === 'sanzioni');
}

/**
 * AMBITO della sezione: contributi INPS oppure crediti già affidati all'Agente
 * della Riscossione.
 *
 * La distinzione non è un dettaglio di presentazione: le due poste stanno su
 * due lettere diverse dell'art. 25-novies (la a) per i contributi, la d) per i
 * crediti affidati). Sommarle nella stessa base faceva superare la soglia INPS
 * a un'impresa il cui debito INPS era sotto, e lasciava vuota la soglia
 * dell'Agente pur avendo i numeri nel file.
 *
 * Si riconosce dalle INTESTAZIONI (il V.E.R.A. cambia titolo di sezione tra un
 * export e l'altro) e, in seconda battuta, dal titolo.
 */
export type AmbitoVera = 'INPS' | 'AGENTE_RISCOSSIONE';

// ATTENZIONE: gli stessi criteri sul titolo sono ripetuti nell'UPDATE una
// tantum di `assicuraTabelleVera` (src/db/provision.ts), che riclassifica le
// righe salvate prima della 0.132.0. Se cambiano qui, vanno cambiati anche lì.
export function eSezioneAgenteRiscossione(titolo: string, intestazioni: string[]): boolean {
  const t = normalizzaEtichetta(titolo);
  if (/agente della riscossione|crediti affidati|crediti presso adr|^adr\b/.test(t)) return true;
  const h = intestazioni.map(normalizzaEtichetta);
  // Le sezioni delle cartelle portano il riscosso e gli estremi della cartella;
  // le sezioni contributive no.
  if (h.includes('riscosso') || h.includes('estremi cartella avviso')) return true;
  return h.includes('iscritto') && h.includes('sospeso');
}

export interface SezioneVera {
  titolo: string;
  /** Contributi INPS oppure crediti dell'Agente della Riscossione. */
  ambito: AmbitoVera;
  intestazioni: string[];
  idxImporto: number;
  idxVoce: number;
  numeroRighe: number;
  totale: number;
  righe: {
    voce: string;
    importo: number;
    stato: string;
    periodo?: string;
    /** Quota contributi della riga; null se la sezione non la espone. */
    contributi: number | null;
    /** Quota sanzioni della riga; null se la sezione non la espone. */
    sanzioni: number | null;
  }[];
}

export interface AnalisiVera {
  fogli: string[];
  foglioLetto: string;
  sezioni: SezioneVera[];
  /** Titoli di sezione distinti trovati nel file (normalizzati → label originale). */
  titoli: { norm: string; label: string }[];
}

function sezioneVeraDa(s: SezioneConTitolo): SezioneVera {
  const ambito: AmbitoVera = eSezioneAgenteRiscossione(s.titolo, s.intestazioni)
    ? 'AGENTE_RISCOSSIONE'
    : 'INPS';
  const idxImporto = indiceImporto(s.intestazioni);
  const idxVoce = indiceVoce(s.intestazioni);
  // Il riparto contributi/sanzioni esiste solo nelle sezioni contributive: è
  // quello che permette di tenere le sanzioni fuori dalla soglia (art.
  // 25-novies, c. 1, lett. a: debito per contributi), come già fa il motore.
  const idxContributi = ambito === 'INPS' ? indiceContributi(s.intestazioni) : -1;
  const idxSanzioni = ambito === 'INPS' ? indiceSanzioni(s.intestazioni) : -1;
  // NETTING: se la sezione ha una colonna "Totale credito", l'importo utile è
  // debito − credito (posizione netta). Dove la colonna manca (es. ADR,
  // Gestione Separata) coincide col debito, e i totali combaciano al centesimo
  // col foglio Esito. Nella prima gestione può restare un piccolo scarto: è
  // dovuto alle Note di Rettifica, che l'Esito somma ma non compaiono nelle
  // righe di dettaglio.
  const idxCredito = indiceCredito(s.intestazioni);
  const idxStato = indiceStato(s.intestazioni);
  const idxSospeso = indiceSospeso(s.intestazioni);
  const idxPeriodo = indicePeriodo(s.intestazioni);
  const righe = s.righe.map((r, n) => {
    const debito = idxImporto >= 0 ? parseNumero(r[idxImporto]) : 0;
    const credito = idxCredito >= 0 ? parseNumero(r[idxCredito]) : 0;
    const contributi = idxContributi >= 0 ? parseNumero(r[idxContributi]) : null;
    const sanzioni = idxSanzioni >= 0 ? parseNumero(r[idxSanzioni]) : null;
    // IL «TOTALE DEBITO» PUÒ MANCARE MENTRE IL DEBITO C'È. Nelle gestioni
    // contributive le righe «F24 non presentato» portano la cifra nelle colonne
    // «Contributi» e «Sanzioni» e lasciano vuoto il totale: letto così, il
    // debito diventava zero — e la posizione finiva fra quelle «a importo
    // ignoto», con il file che l'importo ce l'aveva scritto due colonne prima.
    //
    // Il ripiego vale SOLO quando il totale è vuoto. Se il totale c'è, è lui
    // l'importo della riga (le colonne di dettaglio ne sono la composizione, e
    // sommarle conterebbe due volte). «0» nel totale è un valore, non
    // un'assenza: una riga a debito zero resta a zero.
    const totaleVuoto = idxImporto < 0 || cellaVuota(r[idxImporto]);
    const dettaglio = (contributi ?? 0) + (sanzioni ?? 0);
    const debitoEffettivo = totaleVuoto && dettaglio > 0.005 ? dettaglio : debito;
    // Cartella SOSPESA (Agente della Riscossione): il «Totale debito» è zero
    // perché l'importo è congelato da un provvedimento, non perché sia
    // ignoto. L'importo è quello della colonna Sospeso, e la riga si marca
    // come sospesa: non entra nell'esposizione esigibile.
    const sospeso = idxSospeso >= 0 ? parseNumero(r[idxSospeso]) : 0;
    if (Math.abs(debitoEffettivo - credito) < 0.005 && sospeso > 0.005) {
      return {
        voce:
          idxVoce >= 0 && testoCella(r[idxVoce]).trim() !== ''
            ? testoCella(r[idxVoce])
            : `Riga ${n + 1}`,
        importo: sospeso,
        // Solo «Sospeso»: la nota (es. estremi dell'opposizione) renderebbe
        // ogni combinazione natura/stato unica e da mappare una per una.
        stato: 'Sospeso',
        contributi: null,
        sanzioni: null,
      };
    }
    return {
      voce:
        idxVoce >= 0 && testoCella(r[idxVoce]).trim() !== ''
          ? testoCella(r[idxVoce])
          : `Riga ${n + 1}`,
      importo: debitoEffettivo - credito,
      stato: idxStato >= 0 ? testoCella(r[idxStato]).trim() : '',
      ...(idxPeriodo >= 0 ? { periodo: testoCella(r[idxPeriodo]).trim() } : {}),
      contributi,
      sanzioni,
    };
  });
  // Il totale della sezione è l'esposizione della sezione: le partite
  // sospese restano nelle righe (perché esistono) ma non nel totale, come
  // fa il file stesso con il proprio «Totale gestione».
  const totale = righe.reduce((a, r) => a + (r.stato === 'Sospeso' ? 0 : r.importo), 0);
  return {
    titolo: s.titolo,
    ambito,
    intestazioni: s.intestazioni,
    idxImporto,
    idxVoce,
    numeroRighe: righe.length,
    totale,
    righe,
  };
}

/** Analizza il file VERA: sezioni e titoli distinti. */
export async function analizzaVera(file: File, foglio?: string): Promise<AnalisiVera> {
  const fogli = await elencoFogli(file);
  const foglioScelto =
    foglio && fogli.includes(foglio)
      ? foglio
      : fogli.includes(FOGLIO_VERA_DEFAULT)
        ? FOGLIO_VERA_DEFAULT
        : fogli[0];
  const { aoa, foglioLetto } = await leggiFoglioAoa(file, foglioScelto);
  const sezioni = estraiTutteLeSezioni(aoa)
    .filter((s) => !eSezioneVersamenti(s.intestazioni))
    .map(sezioneVeraDa);
  const titoliMap = new Map<string, string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    if (norm && !titoliMap.has(norm)) titoliMap.set(norm, s.titolo);
  }
  return {
    fogli,
    foglioLetto,
    sezioni,
    titoli: Array.from(titoliMap.entries()).map(([norm, label]) => ({ norm, label })),
  };
}

// TRATTAMENTO della riga, deciso dalla CATENA Natura+Stato (non dal solo
// stato): il debito è già a ruolo, ancora da mettere a ruolo, oppure una
// posizione potenziale di cui non si conosce ancora l'importo (es. "Denunce
// non trasmesse": natura presente, nessuno stato, nessun importo).
export type TrattamentoVera = 'contabilizzato' | 'da_contabilizzare' | 'potenziale' | 'ignora';

export const ETICHETTE_TRATTAMENTO: Record<TrattamentoVera, string> = {
  contabilizzato: 'Contabilizzato',
  da_contabilizzare: 'Da contabilizzare',
  potenziale: 'Potenziale (importo ignoto)',
  ignora: 'Ignora',
};

/** Chiave normalizzata della combinazione Natura+Stato. */
export function chiaveCombinazione(natura: string, stato: string): string {
  return `${normalizzaEtichetta(natura)}::${normalizzaEtichetta(stato)}`;
}

/** Trattamento suggerito per una combinazione mai vista, da confermare dall'operatore. */
function suggerisciTrattamento(stato: string, importo: number): TrattamentoVera {
  // Sospeso da un giudice: importo noto ma non esigibile, fuori dalle somme.
  if (/^sospes/i.test(stato.trim())) return 'ignora';
  if (Math.abs(importo) < 0.005) return 'potenziale'; // natura presente ma importo ignoto
  return stato.trim() === '' ? 'contabilizzato' : 'da_contabilizzare';
}

export interface RigaVera {
  sezione: string;
  /** Contributi INPS oppure crediti dell'Agente della Riscossione. */
  ambito: AmbitoVera;
  voce: string;
  importo: number;
  categoria: string;
  /** Dicitura della colonna Stato. */
  stato: string;
  /**
   * Periodo di competenza letto dalla sezione («202506 - 202506»).
   *
   * Serviva già a `ritardoDaVera` ed è l'unica informazione che dice al
   * reparto QUALE versamento regolarizzare: senza, il documento per reparto
   * stampava una colonna «Periodo» sempre vuota pur avendo il dato in mano.
   * Vuoto quando la sezione non lo porta (cartelle dell'Agente della
   * Riscossione, sezioni senza periodi).
   */
  periodo?: string;
  /** Trattamento derivato dalla combinazione Natura+Stato. */
  trattamento: TrattamentoVera;
  /** Quota contributi dell'importo; null quando la sezione non la espone. */
  contributi: number | null;
  /** Quota sanzioni dell'importo; null quando la sezione non la espone. */
  sanzioni: number | null;
}

/**
 * TOTALI del V.E.R.A., separati per DESTINAZIONE: le due grandezze non sono
 * intercambiabili e non vanno sommate nella stessa base.
 *
 * - `contributiInps`: contributi delle sezioni contributive, al netto delle
 *   sanzioni — è la base della soglia INPS (art. 25-novies, c. 1, lett. a);
 * - `sanzioni`: sanzioni presunte, mostrate ma mai nel test di soglia;
 * - `creditiAgente`: residuo delle cartelle già affidate all'Agente della
 *   Riscossione, netto delle partite sospese — base della lett. d);
 * - `quantificato`: somma delle tre, per la riconciliazione con l'esposizione.
 *
 * Contano solo le righe contabilizzate o da contabilizzare: le potenziali
 * hanno importo ignoto e le ignorate (sospese, fuori perimetro) restano fuori.
 */
export interface TotaliVera {
  contributiInps: number;
  sanzioni: number;
  creditiAgente: number;
  quantificato: number;
  righeIgnorate: number;
}

export function totaliVera(righe: RigaVera[]): TotaliVera {
  let contributiInps = 0;
  let sanzioni = 0;
  let creditiAgente = 0;
  let righeIgnorate = 0;
  for (const r of righe) {
    if (r.trattamento !== 'contabilizzato' && r.trattamento !== 'da_contabilizzare') {
      if (r.trattamento === 'ignora') righeIgnorate++;
      continue;
    }
    if (r.ambito === 'AGENTE_RISCOSSIONE') {
      creditiAgente += r.importo;
      continue;
    }
    const sanz = r.sanzioni ?? 0;
    // Senza riparto esplicito resta l'importo della riga: è il massimo che il
    // file dichiari, e non si inventa una quota di sanzioni.
    const contr = r.contributi ?? Math.max(0, r.importo - sanz);
    contributiInps += contr;
    sanzioni += sanz;
  }
  return {
    contributiInps,
    sanzioni,
    creditiAgente,
    quantificato: contributiInps + sanzioni + creditiAgente,
    righeIgnorate,
  };
}

export interface CombinazioneVera {
  chiave: string;
  natura: string;
  stato: string;
  suggerito: TrattamentoVera;
}

/**
 * Trasforma le sezioni in righe salvabili. La CATEGORIA viene dal titolo di
 * sezione (`mappaturaTitoli`), il TRATTAMENTO dalla combinazione Natura+Stato
 * (`mappaturaTrattamenti`, chiave → trattamento). Titoli e combinazioni non
 * ancora mappati vengono elencati a parte per chiederli all'operatore.
 */
export function estraiRigheVera(
  sezioni: SezioneVera[],
  mappaturaTitoli: Record<string, string>,
  mappaturaTrattamenti: Record<string, TrattamentoVera> = {},
  /**
   * Modalità TRIAGE: le righe senza mappatura non vengono scartate.
   *
   * Il comportamento normale è corretto per l'istruttoria — una riga il cui
   * titolo o la cui combinazione natura/stato non è stata classificata non
   * deve entrare in una posizione debitoria a insaputa di nessuno.
   *
   * Ma nella Verifica salute azienda non si chiede all'operatore di mappare
   * nulla: si carica il file per sapere se la posizione vada guardata. Con
   * le mappature vuote lo scarto era TOTALE — nessuna riga prodotta, file
   * caricato e ignorato, e l'indicatore che dichiarava l'esposizione non
   * disponibile pur avendola appena ricevuta.
   *
   * In questa modalità la categoria resta vuota (nessuna classificazione
   * inventata) e il trattamento è quello SUGGERITO dalla catena
   * natura/stato, lo stesso che l'interfaccia propone all'operatore.
   */
  triage = false,
  /**
   * La sezione ha una MATERIA, anche senza una categoria mappata?
   *
   * La configurazione viva dell'ente è fatta di materie — ognuna con i
   * presupposti legali — e di lavorazioni che dicono a quale ufficio il debito
   * va. Chiedere una categoria della vecchia tabella anche quando la sezione
   * è già riconducibile a una materia era una domanda senza risposta utile:
   * l'operatore mappava, e i documenti restavano vuoti perché il
   * raggruppamento guardava altrove. Se la sezione ha una materia, non è
   * «non mappata»: le righe entrano con la categoria vuota e la materia si
   * ricava dalla voce, come già fa la posizione V.E.R.A. dell'azienda.
   */
  haMateria?: (sezione: string, voce: string) => boolean
): {
  righe: RigaVera[];
  titoliNonMappati: { norm: string; label: string }[];
  combinazioniNonMappate: CombinazioneVera[];
} {
  const righe: RigaVera[] = [];
  const nonMappati: { norm: string; label: string }[] = [];
  const vistiNonMappati = new Set<string>();
  const combNonMappate: CombinazioneVera[] = [];
  const vistiComb = new Set<string>();
  for (const s of sezioni) {
    const norm = normalizzaEtichetta(s.titolo);
    const categoria = mappaturaTitoli[norm];
    const conMateria =
      !categoria && haMateria ? s.righe.some((r) => haMateria(s.titolo, r.voce)) : false;
    if (!categoria && !conMateria) {
      if (!vistiNonMappati.has(norm)) {
        vistiNonMappati.add(norm);
        nonMappati.push({ norm, label: s.titolo });
      }
      // In triage si prosegue con categoria vuota: si registra l'importo
      // senza attribuirgli una classificazione che nessuno ha dato.
      if (!triage) continue;
    }
    for (const r of s.righe) {
      const chiave = chiaveCombinazione(r.voce, r.stato);
      let trattamento = mappaturaTrattamenti[chiave];
      if (!trattamento) {
        if (!vistiComb.has(chiave)) {
          vistiComb.add(chiave);
          combNonMappate.push({
            chiave,
            natura: r.voce,
            stato: r.stato,
            suggerito: suggerisciTrattamento(r.stato, r.importo),
          });
        }
        if (!triage) continue;
        trattamento = suggerisciTrattamento(r.stato, r.importo);
      }
      righe.push({
        sezione: s.titolo,
        // Le fixture e i file letti prima di questa distinzione non portano
        // l'ambito: l'assenza vale «contributi INPS», il caso di gran lunga
        // più frequente.
        ambito: s.ambito ?? 'INPS',
        voce: r.voce,
        importo: r.importo,
        categoria: categoria ?? '',
        stato: r.stato,
        periodo: r.periodo ?? '',
        trattamento,
        contributi: r.contributi ?? null,
        sanzioni: r.sanzioni ?? null,
      });
    }
  }
  return { righe, titoliNonMappati: nonMappati, combinazioniNonMappate: combNonMappate };
}

/**
 * RITARDO OLTRE 90 GIORNI dal V.E.R.A. (art. 25-novies, comma 1, lett. a).
 *
 * Le sezioni di gestione del V.E.R.A. riportano, partita per partita, il
 * PERIODO di competenza del contributo non versato («202506 - 202506»). Il
 * contributo di un periodo scade il 16 del mese successivo: se alla data di
 * riferimento sono passati più di 90 giorni, la partita è in ritardo.
 *
 * Contano solo le partite contabilizzate (stato vuoto), con importo e con una
 * quota di contributi: le cartelle dell'Agente della Riscossione non hanno
 * periodo e restano fuori, come vuole la regola sulle partite passate a ruolo,
 * e le righe che non formano la base della soglia restano fuori dal ritardo
 * (vedi il commento nel corpo). null = il file non porta periodi, quindi il
 * ritardo da qui non si misura.
 */
export function ritardoDaVera(
  sezioni: SezioneVera[],
  riferimento: Date
): { partite: number; importo: number; periodi: string[] } | null {
  let conPeriodo = false;
  let partite = 0;
  let importo = 0;
  const periodi: string[] = [];
  for (const s of sezioni) {
    for (const r of s.righe) {
      if (r.periodo === undefined) continue;
      const periodo = periodoDaVera(r.periodo);
      if (!periodo) continue;
      conPeriodo = true;
      if (r.stato.trim() !== '' || r.importo <= 0.005) continue;
      // STESSO DEBBITO: il ritardo si misura sulle partite che formano la base
      // della soglia INPS, cioè quelle con una quota di contributi. Una riga a
      // soli importi — «Note di rettifica non definite», «Denunce non
      // trasmesse» che ripetono il debito del F24 — non entra in quella base
      // (la query somma `contributi`) e non deve entrare nel ritardo: sarebbe
      // un requisito temporale riferito a un debito diverso da quello
      // confrontato con la soglia. È la stessa regola già applicata alle
      // partite della Lista Inadempienze.
      if (r.contributi !== null && r.contributi <= 0.005) continue;
      const scadenza = Date.UTC(periodo.anno, periodo.mese, 16); // 16 del mese successivo
      const giorni = (riferimento.getTime() - scadenza) / 86_400_000;
      if (giorni > 90) {
        partite++;
        importo += r.importo;
        const p = `${periodo.anno}/${String(periodo.mese).padStart(2, '0')}`;
        if (!periodi.includes(p)) periodi.push(p);
      }
    }
  }
  return conPeriodo ? { partite, importo, periodi } : null;
}

/**
 * PERIODO DI COMPETENZA di una riga, nelle forme in cui il V.E.R.A. lo scrive.
 *
 * Non è un dettaglio di formato: dal periodo dipende la scadenza (il 16 del
 * mese successivo) e quindi il ritardo di oltre 90 giorni, che è un requisito
 * dell'art. 25-novies. Prima si riconosceva il solo «202506 - 202506» delle
 * gestioni contributive: le righe «F24 non presentato», che scrivono «06/2026»
 * o portano una data vera (letta da xlsx come AAAA-MM-GG), restavano senza
 * periodo — quindi fuori dal conteggio del ritardo pur essendo scadute.
 *
 * Un valore che non è un periodo (un numero seriale di Excel, una descrizione)
 * restituisce null, e la riga resta fuori dal conteggio come prima.
 */
export function periodoDaVera(testo: string): { anno: number; mese: number } | null {
  const t = (testo ?? '').trim();
  if (!t) return null;
  const valido = (anno: number, mese: number) =>
    Number.isFinite(anno) && anno >= 1990 && anno <= 2200 && mese >= 1 && mese <= 12
      ? { anno, mese }
      : null;
  // «2026-05-01»: la cella è una data (xlsx con cellDates); il mese di
  // competenza è quello della data.
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(t);
  if (iso) return valido(Number(iso[1]), Number(iso[2]));
  // «06/2026»: mese e anno, come li scrivono le righe F24.
  const meseAnno = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (meseAnno) return valido(Number(meseAnno[2]), Number(meseAnno[1]));
  // «202506 - 202506»: anno e mese in coda, formato delle gestioni.
  const annoMese = /(\d{4})\s*\/?\s*(\d{2})\s*$/.exec(t);
  if (annoMese) return valido(Number(annoMese[1]), Number(annoMese[2]));
  return null;
}
