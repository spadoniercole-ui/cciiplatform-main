import { describe, it, expect } from 'vitest';
import {
  confermaModificata,
  normalizzaProposta,
  materiaSuggeritaPerDescrizione,
  statoSenzaConferma,
} from './materie';

const MATERIE = [
  { id: 1, nome: 'Denunce Uniemens e flussi mensili' },
  { id: 2, nome: 'Note di rettifica' },
  { id: 3, nome: 'Dilazioni amministrative' },
  { id: 4, nome: 'Verbali ispettivi' },
];

describe('materie dell’ente', () => {
  it('la proposta si normalizza senza eccezioni e dice se ha una fonte ufficiale', () => {
    const p = normalizzaProposta(
      {
        presupposti: [
          { norma: 'D.L. 269/2003, art. 44, c. 9', url: 'https://www.normattiva.it/x' },
        ],
        riferimenti: [
          {
            tipo: 'messaggio',
            estremi: 'n. 11903 del 25 maggio 2009',
            url: 'https://www.inps.it/y',
          },
        ],
        sintesi: 'ok',
      },
      '2026-09-23',
      ['inps.it', 'normattiva.it']
    );
    expect(p?.presupposti[0].norma).toContain('269/2003');
    expect(p?.conFonteUfficiale).toBe(true);
    expect(normalizzaProposta({ presupposti: [], riferimenti: [] }, '2026-09-23', [])).toBeNull();
    expect(normalizzaProposta('x', '2026-09-23', [])).toBeNull();
  });
  it('i codici cadono nella materia dalla descrizione, e senza certezza restano da assegnare', () => {
    expect(materiaSuggeritaPerDescrizione('DENUNCIA MENSILE INSOLUTA', MATERIE)).toBe(1);
    expect(materiaSuggeritaPerDescrizione('NOTA DI RETTIFICA NON PAGATA', MATERIE)).toBe(2);
    expect(materiaSuggeritaPerDescrizione('PRATICA APERTA PER GESTIONE DILAZIONE', MATERIE)).toBe(
      3
    );
    expect(materiaSuggeritaPerDescrizione('VERBALE ISPETTIVO VIGILANZA CONGIUNTA', MATERIE)).toBe(
      4
    );
    expect(materiaSuggeritaPerDescrizione('SEGNALAZIONE SETTORE ISCRIZIONI', MATERIE)).toBeNull();
  });
});

//
// LA CONFERMA NON È DEFINITIVA (0.139.10).
//
// Una materia confermata copre i codici che vi cadono, e il loro riscontro è il
// suo. Toglierla o correggerla deve cambiare subito quello che i codici
// leggono: queste due funzioni dicono in quale stato si torna e quando una
// conferma è da considerarsi corretta.
//
describe('la conferma di una materia si toglie e si corregge', () => {
  it('tolta la conferma si torna alla proposta, o alla ricerca se non c’è nulla da rileggere', () => {
    const proposta = normalizzaProposta(
      { presupposti: [{ norma: 'art. 44, comma 9, D.L. 269/2003' }] },
      '2026-10-28',
      []
    );
    // Mai «confermata»: quello è un atto di una persona, e toglierlo non può
    // lasciarla in piedi.
    expect(statoSenzaConferma({ proposta })).toBe('PROPOSTA');
    expect(statoSenzaConferma({ proposta: null })).toBe('DA_RICERCARE');
  });

  it('una conferma è corretta quando cambia il testo che i codici leggono', () => {
    const confermata = {
      presuppostoGiuridico: 'Art. 2, comma 18, legge 8 agosto 1995, n. 335',
      riferimentiInterni: 'circolare n. 162 del 27-12-2010',
    };
    // Gli spazi ai bordi non sono una correzione.
    expect(
      confermaModificata(confermata, {
        presuppostoGiuridico: ` ${confermata.presuppostoGiuridico} `,
        riferimentiInterni: confermata.riferimentiInterni,
      })
    ).toBe(false);
    expect(
      confermaModificata(confermata, {
        presuppostoGiuridico: 'Art. 3, comma 1, legge 8 agosto 1995, n. 335',
        riferimentiInterni: confermata.riferimentiInterni,
      })
    ).toBe(true);
    // Anche togliere il riferimento interno è una correzione: il codice smette
    // di leggere quel documento.
    expect(
      confermaModificata(confermata, {
        presuppostoGiuridico: confermata.presuppostoGiuridico,
        riferimentiInterni: null,
      })
    ).toBe(true);
    expect(
      confermaModificata(
        { presuppostoGiuridico: null, riferimentiInterni: null },
        { presuppostoGiuridico: 'Art. 1', riferimentiInterni: '' }
      )
    ).toBe(true);
  });
});
