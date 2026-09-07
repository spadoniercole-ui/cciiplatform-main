import { describe, it, expect } from 'vitest';
import { leggiBackup, sembraCifrato } from './leggi';

// Questa validazione è ciò che sta FRA il file caricato e l'azzeramento del
// database. Se lascia passare un file rotto, si cancella tutto per poi
// scoprire che non c'era nulla da rimettere dentro.

const TESTA = `-- ============================================================
-- CCIIPlatform — BACKUP COMPLETO DEL DATABASE
-- Versione applicazione: 0.109.35
-- Generato il: 2026-09-07T18:00:00.000Z
-- Schemi: 2 · Tabelle: 2 · Righe: 3
-- ============================================================
`;

const CORPO = `BEGIN;

CREATE SCHEMA IF NOT EXISTS "public";
CREATE TABLE IF NOT EXISTS "public"."a" (
  "id" integer
);
CREATE TABLE IF NOT EXISTS "public"."b" (
  "id" integer
);
INSERT INTO "public"."a" ("id") VALUES (1);
INSERT INTO "public"."a" ("id") VALUES (2);
INSERT INTO "public"."b" ("id") VALUES (1);
ALTER TABLE public.a ADD CONSTRAINT a_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS idx_b ON public.b (id);
SELECT setval('public.a_id_seq', 2, true);

COMMIT;`;

const BUONO = TESTA + CORPO;

describe('riconoscimento del formato', () => {
  it('un backup in chiaro non è scambiato per cifrato', () => {
    expect(sembraCifrato(BUONO)).toBe(false);
  });

  it('un blob base64 è riconosciuto come cifrato', () => {
    expect(sembraCifrato(Buffer.from(BUONO).toString('base64'))).toBe(true);
  });
});

describe('validazione del backup', () => {
  it('accetta un backup integro e ne legge l’intestazione', () => {
    const e = leggiBackup(BUONO);
    expect(e.valido).toBe(true);
    expect(e.problemi).toEqual([]);
    expect(e.intestazione?.versioneApp).toBe('0.109.35');
    expect(e.intestazione?.tabelle).toBe(2);
    expect(e.conteggi?.insert).toBe(3);
    expect(e.conteggi?.setval).toBe(1);
  });

  it('rifiuta un file che non è un nostro backup', () => {
    const e = leggiBackup('SELECT 1;');
    expect(e.valido).toBe(false);
    expect(e.problemi[0]).toContain('non è riconosciuto');
  });

  it('una passphrase errata produce rumore, e il rumore viene rifiutato', () => {
    // La decifratura con chiave sbagliata fallisce o restituisce byte
    // arbitrari: in entrambi i casi non c'è la firma del backup.
    const e = leggiBackup('\u0001\u00a3rumore binario qualsiasi');
    expect(e.valido).toBe(false);
    expect(e.problemi[0]).toContain('passphrase');
  });

  it('rifiuta un file troncato — il guasto che sembra a posto', () => {
    const troncato = BUONO.slice(0, BUONO.length - 40);
    const e = leggiBackup(troncato);
    expect(e.valido).toBe(false);
    expect(e.problemi.some((p) => p.includes('troncato'))).toBe(true);
  });

  it('rileva la manomissione: righe rimosse dopo la generazione', () => {
    // L'intestazione dichiara 3 righe; ne tolgo una.
    const manomesso = BUONO.replace('INSERT INTO "public"."b" ("id") VALUES (1);\n', '');
    const e = leggiBackup(manomesso);
    expect(e.valido).toBe(false);
    expect(e.problemi.some((p) => p.includes('3 righe') && p.includes('2 INSERT'))).toBe(true);
  });

  it('rileva una tabella sparita rispetto a quanto dichiarato', () => {
    const manomesso = BUONO.replace(
      'CREATE TABLE IF NOT EXISTS "public"."b" (\n  "id" integer\n);\n',
      ''
    );
    const e = leggiBackup(manomesso);
    expect(e.valido).toBe(false);
    expect(e.problemi.some((p) => p.includes('2 tabelle') && p.includes('1'))).toBe(true);
  });

  it('rifiuta un file vuoto', () => {
    expect(leggiBackup('').valido).toBe(false);
    expect(leggiBackup('   ').valido).toBe(false);
  });
});
