// src/lib/titoliEnte/materie.ts
//
// MATERIE DELL'ENTE — la mappa ricostruita (Ercole, 0.109.98). Il flusso:
//   1. l'ente indica il sito istituzionale;
//   2. l'ente elenca le materie da riscontrare (Uniemens, note di rettifica,
//      dilazioni, variazioni dei flussi, verbali, diffide...), ciascuna con
//      eventuali codici indicativi, non vincolanti;
//   3. quando dichiara di averle caricate tutte, l'AI cerca in blocco sul
//      sito dell'ente circolari e messaggi di ogni materia, risale alla
//      norma che citano e PROPONE; una persona conferma;
//   4. i codici dell'anagrafica cadono nella materia: il titolo di una
//      partita e' quello della sua materia.
// Logica pura: tipi, normalizzazione della proposta, prompt, assegnazione
// dei codici dalla descrizione.

export type StatoMateria = 'DA_RICERCARE' | 'PROPOSTA' | 'CONFERMATA';

export interface FonteProposta {
  titolo: string;
  url: string | null;
  estratto: string | null;
}

export interface PropostaMateria {
  /** Norme che fondano il credito per questa materia. */
  presupposti: { norma: string; url: string | null; estratto: string | null }[];
  /** Circolari e messaggi dell'ente sulla materia. */
  riferimenti: { tipo: string; estremi: string; titolo: string | null; url: string | null }[];
  sintesi: string | null;
  generataIl: string;
  /** Almeno una fonte ufficiale (sito dell'ente, Normattiva, Gazzetta) fra i link. */
  conFonteUfficiale: boolean;
}

export interface MateriaEnte {
  id: number | null;
  nome: string;
  codiciIndicativi: string | null;
  presuppostoGiuridico: string | null;
  riferimentiInterni: string | null;
  proposta: PropostaMateria | null;
  stato: StatoMateria;
  confermataDa: string | null;
  confermataIl: string | null;
  /** Ultima ricerca: quando e con quale esito, anche se a vuoto. */
  esitoRicerca: string | null;
}

export const ETICHETTA_STATO_MATERIA: Record<StatoMateria, string> = {
  DA_RICERCARE: 'Da ricercare',
  PROPOSTA: 'Proposta dall’AI — da confermare',
  CONFERMATA: 'Confermata',
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const url = (v: unknown): string | null =>
  typeof v === 'string' && /^https?:\/\//.test(v) ? v : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function normalizzaProposta(
  grezzo: unknown,
  generataIl: string,
  dominiUfficiali: string[]
): PropostaMateria | null {
  const g = obj(grezzo);
  const presupposti = arr(g.presupposti)
    .map(obj)
    .filter((x) => str(x.norma))
    .map((x) => ({
      norma: str(x.norma)!,
      url: url(x.url),
      estratto: str(x.estratto)?.slice(0, 500) ?? null,
    }));
  const riferimenti = arr(g.riferimenti)
    .map(obj)
    .filter((x) => str(x.estremi))
    .map((x) => ({
      tipo: str(x.tipo) ?? 'riferimento',
      estremi: str(x.estremi)!,
      titolo: str(x.titolo),
      url: url(x.url),
    }));
  if (presupposti.length === 0 && riferimenti.length === 0) return null;
  const links = [...presupposti.map((p) => p.url), ...riferimenti.map((r) => r.url)].filter(
    (u): u is string => !!u
  );
  return {
    presupposti,
    riferimenti,
    sintesi: str(g.sintesi)?.slice(0, 800) ?? null,
    generataIl,
    conFonteUfficiale: links.some((u) => dominiUfficiali.some((d) => u.includes(d))),
  };
}

export function promptRicercaMateria(
  nome: string,
  codiciIndicativi: string | null,
  dominioEnte: string
): string {
  return `Sei un istruttore che documenta i titoli di credito di un ente pubblico. Materia: «${nome}»${codiciIndicativi ? ` (codici di partita indicativi, non vincolanti: ${codiciIndicativi})` : ''}.
Cerca sul sito ${dominioEnte} le circolari e i messaggi che disciplinano questa materia — prova più formulazioni (singolare e plurale, sigle, il nome dell'atto, «circolare», «messaggio») — e da essi risali alle norme di legge che fondano il credito dell'ente (articolo e comma). Se possibile riscontra le norme su normattiva.it o gazzettaufficiale.it. Se una ricerca non dà risultati, riprova con altri termini prima di rispondere a vuoto.
Rispondi SOLO con un JSON, senza testo attorno:
{"presupposti": [{"norma": "estremi con articolo e comma", "url": "pagina ufficiale o null", "estratto": "passo breve o null"}],
 "riferimenti": [{"tipo": "circolare|messaggio", "estremi": "n. e data", "titolo": "oggetto o null", "url": "pagina sul sito dell'ente o null"}],
 "sintesi": "due frasi su come l'ente fonda e recupera il credito in questa materia"}
Riporta solo ciò che hai letto nelle pagine trovate: nessun estremo a memoria. Se non trovi nulla, rispondi {"presupposti": [], "riferimenti": [], "sintesi": null}.`;
}

/** Proposta di materia per un codice, dalla descrizione ufficiale. Da confermare dall'ente. */
export function materiaSuggeritaPerDescrizione(
  descrizione: string,
  materie: { id: number; nome: string }[]
): number | null {
  const d = descrizione.toLowerCase();
  const regole: [RegExp, RegExp][] = [
    [/rettifica/, /rettific/],
    [/dilazion/, /dilazion/],
    [/verbale|vigilanza|ispettiv|accertamento/, /verbal|ispettiv|vigilanz|accertament/],
    [/diffida/, /diffid/],
    [/denuncia|uniemens|dm ?10|flusso|insolut/, /denunc|uniemens|flussi|dichiarativ/],
    [/regolarizzazion/, /regolarizzazion/],
    [/sanzion/, /sanzion/],
    [/compensazion|f24/, /compensazion|f24/],
    [/anf|prestazion/, /prestazion|anf/],
    [/sentenza|fallimento|giudicato/, /sentenz|giudizial|fallimen|accertamenti giudizial/],
    [/variazion|vig/, /variazion|vig/],
  ];
  for (const [rxDescr, rxMateria] of regole) {
    if (rxDescr.test(d)) {
      const m = materie.find((x) => rxMateria.test(x.nome.toLowerCase()));
      if (m) return m.id;
    }
  }
  return null;
}
