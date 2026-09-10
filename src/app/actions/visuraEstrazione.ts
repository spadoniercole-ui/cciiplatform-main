'use server';

// Estrazione dell'anagrafica da una visura camerale, per la funzione
// "Verifica salute azienda".
//
// PERCHÉ ESISTE. Oggi il costo è invertito: bisogna codificare un'azienda —
// quindici campi obbligatori — PRIMA di sapere se valga la pena occuparsene.
// Per un ente che riceve molte posizioni e ne analizza poche è il contrario
// di come si lavora: il triage viene prima dell'istruttoria.
//
// Ma il problema vero non è che l'azienda venga registrata: è che
// registrarla costi quindici campi digitati a mano. La maggior parte di
// quei campi sta già nella visura. Estraendoli, ne restano due o tre da
// correggere, e la leggerezza si ottiene senza rinunciare né alla traccia né
// alla riproducibilità.
//
// CONFERMA UMANA OBBLIGATORIA. I campi estratti vengono PROPOSTI, non
// salvati: l'operatore li vede precompilati e conferma. Su un'anagrafica un
// errore silenzioso non resta lì — si trascina in tutto ciò che viene dopo,
// a partire dalla soglia AER che dipende dalla forma giuridica.
//
// Il PDF viene inviato al modello e NON conservato, come ogni documento
// caricato su questa piattaforma.

import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 120 * 1000, maxRetries: 1 }) : null;

export interface AnagraficaEstratta {
  ragioneSociale: string | null;
  formaGiuridica: string | null;
  codiceFiscale: string | null;
  partitaIva: string | null;
  codiceAteco: string | null;
  numeroRea: string | null;
  capitaleSociale: number | null;
  indirizzoSedeLegale: string | null;
  citta: string | null;
  provincia: string | null;
  cap: string | null;
  rappresentanteLegale: string | null;
  ruoloRappresentanteLegale: string | null;
  pec: string | null;
  annoCostituzione: number | null;
}

export interface RisultatoEstrazione {
  success: boolean;
  anagrafica?: AnagraficaEstratta;
  /** Campi che il modello non ha trovato: vanno compilati a mano. */
  nonTrovati?: string[];
  error?: string;
}

const VUOTA: AnagraficaEstratta = {
  ragioneSociale: null,
  formaGiuridica: null,
  codiceFiscale: null,
  partitaIva: null,
  codiceAteco: null,
  numeroRea: null,
  capitaleSociale: null,
  indirizzoSedeLegale: null,
  citta: null,
  provincia: null,
  cap: null,
  rappresentanteLegale: null,
  ruoloRappresentanteLegale: null,
  pec: null,
  annoCostituzione: null,
};

const ETICHETTE: Record<keyof AnagraficaEstratta, string> = {
  ragioneSociale: 'Ragione sociale',
  formaGiuridica: 'Forma giuridica',
  codiceFiscale: 'Codice fiscale',
  partitaIva: 'Partita IVA',
  codiceAteco: 'Codice ATECO',
  numeroRea: 'Numero REA',
  capitaleSociale: 'Capitale sociale',
  indirizzoSedeLegale: 'Indirizzo sede legale',
  citta: 'Città',
  provincia: 'Provincia',
  cap: 'CAP',
  rappresentanteLegale: 'Rappresentante legale',
  ruoloRappresentanteLegale: 'Ruolo del rappresentante',
  pec: 'PEC',
  annoCostituzione: 'Anno di costituzione',
};

/**
 * @param pdfBase64 la visura, in base64. Non viene conservata.
 */
export async function estraiAnagraficaDaVisuraAction(
  pdfBase64: string
): Promise<RisultatoEstrazione> {
  try {
    if (!anthropic) {
      return {
        success: false,
        error:
          'Estrazione non disponibile: la chiave API non è configurata sul server. I campi vanno compilati a mano.',
      };
    }
    if (!pdfBase64 || pdfBase64.length < 100) {
      return { success: false, error: 'File non leggibile.' };
    }

    const prompt = `Sei davanti a una visura camerale italiana (Registro Imprese).

Estrai ESATTAMENTE i dati anagrafici elencati sotto. Regole non negoziabili:
- riporta SOLO ciò che è scritto nel documento; se un dato non c'è, metti null;
- NON dedurre, NON completare, NON correggere: un'anagrafica sbagliata si trascina in tutto il resto dell'analisi;
- "annoCostituzione" è l'anno della data di costituzione (solo l'anno, come numero);
- "capitaleSociale" è un numero, senza simbolo di valuta e senza separatori di migliaia;
- "formaGiuridica" come compare in visura (es. "S.R.L.", "S.P.A.", "S.N.C.", "Ditta individuale");
- "provincia" è la sigla di due lettere;
- "ruoloRappresentanteLegale" è la carica (es. "Amministratore Unico", "Presidente del Consiglio di Amministrazione").

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{"ragioneSociale":null,"formaGiuridica":null,"codiceFiscale":null,"partitaIva":null,"codiceAteco":null,"numeroRea":null,"capitaleSociale":null,"indirizzoSedeLegale":null,"citta":null,"provincia":null,"cap":null,"rappresentanteLegale":null,"ruoloRappresentanteLegale":null,"pec":null,"annoCostituzione":null}`;

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      // Senza questo il ragionamento esteso consuma il budget prima di
      // produrre output, e il JSON arriva troncato.
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const raw = resp.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim();

    let letto: Record<string, unknown>;
    try {
      const i = raw.indexOf('{');
      const j = raw.lastIndexOf('}');
      letto = JSON.parse(raw.slice(i, j + 1));
    } catch {
      // Distinzione voluta: "non ho letto la risposta" è un errore tecnico,
      // diverso da "il dato non c'è nel documento", che è un esito legittimo.
      return {
        success: false,
        error:
          'Non è stato possibile interpretare la risposta dell’estrazione. I campi vanno compilati a mano.',
      };
    }

    const testo = (v: unknown): string | null => {
      const s = v === null || v === undefined ? '' : String(v).trim();
      return s === '' || s.toLowerCase() === 'null' ? null : s;
    };
    const numero = (v: unknown): number | null => {
      const s = testo(v);
      if (s === null) return null;
      const n = Number(
        s
          .replace(/[^\d.,-]/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      );
      return Number.isFinite(n) ? n : null;
    };

    const anagrafica: AnagraficaEstratta = {
      ...VUOTA,
      ragioneSociale: testo(letto.ragioneSociale),
      formaGiuridica: testo(letto.formaGiuridica),
      codiceFiscale: testo(letto.codiceFiscale),
      partitaIva: testo(letto.partitaIva),
      codiceAteco: testo(letto.codiceAteco),
      numeroRea: testo(letto.numeroRea),
      capitaleSociale: numero(letto.capitaleSociale),
      indirizzoSedeLegale: testo(letto.indirizzoSedeLegale),
      citta: testo(letto.citta),
      provincia: testo(letto.provincia),
      cap: testo(letto.cap),
      rappresentanteLegale: testo(letto.rappresentanteLegale),
      ruoloRappresentanteLegale: testo(letto.ruoloRappresentanteLegale),
      pec: testo(letto.pec),
      annoCostituzione: numero(letto.annoCostituzione),
    };

    const nonTrovati = (Object.keys(anagrafica) as (keyof AnagraficaEstratta)[])
      .filter((k) => anagrafica[k] === null)
      .map((k) => ETICHETTE[k]);

    return { success: true, anagrafica, nonTrovati };
  } catch (error: unknown) {
    console.error('[estraiAnagraficaDaVisuraAction] Errore:', error);
    return { success: false, error: `Estrazione non riuscita: ${(error as Error).message}` };
  }
}
