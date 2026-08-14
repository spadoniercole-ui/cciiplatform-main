'use server';

// Acquisizione della proposta (ricevuta o da definire) di uno scenario:
// una riga per categoria di creditore (importo dovuto, % offerta,
// modalità), verifica automatica di ricevibilità contro i limiti
// configurati in Parametri di Spazio, e relazione finale con supporto AI
// che legge insieme: Check List (quadro qualitativo), Indici e dati XBRL
// (quadro quantitativo, filtrato secondo la configurazione della singola
// azienda) e verifica di ricevibilità. Se per l'azienda non è ancora
// stato caricato alcun bilancio XBRL, la relazione lo dichiara
// esplicitamente invece di inventare un quadro quantitativo.

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/lib/db';
import { assicuraTabellaProposta } from '@/db/provision';
import {
  ottieniLimitiRicevibilita,
  ottieniLimitiRicevibilitaRango,
  type LimiteRicevibilita,
  type LimiteRicevibilitaRango,
} from '@/app/actions/parametriSpazio';
import { ottieniRisposteChecklist } from '@/app/actions/checklist';
import { ottieniModelliChecklist } from '@/app/actions/checklistModelli';
import { ottieniConfigurazioneChecklist } from '@/app/actions/checklistConfig';
import {
  ottieniScenarioPerId,
  verificaScenarioNonBloccato,
  bloccaScenarioAction,
} from '@/app/actions/scenari';
import { aggiornaDatiSettoreSeNecessarioAction } from '@/app/actions/datiSettore';
import { ottieniStoricoXbrlAzienda, type BilancioStoricoAzienda } from '@/app/actions/xbrlAzienda';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniConfrontoLiquidatorio } from '@/app/actions/confrontoLiquidatorio';
import { salvaVersioneRelazioneAction } from '@/app/actions/scenarioSblocco';
import { ottieniIndiciAzienda } from '@/app/actions/aziendaConfig';
import type { RangoLegale } from '@/lib/proposta/rangoLegale';
import { raggruppaPerRango, etichettaRango } from '@/lib/proposta/rangoLegale';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';
import { calcolaQuadroQualitativo } from '@/lib/checklist/scoring';
import { calcolaTrend, type PuntoStorico } from '@/lib/xbrl/trend';
import { ottieniFunzioniPlusSpazio } from '@/app/actions/funzioniPlus';
import { calcolaRaccomandazioniRedigente } from '@/lib/simulazione/raccomandazioniRedigente';

function validaSchema(nomeSchema: string): boolean {
  return /^[a-z0-9_]+$/.test(nomeSchema);
}

export type ModalitaProposta = 'UNICA_SOLUZIONE' | 'RATEALE';

export interface RigaProposta {
  id: number;
  scenarioId: number;
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  modalita: ModalitaProposta;
  numeroRate: number | null;
  note: string | null;
  rangoLegale: RangoLegale | null;
  rilevantePerEnte: boolean;
}

export interface RisultatoElencoProposta {
  success: boolean;
  righe: RigaProposta[];
  error?: string;
}

export async function ottieniPropostaScenario(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoElencoProposta> {
  try {
    if (!validaSchema(nomeSchema))
      return { success: false, righe: [], error: 'Nome schema non valido.' };
    await assicuraTabellaProposta(nomeSchema);

    const risultato = await pool.query(
      `SELECT id, scenario_id, categoria_creditore, importo_dovuto, percentuale_offerta, modalita, numero_rate, note, rango_legale, rilevante_per_ente
       FROM "${nomeSchema}".proposta_creditori WHERE scenario_id = $1 ORDER BY id ASC`,
      [scenarioId]
    );

    return {
      success: true,
      righe: risultato.rows.map((r) => ({
        id: r.id,
        scenarioId: r.scenario_id,
        categoriaCreditore: r.categoria_creditore,
        importoDovuto: Number(r.importo_dovuto),
        percentualeOfferta: Number(r.percentuale_offerta),
        modalita: r.modalita as ModalitaProposta,
        numeroRate: r.numero_rate,
        note: r.note,
        rangoLegale: (r.rango_legale as RangoLegale) || null,
        rilevantePerEnte: r.rilevante_per_ente,
      })),
    };
  } catch (error: any) {
    console.error('[ottieniPropostaScenario] Errore:', error);
    return {
      success: false,
      righe: [],
      error: `Impossibile caricare la proposta: ${error.message || error}`,
    };
  }
}

export interface RisultatoOperazioneProposta {
  success: boolean;
  error?: string;
}

export interface DatiRigaProposta {
  categoriaCreditore: string;
  importoDovuto: number;
  percentualeOfferta: number;
  modalita: ModalitaProposta;
  numeroRate: number | null;
  note: string | null;
  rangoLegale?: RangoLegale | null;
}

export async function aggiungiRigaPropostaAction(
  nomeSchema: string,
  scenarioId: number,
  dati: DatiRigaProposta
): Promise<RisultatoOperazioneProposta> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    if (!dati.categoriaCreditore.trim()) {
      return { success: false, error: 'La categoria di creditore è obbligatoria.' };
    }
    if (dati.percentualeOfferta < 0 || dati.percentualeOfferta > 100) {
      return { success: false, error: 'La percentuale offerta deve essere tra 0 e 100.' };
    }

    await assicuraTabellaProposta(nomeSchema);
    const righeEsistentiRis = await pool.query(
      `SELECT COUNT(*) AS n FROM "${nomeSchema}".proposta_creditori WHERE scenario_id = $1`,
      [scenarioId]
    );
    const primaRiga = Number(righeEsistentiRis.rows[0]?.n || 0) === 0;

    await pool.query(
      `INSERT INTO "${nomeSchema}".proposta_creditori
         (scenario_id, categoria_creditore, importo_dovuto, percentuale_offerta, modalita, numero_rate, note, rango_legale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        scenarioId,
        dati.categoriaCreditore.trim(),
        dati.importoDovuto,
        dati.percentualeOfferta,
        dati.modalita,
        dati.numeroRate,
        dati.note,
        dati.rangoLegale || null,
      ]
    );

    // Automazione — solo la prima riga di uno scenario Ricevuta la
    // innesca, mai un ciclo o un loop: vedi il commento in
    // datiSettore.ts sul perché non è più severo di così (limite
    // ISTAT condiviso da tutti gli spazi). Non blocca la risposta
    // all'utente né la fa fallire se qualcosa va storto — è
    // un'automazione silenziosa, non un'azione che l'utente ha chiesto.
    if (primaRiga) {
      const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
      if (scenarioRis.success && scenarioRis.scenario?.tipoProposta === 'RICEVUTA') {
        // Await necessario — in ambiente serverless una chiamata senza
        // attendere rischia di non completare mai (il processo termina
        // prima che la promise si risolva). Compromesso accettato: la
        // prima riga di uno scenario Ricevuta può essere un po' più
        // lenta delle successive.
        await aggiornaDatiSettoreSeNecessarioAction(nomeSchema, scenarioRis.scenario.aziendaId);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[aggiungiRigaPropostaAction] Errore:', error);
    return { success: false, error: `Impossibile aggiungere la riga: ${error.message || error}` };
  }
}

export async function eliminaRigaPropostaAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneProposta> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const rigaRis = await pool.query(
      `SELECT scenario_id FROM "${nomeSchema}".proposta_creditori WHERE id = $1`,
      [id]
    );
    if (rigaRis.rows.length > 0) {
      const messaggioBloccato = await verificaScenarioNonBloccato(
        nomeSchema,
        rigaRis.rows[0].scenario_id
      );
      if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    }
    await pool.query(`DELETE FROM "${nomeSchema}".proposta_creditori WHERE id = $1`, [id]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaRigaPropostaAction] Errore:', error);
    return { success: false, error: `Impossibile eliminare la riga: ${error.message || error}` };
  }
}

/**
 * Elimina TUTTE le righe di uno scenario in un colpo solo — usata prima
 * di un reimport Excel per sostituire il contenuto invece di accodarlo:
 * senza questo, importare due volte lo stesso file raddoppia (triplica,
 * ecc.) ogni riga, perché l'import non ha mai avuto modo di sapere che
 * quei dati erano già presenti.
 */
export async function eliminaTuttaPropostaAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoOperazioneProposta> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const messaggioBloccato = await verificaScenarioNonBloccato(nomeSchema, scenarioId);
    if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    await pool.query(`DELETE FROM "${nomeSchema}".proposta_creditori WHERE scenario_id = $1`, [
      scenarioId,
    ]);
    return { success: true };
  } catch (error: any) {
    console.error('[eliminaTuttaPropostaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile eliminare le righe esistenti: ${error.message || error}`,
    };
  }
}

/**
 * Segna quale riga interessa all'ente destinatario di questa proposta —
 * una e una sola: impostarla su una riga toglie automaticamente il flag
 * da qualunque altra riga dello stesso scenario. La mutua esclusività è
 * garantita qui, non solo nell'interfaccia: due query, non una
 * condizionale lato client di cui fidarsi.
 */
export async function impostaRigaRilevanteAction(
  nomeSchema: string,
  scenarioId: number,
  rigaId: number,
  rilevante: boolean
): Promise<RisultatoOperazioneProposta> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };

    if (rilevante) {
      await pool.query(
        `UPDATE "${nomeSchema}".proposta_creditori SET rilevante_per_ente = FALSE WHERE scenario_id = $1`,
        [scenarioId]
      );
    }
    await pool.query(
      `UPDATE "${nomeSchema}".proposta_creditori SET rilevante_per_ente = $2 WHERE id = $1`,
      [rigaId, rilevante]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[impostaRigaRilevanteAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare la riga rilevante: ${error.message || error}`,
    };
  }
}

/**
 * Modifica una riga già esistente — senza questa, l'unico modo per
 * correggere un valore era eliminare la riga e ricrearla (o reimportare
 * l'intero file da capo).
 */
export async function modificaRigaPropostaAction(
  nomeSchema: string,
  id: number,
  dati: DatiRigaProposta
): Promise<RisultatoOperazioneProposta> {
  try {
    if (!validaSchema(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    const rigaRis = await pool.query(
      `SELECT scenario_id FROM "${nomeSchema}".proposta_creditori WHERE id = $1`,
      [id]
    );
    if (rigaRis.rows.length > 0) {
      const messaggioBloccato = await verificaScenarioNonBloccato(
        nomeSchema,
        rigaRis.rows[0].scenario_id
      );
      if (messaggioBloccato) return { success: false, error: messaggioBloccato };
    }
    if (!dati.categoriaCreditore.trim()) {
      return { success: false, error: 'La categoria di creditore è obbligatoria.' };
    }
    if (dati.percentualeOfferta < 0 || dati.percentualeOfferta > 100) {
      return { success: false, error: 'La percentuale offerta deve essere tra 0 e 100.' };
    }

    await pool.query(
      `UPDATE "${nomeSchema}".proposta_creditori
       SET categoria_creditore = $2, importo_dovuto = $3, percentuale_offerta = $4,
           modalita = $5, numero_rate = $6, note = $7, rango_legale = $8
       WHERE id = $1`,
      [
        id,
        dati.categoriaCreditore.trim(),
        dati.importoDovuto,
        dati.percentualeOfferta,
        dati.modalita,
        dati.numeroRate,
        dati.note,
        dati.rangoLegale || null,
      ]
    );
    return { success: true };
  } catch (error: any) {
    console.error('[modificaRigaPropostaAction] Errore:', error);
    return { success: false, error: `Impossibile modificare la riga: ${error.message || error}` };
  }
}

// ============================================================================
// Verifica di ricevibilità: confronta ogni riga della proposta con i
// limiti configurati per quella categoria di creditore (fallback su
// "Generale" se la categoria non ha un limite specifico).
// ============================================================================

export interface EsitoRigaProposta extends RigaProposta {
  ricevibile: boolean;
  motivazione: string;
}

export interface EsitoRicevibilita {
  righe: EsitoRigaProposta[];
  complessivamenteRicevibile: boolean;
  /** Solo percorso Ricevente: false quando non c'è ancora nessuna estrazione dal documento — "non ricevibile" per assenza di dati è diverso da "non ricevibile" perché l'importo è sotto soglia, e vanno mostrati in modo diverso all'utente. */
  datiDisponibili?: boolean;
}

export interface RisultatoVerificaRicevibilita {
  success: boolean;
  esito?: EsitoRicevibilita;
  error?: string;
}

export async function verificaRicevibilitaProposta(
  nomeSchema: string,
  scenarioId: number,
  tipoSpazio?: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoVerificaRicevibilita> {
  try {
    const [propostaRisultato, limitiRisultato, limitiRangoRisultato] = await Promise.all([
      ottieniPropostaScenario(nomeSchema, scenarioId),
      ottieniLimitiRicevibilita(nomeSchema, tipoSpazio),
      ottieniLimitiRicevibilitaRango(nomeSchema),
    ]);

    if (!propostaRisultato.success) {
      return { success: false, error: propostaRisultato.error };
    }
    if (!limitiRisultato.success) {
      return { success: false, error: limitiRisultato.error };
    }

    // Per gli spazi ENTE, un solo limite (la soglia dell'ente stesso, si
    // veda CATEGORIA_SENTINELLA_ENTE) — applicato non più a una riga
    // scelta manualmente, ma ai dati che l'AI ha estratto dal PDF della
    // proposta di cram down (vedi analizzaDocumentiRiceventeAction):
    // l'importo offerto non si inserisce più a mano.
    if (tipoSpazio === 'ENTE') {
      const limiteEnte = limitiRisultato.limiti[0];
      // Lettura diretta invece di importare da simulazioneRicevente.ts:
      // quel file importa già da qui (ottieniPropostaScenario), un
      // import nell'altro senso creerebbe un ciclo.
      const estrazioneRis = await pool.query(
        `SELECT importo_dovuto_estratto, percentuale_offerta_estratta, modalita_estratta,
                numero_rate_estratto, estrazione_riuscita, motivo_estrazione_mancata
         FROM "${nomeSchema}".simulazione_ricevente WHERE scenario_id = $1`,
        [scenarioId]
      );
      const rigaDb = estrazioneRis.rows[0];
      const estrazione = rigaDb
        ? {
            estrazioneRiuscita: rigaDb.estrazione_riuscita ?? false,
            importoDovuto:
              rigaDb.importo_dovuto_estratto !== null
                ? Number(rigaDb.importo_dovuto_estratto)
                : null,
            percentualeOfferta:
              rigaDb.percentuale_offerta_estratta !== null
                ? Number(rigaDb.percentuale_offerta_estratta)
                : null,
            modalita: rigaDb.modalita_estratta as ModalitaProposta | null,
            numeroRate: rigaDb.numero_rate_estratto,
            motivoMancata: rigaDb.motivo_estrazione_mancata,
          }
        : null;

      const rigaSintetica: EsitoRigaProposta = {
        id: 0,
        scenarioId,
        categoriaCreditore: 'Proposta di cram down (estratta dal documento)',
        importoDovuto: estrazione?.importoDovuto ?? 0,
        percentualeOfferta: estrazione?.percentualeOfferta ?? 0,
        modalita: (estrazione?.modalita as ModalitaProposta) ?? 'UNICA_SOLUZIONE',
        numeroRate: estrazione?.numeroRate ?? null,
        note: null,
        rangoLegale: null,
        rilevantePerEnte: true,
        ricevibile: false,
        motivazione: '',
      };

      if (!estrazione || estrazione.importoDovuto === null) {
        return {
          success: true,
          esito: {
            righe: [
              {
                ...rigaSintetica,
                ricevibile: false,
                motivazione:
                  'Carica ed analizza la proposta di cram down prima di poter verificare la ricevibilità.',
              },
            ],
            complessivamenteRicevibile: false,
            datiDisponibili: false,
          },
        };
      }
      if (!estrazione.estrazioneRiuscita) {
        return {
          success: true,
          esito: {
            righe: [
              {
                ...rigaSintetica,
                ricevibile: false,
                motivazione:
                  estrazione.motivoMancata ||
                  "L'AI non è riuscita a estrarre un importo chiaro dal documento — verifica manualmente.",
              },
            ],
            complessivamenteRicevibile: false,
            datiDisponibili: false,
          },
        };
      }
      if (!limiteEnte) {
        return {
          success: true,
          esito: {
            righe: [
              {
                ...rigaSintetica,
                ricevibile: true,
                motivazione: 'Nessuna soglia configurata per questo ente in Parametri di Spazio.',
              },
            ],
            complessivamenteRicevibile: true,
            datiDisponibili: true,
          },
        };
      }

      const importoOfferto = (rigaSintetica.importoDovuto * rigaSintetica.percentualeOfferta) / 100;
      const motivi: string[] = [];
      if (
        limiteEnte.valoreLiquidazioneStimato !== null &&
        limiteEnte.valoreLiquidazioneStimato > 0
      ) {
        if (importoOfferto < limiteEnte.valoreLiquidazioneStimato) {
          motivi.push(
            `offerta € ${importoOfferto.toLocaleString('it-IT')} inferiore al valore di liquidazione stimato (€ ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}) — otterreste di più in liquidazione giudiziale`
          );
        }
      }
      if (rigaSintetica.percentualeOfferta < limiteEnte.percentualeMinima) {
        motivi.push(
          `offerta ${rigaSintetica.percentualeOfferta}% sotto il minimo richiesto (${limiteEnte.percentualeMinima}%)`
        );
      }
      if (rigaSintetica.modalita === 'UNICA_SOLUZIONE' && !limiteEnte.unicaSoluzioneAmmessa) {
        motivi.push("modalità 'unica soluzione' non ammessa");
      }
      if (rigaSintetica.modalita === 'RATEALE' && !limiteEnte.rateizzazioneAmmessa) {
        motivi.push("modalità 'rateale' non ammessa");
      }
      const motivazionePositiva =
        limiteEnte.valoreLiquidazioneStimato !== null && limiteEnte.valoreLiquidazioneStimato > 0
          ? `Offerta € ${importoOfferto.toLocaleString('it-IT')} ≥ valore di liquidazione stimato € ${limiteEnte.valoreLiquidazioneStimato.toLocaleString('it-IT')}.`
          : limiteEnte.percentualeMinima > 0
            ? `Offerta ${rigaSintetica.percentualeOfferta}% ≥ percentuale minima richiesta ${limiteEnte.percentualeMinima}%.`
            : 'Nessuna soglia configurata per questo ente — conforme per assenza di un vincolo, non per un controllo superato. Configura la soglia in Parametri di Spazio.';
      const rigaFinale: EsitoRigaProposta = {
        ...rigaSintetica,
        ricevibile: motivi.length === 0,
        motivazione: motivi.length === 0 ? motivazionePositiva : motivi.join('; '),
      };
      return {
        success: true,
        esito: {
          righe: [rigaFinale],
          complessivamenteRicevibile: rigaFinale.ricevibile,
          datiDisponibili: true,
        },
      };
    }

    const limitiPerCategoria = new Map(
      limitiRisultato.limiti.map((l) => [l.categoriaCreditore, l])
    );
    // Un limite può avere più nomi alternativi (INPS → "Enti
    // previdenziali", "Ente previdenziale"...) — mappa ogni alias,
    // normalizzato in minuscolo per un confronto case-insensitive, al
    // limite a cui appartiene.
    const limitiPerAlias = new Map<string, LimiteRicevibilita>();
    for (const l of limitiRisultato.limiti) {
      for (const a of l.alias || []) {
        if (a.trim()) limitiPerAlias.set(a.trim().toLowerCase(), l);
      }
    }
    const limitiPerRango = new Map(limitiRangoRisultato.limiti.map((l) => [l.rangoLegale, l]));
    const generale = limitiPerCategoria.get('Generale');

    const righe: EsitoRigaProposta[] = propostaRisultato.righe.map((riga) => {
      // Corrispondenza a tre livelli, non un unico confronto per nome
      // libero: (1) categoria esatta, se configurata con quel nome
      // preciso; (1b) un alias configurato per quella categoria, se il
      // nome esatto non combacia; (2) rango legale della riga, se
      // impostato — un insieme chiuso di 6 valori, non ambiguo come un
      // nome libero; (3) Generale, solo se nessuno dei livelli sopra ha
      // dato risposta.
      let limite: LimiteRicevibilita | LimiteRicevibilitaRango | undefined = limitiPerCategoria.get(
        riga.categoriaCreditore
      );
      let livelloMatch: 'categoria' | 'alias' | 'rango' | 'generale' | 'nessuno' = limite
        ? 'categoria'
        : 'nessuno';
      if (!limite) {
        limite = limitiPerAlias.get(riga.categoriaCreditore.trim().toLowerCase());
        if (limite) livelloMatch = 'alias';
      }
      if (!limite && riga.rangoLegale) {
        limite = limitiPerRango.get(riga.rangoLegale);
        if (limite) livelloMatch = 'rango';
      }
      if (!limite) {
        limite = generale;
        livelloMatch = limite ? 'generale' : 'nessuno';
      }

      if (!limite) {
        return {
          ...riga,
          ricevibile: true,
          motivazione:
            'Nessun limite configurato — né per questa categoria, né per il suo rango legale (se impostato), né una soglia Generale. Verifica che almeno una di queste esista in Parametri di Spazio prima di considerare questo esito.',
        };
      }

      const motivi: string[] = [];
      const importoOfferto = (riga.importoDovuto * riga.percentualeOfferta) / 100;

      // Criterio corretto ex CCII (art. 23, comma 2-bis, e prassi delle
      // transazioni fiscali/contributive): la proposta è ricevibile se
      // offre al creditore non meno di quanto otterrebbe in liquidazione
      // giudiziale. Se per questa categoria è stato stimato un valore di
      // liquidazione, è questo — non la percentuale minima — il test
      // principale.
      if (limite.valoreLiquidazioneStimato !== null && limite.valoreLiquidazioneStimato > 0) {
        if (importoOfferto < limite.valoreLiquidazioneStimato) {
          motivi.push(
            `offerta € ${importoOfferto.toLocaleString('it-IT')} inferiore al valore di liquidazione stimato per questa categoria (€ ${limite.valoreLiquidazioneStimato.toLocaleString('it-IT')}) — il creditore otterrebbe di più in liquidazione giudiziale`
          );
        }
      }
      if (riga.percentualeOfferta < limite.percentualeMinima) {
        motivi.push(
          `offerta ${riga.percentualeOfferta}% sotto il minimo richiesto (${limite.percentualeMinima}%)`
        );
      }
      if (riga.modalita === 'UNICA_SOLUZIONE' && !limite.unicaSoluzioneAmmessa) {
        motivi.push("modalità 'unica soluzione' non ammessa per questa categoria");
      }
      if (riga.modalita === 'RATEALE' && !limite.rateizzazioneAmmessa) {
        motivi.push("modalità 'rateale' non ammessa per questa categoria");
      }

      const etichettaLivello =
        livelloMatch === 'categoria'
          ? 'per questa categoria'
          : livelloMatch === 'rango'
            ? `per il rango legale "${riga.rangoLegale ? etichettaRango(riga.rangoLegale) : ''}" (nessuna soglia specifica trovata per il nome esatto di questa categoria)`
            : 'dalla soglia Generale (nessuna soglia specifica trovata per categoria né per rango legale)';

      let motivazionePositiva: string;
      if (limite.valoreLiquidazioneStimato !== null && limite.valoreLiquidazioneStimato > 0) {
        motivazionePositiva = `Offerta € ${importoOfferto.toLocaleString('it-IT')} ≥ valore di liquidazione stimato € ${limite.valoreLiquidazioneStimato.toLocaleString('it-IT')}, verificato ${etichettaLivello} (criterio ex CCII, configurato in Parametri di Spazio).`;
      } else if (limite.percentualeMinima > 0) {
        motivazionePositiva = `Offerta ${riga.percentualeOfferta}% ≥ percentuale minima richiesta ${limite.percentualeMinima}%, verificato ${etichettaLivello} (configurata in Parametri di Spazio).`;
      } else {
        motivazionePositiva = `Nessuna soglia configurata ${etichettaLivello} (né percentuale minima né valore di liquidazione, in Parametri di Spazio) — conforme per assenza di un vincolo da verificare, non per un controllo superato.`;
      }

      return {
        ...riga,
        ricevibile: motivi.length === 0,
        motivazione: motivi.length === 0 ? motivazionePositiva : motivi.join('; '),
      };
    });

    return {
      success: true,
      esito: {
        righe,
        complessivamenteRicevibile: righe.length > 0 && righe.every((r) => r.ricevibile),
      },
    };
  } catch (error: any) {
    console.error('[verificaRicevibilitaProposta] Errore:', error);
    return {
      success: false,
      error: `Impossibile verificare la ricevibilità: ${error.message || error}`,
    };
  }
}

// ============================================================================
// Relazione finale con supporto AI: legge insieme quadro qualitativo della
// Check List e verifica di ricevibilità della proposta.
// ============================================================================

export interface RisultatoRelazioneProposta {
  success: boolean;
  relazione?: string;
  troncata?: boolean;
  error?: string;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

/**
 * Costruisce il blocco testuale del quadro quantitativo per il prompt,
 * filtrato secondo gli indici abilitati per QUESTA azienda — mai tutti e
 * 9 indiscriminatamente. Onesto sull'assenza di dati: se non c'è ancora
 * un bilancio XBRL caricato per l'azienda, lo dichiara invece di
 * ometterlo o lasciare che il modello lo inventi.
 */
function costruisciBloccoQuantitativo(
  ultimoBilancio: BilancioStoricoAzienda | null,
  codiciAbilitati: Set<string>,
  trend: ReturnType<typeof calcolaTrend> | null
): string {
  if (!ultimoBilancio) {
    return 'QUADRO QUANTITATIVO (XBRL): Nessun bilancio XBRL caricato per questa azienda finora.';
  }

  const indiciVisibili = [...ultimoBilancio.indici, ...ultimoBilancio.altriIndici].filter((i) =>
    codiciAbilitati.has(i.codice)
  );

  const righeIndici =
    indiciVisibili.length > 0
      ? indiciVisibili
          .map(
            (i) =>
              `- ${i.codice} (${i.nome}): valore ${typeof i.valore === 'number' ? i.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : i.valore}, soglia ${i.soglia}, esito ${i.esito}`
          )
          .join('\n')
      : 'Nessun indice abilitato per questa azienda (configurabile in Aziende → questa azienda → Indici).';

  const debitoria = ultimoBilancio.situazioneDebitoria;

  let blocco = `QUADRO QUANTITATIVO (XBRL) — bilancio anno ${ultimoBilancio.annoBilancio ?? 'non determinato'} (file: ${ultimoBilancio.nomeFile ?? 'n/d'}):
Severità complessiva: ${ultimoBilancio.severity}
Indici (solo quelli abilitati per questa azienda):
${righeIndici}
Situazione debitoria: banche € ${debitoria.debitiBanche.toLocaleString('it-IT')}, fornitori € ${debitoria.debitiFornitori.toLocaleString('it-IT')}, tributari € ${debitoria.debitiTributari.toLocaleString('it-IT')}, previdenziali € ${debitoria.debitiPrevidenziali.toLocaleString('it-IT')}, totale € ${debitoria.totaleDebiti.toLocaleString('it-IT')}
PFN: € ${debitoria.pfn.toLocaleString('it-IT')} — Disponibilità liquide: € ${debitoria.disponibilitaLiquide.toLocaleString('it-IT')}`;

  if (trend) {
    const andamentoVisibile = trend.andamentoIndici.filter((a) => codiciAbilitati.has(a.codice));
    blocco += `\nAndamento storico: direzione ${trend.direzioneSeverity}`;
    if (trend.segnalazioni.length > 0) {
      blocco += `; segnalazioni: ${trend.segnalazioni.join('; ')}`;
    }
    if (andamentoVisibile.length > 0) {
      blocco += `\nSerie storica indici abilitati: ${andamentoVisibile
        .map(
          (a) =>
            `${a.codice} [${a.serie.map((p) => (typeof p.valore === 'number' ? p.valore.toFixed(2) : p.valore)).join(' → ')}]`
        )
        .join('; ')}`;
    }
  }

  return blocco;
}

export async function generaRelazionePropostaAction(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoRelazioneProposta> {
  try {
    if (!anthropic) {
      return { success: false, error: 'Chiave API ANTHROPIC_API_KEY non configurata nel server.' };
    }
    const plusRis = await ottieniFunzioniPlusSpazio(nomeSchema);
    if (!plusRis.funzioni.relazioneAi) {
      return {
        success: false,
        error: 'La Relazione AI non è inclusa nella licenza di questo spazio.',
      };
    }

    // Lo scenario va ottenuto prima delle altre chiamate — serve a
    // sapere se lo spazio è ENTE, per passarlo a
    // verificaRicevibilitaProposta. Senza questo, la chiamata andava
    // sempre nel ramo generico (righe manuali, sempre vuoto per
    // Ricevuta), bloccando la Relazione con "aggiungi una riga" prima
    // ancora di arrivare al controllo giusto qui sotto.
    const scenarioRisultato = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRisultato.success || !scenarioRisultato.scenario) {
      return { success: false, error: scenarioRisultato.error || 'Scenario non trovato.' };
    }
    const isRicevuta = scenarioRisultato.scenario.tipoProposta === 'RICEVUTA';

    // La ricevibilità è ESCLUSIVA del percorso Ricevente (ENTE): è l'ente
    // che fissa le soglie e giudica la proposta ricevuta. Nel Redigente non
    // esiste — la relazione presenta la PROPOSTA (struttura per categoria e
    // rango, sostenibilità dal quadro qualitativo/quantitativo e dalla
    // Simulazione), non un verdetto di ricevibilità. Perciò l'esito si
    // calcola solo per RICEVUTA; per il Redigente si prendono le sole righe.
    let esito: EsitoRicevibilita | null = null;
    let righeProposta: RigaProposta[] = [];

    const [risposteRisultato, configRisultato] = await Promise.all([
      ottieniRisposteChecklist(nomeSchema, scenarioId),
      ottieniConfigurazioneChecklist(nomeSchema),
    ]);

    if (scenarioRisultato.scenario.bloccatoIl) {
      return {
        success: false,
        error:
          "Questo scenario è in sola lettura permanente — la Relazione è già stata generata. Per una nuova valutazione, apri un nuovo scenario — oppure, se serve correggere un errore su questo, l'Admin di Spazio può sbloccarlo qui sotto.",
      };
    }

    if (isRicevuta) {
      const esitoRisultato = await verificaRicevibilitaProposta(nomeSchema, scenarioId, 'ENTE');
      if (!esitoRisultato.success || !esitoRisultato.esito) {
        return {
          success: false,
          error: esitoRisultato.error || 'Impossibile verificare la ricevibilità.',
        };
      }
      // Per RICEVUTA la riga sintetica è sempre presente (costruita
      // dall'estrazione AI): il gate vero è se l'estrazione è stata fatta.
      if (esitoRisultato.esito.datiDisponibili === false) {
        return {
          success: false,
          error: 'Carica e analizza la proposta di cram down prima di generare la relazione.',
        };
      }
      esito = esitoRisultato.esito;
      righeProposta = esito.righe;
    } else {
      const propostaRis = await ottieniPropostaScenario(nomeSchema, scenarioId);
      if (!propostaRis.success) {
        return { success: false, error: propostaRis.error || 'Impossibile leggere la proposta.' };
      }
      if (propostaRis.righe.length === 0) {
        return {
          success: false,
          error: 'Aggiungi almeno una riga alla proposta prima di generare la relazione.',
        };
      }
      righeProposta = propostaRis.righe;
    }
    // Gate di flusso completo: la Relazione AI è l'ultimo passo, non un
    // extra generabile in qualsiasi momento. Stesso controllo mostrato
    // visivamente in RelazioneAiScenario.tsx — qui è quello che conta
    // davvero, l'interfaccia è solo una comodità.
    // Per RICEVUTA la Check List scenario non esiste più (sostituita
    // dallo Screening in Azienda, fatto una volta sola) — questo
    // controllo resta valido solo per il Redigente.
    if (
      scenarioRisultato.scenario.tipoProposta !== 'RICEVUTA' &&
      (!risposteRisultato.success || risposteRisultato.risposte.length === 0)
    ) {
      return {
        success: false,
        error: 'Compila almeno una domanda della Check List prima di generare la relazione.',
      };
    }

    const scenario = scenarioRisultato.scenario;

    // Quadro quantitativo: ultimo bilancio XBRL salvato per QUESTA azienda
    // (gli scenari sono aziendali, lo storico è condiviso tra tutti gli
    // scenari della stessa azienda), filtrato secondo gli indici che
    // l'Admin di Spazio ha confermato per questa specifica azienda — mai
    // tutti e 9 indiscriminatamente.
    const [storicoRisultato, indiciAziendaRisultato, aziendaRisultato] = await Promise.all([
      ottieniStoricoXbrlAzienda(nomeSchema, scenario.aziendaId),
      ottieniIndiciAzienda(nomeSchema, scenario.aziendaId),
      ottieniAziendaPerId(nomeSchema, scenario.aziendaId),
    ]);
    const storico = storicoRisultato.success ? storicoRisultato.storico : [];
    if (storico.length === 0) {
      return {
        success: false,
        error: 'Carica almeno un bilancio XBRL per questa azienda prima di generare la relazione.',
      };
    }
    const codiciAbilitati = new Set(
      (indiciAziendaRisultato.success ? indiciAziendaRisultato.indici : [])
        .filter((i) => i.abilitato)
        .map((i) => i.codice)
    );
    const ultimoBilancio = storico.length > 0 ? storico[storico.length - 1] : null;

    let trend: ReturnType<typeof calcolaTrend> | null = null;
    if (storico.length >= 2) {
      const punti: PuntoStorico[] = storico.map((s) => ({
        anno: s.annoBilancio,
        indici: s.indici,
        severity: s.severity,
        situazioneDebitoria: s.situazioneDebitoria,
      }));
      trend = calcolaTrend(punti.slice(0, -1), punti[punti.length - 1]);
    }

    const sezioni =
      configRisultato.success && configRisultato.configurazione
        ? configRisultato.configurazione.sezioni
        : CHECKLIST_MINISTERIALE;
    const risposteMappa: Record<string, { domandaId: string; risposta: boolean | null }> = {};
    if (risposteRisultato.success) {
      for (const r of risposteRisultato.risposte) risposteMappa[r.domandaId] = r;
    }
    const pesiNumerici = configRisultato.configurazione?.pesiNumerici;
    const soglie = configRisultato.configurazione
      ? {
          solido: configRisultato.configurazione.soglie.solido,
          daRafforzare: configRisultato.configurazione.soglie.daRafforzare,
        }
      : undefined;
    const quadro = calcolaQuadroQualitativo(sezioni, risposteMappa, pesiNumerici, soglie);

    // Check list custom attive di questo spazio: stesso motore di
    // punteggio, stessi pesi/soglie, sezioni proprie — una "fotografia"
    // per ciascuna, non solo per la Ministeriale.
    const modelliRisultato = await ottieniModelliChecklist(nomeSchema);
    const quadriCustom: { nome: string; quadro: ReturnType<typeof calcolaQuadroQualitativo> }[] =
      [];
    if (modelliRisultato.success) {
      for (const modello of modelliRisultato.modelli) {
        const risposteModelloRisultato = await ottieniRisposteChecklist(
          nomeSchema,
          scenarioId,
          String(modello.id)
        );
        if (!risposteModelloRisultato.success || risposteModelloRisultato.risposte.length === 0) {
          continue; // check list custom mai avviata: non aggiunge nulla alla relazione
        }
        const mappaModello: Record<string, { domandaId: string; risposta: boolean | null }> = {};
        for (const r of risposteModelloRisultato.risposte) mappaModello[r.domandaId] = r;
        quadriCustom.push({
          nome: modello.nome,
          quadro: calcolaQuadroQualitativo(modello.sezioni, mappaModello, pesiNumerici, soglie),
        });
      }
    }

    // Testi che cambiano tra i due percorsi: la ricevibilità esiste solo
    // per il Ricevente. Nel Redigente la relazione presenta la proposta e
    // la sua sostenibilità, senza alcun verdetto di ricevibilità.
    const regolaAnalisi = isRicevuta
      ? 'quadro qualitativo della Check List, quadro quantitativo da XBRL se presente, e verifica di ricevibilità della proposta'
      : 'quadro qualitativo della Check List, quadro quantitativo da XBRL se presente, e la proposta ai creditori così come strutturata';
    const sintesiTesto = isRicevuta
      ? "esito complessivo: proposta ricevibile o non ricevibile secondo i parametri configurati, e perché, tenendo conto sia del quadro qualitativo sia di quello quantitativo se disponibile — se è indicata una RIGA RILEVANTE PER L'ENTE DESTINATARIO, apri con l'esito su quella riga specifica, prima di tutto il resto"
      : 'esito complessivo sulla sostenibilità e sulla convenienza del piano proposto, e perché, tenendo conto sia del quadro qualitativo sia di quello quantitativo se disponibile';
    const sezione2Titolo = isRicevuta
      ? 'VERIFICA DI RICEVIBILITÀ PER CATEGORIA DI CREDITORE E PER RANGO LEGALE (dettaglio riga per riga, poi il riepilogo per rango — prededucibili, privilegiati, chirografari, postergati: sono le famiglie che contano in un confronto con la liquidazione giudiziale)'
      : 'STRUTTURA DELLA PROPOSTA PER CATEGORIA DI CREDITORE E PER RANGO LEGALE (dettaglio riga per riga di quanto offerto, poi il riepilogo per rango — prededucibili, privilegiati, chirografari, postergati: le famiglie che contano in un confronto con la liquidazione giudiziale)';

    const systemInstruction = `
Stai redigendo una BOZZA DI LAVORO di supporto per un Dottore Commercialista esperto in composizione negoziata della crisi d'impresa e nel Codice della Crisi d'Impresa e dell'Insolvenza (D.Lgs. 14/2019, come modificato dal D.Lgs. 136/2024) — non sei tu il professionista, e questa bozza non è un giudizio professionale: lo diventa solo se e quando un professionista la rivede e la assevera.

REGOLE TASSATIVE DI REDAZIONE:
1. Analizza i dati forniti (${regolaAnalisi}). Non inventare cifre né dati non presenti nell'input.
2. Se per questa azienda NON è stato ancora caricato alcun bilancio XBRL, dichiaralo esplicitamente nella sezione quantitativa invece di ometterla o di inventare valori: "Nessun bilancio XBRL caricato per questa azienda" è una risposta corretta e sufficiente in quel caso.
3. Se un bilancio XBRL è presente, leggi gli indici SOLO tra quelli effettivamente forniti (sono già filtrati secondo la configurazione scelta per questa azienda — non commentare indici assenti dall'elenco fornito).
4. Tono peritale, rigoroso, destinato alla presentazione ai creditori interessati — ma sempre nei termini di una bozza da rivedere, mai come se il giudizio fosse già definitivo.
5. Formato Markdown, 900-1300 parole, articolato in queste sezioni:
   1. SINTESI ESECUTIVA (${sintesiTesto})
   2. ${sezione2Titolo}
   2bis. CONFRONTO CON LO SCENARIO LIQUIDATORIO — il testo per questa sezione è già fornito qui sotto (CONFRONTO CON LO SCENARIO LIQUIDATORIO — GIÀ RICERCATO), generato con ricerca web separatamente: riportalo, integrandolo nel tono della relazione, senza riscriverlo da zero né aggiungere numeri che non ci sono già. Se il testo fornito segnala che la ricerca non è ancora disponibile, dichiara questa sezione come "non ancora disponibile — sarà nel prossimo Brogliaccio generato" invece di inventare un confronto.
   3. QUADRO QUALITATIVO (CHECK LIST) (Ministeriale, e ogni check list aggiuntiva fornita — ciascuna con la propria etichetta; criticità strutturali aperte, se presenti)
   4. QUADRO QUANTITATIVO (INDICI E DATI DI BILANCIO XBRL) (indici forniti, severità, situazione debitoria/PFN, andamento storico se disponibile — o la dichiarazione esplicita di assenza dati)
   5. RACCOMANDAZIONI OPERATIVE (che tengano conto di tutti i quadri insieme, non separatamente)
6. Chiudi SEMPRE con una sezione finale "AVVERTENZA" (poche righe, non conteggiata nel limite di parole sopra): dichiara esplicitamente che questa relazione è un output automatico generato sulla base dei parametri configurati in Parametri di Spazio, non un giudizio professionale, e che spetta al professionista incaricato valutarla nel merito e decidere se asseverarla.
`;

    // Mai cercato in diretta qui — troppo lento per un lancio a mano.
    // Generato silenziosamente a ogni chiusura di un livello del
    // Brogliaccio (Ricevente) o alla generazione del Brogliaccio
    // Redigente (vedi confrontoLiquidatorio.ts), letto già pronto.
    // Vale ora per entrambi i percorsi: da quando il Brogliaccio
    // Redigente esiste davvero, anche lì il confronto viene ricercato e
    // parcheggiato, quindi la Relazione lo usa come per il Ricevente.
    const bloccoConfrontoLiquidatorio = await (async () => {
      const ris = await ottieniConfrontoLiquidatorio(nomeSchema, scenarioId);
      if (ris.success && ris.testo) {
        return `\nCONFRONTO CON LO SCENARIO LIQUIDATORIO — GIÀ RICERCATO (${ris.generatoIl ? `generato il ${new Date(ris.generatoIl).toLocaleDateString('it-IT')}` : 'data non disponibile'}):\n${ris.testo}\n`;
      }
      return '\nCONFRONTO CON LO SCENARIO LIQUIDATORIO — GIÀ RICERCATO: non ancora generato (si genera automaticamente quando si apre o si aggiorna il Brogliaccio) — dichiara questa sezione come non ancora disponibile.\n';
    })();

    // Raccomandazioni azionabili — solo Redigente: quali leve della
    // Simulazione muovere (e verso quale valore) per rendere il piano
    // sostenibile (DSCR ≥ 1). Calcolate deterministicamente da
    // calcolaRaccomandazioniRedigente, così la Relazione non dà solo un
    // giudizio statico ma indica cosa cambiare. Import dinamico per
    // spezzare il ciclo con simulazioneRedigente (che importa da qui).
    const bloccoRaccomandazioni = await (async () => {
      if (scenario.tipoProposta === 'RICEVUTA') return '';
      try {
        const { ottieniInputRedigente } = await import('@/app/actions/simulazioneRedigente');
        const simRis = await ottieniInputRedigente(nomeSchema, scenarioId);
        if (!simRis.success || !simRis.input || !simRis.risultato) {
          return '\nRACCOMANDAZIONI DALLA SIMULAZIONE: la Simulazione non è ancora impostata per questo scenario — nella sezione Raccomandazioni segnala che, senza la Simulazione, non è possibile indicare parametri concreti da modificare.\n';
        }
        const esito = calcolaRaccomandazioniRedigente(simRis.input, simRis.risultato);
        if (esito.viabile) {
          return `\nRACCOMANDAZIONI DALLA SIMULAZIONE — il piano è GIÀ SOSTENIBILE (DSCR ${esito.dscr === null ? 'n/d' : esito.dscr.toFixed(2).replace('.', ',')}, flusso disponibile a copertura della rata): nella sezione Raccomandazioni confermalo e indica che i parametri attuali della Simulazione reggono, senza inventare correzioni non necessarie.\n`;
        }
        const righe = esito.raccomandazioni
          .map(
            (r) =>
              `- ${r.titolo}: da ${r.valoreAttuale}${r.valoreObiettivo ? ` a ${r.valoreObiettivo}` : ' (da sola non basta)'}. ${r.descrizione}`
          )
          .join('\n');
        return `\nRACCOMANDAZIONI DALLA SIMULAZIONE — il piano NON è sostenibile (DSCR ${esito.dscr === null ? 'n/d' : esito.dscr.toFixed(2).replace('.', ',')}, scoperto annuo ${Math.round(esito.gapFlusso).toLocaleString('it-IT')} €). Queste leve — calcolate, non stimate — riportano il DSCR a 1 se mosse una alla volta tenendo ferme le altre; nella sezione 5 RACCOMANDAZIONI OPERATIVE riportale ESPLICITAMENTE (parametro attuale → valore obiettivo), fedelmente e senza cifre diverse, spiegando che vanno lette come alternative o combinabili:\n${righe}\n`;
      } catch (erroreRacc) {
        console.error('[generaRelazionePropostaAction] Raccomandazioni non calcolate:', erroreRacc);
        return '';
      }
    })();

    const rigaRilevante = esito?.righe.find((r) => r.rilevantePerEnte);
    const focusEnte =
      isRicevuta && rigaRilevante
        ? `\nRIGA RILEVANTE PER L'ENTE DESTINATARIO DI QUESTA PROPOSTA: "${rigaRilevante.categoriaCreditore}" (dovuto € ${rigaRilevante.importoDovuto.toLocaleString('it-IT')}, offerta ${rigaRilevante.percentualeOfferta}%, ${rigaRilevante.ricevibile ? 'RICEVIBILE' : 'NON RICEVIBILE'} — ${rigaRilevante.motivazione}). Questo ente valuta SOLO la propria posizione, non l'intera proposta: la Sintesi Esecutiva deve aprire con l'esito su QUESTA riga specifica; le altre righe/categorie servono solo come contesto per giudicare se il piano nel suo complesso regge, non sono oggetto di valutazione per questo destinatario.\n`
        : '';

    // Blocco proposta: con verdetto di ricevibilità solo per il Ricevente;
    // per il Redigente è la sola struttura dell'offerta, senza verdetto.
    const bloccoProposta = isRicevuta
      ? `VERIFICA DI RICEVIBILITÀ (per categoria di creditore):
${righeProposta
  .map((r) => {
    const e = r as EsitoRigaProposta;
    return `- ${r.categoriaCreditore}: dovuto € ${r.importoDovuto.toLocaleString('it-IT')}, offerta ${r.percentualeOfferta}%, modalità ${r.modalita === 'UNICA_SOLUZIONE' ? 'unica soluzione' : 'rateale'}${r.numeroRate ? ` (${r.numeroRate} rate)` : ''} — ${e.ricevibile ? 'RICEVIBILE' : 'NON RICEVIBILE'} (${e.motivazione})`;
  })
  .join('\n')}

ESITO COMPLESSIVO: ${esito && esito.complessivamenteRicevibile ? 'RICEVIBILE' : 'NON RICEVIBILE'}`
      : `PROPOSTA AI CREDITORI (per categoria di creditore) — quanto lo studio propone di offrire:
${righeProposta
  .map(
    (r) =>
      `- ${r.categoriaCreditore}: dovuto € ${r.importoDovuto.toLocaleString('it-IT')}, offerta ${r.percentualeOfferta}%, modalità ${r.modalita === 'UNICA_SOLUZIONE' ? 'unica soluzione' : 'rateale'}${r.numeroRate ? ` (${r.numeroRate} rate)` : ''}`
  )
  .join('\n')}`;

    const userPrompt = `
SCENARIO: ${scenario.nome} (${scenario.ragioneSocialeAzienda})
CODICE ATECO DELL'AZIENDA: ${aziendaRisultato.success && aziendaRisultato.azienda?.codiceAteco ? aziendaRisultato.azienda.codiceAteco : 'non indicato — se manca, la ricerca settoriale nella sezione 2bis non può essere mirata, dichiaralo esplicitamente invece di generalizzare'}
TIPO PROPOSTA: ${scenario.tipoProposta === 'RICEVUTA' ? 'Ricevuta da' : 'Da definire —'} ${scenario.origineProposta}
${focusEnte}${bloccoConfrontoLiquidatorio}${bloccoRaccomandazioni}
${bloccoProposta}

RIEPILOGO PER RANGO LEGALE (famiglie della liquidazione giudiziale): ${raggruppaPerRango(
      righeProposta
    )
      .map(
        (r) =>
          `${r.etichetta}: € ${r.totaleDovuto.toLocaleString('it-IT')} dovuti, € ${r.totaleOfferto.toLocaleString('it-IT', { maximumFractionDigits: 0 })} offerti (${r.creditori.join(', ')})`
      )
      .join('; ')}

QUADRO QUALITATIVO CHECK LIST MINISTERIALE: ${quadro.etichetta}${quadro.percentualeCriticitaComplessiva !== null ? ` (criticità pesata ${quadro.percentualeCriticitaComplessiva}%)` : ' (nessuna domanda ancora risposta)'}
CRITICITÀ STRUTTURALI ANCORA APERTE: ${
      quadro.criticitaStrutturaliAperte.length > 0
        ? quadro.criticitaStrutturaliAperte
            .map((c) => `${c.id} (${c.sezione}): ${c.domanda}`)
            .join('; ')
        : 'Nessuna'
    }
${
  quadriCustom.length > 0
    ? '\n' +
      quadriCustom
        .map(
          (qc) =>
            `QUADRO QUALITATIVO "${qc.nome}": ${qc.quadro.etichetta}${qc.quadro.percentualeCriticitaComplessiva !== null ? ` (criticità pesata ${qc.quadro.percentualeCriticitaComplessiva}%)` : ''}`
        )
        .join('\n')
    : ''
}

${costruisciBloccoQuantitativo(ultimoBilancio, codiciAbilitati, trend)}

Elabora la relazione di valutazione della proposta seguendo la struttura prescritta.
`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 6000,
      thinking: { type: 'disabled' },
      system: systemInstruction,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const bloccoTesto = response.content.find(
      (blocco): blocco is Anthropic.TextBlock => blocco.type === 'text'
    );
    if (!bloccoTesto?.text) {
      return { success: false, error: 'Nessun testo restituito dal modello AI.' };
    }

    // Ogni generazione è una versione a sé, mai sovrascritta — utile
    // per entrambi i percorsi, non solo per chi si blocca dopo.
    await salvaVersioneRelazioneAction(nomeSchema, scenarioId, bloccoTesto.text);

    // Solo Ricevente: la generazione riuscita della relazione è il
    // momento in cui lo scenario si congela in sola lettura permanente
    // — per una nuova valutazione serve un nuovo scenario, oppure
    // l'Admin di Spazio può sbloccarlo esplicitamente (con motivo
    // tracciato) per rigenerare. Il Redigente non ha questo
    // comportamento.
    if (scenarioRisultato.scenario.tipoProposta === 'RICEVUTA') {
      await bloccaScenarioAction(nomeSchema, scenarioId);
    }

    return {
      success: true,
      relazione: bloccoTesto.text,
      troncata: response.stop_reason === 'max_tokens',
    };
  } catch (error: any) {
    console.error('[generaRelazionePropostaAction] Errore:', error);
    return {
      success: false,
      error: `Errore durante la generazione della relazione: ${error.message || error}`,
    };
  }
}
