'use server';

// LA CHECK LIST DINAMICA DEI PRODOTTI NEL TRIAGE (0.161.0).
//
// Il triage, dopo aver acquisito visura e prospetti e aver dichiarato se
// l'azienda ha lavoratori, va in stand-by: le domande non sono un questionario
// generico, sono quelle scritte sui prodotti che hanno il flag attivo. Un
// prodotto acceso con una domanda produce una domanda; con tre ne produce tre.
//
// LA RISPOSTA È DELL'AZIENDA, NON DELLO SPAZIO. La configurazione delle domande
// è una sola per l'ente; le risposte sono di ciascuna azienda e si conservano
// per (azienda, prodotto, domanda), con l'id della domanda come chiave: cambiare
// il testo di una domanda non perde le risposte già date.
//
// IL SALVATAGGIO NON DIPENDE DAL NUMERO DI RIGA DEL PRODOTTO (0.246.0).
// `prodotti_ente.id` è una SERIAL: ricreare il prodotto — un ripristino, una
// configurazione rinnovata, due ambienti con id diversi — cambia il numero, e
// una pagina aperta prima del cambio salverebbe su un prodotto che non c'è più
// («Prodotto non trovato» con la domanda davanti). Il prodotto si cerca prima
// per id e, se l'id non esiste, per la sua chiave stabile (direttrice + nome);
// la riga si scrive sempre sull'id attuale, con la chiave accanto, così la
// risposta resta ritrovabile anche al prossimo cambio.
//
// IL TETTO DEL TESTO LIBERO SI APPLICA QUI, NON SOLO NEL BROWSER. Un limite che
// vive soltanto nel campo di input non è un limite: la server action è un
// endpoint pubblico, e chi la chiama può ignorare il `maxLength`.

import { pool } from '@/lib/db';
import { richiediAccessoAzienda } from '@/lib/autorizzazione';
import { assicuraTabelleTl } from '@/db/provision';
import {
  chiaveProdotto,
  sintesiChecklistProdotti,
  vociChecklistProdotti,
  type ProdottoEnte,
  type RispostaChecklistProdotto,
  type SintesiChecklistProdotti,
  type VoceChecklistProdotto,
} from '@/lib/prodotti/prodotti';
import {
  leggiProdottiAzienda,
  leggiRisposteChecklistProdottiAzienda,
} from '@/lib/prodotti/checklistAzienda';
import { risolviProdotto } from '@/lib/prodotti/risposteProdotti';

const schemaOk = (n: string) => /^[a-z0-9_]+$/.test(n);

export interface StatoChecklistProdotti {
  /** Le domande da porre, una voce per domanda. */
  voci: VoceChecklistProdotto[];
  risposte: RispostaChecklistProdotto[];
  sintesi: SintesiChecklistProdotti;
  /** I prodotti con il flag attivo: servono a spiegare da dove nascono le voci. */
  prodotti: ProdottoEnte[];
}

/**
 * Le domande e le risposte di questa azienda.
 *
 * Quando non c'è nessun prodotto in check list, l'elenco è vuoto e la sintesi
 * dice «non misurabile»: la pagina lo legge e NON blocca il triage, perché non
 * c'è nulla da rispondere. Un blocco su un elenco vuoto sarebbe un vicolo cieco.
 */
export async function ottieniChecklistProdottiAction(
  nomeSchema: string,
  aziendaId: number
): Promise<{ success: boolean; stato: StatoChecklistProdotti; error?: string }> {
  const vuoto: StatoChecklistProdotti = {
    voci: [],
    risposte: [],
    sintesi: sintesiChecklistProdotti([], []),
    prodotti: [],
  };
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema))
      return { success: false, stato: vuoto, error: 'Nome schema non valido.' };
    await assicuraTabelleTl(nomeSchema);

    // La lettura allinea da sola le risposte al prodotto attuale: una risposta
    // scritta sotto un id che non esiste più torna a contare.
    const prodotti = await leggiProdottiAzienda(nomeSchema);
    const voci = vociChecklistProdotti(prodotti);
    const { risposte } = await leggiRisposteChecklistProdottiAzienda(
      nomeSchema,
      aziendaId,
      prodotti
    );

    return {
      success: true,
      stato: {
        voci,
        risposte,
        sintesi: sintesiChecklistProdotti(voci, risposte),
        prodotti,
      },
    };
  } catch (error: unknown) {
    console.error('[ottieniChecklistProdottiAction]', error);
    return {
      success: false,
      stato: vuoto,
      error: `Impossibile leggere la check list dei prodotti: ${(error as Error).message || error}`,
    };
  }
}

/**
 * Registra una risposta. `siNo` e `testo` sono alternativi secondo il tipo di
 * domanda: si salva quello che la domanda chiede, e l'altro si azzera, così una
 * risposta vecchia non resta appesa a una domanda cambiata.
 *
 * `prodottoChiave` è la chiave stabile del prodotto (direttrice + nome) che la
 * schermata ha davanti: serve solo quando l'id non esiste più. Non è un dato da
 * fidarsi — è un indizio per ritrovare la riga, e il prodotto lo si rilegge dal
 * database.
 */
export async function salvaRispostaProdottoAction(
  nomeSchema: string,
  aziendaId: number,
  prodottoId: number,
  domandaId: string,
  siNo: boolean | null,
  testo: string | null,
  prodottoChiave?: string | null
): Promise<{ success: boolean; stato?: StatoChecklistProdotti; error?: string }> {
  try {
    await richiediAccessoAzienda(nomeSchema, aziendaId);
    if (!schemaOk(nomeSchema)) return { success: false, error: 'Nome schema non valido.' };
    if (!Number.isInteger(prodottoId) || prodottoId <= 0)
      return { success: false, error: 'Prodotto non valido.' };
    const idDomanda = String(domandaId ?? '').trim();
    if (!idDomanda) return { success: false, error: 'Domanda non valida.' };
    await assicuraTabelleTl(nomeSchema);

    // Il prodotto: per id, oppure — se l'id non c'è più — per la chiave che la
    // scheda porta con sé. Il prodotto che si usa è quello del database.
    const prodotti = await leggiProdottiAzienda(nomeSchema);
    const prodotto = risolviProdotto(prodotti, prodottoId, prodottoChiave);
    if (!prodotto)
      return {
        success: false,
        error:
          'Il prodotto non esiste più in configurazione: ricarica la pagina per vedere la check list aggiornata.',
      };
    const idProdotto = prodotto.id;
    const chiave = chiaveProdotto(prodotto.direttrice, prodotto.nome);

    // La domanda deve esistere in configurazione, e il suo tipo decide che
    // cosa si può salvare: una risposta libera su una domanda chiusa sarebbe
    // un dato che nessuna schermata sa leggere.
    const domanda = prodotto.domande.find((d) => d.id === idDomanda);
    if (!domanda) return { success: false, error: 'La domanda non esiste più in configurazione.' };

    let valoreSiNo: boolean | null = null;
    let valoreTesto: string | null = null;
    if (domanda.tipo === 'SI_NO') {
      if (siNo !== true && siNo !== false) return { success: false, error: 'Risposta non valida.' };
      valoreSiNo = siNo;
    } else {
      const pulito = String(testo ?? '').trim();
      const tetto = domanda.maxCaratteri ?? 1000;
      if (pulito.length > tetto)
        return {
          success: false,
          error: `La risposta non può superare ${tetto} caratteri.`,
        };
      // Il testo vuoto non è una risposta: si cancella la riga e la domanda
      // torna «senza risposta», che è diverso da «risposta vuota».
      if (!pulito) {
        await pool.query(
          `DELETE FROM "${nomeSchema}".checklist_prodotti_risposte
            WHERE azienda_id = $1 AND domanda_id = $2
              AND (prodotto_id = $3 OR prodotto_chiave = $4)`,
          [aziendaId, idDomanda, idProdotto, chiave]
        );
        const stato = await ottieniChecklistProdottiAction(nomeSchema, aziendaId);
        return { success: true, stato: stato.stato };
      }
      valoreTesto = pulito;
    }

    await pool.query(
      `INSERT INTO "${nomeSchema}".checklist_prodotti_risposte
         (azienda_id, prodotto_id, domanda_id, prodotto_chiave, si_no, testo, aggiornato_il)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (azienda_id, prodotto_id, domanda_id)
       DO UPDATE SET prodotto_chiave = EXCLUDED.prodotto_chiave,
                     si_no = EXCLUDED.si_no,
                     testo = EXCLUDED.testo,
                     aggiornato_il = now()`,
      [aziendaId, idProdotto, idDomanda, chiave, valoreSiNo, valoreTesto]
    );

    // Una sola risposta per domanda: se la stessa domanda era scritta sotto un
    // id vecchio, quella riga non deve restare a contare due volte.
    await pool.query(
      `DELETE FROM "${nomeSchema}".checklist_prodotti_risposte
        WHERE azienda_id = $1 AND domanda_id = $2 AND prodotto_chiave = $3
          AND prodotto_id <> $4`,
      [aziendaId, idDomanda, chiave, idProdotto]
    );

    const stato = await ottieniChecklistProdottiAction(nomeSchema, aziendaId);
    return { success: true, stato: stato.stato };
  } catch (error: unknown) {
    console.error('[salvaRispostaProdottoAction]', error);
    return {
      success: false,
      error: `Risposta non salvata: ${(error as Error).message || error}`,
    };
  }
}
