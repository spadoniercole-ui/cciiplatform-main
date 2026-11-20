// L'INTERPOLAZIONE DELLE DUE VERIFICHE (0.252.0).
//
// La verifica amministrativa racconta una storia: il debito accertato, i
// versamenti, le note integrative, la copertura delle dimensioni. La contabile
// racconta i numeri: patrimonio, indici, differenziali, simulazione. Finora la
// verifica aziendale le affiancava — una card per una, poi la fotografia e i
// tre scenari. Affiancare non è interpolare: chi deve rilasciare una
// fotografia all'ente ha bisogno di sapere dove le due letture dicono la stessa
// cosa, dove si contraddicono e che cosa resta fuori.
//
// Qui si incrociano cinque temi, gli stessi che l'ente porta al tavolo:
//
//   CREDITO      quanto l'ente vanta e quanto il bilancio dichiara
//   SEGNALI      l'esito amministrativo e gli indici contabili oltre soglia
//   CONTINUITÀ   ciò che gli amministratori dichiarano e ciò che il patrimonio dice
//   CASSA        la capacità di risposta e il credito vantato
//   PERIMETRO    le dimensioni coperte dall'una e dall'altra
//
// Ogni incrocio dichiara la sua natura — concorde, divergente, o con una sola
// delle due letture — e ciò che significa leggerle insieme. Una divergenza non
// si spegne: si spiega, com'è nella `confrontoLetture` della Posizione.
//
// Logica pura, con i suoi test. Nessun accesso al database, nessun giudizio
// giuridico: la decisione resta di chi firma.

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';

export type NaturaIncrocio = 'CONCORDE' | 'DIVERGENTE' | 'SOLO_AMMINISTRATIVA' | 'SOLO_CONTABILE';

export interface Incrocio {
  codice: string;
  tema: string;
  /** Ciò che dice la verifica amministrativa, in una riga. */
  amministrativa: string;
  /** Ciò che dice la verifica contabile, in una riga. */
  contabile: string;
  natura: NaturaIncrocio;
  /** Che cosa significa leggerle insieme. */
  lettura: string;
  /** L'errore che la lettura evita; null quando le due letture concordano. */
  rischio: string | null;
}

export interface BloccoDaRilasciare {
  titolo: string;
  testo: string;
}

export interface FotografiaComplessiva {
  /** La posizione in una frase, senza aggettivi di giudizio. */
  sintesi: string;
  incroci: Incrocio[];
  concordanze: number;
  divergenze: number;
  /** Ciò che manca perché la fotografia sia completa, nominate. */
  lacune: string[];
  /** Le voci che il documento consegnato all'ente deve portare. */
  daRilasciare: BloccoDaRilasciare[];
  avvertenze: string[];
}

export interface LetturaAmministrativa {
  esito: 'ROSSO' | 'GIALLO' | 'ATTENZIONE_MINIMA' | null;
  etichetta: string | null;
  fattore: string | null;
  copertura: { determinate: number; totali: number } | null;
  /** Il credito vantato: il debito accertato. */
  credito: number | null;
  debitoIl: string | null;
  accertato: string[];
  daAccertare: string[];
}

export interface LetturaContabile {
  /** Gli anni del prospetto, con il loro tipo (storico o calcolato). */
  anni: { anno: number; tipo: 'STORICO' | 'CALCOLATO'; dati: DatiFinanziariPeriodo }[];
  indiciViolati: number | null;
  annoVerifica: number | null;
  capacita: {
    esito: 'INTEGRALE' | 'PARZIALE' | 'NON_CALCOLABILE';
    coperturaPct: number | null;
    scoperto: number | null;
    disponibilita: number | null;
    dettaglio: string;
  } | null;
  ponte: { debitoContabileUltimo: number; debitoVerificato: number; differenza: number } | null;
  nota: { continuita: string | null; sezioni: string[] } | null;
}

export interface IngressoInterpolazione {
  amministrativa: LetturaAmministrativa | null;
  contabile: LetturaContabile | null;
}

const euro = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n).toLocaleString('it-IT')} €` : null;

const TASSO = (n: number | null) =>
  typeof n === 'number' && Number.isFinite(n)
    ? `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
    : null;

/** Tolleranza dell'euro: due letture dello stesso stock non si scostano di più. */
const TOLLERANZA = 1;

export function interpolaVerifiche(input: IngressoInterpolazione): FotografiaComplessiva {
  const a = input.amministrativa;
  const c = input.contabile;
  const incroci: Incrocio[] = [];
  const lacune: string[] = [];
  const avvertenze: string[] = [];

  // ---- 1. Il credito dell'ente ---------------------------------------------
  if (a?.credito !== null && a?.credito !== undefined) {
    const credito = a.credito;
    const ponte = c?.ponte ?? null;
    if (ponte) {
      const coperto = credito <= ponte.debitoContabileUltimo + TOLLERANZA;
      incroci.push({
        codice: 'CREDITO',
        tema: 'Il credito dell’ente e il debito dichiarato',
        amministrativa: `Credito accertato ${euro(credito)}${a.debitoIl ? ` (${a.debitoIl})` : ''}.`,
        contabile: `Ultimo bilancio: ${euro(ponte.debitoContabileUltimo)} fra debiti tributari e previdenziali; differenza ${euro(ponte.differenza)}.`,
        natura: coperto ? 'DIVERGENTE' : 'CONCORDE',
        lettura: coperto
          ? 'Il credito vantato è coperto dal debito che il bilancio dichiara: la verifica amministrativa non aggiunge nulla allo stock contabile, e l’eventuale recupero si misura sul dichiarato.'
          : 'Il credito accertato supera il debito dichiarato: la differenza è la crescita del debito nel periodo che la contabile ricostruisce come voce dell’ente, presunzione dichiarata e non stima.',
        rischio: coperto
          ? 'Leggere la differenza come crescita quando è il contrario: il bilancio dichiara più di quanto l’ente vanta, e la quota in più va spiegata, non sommata.'
          : null,
      });
    } else {
      incroci.push({
        codice: 'CREDITO',
        tema: 'Il credito dell’ente e il debito dichiarato',
        amministrativa: `Credito accertato ${euro(credito)}.`,
        contabile:
          'Il prospetto non porta i debiti tributari e previdenziali: il confronto con il bilancio non si compone.',
        natura: 'SOLO_AMMINISTRATIVA',
        lettura:
          'Il credito vantato è un fatto dell’amministrativa. Senza la voce del bilancio non si può dire se il debito sia cresciuto nel periodo ricostruito.',
        rischio: null,
      });
      lacune.push(
        'Il prospetto non espone i debiti tributari e previdenziali: il debito non si confronta con il bilancio.'
      );
    }
  } else {
    lacune.push(
      'Credito dell’ente non accertato: la verifica amministrativa non ha chiuso il debito.'
    );
  }

  // ---- 2. I segnali: esito amministrativo e indici contabili ----------------
  if (a && c) {
    const indici = c.indiciViolati;
    const rosso = a.esito === 'ROSSO';
    if (indici !== null) {
      const concordi = (rosso && indici > 0) || (!rosso && indici === 0);
      incroci.push({
        codice: 'SEGNALI',
        tema: 'L’esito amministrativo e gli indici di bilancio',
        amministrativa: `${a.etichetta ?? a.esito ?? 'esito non letto'}${a.fattore ? ` — ${a.fattore}` : ''}.`,
        contabile:
          indici === 0
            ? 'Nessun indice diagnostico oltre la soglia di riferimento.'
            : `${indici} ${indici === 1 ? 'indice diagnostico' : 'indici diagnostici'} oltre la soglia di riferimento.`,
        natura: concordi ? 'CONCORDE' : 'DIVERGENTE',
        lettura: concordi
          ? indici > 0
            ? 'Le due verifiche concordano: l’attenzione amministrativa e il bilancio segnalano la stessa posizione.'
            : 'Le due verifiche concordano: nessun segnale né dall’amministrativa né dal bilancio.'
          : rosso
            ? 'L’amministrativa segnala e il bilancio no: l’attenzione nasce da fatti che il bilancio non misura — esposizione verso l’ente, versamenti, ritardi.'
            : 'Il bilancio segnala e l’amministrativa no: gli indici leggono una tensione che il rapporto con l’ente non mostra ancora.',
        rischio: concordi
          ? null
          : 'Tenere la sola lettura favorevole: un fatto amministrativo non si cancella con un indice in soglia, e un indice oltre soglia non si cancella con un rapporto regolare.',
      });
    } else {
      incroci.push({
        codice: 'SEGNALI',
        tema: 'L’esito amministrativo e gli indici di bilancio',
        amministrativa: `${a.etichetta ?? a.esito ?? 'esito non letto'}.`,
        contabile:
          'Il prospetto non porta indici calcolabili: la lettura diagnostica del bilancio manca.',
        natura: 'SOLO_AMMINISTRATIVA',
        lettura:
          'L’esito amministrativo resta l’unico segnale: senza indici non c’è una seconda lettura con cui confrontarlo.',
        rischio: null,
      });
      lacune.push(
        'Nessun indice di bilancio calcolabile: la diagnostica contabile non è disponibile.'
      );
    }
  } else if (a && !c) {
    incroci.push({
      codice: 'SEGNALI',
      tema: 'L’esito amministrativo e gli indici di bilancio',
      amministrativa: `${a.etichetta ?? a.esito ?? 'esito non letto'}.`,
      contabile: 'Nessun dato contabile: la contabile non è stata eseguita.',
      natura: 'SOLO_AMMINISTRATIVA',
      lettura:
        'La posizione si legge sulla sola verifica amministrativa: non c’è un bilancio su cui confrontarla.',
      rischio: null,
    });
    lacune.push('Verifica contabile non eseguita: manca il lato numerico della posizione.');
  }

  // ---- 3. Continuità dichiarata e patrimonio -------------------------------
  const ultimo = c?.anni[c.anni.length - 1] ?? null;
  const patrimonio = ultimo?.dati.patrimonioNetto ?? null;
  if (c && patrimonio !== null) {
    const continuita = c.nota?.continuita ?? null;
    if (continuita) {
      const negativo = patrimonio < 0;
      incroci.push({
        codice: 'CONTINUITA',
        tema: 'La continuità dichiarata e il patrimonio',
        amministrativa: 'Nota integrativa: gli amministratori dichiarano la continuità aziendale.',
        contabile: `Patrimonio netto ${euro(patrimonio)} nel ${ultimo?.anno ?? 'ultimo anno'}.`,
        natura: negativo ? 'DIVERGENTE' : 'CONCORDE',
        lettura: negativo
          ? 'La dichiarazione di continuità convive con un patrimonio netto negativo: la dichiarazione è un’assunzione degli amministratori, il patrimonio è un fatto di bilancio.'
          : 'La dichiarazione di continuità non è smentita dal patrimonio: il fatto di bilancio e la dichiarazione stanno nello stesso verso.',
        rischio: negativo
          ? 'Riportare la continuità come se fosse accertata: è ciò che l’azienda dichiara, e il documento deve dire che il patrimonio la contraddice.'
          : null,
      });
    } else {
      incroci.push({
        codice: 'CONTINUITA',
        tema: 'La continuità dichiarata e il patrimonio',
        amministrativa: 'La nota integrativa non porta una dichiarazione di continuità leggibile.',
        contabile: `Patrimonio netto ${euro(patrimonio)} nel ${ultimo?.anno ?? 'ultimo anno'}.`,
        natura: 'SOLO_CONTABILE',
        lettura:
          'Sul patrimonio si legge un fatto; sulla continuità non c’è nulla da confrontare, e il documento non la presume.',
        rischio: null,
      });
      lacune.push('Nessuna dichiarazione di continuità leggibile nella nota integrativa.');
    }
  }

  // ---- 4. La cassa e il credito -------------------------------------------
  if (c?.capacita && c.capacita.esito !== 'NON_CALCOLABILE') {
    const copertura = TASSO(c.capacita.coperturaPct);
    incroci.push({
      codice: 'CASSA',
      tema: 'La capacità di risposta e il credito',
      amministrativa:
        a?.credito != null
          ? `Credito vantato ${euro(a.credito)}.`
          : 'Credito vantato non accertato.',
      contabile:
        c.capacita.esito === 'INTEGRALE'
          ? `La cassa al ${c.annoVerifica ?? 'anno della verifica'} copre il credito${copertura ? ` (${copertura})` : ''}.`
          : `La cassa copre ${copertura ?? 'una parte'} del credito: restano scoperti ${euro(c.capacita.scoperto) ?? '—'}.`,
      natura: c.capacita.esito === 'INTEGRALE' ? 'CONCORDE' : 'DIVERGENTE',
      lettura:
        c.capacita.esito === 'INTEGRALE'
          ? 'La posizione ha una capacità di risposta piena: il credito è coperto dalla cassa che l’azienda ha alla data.'
          : 'La capacità di risposta non è piena: il credito è coperto solo in parte, e la differenza è quello che la proposta deve colmare con il flusso o con il tempo.',
      rischio:
        c.capacita.esito === 'INTEGRALE'
          ? null
          : 'Confondere la copertura parziale con un recupero: la cassa non è l’incasso, e la parte scoperta resta un credito da procedure o da piano.',
    });
  } else if (c) {
    incroci.push({
      codice: 'CASSA',
      tema: 'La capacità di risposta e il credito',
      amministrativa:
        a?.credito != null
          ? `Credito vantato ${euro(a.credito)}.`
          : 'Credito vantato non accertato.',
      contabile:
        c.capacita?.dettaglio ?? 'La capacità di risposta non è calcolabile sui dati in archivio.',
      natura: 'SOLO_AMMINISTRATIVA',
      lettura:
        'La capacità di risposta non si misura: il documento non la presume e non la sostituisce con la cassa dichiarata.',
      rischio: null,
    });
    lacune.push(c.capacita?.dettaglio ?? 'Capacità di risposta non calcolabile.');
  }

  // ---- 5. Il perimetro delle due letture -----------------------------------
  if (a?.copertura) {
    const scoperte = a.copertura.totali - a.copertura.determinate;
    if (scoperte > 0) {
      incroci.push({
        codice: 'PERIMETRO',
        tema: 'Il perimetro della verifica amministrativa',
        amministrativa: `${a.copertura.determinate} dimensioni su ${a.copertura.totali} determinate.`,
        contabile: c
          ? 'La contabile porta il lato numerico della posizione.'
          : 'Nessun dato contabile.',
        natura: c ? 'CONCORDE' : 'SOLO_AMMINISTRATIVA',
        lettura: c
          ? 'La lacuna amministrativa è in parte compensata dalla contabile, che misura il patrimonio e la struttura: resta però una dimensione che né l’una né l’altra coprono.'
          : 'La lacuna resta: mancano sia la dimensione amministrativa sia il lato contabile.',
        rischio: null,
      });
      lacune.push(
        `${scoperte} ${scoperte === 1 ? 'dimensione amministrativa non determinata' : 'dimensioni amministrative non determinate'}.`
      );
    }
  }
  for (const voce of a?.daAccertare ?? []) lacune.push(voce);

  // ---- La sintesi e ciò che si rilascia -----------------------------------
  const concordanze = incroci.filter((i) => i.natura === 'CONCORDE').length;
  const divergenze = incroci.filter((i) => i.natura === 'DIVERGENTE').length;
  const parziali = incroci.filter(
    (i) => i.natura === 'SOLO_AMMINISTRATIVA' || i.natura === 'SOLO_CONTABILE'
  ).length;

  const esitoParola =
    a?.esito === 'ROSSO'
      ? 'attenzione alta'
      : a?.esito === 'GIALLO'
        ? 'attenzione'
        : a?.esito === 'ATTENZIONE_MINIMA'
          ? 'attenzione contenuta'
          : 'esito amministrativo non letto';

  const sintesi =
    incroci.length === 0
      ? 'Le due verifiche non hanno ancora elementi da incrociare: la fotografia complessiva si compone quando ci sono il credito accertato e il prospetto contabile.'
      : `La posizione è in ${esitoParola}; delle ${incroci.length} letture incrociate, ${concordanze} concordano, ${divergenze} divergono${
          parziali > 0
            ? ` e ${parziali} ${parziali === 1 ? 'resta su una sola verifica' : 'restano su una sola verifica'}`
            : ''
        }. Credito vantato ${euro(a?.credito ?? null) ?? 'non accertato'}; patrimonio netto ${euro(patrimonio) ?? 'non disponibile'} al ${ultimo?.anno ?? '—'}.`;

  const daRilasciare: BloccoDaRilasciare[] = [];
  if (a) {
    daRilasciare.push({
      titolo: 'Ciò che l’ente vanta',
      testo: `Credito ${euro(a.credito) ?? 'non accertato'}${a.debitoIl ? `, accertato il ${a.debitoIl}` : ''}. Esito amministrativo: ${a.etichetta ?? a.esito ?? 'non letto'}${a.fattore ? ` (${a.fattore})` : ''}.`,
    });
  }
  if (c && ultimo) {
    daRilasciare.push({
      titolo: 'Ciò che dicono i numeri',
      testo: `Patrimonio netto ${euro(patrimonio) ?? '—'} al ${ultimo.anno}${
        c.indiciViolati != null
          ? `; ${c.indiciViolati} ${c.indiciViolati === 1 ? 'indice oltre soglia' : 'indici oltre soglia'} pesati sull’ultima annualità`
          : ''
      }. Gli anni calcolati sono dichiarati come tali, non come previsioni.`,
    });
    if (c.capacita && c.capacita.esito !== 'NON_CALCOLABILE') {
      daRilasciare.push({
        titolo: 'Ciò che l’azienda può rispondere',
        testo: c.capacita.dettaglio,
      });
    }
  }
  if (incroci.some((i) => i.natura === 'DIVERGENTE')) {
    daRilasciare.push({
      titolo: 'Dove le due letture divergono',
      testo: incroci
        .filter((i) => i.natura === 'DIVERGENTE')
        .map((i) => i.tema)
        .join('; '),
    });
  }
  if (lacune.length > 0) {
    daRilasciare.push({
      titolo: 'Ciò che manca per chiudere la fotografia',
      testo: lacune.join(' '),
    });
  }

  avvertenze.push(
    'La fotografia complessiva incrocia dati accertati e dati dichiarati: le divergenze si spiegano, non si compensano.'
  );
  if (c?.anni.some((y) => y.tipo === 'CALCOLATO')) {
    avvertenze.push(
      'Le annualità «calcolate» sono costruite dai differenziali, non previste: entrano nella lettura per quello che sono.'
    );
  }
  avvertenze.push(
    'Nessuna conclusione giuridica: la scelta su come procedere resta al valutatore dell’ente.'
  );

  return { sintesi, incroci, concordanze, divergenze, lacune, daRilasciare, avvertenze };
}
