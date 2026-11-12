// LA VERIFICA AMMINISTRATIVA NON FINISCE IN SÉ: INSTrada.
//
// L'esito amministrativo dice com'è l'azienda alla data e quanto vale il debito
// nell'ente. Da lì si aprono tre strade, e la prima decisione è quale
// imboccare: completare la verifica contabile (perché senza il dato depositato
// non si sceglie), valutare la liquidazione, oppure valutare un accordo con
// cram down. Qui quella decisione diventa una raccomandazione dichiarata, con
// i fatti che la sostengono e i limiti che la circoscrivono.
//
// REGOLE, NON GIUDIZI. Non c'è AI e non c'è una probabilità: si leggono i fatti
// già accertati dalla verifica (esito, copertura, patrimonio netto, indici oltre
// soglia, debito dell'ente, dati contabili presenti) e si applicano soglie
// dichiarate. La formula resta quella che l'utente ha chiesto — «si consiglia di
// valutare» — perché la scelta è dell'ente, non della piattaforma: qui non si
// scrive mai «si deve», né «è insolvente».
//
// Perché non entra il DSCR: dal solo bilancio non è calcolabile (manca la rata).
// Il limite è dichiarato fra i `limiti`, non nascosto.
//
// Logica pura, con i suoi test.

export type EsitoAmministrativo = 'ROSSO' | 'GIALLO' | 'ATTENZIONE_MINIMA';

/** Le quattro direzioni possibili, in ordine di precedenza. */
export type Direzione = 'CONTABILE' | 'LIQUIDAZIONE' | 'CRAM_DOWN' | 'ORDINARIO';

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
  /** Sempre nella forma «Si consiglia di valutare…»: proposta, non prescrizione. */
  titolo: string;
  sintesi: string;
  motivi: string[];
  azioni: AzioneConsigliata[];
  limiti: string[];
}

/** Oltre questo numero di indici oltre soglia il quadro contabile è grave. */
export const SOGLIA_INDICI_GRAVI = 3;

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

const LIMITI_COMUNI = [
  'La raccomandazione è un ordine di priorità fra le strade possibili, non una conclusione giuridica: la scelta resta all’ente.',
  'Il DSCR non si calcola dal bilancio depositato (serve la rata del piano): si legge sugli scenari, dove il piano di rientro la definisce.',
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
      titolo: 'Si consiglia di completare la verifica contabile prima di ogni altra scelta',
      sintesi:
        'La situazione debitoria verso l’ente è accertata, ma manca il dato contabile che dice se l’impresa può sostenerla. È il passaggio che rende confrontabili le due strade — accordo o liquidazione — invece di sceglierle a intuito.',
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
    };
  }

  // 2. QUADRO CONTABILE GRAVE: LA LIQUIDAZIONE VA VALUTATA SERIAMENTE.
  if (pnNegativo && indiciGravi) {
    motivi.push(
      `Patrimonio netto negativo (${euro(input.patrimonioNetto ?? 0)}) e ${input.indiciViolati} indici di bilancio oltre la soglia di riferimento.`
    );
    return {
      direzione: 'LIQUIDAZIONE',
      titolo: 'Si consiglia di valutare la liquidazione giudiziale',
      sintesi:
        'Il patrimonio netto è negativo e gli indici di bilancio sono oltre soglia su più dimensioni: il confronto con la liquidazione va fatto prima di qualsiasi ipotesi di accordo, e con i valori di realizzo configurati nello spazio.',
      motivi,
      azioni: [
        {
          etichetta: 'Confronta la proposta con la liquidazione',
          descrizione:
            'Realizzo in liquidazione e soddisfacimento nel cram down, per rango del credito.',
        },
        {
          etichetta: 'Apri la verifica contabile',
          descrizione:
            'Il prospetto depositato e gli indici per annualità che sostengono la lettura.',
        },
      ],
      limiti,
    };
  }

  // 3. CRITICITÀ NON GRAVE, O SEGNALAZIONE SUPERATA: L'ACCORDO VA VALUTATO.
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
      direzione: 'CRAM_DOWN',
      titolo: 'Si consiglia di valutare un accordo di ristrutturazione con cram down',
      sintesi:
        'Le criticità sono accertate ma non assumono, dai dati disponibili, la forma del quadro grave: la strada da valutare è la regolazione del debito, con il confronto rispetto alla liquidazione sempre a vista.',
      motivi,
      azioni: [
        {
          etichetta: 'Apri gli scenari',
          descrizione:
            'Accordo transattivo, liquidazione e cram down sullo stesso dato, con le soglie dell’ente.',
        },
        {
          etichetta: 'Apri la verifica contabile',
          descrizione: 'Il prospetto e gli indici su cui si regge l’ipotesi di accordo.',
        },
      ],
      limiti,
    };
  }

  // 4. NESSUNA CRITICITÀ: IL PERCORSO ORDINARIO, CON IL DEBITO A VISTA.
  return {
    direzione: 'ORDINARIO',
    titolo: 'Si consiglia di proseguire nel percorso ordinario, tenendo il debito a vista',
    sintesi:
      'Dai dati disponibili non emergono elementi che impongano di scegliere fra accordo e liquidazione. Il debito dell’ente resta il dato da presidiare, e la verifica contabile è completa: la posizione si aggiorna quando cambiano i documenti.',
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
  };
}
