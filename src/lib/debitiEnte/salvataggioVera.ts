// Esito del salvataggio della certificazione dei debiti nel triage.
//
// La certificazione si legge, si mostra a schermo e poi si scrive in
// `debiti_vera`: se la scrittura non riesce, la posizione dell'azienda resta
// vuota mentre la schermata sembra completata, e il Piano-ponte legge 0 € su
// un'azienda esposta. I due messaggi stanno qui, non nel componente, perché
// entrambi devono dire la stessa cosa: quante righe sono rimaste fuori e che
// cosa non è più possibile fare.

export interface EsitoSalvataggioVera {
  errore: string;
  nota: string;
}

export function esitoSalvataggioVera(
  righe: number,
  errore: string | null | undefined
): EsitoSalvataggioVera {
  const motivo = errore?.trim() || 'il server non ha riportato il motivo.';
  const conto = righe === 1 ? '1 riga' : `${righe} righe`;
  return {
    errore: `Certificazione dei debiti letta (${conto}) ma NON salvata: ${motivo} La posizione dell’azienda resta quella di prima: il Piano-ponte non può usarla.`,
    nota: `La certificazione dei debiti non è stata salvata: ${conto} lette restano fuori dalla posizione dell’azienda.`,
  };
}
