// src/lib/migrazioni/catalogoTl.ts
//
// DALLA TABELLA STORICA AL CATALOGO DELLE TL.
//
// La tabella storica delle lavorazioni per tipologia di debito diceva, per ogni
// categoria di debito, la
// lavorazione da svolgere e il collega a cui chiederla. È la configurazione che
// ha alimentato il triage fino al congelamento (0.138.x): non si scrive più,
// ma i destinatari che contiene sono ancora quelli che ricevono i documenti.
//
// Il catalogo delle TL (`catalogo_tl`) è il posto dove quelle righe vanno:
//
//   - una TL la identificano un CODICE e una DESCRIZIONE. Per associate una TL
//     non serve altro: lo stesso codice può comparire molte volte, con
//     descrizioni diverse, perché sotto una categoria di debito si svolgono più
//     lavorazioni;
//   - la DIREZIONE (l'ufficio) si aggancia da sola: il destinatario scritto
//     nella tabella storica è il nome di un ufficio, e se è una delle
//     direttrici dell'ente si salva la grafia delle direttrici. È automatico
//     perché la categoria che si sta variando è un prodotto dentro una
//     direttrice: il nome esiste già, non va riscritto;
//   - quando il nome non è una direttrice non si corregge e non si scarta:
//     resta scritto com'era, e il conto dice quanti sono.
//
// La migrazione è IDEMPOTENTE. La coppia (codice, descrizione) è la chiave:
// una TL già in catalogo non si ricopia. Le righe storiche lette vengono
// marcate (`migrata_il`), così il giro successivo non le rilegge: cancellare a
// mano una TL dal catalogo non la fa tornare in vita.
//
// Qui c'è solo il calcolo — niente database — perché è la parte che decide che
// cosa entra nel catalogo, e va verificata con i test.

import { direttriceConfigurata, type DirettriceNome } from '@/lib/titoliEnte/direttrici';
import { chiaveDipendenza, nomeDipendenza } from '@/lib/lavorazioni/dipendenze';

/** Una riga della configurazione storica delle lavorazioni per tipologia di debito. */
export interface RigaStoricaLavorazione {
  id: number;
  categoria: string;
  lavorazione: string;
  destinatario: string;
  attivo: boolean;
  ordine: number;
}

/** Una TL come entra nel catalogo. */
export interface RigaCatalogoTl {
  codice: string;
  descrizione: string;
  /** L'ufficio: la grafia delle direttrici se il nome è uno di loro. */
  direttrice: string;
  attivo: boolean;
  ordine: number;
}

export interface ScartoMigrazione {
  id: number;
  /** Perché la riga non è diventata una TL: il conto si mostra, non si tace. */
  motivo: string;
}

export interface PianoCatalogoTl {
  /** Le TL da inserire, nell'ordine in cui vanno scritte. */
  righe: RigaCatalogoTl[];
  /** Righe storiche lette e non copiate, con il motivo. */
  scartate: ScartoMigrazione[];
  /** Le TL già in catalogo: la migrazione non le riscrive. */
  giaPresenti: number;
  /** Uffici che non sono direttrici: restano scritti com'erano. */
  fuoriElenco: string[];
}

/**
 * La chiave della categoria: maiuscole e spazi non fanno due categorie. In
 * tabella il codice si salva nella grafia canonica, che è quella dell'elenco
 * delle categorie — non quella che la riga storica aveva per caso.
 */
export function chiaveCategoria(codice: string | null | undefined): string {
  return nomeDipendenza(codice).toUpperCase().replace(/\s+/g, '_');
}

/**
 * Il piano di migrazione: che cosa entra nel catalogo, che cosa si scarta e
 * quali uffici non sono direttrici.
 *
 * `categorieValide` è l'elenco dei codici che esistono ancora (le categorie
 * dello spazio più i quattro codici legacy): una riga storica che nomina una
 * categoria cancellata non si ricopia. Senza questo filtro, cancellare una
 * categoria farebbe ricomparire le sue TL al primo caricamento — l'orfano che
 * la migrazione deve chiudere, non riaprire.
 */
export function pianificaCatalogoTl(input: {
  storiche: RigaStoricaLavorazione[];
  esistenti: { codice: string; descrizione: string }[];
  direttrici: DirettriceNome[] | null | undefined;
  categorieValide?: Iterable<string>;
}): PianoCatalogoTl {
  const catalogo = new Set(
    input.esistenti.map((x) => `${chiaveDipendenza(x.codice)}|${chiaveDipendenza(x.descrizione)}`)
  );
  const canoniche = new Map<string, string>();
  for (const codice of input.categorieValide ?? [])
    canoniche.set(chiaveCategoria(codice), nomeDipendenza(codice));

  const righe: RigaCatalogoTl[] = [];
  const scartate: ScartoMigrazione[] = [];
  const fuoriElenco: string[] = [];
  let giaPresenti = 0;

  const giaInserita = new Set<string>();

  for (const riga of input.storiche) {
    const descrizione = nomeDipendenza(riga.lavorazione);
    if (!descrizione) {
      scartate.push({ id: riga.id, motivo: 'senza descrizione' });
      continue;
    }

    const codiceScritto = nomeDipendenza(riga.categoria);
    const canonica = canoniche.get(chiaveCategoria(codiceScritto));
    if (canoniche.size > 0 && !canonica) {
      scartate.push({ id: riga.id, motivo: 'categoria non più esistente' });
      continue;
    }
    const codice = canonica ?? codiceScritto;
    if (!codice) {
      scartate.push({ id: riga.id, motivo: 'senza codice' });
      continue;
    }

    const destinatario = nomeDipendenza(riga.destinatario);
    if (!destinatario) {
      scartate.push({ id: riga.id, motivo: 'senza destinatario' });
      continue;
    }

    const chiave = `${chiaveDipendenza(codice)}|${chiaveDipendenza(descrizione)}`;
    if (catalogo.has(chiave) || giaInserita.has(chiave)) {
      giaPresenti += 1;
      continue;
    }

    // L'aggancio alla direttrice è automatico: se il destinatario è il nome di
    // una direttrice si salva la grafia scritta nei Parametri, altrimenti il
    // nome resta quello che era. Nessuno dei due casi perde il destinatario.
    const direttrice = direttriceConfigurata(destinatario, input.direttrici);
    if (
      !direttrice &&
      !fuoriElenco.some((u) => chiaveDipendenza(u) === chiaveDipendenza(destinatario))
    )
      fuoriElenco.push(destinatario);

    // La stessa coppia può comparire due volte nella tabella storica: l'indice
    // univoco la rifiuterebbe, e comunque sarebbe la stessa TL.
    giaInserita.add(chiave);
    righe.push({
      codice,
      descrizione,
      direttrice: direttrice ?? destinatario,
      attivo: riga.attivo !== false,
      ordine: Number.isFinite(riga.ordine) ? riga.ordine : 0,
    });
  }

  return { righe, scartate, giaPresenti, fuoriElenco };
}
