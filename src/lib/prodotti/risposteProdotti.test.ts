import { describe, expect, it } from 'vitest';
import {
  allineaRisposteProdotti,
  risolviProdotto,
  type RigaRispostaProdotto,
} from './risposteProdotti';
import { chiaveProdotto, type ProdottoEnte } from './prodotti';

const prodotto = (p: Partial<ProdottoEnte> = {}): ProdottoEnte => ({
  id: 1,
  direttrice: 'Gestione del credito',
  nome: 'Diffide',
  inChecklist: true,
  domande: [{ id: 'q1', testo: 'Sono state gestite?', tipo: 'SI_NO', maxCaratteri: null }],
  ordine: 1,
  ...p,
});

const riga = (r: Partial<RigaRispostaProdotto> = {}): RigaRispostaProdotto => ({
  prodottoId: 1,
  prodottoChiave: null,
  domandaId: 'q1',
  siNo: true,
  testo: null,
  ...r,
});

describe('risolviProdotto', () => {
  it('trova il prodotto per id quando la riga esiste ancora', () => {
    expect(risolviProdotto([prodotto()], 1)?.nome).toBe('Diffide');
  });

  it('ritrova il prodotto per chiave quando l’id è cambiato', () => {
    const attuale = prodotto({ id: 57 });
    const trovato = risolviProdotto(
      [attuale],
      1,
      chiaveProdotto('Gestione del credito', 'Diffide')
    );
    expect(trovato?.id).toBe(57);
  });

  it('non inventa un prodotto: senza id né chiave non restituisce nulla', () => {
    expect(risolviProdotto([prodotto({ id: 57 })], 1)).toBeNull();
  });

  it('la chiave non dipende dalla grafia', () => {
    const trovato = risolviProdotto(
      [prodotto({ id: 9 })],
      1,
      chiaveProdotto('  GESTIONE DEL CREDITO ', ' diffide')
    );
    expect(trovato?.id).toBe(9);
  });
});

describe('allineaRisposteProdotti', () => {
  it('riporta la risposta sul prodotto attuale quando l’id è cambiato', () => {
    const esito = allineaRisposteProdotti(
      [
        riga({
          prodottoId: 1,
          prodottoChiave: chiaveProdotto('Gestione del credito', 'Diffide'),
        }),
      ],
      [prodotto({ id: 12 })]
    );
    expect(esito.risposte).toEqual([{ prodottoId: 12, domandaId: 'q1', siNo: true, testo: null }]);
    expect(esito.riallineamenti).toHaveLength(1);
    expect(esito.riallineamenti[0].destinazione.prodottoId).toBe(12);
    expect(esito.orfane).toBe(0);
  });

  it('usa la chiave scritta nella riga, non la posizione', () => {
    const esito = allineaRisposteProdotti(
      [
        riga({
          prodottoId: 3,
          prodottoChiave: chiaveProdotto('Gestione del credito', 'Diffide'),
          siNo: false,
        }),
      ],
      [prodotto({ id: 12 })]
    );
    expect(esito.risposte[0]).toMatchObject({ prodottoId: 12, siNo: false });
  });

  it('annota la chiave anche quando l’id è già quello giusto', () => {
    const esito = allineaRisposteProdotti([riga()], [prodotto({ id: 1 })]);
    expect(esito.risposte).toHaveLength(1);
    expect(esito.riallineamenti).toHaveLength(1);
    expect(esito.riallineamenti[0].origine.prodottoId).toBe(1);
    expect(esito.riallineamenti[0].destinazione.prodottoChiave).toBe(
      chiaveProdotto('Gestione del credito', 'Diffide')
    );
  });

  it('non riscrive nulla quando la riga è già allineata', () => {
    const chiave = chiaveProdotto('Gestione del credito', 'Diffide');
    const esito = allineaRisposteProdotti(
      [riga({ prodottoId: 1, prodottoChiave: chiave })],
      [prodotto({ id: 1 })]
    );
    expect(esito.riallineamenti).toHaveLength(0);
  });

  it('conta le righe orfane senza usare la loro risposta', () => {
    const esito = allineaRisposteProdotti(
      [riga({ prodottoId: 99, prodottoChiave: 'direttrice|prodotto sparito' })],
      [prodotto()]
    );
    expect(esito.risposte).toHaveLength(0);
    expect(esito.orfane).toBe(1);
  });

  it('fra due righe della stessa domanda tiene quella che ha una risposta', () => {
    const chiave = chiaveProdotto('Gestione del credito', 'Diffide');
    const esito = allineaRisposteProdotti(
      [
        riga({ prodottoId: 12, prodottoChiave: chiave, siNo: null, testo: '' }),
        riga({ prodottoId: 1, prodottoChiave: chiave, siNo: true }),
      ],
      [prodotto({ id: 12 })]
    );
    expect(esito.risposte).toHaveLength(1);
    expect(esito.risposte[0].siNo).toBe(true);
  });

  it('una riga senza chiave, con un id che non esiste più, resta orfana', () => {
    // Non c’è modo di sapere a quale prodotto appartenesse: l’id è sparito e
    // la chiave non era stata scritta. Non la si attribuisce a caso.
    const esito = allineaRisposteProdotti([riga({ prodottoId: 1 })], [prodotto({ id: 12 })]);
    expect(esito.orfane).toBe(1);
    expect(esito.risposte).toHaveLength(0);
  });

  it('due prodotti con la stessa domanda restano distinti', () => {
    const altro = prodotto({ id: 2, nome: 'Durc' });
    const esito = allineaRisposteProdotti([riga()], [prodotto({ id: 1 }), altro]);
    expect(esito.risposte).toHaveLength(1);
    expect(esito.risposte[0].prodottoId).toBe(1);
  });
});
