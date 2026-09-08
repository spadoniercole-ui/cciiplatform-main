import { describe, it, expect } from 'vitest';
import {
  quotaIdentificatore,
  serializzaValore,
  verificaIntegrita,
  nomeFileBackup,
  intestazione,
} from './formato';

describe('quotatura degli identificatori', () => {
  it('quota sempre, anche i nomi innocui', () => {
    expect(quotaIdentificatore('aziende')).toBe('"aziende"');
  });

  it('raddoppia le virgolette interne', () => {
    expect(quotaIdentificatore('col"strana')).toBe('"col""strana"');
  });
});

describe('serializzazione dei valori', () => {
  it('NULL e undefined', () => {
    expect(serializzaValore(null)).toBe('NULL');
    expect(serializzaValore(undefined)).toBe('NULL');
  });

  it('le virgolette singole nelle stringhe sono raddoppiate', () => {
    // Senza questo, una ragione sociale come "L'Officina" spezza il file.
    expect(serializzaValore("L'Officina")).toBe("'L''Officina'");
  });

  it('booleani e numeri', () => {
    expect(serializzaValore(true)).toBe('TRUE');
    expect(serializzaValore(false)).toBe('FALSE');
    expect(serializzaValore(42)).toBe('42');
    expect(serializzaValore(-0.5)).toBe('-0.5');
  });

  it('NaN e Infinity diventano NULL, non letterali invalidi', () => {
    expect(serializzaValore(NaN)).toBe('NULL');
    expect(serializzaValore(Infinity)).toBe('NULL');
  });

  it('le date in ISO', () => {
    expect(serializzaValore(new Date('2026-08-27T10:00:00Z'))).toBe("'2026-08-27T10:00:00.000Z'");
  });

  it('gli array diventano ARRAY[...] e non testo', () => {
    // La colonna alias TEXT[] dei limiti di ricevibilità passa da qui.
    expect(serializzaValore(['INPS', "L'ente"])).toBe("ARRAY['INPS', 'L''ente']");
    // L'array vuoto NON può essere ARRAY[]: Postgres non ne dedurrebbe il
    // tipo e il ripristino fallirebbe.
    expect(serializzaValore([])).toBe("'{}'");
  });

  it('gli oggetti diventano jsonb con gli apici protetti', () => {
    expect(serializzaValore({ nota: "c'è" })).toBe(`'{"nota":"c''è"}'::jsonb`);
  });

  it('i Buffer diventano bytea esadecimale', () => {
    // Senza questo ramo un Buffer finirebbe stringificato e il dato sarebbe
    // perso senza che nulla segnali un errore.
    expect(serializzaValore(Buffer.from([0xde, 0xad]))).toBe("'\\xdead'::bytea");
  });
});

describe('controllo di integrità', () => {
  const inventario = [
    { schema: 'public', tabella: 'spazi', righe: 3 },
    { schema: 'tenant_a', tabella: 'aziende', righe: 10 },
  ];

  it('integro quando tutto corrisponde', () => {
    const e = verificaIntegrita(
      inventario,
      new Map([
        ['public.spazi', 3],
        ['tenant_a.aziende', 10],
      ]),
      new Set(['public.spazi', 'tenant_a.aziende'])
    );
    expect(e.integro).toBe(true);
  });

  it('rileva una tabella senza DDL', () => {
    const e = verificaIntegrita(
      inventario,
      new Map([['public.spazi', 3]]),
      new Set(['public.spazi'])
    );
    expect(e.integro).toBe(false);
    expect(e.tabelleMancanti).toEqual(['tenant_a.aziende']);
  });

  it('rileva un dump troncato a metà tabella', () => {
    // È il caso peggiore: il file sembra perfetto e mancano le ultime righe.
    const e = verificaIntegrita(
      inventario,
      new Map([
        ['public.spazi', 3],
        ['tenant_a.aziende', 7],
      ]),
      new Set(['public.spazi', 'tenant_a.aziende'])
    );
    expect(e.integro).toBe(false);
    expect(e.righeIncoerenti).toEqual([{ tabella: 'tenant_a.aziende', attese: 10, scritte: 7 }]);
  });

  it('una tabella vuota è integra, non mancante', () => {
    const e = verificaIntegrita(
      [{ schema: 'public', tabella: 'vuota', righe: 0 }],
      new Map(),
      new Set(['public.vuota'])
    );
    expect(e.integro).toBe(true);
  });
});

describe('intestazione e nome file', () => {
  it('l’intestazione avverte che il file contiene credenziali', () => {
    const t = intestazione({
      versioneApp: '0.109.34',
      generatoIl: '2026-08-27',
      schemi: 2,
      tabelle: 40,
      righe: 900,
      cifrato: false,
    });
    expect(t).toContain('credenziali');
    expect(t).toContain('NON è cifrato');
  });

  it('il nome file è ordinabile per data e senza due punti', () => {
    const n = nomeFileBackup('0.109.34', new Date('2026-08-27T10:33:07Z'), true);
    expect(n).toBe('ccii-backup-0.109.34-2026-08-27T10-33-07.sql.enc');
    expect(n).not.toContain(':');
  });
});
