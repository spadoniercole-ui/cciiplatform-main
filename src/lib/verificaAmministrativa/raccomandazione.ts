// LA VERIFICA AMMINISTRATIVA NON FINISCE IN SÉ: INSTRADA.
//
// L'esito amministrativo dice com'è l'azienda alla data e quanto vale il debito
// nell'ente. Da lì si aprono tre strade, e la prima decisione è quale
// imboccare: completare la verifica contabile (perché senza il dato depositato
// non si sceglie), valutare la liquidazione, oppure valutare un accordo
// transattivo con i creditori.
//
// LE STRADE NON SI MESCOLANO (0.209.0). L'accordo transattivo è una proposta
// dell'azienda che si definisce con il VOTO dei creditori; dalla stessa
// proposta possono discendere la presentazione al tribunale (apertura della
// liquidazione giudiziale) oppure il cram down. Ma il cram down non è
// «l'accordo con un altro nome»: è un piano reso efficace con il PROVVEDIMENTO
// del giudice, anche senza quel consenso. Per questo la raccomandazione non
// scrive più «accordo con cram down»: indica il percorso, e gli esiti della
// proposta restano esiti, elencati uno per uno in `percorsi`.
//
// STRUMENTI, NON CONSIGLI (0.211.0). La piattaforma non consiglia e non guida: si leggono i fatti
// già accertati dalla verifica (esito, copertura, patrimonio netto, indici oltre
// soglia, debito dell'ente, dati contabili presenti) e si applicano soglie
// dichiarate. Le voci descrivono che cosa è disponibile e che cosa manca: la
// decisione non dipende dall'applicativo, che è uno strumento di supporto. Qui
// non si scrive mai «si deve», né «è insolvente».
//
// Perché non entra il DSCR: dal solo bilancio non è calcolabile (manca la rata).
// Il limite è dichiarato fra i `limiti`, non nascosto.
//
// Logica pura, con i suoi test.

import {
  NON_EQUIPARABILI,
  percorsiOrdinati,
  type CodicePercorso,
  type PercorsoDescritto,
} from './percorsi';

export type EsitoAmministrativo = 'ROSSO' | 'GIALLO' | 'ATTENZIONE_MINIMA';

/**
 * Le quattro direzioni possibili, in ordine di precedenza. La terza si chiama
 * per quello che è — accordo transattivo — e non per uno dei suoi esiti.
 */
export type Direzione = 'CONTABILE' | 'LIQUIDAZIONE' | 'ACCORDO_TRANSATTIVO' | 'ORDINARIO';

export interface IngressoRaccomandazione {
  esito: EsitoAmministrativo;
  fattoreDeterminante: string;
  copertura: { determinate: number; totali: number };
  /** Debito dell'ente memorizzato a fine verifica; null = non c'è. */
  debitoEnte: number | null;
  /** Bilanci XBRL in archivio per l'azienda. */
  anniXbrl: number;
  /** Parametri dell'ente compilati per questa azienda. */
  parametriPresenti: boolean;
  /** Indici di bilancio oltre soglia sull'ultimo bilancio; null = non c'è. */
  indiciViolati: number | null;
  /** Patrimonio netto dell'ultimo bilancio; null = non c'è. */
  patrimonioNetto: number | null;
}

export interface AzioneConsigliata {
  etichetta: string;
  descrizione: string;
}

export interface EsitoRaccomandazione {
  direzione: Direzione;
  /** Descrittivo: dice che cosa è disponibile, non che cosa fare. */
  titolo: string;
  sintesi: string;
  motivi: string[];
  azioni: AzioneConsigliata[];
  limiti: string[];
  /**
   * Il percorso da valutare per primo, oppure null quando la prima cosa da
   * fare non è scegliere una strada (dato incompleto o percorso ordinario).
   */
  percorsoConsigliato: CodicePercorso | null;
  /** I tre percorsi descritti, ciascuno con chi decide: quello consigliato per primo. */
  percorsi: PercorsoDescritto[];
  /** Il confine fra accordo e cram down, dichiarato per esteso. */
  nonEquiparabili: string;
}

/** Oltre questo numero di indici oltre soglia il quadro contabile è grave. */
export const SOGLIA_INDICI_GRAVI = 3;

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

const LIMITI_COMUNI = [
  'Questa lettura accosta le strade possibili e i fatti che le riguardano: non formula una scelta e non è una conclusione giuridica — la decisione resta all’ente e non dipende dalla piattaforma.',
  'Il DSCR non si calcola dal bilancio depositato (serve la rata del piano): si legge sugli scenari, dove il piano di rientro la definisce.',
  'Gli esiti della proposta sono ipotesi da valutare, non previsioni: li producono il voto dei creditori e il provvedimento del giudice.',
];

export function raccomandaDecisione(input: IngressoRaccomandazione): EsitoRaccomandazione {
  const motivi: string[] = [];
  const limiti = [...LIMITI_COMUNI];

  const contabileCompleta = input.anniXbrl > 0 && input.parametriPresenti;
  const pnNegativo = input.patrimonioNetto !== null && input.patrimonioNetto < 0;
  const indiciGravi = input.indiciViolati !== null && input.indiciViolati >= SOGLIA_INDICI_GRAVI;
  const almenoUnIndice = input.indiciViolati !== null && input.indiciViolati > 0;

  if (input.debitoEnte === null) {
    limiti.push(
      'Nessun debito dell’ente memorizzato per questa azienda: la raccomandazione non ne tiene conto, e la cifra va chiusa nella verifica amministrativa.'
    );
  } else if (input.debitoEnte > 0) {
    motivi.push(`Debito dell’ente accertato: ${euro(input.debitoEnte)}.`);
  }
  motivi.push(
    `Esito della verifica amministrativa: ${input.esito} — ${input.fattoreDeterminante.toLowerCase()}.`
  );
  motivi.push(
    `Copertura dei dati: ${input.copertura.determinate} dimensioni su ${input.copertura.totali}.`
  );

  // 1. SENZA IL DATO CONTABILE NON SI SCEGLIE.
  //    La contabile non è un approfondimento facoltativo: senza bilanci e
  //    parametri non si può dire se l'impresa sostiene il debito, e qualunque
  //    altra indicazione sarebbe una scommessa.
  if (!contabileCompleta) {
    if (input.anniXbrl === 0) {
      motivi.push('Nessun bilancio XBRL in archivio: manca il dato depositato.');
    } else {
      motivi.push(
        `${input.anniXbrl} ${input.anniXbrl === 1 ? 'annualità XBRL' : 'annualità XBRL'} in archivio, ma i parametri dell’ente non sono compilati.`
      );
    }
    return {
      direzione: 'CONTABILE',
      titolo:
        'Verifica contabile incompleta: il confronto con accordo e liquidazione non è ancora possibile',
      sintesi:
        'La situazione debitoria verso l’ente è accertata, ma manca il dato contabile che dice se l’impresa può sostenerla. Senza quel dato accordo e liquidazione non sono confrontabili: la piattaforma espone i fatti disponibili e segnala quello che manca.',
      motivi,
      azioni: [
        {
          etichetta: 'Apri la verifica contabile',
          descrizione: 'Visura storica, parametri dell’ente e bilanci XBRL: è il dato che manca.',
        },
        {
          etichetta: 'Carica i bilanci XBRL',
          descrizione: 'Almeno due annualità per calcolare la crescita e leggere gli indici.',
        },
      ],
      limiti,
      percorsoConsigliato: null,
      percorsi: percorsiOrdinati(null),
      nonEquiparabili: NON_EQUIPARABILI,
    };
  }

  // 2. QUADRO CONTABILE GRAVE: LA LIQUIDAZIONE VA VALUTATA SERIAMENTE.
  if (pnNegativo && indiciGravi) {
    motivi.push(
      `Patrimonio netto negativo (${euro(input.patrimonioNetto ?? 0)}) e ${input.indiciViolati} indici di bilancio oltre la soglia di riferimento.`
    );
    return {
      direzione: 'LIQUIDAZIONE',
      titolo: 'Quadro contabile grave: il confronto con la liquidazione giudiziale è disponibile',
      sintesi:
        'Patrimonio netto negativo e indici di bilancio oltre soglia su più dimensioni. Il confronto con la liquidazione giudiziale è disponibile, con i valori di realizzo configurati nello spazio: la liquidazione non è un piano, è l’apertura della procedura.',
      motivi,
      azioni: [
        {
          etichetta: 'Confronta la proposta con la liquidazione',
          descrizione:
            'Realizzo in liquidazione, per rango del credito, accanto al soddisfacimento offerto.',
        },
        {
          etichetta: 'Apri la verifica contabile',
          descrizione:
            'Il prospetto depositato e gli indici per annualità che sostengono la lettura.',
        },
      ],
      limiti,
      percorsoConsigliato: 'LIQUIDAZIONE_GIUDIZIALE',
      percorsi: percorsiOrdinati('LIQUIDAZIONE_GIUDIZIALE'),
      nonEquiparabili: NON_EQUIPARABILI,
    };
  }

  // 3. CRITICITÀ NON GRAVI, O SEGNALAZIONE SUPERATA: IL CONFRONTO CON L'ACCORDO È DISPONIBILE.
  //    Il percorso è la proposta da votare; cram down e apertura della
  //    liquidazione restano esiti, non sinonimi del percorso.
  if (pnNegativo || almenoUnIndice || input.esito === 'ROSSO') {
    if (pnNegativo) {
      motivi.push(`Patrimonio netto negativo (${euro(input.patrimonioNetto ?? 0)}).`);
    }
    if (almenoUnIndice) {
      motivi.push(
        `${input.indiciViolati} ${input.indiciViolati === 1 ? 'indice di bilancio oltre la soglia di riferimento' : 'indici di bilancio oltre la soglia di riferimento'}.`
      );
    }
    return {
      direzione: 'ACCORDO_TRANSATTIVO',
      titolo: 'Criticità accertate non gravi: il confronto con l’accordo transattivo è disponibile',
      sintesi:
        'Le criticità sono accertate ma non assumono, dai dati disponibili, la forma del quadro grave. Il confronto con una proposta di accordo transattivo è disponibile: l’accordo si definisce con il voto dei creditori, e dalla stessa proposta possono discendere la presentazione al tribunale con l’apertura della liquidazione giudiziale, oppure il cram down — che è un altro atto: un piano reso efficace dal provvedimento del giudice, senza il consenso dei creditori.',
      motivi,
      azioni: [
        {
          etichetta: 'Apri gli scenari',
          descrizione:
            'L’accordo transattivo sullo stesso dato, con l’esito che si sta valutando: definizione, apertura della liquidazione o cram down.',
        },
        {
          etichetta: 'Apri la verifica contabile',
          descrizione: 'Il prospetto e gli indici su cui si regge l’ipotesi di accordo.',
        },
      ],
      limiti,
      percorsoConsigliato: 'ACCORDO_TRANSATTIVO',
      percorsi: percorsiOrdinati('ACCORDO_TRANSATTIVO'),
      nonEquiparabili: NON_EQUIPARABILI,
    };
  }

  // 4. NESSUNA CRITICITÀ: IL PERCORSO ORDINARIO, CON IL DEBITO A VISTA.
  return {
    direzione: 'ORDINARIO',
    titolo: 'Nessuna criticità rilevata: resta aperto il percorso ordinario',
    sintesi:
      'Dai dati disponibili non emergono elementi che impongano di confrontare accordo e liquidazione. Il debito dell’ente resta il dato da presidiare; la verifica contabile è completa e questa lettura si aggiorna quando cambiano i documenti.',
    motivi,
    azioni: [
      {
        etichetta: 'Apri la verifica contabile',
        descrizione: 'Il prospetto depositato, con gli indici abilitati nello spazio.',
      },
      {
        etichetta: 'Apri gli scenari',
        descrizione: 'Per tenere a vista il confronto economico, se la posizione cambia.',
      },
    ],
    limiti,
    percorsoConsigliato: null,
    percorsi: percorsiOrdinati(null),
    nonEquiparabili: NON_EQUIPARABILI,
  };
}
