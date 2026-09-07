// src/lib/tentativiAccesso.ts
//
// Limitazione dei tentativi falliti, in memoria di processo.
//
// Nasce per il Superadmin, che è il caso peggiore della piattaforma: la sua
// password è una stringa statica in chiaro nella configurazione, senza
// scadenza né rotazione, e la porta d'ingresso è pubblica. Fino a oggi non
// c'era alcun limite: si poteva provare all'infinito, alla velocità della
// rete, senza che nulla rallentasse o lasciasse traccia.
//
// PERCHÉ IN MEMORIA E NON NEL DATABASE. Il conteggio serve a rallentare chi
// bussa, non a produrre un registro: tenerlo nel database significherebbe una
// scrittura per ogni tentativo fallito, cioè regalare a chi attacca un modo
// per far lavorare il database al posto nostro. In memoria il costo di un
// tentativo resta a carico di chi lo fa.
//
// IL LIMITE DI QUESTA SCELTA, detto chiaramente: lo stato vive nel processo.
// Su un'infrastruttura serverless con più istanze il conteggio è per istanza,
// e un riavvio lo azzera. Non è quindi una difesa contro un attacco
// distribuito e paziente; è un freno efficace contro il caso concreto e assai
// più probabile — qualcuno che prova a indovinare da un punto solo. Per una
// difesa completa servirebbe uno store condiviso, che è un'altra decisione.
//
// Lo stato sta su globalThis e non in una variabile di modulo per la stessa
// ragione documentata in portableDb.ts: Next.js compila l'applicazione in più
// grafi di moduli che non condividono le copie: un contatore per grafo
// moltiplicherebbe i tentativi concessi.

type Stato = Map<string, { fallimenti: number; bloccatoFino: number }>;

const CHIAVE = Symbol.for('cciiplatform.tentativiAccesso');

function stato(): Stato {
  const g = globalThis as unknown as Record<symbol, Stato | undefined>;
  if (!g[CHIAVE]) g[CHIAVE] = new Map();
  return g[CHIAVE] as Stato;
}

/** Tentativi consentiti prima del blocco. */
export const MAX_TENTATIVI = 5;
/** Durata del blocco, in minuti. */
export const MINUTI_BLOCCO = 15;

export interface EsitoControllo {
  bloccato: boolean;
  /** Secondi mancanti alla riapertura; 0 se non bloccato. */
  secondiRimanenti: number;
  /** Tentativi ancora disponibili prima del blocco. */
  rimanenti: number;
}

/** Da chiamare PRIMA di verificare la password. */
export function controllaTentativi(chiave: string, ora: number = Date.now()): EsitoControllo {
  const s = stato();
  const v = s.get(chiave);
  if (!v) return { bloccato: false, secondiRimanenti: 0, rimanenti: MAX_TENTATIVI };

  if (v.bloccatoFino > ora) {
    return {
      bloccato: true,
      secondiRimanenti: Math.ceil((v.bloccatoFino - ora) / 1000),
      rimanenti: 0,
    };
  }

  // Blocco scaduto: si riparte puliti.
  if (v.bloccatoFino !== 0 && v.bloccatoFino <= ora) {
    s.delete(chiave);
    return { bloccato: false, secondiRimanenti: 0, rimanenti: MAX_TENTATIVI };
  }

  return {
    bloccato: false,
    secondiRimanenti: 0,
    rimanenti: Math.max(0, MAX_TENTATIVI - v.fallimenti),
  };
}

/** Da chiamare dopo un tentativo FALLITO. */
export function registraFallimento(chiave: string, ora: number = Date.now()): EsitoControllo {
  const s = stato();
  const v = s.get(chiave) ?? { fallimenti: 0, bloccatoFino: 0 };
  v.fallimenti += 1;

  if (v.fallimenti >= MAX_TENTATIVI) {
    v.bloccatoFino = ora + MINUTI_BLOCCO * 60 * 1000;
    v.fallimenti = 0; // azzerato: il conteggio riparte dopo il blocco
    s.set(chiave, v);
    return { bloccato: true, secondiRimanenti: MINUTI_BLOCCO * 60, rimanenti: 0 };
  }

  s.set(chiave, v);
  return {
    bloccato: false,
    secondiRimanenti: 0,
    rimanenti: MAX_TENTATIVI - v.fallimenti,
  };
}

/** Da chiamare dopo un accesso RIUSCITO: il contatore si azzera. */
export function azzeraTentativi(chiave: string): void {
  stato().delete(chiave);
}
