// src/lib/titoliEnte/materiaVera.ts
//
// Collega una riga del V.E.R.A. alla MATERIA dell'ente (Flussi Uniemens,
// Note di rettifica, Verbali, Cartelle…) — la «tipologia di credito» che
// l'ente ha mappato con i suoi riferimenti di legge.
//
// Prima la riga del V.E.R.A. aveva solo la CATEGORIA DI CALCOLO, che viene
// dal titolo di sezione: in triage non è mappata, e la tabella mostrava
// «Non classificato» anche per un «TS 27 flusso Uniemens non versato» il cui
// codice 27 l'ente aveva già ricondotto, con le norme, alla sua materia.
//
// Ordine: codice di partita → titolo → materia; codice fra i codici
// indicativi della materia; descrizione (stessa euristica dell'assegnazione
// dei codici). Nessuna corrispondenza = null, mai una materia inventata.

import { materiaSuggeritaPerDescrizione, type StatoMateria } from './materie';
import { titoloPerCodice, type TitoloEnte } from './titoli';

export interface MateriaMinima {
  id: number;
  nome: string;
  codiciIndicativi: string | null;
  stato: StatoMateria;
}

export interface MateriaRigaVera {
  id: number;
  nome: string;
  confermata: boolean;
  /**
   * Come è stata trovata: per codice (certo), dalla voce della posizione, o
   * dal solo titolo della sezione (l'ultimo ripiego, quando la voce non dice
   * niente). Le tre vie si distinguono perché non valgono lo stesso: il codice
   * è un fatto, la voce è una lettura, il titolo di sezione è un contenitore.
   */
  via: 'codice' | 'voce' | 'sezione';
}

/** Codice di partita nella voce: «TS 27 flusso…» → 27; «18 - Verbale…» → 18. */
export function codiceDaVoceVera(voce: string): string | null {
  const ts = voce.match(/\bTS\s*0*(\d{1,4})\b/i);
  if (ts) return ts[1];
  const lead = voce.match(/^\s*0*(\d{1,4})\s*[-–—:]/);
  return lead ? lead[1] : null;
}

const normCodice = (c: string) =>
  c
    .trim()
    .replace(/^0+(?=\d)/, '')
    .toUpperCase();

export function materiaPerRigaVera(
  voce: string,
  sezione: string,
  titoli: Pick<TitoloEnte, 'codice' | 'materiaId'>[],
  materie: MateriaMinima[]
): MateriaRigaVera | null {
  const out = (m: MateriaMinima | undefined, via: MateriaRigaVera['via']) =>
    m ? { id: m.id, nome: m.nome, confermata: m.stato === 'CONFERMATA', via } : null;

  const codice = codiceDaVoceVera(voce);
  if (codice) {
    const t = titoloPerCodice(titoli as TitoloEnte[], codice);
    if (t?.materiaId) {
      const r = out(
        materie.find((m) => m.id === t.materiaId),
        'codice'
      );
      if (r) return r;
    }
    const c = normCodice(codice);
    const perIndicativi = materie.find((m) =>
      (m.codiciIndicativi ?? '')
        .split(/[\s,;/]+/)
        .filter(Boolean)
        .some((x) => normCodice(x) === c)
    );
    if (perIndicativi) return out(perIndicativi, 'codice');
  }
  // LA VOCE CONTA PIÙ DELLA SEZIONE.
  //
  // Le due cose si leggevano insieme ("voce sezione") e la sezione poteva
  // decidere per tutte le sue righe: in un file il cui titolo è «FLUSSI
  // UNIEMENS» ogni posizione senza codice diventava «flussi», compresi i
  // verbali di evasione, che hanno una materia e un ufficio propri. La voce è
  // il fatto più preciso — «Verbale Evasione» dice che cos'è quel debito, il
  // titolo dice solo in che parte del file sta — quindi si prova prima da
  // sola; il titolo entra solo se la voce non basta.
  const perVoce = materiaSuggeritaPerDescrizione(voce, materie);
  if (perVoce !== null) {
    return out(
      materie.find((m) => m.id === perVoce),
      'voce'
    );
  }
  const id = materiaSuggeritaPerDescrizione(`${voce} ${sezione}`, materie);
  return id === null
    ? null
    : out(
        materie.find((m) => m.id === id),
        'sezione'
      );
}
