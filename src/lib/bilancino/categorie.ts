// src/lib/bilancino/categorie.ts
//
// Categorie in cui si classifica ogni conto di un bilancino di verifica
// (o di una situazione contabile) prima di aggregarlo nelle macro-voci del
// prospetto dei dati attualizzati (DatiFinanziariPeriodo). Sono più fini
// delle macro-voci per due ragioni:
// - i conti rettificativi (fondi ammortamento, fondo svalutazione crediti,
//   rimanenze finali a conto economico, perdite portate a nuovo) devono
//   sottrarre anche quando il file riporta importi senza segno;
// - alcuni conti cambiano lato secondo il saldo (la banca in dare è
//   liquidità, in avere è debito; l'Erario e gli enti previdenziali sono
//   crediti o debiti): categorie «a doppia natura».
//
// La proposta automatica è per parole chiave sulla descrizione: il piano dei
// conti cambia da software a software, i codici no. La proposta si conferma
// sempre a mano e si memorizza nel tracciato (vedi tracciati).

export type NaturaCategoria = 'dare' | 'avere' | 'doppia' | 'esclusa';

export type IdCategoria =
  | 'ricavi'
  | 'altri_ricavi'
  | 'costi_operativi'
  | 'rimanenze_finali_ce'
  | 'ammortamenti'
  | 'proventi_finanziari'
  | 'oneri_finanziari'
  | 'imposte'
  | 'immobilizzazioni'
  | 'fondi_ammortamento'
  | 'rimanenze_sp'
  | 'crediti_clienti'
  | 'fondo_svalutazione_crediti'
  | 'altri_crediti'
  | 'disponibilita_liquide'
  | 'ratei_risconti_attivi'
  | 'banca_cc'
  | 'erario'
  | 'enti_previdenziali'
  | 'patrimonio_netto'
  | 'perdite_pregresse'
  | 'debiti_fornitori'
  | 'debiti_banche_breve'
  | 'debiti_banche_ml'
  | 'debiti_tributari'
  | 'debiti_previdenziali'
  | 'altri_debiti'
  | 'fondi_tfr_rischi'
  | 'ratei_risconti_passivi'
  | 'escluso';

export interface Categoria {
  id: IdCategoria;
  etichetta: string;
  gruppo: 'Conto economico' | 'Attivo' | 'Passivo e netto' | 'Doppia natura' | 'Fuori calcolo';
  natura: NaturaCategoria;
}

export const CATEGORIE: Categoria[] = [
  {
    id: 'ricavi',
    etichetta: 'Ricavi delle vendite e delle prestazioni',
    gruppo: 'Conto economico',
    natura: 'avere',
  },
  {
    id: 'altri_ricavi',
    etichetta: 'Altri ricavi e proventi',
    gruppo: 'Conto economico',
    natura: 'avere',
  },
  {
    id: 'costi_operativi',
    etichetta: 'Costi della produzione (acquisti, servizi, personale, oneri diversi)',
    gruppo: 'Conto economico',
    natura: 'dare',
  },
  {
    id: 'rimanenze_finali_ce',
    etichetta: 'Rimanenze finali a conto economico (riducono i costi)',
    gruppo: 'Conto economico',
    natura: 'avere',
  },
  {
    id: 'ammortamenti',
    etichetta: 'Ammortamenti e svalutazioni',
    gruppo: 'Conto economico',
    natura: 'dare',
  },
  {
    id: 'proventi_finanziari',
    etichetta: 'Proventi finanziari',
    gruppo: 'Conto economico',
    natura: 'avere',
  },
  {
    id: 'oneri_finanziari',
    etichetta: 'Interessi e oneri finanziari',
    gruppo: 'Conto economico',
    natura: 'dare',
  },
  { id: 'imposte', etichetta: 'Imposte sul reddito', gruppo: 'Conto economico', natura: 'dare' },
  {
    id: 'immobilizzazioni',
    etichetta: 'Immobilizzazioni (valore lordo)',
    gruppo: 'Attivo',
    natura: 'dare',
  },
  {
    id: 'fondi_ammortamento',
    etichetta: 'Fondi ammortamento (riducono le immobilizzazioni)',
    gruppo: 'Attivo',
    natura: 'avere',
  },
  {
    id: 'rimanenze_sp',
    etichetta: 'Rimanenze di magazzino (stato patrimoniale)',
    gruppo: 'Attivo',
    natura: 'dare',
  },
  { id: 'crediti_clienti', etichetta: 'Crediti verso clienti', gruppo: 'Attivo', natura: 'dare' },
  {
    id: 'fondo_svalutazione_crediti',
    etichetta: 'Fondo svalutazione crediti (riduce i crediti)',
    gruppo: 'Attivo',
    natura: 'avere',
  },
  { id: 'altri_crediti', etichetta: 'Altri crediti', gruppo: 'Attivo', natura: 'dare' },
  {
    id: 'disponibilita_liquide',
    etichetta: 'Cassa e disponibilità liquide',
    gruppo: 'Attivo',
    natura: 'dare',
  },
  {
    id: 'ratei_risconti_attivi',
    etichetta: 'Ratei e risconti attivi',
    gruppo: 'Attivo',
    natura: 'dare',
  },
  {
    id: 'banca_cc',
    etichetta: 'Conto corrente bancario (liquidità se in dare, debito se in avere)',
    gruppo: 'Doppia natura',
    natura: 'doppia',
  },
  {
    id: 'erario',
    etichetta: 'Erario / IVA (credito se in dare, debito se in avere)',
    gruppo: 'Doppia natura',
    natura: 'doppia',
  },
  {
    id: 'enti_previdenziali',
    etichetta: 'INPS / INAIL / enti previdenziali (credito se in dare, debito se in avere)',
    gruppo: 'Doppia natura',
    natura: 'doppia',
  },
  {
    id: 'patrimonio_netto',
    etichetta: 'Capitale, riserve, utili portati a nuovo',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'perdite_pregresse',
    etichetta: 'Perdite portate a nuovo (riducono il netto)',
    gruppo: 'Passivo e netto',
    natura: 'dare',
  },
  {
    id: 'debiti_fornitori',
    etichetta: 'Debiti verso fornitori',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'debiti_banche_breve',
    etichetta: 'Debiti verso banche a breve (anticipi, fidi)',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'debiti_banche_ml',
    etichetta: 'Mutui e finanziamenti a medio-lungo termine',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'debiti_tributari',
    etichetta: 'Debiti tributari',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'debiti_previdenziali',
    etichetta: 'Debiti previdenziali',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'altri_debiti',
    etichetta: 'Altri debiti (dipendenti, soci, diversi)',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'fondi_tfr_rischi',
    etichetta: 'TFR e fondi rischi e oneri',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'ratei_risconti_passivi',
    etichetta: 'Ratei e risconti passivi',
    gruppo: 'Passivo e netto',
    natura: 'avere',
  },
  {
    id: 'escluso',
    etichetta: 'Escluso dal calcolo (totali, risultato di periodo, conti d’ordine)',
    gruppo: 'Fuori calcolo',
    natura: 'esclusa',
  },
];

const PER_ID = new Map(CATEGORIE.map((c) => [c.id, c]));

export function categoria(id: IdCategoria): Categoria {
  return PER_ID.get(id)!;
}

export function isIdCategoria(v: unknown): v is IdCategoria {
  return typeof v === 'string' && PER_ID.has(v as IdCategoria);
}

export function normalizzaTesto(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export type Confidenza = 'alta' | 'bassa';

export interface Proposta {
  categoria: IdCategoria;
  confidenza: Confidenza;
}

// Regole in ordine: la prima che corrisponde vince. Le più specifiche
// stanno in alto (es. «fondo ammortamento» prima di «ammortamento»,
// «interessi passivi» prima di «banca»).
const REGOLE: { rx: RegExp; categoria: IdCategoria; confidenza?: Confidenza }[] = [
  // Perdite pregresse prima del «risultato di periodo», che si esclude
  {
    rx: /\bperdit[ae] (\w+ )?(portat[ae] a nuovo|pregress[ae]|(dell'|degli |di )?esercizi[oi] precedent[ei])\b/,
    categoria: 'perdite_pregresse',
  },
  {
    rx: /\butil[ei] (\w+ )?(portat[ae] a nuovo|pregress[ae]|(dell'|degli |di )?esercizi[oi] precedent[ei])\b/,
    categoria: 'patrimonio_netto',
  },
  // Fuori calcolo: totali e risultato del periodo (evitano il doppio conteggio)
  { rx: /^(totale|tot\.|totali|subtotale|sub-totale)\b/, categoria: 'escluso' },
  { rx: /\b(totale generale|quadratura|conti d'ordine|conti d ordine)\b/, categoria: 'escluso' },
  {
    rx: /\b(utile|perdita|risultato)( \(perdita\))? (d'|dell'|del |di )?(esercizio|periodo)\b/,
    categoria: 'escluso',
  },
  // Rettifiche
  { rx: /\bf(ondo|\.do|do)\.? (amm|ammort)/, categoria: 'fondi_ammortamento' },
  {
    rx: /\bf(ondo|\.do|do)\.? sval(utazione)?\.? crediti\b/,
    categoria: 'fondo_svalutazione_crediti',
  },
  { rx: /\brimanenze finali\b/, categoria: 'rimanenze_finali_ce' },
  { rx: /\brimanenze iniziali\b/, categoria: 'costi_operativi' },
  { rx: /\bvariazione? (delle )?rimanenze\b/, categoria: 'costi_operativi', confidenza: 'bassa' },
  // Conto economico
  { rx: /\b(ammortament|svalutazion)/, categoria: 'ammortamenti' },
  {
    rx: /\b(interessi passivi|oneri finanziari|interessi (su|per) (mutu|finanziament|dilazion)|interessi di mora|interessi bancari passivi|oneri bancari)/,
    categoria: 'oneri_finanziari',
  },
  { rx: /\b(interessi attivi|proventi finanziari|dividendi)\b/, categoria: 'proventi_finanziari' },
  {
    rx: /\b(imposte (sul reddito|correnti|dell'esercizio|anticipate|differite)|ires|irap)\b/,
    categoria: 'imposte',
  },
  {
    rx: /\b(altri ricavi|proventi (diversi|vari)|contributi in conto esercizio|sopravvenienze attive|plusvalenze|rimborsi|abbuoni attivi)\b/,
    categoria: 'altri_ricavi',
  },
  {
    rx: /\b(ricavi|vendite|prestazioni di servizi|corrispettivi|fatturato)\b/,
    categoria: 'ricavi',
  },
  {
    rx: /\b(acquist|merci c\/acquisti|materie prime|servizi|consulenz|utenze|energia|carburant|manutenzion|trasport|affitt|locazion|canon|noleggi|leasing|salari|stipendi|retribuzion|oneri sociali|contributi (inps|inail|previdenziali) (a carico|ditta)|accantonamento|compensi|spese|oneri diversi|sopravvenienze passive|minusvalenze|lavorazioni|provvigioni|assicurazion|pubblicita|cancelleria|telefon|postali|commissioni|imposte e tasse|tasse|valori bollati|diritti camerali)/,
    categoria: 'costi_operativi',
  },
  // Doppia natura (prima dei debiti/crediti specifici)
  {
    rx: /\b(anticipi? (su )?fatture|anticipo fatture|s\.?b\.?f\.?|salvo buon fine|c\/anticipi|conto anticipi|fido|scoperto)\b/,
    categoria: 'debiti_banche_breve',
  },
  {
    rx: /\b(mutu[oi]|finanziament[oi] (bancar|a medio|a lungo|chirografar|ipotecar)|prestito)\b/,
    categoria: 'debiti_banche_ml',
  },
  {
    rx: /\b(banca|banco|c\/c bancario|conto corrente|unicredit|intesa|bpm|bper|credem|monte dei paschi|mps|popolare|bcc|credito cooperativo|poste italiane c\/c)\b/,
    categoria: 'banca_cc',
    confidenza: 'bassa',
  },
  {
    rx: /\b(erario|iva (c\/|a credito|a debito|su)|iva$|ritenute|irpef|f24)\b/,
    categoria: 'erario',
    confidenza: 'bassa',
  },
  {
    rx: /\b(inps|inail|enti previdenziali|istituti previdenziali|enasarco|cassa edile|fondo (pensione|est)|previdenza complementare)\b/,
    categoria: 'enti_previdenziali',
    confidenza: 'bassa',
  },
  // Stato patrimoniale
  {
    rx: /\b(trattamento di fine rapporto|t\.?f\.?r\.?|fondo rischi|fondi rischi|fondo oneri|fondi per rischi)\b/,
    categoria: 'fondi_tfr_rischi',
  },
  { rx: /\b(ratei attivi|risconti attivi)\b/, categoria: 'ratei_risconti_attivi' },
  { rx: /\b(ratei passivi|risconti passivi)\b/, categoria: 'ratei_risconti_passivi' },
  {
    rx: /\b(capitale sociale|capitale netto|riserva|riserve|utili (portati a nuovo|a nuovo|esercizi precedenti)|versamenti (in )?conto capitale|soci c\/versamenti)\b/,
    categoria: 'patrimonio_netto',
  },
  {
    rx: /\b(dipendenti c\/|personale c\/|retribuzioni da pagare|debiti diversi|altri debiti|soci c\/finanziament|finanziamento soci|acconti da clienti|caparre)\b/,
    categoria: 'altri_debiti',
  },
  {
    rx: /\b(crediti (diversi|tributari|v\/erario|verso altri)|altri crediti|acconti a fornitori|anticipi a fornitori|depositi cauzionali|crediti d'imposta)\b/,
    categoria: 'altri_crediti',
  },
  {
    rx: /\b(fornitori|fatture da ricevere|debiti v(\/|erso) fornitori|effetti passivi)\b/,
    categoria: 'debiti_fornitori',
  },
  {
    rx: /\b(clienti|fatture da emettere|crediti v(\/|erso) clienti|effetti attivi|ri\.?ba|portafoglio effetti)\b/,
    categoria: 'crediti_clienti',
  },
  {
    rx: /\b(debiti tributari|agenzia (delle )?entrate|ader|rateizzazion[ei] (fiscal|tribut))\b/,
    categoria: 'debiti_tributari',
  },
  { rx: /\b(debiti previdenziali)\b/, categoria: 'debiti_previdenziali' },
  {
    rx: /\b(cassa|denaro|valori in cassa|carte prepagate|c\/c postale)\b/,
    categoria: 'disponibilita_liquide',
  },
  {
    rx: /\b(magazzino|rimanenze|scorte|prodotti finiti|semilavorati|lavori in corso)\b/,
    categoria: 'rimanenze_sp',
    confidenza: 'bassa',
  },
  {
    rx: /\b(impiant|macchinar|attrezzatur|fabbricat|terren|immobil|automezz|autovettur|autoveicol|mobili|arredi|macchine (d'ufficio|elettroniche)|hardware|software|brevett|marchi|avviamento|partecipazion|costi di impianto|migliorie|opere)/,
    categoria: 'immobilizzazioni',
  },
  { rx: /\bdebiti\b/, categoria: 'altri_debiti', confidenza: 'bassa' },
  { rx: /\bcrediti\b/, categoria: 'altri_crediti', confidenza: 'bassa' },
];

/** Proposta di categoria per descrizione del conto. null = nessuna regola:
 * la sceglie l'operatore. */
export function proponiCategoria(descrizione: string): Proposta | null {
  const d = normalizzaTesto(descrizione);
  if (!d) return null;
  for (const r of REGOLE) {
    if (r.rx.test(d)) return { categoria: r.categoria, confidenza: r.confidenza ?? 'alta' };
  }
  return null;
}
