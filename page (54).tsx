'use server';

// Chatbot guidato per l'ENTE — non l'assistente di cultura generale
// (quello è chatbotAiuto.ts), questo compila davvero i dati al posto
// dell'operatore, in conversazione, tramite tool-use verso le stesse
// azioni server già usate dai form liberi. Un passo alla volta: Anagrafica
// e Situazione Debitoria fatte, qui la Check List — Proposta e XBRL
// restano fuori per ora (moduli troppo articolati, o con un file da
// caricare, per una guida conversazionale).
//
// L'operatore può sempre scegliere il form libero invece della guida
// (vedi PosizioneEnteScenario, ChecklistScenario) — il chatbot è un
// percorso alternativo, non l'unico.

import Anthropic from '@anthropic-ai/sdk';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
import { ottieniAnagraficaEnte, salvaAnagraficaEnteAction } from '@/app/actions/anagraficaEnte';
import { aggiungiRigaDebitoEnteAction, ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { TIPI_DEBITO_ENTE, type TipoDebitoEnte } from '@/lib/debitiEnte/tipoDebito';
import { salvaRispostaChecklistAction } from '@/app/actions/checklist';
import type { SezioneChecklist } from '@/lib/checklist/ministeriale';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export interface MessaggioChatGuidato {
  ruolo: 'utente' | 'assistente';
  testo: string;
}

export interface RisultatoChatGuidato {
  success: boolean;
  risposta?: string;
  /** true se in questo giro il modello ha davvero salvato qualcosa — il chiamante ricarica i dati mostrati altrove nella pagina. */
  datiAggiornati?: boolean;
  error?: string;
}

const STRUMENTO_SALVA_ANAGRAFICA = {
  name: 'salva_anagrafica_ente',
  description:
    "Salva (o aggiorna) l'anagrafica dell'ente per questo scenario. Chiamalo solo quando hai raccolto almeno un'informazione chiara dall'utente — non aspettare di avere tutti i campi, si può completare in più passaggi. Passa solo i campi che l'utente ha effettivamente fornito in questo turno o nei precedenti; se un campo non è mai stato menzionato, omettilo (non sovrascrivere con un valore vuoto quello che già c'era).",
  input_schema: {
    type: 'object' as const,
    properties: {
      idEnte: {
        type: 'string',
        description: "L'ID/codice con cui l'ente identifica se stesso in questa pratica.",
      },
      campo1: { type: 'string' },
      campo2: { type: 'string' },
      campo3: { type: 'string' },
      campo4: { type: 'string' },
      campo5: { type: 'string' },
      campo6: { type: 'string' },
      campo7: { type: 'string' },
      campo8: { type: 'string' },
      campo9: { type: 'string' },
      campo10: { type: 'string' },
    },
  },
};

export async function chiediGuidaAnagrafica(
  nomeSchema: string,
  aziendaId: number,
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoChatGuidato> {
  if (!anthropic) {
    return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
  }

  try {
    const [etichetteRis, datiRis] = await Promise.all([
      ottieniEtichetteAnagraficaEnte(nomeSchema),
      ottieniAnagraficaEnte(nomeSchema, aziendaId),
    ]);
    const etichette = etichetteRis.success ? etichetteRis.etichette : [];
    const datiAttuali = datiRis.success ? datiRis.dati : null;

    const elencoCampi = etichette.map((e) => `- campo${e.campo}: "${e.etichetta}"`).join('\n');
    const statoAttuale = datiAttuali
      ? `Stato attuale già salvato: ID Ente = ${datiAttuali.idEnte || '(vuoto)'}, ${etichette
          .map((e, i) => `${e.etichetta} = ${(datiAttuali as any)[`campo${i + 1}`] || '(vuoto)'}`)
          .join(', ')}.`
      : 'Nessun dato ancora salvato.';

    const systemInstruction = `
Stai guidando un operatore a compilare l'Anagrafica Ente per uno scenario — come l'ente identifica questa azienda nella propria contabilità interna (es. INPS ha matricola, posizione gestione separata, codici CSC/CA...).

Campi da raccogliere, con l'etichetta che questo spazio usa per ciascuno (personalizzata dall'admin, non un nome fisso):
- idEnte: "ID Ente" (identificativo generale della pratica)
${elencoCampi}

${statoAttuale}

REGOLE:
1. Fai una domanda alla volta, breve e diretta — non un questionario tutto insieme.
2. Non serve raccogliere tutti i campi: anche un solo campo compilato sblocca il resto del percorso (Check List, Situazione Debitoria). Se l'utente dice "basta così" o simile dopo aver dato almeno un'informazione, salva quello che hai e concludi.
3. Chiama lo strumento salva_anagrafica_ente non appena hai anche un solo campo nuovo da salvare — non aspettare la fine della conversazione. Dopo averlo chiamato, conferma brevemente cosa hai salvato e chiedi se vuole aggiungere altro o è tutto per ora.
4. Se l'utente fornisce più informazioni in un colpo solo, raccoglile tutte in un'unica chiamata allo strumento.
5. Tono colloquiale, frasi brevi.
`;

    const messaggi: Anthropic.MessageParam[] = [
      ...cronologia.map((m) => ({
        role: m.ruolo === 'utente' ? ('user' as const) : ('assistant' as const),
        content: m.testo,
      })),
      { role: 'user' as const, content: messaggio },
    ];

    let datiAggiornati = false;

    // Ciclo di tool-use: il modello può chiamare lo strumento, noi lo
    // eseguiamo per davvero (scrittura reale sul database, stessa azione
    // del form libero), gli restituiamo l'esito, e lui produce la
    // risposta finale da mostrare — non è un solo giro, può volercene più
    // di uno se il modello vuole confermare prima di procedere.
    for (let giro = 0; giro < 4; giro++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemInstruction,
        messages: messaggi,
        tools: [STRUMENTO_SALVA_ANAGRAFICA],
      });

      const bloccoStrumento = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (!bloccoStrumento) {
        const testo = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n')
          .trim();
        return { success: true, risposta: testo || 'Ok.', datiAggiornati };
      }

      // Il modello ha chiamato lo strumento: eseguiamo per davvero,
      // riusando l'azione già validata lato server (stessa regola di
      // "almeno un campo compilato" del form libero).
      const input = bloccoStrumento.input as Record<string, string | undefined>;
      const nuoviDati = {
        idEnte: input.idEnte ?? datiAttuali?.idEnte ?? null,
        campo1: input.campo1 ?? datiAttuali?.campo1 ?? null,
        campo2: input.campo2 ?? datiAttuali?.campo2 ?? null,
        campo3: input.campo3 ?? datiAttuali?.campo3 ?? null,
        campo4: input.campo4 ?? datiAttuali?.campo4 ?? null,
        campo5: input.campo5 ?? datiAttuali?.campo5 ?? null,
        campo6: input.campo6 ?? datiAttuali?.campo6 ?? null,
        campo7: input.campo7 ?? datiAttuali?.campo7 ?? null,
        campo8: input.campo8 ?? datiAttuali?.campo8 ?? null,
        campo9: input.campo9 ?? datiAttuali?.campo9 ?? null,
        campo10: input.campo10 ?? datiAttuali?.campo10 ?? null,
      };
      const risultatoSalvataggio = await salvaAnagraficaEnteAction(
        nomeSchema,
        aziendaId,
        nuoviDati
      );
      if (risultatoSalvataggio.success) datiAggiornati = true;

      messaggi.push({ role: 'assistant', content: response.content });
      messaggi.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: bloccoStrumento.id,
            content: risultatoSalvataggio.success
              ? 'Salvato con successo.'
              : `Errore: ${risultatoSalvataggio.error}`,
          },
        ],
      });
    }

    return {
      success: true,
      risposta: 'Ho salvato quanto raccolto finora — continua pure, o chiudi qui.',
      datiAggiornati,
    };
  } catch (error: any) {
    console.error('[chiediGuidaAnagrafica] Errore:', error);
    return {
      success: false,
      error: `Impossibile contattare l'assistente: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Situazione Debitoria dell'Ente — secondo passo dello stesso schema.
// A differenza dell'Anagrafica (un record solo), qui si accumulano più
// righe: lo strumento ne aggiunge una alla volta, l'operatore ne detta
// quante vuole in sequenza.
// ============================================================================

const STRUMENTO_AGGIUNGI_DEBITO = {
  name: 'aggiungi_riga_debito',
  description:
    "Aggiunge una riga alla Situazione Debitoria — una voce di debito che l'ente dichiara di avere verso questa azienda secondo la propria contabilità. Chiamalo per ogni voce che l'utente detta, una alla volta, non aspettare che ne dica più di una insieme (se lo fa, chiamalo più volte in questo stesso turno, una volta per voce).",
  input_schema: {
    type: 'object' as const,
    properties: {
      voce: {
        type: 'string',
        description: 'descrizione della voce di debito (es. "Contributi 2023")',
      },
      importo: { type: 'number', description: 'importo in euro, numero puro senza simboli' },
      tipo: {
        type: 'string',
        enum: TIPI_DEBITO_ENTE.map((t) => t.valore),
        description:
          'CLE = Certo Liquido Esigibile, CEN = Certo Emesso Notificato, CEC = Certo Esigibile Contenzioso, CEA = Certo Esigibile Agente della Riscossione',
      },
      note: { type: 'string' },
    },
    required: ['voce', 'importo', 'tipo'],
  },
};

export async function chiediGuidaDebitiEnte(
  nomeSchema: string,
  aziendaId: number,
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoChatGuidato> {
  if (!anthropic) {
    return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
  }

  try {
    const debitiRis = await ottieniDebitiEnte(nomeSchema, aziendaId);
    const righeEsistenti = debitiRis.success ? debitiRis.righe : [];
    const riepilogoEsistenti =
      righeEsistenti.length === 0
        ? 'Nessuna voce ancora registrata.'
        : `Voci già registrate (${righeEsistenti.length}): ${righeEsistenti
            .map((r) => `"${r.voce}" € ${r.importo} (${r.tipo})`)
            .join('; ')}.`;

    const legendaTipi = TIPI_DEBITO_ENTE.map((t) => `${t.valore} = ${t.descrizione}`).join('; ');

    const systemInstruction = `
Stai guidando un operatore a compilare la Situazione Debitoria di un ente per uno scenario — le voci di debito che l'ente dichiara di avere verso questa azienda secondo la propria contabilità interna (non quanto l'azienda ha proposto: sono due dichiarazioni indipendenti, verranno confrontate altrove).

Classificazione da usare per ogni voce (chiedi quale si applica se non è chiaro dal contesto): ${legendaTipi}.

${riepilogoEsistenti}

REGOLE:
1. Fai una domanda alla volta: descrizione della voce, importo, tipo — non tutto insieme se l'utente non te lo dà già tutto insieme.
2. Chiama aggiungi_riga_debito non appena hai voce + importo + tipo di UNA voce — non aspettare che l'utente dica di aver finito con tutte le voci. Se in un messaggio l'utente detta più voci insieme, chiama lo strumento una volta per ciascuna.
3. Dopo ogni aggiunta, conferma brevemente cosa hai registrato e chiedi se c'è un'altra voce o se ha finito.
4. Non hai bisogno di sapere il perché di una voce (contenzioso, ecc.) oltre a quanto serve per classificarla in una delle 4 categorie — non indagare oltre.
5. Tono colloquiale, frasi brevi.
`;

    const messaggi: Anthropic.MessageParam[] = [
      ...cronologia.map((m) => ({
        role: m.ruolo === 'utente' ? ('user' as const) : ('assistant' as const),
        content: m.testo,
      })),
      { role: 'user' as const, content: messaggio },
    ];

    let datiAggiornati = false;

    for (let giro = 0; giro < 6; giro++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemInstruction,
        messages: messaggi,
        tools: [STRUMENTO_AGGIUNGI_DEBITO],
      });

      const blocchiStrumento = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (blocchiStrumento.length === 0) {
        const testo = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n')
          .trim();
        return { success: true, risposta: testo || 'Ok.', datiAggiornati };
      }

      messaggi.push({ role: 'assistant', content: response.content });
      const risultatiStrumenti: Anthropic.ToolResultBlockParam[] = [];

      for (const blocco of blocchiStrumento) {
        const input = blocco.input as {
          voce: string;
          importo: number;
          tipo: TipoDebitoEnte;
          note?: string;
        };
        const esito = await aggiungiRigaDebitoEnteAction(nomeSchema, aziendaId, {
          voce: input.voce,
          importo: input.importo,
          importoVersato: null,
          tipo: input.tipo,
          note: input.note || null,
          data: null,
        });
        if (esito.success) datiAggiornati = true;
        risultatiStrumenti.push({
          type: 'tool_result',
          tool_use_id: blocco.id,
          content: esito.success ? 'Salvato con successo.' : `Errore: ${esito.error}`,
        });
      }

      messaggi.push({ role: 'user', content: risultatiStrumenti });
    }

    return {
      success: true,
      risposta: 'Ho registrato quanto raccolto finora — continua pure, o chiudi qui.',
      datiAggiornati,
    };
  } catch (error: any) {
    console.error('[chiediGuidaDebitiEnte] Errore:', error);
    return {
      success: false,
      error: `Impossibile contattare l'assistente: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Check List — terzo passo dello stesso schema. Diversa dagli altri due:
// qui non si "aggiunge" un dato, si RISPONDE a domande già definite dal
// modello (Ministeriale o custom), una alla volta — Sì/No più una nota
// facoltativa. Le domande già escluse per questo scenario (vedi
// checklist.ts, esclusioni) non vengono proposte: la guida rispetta la
// stessa scelta fatta nel form libero, non la ignora.
// ============================================================================

export interface RispostaEsistenteChecklist {
  domandaId: string;
  risposta: boolean | null;
}

const STRUMENTO_RISPONDI_DOMANDA = {
  name: 'rispondi_domanda',
  description:
    "Registra la risposta (Sì/No) a una domanda della check list, con una nota facoltativa. Chiamalo per ogni domanda a cui l'utente risponde, anche una alla volta man mano che le tocchi.",
  input_schema: {
    type: 'object' as const,
    properties: {
      domandaId: { type: 'string', description: 'id esatto della domanda (es. "1.1")' },
      risposta: { type: 'string', enum: ['si', 'no'] },
      nota: { type: 'string', description: 'facoltativa, solo se utile' },
    },
    required: ['domandaId', 'risposta'],
  },
};

export async function chiediGuidaChecklist(
  nomeSchema: string,
  scenarioId: number,
  modelloChiave: string,
  sezioni: SezioneChecklist[],
  risposteEsistenti: RispostaEsistenteChecklist[],
  domandeEscluse: string[],
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoChatGuidato> {
  if (!anthropic) {
    return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
  }

  try {
    const mappaRisposte = new Map(risposteEsistenti.map((r) => [r.domandaId, r.risposta]));
    const setEscluse = new Set(domandeEscluse);

    const elencoDomande = sezioni
      .map((s) => {
        const righe = s.domande
          .filter((d) => !setEscluse.has(d.id))
          .map((d) => {
            const stato = mappaRisposte.get(d.id);
            const statoTesto =
              stato === true ? '[già: Sì]' : stato === false ? '[già: No]' : '[da fare]';
            return `  - ${d.id}: ${d.domanda} ${statoTesto}`;
          })
          .join('\n');
        return `${s.numero}. ${s.titolo}\n${righe}`;
      })
      .join('\n\n');

    const totaleDaFare = sezioni
      .flatMap((s) => s.domande)
      .filter((d) => !setEscluse.has(d.id) && mappaRisposte.get(d.id) === undefined).length;

    const systemInstruction = `
Stai guidando un operatore a compilare la Check List di questo scenario. Ogni domanda ha già un id preciso — usa SEMPRE quello, non inventarlo e non riformularlo.

Domande (con lo stato attuale — quelle escluse dallo scenario non compaiono, non chiederle):
${elencoDomande}

Domande ancora da fare: ${totaleDaFare}.

REGOLE:
1. Procedi per sezione, una domanda alla volta — non elencare tutte le domande insieme all'utente, sarebbe come rovesciargli addosso un questionario.
2. Riformula la domanda in modo naturale, non leggerla parola per parola dall'elenco — ma il domandaId nello strumento deve restare quello esatto.
3. Chiama rispondi_domanda non appena l'utente dà una risposta chiara (anche un "sì" o "no" secco basta) — non aspettare conferma aggiuntiva.
4. Se l'utente vuole saltare una domanda o fermarsi, va bene: ricorda che si può sempre riprendere da dove si è interrotto, e che le domande già risposte restano salvate.
5. Non serve rispondere a tutte le domande per procedere con lo scenario — dillo se l'utente sembra scoraggiato dal numero.
6. Tono colloquiale, frasi brevi.
`;

    const messaggi: Anthropic.MessageParam[] = [
      ...cronologia.map((m) => ({
        role: m.ruolo === 'utente' ? ('user' as const) : ('assistant' as const),
        content: m.testo,
      })),
      { role: 'user' as const, content: messaggio },
    ];

    let datiAggiornati = false;

    for (let giro = 0; giro < 6; giro++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemInstruction,
        messages: messaggi,
        tools: [STRUMENTO_RISPONDI_DOMANDA],
      });

      const blocchiStrumento = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (blocchiStrumento.length === 0) {
        const testo = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n')
          .trim();
        return { success: true, risposta: testo || 'Ok.', datiAggiornati };
      }

      messaggi.push({ role: 'assistant', content: response.content });
      const risultatiStrumenti: Anthropic.ToolResultBlockParam[] = [];

      for (const blocco of blocchiStrumento) {
        const input = blocco.input as { domandaId: string; risposta: 'si' | 'no'; nota?: string };
        const esito = await salvaRispostaChecklistAction(
          nomeSchema,
          scenarioId,
          modelloChiave,
          input.domandaId,
          input.risposta === 'si',
          input.nota || null
        );
        if (esito.success) datiAggiornati = true;
        risultatiStrumenti.push({
          type: 'tool_result',
          tool_use_id: blocco.id,
          content: esito.success ? 'Salvato con successo.' : `Errore: ${esito.error}`,
        });
      }

      messaggi.push({ role: 'user', content: risultatiStrumenti });
    }

    return {
      success: true,
      risposta: 'Ho registrato quanto raccolto finora — continua pure, o chiudi qui.',
      datiAggiornati,
    };
  } catch (error: any) {
    console.error('[chiediGuidaChecklist] Errore:', error);
    return {
      success: false,
      error: `Impossibile contattare l'assistente: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Proposta — quarto passo. Aggiunge righe (categoria, importo, percentuale
// offerta, modalità, rango legale facoltativo) e, solo per le proposte
// RICEVUTE, può segnare quale riga interessa all'ente — non la blocca:
// il blocco resta un'azione deliberata nel form libero, non qualcosa che
// una conversazione decide da sola.
// ============================================================================

import {
  aggiungiRigaPropostaAction,
  impostaRigaRilevanteAction,
  ottieniPropostaScenario,
  type ModalitaProposta,
} from '@/app/actions/propostaScenario';
import { RANGHI_LEGALI, type RangoLegale } from '@/lib/proposta/rangoLegale';

const STRUMENTO_AGGIUNGI_RIGA_PROPOSTA = {
  name: 'aggiungi_riga_proposta',
  description:
    "Aggiunge una riga alla Proposta. Chiamalo per ogni creditore/voce che l'utente detta, una alla volta.",
  input_schema: {
    type: 'object' as const,
    properties: {
      categoriaCreditore: { type: 'string', description: 'es. "INPS", "Fornitori", "Erario"' },
      importoDovuto: { type: 'number', description: 'importo dovuto in euro, numero puro' },
      percentualeOfferta: {
        type: 'number',
        description: 'numero intero da 0 a 100 (es. 6 per il 6%, non 0.06)',
      },
      modalita: { type: 'string', enum: ['UNICA_SOLUZIONE', 'RATEALE'] },
      numeroRate: { type: 'number', description: 'solo se modalita è RATEALE' },
      rangoLegale: {
        type: 'string',
        enum: RANGHI_LEGALI.map((r) => r.valore),
        description:
          'facoltativo — famiglia della liquidazione giudiziale, chiedilo solo se il contesto lo rende naturale, non è indispensabile',
      },
    },
    required: ['categoriaCreditore', 'importoDovuto', 'percentualeOfferta', 'modalita'],
  },
};

const STRUMENTO_SEGNA_INTERESSE = {
  name: 'segna_riga_interesse',
  description:
    "Segna quale riga già inserita riguarda l'ente destinatario di questa proposta — usalo solo per proposte Ricevute, solo quando l'utente lo chiede esplicitamente, e solo se la riga esiste già (chiamalo dopo aggiungi_riga_proposta, non prima).",
  input_schema: {
    type: 'object' as const,
    properties: {
      categoriaCreditore: {
        type: 'string',
        description: 'la categoria della riga già inserita da segnare',
      },
    },
    required: ['categoriaCreditore'],
  },
};

export async function chiediGuidaProposta(
  nomeSchema: string,
  scenarioId: number,
  tipoProposta: 'RICEVUTA' | 'DA_DEFINIRE',
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoChatGuidato> {
  if (!anthropic) {
    return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
  }

  try {
    const propostaRis = await ottieniPropostaScenario(nomeSchema, scenarioId);
    const righeEsistenti = propostaRis.success ? propostaRis.righe : [];
    const riepilogoEsistenti =
      righeEsistenti.length === 0
        ? 'Nessuna riga ancora inserita.'
        : `Righe già inserite (${righeEsistenti.length}): ${righeEsistenti
            .map(
              (r) =>
                `"${r.categoriaCreditore}" € ${r.importoDovuto} al ${r.percentualeOfferta}%${r.rilevantePerEnte ? ' [riga di interesse]' : ''}`
            )
            .join('; ')}.`;

    const legendaRanghi = RANGHI_LEGALI.map((r) => `${r.valore} = ${r.etichetta}`).join('; ');

    const strumenti: Anthropic.Tool[] = [STRUMENTO_AGGIUNGI_RIGA_PROPOSTA];
    if (tipoProposta === 'RICEVUTA') strumenti.push(STRUMENTO_SEGNA_INTERESSE);

    const systemInstruction = `
Stai guidando un operatore a compilare la Proposta di questo scenario (tipo: ${tipoProposta === 'RICEVUTA' ? 'proposta Ricevuta da un ente terzo' : 'proposta Da definire, redatta da questo studio'}).

${riepilogoEsistenti}

Ranghi legali disponibili (facoltativo per riga, chiedilo solo se il contesto lo rende naturale): ${legendaRanghi}.

REGOLE:
1. Raccogli per ogni riga: categoria del creditore, importo dovuto, percentuale offerta (numero intero, es. 6 per 6% — se l'utente dice "sei per cento" o "0,06" traducilo comunque in 6), modalità (unica soluzione o rateale, e se rateale il numero di rate).
2. Chiama aggiungi_riga_proposta non appena hai questi dati per UNA riga — non aspettare che l'utente dica di aver finito.
${tipoProposta === 'RICEVUTA' ? "3. Se e solo se l'utente indica esplicitamente quale riga riguarda direttamente l'ente (es. \"questa è la nostra riga\"), usa segna_riga_interesse — non proporlo tu spontaneamente prima che l'utente abbia inserito almeno una riga." : '3. Questa è una proposta Da definire: tutte le righe hanno pari importanza, non esiste una "riga di interesse" da segnare — non proporlo.'}
4. Tono colloquiale, una domanda alla volta, frasi brevi.
`;

    const messaggi: Anthropic.MessageParam[] = [
      ...cronologia.map((m) => ({
        role: m.ruolo === 'utente' ? ('user' as const) : ('assistant' as const),
        content: m.testo,
      })),
      { role: 'user' as const, content: messaggio },
    ];

    let datiAggiornati = false;
    let righeCorrenti = righeEsistenti;

    for (let giro = 0; giro < 6; giro++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemInstruction,
        messages: messaggi,
        tools: strumenti,
      });

      const blocchiStrumento = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (blocchiStrumento.length === 0) {
        const testo = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n')
          .trim();
        return { success: true, risposta: testo || 'Ok.', datiAggiornati };
      }

      messaggi.push({ role: 'assistant', content: response.content });
      const risultatiStrumenti: Anthropic.ToolResultBlockParam[] = [];

      for (const blocco of blocchiStrumento) {
        if (blocco.name === 'aggiungi_riga_proposta') {
          const input = blocco.input as {
            categoriaCreditore: string;
            importoDovuto: number;
            percentualeOfferta: number;
            modalita: ModalitaProposta;
            numeroRate?: number;
            rangoLegale?: RangoLegale;
          };
          const esito = await aggiungiRigaPropostaAction(nomeSchema, scenarioId, {
            categoriaCreditore: input.categoriaCreditore,
            importoDovuto: input.importoDovuto,
            percentualeOfferta: input.percentualeOfferta,
            modalita: input.modalita,
            numeroRate: input.numeroRate || null,
            note: null,
            rangoLegale: input.rangoLegale || null,
          });
          if (esito.success) {
            datiAggiornati = true;
            const aggiornata = await ottieniPropostaScenario(nomeSchema, scenarioId);
            if (aggiornata.success) righeCorrenti = aggiornata.righe;
          }
          risultatiStrumenti.push({
            type: 'tool_result',
            tool_use_id: blocco.id,
            content: esito.success ? 'Riga salvata con successo.' : `Errore: ${esito.error}`,
          });
        } else if (blocco.name === 'segna_riga_interesse') {
          const input = blocco.input as { categoriaCreditore: string };
          const riga = righeCorrenti.find(
            (r) => r.categoriaCreditore.toLowerCase() === input.categoriaCreditore.toLowerCase()
          );
          if (!riga) {
            risultatiStrumenti.push({
              type: 'tool_result',
              tool_use_id: blocco.id,
              content: `Nessuna riga trovata con categoria "${input.categoriaCreditore}" — controlla il nome esatto tra quelle già inserite.`,
            });
            continue;
          }
          const esito = await impostaRigaRilevanteAction(nomeSchema, scenarioId, riga.id, true);
          if (esito.success) datiAggiornati = true;
          risultatiStrumenti.push({
            type: 'tool_result',
            tool_use_id: blocco.id,
            content: esito.success
              ? `Riga "${riga.categoriaCreditore}" segnata come riga di interesse (non ancora bloccata — il blocco si fa dalla pagina, quando l'operatore è sicuro).`
              : `Errore: ${esito.error}`,
          });
        }
      }

      messaggi.push({ role: 'user', content: risultatiStrumenti });
    }

    return {
      success: true,
      risposta: 'Ho registrato quanto raccolto finora — continua pure, o chiudi qui.',
      datiAggiornati,
    };
  } catch (error: any) {
    console.error('[chiediGuidaProposta] Errore:', error);
    return {
      success: false,
      error: `Impossibile contattare l'assistente: ${error.message || error}`,
    };
  }
}
