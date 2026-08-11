'use server';

// Simulazione — raccoglie i dati REALI già presenti nello scenario
// (nessun nuovo inserimento manuale, a parte le tre leve) e applica il
// calcolo deterministico di src/lib/simulazione/calcolo.ts. L'output non
// si salva mai: solo le leve (input dell'operatore) sono persistite,
// il resto è sempre ricalcolato dal vivo.

import { pool } from '@/lib/db';
import { assicuraTabellaSimulazione } from '@/db/provision';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniPropostaScenario } from '@/app/actions/propostaScenario';
import {
  calcolaSimulazione,
  calcolaMesiCoperti,
  annualizzaPuntoStorico,
  LEVE_VUOTE,
  type LeveSimulazione,
  type RisultatoSimulazione,
  type PuntoStoricoAzienda,
} from '@/lib/simulazione/calcolo';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RisultatoInputSimulazione {
  success: boolean;
  risultato: RisultatoSimulazione | null;
  leve: LeveSimulazione;
  numeroPuntiStorici: number;
  settoreDisponibile: boolean;
  /** Se la Posizione Aggiornata copriva meno di 12 mesi, quanti — così l'interfaccia può dire chiaramente "annualizzato da un semestre" invece di far scoprire la cosa in silenzio. Null se non applicabile (nessuna Posizione Aggiornata, o senza data compilata). */
  mesiCopertiPosizioneAggiornata: number | null;
  /** true se la Posizione Aggiornata esiste ma non ha una data compilata — il dato è stato usato grezzo, senza poter annualizzare, e l'utente deve saperlo. */
  posizioneAggiornataSenzaData: boolean;
  error?: string;
}

export async function ottieniInputSimulazione(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoInputSimulazione> {
  const vuoto = {
    success: false as const,
    risultato: null,
    leve: LEVE_VUOTE,
    numeroPuntiStorici: 0,
    settoreDisponibile: false,
    mesiCopertiPosizioneAggiornata: null,
    posizioneAggiornataSenzaData: false,
  };
  try {
    if (!validaSchema(nomeSchema)) return { ...vuoto, error: 'Nome schema non valido.' };
    await assicuraTabellaSimulazione(nomeSchema);

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { ...vuoto, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const [storicoRis, posizioneRis, settoreRis, propostaRis, leveRis] = await Promise.all([
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
      ottieniDatiSettore(nomeSchema, aziendaId),
      ottieniPropostaScenario(nomeSchema, scenarioId),
      pool.query(
        `SELECT riduzione_costi_pct, riduzione_personale_pct, mesi_allungamento_rate, crescita_ricavi_manuale
         FROM "${nomeSchema}".simulazione_scenario WHERE scenario_id = $1`,
        [scenarioId]
      ),
    ]);

    const puntiStoriciAzienda: PuntoStoricoAzienda[] = [];
    if (storicoRis.success) {
      for (const bilancio of [...storicoRis.storico].sort(
        (a, b) => (a.annoBilancio || 0) - (b.annoBilancio || 0)
      )) {
        puntiStoriciAzienda.push({
          ricaviVendite: bilancio.datiFinanziari.ricaviVendite,
          ebitda: bilancio.datiFinanziari.ebitda,
          ebit: bilancio.datiFinanziari.ebit,
          ammortamenti: bilancio.datiFinanziari.ammortamenti,
        });
      }
    }
    // La Posizione Aggiornata è un bilancino di verifica a una data
    // precisa — se copre meno di 12 mesi (un trimestre, un semestre...),
    // confrontarla direttamente con un anno intero produce una crescita
    // o un crollo che non esiste nella realtà, è solo l'effetto di
    // periodi di lunghezza diversa. Annualizzo prima di usarla, non dopo.
    let mesiCopertiPosizioneAggiornata: number | null = null;
    if (posizioneRis.success && posizioneRis.esiste) {
      const puntoGrezzo = {
        ricaviVendite: posizioneRis.posizione.dati.ricaviVendite,
        ebitda: posizioneRis.posizione.dati.ebitda,
        ebit: posizioneRis.posizione.dati.ebit,
        ammortamenti: posizioneRis.posizione.dati.ammortamenti,
      };
      if (posizioneRis.posizione.dataRiferimento) {
        mesiCopertiPosizioneAggiornata = calcolaMesiCoperti(posizioneRis.posizione.dataRiferimento);
        puntiStoriciAzienda.push(
          annualizzaPuntoStorico(puntoGrezzo, mesiCopertiPosizioneAggiornata)
        );
      } else {
        // Nessuna data compilata: non si può annualizzare con sicurezza —
        // si usa il dato grezzo come prima, ma va segnalato in interfaccia.
        puntiStoriciAzienda.push(puntoGrezzo);
      }
    }

    if (puntiStoriciAzienda.length < 2) {
      return {
        ...vuoto,
        numeroPuntiStorici: puntiStoriciAzienda.length,
        settoreDisponibile: settoreRis.success && settoreRis.punti.length > 0,
        error:
          'Servono almeno due punti storici (XBRL e/o Posizione Aggiornata) per calcolare un trend — completa prima Import XBRL.',
      };
    }

    const righeProposta = propostaRis.success
      ? propostaRis.righe.map((r) => ({
          importoDovuto: r.importoDovuto,
          percentualeOfferta: r.percentualeOfferta,
          modalita: r.modalita,
          numeroRate: r.numeroRate,
        }))
      : [];

    const leveSalvate: LeveSimulazione =
      leveRis.rows.length > 0
        ? {
            riduzioneCostiPct: Number(leveRis.rows[0].riduzione_costi_pct),
            riduzionePersonalePct: Number(leveRis.rows[0].riduzione_personale_pct),
            mesiAllungamentoRate: Number(leveRis.rows[0].mesi_allungamento_rate),
            crescitaRicaviManuale:
              leveRis.rows[0].crescita_ricavi_manuale !== null &&
              leveRis.rows[0].crescita_ricavi_manuale !== undefined
                ? Number(leveRis.rows[0].crescita_ricavi_manuale)
                : null,
          }
        : LEVE_VUOTE;

    const settoreDisponibile = settoreRis.success && settoreRis.punti.length > 0;

    const risultato = calcolaSimulazione({
      puntiStoriciAzienda,
      puntiIstatSettore: settoreDisponibile ? settoreRis.punti : null,
      righeProposta,
      leve: leveSalvate,
    });

    return {
      success: true,
      risultato,
      leve: leveSalvate,
      numeroPuntiStorici: puntiStoriciAzienda.length,
      settoreDisponibile,
      mesiCopertiPosizioneAggiornata,
      posizioneAggiornataSenzaData:
        posizioneRis.success && posizioneRis.esiste && !posizioneRis.posizione.dataRiferimento,
    };
  } catch (error: any) {
    console.error('[ottieniInputSimulazione] Errore:', error);
    return { ...vuoto, error: `Impossibile calcolare la simulazione: ${error.message || error}` };
  }
}

export interface RisultatoOperazioneSimulazione {
  success: boolean;
  error?: string;
}

export async function salvaLeveSimulazioneAction(
  nomeSchema: string,
  scenarioId: number,
  leve: LeveSimulazione
): Promise<RisultatoOperazioneSimulazione> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (
      leve.riduzioneCostiPct < 0 ||
      leve.riduzioneCostiPct > 100 ||
      leve.riduzionePersonalePct < 0 ||
      leve.riduzionePersonalePct > 100
    ) {
      return { success: false, error: 'Le percentuali di riduzione devono essere tra 0 e 100.' };
    }
    if (leve.mesiAllungamentoRate < 0) {
      return { success: false, error: 'I mesi di allungamento non possono essere negativi.' };
    }

    await assicuraTabellaSimulazione(nomeSchema);
    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".simulazione_scenario
       SET riduzione_costi_pct = $2, riduzione_personale_pct = $3, mesi_allungamento_rate = $4, crescita_ricavi_manuale = $5, salvata_il = now()
       WHERE scenario_id = $1`,
      [
        scenarioId,
        leve.riduzioneCostiPct,
        leve.riduzionePersonalePct,
        leve.mesiAllungamentoRate,
        leve.crescitaRicaviManuale ?? null,
      ]
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".simulazione_scenario
           (scenario_id, riduzione_costi_pct, riduzione_personale_pct, mesi_allungamento_rate, crescita_ricavi_manuale, salvata_il)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          scenarioId,
          leve.riduzioneCostiPct,
          leve.riduzionePersonalePct,
          leve.mesiAllungamentoRate,
          leve.crescitaRicaviManuale ?? null,
        ]
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[salvaLeveSimulazioneAction] Errore:', error);
    return { success: false, error: `Impossibile salvare le leve: ${error.message || error}` };
  }
}
