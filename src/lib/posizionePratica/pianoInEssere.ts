// IL PIANO CHE L'AZIENDA STA GIÀ ESEGUENDO (0.242.0).
//
// Gli scenari guardano la cassa e il flusso; i flussi dell'ente sanno già se i
// versamenti arrivano, con quale ritardo e per quali periodi. Sono due letture
// dello stesso comportamento, e finora non si parlavano.
//
// Qui non si aggiunge uno scenario numerico — non ci sono importi da inventare:
// si aggiunge un'AVVERTENZA all'accordo. Se i flussi mostrano periodi senza
// denuncia o senza delega, o una matricola sospesa, la capacità di risposta va
// letta sapendo che il piano in essere non è rispettato; se tutto è in ordine,
// lo si dice e non si aggiunge nulla.
//
// Logica pura, con i suoi test.

export type StatoPiano = 'RISPETTATO' | 'IN_RITARDO' | 'SOSPESO' | 'NON_DISPONIBILE';

export interface PianoInEssere {
  stato: StatoPiano;
  dettaglio: string;
  /** L'avvertenza da mostrare accanto all'accordo; null quando non serve. */
  avvertenza: string | null;
}

export interface FlussoPerPiano {
  ente: string;
  flusso: string;
  attesi: number;
  senzaDenuncia: number;
  senzaDelega: number;
  /** Periodi in cui la matricola era sospesa: non sono ritardi. */
  sospesi: number;
  completo: boolean;
}

export function pianoInEssere(input: {
  esiti: FlussoPerPiano[];
  /** Sospensioni ancora aperte al momento della lettura. */
  sospensioniAttive?: number;
}): PianoInEssere {
  const esiti = input.esiti.filter((e) => e.attesi > 0 || e.senzaDenuncia + e.senzaDelega > 0);

  if (esiti.length === 0) {
    return {
      stato: 'NON_DISPONIBILE',
      dettaglio:
        'Nessun flusso dell’ente è configurato per questa azienda: non si può dire se il piano in essere è rispettato.',
      avvertenza: null,
    };
  }

  const senzaDenuncia = esiti.reduce((n, e) => n + e.senzaDenuncia, 0);
  const senzaDelega = esiti.reduce((n, e) => n + e.senzaDelega, 0);
  const attesi = esiti.reduce((n, e) => n + e.attesi, 0);
  const completi = esiti.filter((e) => e.completo).length;

  if (senzaDenuncia + senzaDelega > 0) {
    const pezzi: string[] = [];
    if (senzaDenuncia > 0)
      pezzi.push(
        `${senzaDenuncia} ${senzaDenuncia === 1 ? 'periodo senza denuncia' : 'periodi senza denuncia'}`
      );
    if (senzaDelega > 0)
      pezzi.push(
        `${senzaDelega} ${senzaDelega === 1 ? 'periodo senza delega' : 'periodi senza delega'}`
      );
    return {
      stato: 'IN_RITARDO',
      dettaglio: `Sui ${attesi} periodi attesi risultano ${pezzi.join(' e ')} (${completi}/${esiti.length} flussi completi).`,
      avvertenza:
        'Il piano in essere non risulta rispettato: la capacità di risposta dell’accordo va letta sapendo che i versamenti non sono regolari.',
    };
  }

  if ((input.sospensioniAttive ?? 0) > 0) {
    return {
      stato: 'SOSPESO',
      dettaglio: `${input.sospensioniAttive} ${input.sospensioniAttive === 1 ? 'sospensione aperta' : 'sospensioni aperte'} sulla matricola: i periodi sospesi non sono ritardi, ma il piano non è osservabile per intero.`,
      avvertenza:
        'La matricola risulta sospesa: i periodi esclusi non dimostrano né il rispetto né il mancato rispetto del piano.',
    };
  }

  return {
    stato: 'RISPETTATO',
    dettaglio: `Tutti i ${attesi} periodi attesi hanno denuncia e versamento (${completi}/${esiti.length} flussi completi).`,
    avvertenza: null,
  };
}
