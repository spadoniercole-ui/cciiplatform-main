// Costruzione della query di aggiornamento di una riga di
// `limiti_ricevibilita`. Separata dalla server action perché la
// corrispondenza fra segnaposto ($1…$8) e parametri si possa verificare in un
// test: un segnaposto sbagliato non dà errore, aggiorna la riga sbagliata (o
// nessuna) in silenzio.

export interface DatiAggiornamentoLimite {
  percentualeMinima: number;
  unicaSoluzioneAmmessa: boolean;
  rateizzazioneAmmessa: boolean;
  note: string | null;
  valoreLiquidazioneStimato?: number | null;
  alias?: string[];
  ente25Novies?: string | null;
}

export function queryAggiornaLimite(
  nomeSchema: string,
  id: number,
  dati: DatiAggiornamentoLimite
): { testo: string; parametri: unknown[] } {
  if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
    throw new Error('Nome schema non valido.');
  }
  // `ente_25novies` NULL = "non cambiare": COALESCE sul valore esistente.
  const testo = `UPDATE "${nomeSchema}".limiti_ricevibilita
       SET percentuale_minima = $1, unica_soluzione_ammessa = $2, rateizzazione_ammessa = $3, note = $4,
           valore_liquidazione_stimato = $5, alias = $6,
           ente_25novies = COALESCE($7, ente_25novies)
       WHERE id = $8`;
  const parametri: unknown[] = [
    dati.percentualeMinima,
    dati.unicaSoluzioneAmmessa,
    dati.rateizzazioneAmmessa,
    dati.note,
    dati.valoreLiquidazioneStimato ?? null,
    dati.alias ?? [],
    dati.ente25Novies ?? null,
    id,
  ];
  return { testo, parametri };
}
