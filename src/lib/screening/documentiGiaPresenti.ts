// src/lib/screening/documentiGiaPresenti.ts
//
// Quando chiedere "vuoi aggiornare i documenti?" invece di chiederli.
//
// Sembra una condizione da una riga, e infatti nell'interfaccia lo era: una
// condizione dentro il JSX, che nessun test può raggiungere e che si verifica
// solo avendo un'azienda con i documenti giusti. Estrarla costa poco e la
// rende dimostrabile.
//
// LA REGOLA. Se per quell'azienda ci sono già dei documenti — la visura
// trattenuta dal triage, o dei bilanci XBRL — chiederli di nuovo è una
// richiesta che non ha senso: sono stati forniti poche schermate prima. Si
// chiede invece SE aggiornarli, e al "no" si genera con quello che c'è.
//
// Se non c'è nulla, la domanda non ha oggetto e si torna alla richiesta
// normale: chiedere "vuoi aggiornare?" a chi non ha caricato niente sarebbe
// peggio del problema che si voleva risolvere.

export type StatoRichiesta =
  /** Nulla di pregresso: si chiedono i documenti come sempre. */
  | 'chiedi_documenti'
  /** C'è del pregresso e l'operatore non si è ancora pronunciato. */
  | 'chiedi_se_aggiornare'
  /** Ha scelto di aggiornare: si mostrano i caricamenti. */
  | 'mostra_caricamenti'
  /** Ha scelto di procedere con quel che c'è: caricamenti nascosti. */
  | 'procedi_con_esistenti';

export function statoRichiestaDocumenti(
  visuraPresente: boolean,
  numeroXbrl: number,
  /** null = non ha ancora risposto. */
  vuoleAggiornare: boolean | null
): StatoRichiesta {
  const haPregresso = visuraPresente || numeroXbrl > 0;
  if (!haPregresso) return 'chiedi_documenti';
  if (vuoleAggiornare === null) return 'chiedi_se_aggiornare';
  return vuoleAggiornare ? 'mostra_caricamenti' : 'procedi_con_esistenti';
}
