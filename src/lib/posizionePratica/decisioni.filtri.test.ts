import { describe, expect, it } from 'vitest';
import {
  etichettaAutore,
  filtraDecisioni,
  riassuntoDecisione,
  type Decisione,
  type EsitoDecisione,
} from './decisioni';

// La traccia si deve poter cercare: per persona, per esito e per periodo. Le
// regole stanno in una funzione pura, così si provano senza montare la pagina.

const decisione = (
  id: number,
  patch: Partial<Decisione> & { esito?: EsitoDecisione } = {}
): Decisione => ({
  id,
  esito: 'PROSEGUI',
  motivazione: 'Il credito quadra e la documentazione è completa.',
  autore: 'anna.verdi',
  autoreId: 12,
  autoreModalita: 'ADMIN_SPAZIO',
  credito: 152_000,
  copertura: '4/4',
  decisaIl: '2026-11-17T09:00:00.000Z',
  autoreAttivo: true,
  ...patch,
});

const TRACCIA: Decisione[] = [
  decisione(3, {
    esito: 'ARCHIVIA',
    autore: 'marco.rossi',
    autoreId: 9,
    autoreModalita: 'OPERATORE',
    motivazione: 'La posizione è stata archiviata su richiesta dell’azienda.',
    decisaIl: '2026-06-30T15:00:00.000Z',
  }),
  decisione(2, {
    esito: 'CHIEDI_DOCUMENTI',
    autore: 'anna.verdi',
    motivazione: 'Manca il DURC aggiornato e la deleghe F24 del trimestre.',
    decisaIl: '2026-07-01T08:00:00.000Z',
  }),
  decisione(1, { esito: 'PROSEGUI', decisaIl: '2026-06-01T08:00:00.000Z' }),
];

describe('filtri della traccia delle decisioni', () => {
  it('senza filtri restituisce tutto, nell’ordine ricevuto', () => {
    expect(filtraDecisioni(TRACCIA).map((d) => d.id)).toEqual([3, 2, 1]);
  });

  it('cerca per autore, motivo ed esito, senza distinguere maiuscole', () => {
    expect(filtraDecisioni(TRACCIA, { testo: 'MARCO' }).map((d) => d.id)).toEqual([3]);
    expect(filtraDecisioni(TRACCIA, { testo: 'durc' }).map((d) => d.id)).toEqual([2]);
    expect(filtraDecisioni(TRACCIA, { testo: 'archiviare' }).map((d) => d.id)).toEqual([3]);
    // Una parola che non c'è non deve restituire tutto per compassione.
    expect(filtraDecisioni(TRACCIA, { testo: 'inesistente' })).toEqual([]);
  });

  it('filtra per esito', () => {
    expect(filtraDecisioni(TRACCIA, { esito: 'PROSEGUI' }).map((d) => d.id)).toEqual([1]);
    expect(filtraDecisioni(TRACCIA, { esito: '' })).toHaveLength(3);
  });

  it('filtra per periodo, estremi inclusi', () => {
    expect(filtraDecisioni(TRACCIA, { dal: '2026-07-01' }).map((d) => d.id)).toEqual([2]);
    expect(filtraDecisioni(TRACCIA, { al: '2026-06-30' }).map((d) => d.id)).toEqual([3, 1]);
    expect(
      filtraDecisioni(TRACCIA, { dal: '2026-06-01', al: '2026-06-30' }).map((d) => d.id)
    ).toEqual([3, 1]);
  });

  it('i filtri si sommano', () => {
    expect(filtraDecisioni(TRACCIA, { testo: 'anna', dal: '2026-07-01' }).map((d) => d.id)).toEqual(
      [2]
    );
  });

  it('una data malformata non svuota la traccia: si ignora', () => {
    expect(filtraDecisioni(TRACCIA, { dal: 'ieri' })).toHaveLength(3);
  });
});

describe('etichetta dell’autore', () => {
  it('dice l’id e se l’utente è ancora attivo', () => {
    expect(etichettaAutore(decisione(1))).toBe('utente #12');
    expect(etichettaAutore(decisione(1, { autoreAttivo: false }))).toBe(
      'utente #12 · non più attivo'
    );
  });

  it('distingue la sessione Superadmin da una riga senza id', () => {
    expect(etichettaAutore(decisione(1, { autoreId: null, autoreModalita: 'SALVAGENTE' }))).toBe(
      'sessione Superadmin'
    );
    expect(etichettaAutore(decisione(1, { autoreId: null, autoreModalita: null }))).toBe(
      'senza id utente'
    );
  });

  it('il riassunto usa il formattatore unico degli importi', () => {
    expect(riassuntoDecisione(decisione(1, { credito: 7782 }))).toContain('7.782 €');
  });
});
