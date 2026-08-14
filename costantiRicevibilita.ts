import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Tipizzazione dell'Input Payload
// ============================================================================

export interface CompanyData {
  ragioneSociale: string;
  codiceFiscale: string;
  indirizzoSedeLegale?: string;
  spazioCodice?: string;
  settoreAteco?: string;
}

export interface SituazioneDebitoria {
  totaleDebiti: number;
  debitiBanche: number;
  debitiFornitori: number;
  debitiTributari: number;
  debitiPrevidenziali: number;
  disponibilitaLiquide: number;
  pfn: number;
}

export interface IndiceAllerta {
  codice: string;
  nome: string;
  valore: number;
  soglia: number;
  operatore: '<' | '>';
  superato: boolean;
  unita?: string;
}

export interface AndamentoStoricoInput {
  direzioneSeverity: 'MIGLIORAMENTO' | 'STABILE' | 'PEGGIORAMENTO';
  segnalazioni: string[];
  numeroPeriodiConfrontati: number;
}

export interface ReportRequestBody {
  company: CompanyData;
  situazioneDebitoria: SituazioneDebitoria;
  indici?: IndiceAllerta[];
  /** Presente solo se sono disponibili più periodi salvati per questa azienda (tab "Andamento Storico"). */
  andamentoStorico?: AndamentoStoricoInput | null;
}

// Inizializzazione SDK
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export async function POST(req: NextRequest) {
  try {
    if (!anthropic) {
      return NextResponse.json(
        { error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' },
        { status: 500 }
      );
    }

    const body: ReportRequestBody = await req.json();
    const { company, situazioneDebitoria, indici = [], andamentoStorico = null } = body;

    // Validazione difensiva sui campi minimi richiesti
    if (!company?.ragioneSociale || !situazioneDebitoria) {
      return NextResponse.json(
        { error: 'Payload incompleto: ragione sociale e situazione debitoria sono obbligatorie.' },
        { status: 400 }
      );
    }

    // System Instruction per impostare il ruolo peritale e la disciplina output
    const sezioneStoricaObbligatoria = andamentoStorico
      ? `\n   6. ANALISI DELL'ANDAMENTO STORICO E TRAIETTORIA DEL RISCHIO (confronto tra i periodi disponibili, non solo fotografia dell'ultimo bilancio).`
      : '';

    const systemInstruction = `
Sei un Dottore Commercialista e Revisore Legale esperto in ristrutturazione aziendale, diagnosi della crisi d'impresa (CCII ex D.Lgs. 14/2019) e conformità alle Linee Guida CNDCEC.

REGOLE TASSATIVE DI REDAZIONE:
1. Analizza ESCLUSIVAMENTE i dati economico-finanziari forniti. Non inventare cifre né formulare ipotesi non corroborate dai numeri dell'input.
2. Mantieni un tono peritale, rigoroso, asciutto ed esecutivo (destinato all'Organo di Controllo o CdA).
3. Redigi la relazione in formato Markdown ben strutturato, puntando a una lunghezza di circa 800-1200 parole${andamentoStorico ? ' (1000-1400 se è presente la sezione di andamento storico)' : ''}.
4. Articola il documento OBBLIGATORIAMENTE nelle seguenti ${andamentoStorico ? '6' : '5'} sezioni contrassegnate da titolazioni in maiuscolo:
   1. SINTESI ESECUTIVA E ANAGRAFICA AZIENDALE
   2. ANALISI DELLA STRUTTURA PATRIMONIALE E DELLA POSIZIONE FINANZIARIA NETTA (PFN)
   3. VALUTAZIONE DETTAGLIATA DEGLI INDICI DI ALLERTA ART. 13 CCII (Anomalie e Punti di Forza)
   4. SCOMPOSIZIONE E CRITICITÀ DEL DEBITO (Esposizione bancaria, erariale e con fornitori)
   5. GIUDIZIO DI ADEGUATEZZA DELL'ASSETTO ORGANIZZATIVO (ART. 2086 C.C.) E RACCOMANDAZIONI OPERATIVE.${sezioneStoricaObbligatoria}
${andamentoStorico ? "5. Nella sezione sull'andamento storico, non limitarti a descrivere la direzione (miglioramento/peggioramento): collega esplicitamente le segnalazioni di trend fornite alle raccomandazioni operative della sezione 5." : ''}
`;

    // Costruzione del prompt dati
    const debitiTributariPrevidenziali =
      (situazioneDebitoria.debitiTributari || 0) + (situazioneDebitoria.debitiPrevidenziali || 0);

    const indiciFormatted =
      indici.length > 0
        ? JSON.stringify(indici, null, 2)
        : 'Nessun indice di settore specifico trasmesso. Effettuare la valutazione sulla base dei dati di bilancio, PFN e quadro debitorio forniti.';

    const userPrompt = `
DATI AZIENDALI:
- Ragione Sociale: ${company.ragioneSociale}
- Codice Fiscale: ${company.codiceFiscale || 'N/D'}
- Sede Legale: ${company.indirizzoSedeLegale || 'N/D'}
${company.settoreAteco ? `- Settore ATECO: ${company.settoreAteco}` : ''}

QUADRO DEBITORIO E LIQUIDITÀ:
- Totale Debiti: € ${situazioneDebitoria.totaleDebiti.toLocaleString('it-IT')}
- Debiti Banche: € ${situazioneDebitoria.debitiBanche.toLocaleString('it-IT')}
- Debiti Fornitori: € ${situazioneDebitoria.debitiFornitori.toLocaleString('it-IT')}
- Debiti Tributari e Previdenziali: € ${debitiTributariPrevidenziali.toLocaleString('it-IT')} (di cui Tributari: € ${(situazioneDebitoria.debitiTributari || 0).toLocaleString('it-IT')}, Previdenziali: € ${(situazioneDebitoria.debitiPrevidenziali || 0).toLocaleString('it-IT')})
- Disponibilità Liquide: € ${situazioneDebitoria.disponibilitaLiquide.toLocaleString('it-IT')}
- Posizione Finanziaria Netta (PFN): € ${situazioneDebitoria.pfn.toLocaleString('it-IT')}

INDICI DI ALLERTA CCII (CNDCEC):
${indiciFormatted}
${
  andamentoStorico
    ? `
ANDAMENTO STORICO (confronto su ${andamentoStorico.numeroPeriodiConfrontati} periodi disponibili):
- Direzione complessiva del rischio rispetto al periodo precedente: ${andamentoStorico.direzioneSeverity}
- Segnalazioni puntuali rilevate dal confronto tra periodi:
${
  andamentoStorico.segnalazioni.length > 0
    ? andamentoStorico.segnalazioni.map((s) => `  - ${s}`).join('\n')
    : '  - Nessun peggioramento puntuale rilevato tra i periodi disponibili.'
}
`
    : ''
}
Elabora la relazione tecnico-diagnostica seguendo la struttura prescritta.
`;

    // Invocazione modello Claude (Anthropic)
    // Nota 1: Claude Sonnet 5 non accetta più `temperature`/`top_p`/`top_k` con un
    // valore diverso da quello di default: la coerenza del testo va guidata dalle
    // istruzioni nel system prompt, non da un parametro di campionamento.
    // Nota 2: il "ragionamento adattivo" di Sonnet 5 è attivo di default e
    // consuma parte dello stesso budget di max_tokens prima di scrivere la
    // risposta visibile — su un documento lungo può esaurirlo, troncando la
    // relazione a metà (successo esattamente questo). Per un compito di
    // scrittura strutturata da dati già forniti (non un problema da risolvere
    // passo-passo), il ragionamento esteso non serve: lo disattiviamo, così
    // tutto il budget va al testo effettivo della relazione.
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      system: systemInstruction,
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.warn(
        '[report-ai] Risposta troncata per limite max_tokens nonostante il thinking disattivato e un tetto di 8192.'
      );
    }

    const bloccoTesto = response.content.find(
      (blocco): blocco is Anthropic.TextBlock => blocco.type === 'text'
    );

    if (!bloccoTesto?.text) {
      throw new Error('Nessun testo restituito dal modello AI.');
    }

    return NextResponse.json({
      report: bloccoTesto.text,
      generatedAt: new Date().toISOString(),
      troncato: response.stop_reason === 'max_tokens',
    });
  } catch (err: any) {
    console.error('Errore API Report AI:', err);
    return NextResponse.json(
      { error: `Errore durante la generazione della relazione AI: ${err.message || err}` },
      { status: 500 }
    );
  }
}
