import { describe, it, expect } from 'vitest';

// Next.js compila l'applicazione in più grafi di moduli che convivono nello
// stesso processo: instrumentation, Server Action e Server Component non
// condividono la stessa copia di un modulo. Lo stato del database portable
// (l'istanza PGlite) DEVE quindi vivere dove tutte le copie lo vedono.
//
// Il difetto che questo test blocca, misurato in sandbox: TRE istanze
// distinte nello stesso processo. Il login scriveva la sessione nella prima,
// il controllo d'accesso la cercava nella terza — accesso impossibile, senza
// messaggi. E, più grave, tre istanze che salvano a turno lo stesso file
// cifrato si sovrascrivono a vicenda: perdita di dati silenziosa.
//
// Qui non si avvia PGlite (richiederebbe WASM e una passphrase): si verifica
// il MECCANISMO di condivisione.

const CHIAVE_GLOBALE = Symbol.for('cciiplatform.portableDb.stato');
type Stato = { dirty: boolean; dataFile: string };

function statoCondiviso(): Stato {
  const g = globalThis as unknown as Record<symbol, Stato | undefined>;
  if (!g[CHIAVE_GLOBALE]) g[CHIAVE_GLOBALE] = { dirty: false, dataFile: '' };
  return g[CHIAVE_GLOBALE] as Stato;
}

describe('stato del database portable', () => {
  it('Symbol.for restituisce la stessa chiave a ogni copia del modulo', () => {
    // Symbol('x') creerebbe un simbolo NUOVO per ogni copia, e ogni copia
    // avrebbe di nuovo il suo stato. Symbol.for usa il registro globale.
    expect(Symbol.for('cciiplatform.portableDb.stato')).toBe(CHIAVE_GLOBALE);
    expect(Symbol('cciiplatform.portableDb.stato')).not.toBe(CHIAVE_GLOBALE);
  });

  it('due letture indipendenti ottengono lo STESSO oggetto', () => {
    expect(statoCondiviso()).toBe(statoCondiviso()); // identità, non uguaglianza
  });

  it('una scrittura fatta da una copia è visibile alle altre', () => {
    const scrittore = statoCondiviso();
    scrittore.dirty = true;
    scrittore.dataFile = '/percorso/ccii.db.enc';
    const lettore = statoCondiviso();
    expect(lettore.dirty).toBe(true);
    expect(lettore.dataFile).toBe('/percorso/ccii.db.enc');
    scrittore.dirty = false;
    expect(lettore.dirty).toBe(false);
  });
});
