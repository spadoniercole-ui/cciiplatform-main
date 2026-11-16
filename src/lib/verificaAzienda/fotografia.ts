// LA VERIFICA AZIENDA È UNA FOTOGRAFIA, NON UNA SIMULAZIONE (0.240.0).
//
// Fino alla 0.239.0 questa scheda rifaceva il calcolo che appartiene alla
// contabile: tre profili (standard, migliorativo, peggiorativo), un orizzonte
// scelto a mano, una traiettoria di ricavi e costi costruita qui. Il risultato
// era una seconda simulazione accanto a quella vera — e due motori che potevano
// dire numeri diversi sugli stessi bilanci.
//
// Ora la verifica azienda non proietta nulla: legge il prospetto contabile già
// proiettato (bilanci depositati più le annualità costruite dai differenziali,
// fino all'anno della verifica) e lo mostra com'è. È la fotografia dell'azienda
// alla data in cui l'ente la sta guardando, con gli indici di ogni colonna
// calcolati dallo stesso motore del resto della piattaforma.
//
// SOPRA LA FOTOGRAFIA, TRE SCENARI SUL CREDITO DELL'ENTE.
//
//   ACCORDO      non misura un recupero: misura la CAPACITÀ DI RISPOSTA
//                dell'azienda a fronte del credito vantato — la cassa che ha
//                alla data e quella che l'esercizio produce. Se non copre
//                l'importo dovuto, la proposta dell'azienda è probabilmente
//                destinata al rigetto, e da lì contano i due scenari sotto.
//
//   LIQUIDAZIONE  credito × tasso di realizzo del rango, meno le spese di
//                procedura: è ciò che resta in mano all'ente.
//
//   CRAM DOWN     credito × percentuale di soddisfacimento del rango, senza
//                costi (la percentuale è già l'esito dell'omologazione).
//
// Le due percentuali non stanno nella legge e non stanno nella piattaforma: le
// fissa l'ente in `parametri_scenari_rango`, una riga per rango. Una riga
// mancante non diventa zero: lo scenario si dichiara non calcolabile col
// motivo. La perdita è sempre credito vantato − recupero, calcolata sul credito
// accertato nella verifica amministrativa.
//
// Logica pura, con i suoi test.

import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import { calcolaScenari, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';
import type { AlertSeverity, DatiFinanziariPeriodo, IndiceCcii } from '@/lib/xbrl/types';
import type { ProiezioneContabile } from '@/lib/contabile/proiezione';

export type TipoScenarioAzienda = 'ACCORDO' | 'LIQUIDAZIONE' | 'CRAM_DOWN';

/** Una colonna della fotografia: un anno depositato o costruito dalla contabile. */
export interface ColonnaFotografia {
  anno: number;
  tipo: 'STORICO' | 'CALCOLATO';
  dati: DatiFinanziariPeriodo;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  severity: AlertSeverity;
}

/**
 * Quanto l'azienda può rispondere del credito vantato, con quello che ha e con
 * quello che produce. Non è un recupero: è la misura che dice se la proposta
 * dell'azienda sta in piedi.
 */
export interface CapacitaRisposta {
  credito: number | null;
  /** Disponibilità liquide all'anno della verifica (dalla fotografia). */
  disponibilita: number | null;
  /** Utile dell'esercizio dell'anno della verifica: la cassa che si genera. */
  flusso: number | null;
  /** Disponibilità liquide sul credito vantato, in percentuale. */
  coperturaPct: number | null;
  /** Credito che la cassa disponibile non copre. */
  scoperto: number | null;
  /** Quante annualità servono a coprire lo scoperto con il flusso dell'anno. */
  anniCopertura: number | null;
  esito: 'INTEGRALE' | 'PARZIALE' | 'NON_CALCOLABILE';
  dettaglio: string;
}

export interface ScenarioFotografia {
  codice: TipoScenarioAzienda;
  nome: string;
  /** Percentuale applicata al credito, se lo scenario ne usa una. */
  percentuale: number | null;
  /** Quanto rientra all'ente; null per l'accordo, che non è un recupero. */
  recupero: number | null;
  /** Credito vantato − recupero; null quando il recupero non è calcolabile. */
  perdita: number | null;
  calcolabile: boolean;
  motivo: string | null;
  dettaglio: string;
}

export interface FotografiaVerificaAzienda {
  anni: ColonnaFotografia[];
  annoVerifica: number;
  annoUltimoBilancio: number | null;
  /** Il credito vantato: il debito accertato nell'amministrativa. */
  credito: number | null;
  rango: RangoCredito | null;
  capacita: CapacitaRisposta;
  scenari: ScenarioFotografia[];
  /** Dove conviene all'ente fra liquidazione e cram down, se entrambi noti. */
  confronto: { differenza: number; testo: string } | null;
  avvertenze: string[];
  /** Perché la fotografia non si compone, se non si compone. */
  motivo: string | null;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Le colonne della fotografia: gli anni che il prospetto contabile ha già costruito. */
export function colonneFotografia(proiezione: ProiezioneContabile): ColonnaFotografia[] {
  return proiezione.bilanciProiettati.map((b) => {
    const bundle = costruisciBundleIndici(b.dati);
    return {
      anno: b.anno,
      tipo: b.tipo,
      dati: b.dati,
      indici: bundle.indici,
      altriIndici: bundle.altriIndici,
      severity: bundle.severity,
    };
  });
}

/**
 * La capacità di risposta dell'azienda al credito vantato.
 *
 * Misura due cose che la fotografia già contiene e che nessuno deve inventare:
 * la cassa disponibile alla data e l'utile dell'esercizio, cioè la cassa che
 * l'azienda produce in un anno. Se la cassa non copre il credito, lo scoperto
 * dice di quanto la proposta resta corta; se il flusso è positivo, le
 * annualità dicono quanto tempo servirebbe a colmarlo.
 */
export function capacitaRisposta(
  anni: ColonnaFotografia[],
  credito: number | null
): CapacitaRisposta {
  const ultima = anni[anni.length - 1];
  const disponibilita = ultima ? numero(ultima.dati.disponibilitaLiquide) : null;
  const flusso = ultima ? numero(ultima.dati.utileEsercizio) : null;

  if (!ultima) {
    return {
      credito,
      disponibilita: null,
      flusso: null,
      coperturaPct: null,
      scoperto: null,
      anniCopertura: null,
      esito: 'NON_CALCOLABILE',
      dettaglio: 'Nessuna annualità nel prospetto contabile.',
    };
  }
  if (credito === null || credito <= 0) {
    return {
      credito,
      disponibilita,
      flusso,
      coperturaPct: null,
      scoperto: null,
      anniCopertura: null,
      esito: 'NON_CALCOLABILE',
      dettaglio:
        'Il credito vantato non è accertato: la verifica amministrativa non ha ancora chiuso il debito dell’ente.',
    };
  }
  if (disponibilita === null) {
    return {
      credito,
      disponibilita,
      flusso,
      coperturaPct: null,
      scoperto: null,
      anniCopertura: null,
      esito: 'NON_CALCOLABILE',
      dettaglio: `Il prospetto non porta le disponibilità liquide del ${ultima.anno}: la capacità di risposta non si calcola.`,
    };
  }

  const coperturaPct = arrotonda((disponibilita / credito) * 100);
  const coperturaTesto = `${coperturaPct.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
  const esito = disponibilita >= credito ? 'INTEGRALE' : 'PARZIALE';
  const scoperto = esito === 'PARZIALE' ? arrotonda(credito - disponibilita) : 0;
  const anniCopertura =
    esito === 'PARZIALE' && flusso !== null && flusso > 0 ? Math.ceil(scoperto / flusso) : null;

  const dettaglio =
    esito === 'INTEGRALE'
      ? `Al ${ultima.anno} l’azienda ha ${euro(disponibilita)} di disponibilità liquide a fronte di ${euro(credito)} di credito vantato: la cassa basta a coprirlo (${coperturaTesto}).`
      : `Al ${ultima.anno} l’azienda ha ${euro(disponibilita)} di disponibilità liquide a fronte di ${euro(credito)} di credito vantato: restano scoperti ${euro(scoperto)} (${coperturaTesto}).${
          anniCopertura !== null
            ? ` Con il flusso dell’esercizio (${euro(flusso as number)}) lo scoperto si colma in ${anniCopertura} ${anniCopertura === 1 ? 'annualità' : 'annualità'}.`
            : ' L’esercizio non produce un flusso positivo: lo scoperto non si colma con la gestione.'
        }`;

  return {
    credito,
    disponibilita,
    flusso,
    coperturaPct,
    scoperto,
    anniCopertura,
    esito,
    dettaglio,
  };
}

/**
 * Compone la fotografia: le colonne del prospetto contabile, la capacità di
 * risposta e i due scenari che si misurano sul credito vantato con le
 * percentuali dell'ente.
 */
export function componiFotografia(input: {
  proiezione: ProiezioneContabile;
  credito: number | null;
  rango: RangoCredito | null;
  parametri: ParametriScenari;
}): FotografiaVerificaAzienda {
  const anni = colonneFotografia(input.proiezione);
  const credito =
    numero(input.credito) !== null && (input.credito as number) > 0
      ? arrotonda(input.credito as number)
      : null;
  const avvertenze: string[] = [];

  if (anni.length === 0) {
    return {
      anni,
      annoVerifica: input.proiezione.annoVerifica,
      annoUltimoBilancio: null,
      credito,
      rango: input.rango,
      capacita: capacitaRisposta(anni, credito),
      scenari: [],
      confronto: null,
      avvertenze,
      motivo: 'Nessun bilancio XBRL leggibile: la fotografia non ha colonne da mostrare.',
    };
  }

  if (credito === null) {
    avvertenze.push(
      'Debito dell’ente non accertato: senza credito vantato gli scenari non si misurano. Chiudi la verifica amministrativa, o rinnova il dato dalla sua scheda.'
    );
  }
  if (!input.rango) {
    avvertenze.push(
      'Rango del credito non scelto nel triage dell’azienda: le percentuali per rango non si possono applicare.'
    );
  }

  const capacita = capacitaRisposta(anni, credito);
  const esitoScenari = calcolaScenari({
    credito,
    rango: input.rango,
    parametri: input.parametri,
  });

  const accordo: ScenarioFotografia = {
    codice: 'ACCORDO',
    nome: 'Accordo transattivo',
    percentuale: null,
    recupero: null,
    perdita: null,
    calcolabile: capacita.esito !== 'NON_CALCOLABILE',
    motivo: capacita.esito === 'NON_CALCOLABILE' ? 'capacità di risposta non calcolabile' : null,
    dettaglio: capacita.dettaglio,
  };

  const perdita = (netto: number | null): number | null =>
    netto !== null && credito !== null ? arrotonda(credito - netto) : null;

  const liquidazione: ScenarioFotografia = {
    codice: 'LIQUIDAZIONE',
    nome: 'Liquidazione giudiziale',
    percentuale: esitoScenari.liquidazione.percentuale,
    recupero: esitoScenari.liquidazione.netto,
    perdita: perdita(esitoScenari.liquidazione.netto),
    calcolabile: esitoScenari.liquidazione.calcolabile,
    motivo: esitoScenari.liquidazione.motivo,
    dettaglio: esitoScenari.liquidazione.dettaglio,
  };

  const cramDown: ScenarioFotografia = {
    codice: 'CRAM_DOWN',
    nome: 'Cram down omologato',
    percentuale: esitoScenari.cramDown.percentuale,
    recupero: esitoScenari.cramDown.netto,
    perdita: perdita(esitoScenari.cramDown.netto),
    calcolabile: esitoScenari.cramDown.calcolabile,
    motivo: esitoScenari.cramDown.motivo,
    dettaglio: esitoScenari.cramDown.dettaglio,
  };

  return {
    anni,
    annoVerifica: input.proiezione.annoVerifica,
    annoUltimoBilancio: input.proiezione.annoUltimoBilancio,
    credito,
    rango: input.rango,
    capacita,
    scenari: [accordo, liquidazione, cramDown],
    confronto: esitoScenari.confronto,
    avvertenze,
    motivo: null,
  };
}
