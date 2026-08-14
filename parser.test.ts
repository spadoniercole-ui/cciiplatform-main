'use server';

// Brogliaccio — solo per gli scenari RICEVUTA. Si veda il commento in
// db/provision.ts (assicuraTabellaBrogliaccio) per la logica a 3
// livelli. Ogni "genera" raccoglie dati già presenti altrove in
// piattaforma e li scrive in un testo — nessun dato nuovo, solo
// aggregazione.

import { pool } from '@/lib/db';
import { assicuraTabellaBrogliaccio } from '@/db/provision';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import {
  ottieniPropostaScenario,
  verificaRicevibilitaProposta,
} from '@/app/actions/propostaScenario';
import { ottieniAnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
import { ottieniDebitiEnte } from '@/app/actions/debitiEnte';
import { ottieniEtichetteTipoDebito } from '@/app/actions/tipoDebitoConfig';
import { raggruppaPerTipoDebito } from '@/lib/debitiEnte/tipoDebito';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniScreeningAzienda } from '@/app/actions/screeningAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniAnalisiRiceventeAction } from '@/app/actions/simulazioneRicevente';
import { generaConfrontoLiquidatorioSeNecessarioAction } from '@/app/actions/confrontoLiquidatorio';
import {
  calcolaCrescitaStoricaAzienda,
  calcolaCrescitaStoricaSettore,
} from '@/lib/simulazione/calcolo';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

async function ottieniTipoSpazio(nomeSchema: string): Promise<'ENTE' | 'NON_ENTE'> {
  const r = await pool.query(`SELECT tipo_spazio FROM public.spazi WHERE nome_schema = $1`, [
    nomeSchema,
  ]);
  return r.rows[0]?.tipo_spazio || 'NON_ENTE';
}

export interface StatoBrogliaccio {
  livello1Testo: string | null;
  livello1GeneratoIl: string | null;
  livello2Richiesto: boolean;
  livello2Testo: string | null;
  livello2GeneratoIl: string | null;
  livello3Richiesto: boolean;
  livello3Testo: string | null;
  livello3GeneratoIl: string | null;
}

const STATO_VUOTO: StatoBrogliaccio = {
  livello1Testo: null,
  livello1GeneratoIl: null,
  livello2Richiesto: false,
  livello2Testo: null,
  livello2GeneratoIl: null,
  livello3Richiesto: false,
  livello3Testo: null,
  livello3GeneratoIl: null,
};

export interface RisultatoBrogliaccio {
  success: boolean;
  stato: StatoBrogliaccio;
  error?: string;
}

function mappaStato(r: Record<string, unknown>): StatoBrogliaccio {
  return {
    livello1Testo: (r.livello1_testo as string) || null,
    livello1GeneratoIl: (r.livello1_generato_il as string) || null,
    livello2Richiesto: !!r.livello2_richiesto,
    livello2Testo: (r.livello2_testo as string) || null,
    livello2GeneratoIl: (r.livello2_generato_il as string) || null,
    livello3Richiesto: !!r.livello3_richiesto,
    livello3Testo: (r.livello3_testo as string) || null,
    livello3GeneratoIl: (r.livello3_generato_il as string) || null,
  };
}

export async function ottieniBrogliaccio(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);
    const r = await pool.query(`SELECT * FROM "${nomeSchema}".brogliaccio WHERE scenario_id = $1`, [
      scenarioId,
    ]);
    if (r.rows.length === 0) return { success: true, stato: STATO_VUOTO };
    return { success: true, stato: mappaStato(r.rows[0]) };
  } catch (error: any) {
    console.error('[ottieniBrogliaccio] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile caricare: ${error.message || error}`,
    };
  }
}

// ============================================================================
// LIVELLO 1 — Posizione Ente + Proposta. Sempre generabile, primo giudizio.
// ============================================================================

export async function generaLivello1BrogliaccioAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);
    const tipoSpazio = await ottieniTipoSpazio(nomeSchema);
    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, stato: STATO_VUOTO, error: 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const [propostaRis, esitoRis, anagraficaRis, etichetteRis, debitiRis, etichetteTipoRis] =
      await Promise.all([
        ottieniPropostaScenario(nomeSchema, scenarioId),
        verificaRicevibilitaProposta(nomeSchema, scenarioId, tipoSpazio),
        ottieniAnagraficaEnte(nomeSchema, aziendaId),
        ottieniEtichetteAnagraficaEnte(nomeSchema),
        ottieniDebitiEnte(nomeSchema, aziendaId),
        ottieniEtichetteTipoDebito(nomeSchema),
      ]);

    const paragrafi: string[] = [];

    const campiCompilati = etichetteRis.success
      ? etichetteRis.etichette
          .filter((e) => e.attivo)
          .filter((e) => {
            const chiave = `campo${e.campo}` as keyof typeof anagraficaRis.dati;
            const valore = anagraficaRis.dati[chiave];
            return valore && String(valore).trim();
          })
      : [];
    paragrafi.push(
      `ANAGRAFICA ENTE: ${anagraficaRis.dati.idEnte ? `ID Ente ${anagraficaRis.dati.idEnte}. ` : ''}${campiCompilati.length} campo${campiCompilati.length === 1 ? '' : 'i'} compilat${campiCompilati.length === 1 ? 'o' : 'i'}.`
    );

    // La Check List dentro Posizione Ente è sparita come scheda a sé
    // (il questionario di Screening la sostituisce, mirato alle
    // direttrici di questo ente per questa azienda specifica) — questo
    // paragrafo leggeva da lì, ora legge lo Screening.
    const screeningRis = await ottieniScreeningAzienda(nomeSchema, aziendaId);
    if (screeningRis.success && screeningRis.stato.esiste) {
      const totaliDomande = screeningRis.stato.sezioni.reduce(
        (acc, s) => acc + s.domande.length,
        0
      );
      const risposteDate = screeningRis.stato.risposte.filter((r) => r.risposta !== null).length;
      const si = screeningRis.stato.risposte.filter((r) => r.risposta === true).length;
      const no = screeningRis.stato.risposte.filter((r) => r.risposta === false).length;
      paragrafi.push(
        risposteDate === totaliDomande && totaliDomande > 0
          ? `CHECK LIST (da Screening): questionario completato — ${si} affermative, ${no} negative su ${totaliDomande} domande.${screeningRis.stato.relazioneTesto ? ` Relazione preliminare già disponibile.` : ''}`
          : `CHECK LIST (da Screening): questionario in corso — ${risposteDate} di ${totaliDomande} domande risposte finora.`
      );
      if (screeningRis.stato.relazioneTesto) {
        paragrafi.push(
          `RELAZIONE DI SCREENING (preliminare):\n${screeningRis.stato.relazioneTesto}`
        );
      }
    } else {
      paragrafi.push(
        'CHECK LIST (da Screening): nessun questionario ancora generato per questa azienda.'
      );
    }

    if (debitiRis.success && debitiRis.righe.length > 0) {
      const mappaEtichette = etichetteTipoRis.success
        ? Object.fromEntries(etichetteTipoRis.etichette.map((e) => [e.codice, e.etichetta]))
        : {};
      const riepilogo = raggruppaPerTipoDebito(debitiRis.righe, mappaEtichette);
      const totaleLordo = riepilogo.reduce((acc, r) => acc + r.totale, 0);
      const totaleSaldo = riepilogo.reduce((acc, r) => acc + r.totaleSaldo, 0);
      paragrafi.push(
        totaleLordo === totaleSaldo
          ? `SITUAZIONE DEBITORIA DICHIARATA: € ${totaleSaldo.toLocaleString('it-IT')} su ${debitiRis.righe.length} voci.`
          : `SITUAZIONE DEBITORIA DICHIARATA: € ${totaleSaldo.toLocaleString('it-IT')} di saldo residuo (lordo € ${totaleLordo.toLocaleString('it-IT')}) su ${debitiRis.righe.length} voci.`
      );
    } else {
      paragrafi.push('SITUAZIONE DEBITORIA DICHIARATA: nessuna voce ancora inserita.');
    }

    const rigaRilevante = propostaRis.success
      ? propostaRis.righe.find((r) => r.rilevantePerEnte)
      : null;
    if (rigaRilevante && esitoRis.success && esitoRis.esito) {
      const esitoRiga = esitoRis.esito.righe.find((r) => r.id === rigaRilevante.id);
      paragrafi.push(
        `PROPOSTA: riga rilevante "${rigaRilevante.categoriaCreditore}", offerta ${rigaRilevante.percentualeOfferta}% su € ${rigaRilevante.importoDovuto.toLocaleString('it-IT')} dovuti (modalità ${rigaRilevante.modalita}). Esito: ${esitoRiga?.ricevibile ? 'RICEVIBILE' : 'NON RICEVIBILE'} — ${esitoRiga?.motivazione || 'motivazione non disponibile'}.`
      );
    } else {
      paragrafi.push(
        'PROPOSTA: nessuna riga ancora segnata come rilevante per questo ente — il giudizio di ricevibilità non è ancora disponibile.'
      );
    }

    const testo = paragrafi.join('\n\n');

    await pool.query(
      `INSERT INTO "${nomeSchema}".brogliaccio (scenario_id, livello1_testo, livello1_generato_il)
       VALUES ($1, $2, now())
       ON CONFLICT (scenario_id) DO UPDATE SET livello1_testo = $2, livello1_generato_il = now()`,
      [scenarioId, testo]
    );

    // Silenzioso, mai bloccante: un fallimento qui non deve impedire
    // di vedere il Brogliaccio appena generato. Solo Ricevente — è
    // l'unico percorso con un Brogliaccio reale oggi.
    if (tipoSpazio === 'ENTE') {
      await generaConfrontoLiquidatorioSeNecessarioAction(nomeSchema, scenarioId, aziendaId);
    }

    return await ottieniBrogliaccio(nomeSchema, scenarioId);
  } catch (error: any) {
    console.error('[generaLivello1BrogliaccioAction] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile generare: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Varco esplicito, per livello 2 o 3.
// ============================================================================

export async function impostaVarcoBrogliaccioAction(
  nomeSchema: string,
  scenarioId: number,
  livello: 2 | 3,
  richiesto: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaBrogliaccio(nomeSchema);
    const colonna = livello === 2 ? 'livello2_richiesto' : 'livello3_richiesto';
    await pool.query(
      `INSERT INTO "${nomeSchema}".brogliaccio (scenario_id, ${colonna}) VALUES ($1, $2)
       ON CONFLICT (scenario_id) DO UPDATE SET ${colonna} = $2`,
      [scenarioId, richiesto]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[impostaVarcoBrogliaccioAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}

// ============================================================================
// LIVELLO 2 — XBRL + Indici.
// ============================================================================

export async function generaLivello2BrogliaccioAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);
    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, stato: STATO_VUOTO, error: 'Scenario non trovato.' };
    }

    const [storicoRis, posizioneRis] = await Promise.all([
      ottieniStoricoXbrlAzienda(nomeSchema, scenarioRis.scenario.aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
    ]);

    const paragrafi: string[] = [];

    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ultimo = [...storicoRis.storico].sort(
        (a, b) => (b.annoBilancio || 0) - (a.annoBilancio || 0)
      )[0];
      paragrafi.push(
        `XBRL: ${storicoRis.storico.length} bilanci depositati. Ultimo — anno ${ultimo.annoBilancio ?? 'n/d'}: ricavi € ${ultimo.datiFinanziari.ricaviVendite.toLocaleString('it-IT')}, EBITDA € ${ultimo.datiFinanziari.ebitda.toLocaleString('it-IT')}, patrimonio netto € ${ultimo.datiFinanziari.patrimonioNetto.toLocaleString('it-IT')}, totale debiti € ${ultimo.datiFinanziari.totaleDebiti.toLocaleString('it-IT')}. Severità: ${ultimo.severity}.`
      );
      const indiciTesto = ultimo.indici
        .map((i) => `${i.nome} ${i.valore === 'N/D' ? 'N/D' : i.valore} (${i.esito})`)
        .join('; ');
      if (indiciTesto) paragrafi.push(`INDICI CCII: ${indiciTesto}.`);
    } else {
      paragrafi.push('XBRL: nessun bilancio ancora caricato per questa azienda.');
    }

    if (posizioneRis.success && posizioneRis.esiste) {
      paragrafi.push(
        `POSIZIONE AGGIORNATA: disponibile${posizioneRis.posizione.dataRiferimento ? ` alla data ${posizioneRis.posizione.dataRiferimento}` : ''}.`
      );
    }

    const testo = paragrafi.join('\n\n');

    await pool.query(
      `INSERT INTO "${nomeSchema}".brogliaccio (scenario_id, livello2_testo, livello2_generato_il)
       VALUES ($1, $2, now())
       ON CONFLICT (scenario_id) DO UPDATE SET livello2_testo = $2, livello2_generato_il = now()`,
      [scenarioId, testo]
    );

    // Silenzioso, mai bloccante — vedi commento in generaLivello1BrogliaccioAction.
    await generaConfrontoLiquidatorioSeNecessarioAction(
      nomeSchema,
      scenarioId,
      scenarioRis.scenario.aziendaId
    );

    return await ottieniBrogliaccio(nomeSchema, scenarioId);
  } catch (error: any) {
    console.error('[generaLivello2BrogliaccioAction] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile generare: ${error.message || error}`,
    };
  }
}

// ============================================================================
// LIVELLO 3 — Dati di Settore + Simulazione.
// ============================================================================

export async function generaLivello3BrogliaccioAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoBrogliaccio> {
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: STATO_VUOTO, error: 'Nome schema non valido.' };
    }
    await assicuraTabellaBrogliaccio(nomeSchema);
    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { success: false, stato: STATO_VUOTO, error: 'Scenario non trovato.' };
    }

    const [settoreRis, storicoRis, analisiRis] = await Promise.all([
      ottieniDatiSettore(nomeSchema, scenarioRis.scenario.aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, scenarioRis.scenario.aziendaId),
      ottieniAnalisiRiceventeAction(nomeSchema, scenarioId),
    ]);

    const paragrafi: string[] = [];

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

    if (analisiRis.success && analisiRis.analisi) {
      paragrafi.push(
        `SIMULAZIONE (lettura critica dei documenti allegati):\n${analisiRis.analisi}`
      );
    } else {
      paragrafi.push('SIMULAZIONE: nessuna analisi ancora generata per questo scenario.');
    }

    const testo = paragrafi.join('\n\n');

    await pool.query(
      `INSERT INTO "${nomeSchema}".brogliaccio (scenario_id, livello3_testo, livello3_generato_il)
       VALUES ($1, $2, now())
       ON CONFLICT (scenario_id) DO UPDATE SET livello3_testo = $2, livello3_generato_il = now()`,
      [scenarioId, testo]
    );

    // Silenzioso, mai bloccante — vedi commento in generaLivello1BrogliaccioAction.
    await generaConfrontoLiquidatorioSeNecessarioAction(
      nomeSchema,
      scenarioId,
      scenarioRis.scenario.aziendaId
    );

    return await ottieniBrogliaccio(nomeSchema, scenarioId);
  } catch (error: any) {
    console.error('[generaLivello3BrogliaccioAction] Errore:', error);
    return {
      success: false,
      stato: STATO_VUOTO,
      error: `Impossibile generare: ${error.message || error}`,
    };
  }
}
