import { describe, it, expect } from 'vitest';
import { dataRiverifica, htmlRiepilogoTriage } from './riepilogoHtml';

const base = {
  azienda: 'ARETUSEA <DETERGENTI> S.R.L.',
  codiceFiscale: '99999980891',
  partitaIva: '99999980891',
  sede: 'Siracusa',
  dataVerifica: '2026-09-21',
  perimetro: 'Perimetro di prova',
  documenti: [{ nome: 'DettaglioRichiesta.xlsx', tipo: 'Posizione V.E.R.A.', esito: 'Usato' }],
  note: ['Ritardo oltre 90 giorni: 7 periodi.'],
  valori: {
    conLavoratori: true,
    annoPrecedente: 2025,
    contributiDovutiAnnoPrecedente: 48599.97,
    nonVersatoOltre90: 16756.41,
    ritardoOltre90Giorni: true,
    periodiInRitardo: 7,
    denunceNonPresentate: '',
    creditiAffidatiAgente: null,
  },
  attenzione: null,
};

describe('riepilogo del triage', () => {
  it('riporta documenti, valori e data, con il testo escapato', () => {
    const h = htmlRiepilogoTriage(base);
    expect(h).toContain('ARETUSEA &lt;DETERGENTI&gt; S.R.L.');
    expect(h).toContain('21/09/2026');
    expect(h).toContain('DettaglioRichiesta.xlsx');
    expect(h).toContain('16.756,41 €');
    expect(h).toContain('sì — 7 periodi');
    expect(h).toMatch(/Denunce non presentate<\/td><td>nessuna/);
  });

  it('la ristampa dichiara in testa di essere una ricostruzione, con le due date', () => {
    const h = htmlRiepilogoTriage({
      ...base,
      documenti: [],
      documentiNota: 'In riapertura i file caricati non sono più disponibili.',
      ristampa: { ricostruitaIl: '2026-10-29T09:15:00.000Z' },
      documentiCaricatiIl: '2026-09-20',
    });
    expect(h).toContain('Copia ricostruita dai dati salvati');
    // La terza data: quando i prospetti sono stati letti.
    expect(h).toContain('caricati il <b>20/09/2026</b>');
    // Le due date: quella dei conti e quella della ristampa.
    expect(h).toContain('Verifica riferita al <b>21/09/2026</b>');
    expect(h).toMatch(/ristampata il <b>\d{2}\/\d{2}\/2026/);
    // In testa, non in coda: prima della prima sezione numerata.
    expect(h.indexOf('Copia ricostruita')).toBeLessThan(h.indexOf('1. Indicazione del triage'));
    // Un triage appena eseguito non è una ricostruzione e non lo dichiara.
    expect(htmlRiepilogoTriage(base)).not.toContain('Copia ricostruita');
    // Senza la data di caricamento la frase resta leggibile, senza un «il»
    // appeso al nulla.
    const senza = htmlRiepilogoTriage({
      ...base,
      documenti: [],
      ristampa: { ricostruitaIl: '2026-10-29T09:15:00.000Z' },
    });
    expect(senza).toContain('quelli letti dai documenti;');
  });

  it('distingue «non letto» da «nessuna mancante» e il ritardo non determinabile', () => {
    const h = htmlRiepilogoTriage({
      ...base,
      valori: { ...base.valori, denunceNonPresentate: null, ritardoOltre90Giorni: null },
    });
    expect(h).toContain('Elenco denunce non letto');
    expect(h).toContain('non determinabile con i documenti caricati');
  });
});

//
// IL PAPER DELLA VERIFICA, NON L'ISTRUZIONE DI LAVORO.
//
// Le comunicazioni dicono a un ufficio che cosa fare. Questo foglio dice che
// cosa è stato verificato ALLA DATA: le soglie con l'alert, le evidenze
// partite per i reparti, e il giorno in cui tornare a controllare se i reparti
// si sono attivati. Senza le tre cose insieme è un riassunto, non una
// certificazione.
describe('riepilogo: soglie, evidenze e riverifica', () => {
  it('porta le soglie con l’alert, le evidenze per ufficio e il giorno del controllo', () => {
    const h = htmlRiepilogoTriage({
      ...base,
      soglie: [
        {
          ambito: 'Segnalazione INPS — imprese CON lavoratori',
          valore: '> 30% dei contributi dovuti nell’anno precedente E > 15.000 €',
          esito: 'sopra',
          esposizione: 31_236.35,
        },
      ],
      alertSoglie: {
        titolo: 'Un parametro oltre la soglia di segnalazione',
        dettaglio: 'Requisito temporale integrato.',
      },
      uffici: [
        {
          dipendenza: 'VIGILANZA DOCUMENTALE',
          righe: 5,
          totale: 26_226.79,
          voci: ['Codice 27'],
        },
      ],
      prossimaVerifica: '2026-10-21',
    });
    expect(h).toContain('SUPERATA');
    expect(h).toContain('31.236,35 €');
    expect(h).toContain('Un parametro oltre la soglia');
    expect(h).toContain('VIGILANZA DOCUMENTALE');
    expect(h).toContain('Codice 27');
    expect(h).toContain('26.226,79 €');
    // Il totale delle evidenze è la somma dei fogli, dichiarata una volta.
    expect(h).toContain('Totale delle evidenze');
    expect(h).toContain('Entro il <b>21/10/2026</b>');
  });

  it('senza soglie né uffici il foglio resta quello di prima, senza sezioni vuote', () => {
    const h = htmlRiepilogoTriage(base);
    expect(h).not.toContain('Soglie di segnalazione (art. 25-novies) e alert');
    expect(h).not.toContain('Evidenze preparate per i reparti');

    // In riapertura i file non ci sono più: il foglio lo dichiara, invece di
    // dire che non è stato caricato nulla.
    const riaperta = htmlRiepilogoTriage({
      ...base,
      documenti: [],
      documentiNota: 'In riapertura i file caricati non sono più disponibili.',
    });
    expect(riaperta).toContain('In riapertura i file caricati non sono più disponibili.');
    expect(riaperta).not.toContain('Nessun documento caricato');
    // La riverifica c'è comunque: si conta dalla data della verifica.
    expect(h).toContain('Entro il <b>21/10/2026</b>');
  });

  it('la riverifica si conta dalla data della verifica, non da oggi', () => {
    expect(dataRiverifica('2026-10-29')).toBe('2026-11-28');
    expect(dataRiverifica('2026-10-29', 30)).toBe('2026-11-28');
    expect(dataRiverifica('2026-01-31', 30)).toBe('2026-03-02');
    expect(dataRiverifica('non una data')).toBeNull();
  });
});

//
// GLI AVVISI IN TESTA: SONO LA PARTE CHE RESTA.
//
// Il foglio si stampa e finisce in mano a un ufficio, dove non c'è nessuna
// videata che lampeggi. Due cose devono quindi stare scritte sul foglio:
// quando i numeri sono vecchi, e che un'esposizione sotto la soglia non è
// un'assenza di debito.
describe('riepilogo: avvisi in testa', () => {
  const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  it('oltre i trenta giorni dice che i numeri sono vecchi e quando la finestra si è chiusa', () => {
    const h = htmlRiepilogoTriage({ ...base, dataVerifica: giorniFa(200) });
    expect(h).toContain('sono trascorsi 200 giorni');
    expect(h).toContain('la finestra dei 30 giorni per il ricontrollo si è chiusa il');
    expect(h).toContain('ricontrolla i prospetti');
    // In testa, prima della prima sezione numerata: un avviso in coda arriva a
    // chi legge dopo che si è già fatto un'idea.
    expect(h.indexOf('sono trascorsi 200 giorni')).toBeLessThan(
      h.indexOf('1. Indicazione del triage')
    );
  });

  it('dentro la finestra non avvisa: un allarme qui sarebbe rumore', () => {
    const h = htmlRiepilogoTriage({ ...base, dataVerifica: giorniFa(5) });
    expect(h).not.toContain('sono trascorsi');
    expect(h).not.toContain('ricontrolla i prospetti');
  });

  it('l’esposizione sotto la soglia è dichiarata, senza farne un’assenza di debito', () => {
    const h = htmlRiepilogoTriage({
      ...base,
      soglie: [
        {
          ambito: 'Segnalazione INPS — imprese CON lavoratori',
          valore: '> 30% dei contributi dovuti nell’anno precedente E > 15.000 €',
          esito: 'sotto',
          esposizione: 16_756.41,
        },
      ],
    });
    expect(h).toContain('Esposizione di 16.756,41 €');
    expect(h).toContain('la soglia non risulta superata');
    expect(h).toContain('non l’assenza del debito');

    // Con una soglia SUPERATA la nota tace: l'alert dice già molto di più, e
    // ripetersi toglierebbe forza all'unica riga che conta.
    const sopra = htmlRiepilogoTriage({
      ...base,
      soglie: [
        {
          ambito: 'Segnalazione INPS — imprese CON lavoratori',
          valore: '> 15.000 €',
          esito: 'sopra',
          esposizione: 31_236.35,
        },
      ],
    });
    expect(sopra).not.toContain('la soglia non risulta superata');

    // Senza soglie confrontate non c'è nulla da dichiarare.
    expect(htmlRiepilogoTriage(base)).not.toContain('Esposizione di');
  });
});

//
// LA CHECK LIST ACCANTO AL PERIMETRO.
//
// Il foglio diceva l'esito del questionario senza le domande: chi lo riceve
// legge un punteggio e non può controllare su che cosa è stato costruito. Le
// risposte vanno stampate, e una domanda senza risposta resta senza risposta —
// non diventa un «no».
describe('riepilogo: check list con le risposte', () => {
  const checkList = {
    sezioni: [
      {
        numero: '1',
        titolo: 'Posizione contributiva',
        domande: [
          { id: '1.1', testo: 'La posizione è priva di versamenti scaduti?', risposta: false },
          { id: '1.2', testo: 'Le deleghe risultano attive?', risposta: true },
          { id: '1.3', testo: 'Il DURC <in corso> è regolare?', risposta: null },
        ],
      },
    ],
    totali: 3,
    risposte: 2,
    esito: { etichetta: 'Attenzione moderata', punteggio: -2.5 },
    generataIl: '2026-10-30T08:12:00.000Z',
  };

  it('stampa domande, risposte ed esito, con il testo escapato', () => {
    const h = htmlRiepilogoTriage({ ...base, checkList });
    expect(h).toContain('Check list dello screening: domande e risposte');
    expect(h).toContain('La posizione è priva di versamenti scaduti?');
    expect(h).toContain('<b>No</b>');
    expect(h).toContain('<b>Sì</b>');
    expect(h).toContain('2 risposte date su 3 domande');
    expect(h).toContain('Attenzione moderata');
    expect(h).toContain('punteggio -2.5');
    expect(h).toContain('Il DURC &lt;in corso&gt; è regolare?');
  });

  it('una domanda senza risposta non si legge come un «no»', () => {
    const h = htmlRiepilogoTriage({ ...base, checkList });
    expect(h).toContain('senza risposta');
    expect(h).toContain('non si legge come una risposta negativa');
  });

  it('senza questionario la sezione non compare', () => {
    const h = htmlRiepilogoTriage(base);
    expect(h).not.toContain('Check list dello screening');
  });
});
