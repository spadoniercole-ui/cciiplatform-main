// IL DEBITO VERSO L'ENTE, IN BILANCIO O NO (0.256.5).
//
// La verifica amministrativa accerta quanto l'azienda deve all'ente; il
// bilancio dice se quella somma l'azienda l'ha scritta da qualche parte. Sono
// due cose diverse e vanno lette insieme: un debito accertato che in bilancio
// non c'è vuol dire che l'esposizione è più grande di quella dichiarata, e che
// il patrimonio netto letto negli indici non tiene conto di quella posta.
//
// CHE COSA SI CONFRONTA, ESATTAMENTE. Non l'intero bilancio: le voci verso i
// creditori pubblici — debiti tributari e debiti previdenziali. Se l'esposizione
// dell'ente è positiva e quelle voci sono a zero, il debito non risulta
// contabilizzato. Non è una prova di falso in bilancio e non si scrive così:
// si scrive che non trova riscontro, e si dichiara che un debito può essere
// contabilizzato sotto un'altra voce.
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

export interface DebitoInBilancio {
  stato: StatoDebitoInBilancio;
  /** L'esposizione accertata nella verifica amministrativa. */
  esposizione: number | null;
  /** Le voci di bilancio verso i creditori pubblici, sommate. */
  inBilancio: number | null;
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
  /** null quando la voce non è stata letta: «non c'è» e «non si sa» non sono lo stesso. */
  inBilancio: number | null;
  bilancioLetto: boolean;
  alias: string[];
  /** Le voci sommate, per nome: «debiti tributari e previdenziali». */
  voci: string | null;
}): DebitoInBilancio {
  const alias = input.alias.map((a) => a.trim()).filter((a) => a.length > 0);
  const notaAlias =
    alias.length === 0
      ? ' Gli alias dell’ente non sono configurati: un debito scritto in bilancio con un altro nome non sarebbe riconosciuto.'
      : ` Nomi riconosciuti in configurazione: ${alias.join(', ')}.`;

  if (!input.bilancioLetto) {
    return {
      stato: 'NON_VERIFICABILE',
      esposizione: input.esposizione,
      inBilancio: null,
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
      inBilancio: input.inBilancio,
      alias,
      testo:
        'L’esposizione dell’ente non è accertata: senza l’importo non c’è nulla da ritrovare in bilancio.',
      segnala: false,
    };
  }

  if (input.inBilancio === null) {
    return {
      stato: 'NON_VERIFICABILE',
      esposizione: input.esposizione,
      inBilancio: null,
      alias,
      testo: `Le voci del bilancio verso i creditori pubblici non sono state lette: il confronto con ${euro(
        input.esposizione
      )} non si fa.${notaAlias}`,
      segnala: false,
    };
  }

  if (input.inBilancio <= 0) {
    return {
      stato: 'NON_CONTABILIZZATO',
      esposizione: input.esposizione,
      inBilancio: 0,
      alias,
      testo: `Il debito di ${euro(
        input.esposizione
      )} accertato in amministrativa non trova riscontro in bilancio: ${
        input.voci ?? 'le voci verso i creditori pubblici'
      } ${input.inBilancio === 0 ? 'sono a zero' : 'non coprono la posta'}. Il debito risulta non contabilizzato.${notaAlias}`,
      segnala: true,
    };
  }

  const coperto = input.inBilancio >= input.esposizione;
  return {
    stato: 'CONTABILIZZATO',
    esposizione: input.esposizione,
    inBilancio: input.inBilancio,
    alias,
    testo: coperto
      ? `Il debito di ${euro(input.esposizione)} trova riscontro in bilancio (${
          input.voci ?? 'voci verso i creditori pubblici'
        }: ${euro(input.inBilancio)}).${notaAlias}`
      : `In bilancio risultano ${euro(input.inBilancio)} contro i ${euro(
          input.esposizione
        )} accertati: il debito è contabilizzato solo in parte.${notaAlias}`,
    segnala: !coperto,
  };
}
