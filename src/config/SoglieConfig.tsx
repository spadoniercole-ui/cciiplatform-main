// Aggiunta dei parametri al DB / State di configurazione
export const SOGLIE_LIQUIDAZIONE_DEFAULT = [
  {
    articolo: 'Art. 2, co. 1, lett. d CCII',
    descrizione: 'Attivo patrimoniale annuo (media ultimi 3 esercizi)',
    sogliaAttiva: '300.000 €',
    chiave: 'attivo_patrimoniale_max',
  },
  {
    articolo: 'Art. 2, co. 1, lett. d CCII',
    descrizione: 'Ricavi netti delle vendite annui (media ultimi 3 esercizi)',
    sogliaAttiva: '2.000.000 €',
    chiave: 'ricavi_netti_max',
  },
  {
    articolo: 'Art. 2, co. 1, lett. d CCII',
    descrizione: 'Debiti totali anche non scaduti (soglia dimensionale)',
    sogliaAttiva: '500.000 €',
    chiave: 'debiti_totali_max',
  },
  {
    articolo: 'Art. 49, co. 5 CCII',
    descrizione: 'Ammontare minimo dei debiti scaduti e non pagati per procedibilità',
    sogliaAttiva: '30.000 €',
    chiave: 'debiti_scaduti_min',
  },
];
