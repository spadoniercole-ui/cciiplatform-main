// src/lib/verificaAzienda/direttrici.ts
//
// QUANDO UNA DELLE TRE VERIFICHE È FATTA (0.253.0).
//
// La barra a tre direttrici della scheda azienda e il riepilogo della
// dashboard dicevano la stessa cosa in due modi. Qui c'è l'unico modo.
//
// La verifica aziendale è «fatta» quando esiste la fotografia salvata come
// base della proposta. Prima la si dava per fatta appena la verifica
// amministrativa memorizzava il debito: il debito è un dato in ingresso, non
// la lettura incrociata, e il verde si accendeva su un lavoro non ancora
// fatto. Il debito resta nella contabile, che lo legge; qui non decide nulla.
//
// Logica pura: nessun accesso al database, si prova con i test.

export type Stadio = 'COMPLETO' | 'PARZIALE' | 'MANCANTE' | 'NON_DISPONIBILE';

export interface SegnaliContabile {
  /** Visura, parametri dell'ente e almeno un bilancio: la contabile ha tutto. */
  completa: boolean;
  anniXbrl: number;
  visuraPresente: boolean;
}

export interface SegnaliDirettrici {
  /** L'azienda ha una verifica amministrativa registrata. */
  amministrativaLetta: boolean;
  /** null quando l'accesso non legge la contabile (Operatore). */
  contabile: SegnaliContabile | null;
  /** Esiste la fotografia salvata come base della proposta. */
  baseAziendaleSalvata: boolean;
}

export interface StatoDirettrici {
  amministrativa: Stadio;
  contabile: Stadio;
  aziendale: Stadio;
}

export function statoDirettrici(segnali: SegnaliDirettrici): StatoDirettrici {
  const amministrativa: Stadio = segnali.amministrativaLetta ? 'COMPLETO' : 'MANCANTE';
  const { contabile } = segnali;
  if (!contabile) {
    return { amministrativa, contabile: 'NON_DISPONIBILE', aziendale: 'NON_DISPONIBILE' };
  }

  const statoContabile: Stadio = contabile.completa
    ? 'COMPLETO'
    : contabile.anniXbrl > 0 || contabile.visuraPresente
      ? 'PARZIALE'
      : 'MANCANTE';

  // La verifica aziendale incrocia le altre due: la si può comporre solo
  // quando entrambe hanno qualcosa da dire. Con la fotografia salvata è
  // fatta; senza, ma con i due lati pronti, è cominciata.
  const aziendale: Stadio = segnali.baseAziendaleSalvata
    ? 'COMPLETO'
    : amministrativa === 'COMPLETO' && statoContabile === 'COMPLETO'
      ? 'PARZIALE'
      : 'MANCANTE';

  return { amministrativa, contabile: statoContabile, aziendale };
}
