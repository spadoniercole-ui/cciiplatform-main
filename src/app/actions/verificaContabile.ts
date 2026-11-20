'use server';

// LO STATO DELLA VERIFICA CONTABILE, AZIENDA PER AZIENDA.
//
// La verifica contabile si fa a livello azienda — visura storica, parametri
// dell'ente, bilanci XBRL, prospetto e indici — e non chiede più la
// certificazione dei debiti: quella è materia della verifica amministrativa e
// della verifica azienda. Qui si legge solo che cosa manca per poterla
// avviare, così il menu non manda l'operatore in una pagina vuota.
//
// Il debito memorizzato si mostra quando c'è, ma non è un requisito: serve
// alla verifica azienda, non a questa.

import { pool } from '@/lib/db';
import { leggiSessione, richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';
import { nomeDaSessione } from '@/lib/identitaSessione';
import { assicuraTabellaXbrlAzienda } from '@/db/provision';
import {
  componiProiezione,
  type BilancioArchivio,
  type ProiezioneContabile,
} from '@/lib/contabile/proiezione';
import { apriVerifica } from '@/lib/verificheApertura';
import { assicuraTabelleVerificaAzienda } from '@/db/provision';
import { leggiDebitoEnteMemorizzato } from '@/lib/debitiEnte/memorizzaDebitoEnte';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface StatoContabileAzienda {
  aziendaId: number;
  ragioneSociale: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  visuraPresente: boolean;
  visuraIl: string | null;
  /** Annualità XBRL distinte in archivio. */
  anniXbrl: number;
  /** true quando l'Anagrafica Ente ha almeno un campo compilato. */
  parametriPresenti: boolean;
  debitoMemorizzato: number | null;
  debitoMemorizzatoIl: string | null;
  /** Visura, parametri e almeno un bilancio: la contabile ha tutto. */
  completa: boolean;
}

export interface RisultatoStatoContabile {
  success: boolean;
  aziende: StatoContabileAzienda[];
  error?: string;
}

/**
 * L'elenco con lo stato. Se una delle tabelle opzionali non esiste ancora —
 * spazio nuovo, o contabile mai aperta — la lettura non fallisce: le colonne
 * mancanti valgono «assente», ed è esattamente ciò che la scheda deve dire.
 */
export async function statoVerificaContabileAction(
  nomeSchema: string
): Promise<RisultatoStatoContabile> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!schemaOk(nomeSchema)) {
      return { success: false, aziende: [], error: 'Nome schema non valido.' };
    }

    const base = await pool.query(
      `SELECT id, ragione_sociale, partita_iva, codice_fiscale,
              visura_triage_url, to_char(visura_triage_il, 'YYYY-MM-DD') AS visura_il
         FROM "${nomeSchema}".aziende
        WHERE attiva = TRUE
        ORDER BY ragione_sociale ASC`
    );

    const anni = new Map<number, number>();
    await pool
      .query(
        `SELECT azienda_id, COUNT(DISTINCT anno_bilancio) AS anni
           FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE anno_bilancio IS NOT NULL
          GROUP BY azienda_id`
      )
      .then((r) => r.rows.forEach((x) => anni.set(Number(x.azienda_id), Number(x.anni))))
      .catch(() => undefined);

    const parametri = new Set<number>();
    await pool
      .query(
        `SELECT azienda_id FROM "${nomeSchema}".anagrafica_ente
          WHERE COALESCE(id_ente, '') <> ''
             OR ${Array.from({ length: 10 }, (_, i) => `COALESCE(campo_${i + 1}, '') <> ''`).join(' OR ')}`
      )
      .then((r) => r.rows.forEach((x) => parametri.add(Number(x.azienda_id))))
      .catch(() => undefined);

    const debiti = new Map<number, { totale: number; il: string | null }>();
    await pool
      .query(
        `SELECT azienda_id, totale, to_char(memorizzato_il, 'YYYY-MM-DD') AS il
           FROM "${nomeSchema}".debiti_ente_memorizzati`
      )
      .then((r) =>
        r.rows.forEach((x) =>
          debiti.set(Number(x.azienda_id), {
            totale: Number(x.totale),
            il: x.il ? String(x.il) : null,
          })
        )
      )
      .catch(() => undefined);

    const aziende: StatoContabileAzienda[] = base.rows.map((r) => {
      const id = Number(r.id);
      const visuraPresente = Boolean(r.visura_triage_url);
      const anniXbrl = anni.get(id) ?? 0;
      const parametriPresenti = parametri.has(id);
      const debito = debiti.get(id);
      return {
        aziendaId: id,
        ragioneSociale: String(r.ragione_sociale ?? ''),
        partitaIva: r.partita_iva ? String(r.partita_iva) : null,
        codiceFiscale: r.codice_fiscale ? String(r.codice_fiscale) : null,
        visuraPresente,
        visuraIl: r.visura_il ? String(r.visura_il) : null,
        anniXbrl,
        parametriPresenti,
        debitoMemorizzato: debito?.totale ?? null,
        debitoMemorizzatoIl: debito?.il ?? null,
        completa: visuraPresente && parametriPresenti && anniXbrl > 0,
      };
    });

    return { success: true, aziende };
  } catch (error: unknown) {
    console.error('[statoVerificaContabileAction] Errore:', error);
    return {
      success: false,
      aziende: [],
      error: `Impossibile leggere lo stato della verifica contabile: ${(error as Error).message}`,
    };
  }
}

export interface RisultatoSalvataggioSimulazione {
  success: boolean;
  /** Quando la simulazione è stata salvata (ISO), per mostrarlo in pagina. */
  salvataIl?: string;
  error?: string;
}

/**
 * LA SIMULAZIONE CONTABILE SI SALVA PER LA VERIFICA AZIENDA.
 *
 * La simulazione alla data della verifica non è un calcolo da guardare e
 * perdere: la verifica aziendale la legge come base della posizione. Qui si
 * ricalcola dal dato — mai da ciò che manda il browser — e si conserva la riga
 * con le sue colonne (storico e calcolato) e le avvertenze, fissandola come
 * base. Le simulazioni precedenti restano scritte e perdono solo il ruolo di
 * base: la memoria storica su cui misurare gli scostamenti non si cancella.
 */
export async function salvaSimulazioneContabileAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoSalvataggioSimulazione> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non riconosciuta.' };
    }
    await assicuraTabelleVerificaAzienda(nomeSchema);

    const risultato = await proiezioneContabileAction(nomeSchema, aziendaId);
    if (!risultato.success || !risultato.proiezione) {
      return { success: false, error: risultato.error ?? 'Simulazione non calcolabile.' };
    }
    const proiezione = risultato.proiezione;
    if (proiezione.bilanciProiettati.length === 0) {
      return {
        success: false,
        error: 'Nessun bilancio XBRL in archivio: non c’è una simulazione da salvare.',
      };
    }

    const colonne = proiezione.bilanciProiettati.map((b) => ({
      anno: b.anno,
      tipo: b.tipo,
      dati: b.dati,
    }));

    // Una sola base per azienda: le altre righe restano, senza il ruolo di base.
    await pool.query(
      `UPDATE "${nomeSchema}".verifica_azienda_simulazioni
          SET base_per_proposta = FALSE
        WHERE azienda_id = $1`,
      [aziendaId]
    );
    const inserita = await pool.query(
      `INSERT INTO "${nomeSchema}".verifica_azienda_simulazioni
         (azienda_id, profilo, annualita, debito_ente, crescita_storica_pct,
          crescita_applicata_pct, colonne, avvertenze, base_per_proposta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       RETURNING to_char(created_at, 'YYYY-MM-DD') AS il`,
      [
        aziendaId,
        'SIMULAZIONE_CONTABILE',
        colonne.length,
        proiezione.ponteEnte?.debitoVerificato ?? 0,
        null,
        0,
        JSON.stringify(colonne),
        JSON.stringify(proiezione.avvertenze),
      ]
    );

    return { success: true, salvataIl: String(inserita.rows[0]?.il ?? '').slice(0, 10) };
  } catch (error: unknown) {
    console.error('[salvaSimulazioneContabileAction] Errore:', error);
    return {
      success: false,
      error: `Simulazione non salvata: ${(error as Error).message}`,
    };
  }
}

export interface RisultatoProiezioneContabile {
  success: boolean;
  /** Data d'apertura della verifica contabile (ISO): è la fine della serie. */
  apertura: string | null;
  /** L'anno in cui la serie si ferma: quello dell'apertura della verifica. */
  annoVerifica: number;
  proiezione: ProiezioneContabile | null;
  error?: string;
}

/**
 * LA PROIEZIONE DELLA CONTABILE, ALL'ANNO DELLA VERIFICA (0.236.0).
 *
 * Prende i bilanci in archivio, la data d'apertura della verifica contabile —
 * la scrive se è la prima volta — e compone la serie degli scarti con la sua
 * proiezione. La proiezione vive qui, non nella verifica azienda: lì i due dati
 * (amministrativo attuale, contabile storico) devono arrivare già sullo stesso
 * asse temporale.
 *
 * Nessun dato inventato: se la serie non si ricava, la voce resta ferma e la
 * risposta dice quale e perché (le avvertenze sono nel risultato).
 */
export async function proiezioneContabileAction(
  nomeSchema: string,
  aziendaId: number
): Promise<RisultatoProiezioneContabile> {
  try {
    const contesto = await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) {
      return {
        success: false,
        apertura: null,
        annoVerifica: new Date().getFullYear(),
        proiezione: null,
        error: 'Nome schema non valido.',
      };
    }

    await assicuraTabellaXbrlAzienda(nomeSchema);
    const bilanci: BilancioArchivio[] = [];
    await pool
      .query(
        `SELECT anno_bilancio, dati_finanziari
           FROM "${nomeSchema}".xbrl_storico_azienda
          WHERE azienda_id = $1 AND anno_bilancio IS NOT NULL
          ORDER BY anno_bilancio ASC`,
        [aziendaId]
      )
      .then((r) => {
        for (const riga of r.rows) {
          const dati = riga.dati_finanziari;
          if (!dati || typeof dati !== 'object') continue;
          bilanci.push({ anno: Number(riga.anno_bilancio), dati });
        }
      })
      .catch(() => undefined);

    const { apertaIl } = await apriVerifica(nomeSchema, aziendaId, 'CONTABILE', {
      nome: nomeDaSessione(await leggiSessione()) ?? '',
      id: contesto.adminId ?? contesto.utenteId ?? null,
      modalita: contesto.modalita,
    });
    const annoVerifica = apertaIl ? Number(apertaIl.slice(0, 4)) : new Date().getFullYear();

    // La voce dell’ente chiude sullo stock accertato nella verifica
    // amministrativa: qui si legge il dato memorizzato e si passa al ponte.
    // Senza dato il ponte dice che manca, invece di fingere uno zero.
    const memorizzato = await leggiDebitoEnteMemorizzato(nomeSchema, aziendaId).catch(() => null);

    return {
      success: true,
      apertura: apertaIl,
      annoVerifica,
      proiezione: componiProiezione({
        bilanci,
        annoVerifica,
        debitoEnte: memorizzato
          ? {
              totale: memorizzato.debito.totale,
              fonte: memorizzato.debito.fonte,
              accertatoIl: memorizzato.memorizzatoIl,
            }
          : null,
      }),
    };
  } catch (error: unknown) {
    console.error('[proiezioneContabileAction] Errore:', error);
    return {
      success: false,
      apertura: null,
      annoVerifica: new Date().getFullYear(),
      proiezione: null,
      error: `Impossibile calcolare la proiezione contabile: ${(error as Error).message}`,
    };
  }
}
