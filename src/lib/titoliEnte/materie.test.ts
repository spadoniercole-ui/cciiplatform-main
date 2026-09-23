import { describe, it, expect } from 'vitest';
import { normalizzaProposta, materiaSuggeritaPerDescrizione } from './materie';

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
