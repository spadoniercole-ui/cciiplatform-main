'use server';

// Confronto con lo scenario liquidatorio (artt. 63/88 CCII) — non
// generato al lancio della Relazione (la ricerca web in diretta
// sarebbe troppo lenta lì), ma silenziosamente a ogni chiusura di un
// livello del Brogliaccio Ricevente, poi "parcheggiato": la Relazione
// lo legge già pronto, non lo cerca mai lei stessa.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { assicuraTabellaConfrontoLiquidatorio } from '@/db/provision';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniLimitiRicevibilita } from '@/app/actions/parametriSpazio';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { saldoRigaDebitoEnte } from '@/lib/debitiEnte/tipoDebito';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

/** Ore prima delle quali un confronto già generato è considerato ancora valido — non si rifà la ricerca web a ogni singolo livello del Brogliaccio se ne è già stata fatta una da poco. */
const ORE_FRESCHEZZA = 24;

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RisultatoConfrontoLiquidatorio {
  success: boolean;
  testo: string | null;
  generatoIl: string | null;
  errore: string | null;
}

export async function ottieniConfrontoLiquidatorio(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoConfrontoLiquidatorio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, testo: null, generatoIl: null, errore: 'Nome schema non valido.' };
    }
    await assicuraTabellaConfrontoLiquidatorio(nomeSchema);
    const risultato = await pool.query(
      `SELECT testo, generato_il, errore FROM "${nomeSchema}".confronto_liquidatorio WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (risultato.rows.length === 0) {
      return { success: true, testo: null, generatoIl: null, errore: null };
    }
    const r = risultato.rows[0];
    return {
      success: true,
      testo: r.testo,
      generatoIl: r.generato_il ? r.generato_il.toString() : null,
      errore: r.errore,
    };
  } catch (error: any) {
    console.error('[ottieniConfrontoLiquidatorio] Errore:', error);
    return {
      success: false,
      testo: null,
      generatoIl: null,
      errore: `Impossibile leggere il confronto: ${error.message || error}`,
    };
  }
}

/** Chiamata a ogni chiusura di un livello del Brogliaccio Ricevente —
 * mai dal lancio della Relazione stessa. Silenziosa: un fallimento qui
 * non deve mai bloccare il Brogliaccio che l'ha invocata, viene solo
 * registrato per essere mostrato la prossima volta che si guarda il
 * confronto. Protetta dalla freschezza (24h): il Brogliaccio ha 3
 * livelli, non rifà la ricerca web 3 volte se l'utente li genera in
 * sequenza ravvicinata. */
export async function generaConfrontoLiquidatorioSeNecessarioAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number
): Promise<void> {
  try {
    if (!anthropic) return; // silenzioso — non è un'azione esplicita dell'utente
    if (!validaSchema(nomeSchema)) return;
    await assicuraTabellaConfrontoLiquidatorio(nomeSchema);

    const esistenteRis = await pool.query(
      `SELECT generato_il FROM "${nomeSchema}".confronto_liquidatorio WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (esistenteRis.rows.length > 0 && esistenteRis.rows[0].generato_il) {
      const oreTrascorse =
        (Date.now() - new Date(esistenteRis.rows[0].generato_il).getTime()) / (1000 * 60 * 60);
      if (oreTrascorse < ORE_FRESCHEZZA) return; // già fresco, nessuna ricerca necessaria
    }

    const [aziendaRis, limitiRis, debitiRis] = await Promise.all([
      ottieniAziendaPerId(nomeSchema, aziendaId),
      ottieniLimitiRicevibilita(nomeSchema, 'ENTE'),
      ottieniDebitiEnte(nomeSchema, aziendaId),
    ]);

    const azienda = aziendaRis.success ? aziendaRis.azienda : null;
    const limiteEnte = limitiRis.success ? limitiRis.limiti[0] : null;
    const saldoDebiti =
      debitiRis.success && debitiRis.righe.length > 0
        ? debitiRis.righe.reduce((acc, r) => acc + saldoRigaDebitoEnte(r), 0)
        : null;

    const prompt = `Sei un assistente che aiuta un ente creditore a valutare il criterio di convenienza previsto dagli artt. 63 e 88 del Codice della Crisi d'Impresa e dell'Insolvenza (CCII) — una proposta di composizione negoziata è ricevibile solo se offre al creditore non meno di quanto otterrebbe in una liquidazione giudiziale.

Cerca sul web, e usa nella risposta:
1. I tassi di recupero medi (recovery rate) tipici della liquidazione giudiziale in Italia per il settore ATECO dell'azienda${azienda?.codiceAteco ? ` (codice ${azienda.codiceAteco})` : ' (non specificato, usa dati generali per PMI italiane)'}, distinti per rango di credito se disponibili (privilegiato, chirografario).
2. I criteri legali più aggiornati su come si stima il valore di liquidazione giudiziale ai fini del test di convenienza ex artt. 63/88 CCII (es. orientamenti giurisprudenziali, prassi degli Esperti nella composizione negoziata).

DATI DELL'AZIENDA E DELL'ENTE:
${azienda ? `Azienda: ${azienda.ragioneSociale}, ATECO ${azienda.codiceAteco || 'non specificato'}.` : 'Azienda non identificata.'}
${saldoDebiti !== null ? `Saldo debitorio verso questo ente: € ${saldoDebiti.toLocaleString('it-IT')}.` : 'Saldo debitorio verso questo ente non ancora dichiarato.'}
${
  limiteEnte?.valoreLiquidazioneStimato !== null &&
  limiteEnte?.valoreLiquidazioneStimato !== undefined &&
  limiteEnte.valoreLiquidazioneStimato > 0
    ? `Valore di liquidazione già stimato manualmente per questo ente: € ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}.`
    : 'Nessun valore di liquidazione stimato manualmente per questo ente — stimalo tu dai tassi di recupero di settore trovati.'
}

Scrivi un paragrafo (200-350 parole, prosa continua, non elenchi puntati) intitolato "Confronto con lo scenario liquidatorio" che:
- Riporti i tassi di recupero di settore trovati, con la fonte.
- Stimi (o confermi, se già presente sopra) il valore che questo ente otterrebbe in liquidazione giudiziale.
- Richiami sinteticamente il criterio legale ex artt. 63/88 CCII.
Non dare un giudizio finale sulla ricevibilità di QUESTA specifica proposta — quello lo fa la piattaforma altrove con il numero effettivamente offerto: qui serve solo il termine di paragone (quanto si otterrebbe in liquidazione), non il confronto con l'offerta.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });

    // Con la ricerca web attiva, la risposta alterna blocchi di testo a
    // blocchi di ricerca (server_tool_use, web_search_tool_result) — un
    // solo .find() prenderebbe solo il primo pezzo di testo, perdendo
    // tutto quello scritto dopo l'ultima ricerca.
    const testo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!testo) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".confronto_liquidatorio (scenario_id, errore, generato_il)
         VALUES ($1, $2, now())
         ON CONFLICT (scenario_id) DO UPDATE SET errore = $2, generato_il = now()`,
        [scenarioId, 'La ricerca web non ha prodotto un testo leggibile.']
      );
      return;
    }

    await pool.query(
      `INSERT INTO "${nomeSchema}".confronto_liquidatorio (scenario_id, testo, generato_il, errore)
       VALUES ($1, $2, now(), NULL)
       ON CONFLICT (scenario_id) DO UPDATE SET testo = $2, generato_il = now(), errore = NULL`,
      [scenarioId, testo]
    );
  } catch (error: any) {
    console.error('[generaConfrontoLiquidatorioSeNecessarioAction] Errore (silenzioso):', error);
    try {
      await pool.query(
        `INSERT INTO "${nomeSchema}".confronto_liquidatorio (scenario_id, errore, generato_il)
         VALUES ($1, $2, now())
         ON CONFLICT (scenario_id) DO UPDATE SET errore = $2, generato_il = now()`,
        [scenarioId, `Errore durante la ricerca: ${error.message || error}`]
      );
    } catch {
      // Anche il salvataggio dell'errore può fallire — a quel punto
      // non c'è altro da fare che lasciare traccia nei log.
    }
  }
}

async function salvaConfronto(
  nomeSchema: string,
  scenarioId: number,
  testo: string | null,
  errore: string | null
): Promise<void> {
  if (testo) {
    await pool.query(
      `INSERT INTO "${nomeSchema}".confronto_liquidatorio (scenario_id, testo, generato_il, errore)
       VALUES ($1, $2, now(), NULL)
       ON CONFLICT (scenario_id) DO UPDATE SET testo = $2, generato_il = now(), errore = NULL`,
      [scenarioId, testo]
    );
  } else {
    await pool.query(
      `INSERT INTO "${nomeSchema}".confronto_liquidatorio (scenario_id, errore, generato_il)
       VALUES ($1, $2, now())
       ON CONFLICT (scenario_id) DO UPDATE SET errore = $2, generato_il = now()`,
      [scenarioId, errore]
    );
  }
}

/** Variante Redigente del confronto liquidatorio — stessa tabella,
 * stessa freschezza (24h) e stessa natura silenziosa, ma dal punto di
 * vista di chi redige la proposta per l'azienda debitrice verso TUTTI i
 * creditori (non un singolo ente). Il termine di paragone qui non è il
 * saldo verso un ente e i limiti di quell'ente (che per il Redigente non
 * esistono), ma la massa debitoria complessiva dai bilanci e i tassi di
 * recupero medi della liquidazione giudiziale per il settore. Invocata a
 * ogni generazione del Brogliaccio Redigente. */
export async function generaConfrontoLiquidatorioRedigenteSeNecessarioAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number
): Promise<void> {
  try {
    if (!anthropic) return; // silenzioso — non è un'azione esplicita dell'utente
    if (!validaSchema(nomeSchema)) return;
    await assicuraTabellaConfrontoLiquidatorio(nomeSchema);

    const esistenteRis = await pool.query(
      `SELECT generato_il FROM "${nomeSchema}".confronto_liquidatorio WHERE scenario_id = $1`,
      [scenarioId]
    );
    if (esistenteRis.rows.length > 0 && esistenteRis.rows[0].generato_il) {
      const oreTrascorse =
        (Date.now() - new Date(esistenteRis.rows[0].generato_il).getTime()) / (1000 * 60 * 60);
      if (oreTrascorse < ORE_FRESCHEZZA) return; // già fresco, nessuna ricerca necessaria
    }

    const [aziendaRis, storicoRis, posizioneRis] = await Promise.all([
      ottieniAziendaPerId(nomeSchema, aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
    ]);

    const azienda = aziendaRis.success ? aziendaRis.azienda : null;

    // Massa debitoria di riferimento: la Posizione Aggiornata se c'è (più
    // recente), altrimenti l'ultimo bilancio XBRL depositato.
    let totaleDebiti: number | null = null;
    if (posizioneRis.success && posizioneRis.esiste) {
      const d = posizioneRis.posizione.dati as { totaleDebiti?: number };
      if (typeof d.totaleDebiti === 'number' && d.totaleDebiti > 0) totaleDebiti = d.totaleDebiti;
    }
    if (totaleDebiti === null && storicoRis.success && storicoRis.storico.length > 0) {
      const ultimo = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      )[0];
      if (ultimo.datiFinanziari.totaleDebiti > 0) totaleDebiti = ultimo.datiFinanziari.totaleDebiti;
    }

    const prompt = `Sei un assistente che aiuta un professionista (commercialista) a redigere una proposta di composizione negoziata della crisi per conto di un'azienda debitrice, verso tutti i suoi creditori. Ti serve costruire il termine di paragone previsto dagli artt. 63 e 88 del Codice della Crisi d'Impresa e dell'Insolvenza (CCII): una proposta è sostenibile e difendibile solo se offre ai creditori non meno di quanto otterrebbero nella liquidazione giudiziale dell'azienda.

Cerca sul web, e usa nella risposta:
1. I tassi di recupero medi (recovery rate) tipici della liquidazione giudiziale in Italia per il settore ATECO dell'azienda${azienda?.codiceAteco ? ` (codice ${azienda.codiceAteco})` : ' (non specificato, usa dati generali per PMI italiane)'}, distinti per rango di credito se disponibili (privilegiato, chirografario).
2. I criteri legali più aggiornati su come si stima il valore di liquidazione giudiziale ai fini del test di convenienza ex artt. 63/88 CCII (orientamenti giurisprudenziali, prassi degli Esperti nella composizione negoziata).

DATI DELL'AZIENDA:
${azienda ? `Azienda: ${azienda.ragioneSociale}, ATECO ${azienda.codiceAteco || 'non specificato'}.` : 'Azienda non identificata.'}
${totaleDebiti !== null ? `Massa debitoria complessiva di riferimento: € ${totaleDebiti.toLocaleString('it-IT')}.` : 'Massa debitoria complessiva non ancora ricavabile dai dati caricati — ragiona in termini percentuali.'}

Scrivi un paragrafo (200-350 parole, prosa continua, non elenchi puntati) intitolato "Confronto con lo scenario liquidatorio" che:
- Riporti i tassi di recupero di settore trovati, con la fonte, distinti per rango dove possibile.
- Stimi il valore che i creditori otterrebbero complessivamente nella liquidazione giudiziale dell'azienda (in euro se la massa debitoria è nota, altrimenti in percentuale).
- Richiami sinteticamente il criterio legale ex artt. 63/88 CCII come vincolo minimo che la proposta dovrà rispettare.
Non dare un giudizio finale sulla convenienza della proposta concreta — le percentuali offerte riga per riga sono altrove: qui serve solo il termine di paragone (quanto si otterrebbe in liquidazione), che il professionista userà come pavimento nella costruzione della proposta.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });

    const testo = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    await salvaConfronto(
      nomeSchema,
      scenarioId,
      testo || null,
      testo ? null : 'La ricerca web non ha prodotto un testo leggibile.'
    );
  } catch (error: any) {
    console.error(
      '[generaConfrontoLiquidatorioRedigenteSeNecessarioAction] Errore (silenzioso):',
      error
    );
    try {
      await salvaConfronto(
        nomeSchema,
        scenarioId,
        null,
        `Errore durante la ricerca: ${error.message || error}`
      );
    } catch {
      // Anche il salvataggio dell'errore può fallire — resta nei log.
    }
  }
}
