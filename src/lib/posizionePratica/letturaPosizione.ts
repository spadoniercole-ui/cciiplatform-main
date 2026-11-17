// LA LETTURA DELLA POSIZIONE, IN UN POSTO SOLO (0.244.0).
//
// La pagina leggeva dodici fonti e le passava a `componiPosizione`. Finché la
// posizione serviva solo a essere guardata andava bene; da quando la decisione
// deve verificare di essere stata firmata sulla posizione che si vede, la
// stessa lettura serve anche all'azione. Due copie della lettura sarebbero due
// posizioni diverse: quella mostrata e quella verificata.
//
// Qui la lettura sta una volta sola. Restituisce i dati già pronti per
// `componiPosizione`, le decisioni (per la cronologia) e le aperture delle
// verifiche (per gli autori). Nessuna composizione: chi chiama decide se e
// quando comporre, e con quale `adesso`.

import { leggiSessione } from '@/lib/autorizzazione';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { debitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { leggiQualitativaAzienda } from '@/lib/checklist/letturaQualitativa';
import { leggiDatiSoglieAzienda } from '@/lib/soglie25novies/datiAzienda';
import { leggiSnapshotDebito } from '@/lib/debitiEnte/memorizzaDebitoEnte';
import { leggiVerificaAzienda } from '@/lib/verificaAzienda/letturaVerifica';
import { congruenzaAzienda } from '@/lib/flussiEnte/leggiCongruenza';
import { leggiApertureVerifiche, type AperturaConAutore } from '@/lib/verificheApertura';
import { leggiDecisioniPratica } from './registroDecisioni';
import { autoreDaSessione, type Decisione } from './decisioni';
import type { DatiPosizione } from './composizione';

export interface LetturaPosizione {
  /** null quando l'azienda non esiste o non è leggibile: chi chiama reindirizza. */
  azienda: { id: number; ragioneSociale: string } | null;
  dati: DatiPosizione | null;
  decisioni: Decisione[];
  aperturaContabile: AperturaConAutore | undefined;
  aperturaAziendale: AperturaConAutore | undefined;
  /** L'utente della sessione: la firma che il modulo mostra prima del clic. */
  autoreSessione: string | null;
}

export async function leggiPosizioneAzienda(
  nomeSchema: string,
  aziendaId: number
): Promise<LetturaPosizione> {
  const risultato = await ottieniAziendaPerId(nomeSchema, aziendaId);
  if (!risultato.success || !risultato.azienda) {
    return {
      azienda: null,
      dati: null,
      decisioni: [],
      aperturaContabile: undefined,
      aperturaAziendale: undefined,
      autoreSessione: null,
    };
  }

  const [
    attenzioneRis,
    storicoRis,
    qualitativa,
    debitoRis,
    soglie,
    contabileRis,
    letturaVerifica,
    congruenza,
    decisioni,
    snapshot,
    sessione,
    aperture,
  ] = await Promise.all([
    ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).catch(() => null),
    ottieniStoricoVerificheAction(nomeSchema).catch(() => null),
    leggiQualitativaAzienda(nomeSchema, aziendaId).catch(() => null),
    debitoEnteMemorizzatoAction(nomeSchema, aziendaId).catch(() => null),
    leggiDatiSoglieAzienda(nomeSchema, aziendaId).catch(() => null),
    statoVerificaContabileAction(nomeSchema).catch(() => null),
    leggiVerificaAzienda(nomeSchema, aziendaId).catch(() => null),
    congruenzaAzienda(nomeSchema, aziendaId).catch(() => null),
    leggiDecisioniPratica(nomeSchema, aziendaId).catch(() => []),
    leggiSnapshotDebito(nomeSchema, aziendaId).catch(() => null),
    leggiSessione().catch(() => null),
    leggiApertureVerifiche(nomeSchema, aziendaId).catch(() => []),
  ]);

  const attenzione = attenzioneRis?.success ? (attenzioneRis.attenzione ?? null) : null;
  const riga = storicoRis?.success ? storicoRis.righe?.find((v) => v.id === aziendaId) : undefined;
  const rigaContabile = contabileRis?.success
    ? contabileRis.aziende.find((a) => a.aziendaId === aziendaId)
    : undefined;
  const aperturaContabile = aperture.find((a) => a.tipo === 'CONTABILE');
  const aperturaAziendale = aperture.find((a) => a.tipo === 'AZIENDALE');

  return {
    azienda: { id: aziendaId, ragioneSociale: String(risultato.azienda.ragioneSociale) },
    dati: {
      ragioneSociale: String(risultato.azienda.ragioneSociale),
      eseguitaIl: riga?.eseguitaIl ?? null,
      attenzione,
      debito: debitoRis?.success ? (debitoRis.debito ?? null) : null,
      debitoMemorizzatoIl: debitoRis?.memorizzatoIl ?? null,
      certificazioneTotale: snapshot?.certificazione?.totale ?? null,
      esposizioneContributiva: soglie?.esposizione ?? null,
      qualitativa,
      fotografia: letturaVerifica?.fotografia ?? null,
      congruenza,
      contabile: rigaContabile
        ? {
            completa: rigaContabile.completa,
            visuraIl: rigaContabile.visuraIl,
            mancanti: [
              !rigaContabile.visuraPresente ? 'la visura camerale' : null,
              !rigaContabile.parametriPresenti ? 'l’anagrafica ente' : null,
              rigaContabile.anniXbrl === 0 ? 'almeno un bilancio XBRL' : null,
            ].filter((x): x is string => x !== null),
            apertaIl: aperturaContabile?.apertaIl ?? null,
            autore: aperturaContabile?.autore ?? null,
            inIspezione: aperturaContabile?.modalita === 'SALVAGENTE',
          }
        : null,
      // CHI HA ESEGUITO LE VERIFICHE (0.243.0): la data dice quando, non da chi.
      eseguitaDa: riga?.eseguitaDa ?? null,
      // Una verifica eseguita in salvagente non è un atto dell'ente (0.244.0).
      eseguitaInIspezione: riga?.eseguitaDaModalita === 'SALVAGENTE',
      // Le decisioni entrano nella cronologia: la pagina non le riordina da sé.
      decisioni: decisioni.map((d) => ({
        decisaIl: d.decisaIl,
        esito: d.esito,
        autore: d.autore,
      })),
    },
    decisioni,
    aperturaContabile,
    aperturaAziendale,
    autoreSessione: autoreDaSessione(sessione),
  };
}
