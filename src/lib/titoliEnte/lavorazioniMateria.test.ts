import { describe, it, expect } from 'vitest';
import {
  MASSIMO_CARATTERI_TIPOLOGIA,
  dipendenzaEffettiva,
  lavorazioniDellaMateria,
  normalizzaLavorazione,
  proceduraEffettiva,
  validaLavorazioneMateria,
  type LavorazioneMateria,
} from './lavorazioniMateria';
import { RISCONTRO_VUOTO, type TitoloEnte } from './titoli';

const lav = (p: Partial<LavorazioneMateria> & { id: number }): LavorazioneMateria => ({
  materiaId: 1,
  tipologia: 'Lavorazione',
  dipendenza: null,
  procedura: null,
  esito: null,
  ordine: 0,
  ...p,
});

const titolo = (p: Partial<TitoloEnte>): TitoloEnte => ({
  id: 1,
  codice: '11',
  atto: 'Regolarizzazione spontanea',
  presuppostoGiuridico: '',
  riferimentoInterno: null,
  effettoCalcolo: 'NESSUNO',
  note: null,
  attivitaRecupero: null,
  dipendenza: null,
  riscontroNorma: RISCONTRO_VUOTO,
  riscontroInterno: RISCONTRO_VUOTO,
  materiaId: 1,
  ...p,
});

describe('lavorazioni della materia: normalizzazione e validazione', () => {
  it('tiene la procedura su più righe e riduce dipendenza e tipologia a una riga', () => {
    const n = normalizzaLavorazione({
      materiaId: 3,
      tipologia: '  Emissione   diffida \r\n ',
      dipendenza: 'Ufficio Recupero Crediti\nSede di Ancona',
      procedura: '1. Verificare il messaggio\r\n2. Acquisire la proposta\r\n\r\n',
      esito: 'diffida',
    });
    expect(n.tipologia).toBe('Emissione diffida');
    expect(n.dipendenza).toBe('Ufficio Recupero Crediti Sede di Ancona');
    expect(n.procedura).toBe('1. Verificare il messaggio\n2. Acquisire la proposta');
    expect(n.esito).toBe('diffida');
  });

  it('chiede materia e tipologia, e controlla le lunghezze', () => {
    expect(
      validaLavorazioneMateria({
        materiaId: 0,
        tipologia: 'x',
        dipendenza: null,
        procedura: null,
        esito: null,
      })
    ).toMatch(/Scegli la materia/);
    expect(
      validaLavorazioneMateria({
        materiaId: 1,
        tipologia: '   ',
        dipendenza: null,
        procedura: null,
        esito: null,
      })
    ).toMatch(/Indica la lavorazione/);
    expect(
      validaLavorazioneMateria({
        materiaId: 1,
        tipologia: 'x'.repeat(MASSIMO_CARATTERI_TIPOLOGIA + 1),
        dipendenza: null,
        procedura: null,
        esito: null,
      })
    ).toMatch(/non può superare/);
    expect(
      validaLavorazioneMateria({
        materiaId: 1,
        tipologia: 'Diffida',
        dipendenza: 'x'.repeat(201),
        procedura: null,
        esito: null,
      })
    ).toMatch(/dipendenza/);
    expect(
      validaLavorazioneMateria({
        materiaId: 1,
        tipologia: 'Diffida',
        dipendenza: 'Ufficio recupero crediti',
        procedura: '1. Verificare la notifica',
        esito: 'diffida',
      })
    ).toBeNull();
  });
});

describe('lavorazioni della materia: quelle della materia giusta, in ordine', () => {
  it('filtra per materia e ordina per ordine, poi per id', () => {
    const lista = [
      lav({ id: 5, materiaId: 2, ordine: 1 }),
      lav({ id: 7, materiaId: 1, ordine: 2 }),
      lav({ id: 4, materiaId: 1, ordine: 1 }),
      lav({ id: 3, materiaId: 1, ordine: 1 }),
    ];
    expect(lavorazioniDellaMateria(lista, 1).map((l) => l.id)).toEqual([3, 4, 7]);
    expect(lavorazioniDellaMateria(lista, null)).toEqual([]);
  });
});

describe('il titolo eredita la lavorazione della materia, ma il codice vince', () => {
  const lavorazioni = [
    lav({ id: 1, materiaId: 1, tipologia: 'Verifica', ordine: 0, dipendenza: 'Sede di Ancona' }),
    lav({
      id: 2,
      materiaId: 1,
      tipologia: 'Diffida',
      ordine: 1,
      dipendenza: 'Ufficio legale',
      procedura: '1. Formare la diffida\n2. Notificare',
    }),
  ];

  it('la dipendenza del codice non viene sostituita', () => {
    const r = dipendenzaEffettiva(titolo({ dipendenza: 'Ragioneria' }), lavorazioni);
    expect(r).toEqual({ valore: 'Ragioneria', dallaMateria: false, tipologia: null });
  });

  it('senza valore sul codice prende la prima lavorazione che ce l’ha', () => {
    expect(dipendenzaEffettiva(titolo({}), lavorazioni)).toEqual({
      valore: 'Sede di Ancona',
      dallaMateria: true,
      tipologia: 'Verifica',
    });
    expect(proceduraEffettiva(titolo({}), lavorazioni)).toEqual({
      valore: '1. Formare la diffida\n2. Notificare',
      dallaMateria: true,
      tipologia: 'Diffida',
    });
  });

  it('un codice senza materia non eredita nulla', () => {
    expect(proceduraEffettiva(titolo({ materiaId: null }), lavorazioni).valore).toBeNull();
    expect(dipendenzaEffettiva(titolo({ materiaId: null }), lavorazioni).dallaMateria).toBe(false);
  });
});
