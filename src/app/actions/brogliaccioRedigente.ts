'use server';

// Brogliaccio Redigente — solo scenari NON RICEVUTA (percorso di chi
// redige la proposta). A differenza del Brogliaccio Ricevente (3
// livelli con varchi, pensato per chi VALUTA una proposta ricevuta),
// qui è una sintesi unica: raccoglie in ordine tutto quanto acquisito
// lungo il percorso Redigente (anagrafica, XBRL e indici, posizione
// aggiornata, Check List Ministeriale, Test pratico, dati di settore,
// simulazione) come punto di partenza per scrivere la Proposta — che
// nel percorso Redigente viene dopo, non prima. Nessun dato nuovo: solo
// aggregazione e presentazione ordinata di quanto c'è già.
//
// Riusa la stessa tabella `brogliaccio` del Ricevente scrivendo nel
// campo livello1_testo (il Redigente non ha i tre livelli): così
// `ottieniBrogliaccio` e la lettura restano una sola implementazione.

import { pool } from '@/lib/db';
import { assicuraTabellaBrogliaccio } from '@/db/provision';
import {
  ottieniBrogliaccio,
  type RisultatoBrogliaccio,
  type StatoBrogliaccio,
} from '@/app/actions/brogliaccio';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniRisposteChecklist } from '@/app/actions/checklist';
import { MODELLO_MINISTERIALE } from '@/lib/checklist/costanti';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';
import { calcolaQuadroQualitativo, type RispostaPerCalcolo } from '@/lib/checklist/scoring';
import { ottieniTestPraticoAzienda } from '@/app/actions/testPraticoAzienda';
import { ottieniInputRedigente } from '@/app/actions/simulazioneRedigente';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import {
  calcolaCrescitaStoricaAzienda,
  calcolaCrescitaStoricaSettore,
} from '@/lib/simulazione/calcolo';
import { generaConfrontoLiquidatorioRedigenteSeNecessarioAction } from '@/app/actions/confrontoLiquidatorio';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

const EURO = (n: number) => `€ ${Math.round(n).toLocaleString('it-IT')}`;

// Stato vuoto locale: quello di brogliaccio.ts non è esportabile (file
// 'use server', può esportare solo funzioni async).
const STATO_VUOTO_BROGLIACCIO: StatoBrogliaccio = {
  livello1Testo: null,
  livello1GeneratoIl: null,
  livello2Richiesto: false,
  livello2Testo: null,
  livello2GeneratoIl: null,
  livello3Richiesto: false,
  livello3Testo: null,
  livello3GeneratoIl: null,
};

export async function generaBrogliaccioRedigenteAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO_BROGLIACCIO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, stato: STATO_VUOTO_BROGLIACCIO, error: 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const [
      aziendaRis,
      storicoRis,
      posizioneRis,
      risposteRis,
      testoPraticoRis,
      simulazioneRis,
      settoreRis,
    ] = await Promise.all([
      ottieniAziendaPerId(nomeSchema, aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
      ottieniRisposteChecklist(nomeSchema, scenarioId, MODELLO_MINISTERIALE),
      ottieniTestPraticoAzienda(nomeSchema, aziendaId),
      ottieniInputRedigente(nomeSchema, scenarioId),
      ottieniDatiSettore(nomeSchema, aziendaId),
    ]);

    const paragrafi: string[] = [];

    // 1. Anagrafica azienda
    if (aziendaRis.success && aziendaRis.azienda) {
      const a = aziendaRis.azienda;
      paragrafi.push(
        `AZIENDA: ${a.ragioneSociale}${a.codiceAteco ? `, ATECO ${a.codiceAteco}` : ''}.`
      );
    } else {
      paragrafi.push('AZIENDA: anagrafica non disponibile.');
    }

    // 2. XBRL + Indici
    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ultimo = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      )[0];
      const d = ultimo.datiFinanziari;
      paragrafi.push(
        `XBRL: ${storicoRis.storico.length} bilanci depositati. Ultimo — anno ${ultimo.annoBilancio ?? 'n/d'}: ricavi ${EURO(d.ricaviVendite)}, EBITDA ${EURO(d.ebitda)}, patrimonio netto ${EURO(d.patrimonioNetto)}, totale debiti ${EURO(d.totaleDebiti)}. Severità CCII: ${ultimo.severity}.`
      );
      const indiciTesto = ultimo.indici
        .map((i) => `${i.nome} ${i.valore === 'N/D' ? 'N/D' : i.valore} (${i.esito})`)
        .join('; ');
      if (indiciTesto) paragrafi.push(`INDICI CCII: ${indiciTesto}.`);
    } else {
      paragrafi.push('XBRL: nessun bilancio ancora caricato per questa azienda.');
    }

    // 3. Posizione Aggiornata
    if (posizioneRis.success && posizioneRis.esiste) {
      paragrafi.push(
        `POSIZIONE AGGIORNATA: disponibile${posizioneRis.posizione.dataRiferimento ? ` alla data ${posizioneRis.posizione.dataRiferimento}` : ''}.`
      );
    } else {
      paragrafi.push('POSIZIONE AGGIORNATA: non ancora caricata per questo scenario.');
    }

    // 4. Check List Ministeriale (a livello scenario)
    if (risposteRis.success) {
      const risposte = risposteRis.risposte;
      const risposteDate = risposte.filter((r) => r.risposta !== null).length;
      const totaleDomande = CHECKLIST_MINISTERIALE.reduce((acc, s) => acc + s.domande.length, 0);
      const mappa: Record<string, RispostaPerCalcolo> = {};
      for (const r of risposte)
        mappa[r.domandaId] = { domandaId: r.domandaId, risposta: r.risposta };
      const quadro = calcolaQuadroQualitativo(CHECKLIST_MINISTERIALE, mappa);
      paragrafi.push(
        `CHECK LIST MINISTERIALE: ${risposteDate}/${totaleDomande} risposte — esito "${quadro.etichetta}".`
      );
    } else {
      paragrafi.push('CHECK LIST MINISTERIALE: non ancora compilata per questo scenario.');
    }

    // 5. Test pratico (Sezione I) — a livello azienda
    if (testoPraticoRis.success && testoPraticoRis.stato.compilato) {
      const r = testoPraticoRis.stato.risultato;
      paragrafi.push(
        `TEST PRATICO (Sezione I): fascia "${r.etichetta}" — rapporto A/B ${r.rapporto === null ? 'non applicabile (disequilibrio a regime)' : r.rapporto.toFixed(2).replace('.', ',')} (debito da ristrutturare ${EURO(r.totaleA)}, flussi annui a regime ${EURO(r.totaleB)}). ${r.puntoSuccessivo}.`
      );
    } else {
      paragrafi.push(
        'TEST PRATICO (Sezione I): non ancora compilato — si imposta nella scheda Check List dell’azienda.'
      );
    }

    // 6. Dati di Settore
    if (settoreRis.success && settoreRis.punti.length > 0 && storicoRis.success) {
      const crescitaSettore = calcolaCrescitaStoricaSettore(settoreRis.punti);
      const puntiAzienda = [...storicoRis.storico]
        .sort((a, b) => (a.annoBilancio || 0) - (b.annoBilancio || 0))
        .map((b) => ({
          ricaviVendite: b.datiFinanziari.ricaviVendite,
          ebitda: b.datiFinanziari.ebitda,
          ebit: b.datiFinanziari.ebit,
          ammortamenti: b.datiFinanziari.ammortamenti,
        }));
      const crescitaAzienda = calcolaCrescitaStoricaAzienda(puntiAzienda);
      paragrafi.push(
        `DATI DI SETTORE (gruppo ATECO ${settoreRis.info?.gruppo || 'n/d'}): crescita storica del settore ${crescitaSettore !== null ? (crescitaSettore * 100).toFixed(1) + '%' : 'non disponibile'} l'anno, crescita storica dell'azienda ${crescitaAzienda !== null ? (crescitaAzienda * 100).toFixed(1) + '%' : 'non disponibile'} l'anno.`
      );
    } else {
      paragrafi.push('DATI DI SETTORE: non ancora disponibili per questa azienda.');
    }

    // 7. Simulazione Redigente
    if (simulazioneRis.success && simulazioneRis.risultato) {
      const s = simulazioneRis.risultato;
      paragrafi.push(
        `SIMULAZIONE: flusso annuo disponibile ${EURO(s.flussoDisponibile)}, rata annua ${EURO(s.rataAnnua)}, DSCR ${s.dscr === null ? 'n/d' : s.dscr.toFixed(2).replace('.', ',')} — piano ${s.viabile ? 'sostenibile con le leve attuali' : 'non ancora sostenibile: le leve vanno riviste'}.`
      );
    } else {
      paragrafi.push('SIMULAZIONE: nessuna simulazione ancora impostata per questo scenario.');
    }

    const testo = paragrafi.join('\n\n');

    await pool.query(
      `INSERT INTO "${nomeSchema}".brogliaccio (scenario_id, livello1_testo, livello1_generato_il)
       VALUES ($1, $2, now())
       ON CONFLICT (scenario_id) DO UPDATE SET livello1_testo = $2, livello1_generato_il = now()`,
      [scenarioId, testo]
    );

    // Silenzioso, mai bloccante: il confronto con lo scenario
    // liquidatorio (ricerca web reale) parte qui, come per il Ricevente,
    // e viene "parcheggiato" — la Relazione lo leggerà già pronto.
    await generaConfrontoLiquidatorioRedigenteSeNecessarioAction(nomeSchema, scenarioId, aziendaId);

    return await ottieniBrogliaccio(nomeSchema, scenarioId);
  } catch (error: any) {
    console.error('[generaBrogliaccioRedigenteAction] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO_BROGLIACCIO,
      error: `Impossibile generare il Brogliaccio: ${error.message || error}`,
    };
  }
}
