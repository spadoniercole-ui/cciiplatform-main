'use server';

// Inquadramento della proposta: strumento scelto, data di deposito, quota
// degli altri creditori aderenti (correzione a mano) e adesione riga per
// riga. Sono i dati da cui dipende quale regola del registro delle fonti si
// applica — la composizione delle regole e' logica pura, in
// src/lib/proposta/inquadramento.ts, e gira nel browser mentre si compila.
//
// Qui solo lettura e scrittura. Mai eccezioni oltre il confine della Server
// Action: sempre { success, error? }.

import { pool } from '@/lib/db';
import { assicuraTabellaProposta, assicuraTabelleParametriSpazio } from '@/db/provision';
import { verificaScenarioNonBloccato } from '@/app/actions/scenari';
import {
  adesioneValida,
  dataIsoValida,
  enteCreditoreDaEnteSpazio,
  nomeIndicaCreditorePubblico,
  strumentoValido,
  type AdesioneRiga,
  type StrumentoProposta,
} from '@/lib/proposta/inquadramento';
import type { EnteCreditore } from '@/lib/registroFonti/regole';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface RigaInquadramento {
  id: number;
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  adesione: AdesioneRiga | null;
  importoAderente: number | null;
  /**
   * Proposta di classificazione, MAI salvata da sola: la categoria e'
   * collegata a un ente pubblico nei Limiti di Ricevibilita', oppure e' la
   * riga rilevante per l'ente. L'operatore la conferma salvando.
   */
  adesioneSuggerita: AdesioneRiga | null;
  /** Da dove viene la proposta: mappatura dei Limiti, riga rilevante per l'ente, nome della categoria. */
  origineSuggerimento: 'MAPPATURA' | 'RILEVANTE' | 'NOME' | null;
}

export interface DatiInquadramento {
  strumento: StrumentoProposta | null;
  dataDeposito: string | null;
  quotaManuale: number | null;
  righe: RigaInquadramento[];
  /** Ente dello spazio (solo spazi ENTE configurati senza ambiguita'). */
  enteSpazio: EnteCreditore | null;
  solaLettura: boolean;
}

export interface RisultatoInquadramento {
  success: boolean;
  dati?: DatiInquadramento;
  error?: string;
}

const ENTI_PUBBLICI = ['INPS', 'INAIL', 'AGENZIA_ENTRATE', 'AGENZIA_RISCOSSIONE'];

export async function ottieniInquadramentoPropostaAction(
  nomeSchema: string,
  scenarioId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoInquadramento> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabellaProposta(nomeSchema);
    await assicuraTabelleParametriSpazio(nomeSchema);

    const scenario = await pool.query(
      `SELECT strumento_proposta, data_deposito_proposta, quota_altri_aderenti_manuale, bloccato_il
         FROM "${nomeSchema}".scenari WHERE id = $1`,
      [scenarioId]
    );
    if (scenario.rows.length === 0) return { success: false, error: 'Scenario non trovato.' };
    const sc = scenario.rows[0];

    const limiti = await pool.query(
      `SELECT categoria_creditore, alias, ente_25novies FROM "${nomeSchema}".limiti_ricevibilita`
    );
    // Categoria (o alias) -> ente pubblico, senza distinzione di maiuscole.
    const entePerNome = new Map<string, string>();
    for (const l of limiti.rows) {
      if (!l.ente_25novies) continue;
      entePerNome.set(String(l.categoria_creditore).trim().toLowerCase(), String(l.ente_25novies));
      for (const a of (l.alias as string[] | null) || []) {
        entePerNome.set(String(a).trim().toLowerCase(), String(l.ente_25novies));
      }
    }

    let enteSpazio: EnteCreditore | null = null;
    if (tipoSpazio === 'ENTE') {
      const distinti = Array.from(
        new Set(limiti.rows.filter((l) => l.ente_25novies).map((l) => String(l.ente_25novies)))
      );
      // Piu' enti diversi = spazio ambiguo: non si sceglie per conto proprio.
      enteSpazio = distinti.length === 1 ? enteCreditoreDaEnteSpazio(distinti[0]) : null;
    }

    const righe = await pool.query(
      `SELECT id, categoria_creditore, importo_dovuto, percentuale_offerta, adesione, importo_aderente, rilevante_per_ente
         FROM "${nomeSchema}".proposta_creditori WHERE scenario_id = $1 ORDER BY id ASC`,
      [scenarioId]
    );

    return {
      success: true,
      dati: {
        strumento: strumentoValido(sc.strumento_proposta) ? sc.strumento_proposta : null,
        dataDeposito: sc.data_deposito_proposta ? String(sc.data_deposito_proposta) : null,
        quotaManuale:
          sc.quota_altri_aderenti_manuale === null || sc.quota_altri_aderenti_manuale === undefined
            ? null
            : Number(sc.quota_altri_aderenti_manuale),
        enteSpazio,
        solaLettura: !!sc.bloccato_il,
        righe: righe.rows.map((r) => {
          const enteCategoria = entePerNome.get(String(r.categoria_creditore).trim().toLowerCase());
          const pubblicoPerMappatura = !!enteCategoria && ENTI_PUBBLICI.includes(enteCategoria);
          const pubblicoPerRilevanza = tipoSpazio === 'ENTE' && r.rilevante_per_ente === true;
          const origine = pubblicoPerMappatura
            ? ('MAPPATURA' as const)
            : pubblicoPerRilevanza
              ? ('RILEVANTE' as const)
              : nomeIndicaCreditorePubblico(String(r.categoria_creditore))
                ? ('NOME' as const)
                : null;
          return {
            id: r.id,
            categoriaCreditore: r.categoria_creditore,
            importoDovuto: Number(r.importo_dovuto),
            percentualeOfferta: Number(r.percentuale_offerta),
            adesione: adesioneValida(r.adesione) ? r.adesione : null,
            importoAderente:
              r.importo_aderente === null || r.importo_aderente === undefined
                ? null
                : Number(r.importo_aderente),
            adesioneSuggerita: origine ? ('PUBBLICO' as const) : null,
            origineSuggerimento: origine,
          };
        }),
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniInquadramentoPropostaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile caricare l'inquadramento della proposta: ${(error as Error).message || error}`,
    };
  }
}

export interface DatiSalvataggioInquadramento {
  strumento: string | null;
  dataDeposito: string | null;
  /** 0..1; null = usa il valore calcolato dalle righe. */
  quotaManuale: number | null;
  adesioni: { id: number; adesione: string | null; importoAderente: number | null }[];
}

export async function salvaInquadramentoPropostaAction(
  nomeSchema: string,
  scenarioId: number,
  dati: DatiSalvataggioInquadramento
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };

    if (dati.strumento !== null && !strumentoValido(dati.strumento)) {
      return { success: false, error: 'Strumento non riconosciuto.' };
    }
    if (dati.dataDeposito !== null && !dataIsoValida(dati.dataDeposito)) {
      return { success: false, error: 'Data di deposito non valida.' };
    }
    if (
      dati.quotaManuale !== null &&
      !(Number.isFinite(dati.quotaManuale) && dati.quotaManuale >= 0 && dati.quotaManuale <= 1)
    ) {
      return { success: false, error: 'La quota degli altri aderenti deve essere tra 0 e 100%.' };
    }
    for (const a of dati.adesioni) {
      if (a.adesione !== null && !adesioneValida(a.adesione)) {
        return { success: false, error: 'Adesione non riconosciuta.' };
      }
      if (
        a.importoAderente !== null &&
        !(Number.isFinite(a.importoAderente) && a.importoAderente >= 0)
      ) {
        return { success: false, error: 'L’importo aderente non può essere negativo.' };
      }
    }

    await assicuraTabellaProposta(nomeSchema);

    await pool.query(
      `UPDATE "${nomeSchema}".scenari
          SET strumento_proposta = $1, data_deposito_proposta = $2, quota_altri_aderenti_manuale = $3
        WHERE id = $4`,
      [dati.strumento, dati.dataDeposito, dati.quotaManuale, scenarioId]
    );

    for (const a of dati.adesioni) {
      // L'importo aderente ha senso solo per chi aderisce: altrimenti si azzera,
      // per non lasciare un numero orfano che riemerge cambiando la scelta.
      const importo = a.adesione === 'ADERENTE' ? a.importoAderente : null;
      await pool.query(
        `UPDATE "${nomeSchema}".proposta_creditori
            SET adesione = $1, importo_aderente = $2
          WHERE id = $3 AND scenario_id = $4`,
        [a.adesione, importo, a.id, scenarioId]
      );
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('[salvaInquadramentoPropostaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare l'inquadramento della proposta: ${(error as Error).message || error}`,
    };
  }
}
