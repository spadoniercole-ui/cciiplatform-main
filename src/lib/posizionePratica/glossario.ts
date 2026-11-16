// IL GLOSSARIO DEGLI ESITI, IN UN POSTO SOLO (0.242.0).
//
// La catena ha moltiplicato i vocabolari: ROSSO / GIALLO / ATTENZIONE_MINIMA
// nell'indicatore, sistemica / da approfondire / squilibrio nella check list,
// «sfavorevole» nella lettura dei due terzi, accordo / liquidazione / cram down
// negli scenari. Ognuno è corretto nel suo contesto, ma nessuno dice, in un
// punto solo, che cosa NON significa — e il fraintendimento più costoso è
// sempre quello di chi legge un colore come un giudizio.
//
// Qui c'è la legenda, e c'è l'elenco delle etichette registrate: un test di
// contratto verifica che i moduli non ne inventino una nuova senza scriverla.
// L'elenco non è un vincolo tecnico sul testo delle pagine: è la promessa che
// ogni parola mostrata ha una spiegazione raggiungibile.

export interface VoceGlossario {
  etichetta: string;
  /** Dove compare: serve a chi legge la pagina per riconoscerla. */
  dove: string[];
  significa: string;
  /** Ciò che NON è: la parte che evita l'errore. */
  nonSignifica: string;
}

export const GLOSSARIO: VoceGlossario[] = [
  {
    etichetta: 'ROSSO',
    dove: ['Indicatore di attenzione'],
    significa:
      'Una soglia dell’art. 25-novies risulta superata, oppure il patrimonio netto è negativo, oppure i dati non bastano a circoscrivere il perimetro (e allora la documentazione va chiesta).',
    nonSignifica:
      'Non è una probabilità di insolvenza e non è una conclusione giuridica: è la priorità con cui guardare la posizione.',
  },
  {
    etichetta: 'GIALLO',
    dove: ['Indicatore di attenzione'],
    significa:
      'Nessuna soglia superata, ma almeno una dimensione (indici diagnostici, quadro qualitativo) porta un elemento da leggere.',
    nonSignifica: 'Non è «quasi rosso» e non dice quanto manca alla soglia.',
  },
  {
    etichetta: 'ATTENZIONE_MINIMA',
    dove: ['Indicatore di attenzione'],
    significa: 'Nessuna criticità rilevata con i dati disponibili, alla data della verifica.',
    nonSignifica:
      'Non è un’attestazione di salute dell’azienda: è l’assenza di criticità fra quelle che i dati permettono di vedere.',
  },
  {
    etichetta: 'Sistemica',
    dove: ['Check list dei prodotti'],
    significa: 'Tutte le risposte chiuse sono state lette come positive.',
    nonSignifica: 'Non è un giudizio sull’azienda: è il quadro delle risposte date.',
  },
  {
    etichetta: 'Da approfondire',
    dove: ['Check list dei prodotti'],
    significa:
      'Le risposte sono miste e nessuna delle due letture supera i due terzi: il quadro non prende posizione.',
    nonSignifica: 'Non è un esito intermedio fra positivo e negativo, e non è una media.',
  },
  {
    etichetta: 'Squilibrio',
    dove: ['Check list dei prodotti'],
    significa:
      'Le risposte chiuse sono tutte negative, oppure oltre i due terzi lo sono: l’orientamento è sfavorevole.',
    nonSignifica:
      'Non è un accertamento: è un orientamento sommario, e non produce da solo l’allarme massimo dell’indicatore.',
  },
  {
    etichetta: 'Orientamento sfavorevole',
    dove: ['Check list dei prodotti', 'Verifica amministrativa'],
    significa: 'Oltre i due terzi delle risposte chiuse sono state lette come negative.',
    nonSignifica:
      'Non è un esito giuridico né una decisione: dice in che direzione va il quadro dichiarativo, con i numeri accanto.',
  },
  {
    etichetta: 'Accordo',
    dove: ['Verifica azienda'],
    significa:
      'La capacità di risposta dell’azienda: la cassa che ha alla data più il flusso dell’esercizio, a fronte del credito vantato.',
    nonSignifica:
      'Non misura un recupero e non è una proposta: dice se, con quello che ha, l’azienda può rispondere del debito.',
  },
  {
    etichetta: 'Liquidazione',
    dove: ['Verifica azienda'],
    significa:
      'Credito vantato × tasso di realizzo del rango, meno le spese di procedura: quanto resterebbe all’ente.',
    nonSignifica:
      'Non è una previsione dell’esito del concorso: è aritmetica su una percentuale fissata dall’ente.',
  },
  {
    etichetta: 'Cram down',
    dove: ['Verifica azienda'],
    significa:
      'Credito vantato × percentuale di soddisfacimento del rango, senza costi di procedura.',
    nonSignifica:
      'Non è la conferma che il tribunale omologherà: è il conto con la percentuale del rango.',
  },
  {
    etichetta: 'Non calcolabile',
    dove: ['Verifica azienda', 'Verifica amministrativa'],
    significa: 'Manca il dato che serve al calcolo, e la pagina dice quale.',
    nonSignifica: 'Non è zero e non è «nessun problema»: è un’assenza dichiarata.',
  },
  {
    etichetta: 'Da ricalcolare',
    dove: ['Posizione'],
    significa: 'Dopo la verifica è arrivato un dato più recente (bilancio, debito, visura).',
    nonSignifica: 'Non vuol dire che i numeri siano sbagliati: vuol dire che non sono aggiornati.',
  },
  {
    etichetta: 'Divergente',
    dove: ['Posizione'],
    significa: 'Due fonti che devono dire la stessa cifra del credito non la dicono.',
    nonSignifica:
      'Non è un errore da correggere in automatico: è una scelta da fare, e va fatta prima degli scenari.',
  },
];

export const ETICHETTE_REGISTRATE = GLOSSARIO.map((v) => v.etichetta);

/** Cerca una voce per etichetta, senza distinguere maiuscole e minuscole. */
export function voceGlossario(etichetta: string): VoceGlossario | null {
  const cercata = etichetta.trim().toLowerCase();
  return GLOSSARIO.find((v) => v.etichetta.toLowerCase() === cercata) ?? null;
}

/** Le voci che riguardano una certa superficie della catena. */
export function glossarioDi(dove: string): VoceGlossario[] {
  return GLOSSARIO.filter((v) => v.dove.some((d) => d.toLowerCase() === dove.toLowerCase()));
}
