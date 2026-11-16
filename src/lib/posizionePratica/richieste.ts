// LE LACUNE DIVENTANO UNA RICHIESTA (0.242.0).
//
// Fino a ieri le lacune erano frasi dentro quattro pagine: «serve l'Elenco
// Deleghe (F24)», «la check list non è completa», «manca il bilancio». Chi deve
// agire le leggeva una per una e le ricomponeva a memoria.
//
// Qui le stesse frasi diventano un elenco di documenti, ciascuno con ciò che
// chiude e con chi lo produce. Il testo è una richiesta di documentazione, non
// un atto: nessuna valutazione giuridica, nessuna scadenza inventata.
//
// Logica pura, con i suoi test.

export type ChiProduce = 'AZIENDA' | 'ENTE';

export interface Richiesta {
  documento: string;
  /** Che cosa si sblocca quando arriva: la frase originale, non una parafrasi. */
  chiude: string;
  da: ChiProduce;
  fonte: string;
}

interface RegolaDocumento {
  prova: RegExp;
  documento: string;
  da: ChiProduce;
}

// Il dizionario è corto di proposito: riconosce ciò che la piattaforma chiede
// davvero, e per tutto il resto lascia la frase com'è. Una mappatura inventata
// sarebbe peggio di nessuna mappatura.
const REGOLE: RegolaDocumento[] = [
  { prova: /durc/i, documento: 'DURC aggiornato', da: 'AZIENDA' },
  {
    prova: /deleghe|f24/i,
    documento: 'Elenco Deleghe (F24) con le date di versamento',
    da: 'ENTE',
  },
  {
    prova: /bilancio|bilanci|xbrl/i,
    documento: 'Ultimo bilancio depositato (XBRL)',
    da: 'AZIENDA',
  },
  { prova: /visura/i, documento: 'Visura camerale aggiornata', da: 'AZIENDA' },
  {
    prova: /check\s*list|checklist/i,
    documento: 'Check list dei prodotti completata',
    da: 'AZIENDA',
  },
  {
    prova: /rateizzazione|piano di rientro|dilazione/i,
    documento: 'Piano di rateizzazione e attestazione dei pagamenti',
    da: 'AZIENDA',
  },
  { prova: /denunc|uniema/i, documento: 'Denunce contributive mancanti', da: 'AZIENDA' },
  { prova: /nota integrativa/i, documento: 'Nota integrativa dell’ultimo bilancio', da: 'AZIENDA' },
];

function riconosci(frase: string): { documento: string; da: ChiProduce } {
  for (const r of REGOLE) {
    if (r.prova.test(frase)) return { documento: r.documento, da: r.da };
  }
  return { documento: frase, da: 'AZIENDA' };
}

/**
 * Raccoglie le richieste da tutte le fonti della posizione, senza duplicati:
 * lo stesso DURC chiesto dall'indicatore e dalla check list è una richiesta
 * sola, con entrambe le frasi che spiega.
 */
export function richiesteDa(input: {
  daAccertare?: string[];
  dimensioniScoperte?: { nome: string; motivo?: string | null }[];
  mancanzeChecklist?: string[];
  flussi?: { senzaDenuncia: number; senzaDelega: number } | null;
}): Richiesta[] {
  const raccolte: Richiesta[] = [];
  const aggiungi = (frase: string, fonte: string) => {
    const testo = frase.trim();
    if (!testo) return;
    const { documento, da } = riconosci(testo);
    const esistente = raccolte.find((r) => r.documento === documento);
    if (esistente) {
      if (!esistente.chiude.includes(testo)) esistente.chiude = `${esistente.chiude} ${testo}`;
      return;
    }
    raccolte.push({ documento, chiude: testo, da, fonte });
  };

  for (const frase of input.daAccertare ?? []) aggiungi(frase, 'Indicatore di attenzione');

  for (const d of input.dimensioniScoperte ?? []) {
    aggiungi(d.motivo ? `${d.nome}: ${d.motivo}` : d.nome, 'Dimensioni scoperte');
  }

  for (const frase of input.mancanzeChecklist ?? []) aggiungi(frase, 'Check list dei prodotti');

  if (input.flussi) {
    if (input.flussi.senzaDenuncia > 0) {
      aggiungi(
        `Denunce contributive mancanti su ${input.flussi.senzaDenuncia} ${
          input.flussi.senzaDenuncia === 1 ? 'periodo' : 'periodi'
        }`,
        'Flussi dell’ente'
      );
    }
    if (input.flussi.senzaDelega > 0) {
      aggiungi(
        `Elenco Deleghe (F24): ${input.flussi.senzaDelega} ${
          input.flussi.senzaDelega === 1 ? 'periodo senza delega' : 'periodi senza delega'
        }`,
        'Flussi dell’ente'
      );
    }
  }

  // Prima ciò che l'azienda deve produrre: è la richiesta che si spedisce.
  return raccolte.sort((a, b) => (a.da === b.da ? 0 : a.da === 'AZIENDA' ? -1 : 1));
}

/**
 * Il testo da incollare in una richiesta di documentazione. Volutamente
 * asciutto: elenca documenti e ciò che sbloccano, senza formulare giudizi.
 */
export function testoRichiesta(input: {
  ragioneSociale: string;
  richieste: Richiesta[];
  data?: string | null;
}): string {
  const righe: string[] = [];
  righe.push(`Oggetto: richiesta di documentazione — ${input.ragioneSociale}`);
  if (input.data) righe.push(`Data: ${input.data}`);
  righe.push('');
  if (input.richieste.length === 0) {
    righe.push('Non risultano documenti mancanti per la posizione.');
    return righe.join('\n');
  }
  righe.push('Per completare la verifica della posizione risultano mancanti i documenti seguenti:');
  righe.push('');
  input.richieste.forEach((r, i) => {
    const chi = r.da === 'AZIENDA' ? 'a carico dell’azienda' : 'a carico dell’ente';
    righe.push(`${i + 1}. ${r.documento} (${chi})`);
    righe.push(`   Serve a: ${r.chiude}`);
  });
  righe.push('');
  righe.push(
    'La richiesta non contiene valutazioni giuridiche: serve a completare il quadro documentale della posizione.'
  );
  return righe.join('\n');
}
