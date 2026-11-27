import { describe, expect, it } from 'vitest';
import {
  riepilogoVerificheEnte,
  ripartoDebitoPiano,
  saldoRigaPosizione,
  sintesiVerificheEnte,
  totaleVerificheEnte,
} from './verificheEnte';

describe('verifiche dell’ente', () => {
  it('senza righe non inventa una verifica', () => {
    const r = riepilogoVerificheEnte({ righeVera: [], righePosizione: [] });
    expect(r.presenti).toBe(0);
    expect(r.voci).toEqual([]);
    expect(sintesiVerificheEnte(r)).toContain('Nessuna verifica dell’ente caricata');
  });

  it('somma la certificazione e dichiara quando è stata letta', () => {
    const r = riepilogoVerificheEnte({
      righeVera: [{ importo: 100 }, { importo: 250.5 }],
      documentiCaricatiIl: '2026-03-04',
      righePosizione: [],
    });
    expect(r.presenti).toBe(1);
    expect(r.voci[0].righe).toBe(2);
    expect(r.voci[0].totale).toBeCloseTo(350.5);
    expect(r.voci[0].dettaglio).toBe('letto il 04/03/2026');
  });

  it('la posizione conta il saldo, non il debito originario', () => {
    const r = riepilogoVerificheEnte({
      righeVera: [],
      righePosizione: [
        { importo: 1000, importoVersato: 400 },
        { importo: 300, importoVersato: null },
      ],
    });
    expect(r.voci[0].codice).toBe('POSIZIONE');
    expect(r.voci[0].totale).toBe(900);
    expect(r.voci[0].righe).toBe(2);
  });

  it('il saldo non scende sotto zero se il versato supera l’importo', () => {
    expect(saldoRigaPosizione({ importo: 100, importoVersato: 150 })).toBe(0);
  });

  it('il debito che entra nel piano si divide fra ente e AdR', () => {
    const r = ripartoDebitoPiano({ totale: 194_712, creditiAgente: 44_712 }, 194_712);
    expect(r.adr).toBe(44_712);
    expect(r.ente).toBe(150_000);
    expect(r.diversoDallElenco).toBe(false);
  });

  it('dichiara quando la cifra del piano non è la somma delle posizioni', () => {
    // Le posizioni a schermo sommano 194.712: sospese e non determinate restano
    // fuori dal debito certo, quindi il piano parte da 180.000.
    const r = ripartoDebitoPiano({ totale: 180_000, creditiAgente: 30_000 }, 194_712);
    expect(r.totale).toBe(180_000);
    expect(r.ente).toBe(150_000);
    expect(r.diversoDallElenco).toBe(true);
  });

  it('una quota AdR più grande del totale non produce cifre negative', () => {
    const r = ripartoDebitoPiano({ totale: 100, creditiAgente: 150 }, 100);
    expect(r.adr).toBe(100);
    expect(r.ente).toBe(0);
  });

  it('la sintesi dice quante verifiche e per quanto', () => {
    const r = riepilogoVerificheEnte({
      righeVera: [{ importo: 500 }],
      righePosizione: [{ importo: 500, importoVersato: null }],
    });
    expect(totaleVerificheEnte(r)).toBe(1000);
    // Il separatore delle migliaia dipende dal locale del runtime: si confronta
    // con la stessa formattazione, non con una stringa fissata a mano.
    expect(sintesiVerificheEnte(r)).toBe(
      `2 verifiche caricate — ${(1000).toLocaleString('it-IT')} €.`
    );
  });
});
