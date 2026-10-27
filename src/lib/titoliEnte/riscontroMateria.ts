// src/lib/titoliEnte/riscontroMateria.ts
//
// IL RISCONTRO CHE SI EREDITA DALLA MATERIA (0.139.9).
//
// Il riscontro sulle fonti verifica un'affermazione: «questo presupposto
// giuridico esiste ed è vigente» (norma) e «questo riferimento interno esiste e
// richiama quel presupposto» (riferimento interno). Ora, il codice di una
// partita che cade in una materia CONFERMATA non porta un'affermazione sua:
// porta quella della materia — il presupposto, le circolari, i messaggi — che
// l'AI ha cercato sul sito dell'ente e che una persona ha confermato. Chiedere
// al codice di rifare la stessa ricerca è lavoro doppio, e quando la ricerca
// automatica non arriva (nessuna quota, fonte non raggiungibile) produce la
// riga gialla «da riscontrare» accanto alla materia verde «confermata», che è
// esattamente quello che non si vuole leggere.
//
// IL CODICE VINCE DOVE HA UN ESITO SUO CHE CONTA. Se la ricerca del codice è
// andata a buon fine (CONFERMATO), ha trovato un contrasto (IN_CONTRASTO) o è
// in corso adesso (IN_CORSO), si legge il suo. Negli altri casi — non eseguita,
// o «da riscontrare» perché la fonte non ha risposto — vale la materia. Un
// contrasto non si nasconde mai dietro una conferma d'insieme.
//
// È la stessa regola della dipendenza e della procedura (vedi
// `lavorazioniMateria.ts`): la materia è la predefinita, il codice la scavalca
// solo con qualcosa di proprio. La differenza è che lì la provenienza del
// valore si mostra e basta, qui si mostra insieme all'esito che ne deriva.

import type { MateriaEnte, PropostaMateria } from './materie';
import type { RiscontroFonte, TitoloEnte } from './titoli';

/** Quale delle due ricerche: la norma di legge, o il riferimento interno dell'ente. */
export type CampoRiscontro = 'norma' | 'interno';

/** La parte di materia che serve a comporre il riscontro ereditato. */
export type MateriaPerRiscontro = Pick<
  MateriaEnte,
  | 'id'
  | 'nome'
  | 'stato'
  | 'presuppostoGiuridico'
  | 'riferimentiInterni'
  | 'proposta'
  | 'confermataDa'
  | 'confermataIl'
>;

export interface RiscontroEffettivo {
  riscontro: RiscontroFonte;
  /** true quando l'esito non è del codice ma della materia in cui cade. */
  dallaMateria: boolean;
  /** Il nome della materia, quando l'esito arriva da lì. */
  materia: string | null;
}

/** Esiti che sono del codice e restano suoi: non si sostituiscono. */
const ESITI_PROPRII: RiscontroFonte['esito'][] = ['CONFERMATO', 'IN_CONTRASTO', 'IN_CORSO'];

const testo = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

const primoUrl = (proposta: PropostaMateria | null): string | null =>
  proposta?.presupposti.find((p) => !!p.url)?.url ??
  proposta?.riferimenti.find((r) => !!r.url)?.url ??
  null;

/**
 * Che cosa la materia confermata copre, per il campo richiesto: il presupposto
 * giuridico (obbligatorio per confermare) e, per il riferimento interno, il
 * testo dei riferimenti o almeno le circolari proposte. Dove la materia non
 * porta quel contenuto non copre nulla, e il codice resta col suo esito: non si
 * dichiara riscontrato ciò che nessuno ha verificato.
 */
function contenutoCoperto(
  campo: CampoRiscontro,
  materia: MateriaPerRiscontro
): { coperto: boolean; estratto: string | null } {
  if (campo === 'norma') {
    const presupposto = testo(materia.presuppostoGiuridico);
    return { coperto: presupposto !== null, estratto: presupposto };
  }
  const riferimenti = testo(materia.riferimentiInterni);
  if (riferimenti) return { coperto: true, estratto: riferimenti };
  return { coperto: (materia.proposta?.riferimenti.length ?? 0) > 0, estratto: null };
}

/**
 * Il riscontro di una materia confermata, da leggere sui codici che vi cadono.
 * null quando la materia non è confermata, o quando non porta il contenuto che
 * quel campo deve verificare.
 */
export function riscontroDallaMateria(
  campo: CampoRiscontro,
  materia: MateriaPerRiscontro | null | undefined
): RiscontroFonte | null {
  if (!materia || materia.stato !== 'CONFERMATA') return null;
  const contenuto = contenutoCoperto(campo, materia);
  if (!contenuto.coperto) return null;
  return {
    esito: 'CONFERMATO',
    estratto: contenuto.estratto,
    url: primoUrl(materia.proposta),
    motivo: `Riscontro eseguito una volta per la materia «${materia.nome}»: vale per tutti i codici che vi cadono.`,
    eseguitoIl: materia.confermataIl ?? null,
    confermatoDa: materia.confermataDa ?? null,
  };
}

/**
 * Il riscontro che si legge davvero per un codice: il suo, se ha un esito suo
 * che conta; altrimenti quello della materia in cui cade.
 */
export function riscontroEffettivo(
  campo: CampoRiscontro,
  titolo: Pick<TitoloEnte, 'riscontroNorma' | 'riscontroInterno' | 'materiaId'>,
  materie: MateriaPerRiscontro[]
): RiscontroEffettivo {
  const suo = campo === 'norma' ? titolo.riscontroNorma : titolo.riscontroInterno;
  if (ESITI_PROPRII.includes(suo.esito))
    return { riscontro: suo, dallaMateria: false, materia: null };
  const materia = materie.find((m) => m.id !== null && m.id === titolo.materiaId) ?? null;
  const ereditato = riscontroDallaMateria(campo, materia);
  if (ereditato) return { riscontro: ereditato, dallaMateria: true, materia: materia!.nome };
  return { riscontro: suo, dallaMateria: false, materia: null };
}

/**
 * La riga del codice risulta riscontrata grazie alla sua materia? Serve per
 * dire in una riga sola «questo codice è coperto» senza leggere i due esiti.
 */
export function copertoDallaMateria(
  titolo: Pick<TitoloEnte, 'riscontroNorma' | 'riscontroInterno' | 'materiaId'>,
  materie: MateriaPerRiscontro[]
): boolean {
  const norma = riscontroEffettivo('norma', titolo, materie);
  const interno = riscontroEffettivo('interno', titolo, materie);
  return norma.dallaMateria || interno.dallaMateria;
}
