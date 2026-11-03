// src/lib/prodotti/sincronizza.ts
//
// LE DIRETTRICI E I PRODOTTI RESTANO D'ACCORDO FRA LORO (0.161.0).
//
// I prodotti sono usciti dal blocco delle direttrici e hanno una tabella
// propria (`prodotti_ente`), ma lo screening e il calcolo dei pesi leggono
// ancora `spazi.direttrici_ente_strutturate`, cioè l'elenco `{ nome, prodotti }`.
// Quella struttura non si butta: è la fotografia che il questionario usa per
// generare una sezione per direttrice. Si AGGIORNA, invece, ogni volta che un
// prodotto nasce, cambia nome o viene eliminato.
//
// La regola è una sola: l'ordine dei nomi è quello scritto dall'ente, i
// prodotti di ciascuna direttrice sono quelli della tabella, e nessun nome
// scritto a mano sparisce perché non ha ancora prodotti. Una direttrice senza
// prodotti è una direttrice da completare, non una riga da cancellare: sparire
// dal questionario sarebbe il modo silenzioso di perdere il lavoro fatto.
//
// Logica pura: nessun accesso al database.

/** La forma letta da Screening e pesi: il nome dell'ufficio e i suoi prodotti. */
export interface DirettriceConProdotti {
  nome: string;
  prodotti: string[];
}

const chiave = (testo: string) => testo.trim().toLowerCase();

/**
 * Unisce i nomi già scritti e i prodotti della tabella in un elenco coerente.
 *
 * - i nomi delle direttrici conservano l'ordine in cui l'ente li ha scritti;
 * - una direttrice che esiste solo come prodotto (nome nuovo, non ancora
 *   salvato fra le direttrici) viene aggiunta in coda, così il prodotto non
 *   resta orfano;
 * - i prodotti di ogni direttrice sono quelli che la tabella le attribuisce,
 *   nell'ordine di inserimento.
 */
export function sincronizzaDirettrici(
  esistenti: DirettriceConProdotti[] | null | undefined,
  prodotti: { direttrice: string; nome: string }[]
): DirettriceConProdotti[] {
  const nomi: string[] = [];
  const gia = (nome: string) => nomi.some((n) => chiave(n) === chiave(nome));
  const aggiungi = (nome: string) => {
    const pulito = nome.trim();
    if (pulito && !gia(pulito)) nomi.push(pulito);
  };

  for (const d of esistenti ?? []) aggiungi(d.nome ?? '');
  for (const p of prodotti) aggiungi(p.direttrice ?? '');

  return nomi.map((nome) => ({
    nome,
    prodotti: prodotti
      .filter((p) => chiave(p.direttrice ?? '') === chiave(nome))
      .map((p) => p.nome.trim())
      .filter(Boolean),
  }));
}
