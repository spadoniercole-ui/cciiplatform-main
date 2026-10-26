// src/lib/titoliEnte/direttrici.ts
//
// DIRETTRICI → LAVORAZIONI → TITOLI.
//
// Le direttrici dell'ente (0.109.x) erano nate per lo screening: le aree lungo
// cui l'AI genera il questionario. Nella pratica un ente le scrive una volta e
// poi le ritrova come uffici — «Presidio dei flussi informativi», «Gestione del
// credito» — e finora ognuno le riscriveva a mano nel campo dipendenza delle
// lavorazioni, con la grafia del momento: un ufficio solo, tre nomi, tre
// documenti.
//
// QUI LE DIRETTRICI DIVENTANO L'ELENCO DEGLI UFFICI. Sono l'unico punto in cui
// si scrive un nome: la lavorazione della materia lo sceglie da lì, il titolo di
// credito lo eredita dalla materia, e da lì scende nelle comunicazioni ai
// reparti e nel report per unità operativa. Il confronto è per chiave (maiuscole,
// accenti, apostrofi e punteggiatura non contano), così «presidio flussi» e
// «Presidio Flussi» restano lo stesso ufficio.
//
// LA CATENA SI PUÒ GUARDARE. `componiCatenaDirettrici` dice, per ogni
// direttrice, quante lavorazioni la usano, quante materie e quanti codici di
// partita ci finiscono; e dice quello che manca — direttrici che nessuna
// lavorazione usa ancora, uffici in uso che non sono (più) tra le direttrici,
// lavorazioni e codici senza destinatario. È il controllo che tiene in piedi il
// resto: senza, la catena funziona e nessuno sa se è completa.
//
// Logica pura: nessun accesso al database, così si verifica con i test.

import { chiaveDipendenza, nomeDipendenza } from '@/lib/lavorazioni/dipendenze';
import { dipendenzaEffettiva, type LavorazioneMateria } from './lavorazioniMateria';
import type { TitoloEnte } from './titoli';

/**
 * Una direttrice: la configurazione dello spazio (nome + prodotti dello
 * screening) oppure il solo nome, che è tutto ciò che serve alla catena.
 */
export type DirettriceNome = { nome: string } | string;

const nomeDi = (d: DirettriceNome | null | undefined): string =>
  typeof d === 'string' ? d : (d?.nome ?? '');

/**
 * I nomi delle direttrici, nell'ordine in cui l'ente le ha scritte, senza i
 * doppioni (stesso nome con maiuscole o spazi diversi) e senza i vuoti.
 */
export function nomiDirettrici(direttrici: DirettriceNome[] | null | undefined): string[] {
  const viste = new Set<string>();
  const nomi: string[] = [];
  for (const d of direttrici ?? []) {
    const nome = nomeDipendenza(nomeDi(d));
    const chiave = chiaveDipendenza(nome);
    if (!chiave || viste.has(chiave)) continue;
    viste.add(chiave);
    nomi.push(nome);
  }
  return nomi;
}

/**
 * Il nome configurato della direttrice che corrisponde a `nome` (stessa chiave),
 * oppure null se non è una direttrice.
 *
 * Serve al salvataggio: chi sceglie una direttrice salva la grafia scritta nei
 * Parametri, non quella del momento.
 */
export function direttriceConfigurata(
  nome: string | null | undefined,
  direttrici: DirettriceNome[] | null | undefined
): string | null {
  const chiave = chiaveDipendenza(nome);
  if (!chiave) return null;
  for (const d of nomiDirettrici(direttrici)) {
    if (chiaveDipendenza(d) === chiave) return d;
  }
  return null;
}

/** Una direttrice con quello che ci arriva davvero. */
export interface VoceCatena {
  nome: string;
  /** Lavorazioni delle materie che dichiarano questo ufficio. */
  lavorazioni: number;
  /** Materie distinte coinvolte. */
  materie: number;
  /** Codici di partita che finiscono su questo ufficio, ereditato o proprio. */
  codici: number;
  /** Di quei codici, quanti lo dichiarano sul proprio titolo. */
  codiciPropri: number;
}

/** Un ufficio in uso che non è tra le direttrici: o è nuovo, o è stato rinominato. */
export interface UfficioFuoriElenco {
  nome: string;
  lavorazioni: number;
  codici: number;
}

export interface CatenaDirettrici {
  /** Le direttrici configurate, nel loro ordine, con i conteggi. */
  voci: VoceCatena[];
  /** Uffici usati in lavorazioni o titoli ma non configurati come direttrici. */
  fuoriElenco: UfficioFuoriElenco[];
  /** Direttrici che nessuna lavorazione usa ancora. */
  senzaLavorazioni: string[];
  /** Lavorazioni delle materie senza alcun ufficio. */
  lavorazioniSenzaUfficio: number;
  /** Codici che non arrivano a nessun ufficio (né proprio né della materia). */
  codiciSenzaUfficio: number;
}

interface Conteggio {
  nome: string;
  lavorazioni: number;
  materie: Set<number>;
  codici: number;
  codiciPropri: number;
}

/**
 * La fotografia della catena: direttrici configurate, uffici fuori elenco e
 * buchi. I titoli contano per la dipendenza EFFETTIVA (quella del codice se
 * c'è, altrimenti la prima della materia), perché è quella che finisce nel
 * documento — il conteggio deve dire dove vanno i debiti, non dove sono scritti.
 */
export function componiCatenaDirettrici(input: {
  direttrici: DirettriceNome[] | null | undefined;
  lavorazioni: LavorazioneMateria[];
  titoli: Pick<TitoloEnte, 'dipendenza' | 'materiaId'>[];
}): CatenaDirettrici {
  const nomi = nomiDirettrici(input.direttrici);
  const chiavi = new Set(nomi.map((n) => chiaveDipendenza(n)));
  const conteggi = new Map<string, Conteggio>();
  let lavorazioniSenzaUfficio = 0;
  let codiciSenzaUfficio = 0;

  const conteggio = (nome: string): Conteggio => {
    const chiave = chiaveDipendenza(nome);
    const esistente = conteggi.get(chiave);
    if (esistente) return esistente;
    const nuovo: Conteggio = {
      nome: nomeDipendenza(nome),
      lavorazioni: 0,
      materie: new Set<number>(),
      codici: 0,
      codiciPropri: 0,
    };
    conteggi.set(chiave, nuovo);
    return nuovo;
  };

  for (const l of input.lavorazioni) {
    const nome = nomeDipendenza(l.dipendenza);
    if (!nome) {
      lavorazioniSenzaUfficio++;
      continue;
    }
    const c = conteggio(nome);
    c.lavorazioni++;
    c.materie.add(l.materiaId);
  }

  for (const t of input.titoli) {
    const d = dipendenzaEffettiva(t, input.lavorazioni);
    if (!d.valore) {
      codiciSenzaUfficio++;
      continue;
    }
    const c = conteggio(d.valore);
    c.codici++;
    if (!d.dallaMateria) c.codiciPropri++;
  }

  const voci: VoceCatena[] = nomi.map((nome) => {
    const c = conteggi.get(chiaveDipendenza(nome));
    return {
      nome,
      lavorazioni: c?.lavorazioni ?? 0,
      materie: c?.materie.size ?? 0,
      codici: c?.codici ?? 0,
      codiciPropri: c?.codiciPropri ?? 0,
    };
  });

  const fuoriElenco: UfficioFuoriElenco[] = Array.from(conteggi.entries())
    .filter(([chiave]) => !chiavi.has(chiave))
    .map(([, c]) => ({ nome: c.nome, lavorazioni: c.lavorazioni, codici: c.codici }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  return {
    voci,
    fuoriElenco,
    senzaLavorazioni: voci.filter((v) => v.lavorazioni === 0).map((v) => v.nome),
    lavorazioniSenzaUfficio,
    codiciSenzaUfficio,
  };
}

/**
 * Che cosa si sposta quando un ufficio fuori elenco viene riportato a una
 * direttrice: le righe nominate, gli uffici vuoti, il nome canonico da
 * scrivere.
 */
export interface PianoRiallineamento {
  /** La grafia scritta nelle direttrici: è quella che finisce nei documenti. */
  destinazione: string;
  /** Gli id delle lavorazioni delle materie che dichiarano l'ufficio. */
  lavorazioni: number[];
  /** Gli id dei titoli che lo dichiarano sul proprio codice. */
  codici: number[];
}

export type EsitoPianoRiallineamento =
  { ok: true; piano: PianoRiallineamento } | { ok: false; error: string };

/**
 * RIPORTARE UN UFFICIO FUORI ELENCO A UNA DIRETTRICE (0.139.1).
 *
 * Il riallineamento tocca sia le lavorazioni delle materie (che lo scelgono)
 * sia i titoli che lo dichiarano sul proprio codice — sono i due posti in cui
 * un ufficio può essere scritto con un nome che non esiste più, e finché ne
 * resta uno il destinatario continua a sdoppiarsi nel documento. Il confronto è
 * per chiave, come ovunque: maiuscole, accenti e punteggiatura non contano.
 *
 * Non si indovina il significato: si sposta un nome su una direttrice che
 * l'utente ha scelto. Se l'ufficio è già una direttrice, o se non c'è nulla da
 * spostare, si dice e non si tocca niente.
 */
export function pianificaRiallineamento(input: {
  da: string | null | undefined;
  a: string | null | undefined;
  direttrici: DirettriceNome[] | null | undefined;
  lavorazioni: Pick<LavorazioneMateria, 'id' | 'dipendenza'>[];
  titoli: Pick<TitoloEnte, 'id' | 'dipendenza'>[];
}): EsitoPianoRiallineamento {
  const da = nomeDipendenza(input.da);
  const chiaveDa = chiaveDipendenza(da);
  if (!chiaveDa) return { ok: false, error: 'Indica l’ufficio da riportare a una direttrice.' };

  const nomi = nomiDirettrici(input.direttrici);
  if (nomi.some((n) => chiaveDipendenza(n) === chiaveDa))
    return { ok: false, error: `«${da}» è già una direttrice: non c’è nulla da riportare.` };

  const destinazione = direttriceConfigurata(input.a, nomi);
  if (!destinazione)
    return {
      ok: false,
      error: 'Scegli come destinazione una delle direttrici configurate (e salva prima le nuove).',
    };

  const lavorazioni = input.lavorazioni
    .filter((l) => chiaveDipendenza(l.dipendenza) === chiaveDa)
    .map((l) => l.id);
  const codici = input.titoli
    .filter((t) => chiaveDipendenza(t.dipendenza) === chiaveDa)
    .map((t) => t.id)
    .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0);

  if (lavorazioni.length === 0 && codici.length === 0)
    return { ok: false, error: `Nessuna lavorazione o codice dichiara più «${da}».` };

  return { ok: true, piano: { destinazione, lavorazioni, codici } };
}
