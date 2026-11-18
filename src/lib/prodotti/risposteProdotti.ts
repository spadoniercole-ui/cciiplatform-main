// LA RISPOSTA APPARTIENE AL PRODOTTO, NON AL SUO NUMERO DI RIGA (0.246.0).
//
// `prodotti_ente.id` è una SERIAL: non è l'identità del prodotto, è il numero
// che gli è toccato quando la riga è nata. Se il prodotto viene ricreato — un
// ripristino, un rinnovo della configurazione, due ambienti con la stessa
// configurazione e id diversi — le risposte già date restano scritte sotto il
// numero vecchio e spariscono dalla check list, che sembra vuota pur avendo le
// risposte.
//
// L'identità stabile è la coppia (direttrice, nome), la stessa su cui il
// database tiene l'indice unico del prodotto: è quella che si salva accanto
// alla risposta e quella su cui si ritrova la risposta dopo che l'id è
// cambiato.
//
// Qui la logica è pura: riceve le righe lette e i prodotti di adesso, e dice
//  - quali risposte appartengono a un prodotto attuale (e con quale id),
//  - quali righe vanno riscritte sul prodotto attuale,
//  - quante righe restano orfane perché il prodotto non esiste più.
//
// Nessun dato si cancella in lettura: le righe orfane restano dove sono. Una
// risposta di un prodotto cancellato non è un errore da ripulire, è la traccia
// di una configurazione che c'era.

import { chiaveProdotto, type ProdottoEnte, type RispostaChecklistProdotto } from './prodotti';

/** Una riga di `checklist_prodotti_risposte` nella forma che serve qui. */
export interface RigaRispostaProdotto {
  prodottoId: number;
  /** null per le righe scritte prima che la colonna esistesse. */
  prodottoChiave: string | null;
  domandaId: string;
  siNo: boolean | null;
  testo: string | null;
}

export interface RiallineamentoRisposta {
  /** Dove la riga è scritta adesso. */
  origine: { prodottoId: number; domandaId: string };
  /** Dove deve stare: il prodotto attuale con la sua chiave. */
  destinazione: { prodottoId: number; prodottoChiave: string };
  siNo: boolean | null;
  testo: string | null;
}

export interface AllineamentoRisposte {
  /** Le risposte valide, già riferite all'id attuale del prodotto. */
  risposte: RispostaChecklistProdotto[];
  /** Le righe da riscrivere (id cambiato, oppure chiave da annotare). */
  riallineamenti: RiallineamentoRisposta[];
  /** Righe il cui prodotto non esiste più: restano scritte e non contano. */
  orfane: number;
}

/**
 * Il prodotto indicato: prima per id, poi — se l'id non esiste più — per la
 * chiave stabile. È la regola del salvataggio: una pagina aperta prima di un
 * cambio di configurazione continua a salvare sulla riga giusta.
 */
export function risolviProdotto(
  prodotti: ProdottoEnte[],
  prodottoId: number,
  chiave?: string | null
): ProdottoEnte | null {
  const perId = prodotti.find((p) => p.id === prodottoId);
  if (perId) return perId;
  const cercata = (chiave ?? '').trim().toLowerCase();
  if (!cercata) return null;
  return prodotti.find((p) => chiaveProdotto(p.direttrice, p.nome) === cercata) ?? null;
}

const haRisposta = (r: RigaRispostaProdotto): number => {
  if (r.siNo === true || r.siNo === false) return 2;
  return (r.testo ?? '').trim() !== '' ? 1 : 0;
};

/**
 * Le risposte riferite ai prodotti di adesso.
 *
 * Due righe possono finire sulla stessa domanda dello stesso prodotto: quella
 * rimasta sotto l'id vecchio e quella scritta dopo il cambio. Vince la riga
 * con una risposta, perché è l'unica che dice qualcosa; a parità, la prima
 * letta.
 */
export function allineaRisposteProdotti(
  righe: RigaRispostaProdotto[],
  prodotti: ProdottoEnte[]
): AllineamentoRisposte {
  const perId = new Map(prodotti.map((p) => [p.id, p]));
  const perChiave = new Map(prodotti.map((p) => [chiaveProdotto(p.direttrice, p.nome), p]));

  // Prima le righe con una risposta: se una domanda è scritta due volte, quella
  // che porta il contenuto è quella da tenere.
  const ordinate = [...righe].sort((a, b) => haRisposta(b) - haRisposta(a));

  const risposte: RispostaChecklistProdotto[] = [];
  const riallineamenti: RiallineamentoRisposta[] = [];
  const viste = new Set<string>();
  let orfane = 0;

  for (const r of ordinate) {
    const chiave = (r.prodottoChiave ?? '').trim().toLowerCase();
    const prodotto =
      (chiave ? perChiave.get(chiave) : undefined) ?? perId.get(r.prodottoId) ?? null;
    if (!prodotto) {
      orfane += 1;
      continue;
    }

    const destinazioneChiave = chiaveProdotto(prodotto.direttrice, prodotto.nome);
    const identita = `${prodotto.id}|${r.domandaId}`;
    if (viste.has(identita)) continue;
    viste.add(identita);

    risposte.push({
      prodottoId: prodotto.id,
      domandaId: r.domandaId,
      siNo: r.siNo,
      testo: r.testo,
    });

    if (prodotto.id !== r.prodottoId || chiave !== destinazioneChiave) {
      riallineamenti.push({
        origine: { prodottoId: r.prodottoId, domandaId: r.domandaId },
        destinazione: { prodottoId: prodotto.id, prodottoChiave: destinazioneChiave },
        siNo: r.siNo,
        testo: r.testo,
      });
    }
  }

  return { risposte, riallineamenti, orfane };
}
