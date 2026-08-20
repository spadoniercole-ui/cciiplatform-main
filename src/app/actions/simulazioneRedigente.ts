'use server';

// Simulazione Redigente — fotografia iniziale presa dai dati già in
// piattaforma (XBRL/Posizione Aggiornata/Proposta), leve salvabili per
// scenario. Stesso principio delle altre azioni Simulazione: l'output
// non si salva mai, solo l'input — il calcolo (calcoloRedigente.ts) è
// sempre ricalcolato dal vivo sui dati correnti.

import { pool } from '@/lib/db';
import { assicuraTabellaSimulazioneRedigente } from '@/db/provision';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniPropostaScenario } from '@/app/actions/propostaScenario';
import { calcolaMesiCoperti } from '@/lib/simulazione/calcolo';
import {
  calcolaRedigente,
  ALIQUOTE_PERSONALE_DEFAULT,
  type InputRedigente,
  type RisultatoRedigente,
  type PersonalePerCategoria,
  type AliquotePerCategoria,
} from '@/lib/simulazione/calcoloRedigente';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

const PERSONALE_VUOTO: PersonalePerCategoria = {
  operai: { numero: 0, retribuzioneLordaMensileMedia: 0 },
  impiegati: { numero: 0, retribuzioneLordaMensileMedia: 0 },
  quadri: { numero: 0, retribuzioneLordaMensileMedia: 0 },
  dirigenti: { numero: 0, retribuzioneLordaMensileMedia: 0 },
};

export interface LeveRedigente {
  costiProduzioneAltri: number;
  personale: PersonalePerCategoria;
  aliquotePersonale: AliquotePerCategoria;
  giorniMediIncassoClienti: number;
  giorniMediPagamentoFornitori: number;
  giorniBaseline: number;
  aliquotaImposteSulReddito: number;
  aliquotaIrap: number;
  numeroRateMedie: number;
}

export interface FotografiaInizialeRedigente {
  valoreProduzione: number;
  costiProduzioneStorico: number;
  ammortamenti: number;
  patrimonioNetto: number;
  totaleDebiti: number;
  totaleDebitiProposta: number;
  numeroPuntiStorici: number;
}

export interface RisultatoInputRedigente {
  success: boolean;
  risultato: RisultatoRedigente | null;
  leve: LeveRedigente;
  fotografia: FotografiaInizialeRedigente | null;
  /** Input completo passato a calcolaRedigente — esposto per riusarlo
   * nelle raccomandazioni azionabili (calcolaRaccomandazioniRedigente) e
   * nella Relazione, senza rimontarlo da leve + fotografia. */
  input: InputRedigente | null;
  error?: string;
}

export async function ottieniInputRedigente(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoInputRedigente> {
  const leveVuote: LeveRedigente = {
    costiProduzioneAltri: 0,
    personale: PERSONALE_VUOTO,
    aliquotePersonale: ALIQUOTE_PERSONALE_DEFAULT,
    giorniMediIncassoClienti: 30,
    giorniMediPagamentoFornitori: 30,
    giorniBaseline: 30,
    aliquotaImposteSulReddito: 43,
    aliquotaIrap: 3.9,
    numeroRateMedie: 84,
  };
  const vuoto = {
    success: false as const,
    risultato: null,
    leve: leveVuote,
    fotografia: null,
    input: null,
  };

  try {
    if (!validaSchema(nomeSchema)) return { ...vuoto, error: 'Nome schema non valido.' };
    await assicuraTabellaSimulazioneRedigente(nomeSchema);

    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { ...vuoto, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const [storicoRis, posizioneRis, propostaRis, leveRis] = await Promise.all([
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
      ottieniPropostaScenario(nomeSchema, scenarioId),
      pool.query(
        `SELECT costi_produzione_altri, personale, aliquote_personale, giorni_incasso_clienti,
                giorni_pagamento_fornitori, giorni_baseline, aliquota_imposte_reddito,
                aliquota_irap, numero_rate_medie
         FROM "${nomeSchema}".simulazione_redigente WHERE scenario_id = $1`,
        [scenarioId]
      ),
    ]);

    let numeroPuntiStorici = 0;
    let fotografia: FotografiaInizialeRedigente | null = null;

    const bilanciOrdinati = storicoRis.success
      ? [...storicoRis.storico].sort((a, b) => (a.annoBilancio || 0) - (b.annoBilancio || 0))
      : [];
    numeroPuntiStorici += bilanciOrdinati.length;

    let datiBase =
      bilanciOrdinati.length > 0
        ? bilanciOrdinati[bilanciOrdinati.length - 1].datiFinanziari
        : null;
    let fattoreAnnualizzazione = 1;

    if (posizioneRis.success && posizioneRis.esiste) {
      numeroPuntiStorici += 1;
      datiBase = posizioneRis.posizione.dati;
      if (posizioneRis.posizione.dataRiferimento) {
        const mesi = calcolaMesiCoperti(posizioneRis.posizione.dataRiferimento);
        fattoreAnnualizzazione = mesi < 12 ? 12 / mesi : 1;
      }
    }

    if (datiBase) {
      fotografia = {
        valoreProduzione: datiBase.valoreProduzione * fattoreAnnualizzazione,
        costiProduzioneStorico: datiBase.costiProduzione * fattoreAnnualizzazione,
        ammortamenti: datiBase.ammortamenti * fattoreAnnualizzazione,
        patrimonioNetto: datiBase.patrimonioNetto,
        totaleDebiti: datiBase.totaleDebiti,
        totaleDebitiProposta: 0,
        numeroPuntiStorici,
      };
    }

    if (propostaRis.success && fotografia) {
      fotografia.totaleDebitiProposta = propostaRis.righe.reduce(
        (acc, r) => acc + (r.importoDovuto * r.percentualeOfferta) / 100,
        0
      );
    }

    const leve: LeveRedigente =
      leveRis.rows.length > 0
        ? {
            costiProduzioneAltri: Number(leveRis.rows[0].costi_produzione_altri) || 0,
            personale: leveRis.rows[0].personale || PERSONALE_VUOTO,
            aliquotePersonale: leveRis.rows[0].aliquote_personale || ALIQUOTE_PERSONALE_DEFAULT,
            giorniMediIncassoClienti: Number(leveRis.rows[0].giorni_incasso_clienti),
            giorniMediPagamentoFornitori: Number(leveRis.rows[0].giorni_pagamento_fornitori),
            giorniBaseline: Number(leveRis.rows[0].giorni_baseline),
            aliquotaImposteSulReddito: Number(leveRis.rows[0].aliquota_imposte_reddito),
            aliquotaIrap: Number(leveRis.rows[0].aliquota_irap),
            numeroRateMedie: Number(leveRis.rows[0].numero_rate_medie),
          }
        : {
            ...leveVuote,
            costiProduzioneAltri: fotografia?.costiProduzioneStorico || 0,
          };

    if (!fotografia) {
      return {
        ...vuoto,
        leve,
        error: 'Nessun dato storico disponibile — completa prima Import XBRL.',
      };
    }

    const input: InputRedigente = {
      valoreProduzione: fotografia.valoreProduzione,
      costiProduzioneAltri: leve.costiProduzioneAltri,
      ammortamenti: fotografia.ammortamenti,
      personale: leve.personale,
      aliquotePersonale: leve.aliquotePersonale,
      giorniMediIncassoClienti: leve.giorniMediIncassoClienti,
      giorniMediPagamentoFornitori: leve.giorniMediPagamentoFornitori,
      giorniBaseline: leve.giorniBaseline,
      aliquotaImposteSulReddito: leve.aliquotaImposteSulReddito,
      aliquotaIrap: leve.aliquotaIrap,
      totaleDebitiProposta: fotografia.totaleDebitiProposta,
      numeroRateMedie: leve.numeroRateMedie,
      totaleDebiti: fotografia.totaleDebiti,
      patrimonioNetto: fotografia.patrimonioNetto,
    };

    return { success: true, risultato: calcolaRedigente(input), leve, fotografia, input };
  } catch (error: any) {
    console.error('[ottieniInputRedigente] Errore:', error);
    return { ...vuoto, error: `Impossibile calcolare: ${error.message || error}` };
  }
}

export interface RisultatoOperazioneRedigente {
  success: boolean;
  error?: string;
}

export async function salvaLeveRedigenteAction(
  nomeSchema: string,
  scenarioId: number,
  leve: LeveRedigente
): Promise<RisultatoOperazioneRedigente> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    await assicuraTabellaSimulazioneRedigente(nomeSchema);
    const parametri = [
      scenarioId,
      leve.costiProduzioneAltri,
      JSON.stringify(leve.personale),
      JSON.stringify(leve.aliquotePersonale),
      leve.giorniMediIncassoClienti,
      leve.giorniMediPagamentoFornitori,
      leve.giorniBaseline,
      leve.aliquotaImposteSulReddito,
      leve.aliquotaIrap,
      leve.numeroRateMedie,
    ];

    const aggiornata = await pool.query(
      `UPDATE "${nomeSchema}".simulazione_redigente
       SET costi_produzione_altri = $2, personale = $3, aliquote_personale = $4,
           giorni_incasso_clienti = $5, giorni_pagamento_fornitori = $6, giorni_baseline = $7,
           aliquota_imposte_reddito = $8, aliquota_irap = $9, numero_rate_medie = $10, salvata_il = now()
       WHERE scenario_id = $1`,
      parametri
    );
    if (aggiornata.rowCount === 0) {
      await pool.query(
        `INSERT INTO "${nomeSchema}".simulazione_redigente
           (scenario_id, costi_produzione_altri, personale, aliquote_personale, giorni_incasso_clienti,
            giorni_pagamento_fornitori, giorni_baseline, aliquota_imposte_reddito, aliquota_irap,
            numero_rate_medie, salvata_il)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        parametri
      );
    }
    return { success: true };
  } catch (error: any) {
    console.error('[salvaLeveRedigenteAction] Errore:', error);
    return { success: false, error: `Impossibile salvare: ${error.message || error}` };
  }
}
