// src/lib/lavorazioni/instradamentoMateria.ts
//
// CHI LAVORA IL DEBITO, SECONDO LA CONFIGURAZIONE NUOVA.
//
// Le comunicazioni ai colleghi e i documenti per reparto sanno raggruppare le
// posizioni del V.E.R.A. per DESTINATARIO, ma leggono la chiave che trovano
// sulla riga: `categoria`, cioè il codice della vecchia tabella «Lavorazioni
// per tipo di debito». Nel frattempo la configurazione si è spostata sulle
// MATERIE: la materia porta i presupposti legali e i codici indicativi, e
// `materie_lavorazione` porta le azioni da compiere e l'ufficio che le compie.
//
// Con la sola chiave vecchia, un'azienda con le materie configurate e la
// vecchia tabella non compilata produceva documenti vuoti e un avviso di
// «sezioni non mappate» che era falso: la posizione una materia ce l'aveva, e
// con essa un ufficio e una procedura. Qui si ricava quella materia — da
// quella già risolta sulla riga, altrimenti dal codice di partita nella voce,
// dai codici indicativi della materia, o dalla descrizione — e si traduce in
// una chiave che il raggruppamento esistente sa leggere.
//
// PERCHÉ UNA CHIAVE SINTETICA. `raggruppaPerReparto` è la definizione unica di
// «chi segue cosa»: la usano il testo da copiare e i PDF. Riscriverla per la
// materia significherebbe due implementazioni della stessa regola, e prima o
// poi direbbero cose diverse. La materia entra quindi nello stesso spazio di
// chiavi delle categorie, con un prefisso che non può essere confuso con un
// codice configurato: `MATERIA:<id>`. L'etichetta mostrata resta il nome della
// materia, non la chiave.
//
// PRECEDENZA: LA MATERIA VINCE, LA CATEGORIA RESTA COME RIPIEGO. La vecchia
// tabella è in sola lettura e non si compila più; la materia è dove l'ente
// scrive presupposti e azioni. Una riga che ha una materia con almeno una
// lavorazione destinata a un ufficio va a quell'ufficio. Una riga senza materia
// utilizzabile mantiene la categoria che aveva, così gli spazi configurati
// prima continuano a produrre i loro documenti. Una riga senza né materia né
// categoria non viene attribuita a nessuno: si conta e si dichiara, perché
// un'assenza taciuta è indistinguibile da una riga persa.

import { materiaPerRigaVera, type MateriaMinima } from '@/lib/titoliEnte/materiaVera';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import type { TitoloEnte } from '@/lib/titoliEnte/titoli';
import type { TrattamentoVera } from '@/lib/debitiEnte/veraImport';
import type { LavorazioneConfig } from './comunicazioni';

/** La materia che la riga porta già con sé, quando il server l'ha risolta. */
export interface MateriaDellaRiga {
  id: number;
  nome: string;
}

/** Il minimo che serve al raggruppamento: la riga e la sua chiave. */
export interface RigaInstradabile {
  sezione: string;
  voce: string;
  categoria: string;
  importo: number;
  stato: string;
  periodo?: string;
  trattamento: TrattamentoVera;
  materia?: MateriaDellaRiga | null;
}

export interface OpzioniInstradamento {
  /** I codici dell'ente: dicono in quale materia cade un codice di partita. */
  titoli: Pick<TitoloEnte, 'codice' | 'materiaId'>[];
  /** Le materie con i loro codici indicativi e il loro stato. */
  materie: MateriaMinima[];
  /** Le azioni configurate per materia, con l'ufficio che le compie. */
  lavorazioni: LavorazioneMateria[];
  /** Le lavorazioni per categoria (vecchia tabella): restano valide come ripiego. */
  lavorazioniCategoria?: LavorazioneConfig[];
  /** codice categoria → etichetta mostrata. */
  etichetteCategoria?: Record<string, string>;
}

export interface MateriaInstradata {
  materiaId: number;
  nome: string;
  righe: number;
  totale: number;
}

export interface EsitoInstradamento<R extends RigaInstradabile> {
  /** Le righe con `categoria` riscritta quando la materia le instrada. */
  righe: (R & { categoria: string })[];
  /** Le lavorazioni delle materie (chiave sintetica) più quelle vecchie. */
  lavorazioni: LavorazioneConfig[];
  /** chiave → etichetta: nome della materia, oppure l'etichetta della categoria. */
  etichette: Record<string, string>;
  /** Quante posizioni sono andate a ciascuna materia, con il loro totale. */
  perMateria: MateriaInstradata[];
  /** Posizioni senza materia e senza categoria: nessun ufficio a cui andare. */
  senzaDestinazione: { righe: number; totale: number };
}

/** La chiave con cui una materia entra nello spazio delle categorie. */
export function chiaveMateria(materiaId: number): string {
  return `MATERIA:${materiaId}`;
}

/**
 * La materia scelta a mano sulla sezione, letta dalla sua chiave.
 *
 * Una sezione che non si riconduce da sola a una materia viene mappata
 * dall'operatore, e la scelta si conserva nello stesso posto delle categorie:
 * la chiave è quindi l'unica traccia persistita della decisione.
 */
export function materiaDaChiave(categoria: string | null | undefined): number | null {
  const m = /^MATERIA:(\d+)$/.exec((categoria ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * Aggiunge alle righe la chiave della materia e alle lavorazioni quelle che ne
 * derivano. Non tocca gli importi, i trattamenti né i periodi: instrada e basta.
 */
export function instradaPerMateria<R extends RigaInstradabile>(
  righe: R[],
  opzioni: OpzioniInstradamento
): EsitoInstradamento<R> {
  const nomeMateria = new Map(
    opzioni.materie.map((m) => [m.id, m.nome.trim() || `Materia ${m.id}`])
  );

  // Le lavorazioni utilizzabili per materia: senza tipologia o senza ufficio
  // non possono produrre né un'attività né un documento.
  const perMateria = new Map<number, LavorazioneConfig[]>();
  for (const l of opzioni.lavorazioni) {
    const tipologia = (l.tipologia ?? '').trim();
    const destinatario = (l.dipendenza ?? '').trim().replace(/\s+/g, ' ');
    if (!tipologia || !destinatario) continue;
    const nome = nomeMateria.get(l.materiaId);
    if (!nome) continue;
    const lista = perMateria.get(l.materiaId) ?? [];
    lista.push({
      categoria: chiaveMateria(l.materiaId),
      lavorazione: tipologia,
      destinatario,
      attivo: true,
    });
    perMateria.set(l.materiaId, lista);
  }

  const etichette: Record<string, string> = { ...(opzioni.etichetteCategoria ?? {}) };
  for (const [id, nome] of nomeMateria) {
    if (perMateria.has(id)) etichette[chiaveMateria(id)] = nome;
  }

  const conti = new Map<number, { nome: string; righe: number; totale: number }>();
  const senzaDestinazione = { righe: 0, totale: 0 };

  const instradate = righe.map((r) => {
    // Precedenza: la materia che la POSIZIONE stessa dichiara — quella già
    // risolta dal server, il codice di partita, la voce e solo in ultimo il
    // titolo di sezione — e, soltanto se nessuna di queste risponde, la
    // mappatura scelta per la sezione.
    //
    // PERCHÉ LA MAPPATURA NON VIENE PRIMA. La mappatura esiste per le sezioni
    // che non si riconducono a niente (§ la finestra «Mappa le sezioni»): è un
    // ripiego, non un ordine. Mettendola davanti, una sezione mappata su una
    // materia trascinava con sé anche le posizioni che una materia ce l'avevano
    // già — i «Verbale Evasione» di una gestione contributiva finivano sul
    // foglio dei flussi informativi, e l'ufficio di vigilanza non riceveva più
    // nulla. Una voce che dice che cos'è il debito non può essere scavalcata
    // dal titolo della sezione in cui il file l'ha messa.
    const scelta =
      r.materia?.id ??
      materiaPerRigaVera(r.voce, r.sezione, opzioni.titoli, opzioni.materie)?.id ??
      materiaDaChiave(r.categoria) ??
      null;
    const materiaId = scelta;
    if (materiaId !== null && perMateria.has(materiaId)) {
      const nome = nomeMateria.get(materiaId) ?? `Materia ${materiaId}`;
      const voce = conti.get(materiaId) ?? { nome, righe: 0, totale: 0 };
      voce.righe += 1;
      voce.totale += r.importo;
      conti.set(materiaId, voce);
      return { ...r, categoria: chiaveMateria(materiaId) };
    }
    if (!r.categoria.trim()) senzaDestinazione.righe += 1;
    if (!r.categoria.trim()) senzaDestinazione.totale += r.importo;
    return r;
  });

  return {
    righe: instradate,
    lavorazioni: [
      ...(opzioni.lavorazioniCategoria ?? []),
      ...Array.from(perMateria.values()).flat(),
    ],
    etichette,
    perMateria: Array.from(conti.entries())
      .map(([materiaId, c]) => ({ materiaId, ...c }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it-IT')),
    senzaDestinazione,
  };
}
