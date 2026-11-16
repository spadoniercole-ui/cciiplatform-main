// QUANTO UNA POSIZIONE È PRONTA PER DECIDERE (0.242.0).
//
// Le quattro verifiche dicono ciascuna se stessa. Nessuna dice la sola cosa che
// serve a chi deve decidere: «con quello che ho, posso decidere? se no, che
// cosa manca, e chi lo produce?».
//
// La regola non è una media: un blocco basta a fermare la posizione, come una
// soglia di legge superata basta a renderla rossa. Le attenzioni non bloccano
// ma vanno lette prima di firmare (una verifica scaduta, uno scenario non
// calcolabile). La differenza fra blocco e attenzione è la differenza fra «non
// posso» e «posso, sapendo questo».
//
// Logica pura, con i suoi test.

export type PaginaPosizione = 'amministrativa' | 'contabile' | 'azienda' | 'scenari';

export interface IngressiProntezza {
  amministrativa: {
    eseguita: boolean;
    esito: string | null;
    copertura: { determinate: number; totali: number } | null;
  };
  contabile: { completa: boolean; mancanti: string[] };
  azienda: { fotografata: boolean; motivo: string | null };
  scenari: { calcolabili: number; totali: number };
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
      'Le fonti del credito non quadrano: gli scenari girerebbero su una cifra diversa da quella certificata.'
    );
  } else if (input.quadratura === 'NON_VERIFICABILE') {
    attenzioni.push(
      'La quadratura del credito non è verificabile: manca una seconda fonte con cui confrontare la cifra.'
    );
  }

  if (!input.contabile.completa) {
    const mancanti = input.contabile.mancanti.filter(Boolean);
    blocchi.push(
      `La verifica contabile non è completa${
        mancanti.length > 0 ? `: manca ${mancanti.join(', ')}` : ''
      }. Senza il prospetto l’azienda non ha una fotografia da leggere.`
    );
  }

  if (!input.azienda.fotografata) {
    blocchi.push(
      input.azienda.motivo
        ? `La fotografia dell’azienda non si compone: ${input.azienda.motivo}`
        : 'La fotografia dell’azienda non si compone.'
    );
  }

  if (input.scenari.totali === 0) {
    attenzioni.push(
      'Nessuno scenario sul credito è stato calcolato: manca il confronto fra accordo, liquidazione e cram down.'
    );
  } else if (input.scenari.calcolabili < input.scenari.totali) {
    attenzioni.push(
      `${input.scenari.totali - input.scenari.calcolabili} ${
        input.scenari.totali - input.scenari.calcolabili === 1
          ? 'scenario non è calcolabile'
          : 'scenari non sono calcolabili'
      } (${input.scenari.calcolabili} su ${input.scenari.totali}): le percentuali del rango o la cassa non bastano.`
    );
  }

  if (input.validita.stato === 'da_rivedere') {
    attenzioni.push(
      `La verifica amministrativa è da rivedere (${input.validita.etichetta}): l’esito va rifatto sui documenti aggiornati prima di fondarci una decisione.`
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

  const dettaglio = !decidibile
    ? `La posizione non è decidibile: ${blocchi.length} ${blocchi.length === 1 ? 'blocco' : 'blocchi'} e ${attenzioni.length} ${attenzioni.length === 1 ? 'attenzione' : 'attenzioni'}.`
    : attenzioni.length > 0
      ? `La posizione è decidibile con ${attenzioni.length} ${attenzioni.length === 1 ? 'attenzione' : 'attenzioni'}: nessun blocco, ma qualcosa va letto prima di firmare.`
      : 'La posizione è decidibile: le quattro verifiche sono complete e il credito quadra.';

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
  if (!input.contabile.completa) {
    return { testo: 'Completare la verifica contabile con i dati mancanti.', pagina: 'contabile' };
  }
  if (!input.azienda.fotografata) {
    return {
      testo: 'Comporre la fotografia dell’azienda sui bilanci disponibili.',
      pagina: 'azienda',
    };
  }
  if (input.scenari.calcolabili < input.scenari.totali) {
    return {
      testo:
        'Completare le percentuali per rango: senza di esse gli scenari restano non calcolabili.',
      pagina: 'scenari',
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
