'use server';

// Giudizio finale della Ricevente — combina due cose distinte che prima
// restavano separate: la ricevibilità numerica (confronto importo
// offerto vs soglia configurata, calcolo oggettivo) e la completezza
// documentale (asseverazione, piano di sviluppo — la loro assenza non
// è un fatto numerico, ma pesa comunque sul giudizio). File a parte
// apposta: propostaScenario.ts e simulazioneRicevente.ts si
// importano già a vicenda, mettere questa funzione in uno dei due
// creerebbe un ciclo.

import { verificaRicevibilitaProposta } from '@/app/actions/propostaScenario';
import { ottieniAnalisiRiceventeAction } from '@/app/actions/simulazioneRicevente';

export type LivelloGiudizioRicevente =
  | 'ricevibile'
  | 'ricevibile_con_riserva'
  | 'ricevibile_con_riserva_grave'
  | 'non_ricevibile'
  | 'non_disponibile';

export interface GiudizioFinaleRicevente {
  livello: LivelloGiudizioRicevente;
  etichetta: string;
  coloreEtichetta: 'verde' | 'giallo' | 'rosso' | 'grigio';
  motivazione: string;
  documentiMancanti: string[];
}

export interface RisultatoGiudizioFinaleRicevente {
  success: boolean;
  giudizio?: GiudizioFinaleRicevente;
  error?: string;
}

export async function calcolaGiudizioFinaleRicevente(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoGiudizioFinaleRicevente> {
  try {
    const [esitoRis, analisiRis] = await Promise.all([
      verificaRicevibilitaProposta(nomeSchema, scenarioId, 'ENTE'),
      ottieniAnalisiRiceventeAction(nomeSchema, scenarioId),
    ]);

    if (!esitoRis.success || !esitoRis.esito) {
      return {
        success: true,
        giudizio: {
          livello: 'non_disponibile',
          etichetta: 'Non ancora valutabile',
          coloreEtichetta: 'grigio',
          motivazione: 'Manca ancora la proposta, o la riga rilevante per questo ente.',
          documentiMancanti: [],
        },
      };
    }

    const documentiMancanti = analisiRis.success ? analisiRis.documentiMancanti || [] : [];

    // Nessuna estrazione ancora fatta è diverso da "estrazione fatta,
    // importo sotto soglia" — mostrare "Non ricevibile" con una
    // motivazione sulla soglia quando in realtà non c'è ancora nessun
    // dato sarebbe fuorviante, non solo impreciso.
    if (esitoRis.esito.datiDisponibili === false) {
      return {
        success: true,
        giudizio: {
          livello: 'non_disponibile',
          etichetta: 'Non ancora valutabile',
          coloreEtichetta: 'grigio',
          motivazione:
            esitoRis.esito.righe[0]?.motivazione ||
            'Carica e analizza la proposta di cram down per ottenere un giudizio.',
          documentiMancanti: [],
        },
      };
    }

    if (!esitoRis.esito.complessivamenteRicevibile) {
      return {
        success: true,
        giudizio: {
          livello: 'non_ricevibile',
          etichetta: 'Non ricevibile',
          coloreEtichetta: 'rosso',
          motivazione:
            "L'importo offerto non raggiunge la soglia configurata per questo ente — un fatto numerico, non modificabile dalla completezza documentale.",
          documentiMancanti,
        },
      };
    }

    if (documentiMancanti.length === 0) {
      return {
        success: true,
        giudizio: {
          livello: 'ricevibile',
          etichetta: 'Ricevibile',
          coloreEtichetta: 'verde',
          motivazione: 'Soglia numerica rispettata, documentazione di supporto completa.',
          documentiMancanti: [],
        },
      };
    }
    if (documentiMancanti.length === 1) {
      return {
        success: true,
        giudizio: {
          livello: 'ricevibile_con_riserva',
          etichetta: 'Ricevibile con riserva',
          coloreEtichetta: 'giallo',
          motivazione: `Soglia numerica rispettata, ma manca: ${documentiMancanti[0]}.`,
          documentiMancanti,
        },
      };
    }
    return {
      success: true,
      giudizio: {
        livello: 'ricevibile_con_riserva_grave',
        etichetta: 'Ricevibile con riserva grave',
        coloreEtichetta: 'rosso',
        motivazione: `Soglia numerica rispettata, ma mancano entrambi i documenti di supporto: ${documentiMancanti.join(', ')}.`,
        documentiMancanti,
      },
    };
  } catch (error: any) {
    console.error('[calcolaGiudizioFinaleRicevente] Errore:', error);
    return {
      success: false,
      error: `Impossibile calcolare il giudizio: ${error.message || error}`,
    };
  }
}
