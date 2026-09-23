// src/lib/plausibilita/partita.ts
//
// CONTROLLI DI PLAUSIBILITA' SULL'IMPUTAZIONE MANUALE di una partita
// (richiesta di Ercole): il 5.000 per 500, il 123.000 per 12.300, la data del
// 2062, il versato piu' grande del dovuto. Non bloccano: producono avvisi che
// compaiono nel passaggio di conferma, prima di scrivere nel database. Chi
// conferma ha visto; chi torna indietro corregge. Logica pura.

export interface PartitaDaControllare {
  voce: string;
  importo: number;
  importoVersato: number | null;
  data: string | null;
  codice: string | null;
}

export interface PartitaEsistente {
  importo: number;
  codice: string | null;
  voce: string;
  data: string | null;
}

export interface AvvisoPlausibilita {
  campo: 'importo' | 'importoVersato' | 'data' | 'codice' | 'voce';
  testo: string;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function controllaPartita(
  p: PartitaDaControllare,
  esistenti: PartitaEsistente[],
  codiciNoti: string[] | null,
  oggi: string
): AvvisoPlausibilita[] {
  const avvisi: AvvisoPlausibilita[] = [];

  if (!(p.importo > 0)) avvisi.push({ campo: 'importo', testo: 'Importo pari a zero o negativo.' });
  if (p.importo >= 10_000_000)
    avvisi.push({
      campo: 'importo',
      testo: 'Importo di dieci milioni o più: verificare le cifre.',
    });
  if (p.importoVersato !== null && p.importoVersato > p.importo)
    avvisi.push({ campo: 'importoVersato', testo: 'Il versato supera l’importo dovuto.' });

  // Ordine di grandezza contro le altre partite con lo stesso codice (o, senza
  // codice, contro tutte): un valore dieci volte piu' grande o piu' piccolo
  // della mediana e' spesso uno zero in piu' o in meno.
  const confronto = esistenti.filter(
    (e) => e.importo > 0 && (p.codice ? e.codice === p.codice : true)
  );
  if (confronto.length >= 2 && p.importo > 0) {
    const m = mediana(confronto.map((e) => e.importo));
    const rapporto = p.importo / m;
    if (rapporto >= 10 || rapporto <= 0.1) {
      avvisi.push({
        campo: 'importo',
        testo: `Importo ${rapporto >= 10 ? 'circa ' + Math.round(rapporto) + ' volte più grande' : 'circa ' + Math.round(1 / rapporto) + ' volte più piccolo'} delle altre partite${p.codice ? ` con codice ${p.codice}` : ''} (mediana € ${Math.round(m).toLocaleString('it-IT')}): uno zero in più o in meno?`,
      });
    }
  }

  if (p.data) {
    if (p.data > oggi) avvisi.push({ campo: 'data', testo: 'Data futura.' });
    const anno = Number(p.data.slice(0, 4));
    if (anno < 2000)
      avvisi.push({ campo: 'data', testo: `Anno ${anno}: molto lontano nel tempo.` });
    const anniIndietro = Number(oggi.slice(0, 4)) - anno;
    if (anniIndietro > 10 && anno >= 2000)
      avvisi.push({
        campo: 'data',
        testo: `Partita di ${anniIndietro} anni fa: verificare la data.`,
      });
  }

  if (codiciNoti && p.codice && !codiciNoti.includes(p.codice))
    avvisi.push({
      campo: 'codice',
      testo: `Codice ${p.codice} non presente nell’anagrafica dei codici dell’ente.`,
    });
  if (!p.codice)
    avvisi.push({
      campo: 'codice',
      testo: 'Nessun codice di partita: la partita non avrà un titolo presunto.',
    });

  const doppione = esistenti.find(
    (e) =>
      e.voce.trim().toLowerCase() === p.voce.trim().toLowerCase() &&
      Math.abs(e.importo - p.importo) < 0.005 &&
      (e.data ?? null) === (p.data ?? null)
  );
  if (doppione)
    avvisi.push({
      campo: 'voce',
      testo: 'Esiste già una partita con la stessa voce, lo stesso importo e la stessa data.',
    });

  return avvisi;
}
