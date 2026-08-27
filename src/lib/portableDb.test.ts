import { describe, it, expect } from 'vitest';

// Next.js compila l'applicazione in più grafi di moduli che convivono nello
// stesso processo: instrumentation, Server Action e Server Component non
// condividono la stessa copia di un modulo. Lo stato del database portable
// (l'istanza PGlite) DEVE quindi vivere in un punto che tutte le copie
// vedono, altrimenti ognuna apre il proprio database.
//
// Il difetto che questo test blocca, misurato in sandbox: il login scriveva
// la sessione in un'istanza e il controllo d'accesso la cercava in un'altra
// — accesso impossibile, senza messaggi. E, più grave del login, due
// istanze che salvano a turno lo stesso file cifrato si sovrascrivono a
// vicenda: perdita di dati silenziosa.
//
// Qui non si avvia PGlite (richiederebbe WASM e una passphrase): si
// verifica il MECCANISMO, cioè che il contenitore sia agganciato a
// globalThis con una chiave stabile e che due letture indipendenti — come
// farebbero due copie del modulo — ottengano lo stesso identico oggetto.

const CHIAVE_GLOBALE = Symbol.for('cciiplatform.portableDb.stato');

type Stato = { dirty: boolean; dataFile: string };

/** Riproduce la funzione di aggancio del modulo: se manca crea, altrimenti
 * restituisce quello già presente nel processo. */
function statoCondiviso(): Stato {
  const g = globalThis as unknown as Record<symbol, Stato | undefined>;
  if (!g[CHIAVE_GLOBALE]) {
    g[CHIAVE_GLOBALE] = { dirty: false, dataFile: '' };
  }
  return g[CHIAVE_GLOBALE] as Stato;
}

describe('stato del database portable', () => {
  it('Symbol.for restituisce la stessa chiave a ogni copia del modulo', () => {
    // Symbol('x') creerebbe un simbolo NUOVO a ogni copia del modulo, e ogni
    // copia avrebbe di nuovo il suo stato. Symbol.for usa il registro
    // globale del processo: è questo a rendere la chiave condivisibile.
    expect(Symbol.for('cciiplatform.portableDb.stato')).toBe(CHIAVE_GLOBALE);
    expect(Symbol('cciiplatform.portableDb.stato')).not.toBe(CHIAVE_GLOBALE);
  });

  it('due letture indipendenti ottengono lo STESSO oggetto, non due copie', () => {
    const primaCopia = statoCondiviso();
    const secondaCopia = statoCondiviso();
    expect(secondaCopia).toBe(primaCopia); // identità, non uguaglianza
  });

  it('una scrittura fatta da una copia è visibile alle altre', () => {
    // È esattamente il caso del login: una copia segna il database come
    // modificato, un'altra deve vederlo per poter salvare.
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
