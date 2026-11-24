// IL DEBITO VERSO L'ENTE, IN BILANCIO O NO (0.256.5 — per voce dalla 0.256.7).
//
// La verifica amministrativa accerta quanto l'azienda deve all'ente; il
// bilancio dice se quella somma l'azienda l'ha scritta da qualche parte. Sono
// due cose diverse e vanno lette insieme: un debito accertato che in bilancio
// non c'è vuol dire che l'esposizione è più grande di quella dichiarata, e che
// il patrimonio netto letto negli indici non tiene conto di quella posta.
//
// QUALE VOCE SI GUARDA. Sommare debiti tributari e previdenziali è la lettura
// giusta solo quando l'ente non si sa chi è: un debito da 40.000 verso l'INPS
// risulterebbe «contabilizzato» grazie a 40.000 di debiti tributari di tutt'al-
// tro, e un debito verso l'Agenzia delle Entrate grazie ai contributi. Quando
// l'ente è riconosciuto, si guarda la voce che gli compete:
//
//   INPS, INAIL                        → debiti previdenziali
//   Agenzia delle Entrate, Riscossione → debiti tributari
//
// LA MAPPATURA NON SI INVENTA. L'elenco chiuso esiste già nei parametri dello
// spazio: `limiti_ricevibilita.ente_25novies` (INPS | INAIL | AGENZIA_ENTRATE |
// AGENZIA_RISCOSSIONE | NON_PUBBLICO | NULL). Se è NULL o NON_PUBBLICO — o se
// l'ente è l'Agente della Riscossione, che porta a ruolo partite di natura
// diversa — si torna alla somma e lo si dichiara. INAIL sta con i previdenziali
// perché la voce XBRL è unica («debiti verso istituti di previdenza e di
// sicurezza sociale») e comprende l'istituto.
//
// GLI ALIAS. L'ente nei documenti ha più nomi (sigla, denominazione estesa,
// vecchie denominazioni): sono i parametri dello spazio a dichiararli. Se non
// sono configurati, la lettura per nome è più fragile e va detto: il controllo
// sugli importi resta valido, quello sull'intestazione no.
//
// NESSUN NUMERO INVENTATO. Bilancio assente, esposizione non accertata, voce
// non letta: la verifica si dichiara «non verificabile» col motivo. Non si dice
// «non contabilizzato» quando il dato che lo dimostrerebbe non c'è.
//
// Logica pura, con i suoi test.

export type StatoDebitoInBilancio = 'CONTABILIZZATO' | 'NON_CONTABILIZZATO' | 'NON_VERIFICABILE';

/** Le due voci del passivo verso i creditori pubblici che il bilancio espone. */
export type VocePubblica = 'TRIBUTARI' | 'PREVIDENZIALI';

export const ETICHETTA_VOCE: Record<VocePubblica, string> = {
  TRIBUTARI: 'i debiti tributari',
  PREVIDENZIALI: 'i debiti previdenziali',
};

/**
 * La voce che compete all'ente, dall'elenco chiuso già configurato nei
 * parametri (`ente_25novies`). null = nessuna voce unica: si guarda la somma.
 */
export function vocePerEnte(ente25novies: string | null | undefined): VocePubblica | null {
  const codice = (ente25novies ?? '').trim().toUpperCase();
  if (codice === 'INPS' || codice === 'INAIL') return 'PREVIDENZIALI';
  if (codice === 'AGENZIA_ENTRATE') return 'TRIBUTARI';
  // L'Agente della Riscossione riscuote anche tributi e contributi per conto
  // di altri: la sua voce non è una sola, e non si sceglie per lui.
  return null;
}

/**
 * Quanto risulta in bilancio per la voce scelta. `null` significa «voce non
 * letta», che non è zero: la verifica non si esprime.
 */
export function importoInBilancio(
  voci: { tributari: number | null; previdenziali: number | null },
  voce: VocePubblica | null
): number | null {
  if (voce === 'TRIBUTARI') return voci.tributari;
  if (voce === 'PREVIDENZIALI') return voci.previdenziali;
  if (voci.tributari === null && voci.previdenziali === null) return null;
  return (voci.tributari ?? 0) + (voci.previdenziali ?? 0);
}

export interface DebitoInBilancio {
  stato: StatoDebitoInBilancio;
  /** L'esposizione accertata nella verifica amministrativa. */
  esposizione: number | null;
  /** Quanto risulta in bilancio nella voce guardata (o nella somma, senza voce). */
  inBilancio: number | null;
  /** La voce guardata; null quando il confronto è sulla somma. */
  voce: VocePubblica | null;
  /** Gli alias dell'ente configurati nei parametri dello spazio. */
  alias: string[];
  /** La frase da mostrare: dice il fatto e il suo limite. */
  testo: string;
  /** true quando va messo in evidenza, non solo letto. */
  segnala: boolean;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function confrontaDebitoInBilancio(input: {
  esposizione: number | null;
  /** Le due voci come le porta il bilancio; null quando non sono state lette. */
  vociBilancio: { tributari: number | null; previdenziali: number | null };
  /**
   * L'ente come è configurato nei parametri (`ente_25novies`). Se riconosciuto,
   * il confronto guarda la sua voce invece della somma.
   */
  ente25novies?: string | null;
  bilancioLetto: boolean;
  alias: string[];
}): DebitoInBilancio {
  const alias = input.alias.map((a) => a.trim()).filter((a) => a.length > 0);
  const notaAlias =
    alias.length === 0
      ? ' Gli alias dell’ente non sono configurati: un debito scritto in bilancio con un altro nome non sarebbe riconosciuto.'
      : ` Nomi riconosciuti in configurazione: ${alias.join(', ')}.`;

  const voce = vocePerEnte(input.ente25novies);
  const voci = voce ? ETICHETTA_VOCE[voce] : 'i debiti tributari e previdenziali';
  // PERCHÉ UNA VOCE SOLA: senza, un debito verso l'INPS potrebbe risultare
  // coperto dai debiti tributari — un'altra posta, un altro creditore.
  const notaVoce = voce
    ? ` Il confronto guarda ${voci}: è la voce che compete a questo ente secondo i parametri dello spazio (${String(
        input.ente25novies
      ).toUpperCase()}).`
    : input.ente25novies
      ? ` L’ente è configurato come ${String(
          input.ente25novies
        ).toUpperCase()}: le sue partite non stanno in una voce sola, quindi si guarda la somma delle due.`
      : ' L’ente non è classificato nei parametri dello spazio: il confronto guarda la somma delle due voci, e un importo può trovare riscontro in una posta che riguarda un altro creditore.';

  const inBilancio = input.bilancioLetto ? importoInBilancio(input.vociBilancio, voce) : null;

  if (!input.bilancioLetto) {
    return {
      stato: 'NON_VERIFICABILE',
      esposizione: input.esposizione,
      inBilancio: null,
      voce,
      alias,
      testo:
        'Nessun bilancio XBRL letto: non si può dire se il debito verso l’ente sia contabilizzato.',
      segnala: false,
    };
  }

  if (input.esposizione === null || input.esposizione <= 0) {
    return {
      stato: 'NON_VERIFICABILE',
      esposizione: input.esposizione,
      inBilancio,
      voce,
      alias,
      testo:
        'L’esposizione dell’ente non è accertata: senza l’importo non c’è nulla da ritrovare in bilancio.',
      segnala: false,
    };
  }

  if (inBilancio === null) {
    return {
      stato: 'NON_VERIFICABILE',
      esposizione: input.esposizione,
      inBilancio: null,
      voce,
      alias,
      testo: `La voce del bilancio (${voci}) non è stata letta: il confronto con ${euro(
        input.esposizione
      )} non si fa.${notaVoce}${notaAlias}`,
      segnala: false,
    };
  }

  if (inBilancio <= 0) {
    return {
      stato: 'NON_CONTABILIZZATO',
      esposizione: input.esposizione,
      inBilancio: 0,
      voce,
      alias,
      testo: `Il debito di ${euro(
        input.esposizione
      )} accertato in amministrativa non trova riscontro in bilancio: ${voci} ${
        voce ? 'risulta a zero' : 'sono a zero'
      }. Il debito risulta non contabilizzato.${notaVoce}${notaAlias}`,
      segnala: true,
    };
  }

  const coperto = inBilancio >= input.esposizione;
  return {
    stato: 'CONTABILIZZATO',
    esposizione: input.esposizione,
    inBilancio,
    voce,
    alias,
    testo: coperto
      ? `Il debito di ${euro(input.esposizione)} trova riscontro in bilancio (${voci}: ${euro(
          inBilancio
        )}).${notaVoce}${notaAlias}`
      : `In bilancio risultano ${euro(inBilancio)} in ${voci} contro i ${euro(
          input.esposizione
        )} accertati: il debito è contabilizzato solo in parte.${notaVoce}${notaAlias}`,
    segnala: !coperto,
  };
}
