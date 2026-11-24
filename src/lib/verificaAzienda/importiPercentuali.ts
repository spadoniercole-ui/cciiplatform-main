// GLI IMPORTI CHE VENGONO DALLE PERCENTUALI (0.256.4).
//
// La domanda a cui rispondono è una sola: «se applico le percentuali che ho
// impostato, quanti soldi sono?». Tre righe, tre percentuali diverse:
//
//   ACCORDO      la media proposta configurata in Parametri di Spazio (la stessa
//                che pre-compila le righe della proposta): credito × media.
//   LIQUIDAZIONE credito × tasso di realizzo del rango, meno le spese di
//                procedura: è quello che resta in mano all'ente.
//   CRAM DOWN    credito × percentuale di soddisfacimento del rango, senza
//                costi: la percentuale è già l'esito dell'omologazione.
//
// PERCHÉ UN MODULO SOLO. Gli stessi tre importi si leggono nella posizione
// dell'ente (riquadri «Accordo» e «Procedure») e nella verifica azienda (la
// prima riga del confronto). Due calcoli per la stessa cosa sono due occasioni
// di divergere: qui la regola sta una volta, e chi la mostra la legge.
//
// NESSUN NUMERO INVENTATO. Se manca il credito, il rango o la percentuale, la
// riga si dichiara non calcolabile col motivo; non diventa zero, che si
// leggerebbe come «recupero nullo».
//
// Logica pura, con i suoi test.

import { calcolaScenari, type ParametriScenari, type RangoCredito } from '@/lib/triage/scenari';

export type CodiceImportoPercentuale = 'ACCORDO' | 'LIQUIDAZIONE' | 'CRAM_DOWN';

export interface ImportoPercentuale {
  codice: CodiceImportoPercentuale;
  etichetta: string;
  /** Da dove viene la percentuale: si mostra accanto al numero. */
  fonte: string;
  percentuale: number | null;
  /** L'importo che tocca all'ente; per la liquidazione è già al netto dei costi. */
  importo: number | null;
  calcolabile: boolean;
  motivo: string | null;
}

export interface InputImportiPercentuali {
  credito: number | null;
  rango: RangoCredito | null;
  parametri: ParametriScenari;
  /** `parametri_proposta_redigente.percentuale_media_default`. */
  percentualeMediaProposta: number | null;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

const numeroValido = (n: number | null): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

const percentualeValida = (p: number | null): p is number =>
  typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100;

/**
 * I tre importi, nell'ordine in cui si leggono: prima l'accordo, poi le due
 * procedure. L'ordine è parte del contratto: chi mostra «la prima riga del
 * confronto» si aspetta l'accordo.
 */
export function importiDaPercentuali(input: InputImportiPercentuali): ImportoPercentuale[] {
  const credito = numeroValido(input.credito) ? input.credito : null;
  const media = percentualeValida(input.percentualeMediaProposta)
    ? input.percentualeMediaProposta
    : null;

  const accordo: ImportoPercentuale = {
    codice: 'ACCORDO',
    etichetta: 'Accordo alla media proposta',
    fonte: 'media proposta configurata in Parametri di Spazio',
    percentuale: media,
    importo: credito !== null && media !== null ? arrotonda((credito * media) / 100) : null,
    calcolabile: credito !== null && media !== null,
    motivo:
      credito === null
        ? 'il credito dell’ente non è accertato'
        : media === null
          ? 'la percentuale media proposta non è configurata'
          : null,
  };

  const esito = calcolaScenari({
    credito: input.credito,
    rango: input.rango,
    parametri: input.parametri,
  });

  // «dati incompleti» non dice nulla a chi legge: quando il motore non è più
  // specifico, si elenca ciò che manca davvero.
  const motivoIpotesi = (ipotesi: typeof esito.liquidazione): string => {
    const motivo = ipotesi.motivo?.trim();
    if (motivo && motivo !== 'dati incompleti') return motivo;
    return esito.mancanti.length > 0
      ? `manca ${esito.mancanti.join('; manca ')}`
      : 'non calcolabile con i parametri attuali';
  };

  const daIpotesi = (
    codice: 'LIQUIDAZIONE' | 'CRAM_DOWN',
    ipotesi: typeof esito.liquidazione,
    etichetta: string,
    fonte: string
  ): ImportoPercentuale => ({
    codice,
    etichetta,
    fonte,
    percentuale: ipotesi.percentuale,
    importo: ipotesi.calcolabile ? ipotesi.netto : null,
    calcolabile: ipotesi.calcolabile,
    motivo: ipotesi.calcolabile ? null : motivoIpotesi(ipotesi),
  });

  return [
    accordo,
    daIpotesi(
      'LIQUIDAZIONE',
      esito.liquidazione,
      'Liquidazione giudiziale',
      'tasso di realizzo del rango, al netto delle spese di procedura'
    ),
    daIpotesi('CRAM_DOWN', esito.cramDown, 'Cram down', 'percentuale di soddisfacimento del rango'),
  ];
}

/** La riga dell'accordo: serve a chi la vuole in testa al confronto. */
export function importoAccordo(righe: ImportoPercentuale[]): ImportoPercentuale | null {
  return righe.find((r) => r.codice === 'ACCORDO') ?? null;
}
