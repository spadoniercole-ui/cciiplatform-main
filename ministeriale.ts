'use server';

// Un solo punto d'ingresso per l'assistente flottante, sempre nello
// stesso posto — smista alla funzione già costruita giusta in base a su
// quale funzione si trova l'utente (src/components/ContestoAssistente
// Context.tsx). Non duplica la logica di ciascuna guida: la richiama.

import type { ContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  chiediGuidaAnagrafica,
  chiediGuidaDebitiEnte,
  chiediGuidaChecklist,
  chiediGuidaProposta,
  type MessaggioChatGuidato,
} from '@/app/actions/chatGuidato';
import { chiediAssistente } from '@/app/actions/chatbotAiuto';
import { ottieniConfigurazioneChecklist } from '@/app/actions/checklistConfig';
import { ottieniModelliChecklist } from '@/app/actions/checklistModelli';
import { ottieniRisposteChecklist, ottieniEsclusioniChecklist } from '@/app/actions/checklist';
import { MODELLO_MINISTERIALE } from '@/lib/checklist/costanti';
import { CHECKLIST_MINISTERIALE, type SezioneChecklist } from '@/lib/checklist/ministeriale';

export interface RisultatoAssistenteContestuale {
  success: boolean;
  risposta?: string;
  datiAggiornati?: boolean;
  error?: string;
}

const GUIDA_XBRL = `
Stai aiutando un operatore con il caricamento di un bilancio XBRL su CCIIWEB4.0. Non puoi caricare il file al suo posto (è un'azione fisica, non qualcosa che si fa per conversazione) — guidalo passo per passo:

1. Nel passo "Import XBRL" dello scenario, trascina il file .xbrl del bilancio (o clicca per selezionarlo).
2. Il sistema lo analizza da solo: mostra gli indici CNDCEC calcolati, la situazione debitoria estratta, e — se il file contiene anche l'anno comparativo (quasi sempre) — il confronto con l'anno precedente.
3. Una volta verificati i dati mostrati, si preme "Salva nello storico" per renderli disponibili al resto dello scenario (Indici, Relazione AI).

Se l'operatore descrive un problema specifico (es. "non trovo il file", "dà errore", "i dati non sembrano giusti"), rispondi a quello — non ripetere sempre gli stessi tre passi come un copione. Tono colloquiale, breve.
`;

async function chiediGuidaXbrl(
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoAssistenteContestuale> {
  const risultato = await chiediAssistente(
    cronologia.map((m) => ({ ruolo: m.ruolo, testo: m.testo })),
    `${GUIDA_XBRL}\n\nMessaggio dell'operatore: ${messaggio}`
  );
  return { success: risultato.success, risposta: risultato.risposta, error: risultato.error };
}

const GUIDA_SIMULAZIONE = `
Stai aiutando un operatore con la Simulazione di continuità aziendale su CCIIWEB4.0. Spiega come funziona se te lo chiede, ma non calcolare tu i numeri — è un calcolo deterministico già fatto dalla pagina, la tua parte è spiegare cosa significa:

- Tre scenari di crescita ricavi a 3 anni (ottimistico/neutrale/pessimistico), ancorati al confronto tra il trend storico dell'azienda (da XBRL e Posizione Aggiornata) e il trend storico del settore (da Dati di Settore ISTAT) — non percentuali arbitrarie.
- Tre leve manovrabili: riduzione costi operativi, riduzione costo del personale (nota: agiscono sulla stessa base di calcolo, il bilancio XBRL non isola una voce personale separata), allungamento del piano di rientro.
- Il criterio di viabilità è il DSCR (flusso di cassa disponibile / rata del piano) proiettato: deve restare sopra 1 in TUTTI e 3 gli anni di uno scenario perché quello scenario sia considerato viabile — un solo anno sotto 1 lo fa fallire, non si fa la media.

Se l'operatore descrive un problema specifico, rispondi a quello. Tono colloquiale, breve.
`;

async function chiediGuidaSimulazione(
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoAssistenteContestuale> {
  const risultato = await chiediAssistente(
    cronologia.map((m) => ({ ruolo: m.ruolo, testo: m.testo })),
    `${GUIDA_SIMULAZIONE}\n\nMessaggio dell'operatore: ${messaggio}`
  );
  return { success: risultato.success, risposta: risultato.risposta, error: risultato.error };
}

/**
 * Parametri di Spazio — sei sezioni di configurazione (Limiti di
 * ricevibilità, Tab XBRL, Indici, Check List, Anagrafica Ente, Parametri
 * di sistema), nessuna compilabile in conversazione con uno strumento
 * dedicato (sono impostazioni singole, non righe ripetute come una
 * check list o una proposta) — ma l'assistente deve comunque sapere SU
 * QUALE sezione si trova, per spiegarla invece di rispondere in modo
 * generico come se non fosse in nessuna pagina specifica.
 */
async function chiediGuidaParametri(
  sezioneParametri: string | undefined,
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoAssistenteContestuale> {
  const contestoTesto = sezioneParametri
    ? `L'operatore si trova in Parametri di Spazio, sezione "${sezioneParametri}". Questa è una pagina di configurazione (impostazioni valide per tutti gli scenari di questo spazio), non una pagina compilabile riga per riga in conversazione — rispondi spiegando a cosa serve questa sezione e come si usa, sulla base di quello che sai della piattaforma. Se la domanda è un problema specifico che stai vedendo descritto, rispondi a quello.`
    : `L'operatore si trova in Parametri di Spazio (sezione non specificata).`;
  const risultato = await chiediAssistente(
    cronologia.map((m) => ({ ruolo: m.ruolo, testo: m.testo })),
    `${contestoTesto}\n\nMessaggio dell'operatore: ${messaggio}`
  );
  return { success: risultato.success, risposta: risultato.risposta, error: risultato.error };
}

export async function chiediAssistenteContestuale(
  contesto: ContestoAssistente | null,
  cronologia: MessaggioChatGuidato[],
  messaggio: string
): Promise<RisultatoAssistenteContestuale> {
  if (!contesto) {
    const risultato = await chiediAssistente(
      cronologia.map((m) => ({ ruolo: m.ruolo, testo: m.testo })),
      messaggio
    );
    return { success: risultato.success, risposta: risultato.risposta, error: risultato.error };
  }

  switch (contesto.pagina) {
    case 'anagrafica-ente': {
      if (!contesto.scenarioId) return { success: false, error: 'Scenario non identificato.' };
      return await chiediGuidaAnagrafica(
        contesto.nomeSchema,
        contesto.scenarioId,
        cronologia,
        messaggio
      );
    }

    case 'debitoria-ente': {
      if (!contesto.scenarioId) return { success: false, error: 'Scenario non identificato.' };
      return await chiediGuidaDebitiEnte(
        contesto.nomeSchema,
        contesto.scenarioId,
        cronologia,
        messaggio
      );
    }

    case 'checklist-ente':
    case 'checklist-generale': {
      if (!contesto.scenarioId) return { success: false, error: 'Scenario non identificato.' };
      const modelloChiave = contesto.modelloChecklist || MODELLO_MINISTERIALE;

      let sezioni: SezioneChecklist[] = [];
      if (modelloChiave === MODELLO_MINISTERIALE) {
        const configRis = await ottieniConfigurazioneChecklist(contesto.nomeSchema);
        sezioni = configRis.success
          ? configRis.configurazione?.sezioni || CHECKLIST_MINISTERIALE
          : CHECKLIST_MINISTERIALE;
      } else {
        const modelliRis = await ottieniModelliChecklist(contesto.nomeSchema, true);
        sezioni = modelliRis.success
          ? modelliRis.modelli.find((m) => String(m.id) === modelloChiave)?.sezioni || []
          : [];
      }

      const [risposteRis, esclusioniRis] = await Promise.all([
        ottieniRisposteChecklist(contesto.nomeSchema, contesto.scenarioId, modelloChiave),
        ottieniEsclusioniChecklist(contesto.nomeSchema, contesto.scenarioId, modelloChiave),
      ]);

      const risposteEsistenti = risposteRis.success
        ? risposteRis.risposte.map((r) => ({ domandaId: r.domandaId, risposta: r.risposta }))
        : [];
      const domandeEscluse = esclusioniRis.success ? esclusioniRis.domandeEscluse : [];

      return await chiediGuidaChecklist(
        contesto.nomeSchema,
        contesto.scenarioId,
        modelloChiave,
        sezioni,
        risposteEsistenti,
        domandeEscluse,
        cronologia,
        messaggio
      );
    }

    case 'proposta': {
      if (!contesto.scenarioId) return { success: false, error: 'Scenario non identificato.' };
      return await chiediGuidaProposta(
        contesto.nomeSchema,
        contesto.scenarioId,
        contesto.tipoProposta || 'DA_DEFINIRE',
        cronologia,
        messaggio
      );
    }

    case 'xbrl':
      return chiediGuidaXbrl(cronologia, messaggio);

    case 'simulazione':
      return chiediGuidaSimulazione(cronologia, messaggio);

    case 'parametri':
      return chiediGuidaParametri(contesto.sezioneParametri, cronologia, messaggio);

    default: {
      const risultato = await chiediAssistente(
        cronologia.map((m) => ({ ruolo: m.ruolo, testo: m.testo })),
        messaggio
      );
      return { success: risultato.success, risposta: risultato.risposta, error: risultato.error };
    }
  }
}
