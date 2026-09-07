// src/lib/simulazione/raccomandazioniRedigente.ts
//
// Raccomandazioni azionabili per la Simulazione Redigente. Il motore
// calcolaRedigente dice SE il piano regge (DSCR ≥ 1); qui si dice COSA
// muovere per farlo reggere quando non regge — leva per leva, ciascuna
// isolata (tenendo ferme le altre), con il valore-obiettivo da
// raggiungere. Calcolo deterministico dalle stesse formule di
// calcoloRedigente.ts: nessuna stima "morbida", solo l'inversione delle
// equazioni.
//
// Sostenibilità: flussoDisponibile ≥ rataAnnua (cioè DSCR ≥ 1).
// Chiamiamo "gap" lo scoperto rataAnnua − flussoDisponibile.

import type { InputRedigente, RisultatoRedigente } from './calcoloRedigente';

export type LevaRaccomandazione =
  | 'DILAZIONE'
  | 'ENTITA_DEBITO'
  | 'GIORNI_INCASSO'
  | 'GIORNI_PAGAMENTO'
  | 'COSTI'
  | 'DATI_INCOMPLETI';

export interface RaccomandazioneRedigente {
  leva: LevaRaccomandazione;
  titolo: string;
  valoreAttuale: string;
  /** Valore-obiettivo per riportare DSCR a 1 muovendo SOLO questa leva; null se la leva da sola non basta. */
  valoreObiettivo: string | null;
  /** true se muovendo solo questa leva si raggiunge DSCR ≥ 1. */
  realizzabileDaSola: boolean;
  descrizione: string;
}

export interface EsitoRaccomandazioni {
  viabile: boolean;
  dscr: number | null;
  /** rataAnnua − flussoDisponibile: positivo = scoperto da colmare. */
  gapFlusso: number;
  raccomandazioni: RaccomandazioneRedigente[];
}

const euro = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;
const giorni = (n: number) => `${Math.max(0, Math.round(n))} giorni`;
const mesi = (n: number) => `${Math.max(0, Math.round(n))} mesi`;

export function calcolaRaccomandazioniRedigente(
  input: InputRedigente,
  risultato: RisultatoRedigente
): EsitoRaccomandazioni {
  const flusso = risultato.flussoDisponibile;
  const rata = risultato.rataAnnua;
  const gap = rata - flusso;

  // Già sostenibile: nessuna correzione necessaria.
  if (risultato.viabile) {
    return { viabile: true, dscr: risultato.dscr, gapFlusso: gap, raccomandazioni: [] };
  }

  // Dati insufficienti per un giudizio di rata: senza debito oggetto di
  // proposta o senza numero di rate non esiste una rata da coprire — il
  // problema non è di sostenibilità ma di dati mancanti.
  if (input.totaleDebitiProposta <= 0 || input.numeroRateMedie <= 0 || rata <= 0) {
    return {
      viabile: false,
      dscr: risultato.dscr,
      gapFlusso: gap,
      raccomandazioni: [
        {
          leva: 'DATI_INCOMPLETI',
          titolo: 'Completa i dati della proposta',
          valoreAttuale: `debito oggetto di proposta ${euro(input.totaleDebitiProposta)}, ${mesi(input.numeroRateMedie)} di dilazione`,
          valoreObiettivo: null,
          realizzabileDaSola: false,
          descrizione:
            'Il DSCR non è calcolabile finché non ci sono un debito oggetto di proposta e un numero di rate: inserisci la proposta ai creditori e la dilazione media prima di leggere la sostenibilità.',
        },
      ],
    };
  }

  const raccomandazioni: RaccomandazioneRedigente[] = [];
  const t = (input.aliquotaImposteSulReddito + input.aliquotaIrap) / 100;
  const ricaviGiornalieri = input.valoreProduzione / 365;
  const costiGiornalieriFornitori = input.costiProduzioneAltri / 365;
  const costiOperativi = risultato.costiProduzioneTotali;

  // 1) Dilazione: rataAnnua = totaleDebitiProposta / numeroRateMedie * 12.
  //    Serve rataAnnua ≤ flusso → numeroRateMedie ≥ debito*12/flusso.
  //    Ha senso solo se il flusso è positivo: con flusso ≤ 0 nessuna
  //    dilazione porta il DSCR a 1 (il flusso resta insufficiente).
  if (flusso > 0) {
    const mesiNecessari = Math.ceil((input.totaleDebitiProposta * 12) / flusso);
    raccomandazioni.push({
      leva: 'DILAZIONE',
      titolo: 'Allunga la dilazione (numero di rate)',
      valoreAttuale: mesi(input.numeroRateMedie),
      valoreObiettivo: mesi(mesiNecessari),
      realizzabileDaSola: true,
      descrizione: `Portando la dilazione media da ${mesi(input.numeroRateMedie)} ad almeno ${mesi(mesiNecessari)}, la rata annua scende entro il flusso disponibile (DSCR ≥ 1).`,
    });
  } else {
    raccomandazioni.push({
      leva: 'DILAZIONE',
      titolo: 'Allunga la dilazione (numero di rate)',
      valoreAttuale: mesi(input.numeroRateMedie),
      valoreObiettivo: null,
      realizzabileDaSola: false,
      descrizione:
        'Con il flusso disponibile a regime pari o inferiore a zero, allungare la dilazione da sola non basta: prima va reso positivo il flusso (costi o capitale circolante).',
    });
  }

  // 2) Entità del debito oggetto di proposta (più stralcio / offerta più
  //    bassa): debito sostenibile = flusso * rate / 12.
  if (flusso > 0) {
    const debitoSostenibile = (flusso * input.numeroRateMedie) / 12;
    raccomandazioni.push({
      leva: 'ENTITA_DEBITO',
      titolo: 'Riduci il debito oggetto di proposta',
      valoreAttuale: euro(input.totaleDebitiProposta),
      valoreObiettivo: euro(debitoSostenibile),
      realizzabileDaSola: true,
      descrizione: `Con la dilazione attuale, il debito servibile è ${euro(debitoSostenibile)}: portare la proposta a non più di questo importo (maggiore stralcio o offerta più bassa) riallinea la rata al flusso.`,
    });
  }

  // Le leve che aumentano il flusso disponibile devono colmare il gap.
  // Per costi e giorni si punta a flusso = rataAnnua (DSCR = 1).
  // 3) Giorni medi di incasso clienti: ridurli aumenta il flusso di
  //    ricaviGiornalieri per ogni giorno.
  if (ricaviGiornalieri > 0) {
    const giorniDaRidurre = gap / ricaviGiornalieri;
    const target = input.giorniMediIncassoClienti - giorniDaRidurre;
    const realizzabile = target >= 0;
    raccomandazioni.push({
      leva: 'GIORNI_INCASSO',
      titolo: 'Riduci i giorni medi di incasso dai clienti',
      valoreAttuale: giorni(input.giorniMediIncassoClienti),
      valoreObiettivo: realizzabile ? giorni(target) : null,
      realizzabileDaSola: realizzabile,
      descrizione: realizzabile
        ? `Incassando in media entro ${giorni(target)} (oggi ${giorni(input.giorniMediIncassoClienti)}) si libera capitale circolante sufficiente a coprire la rata.`
        : `Anche azzerando i giorni di incasso il capitale circolante liberato non basta da solo a colmare lo scoperto di ${euro(gap)}: va combinata con altre leve.`,
    });
  }

  // 4) Giorni medi di pagamento ai fornitori: allungarli aumenta il
  //    flusso di costiGiornalieriFornitori per ogni giorno.
  if (costiGiornalieriFornitori > 0) {
    const giorniDaAggiungere = gap / costiGiornalieriFornitori;
    const target = input.giorniMediPagamentoFornitori + giorniDaAggiungere;
    raccomandazioni.push({
      leva: 'GIORNI_PAGAMENTO',
      titolo: 'Allunga i giorni medi di pagamento ai fornitori',
      valoreAttuale: giorni(input.giorniMediPagamentoFornitori),
      valoreObiettivo: giorni(target),
      realizzabileDaSola: true,
      descrizione: `Portando i tempi medi di pagamento a ${giorni(target)} (oggi ${giorni(input.giorniMediPagamentoFornitori)}) si trattiene capitale circolante a copertura della rata — compatibilmente con la tenuta dei rapporti di fornitura.`,
    });
  }

  // 5) Costi operativi: ridurli aumenta l'EBIT (e l'EBITDA). Al netto
  //    dell'effetto fiscale, per aumentare il flusso di `gap` serve una
  //    riduzione di gap/(1−t) (con EBIT che resta positivo dopo il taglio).
  if (t < 1) {
    const riduzioneNecessaria = gap / (1 - t);
    const realizzabile = riduzioneNecessaria <= costiOperativi;
    const costiTarget = costiOperativi - riduzioneNecessaria;
    raccomandazioni.push({
      leva: 'COSTI',
      titolo: 'Riduci i costi operativi (personale e altri costi)',
      valoreAttuale: euro(costiOperativi),
      valoreObiettivo: realizzabile ? euro(costiTarget) : null,
      realizzabileDaSola: realizzabile,
      descrizione: realizzabile
        ? `Una riduzione dei costi operativi di circa ${euro(riduzioneNecessaria)} (dai ${euro(costiOperativi)} attuali a ${euro(costiTarget)}) porta il flusso a coprire la rata, al netto dell'effetto fiscale.`
        : `Servirebbe tagliare ${euro(riduzioneNecessaria)} di costi, più dei ${euro(costiOperativi)} complessivi: la sola leva dei costi non basta, va combinata con dilazione e capitale circolante.`,
    });
  }

  return { viabile: false, dscr: risultato.dscr, gapFlusso: gap, raccomandazioni };
}
