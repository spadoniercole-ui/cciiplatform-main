// src/lib/segnaliArt3/segnali.ts
//
// I SEGNALI DELL'ART. 3, COMMA 4 — l'altra metà dell'allerta.
//
// L'art. 25-novies riguarda ciò che un ente creditore DEVE segnalare. L'art. 3,
// comma 4 riguarda ciò che l'imprenditore deve SAPER VEDERE: retribuzioni,
// fornitori, banche e, per ultimo, le stesse esposizioni dell'art. 25-novies.
// Sono due piani diversi e la piattaforma finora copriva solo il primo.
//
// PERCHÉ QUESTO MODULO ESISTE. Le tre lettere a), b) e c) si misurano su dati
// che la piattaforma non acquisisce (libro paga, scadenzario fornitori,
// centrale dei rischi). Scriverle come «non applicabili» sarebbe falso: non
// sono fuori perimetro, sono non misurate. Il modulo restituisce per ciascuna
// un esito esplicito e la FONTE che serve, così l'assenza del dato è visibile
// e non si confonde con un esito favorevole. Quando il dato arriverà, il
// confronto è già qui, con i versi della legge.
//
// TESTO DI RIFERIMENTO (Brocardi, aggiornato al 12/08/2026; comma 4 modificato
// dall'art. 2, comma 1 del D.Lgs. 136/2024):
//  a) debiti per retribuzioni scaduti da almeno 30 giorni pari a oltre la metà
//     dell'ammontare complessivo mensile delle retribuzioni;
//  b) debiti verso fornitori scaduti da almeno 90 giorni di ammontare
//     superiore a quello dei debiti non scaduti;
//  c) esposizioni verso banche e intermediari scadute da più di 60 giorni o
//     che abbiano superato da almeno 60 giorni il limite degli affidamenti,
//     purché rappresentino complessivamente almeno il 5% del totale delle
//     esposizioni;
//  d) una o più delle esposizioni dell'art. 25-novies, comma 1.
//
// ATTENZIONE AI VERSI. «Oltre la metà» è `>`, non `>=`: esattamente metà non è
// un segnale. «Superiore» è `>`, «almeno il cinque per cento» è `>=`. Sono le
// differenze che un arrotondamento ben intenzionato cancella.

export type EsitoSegnaleArt3 = 'segnale' | 'sotto' | 'non_determinabile';

export interface DatiSegnaliArt3 {
  /** Debiti per retribuzioni scaduti da almeno 30 giorni. */
  retribuzioniScaduteOltre30?: number | null;
  /** Ammontare complessivo mensile delle retribuzioni (il denominatore). */
  retribuzioniMensiliTotali?: number | null;
  /** Debiti verso fornitori scaduti da almeno 90 giorni. */
  fornitoriScadutiOltre90?: number | null;
  /** Debiti verso fornitori non ancora scaduti. */
  fornitoriNonScaduti?: number | null;
  /** Esposizioni bancarie scadute da più di 60 giorni. */
  bancheScaduteOltre60?: number | null;
  /** Esposizioni che hanno superato da almeno 60 giorni il limite degli affidamenti. */
  bancheOltreAffidamentoOltre60?: number | null;
  /** Totale delle esposizioni verso banche e intermediari. */
  bancheEsposizioniTotali?: number | null;
  /**
   * Quante esposizioni dell'art. 25-novies risultano oltre soglia. `null` se
   * il confronto non è stato eseguito (non se è pari a zero).
   */
  soglie25NoviesSuperate?: number | null;
}

export interface RigaSegnaleArt3 {
  lettera: 'a' | 'b' | 'c' | 'd';
  titolo: string;
  /** Il fatto descritto dalla norma, non il nome dell'indicatore. */
  testoLegge: string;
  esito: EsitoSegnaleArt3;
  /** Che cosa è stato confrontato, con i numeri. */
  confronto: string;
  /** Il documento o il dato che manca, quando l'esito non è determinabile. */
  fonteNecessaria: string | null;
}

export interface EsitoSegnaliArt3 {
  righe: RigaSegnaleArt3[];
  segnali: number;
  sotto: number;
  nonDeterminabili: number;
  /** Frase unica per l'intestazione, che non conclude più di quanto sappia. */
  sintesi: string;
}

const noto = (n: number | null | undefined): n is number =>
  n !== null && n !== undefined && Number.isFinite(n);

const euro = (n: number): string => `${Math.round(n).toLocaleString('it-IT')} €`;

/**
 * Valuta i quattro segnali. Funzione PURA: nessun database, nessuna AI.
 *
 * Non lancia e non inventa zeri: un dato assente resta assente e rende la
 * riga «non determinabile», con la fonte che servirebbe.
 */
export function valutaSegnaliArt3(dati: DatiSegnaliArt3): EsitoSegnaliArt3 {
  const righe: RigaSegnaleArt3[] = [];

  // ---- a) retribuzioni ------------------------------------------------
  {
    const scadute = dati.retribuzioniScaduteOltre30;
    const mensili = dati.retribuzioniMensiliTotali;
    if (!noto(scadute) || !noto(mensili) || mensili <= 0) {
      righe.push({
        lettera: 'a',
        titolo: 'Retribuzioni scadute',
        testoLegge:
          'Debiti per retribuzioni scaduti da almeno 30 giorni pari a oltre la metà dell’ammontare complessivo mensile delle retribuzioni.',
        esito: 'non_determinabile',
        confronto: noto(scadute)
          ? `Retribuzioni scadute dichiarate: ${euro(scadute)}; manca il totale mensile delle retribuzioni, quindi la metà non è calcolabile.`
          : 'Né le retribuzioni scadute né il totale mensile sono disponibili.',
        fonteNecessaria:
          'Libro paga o estratto del cedolino del mese di riferimento, con le competenze lorde e le scadenze di pagamento: la piattaforma non li acquisisce.',
      });
    } else {
      const meta = mensili / 2;
      const oltre = scadute > meta;
      righe.push({
        lettera: 'a',
        titolo: 'Retribuzioni scadute',
        testoLegge:
          'Debiti per retribuzioni scaduti da almeno 30 giorni pari a oltre la metà dell’ammontare complessivo mensile delle retribuzioni.',
        esito: oltre ? 'segnale' : 'sotto',
        confronto: `${euro(scadute)} scaduti da almeno 30 giorni su ${euro(mensili)} di retribuzioni mensili: metà = ${euro(meta)}, ${oltre ? 'superata' : 'non superata'}.`,
        fonteNecessaria: null,
      });
    }
  }

  // ---- b) fornitori ---------------------------------------------------
  {
    const scaduti = dati.fornitoriScadutiOltre90;
    const nonScaduti = dati.fornitoriNonScaduti;
    if (!noto(scaduti) || !noto(nonScaduti)) {
      righe.push({
        lettera: 'b',
        titolo: 'Debiti verso fornitori',
        testoLegge:
          'Debiti verso fornitori scaduti da almeno 90 giorni di ammontare superiore a quello dei debiti non scaduti.',
        esito: 'non_determinabile',
        confronto: noto(scaduti)
          ? `Fornitori scaduti da almeno 90 giorni: ${euro(scaduti)}; manca il totale dei debiti non scaduti, quindi il confronto non è possibile.`
          : 'Né i debiti scaduti da almeno 90 giorni né quelli non scaduti sono disponibili.',
        fonteNecessaria:
          'Scadenzario fornitori (partitario aperto con scadenza e stato di pagamento): la piattaforma non lo acquisisce.',
      });
    } else {
      const oltre = scaduti > nonScaduti;
      righe.push({
        lettera: 'b',
        titolo: 'Debiti verso fornitori',
        testoLegge:
          'Debiti verso fornitori scaduti da almeno 90 giorni di ammontare superiore a quello dei debiti non scaduti.',
        esito: oltre ? 'segnale' : 'sotto',
        confronto: `${euro(scaduti)} scaduti da almeno 90 giorni contro ${euro(nonScaduti)} non scaduti: ${oltre ? 'i primi prevalgono' : 'i primi non prevalgono'}.`,
        fonteNecessaria: null,
      });
    }
  }

  // ---- c) banche e intermediari ---------------------------------------
  {
    const scadute = dati.bancheScaduteOltre60;
    const oltreAffidamento = dati.bancheOltreAffidamentoOltre60;
    const totali = dati.bancheEsposizioniTotali;
    // Il 5% si calcola sulle esposizioni «complessivamente» rilevanti: se una
    // delle due componenti manca, la quota sarebbe sottostimata e il segnale
    // potrebbe sparire. Meglio non determinabile che rassicurante.
    if (!noto(scadute) || !noto(oltreAffidamento) || !noto(totali) || totali <= 0) {
      righe.push({
        lettera: 'c',
        titolo: 'Esposizioni bancarie',
        testoLegge:
          'Esposizioni verso banche e altri intermediari scadute da più di 60 giorni, o che hanno superato da almeno 60 giorni il limite degli affidamenti, se rappresentano almeno il 5% del totale delle esposizioni.',
        esito: 'non_determinabile',
        confronto:
          'Servono tre importi — scaduto oltre 60 giorni, superamento dell’affidamento da almeno 60 giorni, totale delle esposizioni — per calcolare la quota del 5%.',
        fonteNecessaria:
          'Centrale dei rischi della Banca d’Italia o estratto conto affidamenti: la piattaforma non li acquisisce.',
      });
    } else {
      const rilevanti = scadute + oltreAffidamento;
      const quota = rilevanti / totali;
      const sopraSoglia = rilevanti > 0 && quota >= 0.05;
      righe.push({
        lettera: 'c',
        titolo: 'Esposizioni bancarie',
        testoLegge:
          'Esposizioni verso banche e altri intermediari scadute da più di 60 giorni, o che hanno superato da almeno 60 giorni il limite degli affidamenti, se rappresentano almeno il 5% del totale delle esposizioni.',
        esito: sopraSoglia ? 'segnale' : 'sotto',
        confronto: `${euro(rilevanti)} (${euro(scadute)} scaduti oltre 60 giorni + ${euro(oltreAffidamento)} oltre affidamento) su ${euro(totali)} di esposizioni totali = ${(quota * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%, soglia 5%: ${sopraSoglia ? 'raggiunta' : 'non raggiunta'}.`,
        fonteNecessaria: null,
      });
    }
  }

  // ---- d) rinvio all'art. 25-novies -----------------------------------
  {
    const superate = dati.soglie25NoviesSuperate;
    if (!noto(superate)) {
      righe.push({
        lettera: 'd',
        titolo: 'Esposizioni dell’art. 25-novies',
        testoLegge: 'Una o più delle esposizioni debitorie previste dall’art. 25-novies, comma 1.',
        esito: 'non_determinabile',
        confronto: 'Il confronto con le soglie dell’art. 25-novies non è stato eseguito.',
        fonteNecessaria:
          'Scheda «Soglie di segnalazione» compilata per questa azienda: le posizioni dei quattro enti creditori.',
      });
    } else {
      const presente = superate > 0;
      righe.push({
        lettera: 'd',
        titolo: 'Esposizioni dell’art. 25-novies',
        testoLegge: 'Una o più delle esposizioni debitorie previste dall’art. 25-novies, comma 1.',
        esito: presente ? 'segnale' : 'sotto',
        confronto:
          superate === 0
            ? 'Nessuna esposizione oltre le soglie dell’art. 25-novies fra quelle confrontate.'
            : `${superate} ${superate === 1 ? 'esposizione supera' : 'esposizioni superano'} le soglie dell’art. 25-novies.`,
        fonteNecessaria: null,
      });
    }
  }

  const segnali = righe.filter((r) => r.esito === 'segnale').length;
  const sotto = righe.filter((r) => r.esito === 'sotto').length;
  const nonDeterminabili = righe.filter((r) => r.esito === 'non_determinabile').length;

  const sintesi =
    segnali > 0
      ? `${segnali} ${segnali === 1 ? 'segnale presente' : 'segnali presenti'}${nonDeterminabili > 0 ? `, ${nonDeterminabili} non verificabili con i dati attuali` : ''}.`
      : nonDeterminabili > 0
        ? `Nessun segnale fra quelli verificabili; ${nonDeterminabili} ${nonDeterminabili === 1 ? 'segnale resta' : 'segnali restano'} non verificabili con i dati attuali.`
        : 'Nessuno dei quattro segnali risulta presente.';

  return { righe, segnali, sotto, nonDeterminabili, sintesi };
}
