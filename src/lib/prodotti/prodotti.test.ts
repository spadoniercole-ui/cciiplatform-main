import { describe, expect, it } from 'vitest';
import {
  MASSIMO_CARATTERI_RISPOSTA_LIBERA,
  chiaveProdotto,
  mancanzeChecklistProdotti,
  normalizzaDomanda,
  normalizzaProdotto,
  prodottiDellaDirettrice,
  prodottiInChecklist,
  rigaProdotto,
  sintesiChecklistProdotti,
  validaProdotto,
  vociChecklistProdotti,
  type ProdottoEnte,
} from './prodotti';

const prodotto = (p: Partial<ProdottoEnte> = {}): ProdottoEnte => ({
  id: 1,
  direttrice: 'Gestione del credito',
  nome: 'Diffide',
  inChecklist: false,
  domande: [],
  ordine: 1,
  ...p,
});

describe('validaProdotto', () => {
  it('pretende la direttrice', () => {
    expect(
      validaProdotto({ direttrice: ' ', nome: 'DURC', inChecklist: false, domande: [] })
    ).toMatch(/direttrice/);
  });

  it('pretende il nome del prodotto', () => {
    expect(
      validaProdotto({ direttrice: 'Credito', nome: '', inChecklist: false, domande: [] })
    ).toMatch(/nome del prodotto/);
  });

  it('rifiuta il flag acceso senza domande: il triage non avrebbe nulla da chiedere', () => {
    expect(
      validaProdotto({ direttrice: 'Credito', nome: 'DURC', inChecklist: true, domande: [] })
    ).toMatch(/almeno una domanda/);
  });

  it('rifiuta una risposta libera oltre il tetto dei mille caratteri', () => {
    const errore = validaProdotto({
      direttrice: 'Credito',
      nome: 'DURC',
      inChecklist: true,
      domande: [
        {
          id: 'q1',
          testo: 'Che misure ha adottato?',
          tipo: 'TESTO_LIBERO',
          maxCaratteri: MASSIMO_CARATTERI_RISPOSTA_LIBERA + 1,
        },
      ],
    });
    expect(errore).toMatch(/1000 caratteri/);
  });

  it('accetta un prodotto con domande chiuse e libere', () => {
    expect(
      validaProdotto({
        direttrice: 'Credito',
        nome: 'DURC',
        inChecklist: true,
        domande: [
          { id: 'q1', testo: 'Il versamento risulta?', tipo: 'SI_NO', maxCaratteri: null },
          { id: 'q2', testo: 'Quali misure?', tipo: 'TESTO_LIBERO', maxCaratteri: 400 },
        ],
      })
    ).toBeNull();
  });
});

describe('normalizzazione', () => {
  it('il testo libero senza tetto prende i mille caratteri', () => {
    const d = normalizzaDomanda({ testo: 'Quali misure?', tipo: 'TESTO_LIBERO' }, 0);
    expect(d.maxCaratteri).toBe(MASSIMO_CARATTERI_RISPOSTA_LIBERA);
    expect(d.id).toBe('q1');
  });

  it('una domanda chiusa non porta un tetto di caratteri', () => {
    const d = normalizzaDomanda(
      { id: 'x', testo: 'Risulta?', tipo: 'SI_NO', maxCaratteri: 100 },
      0
    );
    expect(d.maxCaratteri).toBeNull();
  });

  it('scarta le domande senza testo e i doppioni di id', () => {
    const p = normalizzaProdotto({
      direttrice: ' Credito ',
      nome: ' DURC ',
      inChecklist: true,
      domande: [
        { id: 'q1', testo: 'Prima?', tipo: 'SI_NO', maxCaratteri: null },
        { id: 'q1', testo: 'Doppione?', tipo: 'SI_NO', maxCaratteri: null },
        { id: 'q2', testo: '   ', tipo: 'TESTO_LIBERO', maxCaratteri: 100 },
      ],
    });
    expect(p.direttrice).toBe('Credito');
    expect(p.nome).toBe('DURC');
    expect(p.domande).toHaveLength(1);
    expect(p.domande[0].testo).toBe('Prima?');
  });

  it('la chiave del prodotto non dipende dalla grafia', () => {
    expect(chiaveProdotto(' Gestione  del credito ', 'DIFFIDE')).toBe(
      'gestione del credito|diffide'
    );
  });
});

describe('rigaProdotto', () => {
  it('legge flag e domande dal database', () => {
    const p = rigaProdotto({
      id: 7,
      direttrice: 'Credito',
      nome: 'DURC',
      in_checklist: true,
      domande: [{ id: 'q1', testo: 'Risulta?', tipo: 'SI_NO', maxCaratteri: null }],
      ordine: 2,
    });
    expect(p.inChecklist).toBe(true);
    expect(p.domande).toHaveLength(1);
    expect(p.domande[0].tipo).toBe('SI_NO');
    expect(p.ordine).toBe(2);
  });
});

describe('selezioni', () => {
  const prodotti = [
    prodotto({ id: 1, direttrice: 'Credito', nome: 'Diffide', ordine: 2 }),
    prodotto({ id: 2, direttrice: 'Credito', nome: 'DURC', ordine: 1 }),
    prodotto({
      id: 3,
      direttrice: 'Flussi',
      nome: 'Uniemens',
      inChecklist: true,
      domande: [
        { id: 'q1', testo: 'Il flusso è stato trasmesso?', tipo: 'SI_NO', maxCaratteri: null },
      ],
    }),
    // Flag acceso ma senza domande: non entra in check list.
    prodotto({ id: 4, direttrice: 'Flussi', nome: 'DICA', inChecklist: true }),
  ];

  it('i prodotti di una direttrice seguono l’ordine configurato', () => {
    expect(prodottiDellaDirettrice(prodotti, 'credito').map((p) => p.nome)).toEqual([
      'DURC',
      'Diffide',
    ]);
  });

  it('in check list entrano solo i prodotti col flag E con le domande', () => {
    expect(prodottiInChecklist(prodotti).map((p) => p.nome)).toEqual(['Uniemens']);
  });

  it('le voci portano prodotto, direttrice e tipo di risposta', () => {
    const voci = vociChecklistProdotti(prodotti);
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({
      prodotto: 'Uniemens',
      direttrice: 'Flussi',
      domanda: 'Il flusso è stato trasmesso?',
      tipo: 'SI_NO',
    });
  });

  it('usa TUTTE le domande di tutti i prodotti in check list, senza scartarne nessuna', () => {
    const voci = vociChecklistProdotti([
      prodotto({
        id: 10,
        nome: 'DURC',
        inChecklist: true,
        domande: [
          { id: 'q1', testo: 'Prima?', tipo: 'SI_NO', maxCaratteri: null },
          { id: 'q2', testo: 'Seconda?', tipo: 'TESTO_LIBERO', maxCaratteri: 300 },
        ],
      }),
      prodotto({
        id: 11,
        nome: 'Uniemens',
        inChecklist: true,
        domande: [{ id: 'q1', testo: 'Terza?', tipo: 'SI_NO', maxCaratteri: null }],
      }),
      // Flag spento: le sue domande non entrano nella check list.
      prodotto({
        id: 12,
        nome: 'DICA',
        inChecklist: false,
        domande: [{ id: 'q1', testo: 'Fuori?', tipo: 'SI_NO', maxCaratteri: null }],
      }),
    ]);
    expect(voci.map((v) => v.domanda)).toEqual(['Prima?', 'Seconda?', 'Terza?']);
  });
});

describe('sintesi della check list', () => {
  const voci = vociChecklistProdotti([
    prodotto({
      id: 1,
      nome: 'DURC',
      inChecklist: true,
      domande: [
        { id: 'q1', testo: 'Risulta regolare?', tipo: 'SI_NO', maxCaratteri: null },
        { id: 'q2', testo: 'Quali misure?', tipo: 'TESTO_LIBERO', maxCaratteri: 400 },
      ],
    }),
  ]);

  it('una domanda senza risposta manca, e il testo vuoto non è una risposta', () => {
    const mancanze = mancanzeChecklistProdotti(voci, [
      { prodottoId: 1, domandaId: 'q1', siNo: true, testo: null },
      { prodottoId: 1, domandaId: 'q2', siNo: null, testo: '   ' },
    ]);
    expect(mancanze).toHaveLength(1);
    expect(mancanze[0]).toMatch(/Quali misure/);
  });

  it('tutte le risposte chiuse positive danno «azione sistemica»', () => {
    const s = sintesiChecklistProdotti(voci, [
      { prodottoId: 1, domandaId: 'q1', siNo: true, testo: null },
      { prodottoId: 1, domandaId: 'q2', siNo: null, testo: 'Rateizzazione in corso' },
    ]);
    expect(s.qualificazione).toBe('SISTEMICA');
    expect(s.mancanti).toBe(0);
    expect(s.voci.find((v) => v.tipo === 'TESTO_LIBERO')?.risposta).toBe('Rateizzazione in corso');
  });

  it('tutte negative danno «squilibrio»', () => {
    const s = sintesiChecklistProdotti(voci, [
      { prodottoId: 1, domandaId: 'q1', siNo: false, testo: null },
      { prodottoId: 1, domandaId: 'q2', siNo: null, testo: 'Nessuna misura' },
    ]);
    expect(s.qualificazione).toBe('SQUILIBRIO');
  });

  it('senza domande chiuse la qualificazione non è misurabile', () => {
    const libere = vociChecklistProdotti([
      prodotto({
        id: 2,
        nome: 'DICA',
        inChecklist: true,
        domande: [{ id: 'q1', testo: 'Racconta', tipo: 'TESTO_LIBERO', maxCaratteri: 300 }],
      }),
    ]);
    const s = sintesiChecklistProdotti(libere, [
      { prodottoId: 2, domandaId: 'q1', siNo: null, testo: 'Testo' },
    ]);
    expect(s.qualificazione).toBe('NON_VALUTABILE');
  });
});
