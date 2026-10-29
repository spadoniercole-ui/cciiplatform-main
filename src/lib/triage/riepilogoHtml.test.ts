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
    });
    expect(h).toContain('Copia ricostruita dai dati salvati');
    // Le due date: quella dei conti e quella della ristampa.
    expect(h).toContain('Verifica riferita al <b>21/09/2026</b>');
    expect(h).toMatch(/ristampata il <b>\d{2}\/\d{2}\/2026/);
    // In testa, non in coda: prima della prima sezione numerata.
    expect(h.indexOf('Copia ricostruita')).toBeLessThan(h.indexOf('1. Indicazione del triage'));
    // Un triage appena eseguito non è una ricostruzione e non lo dichiara.
    expect(htmlRiepilogoTriage(base)).not.toContain('Copia ricostruita');
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
