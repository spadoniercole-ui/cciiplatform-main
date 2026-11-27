// src/lib/piano/elaborazioneAi.ts
//
// TERZO LIVELLO del piano: l'AI scrive le ipotesi, cella per cella e con la
// motivazione; il motore deterministico (piano.ts) calcola. L'AI non produce
// mai numeri di risultato (EBITDA, cassa, coperture): solo ipotesi d'ingresso.
// Il risultato si salva come variante «elaborazione-ai», accanto a quelle
// dell'operatore, e non ne sostituisce nessuna.
//
// Uguale per i due lati; cambiano i dati sul tavolo e la domanda:
//   - Ricevente: ipotesi motivate a partire dal piano dell'azienda,
//     ricondotte al riferimento di settore dove l'azienda è più ottimista;
//   - Redigente: ipotesi motivate per un piano che sostenga le rate della
//     proposta, dicendo su quali leve agisce e dove non basta.
//
// Velocità: una sola chiamata, contesto compatto costruito con i dati già
// caricati nella pagina (nessuna nuova lettura dal database), risposta JSON
// breve e validata qui, senza seconde chiamate di correzione.
//
// La risposta è il PUNTO DI PARTENZA, non il piano finito: dopo la validazione
// il server chiama `cercaPiano` (src/lib/piano/ricercaPiano.ts), che è
// deterministico e gira le manopole finché i vincoli si chiudono (0.256.42).
// Così il piano non è una proposta in un colpo solo, e ogni sua ipotesi ha
// dietro una mossa tracciata.

import { cercaTerminiLessico, LESSICO, SOSTITUZIONI_DIRETTE } from '@/lib/lessico/lessico';
import { PARAMETRI_SIMULAZIONE_PREDEFINITI } from './parametriSimulazione';
import { LEVE, leveValide, type LeveSimulazione } from './leveSimulazione';
import { lancioPianoValido, type LancioPiano } from './contestoContabile';
import { rettifichePulite, type Rettifiche } from './rettifiche';
import {
  ETICHETTA_RIGA,
  RIGHE_FLUSSO,
  RIGHE_INPUT,
  type EsercizioStorico,
  type Ipotesi,
  type IpotesiPiano,
  type RigaInput,
} from './piano';

export type LatoPiano = 'RICEVUTA' | 'DA_DEFINIRE';

/**
 * Le leve della simulazione, lette dai Parametri di Spazio
 * (Parametri › Piano e simulazione AI). Omesse, restano i valori di sistema,
 * così il comportamento del modulo non cambia per chi non le passa.
 */
export interface OpzioniSimulazione {
  /** Variazione massima ammessa su una manopola, in entrambi i versi (%). */
  variazioneMassimaPct?: number;
  /**
   * Aliquota d'imposta da usare quando l'AI non la indica: è il valore che lo
   * spazio ha scelto al posto del 27,9% implicito nel motore.
   */
  aliquotaImposteDefault?: number;
}

export const VARIANTE_AI = 'elaborazione-ai';

/**
 * La riga della nota che porta la sintesi dell'analisi. La nota è un testo
 * lungo e l'ordine delle righe può cambiare: chi la rilegge cerca questa
 * etichetta invece di contare le righe (0.256.43).
 */
export const PREFISSO_SINTESI_NOTA = 'Sintesi dell’analisi: ';

export interface ContestoElaborazione {
  lato: LatoPiano;
  orizzonte: number;
  /** Storico dal più recente (al massimo tre esercizi). */
  storico: EsercizioStorico[];
  crescita: { tasso: number; descrizione: string };
  rate: { ente: number[]; altri: number[] };
  /** Ricevente: valori del piano dell'azienda per riga e anno (euro). */
  pianoAzienda?: Partial<Record<RigaInput, Record<string, number>>> | null;
  /** Ricevente: righe su cui l'azienda è più ottimista del riferimento oltre le soglie. */
  scostamenti?: { voce: string; luce: 'giallo' | 'rosso'; ottimismoMassimo: number }[];
  /** Redigente: le ipotesi della variante su cui sta lavorando. */
  ipotesiCorrenti?: IpotesiPiano | null;
  /**
   * «Dove si concentra l'attenzione» della verifica contabile, in testo: le
   * dimensioni accese, i determinanti, le lacune e il debito dell'ente se non è
   * in bilancio (src/lib/piano/contestoContabile.ts).
   */
  attenzioneContabile?: string | null;
  /** I parametri di lancio scelti per questa simulazione (procedura, offerta, prudenza). */
  lancio?: string | null;
  /**
   * Il contesto economico dello spazio (Parametri › Piano e simulazione AI):
   * inflazione, spread, costo del carburante, incidenza di crisi, tecnologia.
   * In testo, vuoto quando l'ente non ha scritto nulla.
   */
  parametriContesto?: string | null;
  /** Le leve accese al lancio (tagli, tecnologia, diversificazione, target). */
  leve?: string | null;
  /**
   * Le stesse leve come scelte: il browser manda queste, il server ne ricava
   * il testo per il prompt (`leve`) e le salva con la variante.
   */
  leveScelte?: LeveSimulazione | null;
  /**
   * L'operatore ha già toccato le leve per questa variante: la proposta
   * dell'analisi non le riscrive, e lo dice nella sintesi (0.256.34).
   */
  leveModificate?: boolean;
  /**
   * Il piano dell'azienda che arriva dal passo 3 della verifica aziendale,
   * quando lo scenario è stato creato con il flag di simulazione.
   */
  pianoVerifica?: string | null;
  /**
   * Le note integrative del bilancio, in testo: continuità, piani, fatti di
   * rilievo, impegni, parti correlate. Il piano deve leggerle (0.256.35).
   */
  noteIntegrative?: string | null;
  /**
   * Gli anni in cui il debito verso l'ente si restituisce: il piano non può
   * essere più corto (0.256.35).
   */
  minAnni?: number;
  /** L'impostazione scelta dall'operatore: l'analisi non la riscrive. */
  impostazione?: string | null;
  /** La procedura dello scenario: è quella, non una scelta dell'analisi. */
  procedura?: string | null;
  /**
   * Gli anni di restituzione già fissati dall'operatore nel lancio: 0 = unica
   * soluzione. Quando ci sono, l'analisi non li propone e il server li tiene.
   */
  anniFissi?: number | null;
  /** La percentuale d'offerta già fissata dall'operatore: l'analisi non la riscrive. */
  offertaFissa?: number | null;
  /**
   * Vincoli che scattano oggi: quelli del piano in schermo e quelli della
   * verifica contabile. Servono al prompt, che deve sapere che cosa il piano
   * deve affrontare.
   */
  vincoli?: string[];
  /**
   * Solo i vincoli DOCUMENTATI (contabilità, procedure, note integrative):
   * sono gli unici che possono giustificare ricavi fermi. I vincoli aperti del
   * piano in schermo no: quelli la ricerca li deve chiudere alzando le manopole
   * (0.256.43).
   */
  vincoliDocumentati?: string[];
}

/** Il tetto di sistema alla variazione di una manopola, quando lo spazio non ne ha uno. */
export const VARIAZIONE_MASSIMA_PREDEFINITA =
  PARAMETRI_SIMULAZIONE_PREDEFINITI.variazioneMassimaPct;

const arrot = (n: number) => Math.round(n);

/** Contesto compatto per il modello: solo numeri utili, niente ripetizioni. */
export function testoContesto(c: ContestoElaborazione): string {
  const primoAnno = (c.storico[0]?.anno ?? 0) + 1;
  const anni = Array.from({ length: c.orizzonte }, (_, i) => primoAnno + i);
  const righeStorico = c.storico
    .map(
      (s) =>
        `${s.anno}: ricavi ${arrot(s.ricaviVendite)}; valore produzione ${arrot(s.valoreProduzione)}; costi produzione ${arrot(s.costiProduzione)} (ammortamenti ${arrot(s.ammortamenti)}; personale ${s.costiPersonale ? arrot(s.costiPersonale) : 'non separato'}); oneri finanziari ${arrot(s.oneriFinanziari)}; utile ${arrot(s.utileEsercizio)}; crediti clienti ${arrot(s.creditiClienti)}; debiti fornitori ${arrot(s.debitiFornitori)}; debiti banche ${arrot(s.debitiBanche)}; liquidità ${arrot(s.disponibilitaLiquide)}; patrimonio netto ${arrot(s.patrimonioNetto)}`
    )
    .join('\n');
  const anniOperatore = anniFissati(c);
  const parti = [
    `ANNI DEL PIANO: ${anni.join(', ')} (indice 0 = ${anni[0]}).`,
    `STORICO (euro):\n${righeStorico}`,
    `RIFERIMENTO DI SETTORE: ${c.crescita.descrizione} Tasso usato dal piano automatico: ${c.crescita.tasso}% annuo.`,
    `RATE DELLA PROPOSTA per anno (euro): ente ${c.rate.ente.map(arrot).join(' / ')}; altri creditori ${c.rate.altri.map(arrot).join(' / ')}.`,
    anniOperatore !== null
      ? `RESTITUZIONE DEL DEBITO: ${anniOperatore === 0 ? 'in un’unica soluzione' : `in ${anniOperatore} anni`}, già decisa dall’operatore. Non proporla e non restituirla.`
      : c.minAnni && c.minAnni > 0
        ? `RESTITUZIONE DEL DEBITO: ${c.minAnni} anni. Il piano non può essere più corto di questo arco.`
        : '',
  ].filter(Boolean);
  if (c.pianoAzienda && Object.keys(c.pianoAzienda).length) {
    parti.push(
      `PIANO DELL'AZIENDA (euro):\n${Object.entries(c.pianoAzienda)
        .map(
          ([r, v]) =>
            `${r}: ${anni.map((a) => (v?.[String(a)] !== undefined ? arrot(v![String(a)]) : '—')).join(' / ')}`
        )
        .join('\n')}`
    );
  }
  if (c.scostamenti?.length) {
    parti.push(
      `SCOSTAMENTI FAVOREVOLI ALL'AZIENDA OLTRE SOGLIA: ${c.scostamenti
        .map((s) => `${s.voce} (${s.luce}, fino a +${s.ottimismoMassimo}%)`)
        .join('; ')}.`
    );
  }
  if (c.ipotesiCorrenti && Object.keys(c.ipotesiCorrenti).length) {
    parti.push(
      `IPOTESI ATTUALI DELL'OPERATORE:\n${Object.entries(c.ipotesiCorrenti)
        .map(
          ([r, arr]) =>
            `${r}: ${(arr ?? []).map((ip) => (ip ? `${ip.valore}${ip.tipo === 'pct' ? '%' : '€'}` : '—')).join(' / ')}`
        )
        .join('\n')}`
    );
  }
  if (c.pianoVerifica)
    parti.push(
      `PIANO DELL'AZIENDA DALLA VERIFICA AZIENDALE (passo 3)\n${c.pianoVerifica}\nIl piano che simuli parte da qui: dove lo contraddici, dillo nella motivazione.`
    );
  if (c.noteIntegrative) parti.push(`NOTE INTEGRATIVE DEL BILANCIO\n${c.noteIntegrative}`);
  if (c.parametriContesto) parti.push(`CONTESTO ECONOMICO DELLO SPAZIO\n${c.parametriContesto}`);
  // Le leve già decise dall'operatore non tornano nel contesto come una
  // richiesta: il prompt ne parla solo per dire che il server le applica.
  if (c.leve && !c.leveModificate)
    parti.push(`LEVE CHIESTE AL LANCIO (già decise: non proporne altre)\n${c.leve}`);
  if (c.attenzioneContabile)
    parti.push(`ATTENZIONE DELLA VERIFICA CONTABILE\n${c.attenzioneContabile}`);
  if (c.lancio) parti.push(`PARAMETRI DI LANCIO\n${c.lancio}`);
  if (c.vincoli?.length) parti.push(`VINCOLI CHE SCATTANO OGGI: ${c.vincoli.join(' ')}`);
  return parti.join('\n\n');
}

function lessicoBreve(): string {
  const vietati = LESSICO.filter(
    (v) => v.classe === 'VIETATO_AUTOMATICO' || v.classe === 'RISERVATO_PROFESSIONISTA'
  ).map((v) => `«${v.termine}»`);
  return `Nelle motivazioni non usare come giudizio i termini ${vietati.join(', ')}; non dire che l'azienda è in crisi o insolvente; nessun giudizio sulle persone. Descrivi dati e ipotesi.`;
}

/** Il Ricevente con il piano dell'azienda caricato rettifica quel piano; gli altri casi girano le manopole. */
export function modoRettifiche(c: ContestoElaborazione): boolean {
  return (
    c.lato === 'RICEVUTA' &&
    !!c.pianoAzienda &&
    Object.values(c.pianoAzienda).some((v) => v && Object.keys(v).length > 0)
  );
}

/**
 * Prompt dell'AI. Risposta compatta: UN valore per riga (una manopola),
 * uguale per tutti gli anni — così il modello non deve scrivere decine di
 * celle (la risposta lunga si troncava e l'elaborazione falliva).
 */
/**
 * Le scelte che l'analisi propone accanto alle ipotesi: le leve accese con la
 * misura e il lancio (procedura, offerta, anni, impostazione). Stanno nel
 * prompt perché il piano non si legge solo dai numeri: dice che cosa l'azienda
 * mette in gioco e come intende far fronte agli impegni assunti con l'ente.
 */
/**
 * CHE COSA DEVE FARE UN PIANO (0.256.35, riscrittura della simulazione).
 *
 * Il difetto da chiudere è uno solo: il piano rimandava l'elenco telefonico.
 * Ripeteva il fatturato dell'ultimo bilancio per tutti gli anni, non mostrava
 * i costi — e quindi non mostrava il costo del personale che le ipotesi
 * dicevano di ridurre — e le leve restavano spente con la misura suggerita.
 *
 * Ora la simulazione si costruisce in un ordine dichiarato: base contabile del
 * passo 3, note integrative, trend di bilancio e di settore, ricerca web su
 * settore e mercati di sbocco, obiettivo (risanare, essere profittevole,
 * restituire il debito), leve scelte dall'analisi con la misura, percorso anno
 * per anno, sacrifici. Le regole con cui la piattaforma traduce le leve in
 * numeri stanno scritte qui: il modello deve saperle per non contarle due
 * volte nelle ipotesi.
 */
const PROCEDURE_FISSE = ['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN'];
const PRUDENZE_FISSE = ['PRUDENTE', 'NEUTRA', 'FAVOREVOLE'];

/** La procedura è già quella dello scenario: il server non accetta quella dell'AI. */
function proceduraFissa(c: ContestoElaborazione): boolean {
  return typeof c.procedura === 'string' && PROCEDURE_FISSE.includes(c.procedura);
}

/** L'impostazione è già quella dell'operatore: il server non accetta quella dell'AI. */
function impostazioneFissa(c: ContestoElaborazione): boolean {
  return typeof c.impostazione === 'string' && PRUDENZE_FISSE.includes(c.impostazione);
}

/** Gli anni di restituzione già decisi dall'operatore: 0 = unica soluzione. */
function anniFissati(c: ContestoElaborazione): number | null {
  if (typeof c.anniFissi !== 'number' || !Number.isFinite(c.anniFissi)) return null;
  return Math.max(0, Math.round(c.anniFissi));
}

/** L'offerta già decisa dall'operatore, in percentuale. */
function offertaFissata(c: ContestoElaborazione): number | null {
  if (typeof c.offertaFissa !== 'number' || !Number.isFinite(c.offertaFissa)) return null;
  return Math.max(0, Math.min(100, c.offertaFissa));
}

function bloccoStrategia(c: ContestoElaborazione): string {
  const leve = c.leveModificate
    ? `LE LEVE LE HA GIÀ SCELTE L'OPERATORE: non proporre valori diversi. Sono il suo perimetro e, fino al salvataggio del piano, l'analisi non le tocca. Se i dati dicono che una misura diversa sarebbe più sostenibile, scrivilo nella sintesi senza cambiarla.`
    : `LE CINQUE LEVE LE SCEGLI TU, con la misura e con il motivo. Sono le variabili del piano: se la crescita che proponi ha bisogno del personale, della tecnologia, di linee nuove, di mercati nuovi o di un target nuovo, accendile con la misura che i dati sostengono. Un piano che cresce senza mettere in gioco nulla non regge; non accendere una leva che i dati non sostengono.`;
  const anni = anniFissati(c);
  const impostazione = impostazioneFissa(c)
    ? `L'IMPOSTAZIONE È GIÀ SCELTA DALL'OPERATORE: non proporne un'altra e non restituirla. Il percorso ne tiene conto.`
    : `Prudente, neutra e favorevole non sono etichette: cambiano le misure delle leve, il percorso e la restituzione del debito. Prudente = misure contenute, ripresa lenta e debito più diluito; neutra = quello che dicono i dati; favorevole = il miglior esito plausibile, dichiarato, con la restituzione più corta che il flusso sostiene.${anni !== null ? ' Gli anni di restituzione però li ha già fissati l’operatore: qui non cambiano.' : ''} Se per una leva non esiste una variante, non inventarla.`;
  const minAnni = c.minAnni && c.minAnni > 0 ? c.minAnni : 0;
  return `IL PIANO È IL CAMBIAMENTO, NON LA RIPETIZIONE. Un piano che ripete i numeri dell'ultimo bilancio per tutti gli anni non è prudente: è un'azienda ferma, e le rate non le paga. La tabella mostra le stesse righe del conto economico, quindi costi e personale devono risultare coerenti con le ipotesi: se dici di ridurre il personale, la riduzione deve stare nei numeri.

COME SI COSTRUISCE IL PIANO — in quest'ordine:
1. BASE CONTABILE. Parti dallo stato attuale, dal piano della verifica aziendale (passo 3) dove c'è, dalle note integrative, dai trend di bilancio e dal riferimento di settore. Il passato non si riscrive.
2. IL SETTORE E I MERCATI. Con la ricerca web verifica se il settore in cui opera l'azienda è ancora profittevole e se esistono mercati alternativi di sbocco (situazione internazionale, stabilità politica, mercati emergenti, energia, tassi, cambi, dazi, filiere). Ogni ipotesi che dipende da una variabile ambientale cita la variabile e la fonte (ISTAT, Banca d'Italia, OCSE, FMI, ICE, rapporti di settore). Una variabile che non trovi non si inventa e non si usa.
3. L'OBIETTIVO. Il piano deve risanare l'azienda, renderla profittevole e restituire il debito verso l'ente: è questo che orienta le ipotesi, non la fotografia dell'anno scorso.
4. LE LEVE. ${leve} La piattaforma le traduce in numeri così, e tu devi saperlo per non contarcele due volte:
   - PERSONALE: riduce il costo del personale della misura; il risparmio scende dai costi operativi e compare nella riga del personale.
   - TECNOLOGIA: investe la misura dei ricavi dell'anno in immobilizzazioni, ammortizzate in quote costanti su 5 anni; i ricavi non salgono per questo, salgono se il percorso li alza.
   - PRODUZIONE, MERCATI, CLIENTELA: aggiungono la misura dei ricavi di partenza come ricavi nuovi, a regime entro 3 anni (2 per i mercati), con costi e crediti nella stessa incidenza storica del bilancio.
   Le ipotesi delle righe ricavi e costi che scrivi sono il percorso SENZA l'effetto delle leve: la piattaforma aggiunge ${c.leveModificate ? 'le leve già scelte dall’operatore' : 'le leve che scegli'}. Non metterle anche nelle percentuali.
5. IL PERCORSO ANNO PER ANNO. Per ricavi e costi scrivi un valore per OGNI anno del piano, non uno ripetuto: il fatturato sale in modo sostenibile (se lo storico cala, il primo anno tiene e i successivi riprendono), i costi crescono meno dei ricavi, il margine EBITDA migliora. Ricavi fermi si giustificano solo con un vincolo documentato, e la motivazione deve dirlo.
6. L'IMPOSTAZIONE. ${impostazione}
7. GLI ANNI. ${anni !== null ? `Gli anni di restituzione li ha già fissati l'operatore (${anni === 0 ? 'unica soluzione' : `${anni} anni`}): non proporli e non cambiarli.` : minAnni > 0 ? `Il debito si restituisce in ${minAnni} anni: anniRientro deve essere almeno ${minAnni} e non può superare l'orizzonte già scelto.` : `Gli anni di restituzione del debito li scegli tu, e non possono superare l'orizzonte del piano.`}
8. I SACRIFICI. Di' che cosa il piano chiede di rinunciare o di anticipare (organico, investimenti, credito ai clienti, cassa) e dove il piano non arriva. Sono parte del piano, non un'appendice.
9. CHIUDERE SULLE RATE. Il flusso di gestione deve coprire le rate verso l'ente e gli altri creditori: se con ipotesi difendibili non ci arriva, dillo nella sintesi invece di gonfiare i numeri.
10. LA RICERCA DEL MOTORE. Dopo la tua risposta la piattaforma gira le manopole a piccoli passi — crescita dei ricavi, costi, leve — finché rate, cassa e patrimonio stanno in piedi, e mette da parte le mosse che ha fatto. Tu scrivi il punto di partenza motivato, non devi indovinare il valore finale; e non gonfiare i numeri per arrivarci: la ricerca si ferma dove serve e, se non basta, lo dichiara.`;
}

function bloccoScelte(c: ContestoElaborazione): string {
  const leve = c.leveModificate
    ? 'Le leve sono già state scelte dall’operatore e il server le applica una volta: non fanno parte della risposta. Decidi solo il lancio.'
    : `Le leve le decidi tu, sulla base dei dati, e ognuna porta il suo perché:
${LEVE.map(
  (l) =>
    `- ${l.id} (${l.domanda}): attiva true/false, misura in % (${l.misura}), motivazione in una frase`
).join('\n')}`;
  const chiusura = c.leveModificate
    ? 'Il lancio deve puntare a far fronte agli impegni assunti verso l’ente: gli anni determinano le rate, l’offerta determina quanto entra.'
    : 'Le scelte devono puntare a far fronte agli impegni assunti verso l’ente: gli anni determinano le rate, l’offerta determina quanto entra. Non accendere leve che i dati non sostengono; non lasciarne nessuna accesa quando la crescita che proponi ne ha bisogno.';
  const campi = [
    ...(proceduraFissa(c) ? [] : ['procedura (ACCORDO, LIQUIDAZIONE o CRAM_DOWN)']),
    ...(offertaFissata(c) === null
      ? ["percentualeOfferta (0-100 sul credito dell'ente, null se non la fissi)"]
      : []),
    ...(anniFissati(c) === null
      ? ["anniRientro (0-10; 0 = unica soluzione, null se come la proposta, mai oltre l'orizzonte)"]
      : []),
    ...(impostazioneFissa(c) ? [] : ['prudenza (PRUDENTE, NEUTRA o FAVOREVOLE)']),
  ];
  const fissi = [
    proceduraFissa(c) ? 'La procedura è già fissata dallo scenario: non restituirla.' : '',
    offertaFissata(c) !== null ? "L'offerta è già fissata dall'operatore: non restituirla." : '',
    anniFissati(c) !== null
      ? 'Gli anni di restituzione sono già fissati dall’operatore: non restituirli.'
      : '',
    impostazioneFissa(c) ? "L'impostazione è già scelta dall'operatore: non restituirla." : '',
  ]
    .filter(Boolean)
    .join(' ');
  const riga = campi.length
    ? `- lancio: ${campi.join(', ')}.${fissi ? ` ${fissi}` : ''}`
    : `- lancio: non c'è niente da decidere, è già tutto dell'operatore. ${fissi}`;
  return `LE SCELTE CHE REGGONO IL PIANO — ${leve}
${riga}
${chiusura}
`;
}

/** L'esempio di lancio contiene solo i campi che il server accetta davvero. */
function esempioLancio(c: ContestoElaborazione): string {
  const campi: string[] = [];
  if (!proceduraFissa(c)) campi.push('"procedura": "ACCORDO"');
  if (offertaFissata(c) === null) campi.push('"percentualeOfferta": 40');
  if (anniFissati(c) === null) campi.push('"anniRientro": 5');
  if (!impostazioneFissa(c)) campi.push('"prudenza": "PRUDENTE"');
  return `{${campi.join(', ')}}`;
}

export function promptElaborazione(c: ContestoElaborazione, opzioni?: OpzioniSimulazione): string {
  const max = opzioni?.variazioneMassimaPct ?? VARIAZIONE_MASSIMA_PREDEFINITA;
  const scelteLeve = c.leveModificate
    ? ''
    : ', "leve": {"PERSONALE": {"attiva": true, "misura": 8, "motivazione": "..."}}';
  const lancioJson = esempioLancio(c);
  if (modoRettifiche(c)) {
    const righe = Object.keys(c.pianoAzienda ?? {}).filter((r) =>
      RIGHE_INPUT.includes(r as RigaInput)
    ) as RigaInput[];
    return `Sei l'analista dell'ente creditore che ha RICEVUTO la proposta. Il punto di partenza è il PIANO DELL'AZIENDA: non costruisci un piano tuo, lo metti alla prova. Per ogni riga del piano dell'azienda indica UNA rettifica percentuale, uguale per tutti gli anni: 0 se la riga è credibile così; negativa dove l'azienda è più ottimista del riferimento di settore e dello storico senza ragioni nei dati (per i costi, positiva se l'azienda li sottostima). Esempio: ricavi −10 = ogni anno il 10% in meno di quanto dichiara l'azienda.

Righe da rettificare (una voce ciascuna, valore tra −${max} e +${max}):
${righe.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]}`).join('\n')}

Ogni valore con una motivazione di una frase (al massimo 25 parole) che richiama il dato su cui si fonda (scostamento dal riferimento, storico, settore, fonte sull'ambiente). Il calcolo lo fa la piattaforma. ${lessicoBreve()}

${bloccoStrategia(c)}

${bloccoScelte(c)}
DATI
${testoContesto(c)}

Rispondi SOLO con JSON:
{"rettifiche": {"ricaviVendite": {"valore": -10, "motivazione": "..."}}${scelteLeve}, "lancio": ${lancioJson}, "sintesi": "tre frasi al massimo: impostazione, sacrifici e limiti"}`;
  }
  const compito =
    c.lato === 'RICEVUTA'
      ? `Sei l'analista dell'ente creditore che ha RICEVUTO la proposta. Il piano dell'azienda non è stato caricato: imposta ipotesi prudenti e documentate a partire dallo stato attuale, dallo storico e dal riferimento di settore.`
      : `Sei l'analista che REDIGE la proposta. Imposta ipotesi ragionevoli e documentate che, se i dati lo consentono, generino la cassa per pagare le rate della proposta, restando entro valori plausibili rispetto a storico e settore. Se le rate non si possono coprire con ipotesi plausibili, non forzare: dillo nella sintesi.`;
  return `${compito}

Imposti le righe del piano a partire dallo STATO ATTUALE (il primo esercizio dello storico; il passato non si modifica). Il calcolo (EBITDA, utile, cassa, copertura delle rate) lo fa la piattaforma. Righe e forma:
${RIGHE_INPUT.map((r) => `- ${r}: ${ETICHETTA_RIGA[r]} — ${r === 'aliquotaImposte' ? '"abs", aliquota in %' : RIGHE_FLUSSO.has(r) ? '"abs", euro per anno' : '"pct", variazione % annua'}`).join('\n')}

PER RICAVI E COSTI SCRIVI UNA SERIE: un valore per ogni anno del piano, in ordine, come in "ricaviVendite": [ {...}, {...} ]. Per le altre righe basta un valore, che vale per tutti gli anni. Ogni valore con una motivazione di una frase (al massimo 25 parole) che richiama il dato su cui si fonda. Variazioni % tra -${max} e +${max}. ${lessicoBreve()}

${bloccoStrategia(c)}

${bloccoScelte(c)}
DATI
${testoContesto(c)}

Rispondi SOLO con JSON:
{"ipotesi": {"ricaviVendite": [{"tipo": "pct", "valore": 3, "motivazione": "..."}, {"tipo": "pct", "valore": 4, "motivazione": "..."}], "costiOperativi": [{"tipo": "pct", "valore": 1, "motivazione": "..."}, {"tipo": "pct", "valore": 2, "motivazione": "..."}], "investimenti": {"tipo": "abs", "valore": 25000, "motivazione": "..."}}${scelteLeve}, "lancio": ${lancioJson}, "sintesi": "tre frasi al massimo: impostazione, sacrifici e limiti"}`;
}

export interface EsitoElaborazione {
  ipotesi: IpotesiPiano;
  /** Solo nel modo rettifiche (Ricevente con il piano dell'azienda). */
  rettifiche?: Rettifiche;
  sintesi: string;
  scartati: string[];
  /**
   * Le scelte che reggono il piano: le leve e il lancio (procedura, offerta,
   * anni di restituzione, impostazione). Undefined quando l'AI non le ha
   * proposte: in quel caso restano quelle già scelte, non si azzerano.
   */
  leve?: LeveSimulazione;
  lancio?: LancioPiano;
}

/** Le leve proposte dall'AI: solo se il modello le ha scritte, tutte e cinque. */
export function leggiLeve(json: unknown): LeveSimulazione | undefined {
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (!obj.leve || typeof obj.leve !== 'object' || Array.isArray(obj.leve)) return undefined;
  const o = obj.leve as Record<string, unknown>;
  if (!LEVE.some((l) => o[l.id] && typeof o[l.id] === 'object')) return undefined;
  const valide = leveValide(obj.leve);
  for (const l of LEVE)
    if (valide[l.id].motivazione)
      valide[l.id].motivazione = motivazionePulita(valide[l.id].motivazione!, 240);
  return valide;
}

/** Il lancio proposto dall'AI: valori ammessi soltanto, altrimenti i predefiniti. */
export function leggiLancio(json: unknown): LancioPiano | undefined {
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (!obj.lancio || typeof obj.lancio !== 'object' || Array.isArray(obj.lancio)) return undefined;
  return lancioPianoValido(obj.lancio);
}

/** Ripulisce una motivazione dai termini non ammessi (sostituzione deterministica, nessuna nuova chiamata). */
export function motivazionePulita(testo: string, massimo = 300): string {
  let t = testo.replace(/\s+/g, ' ').trim().slice(0, massimo);
  for (const s of SOSTITUZIONI_DIRETTE)
    t = t.replace(new RegExp(s.modello.source, s.modello.flags), s.con);
  for (const r of cercaTerminiLessico(t, {
    classi: ['VIETATO_AUTOMATICO', 'RISERVATO_PROFESSIONISTA'],
  }).reverse()) {
    t =
      t.slice(0, r.posizione) + r.voce.formulaSostitutiva + t.slice(r.posizione + r.trovato.length);
  }
  return t;
}

const NOTA_COME_PRIMA = 'Non indicato dall’AI: come l’anno prima.';

/**
 * Celle lasciate vuote dal modello in una riga che ha toccato: si riempiono
 * con il significato dichiarato («come l'anno prima») — 0% per le variazioni,
 * lo stesso valore per i valori assoluti — invece di restare vuote.
 */
function completaRiga(r: RigaInput, arr: (Ipotesi | null)[]): (Ipotesi | null)[] {
  let prec: Ipotesi | null = null;
  return arr.map((ip) => {
    if (ip) {
      prec = ip;
      return ip;
    }
    // «Come l'anno prima» vale per ogni tipo di riga: una crescita dichiarata
    // continua, non si azzera nell'anno che il modello non ha scritto.
    if (prec) return { tipo: prec.tipo, valore: prec.valore, motivazione: NOTA_COME_PRIMA };
    if (r === 'aliquotaImposte') return null;
    return {
      tipo: RIGHE_FLUSSO.has(r) ? 'abs' : 'pct',
      valore: 0,
      motivazione: NOTA_COME_PRIMA,
    };
  });
}

/** Valida la risposta del modello: solo righe, tipi e intervalli ammessi. */
export function validaRisposta(
  json: unknown,
  orizzonte: number,
  opzioni?: OpzioniSimulazione
): EsitoElaborazione {
  const max = opzioni?.variazioneMassimaPct ?? VARIAZIONE_MASSIMA_PREDEFINITA;
  const scartati: string[] = [];
  const ipotesi: IpotesiPiano = {};
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const grezze = (obj.ipotesi && typeof obj.ipotesi === 'object' ? obj.ipotesi : {}) as Record<
    string,
    unknown
  >;
  for (const [riga, grezzo] of Object.entries(grezze)) {
    let valori: unknown = grezzo;
    if (!RIGHE_INPUT.includes(riga as RigaInput)) {
      scartati.push(`riga sconosciuta «${riga}»`);
      continue;
    }
    const r = riga as RigaInput;
    // Una manopola: un solo valore per la riga, uguale per tutti gli anni.
    if (valori && typeof valori === 'object' && !Array.isArray(valori))
      valori = Array.from({ length: orizzonte }, () => grezzo);
    if (!Array.isArray(valori)) continue;
    const celle = valori as unknown[];
    const arr: (Ipotesi | null)[] = Array.from({ length: orizzonte }, (_, i) => {
      const v = celle[i] as Record<string, unknown> | null | undefined;
      if (!v || typeof v !== 'object') return null;
      const valore = Number(v.valore);
      let tipo = v.tipo === 'abs' ? 'abs' : 'pct';
      if (RIGHE_FLUSSO.has(r)) tipo = 'abs';
      if (!Number.isFinite(valore)) return null;
      if (r === 'aliquotaImposte' && (valore < 0 || valore > 60)) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: ${valore}% fuori intervallo`);
        return null;
      }
      if (r !== 'aliquotaImposte' && tipo === 'pct' && Math.abs(valore) > max) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: ${valore}% fuori intervallo`);
        return null;
      }
      if (tipo === 'abs' && (valore < 0 || valore > 1e12)) {
        scartati.push(`${ETICHETTA_RIGA[r]} anno ${i + 1}: valore non ammesso`);
        return null;
      }
      const motivazione = typeof v.motivazione === 'string' ? motivazionePulita(v.motivazione) : '';
      return {
        tipo: tipo as 'pct' | 'abs',
        valore: Math.round(valore * 100) / 100,
        ...(motivazione ? { motivazione } : {}),
      };
    });
    if (arr.some(Boolean)) ipotesi[r] = completaRiga(r, arr);
  }
  // Righe non toccate: scritte esplicite («invariato»), così la tabella non
  // ha celle vuote accanto a celle piene. L'aliquota resta quella implicita.
  const toccate = Object.keys(ipotesi).length > 0;
  for (const r of RIGHE_INPUT) {
    if (!toccate || ipotesi[r] || r === 'aliquotaImposte') continue;
    ipotesi[r] = Array.from({ length: orizzonte }, () => ({
      tipo: RIGHE_FLUSSO.has(r) ? ('abs' as const) : ('pct' as const),
      valore: 0,
    }));
  }
  // L'aliquota che l'AI non decide è quella dello spazio, non il 27,9% del
  // motore: altrimenti il parametro resterebbe scritto e mai applicato.
  if (opzioni?.aliquotaImposteDefault !== undefined && !ipotesi.aliquotaImposte) {
    ipotesi.aliquotaImposte = Array.from({ length: orizzonte }, () => ({
      tipo: 'abs' as const,
      valore: opzioni.aliquotaImposteDefault!,
    }));
  }
  const sintesi = typeof obj.sintesi === 'string' ? motivazionePulita(obj.sintesi, 600) : '';
  return { ipotesi, sintesi, scartati, leve: leggiLeve(json), lancio: leggiLancio(json) };
}

/** Valida le rettifiche dell'AI sul piano dell'azienda. */
export function validaRettificheAi(
  json: unknown,
  righeAmmesse: RigaInput[],
  opzioni?: OpzioniSimulazione
): EsitoElaborazione {
  const max = opzioni?.variazioneMassimaPct ?? VARIAZIONE_MASSIMA_PREDEFINITA;
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const grezze = rettifichePulite(obj.rettifiche);
  const scartati: string[] = [];
  const rettifiche: Rettifiche = {};
  for (const [r, v] of Object.entries(grezze) as [
    RigaInput,
    { valore: number; motivazione?: string },
  ][]) {
    if (!righeAmmesse.includes(r)) {
      scartati.push(`riga non presente nel piano dell’azienda «${r}»`);
      continue;
    }
    if (Math.abs(v.valore) > max) {
      scartati.push(`${ETICHETTA_RIGA[r]}: ${v.valore}% fuori intervallo`);
      continue;
    }
    rettifiche[r] = {
      valore: v.valore,
      ...(v.motivazione ? { motivazione: motivazionePulita(v.motivazione) } : {}),
    };
  }
  const sintesi = typeof obj.sintesi === 'string' ? motivazionePulita(obj.sintesi, 600) : '';
  return {
    ipotesi: {},
    rettifiche,
    sintesi,
    scartati,
    leve: leggiLeve(json),
    lancio: leggiLancio(json),
  };
}
