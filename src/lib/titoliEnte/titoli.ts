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

export type EsitoRiscontro =
  | 'CONFERMATO'
  | 'IN_CONTRASTO'
  | 'NON_VERIFICABILE'
  /** La ricerca sulle fonti è partita e non ha ancora risposto (0.133.4). */
  | 'IN_CORSO'
  | 'NON_ESEGUITO';

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
  /**
   * La procedura che l'ente segue per recuperare questo credito (0.133.0):
   * testo libero, un passo per riga. Non è un effetto sul calcolo — è il
   * «come si incassa», che la fase successiva al triage mostra, partita per
   * partita, all'operatore che la deve lavorare. null = non ancora scritta.
   */
  attivitaRecupero?: string | null;
  /**
   * L'ufficio (sede, dipendenza) a cui indirizzare la comunicazione con cui si
   * chiede all'azienda il pagamento del debito (0.133.5). Testo libero su una
   * riga: i nomi degli uffici non stanno in un elenco chiuso e cambiano da ente
   * a ente. Non è una fonte da riscontrare — è un recapito. null = non indicata.
   */
  dipendenza?: string | null;
  riscontroNorma: RiscontroFonte;
  riscontroInterno: RiscontroFonte;
  /** Materia in cui il codice cade (0.109.98); null = da assegnare. */
  materiaId?: number | null;
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
  IN_CORSO: 'In verifica',
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

/** Una riga di `titoli_ente` come arriva da Postgres (snake_case, JSONB). */
export interface RigaTitoloSalvata {
  id?: number | null;
  atto?: string | null;
  presupposto_giuridico?: string | null;
  riferimento_interno?: string | null;
  riscontro_norma?: RiscontroFonte | null;
  riscontro_interno?: RiscontroFonte | null;
}

/**
 * Che cosa il riscontro sulle fonti riguarda davvero: atto o flusso, presupposto
 * giuridico, riferimento interno. La procedura di recupero e le note dell'ente
 * NON contano — sono prassi, non fonti da verificare — e questo è il motivo per
 * cui salvare la sola procedura non deve rilanciare la ricerca né chiedere la
 * conferma su un «da riscontrare» già archiviato.
 *
 * Prima volta (nessun precedente): sì, c'è qualcosa da riscontrare.
 */
export function vociGiuridicheCambiate(
  precedente: RigaTitoloSalvata | null | undefined,
  titolo: Pick<TitoloEnte, 'atto' | 'presuppostoGiuridico' | 'riferimentoInterno'>
): boolean {
  if (!precedente) return true;
  return (
    String(precedente.atto ?? '') !== titolo.atto.trim() ||
    String(precedente.presupposto_giuridico ?? '') !== titolo.presuppostoGiuridico.trim() ||
    ((precedente.riferimento_interno as string | null) ?? null) !==
      (titolo.riferimentoInterno?.trim() || null)
  );
}

/**
 * RISCONTRO IN SECONDO PIANO (0.133.4). Il salvataggio non aspetta più l'AI:
 * la riga si scrive subito e la ricerca sulle fonti parte dopo la risposta.
 * Finché la fonte non risponde la riga porta questo stato, che non è un esito
 * — è un lavoro in corso, e va detto così a schermo.
 *
 * `eseguitoIl` segna la PARTENZA: è quello che permette di riconoscere una
 * ricerca rimasta appesa (vedi `riscontroFermo`).
 */
export function riscontroInCorso(partitoIl: string): RiscontroFonte {
  return {
    esito: 'IN_CORSO',
    estratto: null,
    url: null,
    motivo: 'Verifica sulle fonti ufficiali in corso.',
    eseguitoIl: partitoIl,
    confermatoDa: null,
  };
}

/** Dopo quanto una ricerca ancora «in verifica» si considera interrotta. */
export const MINUTI_PRIMA_DI_RIPROVARE = 3;

/**
 * Una ricerca in corso non può durare per sempre: se la funzione che la esegue
 * viene interrotta (timeout del server, chiusura del processo), la riga
 * resterebbe «in verifica» senza che nessuno la chiuda. Oltre la soglia la si
 * mostra come interrotta e si offre di riprenderla.
 *
 * Una ricerca in corso senza data di partenza è anch'essa da riprendere:
 * meglio un pulsante in più che un'attesa senza fine.
 */
export function riscontroFermo(
  r: RiscontroFonte,
  adessoMs: number,
  minuti = MINUTI_PRIMA_DI_RIPROVARE
): boolean {
  if (r.esito !== 'IN_CORSO') return false;
  if (!r.eseguitoIl) return true;
  const partito = new Date(r.eseguitoIl).getTime();
  if (Number.isNaN(partito)) return true;
  return adessoMs - partito > minuti * 60 * 1000;
}

/**
 * Quali delle due ricerche servono, dati la riga salvata e quella che si sta
 * salvando. È la regola che tiene il salvataggio leggero: si ricerca solo ciò
 * che è cambiato davvero, e si ricerca quando non c'è ancora un esito.
 *
 * Un riscontro ancora «in verifica» si riprende: o è di un salvataggio
 * precedente mai concluso, o è stato interrotto.
 */
export function riscontriDaEseguire(
  precedente: RigaTitoloSalvata | null | undefined,
  titolo: Pick<TitoloEnte, 'atto' | 'presuppostoGiuridico' | 'riferimentoInterno'>,
  dominioEnte: string | null
): { norma: boolean; interno: boolean } {
  const cambiata = vociGiuridicheCambiate(precedente, titolo);
  const daRifare = (r: RiscontroFonte | null | undefined) =>
    !r || r.esito === 'NON_ESEGUITO' || r.esito === 'IN_CORSO';
  return {
    norma:
      titolo.presuppostoGiuridico.trim() !== '' &&
      (cambiata || daRifare(precedente?.riscontro_norma)),
    interno:
      !!dominioEnte &&
      (titolo.riferimentoInterno?.trim() || '') !== '' &&
      (cambiata || daRifare(precedente?.riscontro_interno)),
  };
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
const DOMINI_AMMESSI_TUTTI: string[] = [
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
