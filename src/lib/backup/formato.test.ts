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

describe('serializzazione guidata dal TIPO DELLA COLONNA', () => {
  it('una colonna jsonb che contiene un array resta jsonb', () => {
    // Il caso reale: spazi.direttrici_ente_strutturate è jsonb e contiene un
    // array JSON. Il driver la restituisce come array JavaScript, identica a
    // una colonna text[]. Senza il tipo della colonna veniva serializzata
    // come ARRAY[...] e il ripristino falliva con
    //   column "..." is of type jsonb but expression is of type jsonb[]
    const valore = [{ nome: 'Direttrice A' }, { nome: 'Direttrice B' }];
    const sql = serializzaValore(valore, 'jsonb');
    expect(sql).toContain('::jsonb');
    expect(sql).not.toContain('ARRAY[');
  });

  it('una colonna jsonb che contiene un oggetto resta jsonb', () => {
    expect(serializzaValore({ a: 1 }, 'jsonb')).toBe(`'{"a":1}'::jsonb`);
  });

  it('una colonna jsonb con apostrofi non spezza il file', () => {
    expect(serializzaValore({ n: "L'Officina" }, 'jsonb')).toBe(`'{"n":"L''Officina"}'::jsonb`);
  });

  it('una colonna array VERA diventa ARRAY, con il tipo dichiarato', () => {
    const sql = serializzaValore(['INPS', 'Enti previdenziali'], '_text');
    expect(sql).toBe(`ARRAY['INPS', 'Enti previdenziali']::text[]`);
  });

  it('una colonna array vuota resta il letterale vuoto', () => {
    expect(serializzaValore([], '_text')).toBe(`'{}'`);
  });

  it('NULL resta NULL qualunque sia il tipo', () => {
    expect(serializzaValore(null, 'jsonb')).toBe('NULL');
    expect(serializzaValore(null, '_text')).toBe('NULL');
  });

  it('senza tipo si torna al comportamento precedente', () => {
    expect(serializzaValore('testo')).toBe("'testo'");
    expect(serializzaValore(42, 'int4')).toBe('42');
  });
});
