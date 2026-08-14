'use server';

// Documenti di corredo alla proposta — solo percorso Redigente. Bozze
// scritte per intero dall'AI (come la Relazione), poi liberamente
// modificabili a mano dal professionista che le firma. Nessun dato
// inventato: il modello riceve il quadro già raccolto (Brogliaccio,
// proposta, confronto liquidatorio, test pratico) e per ogni
// informazione mancante deve lasciare un segnaposto tra parentesi
// quadre, non riempirlo a caso.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { assicuraTabellaDocumentiCorredo } from '@/db/provision';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { verificaRicevibilitaProposta } from '@/app/actions/propostaScenario';
import { ottieniBrogliaccio } from '@/app/actions/brogliaccio';
import { ottieniConfrontoLiquidatorio } from '@/app/actions/confrontoLiquidatorio';
import { ottieniTestPraticoAzienda } from '@/app/actions/testPraticoAzienda';
import { DOCUMENTI_CORREDO, type TipoDocumentoCorredo } from '@/lib/documentiCorredo/costanti';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

function tipoValido(tipo: string): tipo is TipoDocumentoCorredo {
  return DOCUMENTI_CORREDO.some((d) => d.tipo === tipo);
}

export interface DocumentoCorredo {
  tipo: TipoDocumentoCorredo;
  testo: string | null;
  generatoIl: string | null;
  aggiornatoIl: string | null;
}

export interface RisultatoDocumentiCorredo {
  success: boolean;
  documenti: DocumentoCorredo[];
  error?: string;
}

export async function ottieniDocumentiCorredo(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoDocumentiCorredo> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, documenti: [], error: 'Nome schema non valido.' };
    }
    await assicuraTabellaDocumentiCorredo(nomeSchema);
    const r = await pool.query(
      `SELECT tipo, testo, generato_il, aggiornato_il
       FROM "${nomeSchema}".documenti_corredo WHERE scenario_id = $1`,
      [scenarioId]
    );
    const perTipo = new Map(r.rows.map((row) => [row.tipo, row]));
    const documenti: DocumentoCorredo[] = DOCUMENTI_CORREDO.map((meta) => {
      const row = perTipo.get(meta.tipo);
      return {
        tipo: meta.tipo,
        testo: row?.testo ?? null,
        generatoIl: row?.generato_il ? row.generato_il.toString() : null,
        aggiornatoIl: row?.aggiornato_il ? row.aggiornato_il.toString() : null,
      };
    });
    return { success: true, documenti };
  } catch (error: any) {
    console.error('[ottieniDocumentiCorredo] Errore:', error);
    return {
      success: false,
      documenti: [],
      error: `Impossibile caricare i documenti: ${error.message || error}`,
    };
  }
}

/** Salvataggio manuale — il professionista ha ritoccato la bozza. Non
 * tocca generato_il (resta la data della generazione AI), aggiorna solo
 * aggiornato_il: così l'interfaccia può dire "modificato dopo la
 * generazione". */
export async function salvaDocumentoCorredoAction(
  nomeSchema: string,
  scenarioId: number,
  tipo: string,
  testo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!tipoValido(tipo)) return { success: false, error: 'Tipo di documento non valido.' };
    await assicuraTabellaDocumentiCorredo(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".documenti_corredo (scenario_id, tipo, testo, aggiornato_il)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (scenario_id, tipo) DO UPDATE SET testo = $3, aggiornato_il = now()`,
      [scenarioId, tipo, testo]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaDocumentoCorredoAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

const ISTRUZIONI_COMUNI = `Scrivi in italiano, in prosa formale da atto professionale, pronto per essere riletto e firmato da un dottore commercialista. È una BOZZA: dove manca un dato puntuale (date, luogo, nome e recapiti dell'esperto nominato, tribunale competente, estremi dell'iscrizione al registro delle imprese, numeri non presenti nel quadro fornito) NON inventarlo — lascia un segnaposto tra parentesi quadre, es. [DATA], [NOME ESPERTO], [LUOGO]. Non citare articoli di legge di cui non sei sicuro: quando richiami il Codice della Crisi d'Impresa e dell'Insolvenza (D.Lgs. 14/2019) fallo solo dove sei certo, altrimenti resta sul piano sostanziale. Non riassumere queste istruzioni nel testo e non aggiungere note per l'utente: produci solo il documento.`;

const PROMPT_PER_TIPO: Record<TipoDocumentoCorredo, string> = {
  ASSEVERAZIONE: `Sei un dottore commercialista indipendente che redige la propria ASSEVERAZIONE (attestazione) a corredo di una proposta di composizione negoziata della crisi predisposta per l'azienda debitrice.

Struttura il documento così:
1. Intestazione con i dati del professionista attestatore e dell'azienda (usa segnaposto dove non forniti) e dichiarazione di indipendenza.
2. Oggetto: attestazione della veridicità dei dati aziendali su cui si fonda la proposta, sulla base della documentazione contabile e dei bilanci esaminati.
3. Attestazione di coerenza e sostenibilità del piano/proposta rispetto ai flussi a regime e all'indebitamento, richiamando il test pratico (Sezione I) e l'esito della Check List Ministeriale ove disponibili nel quadro.
4. Confronto con lo scenario liquidatorio come pavimento minimo di soddisfazione dei creditori, se il dato è presente nel quadro.
5. Conclusione con la dichiarazione asseverativa finale, data e firma (segnaposto).
${ISTRUZIONI_COMUNI}`,

  CONVOCAZIONE: `Sei il dottore commercialista che, per conto dell'azienda debitrice, redige una LETTERA DI CONVOCAZIONE indirizzata ai creditori per avviare le trattative nell'ambito della composizione negoziata della crisi.

Struttura il documento così:
1. Intestazione (mittente: azienda debitrice; destinatario: i creditori — usa un destinatario generico o segnaposto).
2. Comunicazione dell'avvio del percorso di composizione negoziata e della nomina dell'esperto indipendente (segnaposto per nome/estremi se non forniti).
3. Sintesi essenziale e non tecnica della situazione e della proposta che verrà presentata, richiamando i tratti salienti del quadro (senza numeri che non siano nel quadro fornito).
4. Invito a partecipare alle trattative, con indicazione di luogo/data/modalità come segnaposto, e richiamo agli obblighi di riservatezza e buona fede nelle trattative.
5. Chiusura formale, data e firma (segnaposto).
${ISTRUZIONI_COMUNI}`,

  MEMORIA: `Sei il difensore/consulente legale dell'azienda debitrice e redigi una MEMORIA a supporto della proposta di composizione negoziata, destinata a illustrarne la fondatezza e la convenienza.

Struttura il documento così:
1. Premessa: inquadramento della composizione negoziata come strumento di regolazione della crisi e stato dell'impresa.
2. Descrizione della proposta ai creditori (per categorie/ranghi) sulla base del quadro fornito.
3. Argomentazione sulla convenienza: confronto con l'alternativa liquidatoria come termine di paragone minimo per i creditori, richiamando il dato del confronto liquidatorio se presente.
4. Argomentazione sulla ragionevole perseguibilità del risanamento, richiamando il test pratico (Sezione I) e gli indici, ove disponibili.
5. Conclusioni. Mantieni un tono giuridico ma prudente; non affermare esiti processuali certi.
${ISTRUZIONI_COMUNI}`,
};

export interface RisultatoGeneraDocumentoCorredo {
  success: boolean;
  testo?: string;
  troncata?: boolean;
  error?: string;
}

export async function generaDocumentoCorredoAction(
  nomeSchema: string,
  scenarioId: number,
  tipo: string
): Promise<RisultatoGeneraDocumentoCorredo> {
  try {
    if (!anthropic) {
      return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
    }
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!tipoValido(tipo)) return { success: false, error: 'Tipo di documento non valido.' };

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    // I documenti di corredo sono un istituto del percorso Redigente:
    // per una proposta ricevuta (Ricevente) non si redige nulla, si
    // valuta soltanto.
    if (scenarioRis.scenario.tipoProposta === 'RICEVUTA') {
      return {
        success: false,
        error:
          'I documenti di corredo si redigono solo nel percorso Redigente, non per le proposte ricevute.',
      };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    await assicuraTabellaDocumentiCorredo(nomeSchema);

    const [aziendaRis, esitoRis, brogliaccioRis, confrontoRis, testPraticoRis] = await Promise.all([
      ottieniAziendaPerId(nomeSchema, aziendaId),
      verificaRicevibilitaProposta(nomeSchema, scenarioId, 'NON_ENTE'),
      ottieniBrogliaccio(nomeSchema, scenarioId),
      ottieniConfrontoLiquidatorio(nomeSchema, scenarioId),
      ottieniTestPraticoAzienda(nomeSchema, aziendaId),
    ]);

    const blocchi: string[] = [];
    blocchi.push(
      `AZIENDA: ${aziendaRis.success && aziendaRis.azienda ? `${aziendaRis.azienda.ragioneSociale}${aziendaRis.azienda.codiceAteco ? `, ATECO ${aziendaRis.azienda.codiceAteco}` : ''}` : 'anagrafica non disponibile'}.`
    );
    blocchi.push(`SCENARIO: ${scenarioRis.scenario.nome}.`);

    if (esitoRis.success && esitoRis.esito && esitoRis.esito.righe.length > 0) {
      blocchi.push(
        `PROPOSTA AI CREDITORI (per categoria):\n${esitoRis.esito.righe
          .map(
            (r) =>
              `- ${r.categoriaCreditore}: dovuto € ${r.importoDovuto.toLocaleString('it-IT')}, offerta ${r.percentualeOfferta}%, modalità ${r.modalita === 'UNICA_SOLUZIONE' ? 'unica soluzione' : 'rateale'}${r.numeroRate ? ` (${r.numeroRate} rate)` : ''}`
          )
          .join('\n')}`
      );
    } else {
      blocchi.push(
        'PROPOSTA AI CREDITORI: nessuna riga ancora inserita — descrivi la proposta in termini generali e lascia segnaposto per gli importi.'
      );
    }

    if (testPraticoRis.success && testPraticoRis.stato.compilato) {
      const tp = testPraticoRis.stato.risultato;
      blocchi.push(
        `TEST PRATICO (Sezione I): fascia "${tp.etichetta}", rapporto A/B ${tp.rapporto === null ? 'non applicabile (disequilibrio a regime)' : tp.rapporto.toFixed(2).replace('.', ',')} (debito da ristrutturare € ${Math.round(tp.totaleA).toLocaleString('it-IT')}, flussi annui a regime € ${Math.round(tp.totaleB).toLocaleString('it-IT')}).`
      );
    } else {
      blocchi.push('TEST PRATICO (Sezione I): non ancora compilato.');
    }

    if (brogliaccioRis.success && brogliaccioRis.stato.livello1Testo) {
      blocchi.push(`SINTESI DELLO SCENARIO (Brogliaccio):\n${brogliaccioRis.stato.livello1Testo}`);
    } else {
      blocchi.push('SINTESI DELLO SCENARIO (Brogliaccio): non ancora generata.');
    }

    if (confrontoRis.success && confrontoRis.testo) {
      blocchi.push(`CONFRONTO CON LO SCENARIO LIQUIDATORIO:\n${confrontoRis.testo}`);
    } else {
      blocchi.push(
        'CONFRONTO CON LO SCENARIO LIQUIDATORIO: non ancora disponibile — non citarne cifre precise, eventualmente richiamalo come da completare.'
      );
    }

    const userPrompt = `Quadro raccolto per questo scenario — usa SOLO questi dati, non aggiungerne di inventati:\n\n${blocchi.join('\n\n')}\n\nRedigi ora il documento richiesto.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 5000,
      thinking: { type: 'disabled' },
      system: PROMPT_PER_TIPO[tipo],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const bloccoTesto = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!bloccoTesto?.text) {
      return { success: false, error: 'Nessun testo restituito dal modello AI.' };
    }

    await pool.query(
      `INSERT INTO "${nomeSchema}".documenti_corredo (scenario_id, tipo, testo, generato_il, aggiornato_il)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (scenario_id, tipo)
       DO UPDATE SET testo = $3, generato_il = now(), aggiornato_il = now()`,
      [scenarioId, tipo, bloccoTesto.text]
    );

    return {
      success: true,
      testo: bloccoTesto.text,
      troncata: response.stop_reason === 'max_tokens',
    };
  } catch (error: any) {
    console.error('[generaDocumentoCorredoAction] Errore:', error);
    return {
      success: false,
      error: `Errore durante la generazione del documento: ${error.message || error}`,
    };
  }
}
