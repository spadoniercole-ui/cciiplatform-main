// QUANTO UNA POSIZIONE È PRONTA PER DECIDERE (0.242.0).
//
// Le quattro verifiche dicono ciascuna se stessa. Nessuna dice la sola cosa che
// serve a chi deve decidere: «con quello che ho, posso decidere? se no, che
// cosa manca, e chi lo produce?».
//
// La regola non è una media: un blocco basta a fermare la posizione, come una
// soglia di legge superata basta a renderla rossa. Le attenzioni non bloccano:
// sono cose da tenere presenti nella lettura (una verifica scaduta, una
// copertura parziale). La differenza fra blocco e attenzione è la differenza
// fra «manca il dato» e «il dato c'è, con questo limite».
//
// GLI SCENARI NON ENTRANO QUI (0.256.11). Sono l'ultimo passo di un percorso —
// vengono dopo la fotografia dell'azienda e non si anticipano alla posizione:
// chiederne il calcolo in questo riquadro faceva sembrare che la posizione
// dipendesse da una valutazione che ancora non è stata fatta.
//
// QUI SI LEGGE LA VERIFICA AMMINISTRATIVA, NON IL BILANCIO (0.256.13). Anche la
// contabile e la fotografia dell'azienda non entrano più: la posizione dell'ente
// è il credito accertato, le sue fonti e le lacune che lo riguardano. Far
// dipendere il grado della posizione da un XBRL o da una proiezione portava in
// questa pagina materia di un'altra verifica.
//
// Il testo parla di ciò che è stato letto, non di ciò che si può decidere: la
// valutazione è di chi firma, la pagina dice soltanto a che punto è la lettura.
//
// Logica pura, con i suoi test.

export type PaginaPosizione = 'amministrativa';

export interface IngressiProntezza {
  amministrativa: {
    eseguita: boolean;
    esito: string | null;
    copertura: { determinate: number; totali: number } | null;
  };
  /** L'esito della quadratura del credito. */
  quadratura: 'COERENTE' | 'DIVERGENTE' | 'NON_VERIFICABILE';
  validita: { stato: 'recente' | 'in_scadenza' | 'da_rivedere'; etichetta: string };
  /** Documenti o dati che l'azienda deve ancora produrre: non bloccano la lettura, la condizionano. */
  richiesteAperte?: number;
}

export interface ProssimoAtto {
  testo: string;
  pagina: PaginaPosizione;
}

export interface EsitoProntezza {
  grado: 'PRONTA' | 'QUASI' | 'BLOCCATA';
  decidibile: boolean;
  blocchi: string[];
  attenzioni: string[];
  prossimoAtto: ProssimoAtto | null;
  dettaglio: string;
}

/**
 * Il grado della posizione. L'ordine dei controlli è quello dell'importanza:
 * prima ciò che rende la decisione impossibile, poi ciò che la rende
 * insicura.
 */
export function valutaProntezza(input: IngressiProntezza): EsitoProntezza {
  const blocchi: string[] = [];
  const attenzioni: string[] = [];

  if (!input.amministrativa.eseguita) {
    blocchi.push(
      'La verifica amministrativa non è chiusa: senza il debito accertato non c’è credito su cui misurare nulla.'
    );
  } else {
    const copertura = input.amministrativa.copertura;
    if (copertura && copertura.determinate < copertura.totali) {
      const mancanti = copertura.totali - copertura.determinate;
      attenzioni.push(
        `L’indicatore copre ${copertura.determinate} dimensioni su ${copertura.totali}: ${mancanti} ${
          mancanti === 1 ? 'resta fuori' : 'restano fuori'
        } e l’esito vale solo per quelle lette.`
      );
    }
  }

  if (input.quadratura === 'DIVERGENTE') {
    blocchi.push(
      'Le fonti del credito non quadrano: la cifra su cui poggia la posizione non è quella certificata.'
    );
  } else if (input.quadratura === 'NON_VERIFICABILE') {
    attenzioni.push(
      'La quadratura del credito non è verificabile: manca una seconda fonte con cui confrontare la cifra.'
    );
  }

  if (input.validita.stato === 'da_rivedere') {
    attenzioni.push(
      `La verifica amministrativa è da rivedere (${input.validita.etichetta}): l’esito andrebbe rifatto sui documenti aggiornati, se lo si vuole usare.`
    );
  } else if (input.validita.stato === 'in_scadenza') {
    attenzioni.push(`La verifica amministrativa è in scadenza (${input.validita.etichetta}).`);
  }

  if ((input.richiesteAperte ?? 0) > 0) {
    attenzioni.push(
      `${input.richiesteAperte} ${input.richiesteAperte === 1 ? 'documento manca' : 'documenti mancano'} all’azienda o all’ente: la posizione si può leggere, ma non è completa.`
    );
  }

  const prossimoAtto = prossimoAttoDi(input, blocchi);
  const decidibile = blocchi.length === 0;
  const grado: EsitoProntezza['grado'] = !decidibile
    ? 'BLOCCATA'
    : attenzioni.length > 0
      ? 'QUASI'
      : 'PRONTA';

  // IL TESTO DICE A CHE PUNTO È LA LETTURA, non che cosa si può fare: «è
  // decidibile» e «prima di firmare» erano formule vincolanti in una pagina
  // che si limita a mettere in fila ciò che risulta.
  const dettaglio = !decidibile
    ? `La posizione non è ancora completa: ${blocchi.length} ${
        blocchi.length === 1 ? 'dato manca' : 'dati mancano'
      }, ${attenzioni.length} ${attenzioni.length === 1 ? 'punto' : 'punti'} da tenere presenti.`
    : attenzioni.length > 0
      ? `La posizione si legge, con ${attenzioni.length} ${
          attenzioni.length === 1 ? 'punto' : 'punti'
        } da tenere presenti: nessun dato indispensabile manca.`
      : 'La posizione si legge per intero: le verifiche a monte sono complete e il credito quadra.';

  return { grado, decidibile, blocchi, attenzioni, prossimoAtto, dettaglio };
}

function prossimoAttoDi(input: IngressiProntezza, blocchi: string[]): ProssimoAtto | null {
  if (!input.amministrativa.eseguita) {
    return {
      testo: 'Chiudere la verifica amministrativa: è il dato su cui lavorano le altre tre.',
      pagina: 'amministrativa',
    };
  }
  if (input.quadratura === 'DIVERGENTE') {
    return {
      testo:
        'Allineare il credito: la verifica amministrativa e la certificazione devono dire la stessa cifra.',
      pagina: 'amministrativa',
    };
  }
  if (input.validita.stato === 'da_rivedere') {
    return {
      testo: 'Rifare la verifica amministrativa: è oltre il periodo di validità.',
      pagina: 'amministrativa',
    };
  }
  if (blocchi.length > 0) {
    return { testo: 'Risolvere i blocchi indicati qui sopra.', pagina: 'amministrativa' };
  }
  return null;
}
