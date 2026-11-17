// CHI È L'UTENTE DELLA SESSIONE, IN UNA RIGA (0.243.0).
//
// Il nome che firma una decisione e quello che apre una verifica vengono dalla
// stessa fonte: la sessione autenticata, mai un campo del browser. La regola
// stava dentro `posizionePratica/decisioni.ts`; le verifiche ne avevano bisogno
// senza dipendere dalla Posizione, quindi vive qui e là resta un richiamo.
//
// Nessun nome inventato: se la sessione non porta né username né email, il
// risultato è null e chi chiama rifiuta l'operazione.

export interface SessioneConNome {
  username: string | null;
  email: string | null;
}

export function nomeDaSessione(sessione: SessioneConNome | null | undefined): string | null {
  if (!sessione) return null;
  const nome = (sessione.username ?? sessione.email ?? '').trim();
  return nome.length > 0 ? nome : null;
}
