'use server';

// Test pratico per la ragionevole perseguibilità del risanamento
// (art. 13, comma 2 CCII — Sezione I del documento guida ministeriale)
// a livello Azienda — solo Redigente. Fa da premessa alla Check List
// Ministeriale (Sezione II): il rapporto tra debito da ristrutturare
// [A] e flussi annui a regime [B] colloca l'azienda in una fascia di
// gravità che dice quanto sia centrale il piano d'impresa (cioè la
// Check List) nel percorso di risanamento.
//
// Il motore di calcolo (calcolaTestPratico) è puro e vive in
// src/lib/testPratico/calcolo.ts, verificato da test unitari: qui si
// occupa solo di persistere gli input e restituire il risultato
// ricalcolato, così fascia e rapporto non possono mai andare fuori
// sincrono con i numeri inseriti.

import { pool } from '@/lib/db';
import { assicuraTabelleScenari } from '@/db/provision';
import {
  calcolaTestPratico,
  DATI_DEBITO_VUOTI,
  DATI_FLUSSI_VUOTI,
  type DatiDebitoRistrutturare,
  type DatiFlussiARegime,
  type RisultatoTestPratico,
} from '@/lib/testPratico/calcolo';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export interface StatoTestPraticoAzienda {
  debito: DatiDebitoRistrutturare;
  flussi: DatiFlussiARegime;
  risultato: RisultatoTestPratico;
  /** true se esiste già una riga salvata per questa azienda — se false, il
   * risultato mostrato è quello dei valori a zero, non un dato compilato. */
  compilato: boolean;
}

/** Le colonne del DB tornano come stringhe (NUMERIC di Postgres): un
 * cast esplicito, mai un affidarsi al parsing implicito. */
function num(valore: unknown): number {
  const n = typeof valore === 'number' ? valore : parseFloat(String(valore));
  return Number.isFinite(n) ? n : 0;
}

export async function ottieniTestPraticoAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; stato: StatoTestPraticoAzienda; error?: string }> {
  const statoVuoto: StatoTestPraticoAzienda = {
    debito: { ...DATI_DEBITO_VUOTI },
    flussi: { ...DATI_FLUSSI_VUOTI },
    risultato: calcolaTestPratico(DATI_DEBITO_VUOTI, DATI_FLUSSI_VUOTI),
    compilato: false,
  };
  try {
    if (!validaSchema(nomeSchema)) {
      return { success: false, stato: statoVuoto, error: 'Nome schema non valido.' };
    }
    await assicuraTabelleScenari(nomeSchema);
    const risultato = await pool.query(
      `SELECT debito_scaduto, di_cui_iscrizioni_a_ruolo, debito_riscadenziato_o_moratorie,
              linee_credito_non_rinnovabili, rate_finanziamenti_scadenza_2_anni,
              investimenti_iniziative_industriali, dismissioni_cespiti_o_rami,
              nuovi_conferimenti_e_finanziamenti, mol_netto_negativo_primo_anno,
              stralcio_ritenuto_ragionevole, mol_prospettico_normalizzato,
              investimenti_mantenimento_annui, imposte_reddito_annue,
              in_equilibrio_dal_secondo_anno
       FROM "${nomeSchema}".azienda_test_pratico WHERE azienda_id = $1`,
      [aziendaId]
    );

    if (risultato.rows.length === 0) {
      return { success: true, stato: statoVuoto };
    }

    const r = risultato.rows[0];
    const debito: DatiDebitoRistrutturare = {
      debitoScaduto: num(r.debito_scaduto),
      diCuiIscrizioniARuolo: num(r.di_cui_iscrizioni_a_ruolo),
      debitoRiscadenziatoOMoratorie: num(r.debito_riscadenziato_o_moratorie),
      lineeCreditoNonRinnovabili: num(r.linee_credito_non_rinnovabili),
      rateFinanziamentiScadenza2Anni: num(r.rate_finanziamenti_scadenza_2_anni),
      investimentiIniziativeIndustriali: num(r.investimenti_iniziative_industriali),
      dismissioniCespitiORami: num(r.dismissioni_cespiti_o_rami),
      nuoviConferimentiEFinanziamenti: num(r.nuovi_conferimenti_e_finanziamenti),
      molNettoNegativoPrimoAnno: num(r.mol_netto_negativo_primo_anno),
      stralcioRitenutoRagionevole: num(r.stralcio_ritenuto_ragionevole),
    };
    const flussi: DatiFlussiARegime = {
      molProspetticoNormalizzato: num(r.mol_prospettico_normalizzato),
      investimentiMantenimentoAnnui: num(r.investimenti_mantenimento_annui),
      imposteRedditoAnnue: num(r.imposte_reddito_annue),
      inEquilibrioDalSecondoAnno: r.in_equilibrio_dal_secondo_anno === true,
    };

    return {
      success: true,
      stato: {
        debito,
        flussi,
        risultato: calcolaTestPratico(debito, flussi),
        compilato: true,
      },
    };
  } catch (error: any) {
    console.error('[ottieniTestPraticoAzienda] Errore:', error);
    return {
      success: false,
      stato: statoVuoto,
      error: `Impossibile caricare il Test pratico: ${error.message || error}`,
    };
  }
}

export async function salvaTestPraticoAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  debito: DatiDebitoRistrutturare,
  flussi: DatiFlussiARegime
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    await assicuraTabelleScenari(nomeSchema);
    await pool.query(
      `INSERT INTO "${nomeSchema}".azienda_test_pratico
         (azienda_id, debito_scaduto, di_cui_iscrizioni_a_ruolo,
          debito_riscadenziato_o_moratorie, linee_credito_non_rinnovabili,
          rate_finanziamenti_scadenza_2_anni, investimenti_iniziative_industriali,
          dismissioni_cespiti_o_rami, nuovi_conferimenti_e_finanziamenti,
          mol_netto_negativo_primo_anno, stralcio_ritenuto_ragionevole,
          mol_prospettico_normalizzato, investimenti_mantenimento_annui,
          imposte_reddito_annue, in_equilibrio_dal_secondo_anno, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
       ON CONFLICT (azienda_id) DO UPDATE SET
         debito_scaduto = $2,
         di_cui_iscrizioni_a_ruolo = $3,
         debito_riscadenziato_o_moratorie = $4,
         linee_credito_non_rinnovabili = $5,
         rate_finanziamenti_scadenza_2_anni = $6,
         investimenti_iniziative_industriali = $7,
         dismissioni_cespiti_o_rami = $8,
         nuovi_conferimenti_e_finanziamenti = $9,
         mol_netto_negativo_primo_anno = $10,
         stralcio_ritenuto_ragionevole = $11,
         mol_prospettico_normalizzato = $12,
         investimenti_mantenimento_annui = $13,
         imposte_reddito_annue = $14,
         in_equilibrio_dal_secondo_anno = $15,
         updated_at = now()`,
      [
        aziendaId,
        debito.debitoScaduto,
        debito.diCuiIscrizioniARuolo,
        debito.debitoRiscadenziatoOMoratorie,
        debito.lineeCreditoNonRinnovabili,
        debito.rateFinanziamentiScadenza2Anni,
        debito.investimentiIniziativeIndustriali,
        debito.dismissioniCespitiORami,
        debito.nuoviConferimentiEFinanziamenti,
        debito.molNettoNegativoPrimoAnno,
        debito.stralcioRitenutoRagionevole,
        flussi.molProspetticoNormalizzato,
        flussi.investimentiMantenimentoAnnui,
        flussi.imposteRedditoAnnue,
        flussi.inEquilibrioDalSecondoAnno,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[salvaTestPraticoAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile salvare il Test pratico: ${error.message || error}`,
    };
  }
}
