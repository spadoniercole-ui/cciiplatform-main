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
  /** Come è stata trovata: per codice (certo) o per descrizione (proposta). */
  via: 'codice' | 'descrizione';
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
  const id = materiaSuggeritaPerDescrizione(`${voce} ${sezione}`, materie);
  return id === null
    ? null
    : out(
        materie.find((m) => m.id === id),
        'descrizione'
      );
}
