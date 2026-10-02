// src/lib/ritorno.ts
//
// Rientro al punto di partenza: chi apre una pagina di servizio (Posizione
// aggiornata, bilanci XBRL, Check List) dalla pagina unica dello scenario
// torna lì, all'altezza da cui era partito, senza ripassare dalla sidebar.
// Solo destinazioni note, costruite qui: mai un URL arbitrario dal browser.

export interface Ritorno {
  url: string;
  /** «dalla …» */
  da: string;
  /** Testo del pulsante. */
  pulsante: string;
}

export function destinazioneRitorno(
  codice: string,
  scenarioId: string | number,
  ritorno: string | undefined | null
): Ritorno | null {
  const base = `/spazio/${codice}/scenari/${scenarioId}/proposta`;
  if (ritorno === 'valutazione')
    return {
      url: `${base}#valutazione`,
      da: 'valutazione della proposta',
      pulsante: 'Torna alla valutazione',
    };
  if (ritorno === 'lavorazione')
    return {
      url: `${base}#stato`,
      da: 'lavorazione della proposta',
      pulsante: 'Torna alla lavorazione',
    };
  return null;
}
