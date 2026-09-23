// src/lib/titoliEnte/titoli.ts
//
// TITOLI DI CREDITO DELL'ENTE — la tabella giuridica su cui l'ente fonda il
// recupero (scelta di Ercole, 0.109.96). Il credito di un ente pubblico non
// nasce da un numero: nasce da un atto (denuncia obbligatoria non versata,
// nota di rettifica, verbale, diffida, cartella), notificato e impugnabile.
// Ogni CODICE DI PARTITA dei tracciati dell'ente e' agganciato qui al suo
// atto, al presupposto giuridico e al riferimento interno (la circolare con
// cui l'ente ha tradotto la norma in prassi operativa).
//
// La piattaforma acquisisce i crediti dell'ente come certi, liquidi ed
// esigibili sul presupposto che questi atti esistano; la verifica di
// esistenza, regolarita', notifica e termini resta all'ente, che deve essere
// in condizione di dimostrarli. La tabella serve a dire, riga per riga, CHE
// COSA l'ente deve poter produrre.
//
// Logica pura: validazione, precaricamento INPS, esiti del riscontro.

export type EsitoRiscontro = 'CONFERMATO' | 'IN_CONTRASTO' | 'NON_VERIFICABILE' | 'NON_ESEGUITO';

export interface RiscontroFonte {
  esito: EsitoRiscontro;
  /** Passo trovato, nelle parole della fonte (breve). */
  estratto: string | null;
  url: string | null;
  motivo: string | null;
  eseguitoIl: string | null;
  confermatoDa: string | null;
}

export interface TitoloEnte {
  id: number | null;
  codice: string;
  atto: string;
  presuppostoGiuridico: string;
  riferimentoInterno: string | null;
  /**
   * @deprecated dalla 0.109.97. L'elenco caricato dall'ente e' gia' al netto
   * delle partite chiuse: ogni partita presente conta, e il codice dice solo
   * il titolo. La colonna resta nel database, sempre 'NESSUNO'.
   */
  effettoCalcolo: 'NESSUNO' | 'INTERROMPE_RITARDO' | 'ESCLUDE_DA_LETTERA_A';
  note: string | null;
  riscontroNorma: RiscontroFonte;
  riscontroInterno: RiscontroFonte;
}

export const RISCONTRO_VUOTO: RiscontroFonte = {
  esito: 'NON_ESEGUITO',
  estratto: null,
  url: null,
  motivo: null,
  eseguitoIl: null,
  confermatoDa: null,
};

export const ETICHETTA_ESITO: Record<EsitoRiscontro, string> = {
  CONFERMATO: 'Confermato',
  IN_CONTRASTO: 'In contrasto',
  NON_VERIFICABILE: 'Da riscontrare',
  NON_ESEGUITO: 'Non ancora riscontrato',
};

/** Fonti ammesse per il riscontro della norma: solo quelle ufficiali dello Stato. */
export const DOMINI_NORMA = ['gazzettaufficiale.it', 'normattiva.it'];

export function validaTitolo(t: Partial<TitoloEnte>): string | null {
  if (!t.codice || !/^[A-Za-z0-9.\-/]{1,12}$/.test(t.codice.trim()))
    return 'Codice di partita mancante o non valido.';
  if (!t.atto || !t.atto.trim()) return `Codice ${t.codice}: indicare l’atto o il flusso.`;
  return null;
}

/** Trova il titolo di una partita dal suo codice (i tracciati portano codici anche con zeri o spazi). */
export function titoloPerCodice(
  titoli: TitoloEnte[],
  codice: string | null | undefined
): TitoloEnte | null {
  if (!codice) return null;
  const c = String(codice)
    .trim()
    .replace(/^0+(?=\d)/, '')
    .toUpperCase();
  return (
    titoli.find(
      (t) =>
        t.codice
          .trim()
          .replace(/^0+(?=\d)/, '')
          .toUpperCase() === c
    ) ?? null
  );
}

/** Testo per la dichiarazione di perimetro del Ricevente (frase concordata con Ercole). */
export const AVVERTENZA_TITOLI_ENTE =
  'L’elenco delle partite è caricato dall’ente al netto delle partite chiuse per infasamento all’Agente della riscossione, pagamento, utilizzo della cassa o compensazione: ogni partita presente è considerata aperta. I crediti dell’ente sono acquisiti come certi, liquidi ed esigibili sul presupposto che esistano gli atti che li fondano (denuncia non versata, nota di rettifica, verbale, diffida, cartella), notificati e non impugnati o impugnati senza esito. L’elaborato indica per ciascuna partita il titolo presunto in base al codice; la verifica dell’esistenza e della regolarità degli atti, della notifica e dei termini resta all’ente, che deve essere in condizione di dimostrarli in sede amministrativa e giudiziaria.';

/**
 * Interpreta la risposta JSON del riscontro (modello con ricerca sulle fonti
 * ufficiali). Qualsiasi difetto della risposta e' NON_VERIFICABILE: mai un
 * «confermato» per sbaglio.
 */
export function interpretaRiscontro(grezzo: unknown, eseguitoIl: string): RiscontroFonte {
  const g = grezzo && typeof grezzo === 'object' ? (grezzo as Record<string, unknown>) : {};
  const esitoG = typeof g.esito === 'string' ? g.esito.toUpperCase() : '';
  const esito: EsitoRiscontro =
    esitoG === 'CONFERMATO'
      ? 'CONFERMATO'
      : esitoG === 'IN_CONTRASTO'
        ? 'IN_CONTRASTO'
        : 'NON_VERIFICABILE';
  const url = typeof g.url === 'string' && /^https?:\/\//.test(g.url) ? g.url : null;
  // Un «confermato» senza fonte ufficiale non vale.
  const dominioOk = url !== null && DOMINI_AMMESSI_TUTTI.some((d) => url.includes(d));
  return {
    esito: esito === 'CONFERMATO' && !dominioOk ? 'NON_VERIFICABILE' : esito,
    estratto: typeof g.estratto === 'string' ? g.estratto.slice(0, 600) : null,
    url,
    motivo:
      typeof g.motivo === 'string'
        ? g.motivo.slice(0, 400)
        : esito === 'CONFERMATO' && !dominioOk
          ? 'Riscontro senza una fonte ufficiale: non può valere come conferma.'
          : null,
    eseguitoIl,
    confermatoDa: null,
  };
}

/** Riempito dalle azioni con il sito ufficiale dell'ente; qui il minimo sindacale. */
export const DOMINI_AMMESSI_TUTTI: string[] = [
  ...DOMINI_NORMA,
  'inps.it',
  'inail.it',
  'agenziaentrate.gov.it',
];

export function promptRiscontroNorma(presupposto: string, atto: string): string {
  return `Verifica su gazzettaufficiale.it o normattiva.it (nessun'altra fonte) se esiste ed è vigente questa disposizione: «${presupposto}». Deve fondare o disciplinare: «${atto}».
Rispondi SOLO con un JSON: {"esito": "CONFERMATO" | "IN_CONTRASTO" | "NON_VERIFICABILE", "estratto": "passo testuale breve della fonte, o null", "url": "indirizzo della pagina ufficiale, o null", "motivo": "una frase"}.
CONFERMATO solo se hai letto la disposizione su una delle due fonti e il suo contenuto corrisponde a ciò che deve fondare. IN_CONTRASTO se la disposizione esiste ma dice altro, o è abrogata, o l'articolo/comma indicato non corrisponde. NON_VERIFICABILE in ogni altro caso (fonte non raggiungibile, risultato ambiguo). Nessun testo fuori dal JSON.`;
}

export function promptRiscontroInterno(
  riferimento: string,
  presupposto: string,
  dominioEnte: string
): string {
  return `Verifica sul sito ${dominioEnte} (nessun'altra fonte) se esiste questo riferimento interno dell'ente: «${riferimento}», e se richiama la disposizione «${presupposto}».
Rispondi SOLO con un JSON: {"esito": "CONFERMATO" | "IN_CONTRASTO" | "NON_VERIFICABILE", "estratto": "passo breve del documento in cui compare la disposizione, o null", "url": "indirizzo del documento sul sito dell'ente, o null", "motivo": "una frase"}.
CONFERMATO solo se il documento esiste sul sito dell'ente E richiama la disposizione. IN_CONTRASTO se esiste ma non la richiama, o richiama una disposizione diversa. NON_VERIFICABILE altrimenti. Nessun testo fuori dal JSON.`;
}
